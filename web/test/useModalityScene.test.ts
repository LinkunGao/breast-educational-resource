import { effectScope, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Modality } from '../content/types'
import type { CopperModule, CopperRenderer, CopperScene, StageApi } from '../app/composables/copper-types'
import { useModalityScene } from '../app/composables/useModalityScene'

/**
 * useModalityScene drives copper3d's loaders (loadGltf/loadNrrd), which
 * this test never really invokes -- happy-dom has no WebGL and cannot
 * decode a real GLB/NRRD file. What's under test here is the bookkeeping
 * around those calls: scene naming/reuse, the resize-listener leak
 * workaround, the timeout-based failure surface copper3d itself has no
 * callback for, the stale-load guard, and the ultrasound control flags --
 * exactly what the task brief calls out as testable without a browser.
 */

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
    controls: { rotateSpeed: 0, panSpeed: 0, enableRotate: true, enablePan: true },
    scene: { add: vi.fn(), remove: vi.fn(), getObjectByName: vi.fn() },
    addObject: vi.fn(),
    loadNrrd: vi.fn(),
    loadGltf: vi.fn(),
    loadViewUrl: vi.fn(),
    onWindowResize: vi.fn(),
    confirmResize: vi.fn(),
  }
}

function makeFakeRenderer(scene: CopperScene): CopperRenderer {
  return {
    getSceneByName: vi.fn(() => undefined),
    createScene: vi.fn(() => scene),
    setCurrentScene: vi.fn(),
    getCurrentScene: vi.fn(() => ({ onWindowResize: vi.fn() })),
    render: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  }
}

function makeFakeCopperModule(): CopperModule {
  return {
    copperRendererOnDemond: vi.fn() as unknown as CopperModule['copperRendererOnDemond'],
    loading: vi.fn(() => ({ loadingContainer: {} as HTMLDivElement, progress: {} as HTMLDivElement })),
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

describe('useModalityScene', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

  it('removes every scene\'s leaked resize listener when its scope is disposed', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const scope = effectScope()
    const modalityScene = scope.run(() => useModalityScene(stage))!
    const loadPromise = modalityScene.load('the-breast', makeModality())
    const [, , , callback] = vi.mocked(scene.loadNrrd).mock.calls[0]!
    callback(fakeVolume(), fakeMeshes(), { z: fakeSlice() })
    await loadPromise

    scope.stop()

    expect(removeSpy).toHaveBeenCalledWith('resize', scene.confirmResize, false)
  })

  it('surfaces a load that never calls back through loadError instead of hanging forever', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('the-breast', makeModality())
    // loadNrrd's mock never invokes its callback -- copper3d's own
    // loadNrrd/loadGltf implementations pass no onError to their
    // underlying three.js loader (verified against
    // dist/bundle.esm.js:64949-65052 and dist/Scene/copperSceneOnDemond.js
    // :27-31), so a real failed fetch behaves exactly like this.
    await vi.advanceTimersByTimeAsync(60_000)
    await loadPromise

    expect(modalityScene.loadError.value).toBeInstanceOf(Error)
    expect(modalityScene.loading.value).toBe(false)
  })

  it('does not let a superseded load\'s late timeout clobber a newer, successful load', async () => {
    const stalledScene = makeFakeScene()
    const freshScene = makeFakeScene()
    const renderer = makeFakeRenderer(stalledScene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    // First load for modality A never calls back (simulates a stalled request).
    void modalityScene.load('the-breast', makeModality({ id: 'mammogram' }))

    // User switches to modality B before A's timeout fires; B succeeds.
    vi.mocked(renderer.createScene).mockReturnValueOnce(freshScene)
    const secondLoad = modalityScene.load('the-breast', makeModality({ id: 'mri', asset: 'x/mri.nrrd' }))
    const [, , , callback] = vi.mocked(freshScene.loadNrrd).mock.calls[0]!
    callback(fakeVolume(), fakeMeshes(), { z: fakeSlice() })
    await secondLoad

    // Now let A's timeout fire.
    await vi.advanceTimersByTimeAsync(60_000)

    expect(modalityScene.loadError.value).toBeUndefined()
    expect(modalityScene.loading.value).toBe(false)
    expect(modalityScene.scene.value).toBe(freshScene)
  })

  it('locks rotation and pan for the 2D ultrasound modality via enableRotate/enablePan, not noRotate/noPan', async () => {
    const scene = makeFakeScene()
    const renderer = makeFakeRenderer(scene)
    const stage = makeFakeStage(renderer)
    const modalityScene = useModalityScene(stage)

    const loadPromise = modalityScene.load('benign-cyst', makeModality({
      id: 'ultrasound', label: '2D Ultrasound', asset: 'benign-cyst/middle/u2d.nrrd',
    }))
    const [, , , callback] = vi.mocked(scene.loadNrrd).mock.calls[0]!
    callback(fakeVolume(), fakeMeshes(), { z: fakeSlice() })
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
    const [, , , callback] = vi.mocked(scene.loadNrrd).mock.calls[0]!
    const slice = fakeSlice({ index: 6, MaxIndex: 40, spacing: [1, 1, 2] })
    callback(fakeVolume(), fakeMeshes(), { z: slice })
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
    const [nrrdUrl, , , callback] = vi.mocked(scene.loadNrrd).mock.calls[0]!
    expect(nrrdUrl).toBe('/modelView/density-1/middle/m3d.nrrd')
    callback(fakeVolume(), fakeMeshes(), { z: fakeSlice() })
    await loadPromise

    expect(scene.loadViewUrl).toHaveBeenCalledWith('/modelView/density-1/middle/m_view.json')
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
