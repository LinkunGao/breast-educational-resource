import type { CopperControls, CopperModule, CopperScene } from './copper-types'

/**
 * Replaces the OrbitControls instance `copperSceneOnDemond` hardcodes with
 * copper3d's own `Copper3dTrackballControls`, which is what the legacy app
 * used on every viewer it had (`controls: "copper3d"`,
 * frontend/plugins/copper.js:20).
 *
 * ## Why a post-construction swap
 *
 * `copperRendererOnDemond` only ever builds `copperSceneOnDemond`, and that
 * class does `new OrbitControls(this.camera, renderer.domElement)`
 * unconditionally (bundle.esm.js:84290). The renderer's `controls` option is
 * read only by the sibling `copperScene` class (bundle.esm.js:83629-83637),
 * which this app never constructs -- so passing `controls: "copper3d"` at
 * renderer construction is silently inert. Swapping afterwards is the only
 * way to get the trackball without giving up on-demand rendering.
 *
 * ## Why the swap is safe
 *
 * `copperSceneOnDemond` reads `this.controls` fresh at every use --
 * `render()` and `onWindowResize()` call `this.controls.update()`, `loadGltf`
 * writes `this.controls.maxDistance` (bundle.esm.js:84277, 84378, 84301) --
 * and captures the instance in exactly one place: the `change` listener its
 * constructor registers. This re-registers that same listener, so on-demand
 * rendering keeps working; without it a drag would move the camera and never
 * request a frame.
 *
 * ## Behavioural differences that callers must know about
 *
 * - `noRotate`/`noPan`, not `enableRotate`/`enablePan`. Writing the
 *   OrbitControls names on a trackball silently does nothing, which is how
 *   the imaging modalities ended up rotatable when they were meant not to be.
 * - `rotateSpeed` is on a different scale. The legacy app's tuned value is
 *   `3.0` ON THIS CLASS (LeftModel.vue:156, Model.vue:236); the same number
 *   on OrbitControls is 3x its default and is what made imaging rotation
 *   feel violent.
 * - `handleResize()` must be called after any container resize: the class
 *   caches the canvas's page box in `screen` instead of measuring per event.
 */
export function installTrackballControls(
  Copper: CopperModule,
  scene: CopperScene,
): CopperControls {
  const previous = scene.controls

  // Order matters: drop the listener before disposing, so the disposed
  // instance cannot request one last frame on its way out.
  previous.removeEventListener?.('change', scene.requestRenderIfNotRequested)
  previous.enabled = false
  previous.dispose?.()

  const controls = new Copper.Copper3dTrackballControls(
    scene.camera,
    scene.renderer.domElement,
  )
  // No inertia -- the human's requirement #2. copper3d's own scenes set this
  // the same way (bundle.esm.js:84413-84415, 84448-84450); it is the legacy
  // APP that left it off.
  controls.staticMoving = true
  controls.addEventListener?.('change', scene.requestRenderIfNotRequested)

  scene.controls = controls
  controls.handleResize()
  return controls
}
