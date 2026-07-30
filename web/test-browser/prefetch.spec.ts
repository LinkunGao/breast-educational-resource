import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Does §9.2's prefetch actually save the download, or just double it?
 *
 * This is the question controller correction C9 refused to let anyone answer
 * by assumption, and it is a fair question: the warm-up is a `fetch`, while
 * the real load is copper3d's own `XMLHttpRequest`. Two different clients of
 * one HTTP cache. If they disagree on anything the cache keys on, the volume
 * is fetched twice and a reader on mobile data pays for it twice.
 *
 * So this counts, over CDP, how many responses for the asset came off the
 * NETWORK rather than out of the disk cache. `page.on('request')` cannot
 * answer that -- it fires identically either way -- and `page.route()` is
 * worse than useless here, because intercepting a request disables the cache
 * the test exists to observe.
 */

const CASE = '/density-d'
/** density-4's mammogram: the modality after Anatomy in this case's order,
 * and therefore what the prefetch should reach for while Anatomy is on
 * screen. */
const NEXT_ASSET = 'density-4/middle/m3d.nrrd'

interface Fetches {
  /** Responses that actually crossed the network. */
  network: number
  /** Responses served out of the disk cache. */
  cached: number
}

/**
 * Watches CDP for every response to one URL fragment, split by whether it
 * crossed the network.
 *
 * TWO events, not one, and the second is the one that matters here. A
 * DISK-cache hit arrives as `responseReceived` with `fromDiskCache: true`; a
 * MEMORY-cache hit does not produce a `responseReceived` at all -- it fires
 * `requestServedFromCache` and nothing else. Watching only the former
 * reported "the real load produced no cached response", which read like the
 * prefetch had failed when in fact it had worked perfectly and the entry was
 * still hot in memory.
 */
async function watchFetches(page: Page, fragment: string): Promise<Fetches> {
  const counts: Fetches = { network: 0, cached: 0 }
  const urlByRequest = new Map<string, string>()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')

  cdp.on('Network.requestWillBeSent', (event) => {
    urlByRequest.set(event.requestId, event.request.url)
  })
  cdp.on('Network.requestServedFromCache', (event) => {
    if (urlByRequest.get(event.requestId)?.includes(fragment)) counts.cached++
  })
  cdp.on('Network.responseReceived', (event) => {
    if (!event.response.url.includes(fragment)) return
    const cached = event.response.fromDiskCache || (event.response as { fromPrefetchCache?: boolean }).fromPrefetchCache
    if (cached) counts.cached++
    else counts.network++
  })
  return counts
}

/** Resolved once the stage has finished loading whatever it is showing. */
async function waitForStage(page: Page) {
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
  const loading = page.getByRole('status').filter({ hasText: /^Loading/ })
  await expect(loading).toBeHidden({ timeout: 150_000 })
}

test.describe('§9.2 next-modality prefetch', () => {
  test('warms the next modality, and the real load reads it out of cache', async ({ page }) => {
    const fetches = await watchFetches(page, NEXT_ASSET)

    await page.goto(CASE)
    await waitForStage(page)

    // The prefetch is gated on the current modality being ready, so it
    // starts after the stage settles. Give it room to finish: this is a
    // 10MB volume over localhost.
    await expect.poll(() => fetches.network, { timeout: 120_000 }).toBe(1)
    expect(fetches.cached, 'nothing should have been cached before the first fetch').toBe(0)

    // Now actually go there. If the warm-up landed in a cache entry the
    // XHR can use, this adds a CACHED response and no network one.
    await page.getByRole('link', { name: /3D Mammogram/i }).click()
    await waitForStage(page)

    expect(
      fetches.network,
      'the real load re-downloaded the volume: the prefetch is not hitting the same cache entry, '
      + 'and is costing the reader the asset twice rather than saving it',
    ).toBe(1)
    expect(fetches.cached, 'the real load produced no cached response at all').toBeGreaterThanOrEqual(1)
  })

  test('does not prefetch past the end of a case', async ({ page }) => {
    // The last modality has nothing after it. A prefetch that wrapped around
    // or fetched the current asset again would show up as traffic here.
    const fetches = await watchFetches(page, 'density-4/')

    await page.goto(`${CASE}/mri`)
    await waitForStage(page)
    const afterLoad = fetches.network + fetches.cached
    await page.waitForTimeout(8000)

    expect(fetches.network + fetches.cached).toBe(afterLoad)
  })
})
