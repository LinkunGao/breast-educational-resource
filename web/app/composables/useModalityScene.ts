import type { Modality } from '~~/content/types'
import type { CopperModule, CopperScene, NrrdSlice, SceneObject, StageApi } from './copper-types'

/**
 * Neither of copper3d's asset-load paths actually surfaces a failure to the
 * caller. `copperSceneOnDemond.loadGltf` (Scene/copperSceneOnDemond.js:27-31)
 * calls `loader.load(url, onLoad, onProgress)` with no third `onError`
 * argument at all -- three's `GLTFLoader.load` signature is
 * `(url, onLoad, onProgress, onError)`, so a failed fetch/parse never
 * invokes anything here. `commonScene.loadNrrd` -> `copperNrrdLoader`
 * (dist/bundle.esm.js:64949-65052) has the identical gap. This timeout is
 * the only way to stop the stage sitting on a stuck spinner forever on a
 * 404 or corrupt asset; it is generous because volumes run 10-50MB.
 */
const LOAD_TIMEOUT_MS = 30_000

export interface SliceState {
  /** Current slice number (already converted from copper3d's world
   * coordinate), not a world coordinate itself. */
  index: number
  max: number
  /** copper3d's own slice object, for useSliceControl (Task 10) to drive
   * directly. */
  raw: NrrdSlice
}

