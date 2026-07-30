import type { Case, ModalityId } from '~~/content/types'
import type { Ref } from 'vue'

/**
 * Design doc §9.2: warm the HTTP cache with the NEXT modality's asset while
 * the reader is looking at the current one.
 *
 * ## Why this can work at all
 *
 * The premise is that a plain `fetch()` populates the same HTTP cache the
 * real load reads from -- and the real load does NOT use `fetch`. copper3d
 * pulls NRRD volumes with its own `XMLHttpRequest` (`copperNrrdLoader`), and
 * anatomy models go through three's `FileLoader`, also XHR. Those are three
 * different clients of one shared cache, which is fine in principle: the
 * cache is keyed by URL and request mode, not by the API that asked.
 *
 * It is NOT fine on assumption. `test-browser/prefetch.spec.ts` measures it
 * with CDP, counting how many responses for the asset actually came off the
 * network rather than out of the disk cache. Do not change the request shape
 * below -- the method, the mode, the credentials -- without re-running that
 * test: a mismatch on any of them gives a cache MISS and the prefetch
 * silently becomes pure waste, downloading up to 53MB twice.
 *
 * ## When it does NOT run
 *
 * The volumes here are large. Prefetching one over a metered connection is a
 * real cost to a real person, so this respects `Save-Data` and backs off on
 * slow connections. Both come from the Network Information API, which Safari
 * and Firefox do not implement -- absent means "no reason not to", which is
 * the right default for the desktop browsers that lack it.
 */

/** Anything at or below this is treated as too slow to spend a volume on. */
const SLOW_CONNECTIONS = new Set(['slow-2g', '2g', '3g'])

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

export function shouldPrefetch(connection: NetworkInformation | undefined): boolean {
  if (!connection) return true
  if (connection.saveData) return false
  return !SLOW_CONNECTIONS.has(connection.effectiveType ?? '')
}

/**
 * The modality after `current` in this case's own order, or undefined at the
 * end of the list.
 *
 * Deliberately only ONE ahead. The stepper is a linear sequence and the next
 * step is the only one a reader is likely to take next; fetching the whole
 * case would mean up to ~100MB for a payoff on one of them.
 */
export function nextModalityAsset(c: Case, current: ModalityId): string | undefined {
  const at = c.modalities.findIndex(m => m.id === current)
  if (at === -1) return undefined
  return c.modalities[at + 1]?.asset
}

export function usePrefetchNextModality(
  currentCase: Ref<Case | undefined>,
  modalityId: Ref<ModalityId>,
  /** True once the modality on screen has finished loading. Prefetching
   * before that competes with the download the reader is actually waiting
   * on, over the same connection. */
  ready: Ref<boolean>,
) {
  if (import.meta.server) return

  const { url } = useAssetUrl()
  /** URLs already requested this session, so a back-and-forth on the stepper
   * does not re-issue the same fetch. The browser cache would absorb it, but
   * an in-flight duplicate would not. */
  const requested = new Set<string>()
  let inFlight: AbortController | undefined

  watchEffect((onCleanup) => {
    if (!ready.value) return
    const c = currentCase.value
    if (!c) return

    const asset = nextModalityAsset(c, modalityId.value)
    if (!asset) return

    const href = url(asset)
    if (requested.has(href)) return

    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
    if (!shouldPrefetch(connection)) return

    requested.add(href)
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    // No `no-cors`, no custom headers, no credentials override: the request
    // has to match what copper3d's XHR will send closely enough to hit the
    // same cache entry. See this file's header.
    void fetch(href, { signal: controller.signal })
      .then(response => response.arrayBuffer())
      .catch(() => {
        // A failed or aborted warm-up is not an error the reader should ever
        // hear about -- the real load will make its own request and report
        // its own failure. Drop it from `requested` so a later visit retries.
        requested.delete(href)
      })

    onCleanup(() => controller.abort())
  })

  onScopeDispose(() => inFlight?.abort())
}
