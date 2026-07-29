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

  let continuousHolders = 0
  let rafId: number | null = null

  function tick() {
    renderer.value?.render()
    rafId = requestAnimationFrame(tick)
  }

  /** Call when an animation starts. Re-entrant: concurrent animations still
   * share a single rAF loop. */
  function requestContinuous() {
    continuousHolders++
    if (rafId === null) rafId = requestAnimationFrame(tick)
  }

  /** Call when an animation ends. Frames stop once the count returns to 0. */
  function releaseContinuous() {
    continuousHolders = Math.max(0, continuousHolders - 1)
    if (continuousHolders === 0 && rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
      // One more render on the way back to on-demand, so the view settles
      // on its final state rather than whatever the last rAF frame drew.
      renderer.value?.render()
    }
  }

  onMounted(async () => {
    // Belt-and-braces: onMounted itself never runs during SSR (Vue skips
    // it in renderToString, which is what both `nuxi dev`'s SSR pass and
    // `nuxi generate`'s prerender use), so this callback -- and the
    // dynamic import below -- can never execute on the server. This guard
    // makes that explicit rather than relying solely on onMounted's
    // semantics, per this task's SSR ruling.
    if (!import.meta.client) return
    if (!host.value) return

    // copper3d touches window/document, so it must be dynamically imported
    // on the client only.
    const mod = (await import('copper3d')) as unknown as CopperModule
    Copper.value = mod
    renderer.value = new mod.copperRendererOnDemond(host.value as HTMLDivElement, {
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
    ready.value = true
  })

  onScopeDispose(() => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    continuousHolders = 0
    renderer.value?.stop?.()
    renderer.value?.dispose?.()
    renderer.value = undefined
    ready.value = false
  })

  return { renderer, Copper, ready, requestContinuous, releaseContinuous }
}