export function useModalityScene(stage: StageApi) {
  const { url } = useAssetUrl()

  const scene = shallowRef<CopperScene>()
  const loading = ref(false)
  const progress = ref(0)
  const sliceState = ref<SliceState | null>(null)
  /** Set only when an asset genuinely fails to load (the timeout above, or
   * copper3d refusing to create a scene at all). Distinct from
   * `stage.loadError` (Task 7), which covers copper3d's own chunk failing
   * to import -- CopperStage renders both through the same pattern. */
  const loadError = shallowRef<Error>()

  /** Per-scene slice info, keyed by scene name, so switching back to a
   * cached NRRD scene restores its own slice position instead of showing
   * whichever scene last finished loading. */
  const sliceStateByScene = new Map<string, SliceState | null>()

  /** Every scene created here leaks a `window` resize listener (see
   * copper-types.ts's `CopperScene.confirmResize` doc) that nothing in
   * copper3d ever removes. Tracked so onScopeDispose below can remove
   * them -- the one part of the leak actually fixable from outside the
   * library. */
  const pendingResizeCleanup: Array<() => void> = []

  /** Bumped on every `load()` call. Guards against a stale async result
   * (a slow network response, or the timeout above) landing after the
   * user has already switched to a different modality and overwriting
   * `loading`/`sliceState`/`loadError` with data for a scene that is no
   * longer current. */
  let loadToken = 0

  /** Scenes are namespaced `${slug}:${modalityId}` so two cases can never
   * collide, and switching modalities within one case can find its own
   * previously-built scene back. */
  function sceneName(slug: string, modality: Modality) {
    return `${slug}:${modality.id}`
  }

  async function load(slug: string, modality: Modality) {
    const renderer = stage.renderer.value
    const Copper = stage.Copper.value
    if (!stage.ready.value || !renderer || !Copper) return

    const name = sceneName(slug, modality)
    const token = ++loadToken
    loadError.value = undefined

    // Already built: switch to it rather than re-downloading a 10-50MB
    // volume. Scenes only accumulate within one case visit (at most 4,
    // one per modality) -- CopperStage's host component is keyed by case
    // slug (app.vue's pageKey), so navigating to a different case remounts
    // it and useCopperStage's dispose() tears the whole renderer, and
    // every scene it holds, down. The bandwidth this saves on the
    // modality stepper's back-and-forth navigation outweighs holding a
    // few extra scenes' GPU memory for the life of one case visit.
    const existing = renderer.getSceneByName(name)
    if (existing) {
      scene.value = existing
      renderer.setCurrentScene(existing)
      sliceState.value = sliceStateByScene.get(name) ?? null
      loading.value = false
      progress.value = 1
      renderer.render()
      return
    }

    loading.value = true
    progress.value = 0

    try {
      const next = renderer.createScene(name)
      if (!next) throw new Error(`copper3d refused to create scene "${name}"`)
      pendingResizeCleanup.push(() => window.removeEventListener('resize', next.confirmResize, false))

      renderer.setCurrentScene(next)
      scene.value = next
      next.controls.rotateSpeed = 3.0
      // Legacy control feel (frontend/components/model/LeftModel.vue:157 vs
      // Model.vue:237): the anatomy viewer pans slower than the imaging
      // viewers, which orbit a much larger NRRD volume.
      next.controls.panSpeed = modality.id === 'anatomy' ? 0.2 : 0.5

      const slice = modality.id === 'anatomy'
        ? await loadAnatomy(next, url(modality.asset))
        : await loadImaging(next, Copper, modality, url(modality.asset))

      if (token !== loadToken) return // superseded by a later load() call

      sliceStateByScene.set(name, slice)
      sliceState.value = slice
      next.loadViewUrl(url(modality.viewPreset))
      next.onWindowResize()
      loading.value = false
      progress.value = 1
      renderer.render()
    }
    catch (err) {
      if (token !== loadToken) return
      loadError.value = err instanceof Error ? err : new Error(String(err))
      loading.value = false
    }
  }

  function loadAnatomy(target: CopperScene, assetUrl: string): Promise<null> {
    return new Promise<null>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out loading anatomy model: ${assetUrl}`)),
        LOAD_TIMEOUT_MS,
      )
      target.loadGltf(assetUrl, (group) => {
        clearTimeout(timer)
        group.name = 'anatomy-model'
        tintFatLayer(group)
        resolve(null)
      })
    })
  }

  function loadImaging(
    target: CopperScene,
    Copper: CopperModule,
    modality: Modality,
    assetUrl: string,
  ): Promise<SliceState | null> {
    return new Promise((resolve, reject) => {
      const bar = Copper.loading()
      // Ultrasound is the app's one 2D modality (design doc §3.1's md5
      // audit: the u2d.nrrd asset only exists for benign-cyst) -- a single
      // flat slice has nothing to orbit.
      const flat = modality.id === 'ultrasound'
      const timer = setTimeout(
        () => reject(new Error(`Timed out loading ${modality.id} volume: ${assetUrl}`)),
        LOAD_TIMEOUT_MS,
      )

      try {
        target.loadNrrd(
          assetUrl,
          bar,
          true,
          (_volume, meshes, slices) => {
            clearTimeout(timer)
            target.addObject(meshes.z)
            meshes.z.name = 'z'

            if (flat) {
              // copperSceneOnDemond hardcodes OrbitControls, not
              // TrackballControls (copper-types.ts's CopperControls doc) --
              // `noRotate`/`noPan` (what the legacy 2D views actually used,
              // frontend/components/model/Model.vue:268-269, running on a
              // different controls class) do not exist here and would
              // silently no-op, leaving the view rotatable.
              target.controls.enableRotate = false
              target.controls.enablePan = false
              resolve(null)
            }
            else {
              const z = slices.z
              resolve({
                index: Math.round(z.index / z.volume.spacing[2]),
                max: z.MaxIndex,
                raw: z,
              })
            }
          },
          { openGui: false },
        )
      }
      catch (err) {
        clearTimeout(timer)
        reject(err)
      }
    })
  }

  onScopeDispose(() => {
    for (const cleanup of pendingResizeCleanup) cleanup()
    pendingResizeCleanup.length = 0
  })

  return { scene, loading, progress, sliceState, loadError, load }
}

/**
 * Matches the legacy app's only GLB material treatment
 * (frontend/components/model/LeftModel.vue:160-174): the fat-layer mesh
 * becomes a translucent amber (`#a3932a`, 40% opacity) so the
 * fibroglandular tissue underneath reads through it -- the whole point of
 * showing an anatomy model per density case. copper3d's `loadPureGLB` (the
 * only method with a `color` option, and not even the one this renderer's
 * scene class exposes -- see copper-types.ts's `loadGltf` doc) never
 * actually reads that option: dist/bundle.esm.js:83678-83706 applies
 * `enhanceMaterial`'s generic PBR tweaks but never touches `opts.color`.
 * There is no library feature to lean on here, so this reproduces the
 * legacy component's traversal by hand instead of inventing a new
 * appearance (a flat pink tint, as an earlier draft of this task assumed,
 * would not have matched the original app at all).
 *
 * Mutates the mesh's existing material in place rather than constructing a
 * new material instance, so this file never needs its own `import`
 * of `three`: copper3d's dist/bundle.esm.js has three's source inlined,
 * not imported (`from "three"` appears nowhere in it), so a material built
 * from the hoisted `node_modules/three` (a dependency of copper3d, not of
 * this app -- global constraint) would be a different, if
 * version-identical, class from whatever GLTFLoader actually attached to
 * this mesh. Mutating the object already there sidesteps that boundary
 * entirely.
 */
function tintFatLayer(group: SceneObject) {
  group.traverse((child) => {
    if (!child.isMesh || child.name !== 'VH_F_fat_L' || !child.material) return
    child.material.transparent = true
    child.material.opacity = 0.4
    child.material.color?.set('#a3932a')
  })
}
