import type { Modality } from '~~/content/types'
import type { CopperModule, CopperRenderer, CopperScene, CopperViewPoint, NrrdSlice, SceneObject, StageApi } from './copper-types'

/**
 * GLBs are all <=1.28MB (this app's four `density*.glb` anatomy assets --
 * checked their sizes directly), so a flat wall-clock timeout is fine for
 * them. `loadGltf` also has no progress signal to stall-detect against
 * even if it mattered: its three-arg `loader.load(url, onLoad, onProgress)`
 * call passes a function that does nothing with the `xhr` it receives
 * (Scene/copperSceneOnDemond.js:27-31) into what three's `GLTFLoader.load`
 * treats as the *onProgress* slot -- there is no fourth `onError` argument
 * at all, so a failed fetch/parse never invokes anything here either.
 */
const GLB_LOAD_TIMEOUT_MS = 30_000

/**
 * NRRD volumes run up to ~53MB (`cancer-lobular/right/mri.nrrd`, checked
 * directly) -- a flat wall-clock timeout on those misreports a slow-but-
 * healthy download as a failure (14.2 Mbps sustained for 30s to finish
 * that file; ~6 Mbps, a realistic shared-network speed, takes 71s). "No
 * progress for 15s" is a genuine stall signal a large-but-healthy transfer
 * won't trip, whereas a fixed deadline eventually will regardless of file
 * size. `copperNrrdLoader` writes a fresh percentage string into
 * `bar.progress`'s text on every xhr progress event
 * (Loader/copperNrrdLoader.js:150-155); observing that DOM node for
 * mutations is the only liveness signal copper3d exposes, since `loadNrrd`
 * never receives an `onError` from the underlying three.js loader either
 * (same file, same gap as `loadGltf` above).
 */
