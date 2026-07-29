import { effectScope, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Modality } from '../content/types'
import type { CopperModule, CopperRenderer, CopperScene, CopperViewPoint, StageApi } from '../app/composables/copper-types'
import { loadGltfModel } from '../app/composables/loadGltfModel'
import { useModalityScene } from '../app/composables/useModalityScene'

/**
 * useModalityScene drives copper3d's own NRRD loader (loadNrrd) and this
 * app's loadGltfModel wrapper around three's GLTFLoader for GLBs (mocked
 * below, same as loadNrrd) -- happy-dom has no WebGL and cannot decode a
 * real GLB/NRRD file. What's under test here is the bookkeeping around
 * those calls: scene naming/reuse, the shared-canvas controls hand-off, the
 * resize-listener leak workaround, stall-based failure detection (copper3d's
 * loadNrrd has no onError to lean on; the GLB path gets a flat wall-clock
 * timeout instead, see GLB_LOAD_TIMEOUT_MS's own comment), the stale-load
 * bookkeeping guard, disposal safety, the view-preset render-after-fetch
 * sequencing, and the ultrasound control flags -- exactly what the task
 * brief and its review call out as testable without a browser.
 */

/**
 * `loadGltfModel` is a plain module export that useModalityScene's `loadGlb`
 * calls as a Nuxt-auto-imported bare global (there is no local `import` for
 * it in the source file -- same convention as `useAssetUrl`/
 * `useRuntimeConfig`, which test/setup.ts already stubs globally for the
 * same reason). Mocking the module here and re-exposing the mocked binding
 * globally (see beforeEach below) lets every test drive it exactly the way
 * the old `scene.loadGltf` mock it replaces used to be driven.
 */
vi.mock('../app/composables/loadGltfModel', () => ({ loadGltfModel: vi.fn() }))

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

/**
 * `scene.add`/`remove`/`getObjectByName` and `addObject` are backed by a
 * real array rather than bare spies, because two things under test here
 * genuinely read the scene back: §7.1's morph finds the outgoing model by
 * name, and eviction finds everything it has to dispose the same way. A
 * `getObjectByName` that always returned undefined would let both of those
 * "pass" by doing nothing at all.
 */
