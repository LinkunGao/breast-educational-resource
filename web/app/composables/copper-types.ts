import type { Ref } from 'vue'

/**
 * These interfaces describe only what is actually reachable through
 * `copperRendererOnDemond` in copper3d@3.7.3 -- verified by reading the
 * shipped `.d.ts` files AND the compiled `dist/bundle.esm.js` (the two
 * disagree with each other in a couple of places, see the comments below).
 * copper3d ships broader types built around its *other* renderer/scene
 * pair (`copperRenderer` / `copperScene`), which is not what this app uses
 * (design doc §8.2: one on-demand renderer). Extend this file, don't widen
 * it back toward those broader unions or fall back to `any` (global
 * constraint).
 */

/** The parts of three's Vector3 we use. */
export interface Vec3 {
  x: number
  y: number
  z: number
  set: (x: number, y: number, z: number) => void
  copy: (v: Vec3) => Vec3
  clone: () => Vec3
  length: () => number
  normalize: () => Vec3
  lerp: (v: Vec3, alpha: number) => Vec3
  applyAxisAngle: (axis: Vec3, angle: number) => Vec3
  sub: (v: Vec3) => Vec3
  add: (v: Vec3) => Vec3
  multiplyScalar: (s: number) => Vec3
}

export interface CopperCamera {
  position: Vec3
  up: Vec3
  lookAt: ((x: number, y: number, z: number) => void) & ((target: Vec3) => void)
  updateProjectionMatrix: () => void
}

/**
 * `copperSceneOnDemond` (the only scene class `copperRendererOnDemond`
 * ever constructs) hardcodes `new OrbitControls(...)` in its constructor
 * regardless of the renderer's `controls` option -- that option is only
 * read by the *other* scene class, `copperScene`
 * (dist/bundle.esm.js:83629-83637 branches on `opt.controls`;
 * dist/Scene/copperSceneOnDemond.d.ts's constructor takes no such option
 * and dist/bundle.esm.js:84290 always does `new OrbitControls(...)`).
 * So this is shaped like OrbitControls (`enableRotate`/`enablePan`), not
 * TrackballControls (`noRotate`/`noPan`).
 */
export interface CopperControls {
  rotateSpeed: number
  panSpeed: number
  enableRotate: boolean
  enablePan: boolean
  minDistance?: number
  maxDistance?: number
  target?: Vec3
}

/** copper3d's nrrd slice object. `index` is a world coordinate; divide by
 * `volume.spacing[2]` to get the slice number. copper3d's own types give
 * up and type this `any` (types/types.ts's `nrrdSliceType`), which is
 * exactly why this narrower interface exists instead of using theirs. */
export interface NrrdSlice {
  index: number
  MaxIndex: number
  volume: { spacing: number[] }
  repaint: (this: NrrdSlice) => void
}

export interface NrrdMeshes {
  x: { name: string }
  y: { name: string }
  z: { name: string }
}

export interface NrrdVolume {
  RASDimensions: number[]
  windowHigh: number
  repaintAllSlices: () => void
}

export interface LoadingBar {
  loadingContainer: HTMLDivElement
  progress: HTMLDivElement
}

/** A visible object in the scene (GLB group or nrrd mesh). */
export interface SceneObject {
  name: string
  traverse: (fn: (child: SceneObjectChild) => void) => void
}

export interface SceneObjectChild {
  isMesh?: boolean
  geometry?: { dispose: () => void }
  material?: {
    dispose: () => void
    transparent: boolean
    opacity: number
    depthWrite: boolean
  }
}

