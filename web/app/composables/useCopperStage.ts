import type { Ref } from 'vue'
import type { CopperModule, CopperRenderer, StageApi } from './copper-types'

/**
 * Lifecycle of the single renderer (design doc §8.2).
 *
 * The legacy implementation built three copperRenderers at the module
 * scope of plugins/copper.js and called animate() on all three, so three
 * WebGL contexts and three permanent rAF loops existed unconditionally.
 * Here there is one copperRendererOnDemond, bound to the component
 * lifecycle: no frames while idle.
 *
 * Camera animations temporarily promote rendering to continuous via
 * requestContinuous(), and fall back to on-demand via releaseContinuous()
 * once they finish (design doc §7.6).
 */
export function useCopperStage(host: Ref<HTMLElement | undefined>): StageApi {
  const renderer = shallowRef<CopperRenderer>()
  const Copper = shallowRef<CopperModule>()
  const ready = ref(false)
  const loadError = shallowRef<Error>()

  let continuousHolders = 0
  let rafId: number | null = null

  // Set once by onScopeDispose. `renderer.value === undefined` is NOT a
  // reliable "already torn down" signal on its own: it's also true before
  // the renderer has been built yet, which is exactly the window fix #1
  // below has to guard. `disposed` is the actual, unambiguous state flag.
  let disposed = false
  // Set once onScopeDispose runs, checked after the dynamic import's
  // `await` resolves (review fix #1). baseRenderer's constructor creates
  // a live THREE.WebGLRenderer -- a real GPU context -- before it can ever
  // fail on a null container, so constructing after the component has
  // already unmounted (its host div gone, nothing left to call dispose())
  // would leak an unowned, never-freed WebGL context. Browsers cap live
  // contexts around 16; a few rapid case switches during a slow chunk
  // load would exhaust that budget.
  let cancelled = false

  function tick() {
    if (disposed) return
    renderer.value?.render()
    rafId = requestAnimationFrame(tick)
  }

  /** Call when an animation starts. Re-entrant: concurrent animations still
   * share a single rAF loop. No-ops after disposal (review fix #2): without
   * this, a Task 9/10 animation timer firing after unmount would start a
   * fresh rAF loop with no owner left to ever call releaseContinuous(). */
  function requestContinuous() {
    if (disposed) return
    continuousHolders++
    if (rafId === null) rafId = requestAnimationFrame(tick)
  }

  /** Call when an animation ends. Frames stop once the count returns to 0.
   * Also a no-op after disposal, for symmetry with requestContinuous --
   * there is nothing left to release. */
  function releaseContinuous() {
    if (disposed) return
    continuousHolders = Math.max(0, continuousHolders - 1)
    if (continuousHolders === 0 && rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
      // One more render on the way back to on-demand, so the view settles
      // on its final state rather than whatever the last rAF frame drew.
      renderer.value?.render()
    }
  }

  let resizeObserver: ResizeObserver | undefined

  onMounted(async () => {
    // Belt-and-braces: onMounted itself never runs during SSR (Vue skips
    // it in renderToString, which is what both `nuxi dev`'s SSR pass and
    // `nuxi generate`'s prerender use), so this callback -- and the
    // dynamic import below -- can never execute on the server. This guard
    // makes that explicit rather than relying solely on onMounted's
    // semantics, per this task's SSR ruling.
    //
    // `typeof window` rather than Nuxt's `import.meta.client`: the latter
    // is a compile-time macro Nuxt's own Vite plugin substitutes, which
    // this project's plain `vitest.config.ts` (no Nuxt) does not do --
    // confirmed empirically (a `define` entry matching Nuxt's own,
    // `{'import.meta.client': true}`, still read back as `undefined` in a
    // Vitest run, while a plain identifier `define` in the same config
    // substituted correctly, isolating this to `import.meta`-specific
    // member-expression handling Nuxt's own plugin does that bare Vite
    // `define` doesn't replicate). `typeof window === 'undefined'` is the
    // portable, framework-agnostic version of the same check: false in a
    // real Node SSR render (no `window`), true in real browsers AND in
    // Vitest+happy-dom (which does provide a `window`), so the guard's
    // protective intent is identical but it no longer depends on tooling
    // this test setup doesn't have.
    if (typeof window === 'undefined') return
    if (!host.value) return

    let mod: CopperModule
    try {
      // copper3d touches window/document, so it must be dynamically
      // imported on the client only.
      mod = (await import('copper3d')) as unknown as CopperModule
    }
    catch (err) {
      // Review fix #7: surface a chunk-load failure instead of leaving
      // `ready` false forever with only an unhandled rejection.
      if (!cancelled) loadError.value = err instanceof Error ? err : new Error(String(err))
      return
    }

    // The component may have unmounted while that chunk was still
    // downloading -- see `cancelled`'s comment above. Checking before ever
    // calling `new` means no renderer, and therefore no GPU context, is
    // built at all in that case; there is nothing to dispose because
    // nothing was constructed.
    if (cancelled || !host.value) return

    Copper.value = mod
    const built = new mod.copperRendererOnDemond(host.value as HTMLDivElement, {
      guiOpen: false,
      alpha: true, // background is CSS-driven (design doc §5.3)
      logarithmicDepthBuffer: true,
      // Deliberately NOT passing `light` or `controls` here: verified
      // (dist/bundle.esm.js:69852-69907, baseRenderer's constructor) that
      // `ICopperRenderOpt` has no `light` field baseRenderer reads, and
      // `controls` is only consulted by the sibling `copperScene` class's
      // constructor (dist/bundle.esm.js:83629-83637) -- `copperSceneOnDemond`
      // (what this renderer actually builds) always instantiates
      // OrbitControls regardless. Passing either here would be silently
      // inert, not a real toggle -- see copper-types.ts's CopperControls.
    })
    renderer.value = built
    ready.value = true

    // Review fix #5: copper3d only re-sizes its canvas on `window` resize,
    // but the desktop layout's panel-collapse (design doc §10.1) changes
    // this stage's own width with no window resize event at all -- so the
    // canvas would stretch to the wrong aspect ratio without this. This is
    // a ResizeObserver keeping a drawing surface in sync with a box CSS
    // already sized, not a layout decision, so it doesn't conflict with
    // this project's CSS-only-breakpoints rule.
    resizeObserver = new ResizeObserver(() => {
      renderer.value?.getCurrentScene().onWindowResize()
      renderer.value?.render()
    })
    resizeObserver.observe(host.value)
  })

  onScopeDispose(() => {
    cancelled = true
    disposed = true
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    continuousHolders = 0
    resizeObserver?.disconnect()
    resizeObserver = undefined
    renderer.value?.stop()
    renderer.value?.dispose()
    renderer.value = undefined
    ready.value = false
  })

  return { renderer, Copper, ready, loadError, requestContinuous, releaseContinuous }
}
