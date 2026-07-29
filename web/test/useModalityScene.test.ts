import { effectScope, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Modality } from '../content/types'
import type { CopperModule, CopperRenderer, CopperScene, CopperViewPoint, StageApi } from '../app/composables/copper-types'
import { useModalityScene } from '../app/composables/useModalityScene'

/**
 * useModalityScene drives copper3d's loaders (loadGltf/loadNrrd), which
 * this test never really invokes -- happy-dom has no WebGL and cannot
 * decode a real GLB/NRRD file. What's under test here is the bookkeeping
 * around those calls: scene naming/reuse, the shared-canvas controls
 * hand-off, the resize-listener leak workaround, stall-based failure
 * detection (copper3d has no onError to lean on), the stale-load
 * bookkeeping guard, disposal safety, the view-preset render-after-fetch
 * sequencing, and the ultrasound control flags -- exactly what the task
 * brief and its review call out as testable without a browser.
 */

const DEFAULT_VIEWPOINT: CopperViewPoint = {
  farPlane: 1000, nearPlane: 0.01, eyePosition: [0, 0, 1], targetPosition: [0, 0, 0], upVector: [0, 1, 0],
}

function makeModality(overrides: Partial<Modality> = {}): Modality {
  return {
    id: 'mammogram',
    label: '3D Mammogram',
    asset: 'density-1/middle/m3d.nrrd',
    viewPreset: 'density-1/middle/m_view.json',
    text: '<p>copy</p>',
    keyFacts: [],
    ...overrides,
  }
}

function makeFakeScene(): CopperScene {
  return {
    camera: {} as CopperScene['camera'],
    controls: { rotateSpeed: 0, panSpeed: 0, enableRotate: true, enablePan: true, enabled: true },
    scene: { add: vi.fn(), remove: vi.fn(), getObjectByName: vi.fn() },
    addObject: vi.fn(),
    loadNrrd: vi.fn(),
    loadGltf: vi.fn(),
    loadView: vi.fn(),
    onWindowResize: vi.fn(),
    confirmResize: vi.fn(),
  }
}

/** A single fixed scene, for tests that only ever touch one. `sceneMap` is
 * a real object `createScene`'s default mock populates, mirroring
 * copper3d's own synchronous "register before content loads" behavior
 * (Renderer/copperRendererOnDemond.js:25-33) closely enough for the
 * eviction-on-failure tests to observe it directly. Tests that override a
 * specific `createScene` call via `mockReturnValueOnce` bypass this
 * default (Vitest doesn't run the base implementation for a `*Once`
 * override) -- fine, since only the eviction tests below inspect
 * `sceneMap` at all. */
function makeFakeRenderer(scene: CopperScene): CopperRenderer {
  const sceneMap: Record<string, CopperScene> = {}
  return {
    sceneMap,
    getSceneByName: vi.fn(() => undefined),
    createScene: vi.fn((name: string) => {
      sceneMap[name] = scene
      return scene
    }),
    setCurrentScene: vi.fn(),
    getCurrentScene: vi.fn(() => ({ onWindowResize: vi.fn() })),
    render: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  }
}

/** A real DOM node, so a genuine MutationObserver can watch it -- matches
 * what `Copper.loading()` actually returns (LoadingBar's `progress` is a
 * real HTMLDivElement, not a plain object). */
function makeLoadingBar() {
  return { loadingContainer: document.createElement('div'), progress: document.createElement('div') }
}

function makeFakeCopperModule(): CopperModule {
  return {
    copperRendererOnDemond: vi.fn() as unknown as CopperModule['copperRendererOnDemond'],
    loading: vi.fn(() => makeLoadingBar()),
  }
}

function makeFakeStage(renderer: CopperRenderer): StageApi {
  return {
    renderer: shallowRef(renderer),
    Copper: shallowRef(makeFakeCopperModule()),
    ready: shallowRef(true),
    loadError: shallowRef(undefined),
    requestContinuous: vi.fn(),
    releaseContinuous: vi.fn(),
  }
}

/** Every successful load fetches its view-preset JSON directly (review fix
 * #5) -- stubbed globally so tests that don't care about it don't need to
 * repeat this, and overridden per-test where the response matters. */
function stubFetchOk(data: CopperViewPoint = DEFAULT_VIEWPOINT) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })))
}

