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

    expect(modalityScene.sliceState.value).toEqual({ index: 4, max: 30, raw: staleSlice, mesh: { name: 'z' } })
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

    // Task 10 added `mesh`: useSliceControl raycasts against the z plane to
    // tell a slice scrub from a camera orbit, so the mesh has to travel with
    // the slice it paints.
    expect(modalityScene.sliceState.value).toEqual({ index: 3, max: 40, raw: slice, mesh: { name: 'z' } })
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

  // ── §7.1 density morph ─────────────────────────────────────────────────
  //
  // The crossfade itself is not driven here: `prepareMorph` returns it as an
  // `apply`/`commit` pair precisely so useCameraChoreography's single driver
  // can run it (controller correction C8), which makes the whole thing
  // testable as plain function calls with no clock and no rAF.

  describe('prepareMorph (§7.1)', () => {
    /** A GLB group shaped like the real one: a fat-layer mesh that
     * `tintFatLayer` makes translucent amber, and an opaque gland mesh. */
    function makeAnatomyGroup() {
      const fat = {
        isMesh: true,
        name: 'VH_F_fat_L',
        geometry: { dispose: vi.fn() },
        material: { dispose: vi.fn(), transparent: false, opacity: 1, depthWrite: true, color: { set: vi.fn() } },
      }
      const gland = {
        isMesh: true,
        name: 'VH_F_gland_L',
        geometry: { dispose: vi.fn() },
        material: { dispose: vi.fn(), transparent: false, opacity: 1, depthWrite: true, color: { set: vi.fn() } },
      }
      const group = {
        name: '',
        traverse: (fn: (child: typeof fat) => void) => { fn(fat); fn(gland) },
      }
      return { group, fat, gland }
    }

    const anatomy = (asset: string) => makeModality({
      id: 'anatomy', label: 'Anatomy', asset, viewPreset: 'left_breast_view.json',
    })

    /** Loads an initial anatomy model into a fresh scene, the way a real
     * visit to `/case/density-a/anatomy` does, and hands back everything a
     * morph test needs. */
    async function loadInitialAnatomy(asset = 'density-1/left/density25.glb') {
      const scene = makeFakeScene()
      const renderer = makeFakeRenderer(scene)
      const stage = makeFakeStage(renderer)
      const modalityScene = useModalityScene(stage)

      // Stands in for three's own Scene: `loadGltf` adds the group itself
      // (dist/bundle.esm.js:84314), `getObjectByName` searches what is
      // actually in the scene, and `remove` takes it back out.
      const objects: Array<{ name: string }> = []
      vi.mocked(scene.scene.getObjectByName).mockImplementation(
        name => objects.find(o => o.name === name) as never,
      )
      vi.mocked(scene.scene.remove).mockImplementation((obj) => {
        objects.splice(objects.indexOf(obj as never), 1)
      })
      /** Resolves the next `loadGltf` call with `group`, as copper3d does. */
      const resolveGltf = (group: { name: string }) => {
        vi.mocked(scene.loadGltf).mockImplementationOnce((_url, cb) => {
          objects.push(group)
          cb!(group as never)
        })
      }

      const initial = makeAnatomyGroup()
      resolveGltf(initial.group)
      await modalityScene.load('density-a', anatomy(asset))

      return { scene, modalityScene, initial, objects, resolveGltf }
    }

    it('crossfades in a different density\'s model without creating or switching scenes', async () => {
      const { scene, modalityScene, initial, resolveGltf } = await loadInitialAnatomy()
      const next = makeAnatomyGroup()
      resolveGltf(next.group)

      const morph = await modalityScene.prepareMorph(anatomy('density-2/left/density50.glb'))!

      expect(morph).not.toBeNull()
      // §7.1: the SAME scene, so the camera cannot move. Only the model changes.
      expect(vi.mocked(scene.loadGltf).mock.calls[1]![0]).toBe('/modelView/density-2/left/density50.glb')
      // Both models are in the scene at once, but only one answers to the
      // name -- otherwise a second morph could find the outgoing model.
      expect(next.group.name).toBe('anatomy-model')
      expect(initial.group.name).not.toBe('anatomy-model')
      // The incoming model starts invisible so the fade has somewhere to go.
      expect(next.fat.material.opacity).toBe(0)
      expect(next.gland.material.opacity).toBe(0)
    })

    // Controller correction C2. `tintFatLayer` makes the fat layer 40%
    // opaque so the fibroglandular tissue reads through it -- the whole
    // point of the density series. A crossfade that ASSIGNS opacity rather
    // than scaling it would end every morph with an opaque shell over the
    // tissue, and the incoming model would look nothing like the one it
    // replaced.
    it('ends the crossfade on the same appearance the initial load produces, tint included', async () => {
      const { scene, modalityScene, resolveGltf } = await loadInitialAnatomy()
      const next = makeAnatomyGroup()
      resolveGltf(next.group)

      const morph = (await modalityScene.prepareMorph(anatomy('density-2/left/density50.glb')))!

      // The fully-faded-in state is the tinted one, not a blanket 1.0: a
      // crossfade that ASSIGNS opacity rather than scaling it lands here at
      // 1 and only looks right again because `commit` happens to restore it.
      morph.apply(1)
      expect(next.fat.material.opacity).toBeCloseTo(0.4, 10)

      morph.commit()

      expect(next.fat.material.opacity).toBe(0.4)
      expect(next.fat.material.transparent).toBe(true)
      expect(next.fat.material.color.set).toHaveBeenCalledWith('#a3932a')
      expect(next.gland.material.opacity).toBe(1)
      expect(next.gland.material.transparent).toBe(false)
      expect(next.gland.material.depthWrite).toBe(true)
    })

    it('fades both models proportionally to their own base opacity', async () => {
      const { scene, modalityScene, initial, resolveGltf } = await loadInitialAnatomy()
      const next = makeAnatomyGroup()
      resolveGltf(next.group)

      const morph = (await modalityScene.prepareMorph(anatomy('density-2/left/density50.glb')))!
      morph.apply(0.25)

      expect(next.gland.material.opacity).toBeCloseTo(0.25, 10)
      expect(initial.gland.material.opacity).toBeCloseTo(0.75, 10)
      // 0.4 base, not 1.
      expect(next.fat.material.opacity).toBeCloseTo(0.1, 10)
      expect(initial.fat.material.opacity).toBeCloseTo(0.3, 10)
      // A partly transparent mesh that still writes depth punches holes in
      // whatever is drawn behind it -- here, the other half of the fade.
      expect(next.gland.material.depthWrite).toBe(false)
      expect(initial.gland.material.depthWrite).toBe(false)
    })

    it('commit removes and disposes the outgoing model exactly once', async () => {
      const { scene, modalityScene, initial, objects, resolveGltf } = await loadInitialAnatomy()
      const next = makeAnatomyGroup()
      resolveGltf(next.group)

      const morph = (await modalityScene.prepareMorph(anatomy('density-2/left/density50.glb')))!
      morph.commit()
      morph.commit()

      expect(scene.scene.remove).toHaveBeenCalledTimes(1)
      expect(initial.fat.geometry.dispose).toHaveBeenCalledTimes(1)
      expect(initial.fat.material.dispose).toHaveBeenCalledTimes(1)
      expect(objects).toEqual([next.group])
    })

    // Controller correction C12: content/cases.ts:83 and :89 give
    // `the-breast` and `density-a` the same density25.glb. chooseTransition
    // correctly calls that pair one morph family, so the guard has to live
    // here -- otherwise the app downloads a second copy of the model already
    // on screen and crossfades it against its own twin for 800ms.
    it('refuses to crossfade a model against an identical copy of itself', async () => {
      const { scene, modalityScene } = await loadInitialAnatomy('density-1/left/density25.glb')

      const morph = await modalityScene.prepareMorph(anatomy('density-1/left/density25.glb'))

      expect(morph).toBeNull()
      expect(scene.loadGltf).toHaveBeenCalledTimes(1) // no second download
    })

    it('tracks what each scene actually displays, so morphing back is allowed again', async () => {
      const { scene, modalityScene, resolveGltf } = await loadInitialAnatomy('density-1/left/density25.glb')
      const next = makeAnatomyGroup()
      resolveGltf(next.group)

      const forward = (await modalityScene.prepareMorph(anatomy('density-2/left/density50.glb')))!
      forward.commit()

      // Back to the original asset: the scene is still named
      // `density-a:anatomy`, but what it DISPLAYS is density50 now, so this
      // is a real morph rather than a no-op.
      resolveGltf(makeAnatomyGroup().group)
      expect(await modalityScene.prepareMorph(anatomy('density-1/left/density25.glb'))).not.toBeNull()

      // ...and the one it now displays is refused.
      expect(await modalityScene.prepareMorph(anatomy('density-2/left/density50.glb'))).toBeNull()
    })

    it('has nothing to morph before any model has loaded, or for an imaging modality', async () => {
      const scene = makeFakeScene()
      const renderer = makeFakeRenderer(scene)
      const stage = makeFakeStage(renderer)
      const modalityScene = useModalityScene(stage)

      expect(await modalityScene.prepareMorph(anatomy('density-1/left/density25.glb'))).toBeNull()

      const loaded = await loadInitialAnatomy()
      expect(await loaded.modalityScene.prepareMorph(makeModality({ id: 'mri' }))).toBeNull()
    })
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
