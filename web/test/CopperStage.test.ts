import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopperViewPoint } from '../app/composables/copper-types'
import type { Modality, ModalityId } from '../content/types'
import { useCameraChoreography } from '../app/composables/useCameraChoreography'
import { useCopperStage } from '../app/composables/useCopperStage'
import { useModalityScene } from '../app/composables/useModalityScene'
import { useSliceControl } from '../app/composables/useSliceControl'
import { useStageControls } from '../app/composables/useStageControls'
import CopperStage from '../app/components/stage/CopperStage.client.vue'

/**
 * The navigation choreography (controller corrections C5 and C6) is the one
 * part of Task 10 that only exists as wiring, so it is tested by mounting
 * the real component against a mocked copper3d -- the same approach
 * useCopperStage.test.ts already established.
 *
 * `prefers-reduced-motion: reduce` is forced on throughout. That is not a
 * convenience: it makes every animation resolve in a single synchronous
 * frame, so these tests assert on ORDER and on WHICH transition ran rather
 * than on a hand-driven clock (useCameraChoreography.test.ts owns the
 * per-frame behaviour). It also exercises design doc §7's own reduced-motion
 * rule, under which the cross-dissolve becomes a direct switch.
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

/** A GLB group shaped like the real anatomy model. */
function makeGroup() {
  return {
    name: '',
    traverse: (fn: (child: Record<string, unknown>) => void) => {
      fn({
        isMesh: true,
        name: 'VH_F_gland_L',
        geometry: { dispose: vi.fn() },
        material: { dispose: vi.fn(), transparent: false, opacity: 1, depthWrite: true, color: { set: vi.fn() } },
      })
    },
  }
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
    controls: {
      rotateSpeed: 0,
      panSpeed: 0,
      enableRotate: true,
      enablePan: true,
      enabled: true,
      target: makeVec3(0, 0, 0),
    },
    scene: {
      add: vi.fn(),
      remove: vi.fn((obj: { name: string }) => { objects.splice(objects.indexOf(obj), 1) }),
      getObjectByName: vi.fn((name: string) => objects.find(o => o.name === name)),
    },
    objects,
    addObject: vi.fn(),
    loadNrrd: vi.fn(),
    // Mirrors copper3d: `loadGltf` adds the group to the scene itself
    // (dist/bundle.esm.js:84314) before invoking the callback.
    loadGltf: vi.fn((_url: string, cb?: (g: unknown) => void) => {
      const group = makeGroup()
      objects.push(group)
      cb?.(group)
    }),
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
    expect(scenes.get('density-a:anatomy')!.loadGltf).toHaveBeenCalledTimes(1)
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
    expect(scene.loadGltf).toHaveBeenCalledTimes(2)
    expect(scene.loadGltf.mock.calls[1]![0]).toBe('/modelView/density-2/left/density50.glb')
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

    // Mid-load: nothing has aimed the camera at the incoming preset yet.
    expect(mriScene.controls.target.x).toBe(0)

    finishLoad()
    await settle()

    // The flight landed on the preset -- and, controller correction C7 from
    // Task 9, it synced `controls.target`, which `loadView` never does.
    expect(mriScene.camera.position.z).toBeCloseTo(40, 6)
    expect(mriScene.controls.target.x).toBeCloseTo(1, 6)
    expect(mriScene.controls.target.y).toBeCloseTo(2, 6)
    expect(mriScene.controls.target.z).toBeCloseTo(3, 6)
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