describe('useModalityScene', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubFetchOk()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    // Not vi.unstubAllGlobals(): that would also wipe test/setup.ts's
    // useAssetUrl/useRuntimeConfig stubs, which are only ever installed
    // once (setupFiles runs before the whole file, not per test). Each
    // test's beforeEach re-stubs `fetch` on top instead.
  })

  it('does nothing before the stage is ready', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    stage.ready.value = false

    const modalityScene = useModalityScene(stage)
    await modalityScene.load('the-breast', makeModality())

    expect(renderer.createScene).not.toHaveBeenCalled()
  })

  it('creates a scene namespaced by slug:modalityId and switches the renderer to it', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'density-1/right/mri.nrrd' }))
    expect(renderer.createScene).toHaveBeenCalledWith('the-breast:mri')
    expect(renderer.setCurrentScene).toHaveBeenCalledWith(scene)

    // Resolve loadNrrd's callback synchronously, as a fast local fixture load would.
    const [, , , callback] = vi.mocked(scene.loadNrrd).mock.calls[0]!
    callback(fakeVolume(), fakeMeshes(), { z: fakeSlice() })
    await loadPromise

    expect(modalityScene.scene.value).toBe(scene)
    expect(modalityScene.loading.value).toBe(false)
    // Review fix #5: the view preset is fetched and applied via loadView,
    // not the fire-and-forget loadViewUrl, so there is a completion signal
    // to render after.
    expect(scene.loadView).toHaveBeenCalledWith(DEFAULT_VIEWPOINT)
    // Task 9 controller correction C2: the fetched preset is also exposed
    // as data (not just applied instantly), so a camera flight has
    // something to interpolate toward instead of only ever jumping there.
    expect(modalityScene.viewpoint.value).toEqual(DEFAULT_VIEWPOINT)
  })

  it('reuses an existing scene instead of recreating it or re-downloading', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const modality = makeModality()

    const first = modalityScene.load('the-breast', modality)
    const [, , , callback] = vi.mocked(scene.loadNrrd).mock.calls[0]!
    callback(fakeVolume(), fakeMeshes(), { z: fakeSlice() })
    await first

    vi.mocked(renderer.getSceneByName).mockReturnValueOnce(scene)
    await modalityScene.load('the-breast', modality)

    expect(renderer.createScene).toHaveBeenCalledTimes(1)
    expect(scene.loadNrrd).toHaveBeenCalledTimes(1)
    expect(renderer.setCurrentScene).toHaveBeenLastCalledWith(scene)
  })

  // Review fix #1: copperSceneOnDemond's OrbitControls listens on the
  // *shared* canvas regardless of which scene is "current" -- leaving a
  // previous scene's controls enabled means dragging the mouse still
  // requests a render of that scene too, and the last-created scene wins.
  it('disables the outgoing scene\'s controls and enables the incoming one on every switch', async () => {
    const sceneA = makeFakeScene()
    const sceneB = makeFakeScene()
    const renderer = makeFakeRenderer(sceneA)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadA = modalityScene.load('the-breast', makeModality({ id: 'mammogram' }))
    resolveNrrd(sceneA)
    await loadA
    expect(sceneA.controls.enabled).toBe(true)

    vi.mocked(renderer.createScene).mockReturnValueOnce(sceneB)
    const loadB = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'x/mri.nrrd' }))
    resolveNrrd(sceneB)
    await loadB

    expect(sceneA.controls.enabled).toBe(false)
    expect(sceneB.controls.enabled).toBe(true)
  })

  it('re-enables a cached scene\'s controls and disables whatever was active when switching back to it', async () => {
    const sceneA = makeFakeScene()
    const sceneB = makeFakeScene()
    const renderer = makeFakeRenderer(sceneA)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const modalityA = makeModality({ id: 'mammogram' })

    const loadA = modalityScene.load('the-breast', modalityA)
    resolveNrrd(sceneA)
    await loadA

    vi.mocked(renderer.createScene).mockReturnValueOnce(sceneB)
    const loadB = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'x/mri.nrrd' }))
    resolveNrrd(sceneB)
    await loadB
    expect(sceneA.controls.enabled).toBe(false)

    // Switch back to the cached mammogram scene.
    vi.mocked(renderer.getSceneByName).mockReturnValueOnce(sceneA)
    await modalityScene.load('the-breast', modalityA)

    expect(sceneB.controls.enabled).toBe(false)
    expect(sceneA.controls.enabled).toBe(true)
  })

  // Task 9 controller correction C2's `viewpoint` ref, mirroring
  // sliceStateByScene's per-scene caching: switching back to a cached scene
  // must restore ITS OWN preset, not whichever scene's preset fetch
  // resolved last.
  it('restores each cached scene\'s own view preset when switching back to it', async () => {
    const sceneA = makeFakeScene()
    const sceneB = makeFakeScene()
    const renderer = makeFakeRenderer(sceneA)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const modalityA = makeModality({ id: 'mammogram' })
    const viewpointA: CopperViewPoint = { ...DEFAULT_VIEWPOINT, eyePosition: [1, 1, 1] }
    const viewpointB: CopperViewPoint = { ...DEFAULT_VIEWPOINT, eyePosition: [2, 2, 2] }

    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(viewpointA) } as Response))
    const loadA = modalityScene.load('the-breast', modalityA)
    resolveNrrd(sceneA)
    await loadA
    expect(modalityScene.viewpoint.value).toEqual(viewpointA)

    vi.mocked(renderer.createScene).mockReturnValueOnce(sceneB)
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(viewpointB) } as Response))
    const loadB = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'x/mri.nrrd' }))
    resolveNrrd(sceneB)
    await loadB
    expect(modalityScene.viewpoint.value).toEqual(viewpointB)

    // Switch back to the cached mammogram scene -- its own preset, not B's.
    vi.mocked(renderer.getSceneByName).mockReturnValueOnce(sceneA)
    await modalityScene.load('the-breast', modalityA)
    expect(modalityScene.viewpoint.value).toEqual(viewpointA)
  })

  it('keeps enableRotate/enablePan true for non-ultrasound (3D) modalities', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality({ id: 'mri' }))
    resolveNrrd(scene)
    await loadPromise

    expect(scene.controls.enableRotate).toBe(true)
    expect(scene.controls.enablePan).toBe(true)
  })

  // Review fix #1 (second half): the resize listener is removed the moment
  // the scene is created, not deferred to this composable's own scope
  // disposal -- proven here by never disposing anything at all.
  it('removes a newly created scene\'s leaked resize listener immediately, before any window resize can reach it', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    // Simulates copperSceneOnDemond's own constructor
    // (Scene/copperSceneOnDemond.js:27), which the fake renderer above
    // does not reproduce itself.
    window.addEventListener('resize', scene.confirmResize, false)

    const loadPromise = modalityScene.load('the-breast', makeModality())
    resolveNrrd(scene)
    await loadPromise

    window.dispatchEvent(new Event('resize'))

    expect(scene.confirmResize).not.toHaveBeenCalled()
  })

  // Review fix #2: neither loadGltf nor loadNrrd ever receives an onError,
  // so a genuinely dead connection needs its own detection. A flat
  // wall-clock timeout was replaced with stall detection specifically so a
  // slow-but-healthy transfer is never misreported as failed -- proven
  // below by a load that keeps receiving progress well past what a 30s
  // wall clock would have allowed.
  it('does not fail an NRRD load that keeps receiving progress, even past a 30s wall clock', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const bar = captureNextLoadingBar(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality())

    // Three progress events, 10s apart -- 30s total, each comfortably
    // inside the 15s stall window individually.
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(10_000)
      bar.progress.textContent = `File: m3d.nrrd ${(i + 1) * 20} % loaded`
      await flushMicrotasks()
    }

    resolveNrrd(scene)
    await loadPromise

    expect(modalityScene.loadError.value).toBeUndefined()
  })

  it('fails an NRRD load with no progress for the stall window, without waiting for a fixed deadline', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality())
    await vi.advanceTimersByTimeAsync(15_000)
    await loadPromise

    expect(modalityScene.loadError.value).toBeInstanceOf(Error)
    expect(modalityScene.loading.value).toBe(false)
  })

  // Review round 2, fix #1: createScene() registers the scene in
  // copper3d's own sceneMap synchronously, before any content loads
  // (Renderer/copperRendererOnDemond.js:25-33). A scene whose content then
  // fails used to stay registered forever -- fix #3 (the previous round)
  // only handled a *superseded* load, not a genuinely *failed* one, so a
  // failed load followed by a return visit used to hit the poisoned entry,
  // silently clear loadError/loading, and land on a permanently blank,
  // unframed stage with no way to retry.
  it('evicts a scene from copper3d\'s own map when its content fails to load, so a retry actually rebuilds it', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const modality = makeModality()
    const name = 'the-breast:mammogram'

    const firstLoad = modalityScene.load('the-breast', modality)
    // createScene's default mock registers into sceneMap synchronously,
    // exactly like the real renderer.
    expect(renderer.sceneMap[name]).toBe(scene)

    await vi.advanceTimersByTimeAsync(15_000) // stalls out
    await firstLoad
    expect(modalityScene.loadError.value).toBeInstanceOf(Error)

    // The poisoned entry must be gone -- otherwise a retry's own
    // getSceneByName(name) would find it and treat it as a valid,
    // silently-broken cache hit instead of reloading.
    expect(renderer.sceneMap[name]).toBeUndefined()

    // Retry: a real copper3d renderer would also report nothing for this
    // name now that the entry is deleted.
    const retryScene = makeFakeScene()
    vi.mocked(renderer.createScene).mockReturnValueOnce(retryScene)
    const retry = modalityScene.load('the-breast', modality)
    resolveNrrd(retryScene)
    await retry

    expect(modalityScene.loadError.value).toBeUndefined()
    expect(modalityScene.scene.value).toBe(retryScene)
    // Not just "a load was attempted" -- the bookkeeping a return visit
    // depends on (Task 10's slice slider included) must actually be there.
    expect(modalityScene.sliceState.value).not.toBeNull()
    expect(retryScene.loadView).toHaveBeenCalledWith(DEFAULT_VIEWPOINT)
  })

  it('parses the real load percentage out of copper3d\'s own progress text', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const bar = captureNextLoadingBar(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality())
    bar.progress.textContent = 'File: m3d.nrrd 42 % loaded'
    await flushMicrotasks()

    expect(modalityScene.progress.value).toBeCloseTo(0.42)

    resolveNrrd(scene)
    await loadPromise
  })

  // Review round 2, fix #3: when the server omits Content-Length,
  // copper3d's own percentage math divides by zero and writes the literal
  // string "File: x Infinity % loaded" (Loader/copperNrrdLoader.js:152).
  // The old digit-only regex simply didn't match, silently freezing
  // `progress` at whatever it last held (0, on the very first event) --
  // this should read as indeterminate instead.
  it('treats a missing-Content-Length "Infinity %" as indeterminate, not stuck at 0', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const bar = captureNextLoadingBar(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality())
    bar.progress.textContent = 'File: m3d.nrrd Infinity % loaded'
    await flushMicrotasks()

    expect(modalityScene.progress.value).toBeNaN()

    resolveNrrd(scene)
    await loadPromise
  })

  it('surfaces a GLB load that never calls back through loadError after its own timeout', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('density-a', makeModality({
      id: 'anatomy', label: 'Anatomy', asset: 'density-1/left/density25.glb', viewPreset: 'left_breast_view.json',
    }))
    // loadGltf's mock never invokes its callback.
    await vi.advanceTimersByTimeAsync(60_000)
    await loadPromise

    expect(modalityScene.loadError.value).toBeInstanceOf(Error)
    expect(modalityScene.loading.value).toBe(false)
  })

  it('does not let a superseded load\'s late failure clobber a newer, successful load', async () => {
    const stalledScene = makeFakeScene()
    const freshScene = makeFakeScene()
    const renderer = makeFakeRenderer(stalledScene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    // First load for modality A never receives any progress (simulates a
    // stalled request).
    void modalityScene.load('the-breast', makeModality({ id: 'mammogram' }))

    // User switches to modality B before A's stall timer fires; B succeeds.
    vi.mocked(renderer.createScene).mockReturnValueOnce(freshScene)
    const secondLoad = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'x/mri.nrrd' }))
    resolveNrrd(freshScene)
    await secondLoad

    // Now let A's stall timer fire.
    await vi.advanceTimersByTimeAsync(15_000)

    expect(modalityScene.loadError.value).toBeUndefined()
    expect(modalityScene.loading.value).toBe(false)
    expect(modalityScene.scene.value).toBe(freshScene)
  })

  // Review round 2, fix #2: the observer callback had no token guard, so
  // once a load was superseded, its own late progress events still landed
  // in the shared `progress` ref -- once design doc §13.1's progress ring
  // is wired to this value, that would jitter between two unrelated
  // downloads.
  it('does not let a superseded load\'s own progress events touch the current progress ref', async () => {
    const stalledScene = makeFakeScene()
    const freshScene = makeFakeScene()
    const renderer = makeFakeRenderer(stalledScene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)
    const stalledBar = captureNextLoadingBar(stage)

    void modalityScene.load('the-breast', makeModality({ id: 'mammogram' }))

    vi.mocked(renderer.createScene).mockReturnValueOnce(freshScene)
    const freshBar = captureNextLoadingBar(stage)
    const secondLoad = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'x/mri.nrrd' }))
    freshBar.progress.textContent = 'File: mri.nrrd 10 % loaded'
    await flushMicrotasks()

    expect(modalityScene.progress.value).toBeCloseTo(0.1)

    // The superseded (mammogram) load's own progress event arrives late --
    // must not overwrite the current (mri) load's progress, still in
    // flight at 10%.
    stalledBar.progress.textContent = 'File: m3d.nrrd 77 % loaded'
    await flushMicrotasks()

    expect(modalityScene.progress.value).toBeCloseTo(0.1)

    resolveNrrd(freshScene)
    await secondLoad
    // Lets the stalled load's own stall timer fire so it doesn't leak a
    // pending timer into a later test.
    await vi.advanceTimersByTimeAsync(15_000)
  })

  // Review fix #3: the earlier guard returned before finishing the stale
  // scene's own bookkeeping, so it sat in copper3d's cache forever with no
  // slice state and no camera preset. It must still be usable once the
  // user switches back to it, even though its own load lost the race.
  it('still completes a superseded load\'s scene bookkeeping, so switching back to it later is properly framed', async () => {
    const staleScene = makeFakeScene()
    const freshScene = makeFakeScene()
    const renderer = makeFakeRenderer(staleScene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const firstLoad = modalityScene.load('the-breast', makeModality({ id: 'mammogram' }))

    vi.mocked(renderer.createScene).mockReturnValueOnce(freshScene)
    const secondLoad = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'x/mri.nrrd' }))
    resolveNrrd(freshScene)
    await secondLoad

    // A's own network response finally arrives, late.
    const staleSlice = fakeSlice({ index: 8, MaxIndex: 30, spacing: [1, 1, 2] })
    resolveNrrd(staleScene, staleSlice)
    await firstLoad

    // Switching back to modality A should find a fully-framed cached scene.
    vi.mocked(renderer.getSceneByName).mockReturnValueOnce(staleScene)
    await modalityScene.load('the-breast', makeModality({ id: 'mammogram' }))

    expect(modalityScene.sliceState.value).toEqual({ index: 4, max: 30, raw: staleSlice })
    expect(staleScene.loadView).toHaveBeenCalledWith(DEFAULT_VIEWPOINT)
  })

  // Review fix #4: there is no way to cancel loadNrrd/loadGltf's in-flight
  // XHR, so a response can still arrive after the owning component (and
  // its renderer) has already been torn down. Nothing from that point on
  // should touch the (possibly disposed) renderer or the live refs.
  it('ignores a load that resolves after its owning scope has been disposed', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)

    const scope = effectScope()
    const modalityScene = scope.run(() => useModalityScene(stage))!
    void modalityScene.load('the-breast', makeModality())

    scope.stop()
    resolveNrrd(scene)
    await flushMicrotasks()

    expect(modalityScene.sliceState.value).toBeNull()
    expect(modalityScene.loadError.value).toBeUndefined()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('locks rotation and pan for the 2D ultrasound modality via enableRotate/enablePan, not noRotate/noPan', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('benign-cyst', makeModality({
      id: 'ultrasound', label: '2D Ultrasound', asset: 'benign-cyst/middle/u2d.nrrd',
    }))
    resolveNrrd(scene)
    await loadPromise

    expect(scene.controls.enableRotate).toBe(false)
    expect(scene.controls.enablePan).toBe(false)
    expect(modalityScene.sliceState.value).toBeNull()
  })

  it('computes slice index/max from the z slice for 3D imaging modalities', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality({ id: 'mri' }))
    const slice = fakeSlice({ index: 6, MaxIndex: 40, spacing: [1, 1, 2] })
    resolveNrrd(scene, slice)
    await loadPromise

    expect(modalityScene.sliceState.value).toEqual({ index: 3, max: 40, raw: slice })
  })

  it('tints only the anatomy model\'s fat-layer mesh, leaving other meshes untouched', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const fatMaterial = { dispose: vi.fn(), transparent: false, opacity: 1, depthWrite: true, color: { set: vi.fn() } }
    const otherMaterial = { dispose: vi.fn(), transparent: false, opacity: 1, depthWrite: true, color: { set: vi.fn() } }
    const group = {
      name: '',
      traverse: (fn: (child: { isMesh: boolean, name: string, material: typeof fatMaterial }) => void) => {
        fn({ isMesh: true, name: 'VH_F_fat_L', material: fatMaterial })
        fn({ isMesh: true, name: 'VH_F_gland_L', material: otherMaterial })
      },
    }

    const loadPromise = modalityScene.load('density-a', makeModality({
      id: 'anatomy', label: 'Anatomy', asset: 'density-1/left/density25.glb', viewPreset: 'left_breast_view.json',
    }))
    const [, glbCallback] = vi.mocked(scene.loadGltf).mock.calls[0]!
    glbCallback!(group as never)
    await loadPromise

    expect(fatMaterial.transparent).toBe(true)
    expect(fatMaterial.opacity).toBe(0.4)
    expect(fatMaterial.color.set).toHaveBeenCalledWith('#a3932a')
    expect(otherMaterial.transparent).toBe(false)
    expect(otherMaterial.color.set).not.toHaveBeenCalled()
  })

  it('resolves the modality asset and view-preset paths through the configured asset base', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality({
      asset: 'density-1/middle/m3d.nrrd', viewPreset: 'density-1/middle/m_view.json',
    }))
    const [nrrdUrl] = vi.mocked(scene.loadNrrd).mock.calls[0]!
    expect(nrrdUrl).toBe('/modelView/density-1/middle/m3d.nrrd')
    resolveNrrd(scene)
    await loadPromise

    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/modelView/density-1/middle/m_view.json')
  })

  it('surfaces a failed view-preset fetch as a load failure instead of silently keeping the default camera', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('no body')) })))
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality())
    resolveNrrd(scene)
    await loadPromise

    expect(modalityScene.loadError.value).toBeInstanceOf(Error)
    expect(scene.loadView).not.toHaveBeenCalled()
    expect(modalityScene.viewpoint.value).toBeUndefined()
  })

  it('surfaces createScene() returning undefined through loadError rather than throwing unhandled', async () => {
    const renderer = makeFakeRenderer(makeFakeScene())
    vi.mocked(renderer.createScene).mockReturnValueOnce(undefined)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    await modalityScene.load('the-breast', makeModality())

    expect(modalityScene.loadError.value).toBeInstanceOf(Error)
    expect(modalityScene.loading.value).toBe(false)
  })
})

