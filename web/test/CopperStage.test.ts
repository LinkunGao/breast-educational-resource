import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopperViewPoint } from '../app/composables/copper-types'
import type { Modality, ModalityId } from '../content/types'
import { loadGltfModel } from '../app/composables/loadGltfModel'
import { useCameraChoreography } from '../app/composables/useCameraChoreography'
import { useCopperStage } from '../app/composables/useCopperStage'
import { useModalityScene } from '../app/composables/useModalityScene'
import { useSliceControl } from '../app/composables/useSliceControl'
import { useStageControls } from '../app/composables/useStageControls'
import CopperStage from '../app/components/stage/CopperStage.client.vue'

// `loadGltfModel` is a plain module export that useModalityScene's `loadGlb`
// calls as a Nuxt-auto-imported bare global (no local `import` for it in the
// source file -- same convention `useModalityScene.test.ts` already stubs
// via `vi.stubGlobal`, mirrored here). Mocking the module and re-exposing
// the mock globally (see beforeEach below) lets every test drive it exactly
// the way the old `scene.loadGltf` mock it replaces used to be driven.
vi.mock('../app/composables/loadGltfModel', () => ({ loadGltfModel: vi.fn() }))

/**
 * The navigation choreography (controller corrections C5 and C6) is the one
 * part of Task 10 that only exists as wiring, so it is tested by mounting
 * the real component against a mocked copper3d -- the same approach
 * useCopperStage.test.ts already established.
 *
 * `prefers-reduced-motion: reduce` is forced on by default here. That is not
 * a convenience: it makes every animation resolve in a single synchronous
 * frame, so most of these tests can assert on ORDER and on WHICH transition
 * ran rather than on a hand-driven clock (useCameraChoreography.test.ts owns
 * the per-frame behaviour). It also exercises design doc §7's own
 * reduced-motion rule, under which the cross-dissolve becomes a direct
 * switch.
 *
 * The last test turns it back OFF and drives the clock by hand, because the
 * crossfade's interrupt path only exists when there are frames to interrupt
 * (fix round 1: that path was previously asserted nowhere).
 *
 * What is still not covered here and needs a browser: that the crossfade
 * looks like tissue filling in rather than two models blinking, and that the
 * flight's arc reads as one camera swinging across.
 */

const VIEWPOINT: CopperViewPoint = {
  farPlane: 1000,
  nearPlane: 0.01,
  eyePosition: [0, 0, 40],
  targetPosition: [1, 2, 3],
  upVector: [0, 1, 0],
}

function makeVec3(x = 0, y = 0, z = 0) {
  const self = {
    x,
    y,
    z,
    set: (nx: number, ny: number, nz: number) => { self.x = nx; self.y = ny; self.z = nz },
  }
  return self
}

/** A GLB group shaped like the real anatomy model. One mesh, whose material
 * is a stable object so the crossfade's opacity can be read back mid-fade. */
function makeGroup() {
  const material = { dispose: vi.fn(), transparent: false, opacity: 1, depthWrite: true, color: { set: vi.fn() } }
  const child = { isMesh: true, name: 'VH_F_gland_L', geometry: { dispose: vi.fn() }, material }
  return {
    name: '',
    material,
    traverse: (fn: (c: typeof child) => void) => { fn(child) },
  }
}

function materialOpacityOf(object: { name: string }): number {
  return (object as unknown as { material: { opacity: number } }).material.opacity
}

