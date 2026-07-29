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
/**
 * Imports copper3d, working around a throw in its own bundle.
 *
 * `copper3d/dist/bundle.esm.js` inlines a whole nested webpack runtime
 * (for a WASM module it vendors). That runtime resolves its public path at
 * MODULE EVALUATION time, unconditionally -- before any of copper3d's own
 * code runs and whether or not the WASM is ever used -- like this:
 *
 *   currentScript?.src, else the LAST <script> element's src,
 *   else `throw new Error("Automatic publicPath is not supported...")`
 *
 * Under native ESM `document.currentScript` is always null, and Nuxt's last
 * injected `<script>` is inline, so its `src` is `""`. Both fall through and
 * copper3d throws on import. The legacy Nuxt 2 app never hit this because
 * webpack substituted its own public path at build time; Vite does not.
 *
 * Appending a real `<script src>` would satisfy the fallback but fire a
 * doomed network request, so instead `document.currentScript` is shadowed
 * for the duration of the import with an object carrying a same-origin src,
 * then restored. The value only ever becomes the base URL for fetching that
 * vendored WASM, which nothing on this app's NRRD/GLB paths touches.
 */
async function importCopper3d(): Promise<CopperModule> {
  const shimmed = document.currentScript === null
  if (shimmed) {
    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      value: { src: new URL('./', document.baseURI).href },
    })
  }
  try {
    return (await import('copper3d')) as unknown as CopperModule
  }
  finally {
    // Restores the native getter rather than leaving a frozen value behind,
    // which would break any other consumer that reads currentScript later.
    if (shimmed) delete (document as unknown as Record<string, unknown>).currentScript
  }
}

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
    // `import.meta.server` first, `typeof window` second (round-2 review
    // fix #2). In the real Nuxt server build, Nuxt's own Vite plugin
    // substitutes `import.meta.server` -> `true` at compile time, so
    // Rollup dead-code-eliminates this whole branch -- and, transitively,
    // copper3d -- out of the server bundle entirely. `typeof window`
    // alone can't do that: it's opaque to the bundler, so it would leave
    // copper3d reachable in the server module graph even though this
    // branch never runs there -- a server-bundle-size cost, not a
    // correctness one. Under plain Vitest (no Nuxt plugin), `import.meta`
    // simply has no `server` property, so the expression is `undefined`
    // (falsy, no ReferenceError) and falls through to `typeof window`,
    // which is the actual runtime predicate doing the work in every
    // environment this executes in: true under real Node SSR (no
    // `window`), false in real browsers, and false in Vitest+happy-dom
    // (which does provide a `window`) -- confirmed empirically that both
    // checks together still pass the same tests the `typeof window`-only
    // guard did.
    if (import.meta.server || typeof window === 'undefined') return

    // `host` is NOT bound yet when this hook fires. Verified in a real
    // browser: `onMounted` sees `host.value === undefined`, and the very
    // next tick sees it bound -- the stage host is patched in a later flush
    // than this component's own mount, under the page's Suspense boundary.
    //
    // Without this await the guard below returned on EVERY page load and
    // the renderer was never constructed, silently: an early return sets
    // neither `ready` nor `loadError`, so the stage showed no canvas, no
    // spinner and no error message. Every 3D test on this branch mocks
    // copper3d and passes the host element in directly, so not one of them
    // could see it. Only a real browser could.
    await nextTick()
    if (cancelled || !host.value) return

    let mod: CopperModule
    let built: CopperRenderer
    try {
      // copper3d touches window/document, so it must be dynamically
      // imported on the client only. Construction is inside the same
      // try/catch (round-2 review fix #1): `new WebGLRenderer` throws
      // whenever WebGL is unavailable (GPU blocklist, WebGL disabled, the
      // ~16-context browser budget already exhausted), and
      // `baseRenderer`'s constructor also calls
      // `PMREMGenerator.compileEquirectangularShader()`, another throw
      // site -- both would otherwise leave `ready` false and `loadError`
      // unset forever, the exact permanently-blank-stage-plus-unhandled-
      // rejection state fix #7 existed to eliminate.
      //
      // Nothing this call site can reach needs disposing on that path, but
      // that is not the same as nothing existing: if `new WebGLRenderer`
      // succeeds and the later `compileEquirectangularShader()` throws, a
      // live GPU context was already created and assigned to the instance
      // `new` then discards. JS gives no access to a constructor's `this`
      // after it throws, so that context is unreachable and released only
      // by GC -- an upstream constraint, not something fixable here.
      mod = await importCopper3d()
      // The component may have unmounted while that chunk was still
      // downloading -- see `cancelled`'s comment above. Checking before
      // ever calling `new` means no renderer, and therefore no GPU
      // context, is built at all in that case; there is nothing to
      // dispose because nothing was constructed.
      if (cancelled || !host.value) return
      built = new mod.copperRendererOnDemond(host.value as HTMLDivElement, {
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
    }
    catch (err) {
      // Covers both the dynamic import rejecting (fix #7, original round)
      // and the constructor throwing (fix #1, this round).
      if (!cancelled) loadError.value = err instanceof Error ? err : new Error(String(err))
      return
    }
    // No repeat `cancelled`/`host.value` check here: nothing in this
    // function awaits between the check just before `new` above and this
    // line, so neither can have changed since.

    Copper.value = mod
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
      // Round-2 review fix #4: a hidden (display:none) or momentarily
      // zero-width/height container -- e.g. a collapsing panel mid-
      // transition -- makes onRenderCameraChange's aspect = width/height
      // compute 0/0 = NaN, corrupting the camera's projection matrix.
      // Bail before touching the scene at all in that case.
      if (!host.value) return
      const { width, height } = host.value.getBoundingClientRect()
      if (width === 0 || height === 0) return
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
