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
  /**
   * Review fix #1: `copperSceneOnDemond`'s constructor does
   * `new OrbitControls(this.camera, renderer.domElement)` against the
   * *shared* canvas (Scene/copperSceneOnDemond.js:28) and wires
   * `controls.addEventListener("change", requestRenderIfNotRequested)`,
   * which renders that specific scene. `setCurrentScene`
   * (Renderer/copperRendererOnDemond.js:16-24) never disables the
   * controls of whatever scene it's switching away from, so with more
   * than one cached scene, a single mouse drag reaches every one of
   * their controls and the last-created scene paints last, regardless of
   * which is actually on screen. `enabled` (three's own `Controls` base
   * class, node_modules/three/src/extras/Controls.js:43, inherited by
   * OrbitControls) is the real, documented off switch: every early-return
   * guard in OrbitControls.js checks `this.enabled === false` before
   * touching any pointer/wheel state, so setting it `false` genuinely
   * stops that scene's controls from ever dispatching `change`.
   * useModalityScene sets this `false` on the outgoing scene and `true`
   * on the incoming one at every switch.
   */
  enabled: boolean
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

/**
 * The shape `loadView` expects and every `*_view.json` asset actually has on
 * disk (checked `public/modelView/left_breast_view.json` and
 * `density-1/middle/m_view.json` directly). Matches the destructuring in
 * `baseScene.loadView` (Scene/baseScene.js:88-98).
 */
export interface CopperViewPoint {
  farPlane: number
  nearPlane: number
  eyePosition: number[]
  targetPosition: number[]
  upVector: number[]
}

/** A visible object in the scene (GLB group or nrrd mesh). */
export interface SceneObject {
  name: string
  traverse: (fn: (child: SceneObjectChild) => void) => void
}

export interface SceneObjectChild {
  isMesh?: boolean
  /** three's Object3D always has this (default `""`), never undefined --
   * used to find the anatomy GLB's fat-layer mesh by name (see
   * useModalityScene's `tintFatLayer`, matching
   * frontend/components/model/LeftModel.vue:162's `child.name ==
   * "VH_F_fat_L"` check, the legacy app's only GLB material treatment). */
  name: string
  geometry?: { dispose: () => void }
  material?: {
    dispose: () => void
    transparent: boolean
    opacity: number
    depthWrite: boolean
    /** Present on the PBR materials glTF's default material maps to
     * (MeshStandardMaterial/MeshPhysicalMaterial); modelled narrowly as the
     * one mutator useModalityScene needs, not the full three.js `Color`
     * class. Deliberately not importing `three` for this type: see this
     * file's header comment on why only one hoisted copy may exist. */
    color?: { set: (value: string) => void }
  }
}

/**
 * What's actually guaranteed on whatever `CopperRenderer.getCurrentScene()`
 * returns. Before `setCurrentScene()` is ever called, that's the
 * renderer's own placeholder `baseScene` (Renderer/baseRenderer.d.ts's
 * constructor builds one directly), not a `copperSceneOnDemond` --
 * `baseScene` has no `loadGltf`/`loadNrrd` and no OrbitControls-shaped
 * `controls` (those are `copperSceneOnDemond`/`copperScene`-only). Typing
 * `getCurrentScene()` as the full `CopperScene` let
 * `getCurrentScene().loadGltf(...)` compile and then throw at runtime on
 * exactly the placeholder-scene window this comment describes. Only
 * `onWindowResize` (Scene/baseScene.d.ts's own method, inherited by every
 * scene class) is guaranteed here.
 */
export interface CopperBaseScene {
  onWindowResize: () => void
}

export interface CopperScene extends CopperBaseScene {
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
  /**
   * Review fix #5: `loadViewUrl` (Scene/baseScene.js:77-87) is a raw
   * `XMLHttpRequest` with no callback, event, or promise of any kind --
   * there is no way to know from outside when (or whether) it actually
   * lands. Under on-demand rendering, the `render()` call any caller makes
   * right after `loadViewUrl` necessarily draws before that XHR resolves,
   * so the preset camera framing it was supposed to produce never gets a
   * frame of its own once it does land -- design doc §5.3's camera preset
   * silently never appears until some unrelated interaction happens to
   * request one. `loadView` (Scene/baseScene.js:88-98, same JSON shape as
   * `CopperViewPoint` above) is the synchronous part `loadViewUrl` calls
   * internally after its XHR resolves; useModalityScene fetches the same
   * JSON itself and calls this directly so it has an awaitable completion
   * signal to render after.
   */
  loadView: (data: CopperViewPoint) => void
  /**
   * `copperSceneOnDemond`'s constructor does
   * `window.addEventListener("resize", this.confirmResize, false)`
   * (Scene/copperSceneOnDemond.js:9-12,27) and nothing in copper3d ever
   * calls the matching `removeEventListener` -- every scene this renderer
   * creates leaks that listener (and everything it closes over) for the
   * life of the page. `confirmResize` is declared public on the class
   * (Scene/copperSceneOnDemond.d.ts), assigned to `this` before the
   * `addEventListener` call runs, so reading it back through this type is
   * the exact same function reference that got registered --
   * `window.removeEventListener('resize', scene.confirmResize, false)`
   * (capture flag matching the original `false`) genuinely unsubscribes
   * it. useModalityScene does this immediately after every `createScene`
   * call, not deferred to its own scope disposal: useCopperStage's
   * ResizeObserver already calls `getCurrentScene().onWindowResize()` on
   * every container resize (review fix #1), so `confirmResize`'s
   * window-resize wiring is redundant the instant a scene exists, and
   * removing it up front rather than at teardown makes the fix
   * unconditional.
   */
  confirmResize: () => void
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
   * Inherited from `baseRenderer` (Renderer/baseRenderer.d.ts:24). Typed
   * as `CopperBaseScene`, not `CopperScene` (round-2 review fix #3): the
   * placeholder scene this returns before `setCurrentScene` is ever
   * called is a real `baseScene`, which has no `loadGltf`/`loadNrrd`/
   * `controls` -- the wider `CopperScene` type let those compile here and
   * then throw at runtime. Widen the call site with a cast only where the
   * caller has independently established the current scene really is a
   * `copperSceneOnDemond` (e.g. right after this renderer's own
   * `createScene`/`setCurrentScene`).
   */
  getCurrentScene: () => CopperBaseScene
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