const NRRD_STALL_TIMEOUT_MS = 15_000

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
  /** Real fractional progress for NRRD loads (parsed from copper3d's own
   * progress text -- see NRRD_STALL_TIMEOUT_MS's doc); GLB loads only ever
   * report 0 then 1, since `loadGltf` has no progress signal at all. */
  const progress = ref(0)
  const sliceState = ref<SliceState | null>(null)
  /** Set only when an asset genuinely fails to load (a stall/timeout, or
   * copper3d refusing to create a scene at all). Distinct from
   * `stage.loadError` (Task 7), which covers copper3d's own chunk failing
   * to import -- CopperStage renders both through the same pattern. */
  const loadError = shallowRef<Error>()

  /** Per-scene slice info, keyed by scene name, so switching back to a
   * cached NRRD scene restores its own slice position instead of showing
   * whichever scene last finished loading. */
  const sliceStateByScene = new Map<string, SliceState | null>()

  /** Bumped on every `load()` call. Guards against a stale async result
   * (a slow network response, or a timeout/stall) landing after the user
   * has already switched to a different modality and overwriting
   * `loading`/`sliceState`/`loadError` with data for a scene that is no
   * longer current. */
  let loadToken = 0

  /** Set once this composable's owning scope (CopperStage's component
   * instance) is disposed -- e.g. case navigation. Mirrors useCopperStage's
   * own `disposed` flag: there is no way to cancel the in-flight XHR
   * inside loadGltf/loadNrrd, so a response can still arrive after
   * teardown. Checked before touching `next`/`renderer` again, since by
   * then `renderer` may be a disposed WebGLRenderer (`onWindowResize` ->
   * `setSize` on a dead context) and there is nothing left to update
   * anyway. */
  let disposed = false

  /**
   * Switches the renderer to `next` and hands control input over to it.
   * Review fix #1: every scene's OrbitControls listens on the *shared*
   * canvas regardless of which scene is "current", so leaving a previous
   * scene's controls enabled means its `change` handler still fires (and
   * still requests a render of *that* scene) on every drag/resize -- the
   * last-created scene wins the race and paints over whatever is actually
   * meant to be visible. Disabling the outgoing scene's controls and
   * enabling the incoming one is the only thing that actually stops that.
   */
  function activateScene(renderer: CopperRenderer, next: CopperScene) {
    const previous = scene.value
    if (previous && previous !== next) previous.controls.enabled = false
    next.controls.enabled = true
    renderer.setCurrentScene(next)
    scene.value = next
  }

  /** Scenes are namespaced `${slug}:${modalityId}` so two cases can never
   * collide, and switching modalities within one case can find its own
   * previously-built scene back. */
  function sceneName(slug: string, modality: Modality) {
    return `${slug}:${modality.id}`
  }

  async function load(slug: string, modality: Modality) {
    const renderer = stage.renderer.value
    const Copper = stage.Copper.value
    if (disposed || !stage.ready.value || !renderer || !Copper) return

    const name = sceneName(slug, modality)
    const token = ++loadToken
    loadError.value = undefined

    // Already built: switch to it rather than re-downloading a 10-50MB
    // volume. Scenes only accumulate within one case visit (at most 3 --
    // no case in the catalogue combines all four modalities, see
    // content/cases.ts) before CopperStage's host component (keyed by
    // case slug, app.vue's pageKey) unmounts and useCopperStage's dispose()
    // tears the whole renderer down, freeing the actual GPU context
    // (`renderer.dispose()` + `forceContextLoss()` -- not a GPU leak). What
    // it does not free until then is decoded volume memory: the worst case
    // in the catalogue (cancer-lobular's mammogram + MRI) holds ~75MB of
    // NRRD files resident at once on disk, and NRRD volumes decode to raw
    // typed arrays that run larger still in memory than that compressed
    // size. The bandwidth this saves on the modality stepper's
    // back-and-forth navigation outweighs that for a single case visit,
    // but it is a real tradeoff, not a free one.
    const existing = renderer.getSceneByName(name)
    if (existing) {
      activateScene(renderer, existing)
      sliceState.value = sliceStateByScene.get(name) ?? null
      loading.value = false
      progress.value = 1
      renderer.render()
      return
    }

    loading.value = true
    progress.value = 0

    // Hoisted above the try block so the catch below can tell "createScene
    // itself refused" (nothing to undo) apart from "a scene was created
    // but its content failed to load" (review round 2, fix #1 -- that
    // scene is now registered in copper3d's own sceneMap and must be
    // evicted, or a later visit finds it and treats it as a silently
    // broken success).
    let next: CopperScene | undefined

    try {
      next = renderer.createScene(name)
      if (!next) throw new Error(`copper3d refused to create scene "${name}"`)
      // Review fix #1 (second half): remove the leaked resize listener
      // immediately at creation, not deferred to this scope's disposal.
      // useCopperStage's own ResizeObserver already calls
      // `getCurrentScene().onWindowResize()` on every container resize (a
      // strict superset of window-resize-triggered changes -- it also
      // catches panel-collapse layout changes with no window resize event
      // at all), so `confirmResize`'s window-resize wiring
      // (Scene/copperSceneOnDemond.js:9-12,27) is entirely redundant here.
      // Removing it up front makes the leak fix unconditional instead of
      // depending on this scope ever actually disposing.
      window.removeEventListener('resize', next.confirmResize, false)

      activateScene(renderer, next)
      next.controls.rotateSpeed = 3.0
      // Legacy control feel (frontend/components/model/LeftModel.vue:157 vs
      // Model.vue:237): the anatomy viewer pans slower than the imaging
      // viewers, which orbit a much larger NRRD volume.
      next.controls.panSpeed = modality.id === 'anatomy' ? 0.2 : 0.5

      const slice = modality.id === 'anatomy'
        ? await loadAnatomy(next, url(modality.asset))
        : await loadImaging(next, Copper, modality, url(modality.asset), token)

      if (disposed) return // torn down mid-load; nothing left to update

      // This load succeeded (a failed one is handled in the catch below,
      // via eviction instead). Content was already added into `next`
      // synchronously inside the load callback above, so finish its
      // bookkeeping unconditionally, even if a newer load has since
      // superseded this one (review fix #3) -- otherwise a later switch
      // back to this modality finds it cached but half-built: no slice
      // state, no camera preset, `getSceneByName` short-circuiting on it
      // forever.
      sliceStateByScene.set(name, slice)
      const viewpoint = await fetchViewPoint(url(modality.viewPreset))
      if (disposed) return
      next.loadView(viewpoint)

      if (token !== loadToken) return // superseded by a later load() call

      sliceState.value = slice
      next.onWindowResize()
      loading.value = false
      progress.value = 1
      renderer.render()
    }
    catch (err) {
      if (disposed) return
      // Review round 2, fix #1: `next` is only set once `createScene`
      // actually built (and registered) a scene for `name` this attempt --
      // evicting here undoes exactly that registration, never an
      // unrelated scene already cached from an earlier, successful load.
      // Unconditional on `token`: even a superseded load's own poisoned
      // entry must not survive under its own name, or a later visit to
      // that modality finds it via getSceneByName regardless of which
      // load happened to be "current" when it failed.
      if (next) {
        delete renderer.sceneMap[name]
        // `delete` on a property that no longer exists is a silent no-op,
        // so a copper3d upgrade that restructures sceneMap (say, into a
        // Map) would stop evicting without a crash or a type error --
        // quietly restoring the poisoned-cache bug this whole branch
        // exists to fix. Confirm through the library's OWN accessor, which
        // survives that kind of change, and fail loudly if it didn't take.
        if (renderer.getSceneByName(name)) {
          throw new Error(
            `copper3d scene "${name}" survived eviction: its sceneMap is no `
            + `longer a plain object keyed by scene name. Failed loads will `
            + `poison the cache until this is updated to match the new shape.`,
          )
        }
      }
      if (token !== loadToken) return
      loadError.value = err instanceof Error ? err : new Error(String(err))
      loading.value = false
    }
  }

  function loadAnatomy(target: CopperScene, assetUrl: string): Promise<null> {
    return new Promise<null>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out loading anatomy model: ${assetUrl}`)),
        GLB_LOAD_TIMEOUT_MS,
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
    token: number,
  ): Promise<SliceState | null> {
    return new Promise((resolve, reject) => {
      const bar = Copper.loading()
      // Ultrasound is the app's one 2D modality (design doc §3.1's md5
      // audit: the u2d.nrrd asset only exists for benign-cyst) -- a single
      // flat slice has nothing to orbit.
      const flat = modality.id === 'ultrasound'

      let stallTimer: ReturnType<typeof setTimeout>
      function armStallTimer() {
        clearTimeout(stallTimer)
        stallTimer = setTimeout(() => {
          settle()
          reject(new Error(
            `Stalled loading ${modality.id} volume (no progress for ${NRRD_STALL_TIMEOUT_MS}ms): ${assetUrl}`,
          ))
        }, NRRD_STALL_TIMEOUT_MS)
      }
      // Watches copper3d's own progress node for the mutations
      // `copperNrrdLoader`'s xhr progress handler writes into it (see this
      // file's header comment) -- the only liveness/progress signal
      // available, since there is no onProgress/onError callback exposed
      // to us directly. Re-arms the stall timer unconditionally (even for
      // a superseded load -- it still needs to eventually settle so
      // review fix #1's eviction can run), but only writes the shared
      // `progress` ref when this is still the current load (review round
      // 2, fix #2): without that guard, a superseded load's own late
      // progress events kept landing in the ref a newer, on-screen load
      // already owns, which would jitter design doc §13.1's progress ring
      // between two unrelated downloads.
      const observer = new MutationObserver(() => {
        if (token === loadToken) {
          const text = bar.progress.textContent ?? ''
          if (/Infinity/.test(text)) {
            // The server omitted Content-Length, so xhr.total is 0 and
            // copper3d's own `Math.ceil((xhr.loaded / xhr.total) * 100)`
            // (Loader/copperNrrdLoader.js:152) divides by zero -> the
            // literal string "Infinity". Bytes are still arriving, there
            // is just no way to express a fraction -- NaN signals
            // "indeterminate" to whatever renders this, rather than
            // silently freezing at whatever `progress` last held (review
            // round 2, fix #3).
            progress.value = Number.NaN
          }
          else {
            const match = /(\d+)\s*%/.exec(text)
            if (match) progress.value = Number(match[1]) / 100
          }
        }
        armStallTimer()
      })
      observer.observe(bar.progress, { childList: true, characterData: true, subtree: true })
      function settle() {
        clearTimeout(stallTimer)
        observer.disconnect()
      }
      armStallTimer() // starts the clock even before the first progress event

      try {
        target.loadNrrd(
          assetUrl,
          bar,
          true,
          (_volume, meshes, slices) => {
            settle()
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
        settle()
        reject(err)
      }
    })
  }

  /** `loadViewUrl` is a raw XHR with no completion signal at all (see
   * CopperScene.loadView's doc) -- fetching the same JSON directly is the
   * only way to know when the preset has actually landed, so a render can
   * be requested after. A missing/malformed preset propagates to
   * `load()`'s own catch (surfaced as the modality's load failure) rather
   * than silently leaving the default camera in place -- content/cases.ts
   * pairs every modality with a real viewPreset path, so a 404 here means
   * the asset catalogue itself is wrong and should say so, not hide it. */
  async function fetchViewPoint(viewPresetUrl: string): Promise<CopperViewPoint> {
    const response = await fetch(viewPresetUrl)
    if (!response.ok) throw new Error(`Failed to fetch view preset (${response.status}): ${viewPresetUrl}`)
    return response.json() as Promise<CopperViewPoint>
  }

  onScopeDispose(() => {
    disposed = true
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