function fakeVolume() {
  return { RASDimensions: [1, 1, 1], windowHigh: 1, repaintAllSlices: vi.fn() }
}

function fakeMeshes() {
  return { x: { name: '' }, y: { name: '' }, z: { name: '' } }
}

function fakeSlice(overrides: { index?: number, MaxIndex?: number, spacing?: number[] } = {}) {
  return {
    index: overrides.index ?? 10,
    MaxIndex: overrides.MaxIndex ?? 20,
    volume: { spacing: overrides.spacing ?? [1, 1, 1] },
    repaint() {},
  }
}

/** Invokes the most recent `loadNrrd` call's success callback with fixture
 * data, as a fast local load would. */
function resolveNrrd(scene: CopperScene, slice = fakeSlice()) {
  const calls = vi.mocked(scene.loadNrrd).mock.calls
  const [, , , callback] = calls[calls.length - 1]!
  callback(fakeVolume(), fakeMeshes(), { z: slice })
}

/** Captures the `LoadingBar` `Copper.loading()` returns for the load
 * about to start (`load()` calls `Copper.loading()` exactly once per
 * attempt), so the test can mutate its `progress` node's text to simulate
 * copper3d's own xhr-progress handler. Returned as a getter, not the bar
 * itself, since the mock implementation below hasn't run yet at the point
 * this is called (the real bar doesn't exist until `load()` does). */
function captureNextLoadingBar(stage: StageApi): { progress: HTMLDivElement } {
  const Copper = stage.Copper.value!
  let bar: ReturnType<CopperModule['loading']> | undefined
  vi.mocked(Copper.loading).mockImplementationOnce(() => {
    bar = makeLoadingBar()
    return bar
  })
  return {
    get progress() {
      return bar!.progress
    },
  }
}

/** Lets a MutationObserver's queued microtask callback run. Fake timers
 * (vi.useFakeTimers()) only intercept macrotask scheduling
 * (setTimeout/rAF), not the microtask queue observers use. */
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}