function makeScene() {
  const objects: Array<{ name: string }> = []
  const scene = {
    camera: {
      position: makeVec3(0, 0, 100),
      up: makeVec3(0, 1, 0),
      lookAt: vi.fn(),
      updateProjectionMatrix: vi.fn(),
    },
    // OrbitControls, as copper3d's constructor leaves it;
    // `installTrackballControls` replaces it during `load()`.
    controls: {
      rotateSpeed: 0,
      panSpeed: 0,
      enabled: true,
      target: makeVec3(0, 0, 0),
      removeEventListener: vi.fn(),
      dispose: vi.fn(),
    },
    renderer: { domElement: document.createElement('canvas') },
    requestRenderIfNotRequested: vi.fn(),
    scene: {
      // `loadGlb` (useModalityScene.ts) now does `target.scene.add(group)`
      // itself -- this is what actually populates `objects`, where
      // `loadGltf` used to before this app took that job over from copper3d.
      add: vi.fn((obj: { name: string }) => { objects.push(obj) }),
      remove: vi.fn((obj: { name: string }) => { objects.splice(objects.indexOf(obj), 1) }),
      getObjectByName: vi.fn((name: string) => objects.find(o => o.name === name)),
    },
    objects,
    addObject: vi.fn(),
    loadNrrd: vi.fn(),
    // Deliberately no `loadGltf` here: `loadGlb` (useModalityScene.ts) no
    // longer calls it -- it calls the module-level `loadGltfModel` instead
    // (mocked globally, see this file's header) and adds the result to
    // `scene.scene` itself, which is what actually pushes into `objects`.
    loadView: vi.fn(),
    onWindowResize: vi.fn(),
    confirmResize: vi.fn(),
    pickSpecifiedModel: vi.fn(() => ({ intersectedObject: null })),
  }
  return scene
}

type FakeScene = ReturnType<typeof makeScene>

const scenes = new Map<string, FakeScene>()
const renderer = {
  sceneMap: {} as Record<string, unknown>,
  getSceneByName: vi.fn((name: string) => scenes.get(name)),
  createScene: vi.fn((name: string) => {
    const scene = makeScene()
    scenes.set(name, scene)
    renderer.sceneMap[name] = scene
    return scene
  }),
  setCurrentScene: vi.fn(),
  getCurrentScene: vi.fn(() => ({ onWindowResize: vi.fn() })),
  render: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
}

const copperRendererOnDemond = vi.fn().mockImplementation(function () {
  return renderer
})

vi.mock('copper3d', () => ({
  copperRendererOnDemond,
  loading: () => ({
    loadingContainer: document.createElement('div'),
    progress: document.createElement('div'),
  }),
  // Returns a plain object, so `new Copper3dTrackballControls(...)` yields it
  // (a constructor returning an object overrides `this`). Shaped as the
  // trackball, which is what production reads back off `scene.controls`.
  // A `function`, not an arrow: this is called with `new`.
  Copper3dTrackballControls: vi.fn(function () { return ({
    rotateSpeed: 1,
    panSpeed: 0.3,
    noRotate: false,
    noPan: false,
    staticMoving: false,
    enabled: true,
    target: makeVec3(0, 0, 0),
    handleResize: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispose: vi.fn(),
  }) }),
  addBoxHelper: vi.fn(),
}))

class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
}

const ANATOMY_PRESET = 'left_breast_view.json'

function modality(id: ModalityId, asset: string): Modality {
  return {
    id,
    label: id,
    asset,
    viewPreset: id === 'anatomy' ? ANATOMY_PRESET : 'x/view.json',
    text: '',
    keyFacts: [],
  }
}

const DENSITY_A = modality('anatomy', 'density-1/left/density25.glb')
const DENSITY_B = modality('anatomy', 'density-2/left/density50.glb')
const DENSITY_C = modality('anatomy', 'density-3/left/density75.glb')
const MRI = modality('mri', 'density-1/right/mri.nrrd')

function mountStage(props: Record<string, unknown>) {
  return mount(CopperStage, {
    props: { slug: 'density-a', group: 'density', lesionSliceIndex: 0, modality: DENSITY_A, ...props },
    attachTo: document.body,
  })
}

/** Lets every awaited load / animation in `enterView` settle. */
async function settle() {
  for (let i = 0; i < 8; i++) await flushPromises()
}