function makeFakeScene(): CopperScene {
  const objects: Array<{ name: string }> = []
  const scene = {
    camera: {} as CopperScene['camera'],
    controls: {
      rotateSpeed: 0,
      panSpeed: 0,
      enableRotate: true,
      enablePan: true,
      enabled: true,
      removeEventListener: vi.fn(),
    },
    sceneName: '',
    requestRenderIfNotRequested: vi.fn(),
    objects,
    scene: {
      add: vi.fn((obj: { name: string }) => { objects.push(obj) }),
      remove: vi.fn((obj: { name: string }) => {
        const at = objects.indexOf(obj)
        if (at !== -1) objects.splice(at, 1)
      }),
      getObjectByName: vi.fn((name: string) => objects.find(o => o.name === name)),
    },
    // copper3d's own addObject is `this.scene.add(obj)` (bundle.esm.js:68800).
    addObject: vi.fn((obj: { name: string }) => { objects.push(obj) }),
    loadNrrd: vi.fn(),
    // Deliberately no `loadGltf` here: `loadGlb` (useModalityScene.ts) no
    // longer calls it at all -- it calls the module-level `loadGltfModel`
    // instead (mocked globally, see this file's header) and adds the result
    // to `scene.scene` itself. Leaving `loadGltf` off this fake entirely
    // means a stray production regression back to `scene.loadGltf` fails
    // loudly (calling an undefined method) instead of silently no-opping.
    loadView: vi.fn(),
    onWindowResize: vi.fn(),
    confirmResize: vi.fn(),
    pickSpecifiedModel: vi.fn(() => ({ intersectedObject: null })),
  }
  return scene as unknown as CopperScene & { objects: Array<{ name: string }> }
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
    // Mirrors how production resolves this Nuxt-auto-imported composable --
    // see this file's header. `mockReset` (not `mockClear`) so a previous
    // test's queued `mockResolvedValueOnce`/`mockImplementationOnce`
    // behaviour and call history never leak into the next one.
    vi.stubGlobal('loadGltfModel', loadGltfModel)
    vi.mocked(loadGltfModel).mockReset()
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
    // loadGltfModel's mock never resolves, simulating a genuinely dead
    // connection -- it has a real onError unlike copper3d's own loadGltf,
    // but nothing here ever calls it, so the flat wall-clock timeout in
    // `loadGlb` (GLB_LOAD_TIMEOUT_MS) is the only way out.
    vi.mocked(loadGltfModel).mockImplementationOnce(() => new Promise(() => {}))

    const loadPromise = modalityScene.load('density-a', makeModality({
      id: 'anatomy', label: 'Anatomy', asset: 'density-1/left/density25.glb', viewPreset: 'left_breast_view.json',
    }))
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

    expect(modalityScene.sliceState.value!.max).toBe(30)
    expect(modalityScene.sliceState.value!.raw).toStrictEqual(staleSlice)
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

  it('carries the z slice, its depth and its mesh -- and no copy of the current index', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality({ id: 'mri' }))
    const slice = fakeSlice({ index: 6, MaxIndex: 40, spacing: [1, 1, 2] })
    resolveNrrd(scene, slice)
    await loadPromise

    // `mesh` travels with the slice it paints: useSliceControl raycasts the
    // z plane to tell a slice scrub from a camera orbit.
    //
    // The exact shape is the assertion (fix round 1, Important). There must
    // be no `index` field: it was written once at load and never again,
    // while the real position moved in `raw.index`, so anything reading it
    // after a cached scene came back into view read a stale number. Adding
    // one back here would fail this test, which is the point.
    expect(Object.keys(modalityScene.sliceState.value!).sort()).toEqual(['max', 'mesh', 'raw'])
    expect(modalityScene.sliceState.value!.max).toBe(40)
    expect(modalityScene.sliceState.value!.raw).toStrictEqual(slice)
    expect(modalityScene.sliceState.value!.mesh.name).toBe('z')
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

    vi.mocked(loadGltfModel).mockResolvedValueOnce({ group: group as never, size: 10 })

    await modalityScene.load('density-a', makeModality({
      id: 'anatomy', label: 'Anatomy', asset: 'density-1/left/density25.glb', viewPreset: 'left_breast_view.json',
    }))

    // The new guarantee this app now owns instead of copper3d: without this
    // call the model would decode perfectly and simply never appear.
    expect(scene.scene.add).toHaveBeenCalledWith(group)
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

  // The same deployment trap resolveAssetBase already guards against for
  // model/preset URLs (assetUrl.test.ts): three appends the decoder's file
  // names to `dracoPath` verbatim, applying no base of its own, so a GitHub
  // Pages subpath deploy that asked for `/draco/` instead of `/te-uma/draco/`
  // would 404 every anatomy model's Draco decoder.
  it('resolves the Draco decoder path against a GitHub Pages subpath deploy, not the site root', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { assetBase: '/modelView/' },
      app: { baseURL: '/te-uma/' },
    }))
    try {
      const scene = makeFakeScene()
      const renderer = makeFakeRenderer(scene)
      const stage = makeFakeStage(renderer)
      const modalityScene = useModalityScene(stage)
      vi.mocked(loadGltfModel).mockResolvedValueOnce({ group: { name: '', traverse: () => {} } as never, size: 1 })

      await modalityScene.load('density-a', makeModality({
        id: 'anatomy', label: 'Anatomy', asset: 'density-1/left/density25.glb', viewPreset: 'left_breast_view.json',
      }))

      expect(loadGltfModel).toHaveBeenCalledWith(
        '/te-uma/modelView/density-1/left/density25.glb',
        '/te-uma/draco/',
      )
    }
    finally {
      // Restore test/setup.ts's site-root default: this file's other tests
      // (and this describe block's own beforeEach) don't re-stub
      // useRuntimeConfig themselves, so a leaked override here would corrupt
      // every asset-base assertion after this test.
      vi.stubGlobal('useRuntimeConfig', () => ({
        public: { assetBase: '/modelView/' },
        app: { baseURL: '/' },
      }))
    }
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

      const objects = (scene as unknown as { objects: Array<{ name: string }> }).objects
      /** Resolves the next `loadGltfModel` call with `group`. Unlike the old
       * `scene.loadGltf` mock this replaces, it does NOT push into `objects`
       * itself: `loadGlb` (useModalityScene.ts) now calls `target.scene.add(group)`
       * on the resolved value, so `scene.scene.add`'s own mock (above, backed
       * by the same array) is what populates `objects` -- exercising the
       * real code path rather than a test double standing in for it. */
      const resolveGltf = (group: { name: string }, size = 10) => {
        vi.mocked(loadGltfModel).mockResolvedValueOnce({ group: group as never, size })
      }

      const initial = makeAnatomyGroup()
      resolveGltf(initial.group)
      await modalityScene.load('density-a', anatomy(asset))

      return { scene, renderer, modalityScene, initial, objects, resolveGltf }
    }

    it('crossfades in a different density\'s model without creating or switching scenes', async () => {
      const { scene, modalityScene, initial, resolveGltf } = await loadInitialAnatomy()
      const next = makeAnatomyGroup()
      resolveGltf(next.group)

      const morph = await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb'))!

      expect(morph).not.toBeNull()
      // §7.1: the SAME scene, so the camera cannot move. Only the model changes.
      expect(vi.mocked(loadGltfModel).mock.calls[1]![0]).toBe('/modelView/density-2/left/density50.glb')
      // The new guarantee this app now owns instead of copper3d: without
      // this call the incoming model would decode perfectly and simply
      // never appear.
      expect(scene.scene.add).toHaveBeenCalledWith(next.group)
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

      const morph = (await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb')))!

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

      const morph = (await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb')))!
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

      const morph = (await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb')))!
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
      const { modalityScene } = await loadInitialAnatomy('density-1/left/density25.glb')

      const morph = await modalityScene.prepareMorph('the-breast', anatomy('density-1/left/density25.glb'))

      expect(morph).toBeNull()
      expect(loadGltfModel).toHaveBeenCalledTimes(1) // no second download
    })

    it('tracks what each scene actually displays, so morphing back is allowed again', async () => {
      const { scene, modalityScene, resolveGltf } = await loadInitialAnatomy('density-1/left/density25.glb')
      const next = makeAnatomyGroup()
      resolveGltf(next.group)

      const forward = (await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb')))!
      forward.commit()

      // Back to the original asset: the scene is still named
      // `density-a:anatomy`, but what it DISPLAYS is density50 now, so this
      // is a real morph rather than a no-op.
      resolveGltf(makeAnatomyGroup().group)
      expect(await modalityScene.prepareMorph('the-breast', anatomy('density-1/left/density25.glb'))).not.toBeNull()

      // ...and the one it now displays is refused.
      expect(await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb'))).toBeNull()
    })

    /**
     * Fix round 1. The outgoing model used to be renamed BEFORE the
     * incoming one was awaited, so a GLB that never arrived (the 30s
     * timeout -- copper3d has no error callback to fail faster on) left the
     * scene with nothing named `anatomy-model` at all. Every later
     * `prepareMorph` on that scene then found no previous model and
     * returned null, silently and permanently degrading §7.1 to a hard cut
     * for the rest of the session.
     */
    it('leaves the on-screen model intact when the incoming one never arrives', async () => {
      const { modalityScene, initial, objects, resolveGltf } = await loadInitialAnatomy()
      // loadGltfModel's mock never resolves, so the 30s wall-clock timeout
      // in `loadGlb` is what has to end this.
      vi.mocked(loadGltfModel).mockImplementationOnce(() => new Promise(() => {}))

      const attempt = modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb'))
      await expect(advanceAndSettle(attempt, 31_000)).rejects.toThrow(/Timed out/)

      expect(initial.group.name).toBe('anatomy-model')
      expect(objects).toEqual([initial.group])

      // ...and a later morph from this scene still works.
      const next = makeAnatomyGroup()
      resolveGltf(next.group)
      expect(await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb'))).not.toBeNull()
    })

    /**
     * Fix round 1. Two morphs racing on one scene would both take the same
     * outgoing model as theirs: the second would rename or remove a group
     * the first is still fading. Reachable by clicking density-b then
     * density-c before the first ~1.28MB GLB lands.
     */
    it('refuses a second morph on a scene whose incoming model is still downloading', async () => {
      const { modalityScene } = await loadInitialAnatomy()
      let land!: (value: { group: unknown, size: number }) => void
      vi.mocked(loadGltfModel).mockImplementationOnce(() => new Promise((resolve) => { land = resolve }))

      const first = modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb'))
      // Second navigation arrives while the first model is still in flight.
      expect(await modalityScene.prepareMorph('density-c', anatomy('density-3/left/density75.glb'))).toBeNull()
      expect(loadGltfModel).toHaveBeenCalledTimes(2) // no third download started

      land({ group: makeAnatomyGroup().group, size: 10 })
      expect(await first).not.toBeNull()
    })

    /**
     * Fix round 1. §7.1 suppresses `load()`, so after density-a -> density-b
     * the live scene is still registered as `density-a:anatomy`. Left alone,
     * stepping to density-b's MRI and back would miss the cache, build a
     * SECOND anatomy scene and re-download a GLB already in memory, while
     * the original sat in `sceneMap` under a name that no longer described
     * it for the life of the renderer -- which, now that the renderer
     * outlives a case navigation, is the whole session.
     */
    it('re-keys the scene under the case it now displays, so returning to that case is a cache hit', async () => {
      const { scene, modalityScene, renderer, resolveGltf } = await loadInitialAnatomy()
      expect(renderer.sceneMap['density-a:anatomy']).toBe(scene)

      resolveGltf(makeAnatomyGroup().group)
      const morph = (await modalityScene.prepareMorph('density-b', anatomy('density-2/left/density50.glb')))!
      morph.commit()

      expect(renderer.sceneMap['density-b:anatomy']).toBe(scene)
      expect(renderer.sceneMap['density-a:anatomy']).toBeUndefined()
      // copper3d keeps its own copy on the instance; a stale one would make
      // any reader of `sceneName` disagree with the map it is keyed in.
      expect(scene.sceneName).toBe('density-b:anatomy')
      // The per-scene bookkeeping travels with the name, or the re-keyed
      // scene comes back framed by whatever preset happened to load last.
      expect(modalityScene.viewpoint.value).toEqual(DEFAULT_VIEWPOINT)
    })

    it('has nothing to morph before any model has loaded, or for an imaging modality', async () => {
      const scene = makeFakeScene()
      const renderer = makeFakeRenderer(scene)
      const stage = makeFakeStage(renderer)
      const modalityScene = useModalityScene(stage)

      expect(await modalityScene.prepareMorph('the-breast', anatomy('density-1/left/density25.glb'))).toBeNull()

      const loaded = await loadInitialAnatomy()
      expect(await loaded.modalityScene.prepareMorph('density-a', makeModality({ id: 'mri' }))).toBeNull()
    })
  })

  /**
   * Fix round 1. Before it, the cache needed no cap: `app.vue` keyed the
   * case page by slug, so leaving a case tore the whole renderer down, and
   * no case offers more than three modalities. §7.1's crossfade needs the
   * renderer to survive a case navigation within the morph family, so that
   * structural bound is gone for those five cases and this replaces it with
   * the same number -- which matters because the family's imaging volumes
   * decode to considerably more than the 167MB they occupy on disk.
   */
  describe('cached-scene residency cap', () => {
    /** A renderer that builds a DISTINCT scene per name and answers
     * `getSceneByName` from its own map, the way the real one does --
     * `makeFakeRenderer` deliberately returns one fixed scene, which cannot
     * express eviction. */
    function makeMultiSceneRenderer() {
      const sceneMap: Record<string, CopperScene> = {}
      const renderer: CopperRenderer = {
        sceneMap,
        getSceneByName: vi.fn((name: string) => sceneMap[name]),
        createScene: vi.fn((name: string) => {
          const scene = makeFakeScene()
          sceneMap[name] = scene
          return scene
        }),
        setCurrentScene: vi.fn(),
        getCurrentScene: vi.fn(() => ({ onWindowResize: vi.fn() })),
        render: vi.fn(),
        stop: vi.fn(),
        dispose: vi.fn(),
      }
      return renderer
    }

    /** Loads one imaging modality to completion. */
    async function visit(
      modalityScene: ReturnType<typeof useModalityScene>,
      renderer: CopperRenderer,
      slug: string,
      id: 'mammogram' | 'mri',
    ) {
      const pending = modalityScene.load(slug, makeModality({ id, asset: `${slug}/${id}.nrrd` }))
      const scene = renderer.sceneMap[`${slug}:${id}`]!
      if (vi.mocked(scene.loadNrrd).mock.calls.length) resolveNrrd(scene)
      await pending
      return scene
    }

    it('keeps three scenes and evicts the least recently used, never the one on screen', async () => {
      const renderer = makeMultiSceneRenderer()
      const modalityScene = useModalityScene(makeFakeStage(renderer))

      const a = await visit(modalityScene, renderer, 'density-a', 'mammogram')
      await visit(modalityScene, renderer, 'density-b', 'mammogram')
      await visit(modalityScene, renderer, 'density-c', 'mammogram')
      expect(Object.keys(renderer.sceneMap)).toHaveLength(3)

      await visit(modalityScene, renderer, 'density-d', 'mammogram')

      expect(Object.keys(renderer.sceneMap).sort()).toEqual([
        'density-b:mammogram', 'density-c:mammogram', 'density-d:mammogram',
      ])
      // Evicting means freeing: `scene.remove` alone only unlinks, and the
      // slice plane's texture IS the decoded volume slice.
      expect(a.scene.remove).toHaveBeenCalled()
      // ...and cutting the last reference the shared canvas holds to it.
      expect(a.controls.removeEventListener).toHaveBeenCalledWith('change', a.requestRenderIfNotRequested)
      expect(a.controls.enabled).toBe(false)
    })

    it('counts a revisit as recent, so the scene you keep coming back to is not the one thrown away', async () => {
      const renderer = makeMultiSceneRenderer()
      const modalityScene = useModalityScene(makeFakeStage(renderer))

      await visit(modalityScene, renderer, 'density-a', 'mammogram')
      await visit(modalityScene, renderer, 'density-b', 'mammogram')
      await visit(modalityScene, renderer, 'density-c', 'mammogram')
      // Back to A: it is now the most recently used, so B is the victim.
      await visit(modalityScene, renderer, 'density-a', 'mammogram')

      await visit(modalityScene, renderer, 'density-d', 'mammogram')

      expect(Object.keys(renderer.sceneMap).sort()).toEqual([
        'density-a:mammogram', 'density-c:mammogram', 'density-d:mammogram',
      ])
    })

    it('drops the evicted scene\'s own bookkeeping, so a rebuild is not handed the old scene\'s framing', async () => {
      const renderer = makeMultiSceneRenderer()
      const modalityScene = useModalityScene(makeFakeStage(renderer))

      await visit(modalityScene, renderer, 'density-a', 'mammogram')
      await visit(modalityScene, renderer, 'density-b', 'mammogram')
      await visit(modalityScene, renderer, 'density-c', 'mammogram')
      await visit(modalityScene, renderer, 'density-d', 'mammogram')

      // density-a was evicted; visiting it again must genuinely rebuild.
      const rebuilt = await visit(modalityScene, renderer, 'density-a', 'mammogram')
      expect(vi.mocked(renderer.createScene).mock.calls.filter(c => c[0] === 'density-a:mammogram')).toHaveLength(2)
      expect(rebuilt.loadNrrd).toHaveBeenCalledTimes(1)
      expect(modalityScene.sliceState.value).not.toBeNull()
      expect(modalityScene.viewpoint.value).toEqual(DEFAULT_VIEWPOINT)
    })

    // The one place the cap must yield: never blank the stage to satisfy it.
    it('never evicts the scene currently displayed, even if it is the only one left', async () => {
      const renderer = makeMultiSceneRenderer()
      const modalityScene = useModalityScene(makeFakeStage(renderer))

      const only = await visit(modalityScene, renderer, 'density-a', 'mammogram')
      for (let i = 0; i < 5; i++) await visit(modalityScene, renderer, 'density-a', 'mammogram')

      expect(renderer.sceneMap['density-a:mammogram']).toBe(only)
      expect(modalityScene.scene.value).toBe(only)
    })

    // Shared with Task 8's failed-load eviction: one way out of the map,
    // one place that checks it took.
    it('fails loudly if a copper3d upgrade makes deleting from sceneMap a silent no-op', async () => {
      const renderer = makeMultiSceneRenderer()
      // Simulates `sceneMap` no longer being a plain object keyed by name:
      // the delete stops taking, but nothing throws on its own.
      const modalityScene = useModalityScene(makeFakeStage(renderer))
      await visit(modalityScene, renderer, 'density-a', 'mammogram')
      await visit(modalityScene, renderer, 'density-b', 'mammogram')
      await visit(modalityScene, renderer, 'density-c', 'mammogram')

      const survivor = renderer.sceneMap['density-a:mammogram']!
      vi.mocked(renderer.getSceneByName).mockImplementation(
        (name: string) => name === 'density-a:mammogram' ? survivor : renderer.sceneMap[name],
      )

      await visit(modalityScene, renderer, 'density-d', 'mammogram')
      expect(modalityScene.loadError.value?.message).toMatch(/survived eviction/)
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

/** The three slice-plane meshes copper3d hands back. `z` is a real
 * traversable object because it is the one this app adds to the scene, and
 * eviction disposes it by traversal -- a bare `{ name }` would make that
 * throw here while working against a genuine THREE.Mesh. */
function fakeMesh(name = '') {
  const material = { dispose: vi.fn(), transparent: false, opacity: 1, depthWrite: true }
  const geometry = { dispose: vi.fn() }
  const mesh = {
    name,
    isMesh: true,
    geometry,
    material,
    traverse(fn: (child: unknown) => void) { fn(mesh) },
  }
  return mesh
}

function fakeMeshes() {
  return { x: fakeMesh(), y: fakeMesh(), z: fakeMesh() }
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

/** Runs the fake clock forward while `promise` is pending, without letting
 * its rejection race the assertion that is about to await it. */
async function advanceAndSettle<T>(promise: Promise<T>, ms: number): Promise<T> {
  promise.catch(() => {})
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

/** Lets a MutationObserver's queued microtask callback run. Fake timers
 * (vi.useFakeTimers()) only intercept macrotask scheduling
 * (setTimeout/rAF), not the microtask queue observers use. */
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}