export interface CopperScene {
  camera: CopperCamera
  controls: CopperControls
  scene: {
    add: (obj: SceneObject) => void
    remove: (obj: SceneObject) => void
    getObjectByName: (name: string) => SceneObject | undefined
  }
  addObject: (obj: unknown) => void
  loadNrrd: (
    url: string,
    loadingBar: LoadingBar,
    segmentation: boolean,
    callback: (volume: NrrdVolume, meshes: NrrdMeshes, slices: { z: NrrdSlice }) => void,
    opts?: { openGui?: boolean },
  ) => void
  /**
   * NOT `loadPureGLB`. `copperSceneOnDemond` (Scene/copperSceneOnDemond.d.ts:9,
   * dist/bundle.esm.js:84295-84319) only exposes `loadGltf(url, callback)` --
   * no `opts`/`onError`. `loadPureGLB` (with the color/enhanceMaterial/onError
   * signature) exists only on the sibling `copperScene` class
   * (Scene/copperScene.d.ts:21, dist/bundle.esm.js:83678), which
   * `copperRendererOnDemond.createScene()` never constructs -- confirmed by
   * reading its implementation (dist/bundle.esm.js:84344-84355), which always
   * does `new copperSceneOnDemond(...)`. Both `loadGltf` and `loadPureGLB`
   * route through the same `copperGltfLoader(this.renderer)` factory
   * (Loader/copperGltfLoader.d.ts:3), so Draco decoding is unaffected --
   * only `loadPureGLB`'s post-load PBR material tweaks are unavailable here.
   */
  loadGltf: (url: string, callback?: (content: SceneObject) => void) => void
  loadViewUrl: (url: string) => void
  onWindowResize: () => void
  // No `resetView` here: it exists only on `copperScene`
  // (Scene/copperScene.d.ts:57, dist/bundle.esm.js:84635), not on
  // `baseScene`/`copperSceneOnDemond`'s prototype chain (confirmed absent
  // in Scene/baseScene.d.ts and Scene/commonSceneMethod.d.ts). Task 9/10's
  // "reset view" affordance and camera choreography need to build that
  // behaviour from what baseScene *does* provide instead: `loadViewUrl`
  // above, plus `loadView`/`getDefaultViewPoint`/`setViewPoint` if this
  // interface grows to need them.
}

export interface CopperRenderer {
  /**
   * `copperRendererOnDemond`'s own `.d.ts` (Renderer/copperRendererOnDemond.d.ts:7)
   * declares this as `copperScene | baseScene | copperMScene` -- a type
   * shared with the base renderer class. In practice, for this renderer,
   * `createScene` only ever stores `copperSceneOnDemond` instances in its
   * scene map (dist/bundle.esm.js:84332-84354), so `CopperScene` above,
   * not that broader union, is what's actually returned here.
   */
  getSceneByName: (name: string) => CopperScene | undefined
  createScene: (name: string) => CopperScene | undefined
  setCurrentScene: (scene: CopperScene) => void
  /**
   * Inherited from `baseRenderer` (Renderer/baseRenderer.d.ts:24). Before
   * `setCurrentScene` is first called this returns the renderer's own
   * placeholder `baseScene`, not a `copperSceneOnDemond` -- fine for the
   * `onWindowResize` use this exists for (review fix #5), since that's a
   * `baseScene` method too, but don't assume the full `CopperScene`
   * surface (e.g. `loadGltf`) is present on whatever this returns.
   */
  getCurrentScene: () => CopperScene
  render: () => void
  /**
   * Non-optional: `baseRenderer.d.ts` declares both `stop()` and
   * `dispose()` without `?`. Typing them optional here let a call site
   * write `renderer.value?.stop?.()`, which silently no-ops with no
   * compile error if either is ever renamed upstream -- exactly the
   * teardown design doc §12.5 depends on. Verified `dispose()`
   * (dist/bundle.esm.js:69962-69974) really does free the GPU context
   * (`renderer.dispose()` + `renderer.forceContextLoss()`), not just stop
   * the loop.
   */
  stop: () => void
  dispose: () => void
}

/** The parts of `import('copper3d')` we use. */
export interface CopperModule {
  copperRendererOnDemond: new (
    container: HTMLDivElement,
    options?: Record<string, unknown>,
  ) => CopperRenderer
  loading: (svg?: string) => LoadingBar
}

/** useCopperStage's return contract; Tasks 8-10 depend on it. */
export interface StageApi {
  renderer: Ref<CopperRenderer | undefined>
  Copper: Ref<CopperModule | undefined>
  ready: Ref<boolean>
  /** Set if the dynamic `import('copper3d')` itself rejects (e.g. a chunk
   * load failure). Otherwise stays undefined -- this is not a general
   * error channel, just this one failure mode surfaced instead of an
   * unhandled rejection. */
  loadError: Ref<Error | undefined>
  requestContinuous: () => void
  releaseContinuous: () => void
}