describe('CopperStage navigation choreography', () => {
  beforeEach(() => {
    scenes.clear()
    renderer.sceneMap = {}
    vi.clearAllMocks()

    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    // Mirrors how production resolves this Nuxt-auto-imported composable --
    // see this file's header. Every test here mounts an anatomy modality by
    // default (DENSITY_A), so a default implementation resolving with a
    // fresh group keeps every test that doesn't care about GLB timing
    // working without its own setup; tests that DO care override a specific
    // call with `mockImplementationOnce`/`mockResolvedValueOnce`.
    vi.stubGlobal('loadGltfModel', loadGltfModel)
    vi.mocked(loadGltfModel).mockReset()
    vi.mocked(loadGltfModel).mockImplementation(() => Promise.resolve({ group: makeGroup(), size: 10 }))
    vi.stubGlobal('useCopperStage', useCopperStage)
    vi.stubGlobal('useModalityScene', useModalityScene)
    vi.stubGlobal('useCameraChoreography', useCameraChoreography)
    vi.stubGlobal('useSliceControl', useSliceControl)
    vi.stubGlobal('useStageControls', useStageControls)
    vi.stubGlobal('matchMedia', () => ({
      matches: true, // see this file's header
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(VIEWPOINT),
    })))
  })

  it('loads the scene for its own case and modality on mount', async () => {
    mountStage({})
    await settle()

    expect(renderer.createScene).toHaveBeenCalledWith('density-a:anatomy')
    expect(loadGltfModel).toHaveBeenCalledTimes(1)
    expect(loadGltfModel).toHaveBeenCalledWith('/modelView/density-1/left/density25.glb', '/draco/')
    // The new guarantee this app now owns instead of copper3d: without this
    // call the model would decode perfectly and simply never appear.
    expect(scenes.get('density-a:anatomy')!.scene.add).toHaveBeenCalledTimes(1)
  })

  /**
   * Controller correction C5, and the reason it exists: an earlier draft of
   * this task added a SECOND watcher to pick the transition while leaving
   * the original one loading unconditionally. The density branch would have
   * returned early, the other watcher would have called `load()` anyway, and
   * §7.1 -- this task's headline feature -- would have crossfaded inside a
   * scene being replaced out from under it. One watcher decides, and the
   * density branch suppresses the load entirely.
   */
  it('crossfades within the existing scene on a density step, without loading a second scene', async () => {
    const wrapper = mountStage({})
    await settle()
    const scene = scenes.get('density-a:anatomy')!
    expect(scene.objects).toHaveLength(1)

    await wrapper.setProps({ slug: 'density-b', modality: DENSITY_B })
    await settle()

    // No new scene, and the renderer was never switched to one.
    expect(renderer.createScene).toHaveBeenCalledTimes(1)
    expect(scenes.size).toBe(1)
    // The incoming model was loaded into the SAME scene and the outgoing one
    // removed once the crossfade committed.
    expect(loadGltfModel).toHaveBeenCalledTimes(2)
    expect(vi.mocked(loadGltfModel).mock.calls[1]![0]).toBe('/modelView/density-2/left/density50.glb')
    // Adding the incoming model to the scene is this app's own job now, not
    // copper3d's -- once for the initial load, once for the morph.
    expect(scene.scene.add).toHaveBeenCalledTimes(2)
    expect(scene.scene.remove).toHaveBeenCalledTimes(1)
    expect(scene.objects).toHaveLength(1)
    expect(scene.objects[0]!.name).toBe('anatomy-model')
  })

  // §7.1: "the camera does not move at all". The crossfade must not write
  // the camera, and it must not re-apply a view preset either.
  it('leaves the camera exactly where it was through a density crossfade', async () => {
    const wrapper = mountStage({})
    await settle()
    const scene = scenes.get('density-a:anatomy')!
    scene.camera.position.set(5, 6, 7)
    scene.loadView.mockClear()

    await wrapper.setProps({ slug: 'density-b', modality: DENSITY_B })
    await settle()

    expect(scene.camera.position.x).toBe(5)
    expect(scene.camera.position.y).toBe(6)
    expect(scene.camera.position.z).toBe(7)
    expect(scene.loadView).not.toHaveBeenCalled()
  })

  /**
   * Controller correction C6. `await nextTick()` (the earlier draft) only
   * flushes Vue's render queue: it returns long before a GLB, let alone a
   * 53MB NRRD, has arrived, so the flight would read its destination off a
   * camera that is either still the outgoing scene's or the incoming
   * scene's unframed default. Driving off actual load completion means the
   * camera must not have been written while the load was still in flight.
   */
  it('does not fly until the incoming modality has actually finished loading', async () => {
    const wrapper = mountStage({})
    await settle()

    // Hold the NRRD load open, as a slow network would.
    let finishLoad!: () => void
    const mriScene = makeScene()
    renderer.createScene.mockImplementationOnce((name: string) => {
      scenes.set(name, mriScene)
      return mriScene
    })
    mriScene.loadNrrd.mockImplementation((...args: unknown[]) => {
      const callback = args[3] as (v: unknown, m: unknown, s: unknown) => void
      finishLoad = () => callback(
        { RASDimensions: [1, 1, 1], windowHigh: 1, repaintAllSlices: vi.fn() },
        { x: { name: '' }, y: { name: '' }, z: { name: 'z' } },
        { z: { index: 0, MaxIndex: 100, volume: { spacing: [1, 1, 1] }, repaint: vi.fn() } },
      )
    })

    await wrapper.setProps({ modality: MRI })
    await settle()

    // Mid-load: the incoming scene has not been framed yet. `loadView` is
    // what frames it, and it must not have run on a scene with no content.
    expect(mriScene.loadView).not.toHaveBeenCalled()

    finishLoad()
    await settle()

    // The switch is a hard CUT now -- §7.3's inter-modality camera flight
    // was deleted at the human's instruction, so this no longer checks a
    // camera arc. What it still guarantees is the ordering the flight test
    // was really built around: the modality's own view preset is applied
    // only once its content has actually arrived. `loadView` writes the
    // camera AND `controls.target` together (Scene/baseScene.js:88-98),
    // which is the sync correction C7 called load-bearing.
    expect(mriScene.loadView).toHaveBeenCalledTimes(1)
    expect(mriScene.loadView).toHaveBeenCalledWith(
      expect.objectContaining({ targetPosition: [1, 2, 3] }),
    )
  })

  // Controller correction C12: `the-breast` and `density-a` ship the same
  // density25.glb, so §7.1 says there is no morph between them. The guard
  // lives in the morph, and the navigation has to fall through to an
  // ordinary load rather than silently doing nothing.
  it('falls through to an ordinary load when the density step would fade a model against its own twin', async () => {
    const wrapper = mountStage({ slug: 'the-breast', group: 'overview' })
    await settle()

    await wrapper.setProps({ slug: 'density-a', group: 'density', modality: DENSITY_A })
    await settle()

    expect(renderer.createScene).toHaveBeenCalledTimes(2)
    expect(renderer.createScene).toHaveBeenLastCalledWith('density-a:anatomy')
    expect(scenes.get('the-breast:anatomy')!.scene.remove).not.toHaveBeenCalled()
  })

  /**
   * Fix round 1, Important. `prepareMorph` awaits a ~1.28MB GLB, and the
   * user can step to a third density inside that window. Before the fix the
   * superseded morph came back and called `camera.animate`, whose
   * unconditional `interrupt()` (useCameraChoreography.ts) cancels whatever
   * the NEWER navigation started -- its entrance orbit, mid-swing -- and
   * then ran an 800ms crossfade in a scene that was no longer on screen.
   */
  it('does not animate a crossfade that a newer navigation has already superseded', async () => {
    const animate = vi.fn()
    vi.stubGlobal('useCameraChoreography', (...args: Parameters<typeof useCameraChoreography>) => {
      const api = useCameraChoreography(...args)
      animate.mockImplementation(api.animate)
      return { ...api, animate }
    })

    const wrapper = mountStage({})
    await settle()
    const first = scenes.get('density-a:anatomy')!

    // Hold density-b's GLB open, as a slow network would.
    let landB!: (value: { group: ReturnType<typeof makeGroup>, size: number }) => void
    vi.mocked(loadGltfModel).mockImplementationOnce(() => new Promise((resolve) => { landB = resolve }))
    await wrapper.setProps({ slug: 'density-b', modality: DENSITY_B })
    await settle()
    animate.mockClear()

    // The user steps on to density-c before density-b's model arrives.
    await wrapper.setProps({ slug: 'density-c', modality: DENSITY_C })
    await settle()
    const animateCallsForNavTwo = animate.mock.calls.length

    landB({ group: makeGroup(), size: 10 })
    await settle()

    // The superseded morph settled its own scene without ever reaching the
    // driver -- no interrupt, no 800ms crossfade off screen.
    expect(animate.mock.calls.length).toBe(animateCallsForNavTwo)
    // ...and it left exactly one model behind, not two stacked.
    expect(first.objects).toHaveLength(1)
    expect(first.objects[0]!.name).toBe('anatomy-model')
  })

  /**
   * Fix round 1, test hole. Every other test in this file forces reduced
   * motion, which makes `animate` resolve in one synchronous frame -- good
   * for asserting ordering, but it means the crossfade's interrupt path was
   * never driven. That path is a deliberate design decision (a drag during
   * a morph COMPLETES the swap instead of freezing two half-transparent
   * models, because unlike a camera pose there is no valid resting state
   * between the two ends), and it was asserted nowhere.
   */
  it('an interrupted crossfade still settles on one fully-opaque model', async () => {
    // Reduced motion OFF, and a hand-driven clock so the morph can be
    // caught mid-fade.
    let queued: FrameRequestCallback | null = null
    let now = 0
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued = cb; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => { queued = null })
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const advance = (ms: number) => {
      now += ms
      const cb = queued
      queued = null
      cb?.(now)
    }

    const wrapper = mountStage({})
    await settle()
    const scene = scenes.get('density-a:anatomy')!
    const outgoing = scene.objects[0]!

    await wrapper.setProps({ slug: 'density-b', modality: DENSITY_B })
    await settle()

    advance(200) // 200ms into an 800ms crossfade: both models part-faded
    const opacities = scene.objects.map(o => materialOpacityOf(o))
    expect(opacities.some(value => value > 0 && value < 1)).toBe(true)

    // Any user input hands control back (§7.4) -- and here that has to mean
    // "finish the swap now", not "leave it half-done forever".
    const camera = (wrapper.vm as unknown as { camera: { interrupt: () => void } }).camera
    camera.interrupt()
    await settle()

    expect(scene.objects).toHaveLength(1)
    expect(scene.objects[0]).not.toBe(outgoing)
    expect(materialOpacityOf(scene.objects[0]!)).toBe(1)
  })

  it('publishes slice state and actions to the control bar it cannot render itself', async () => {
    const context = {
      sliceIndex: ref(0),
      sliceMax: ref(0),
      settledSliceIndex: ref(0),
      film: ref(false),
      actions: shallowRef<{ reset: () => void, locateLesion: () => void } | null>(null),
    }
    vi.stubGlobal('useStageControls', () => context)

    const wrapper = mountStage({})
    await settle()

    expect(context.actions.value).not.toBeNull()
    expect(context.film.value).toBe(false) // anatomy is the light modality

    wrapper.unmount()
    // Nothing left to drive: the bar must stop offering controls that would
    // reach into a disposed renderer.
    expect(context.actions.value).toBeNull()
  })
})
