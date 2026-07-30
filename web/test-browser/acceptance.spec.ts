import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { enabledCases } from '../content/cases'

/**
 * Design doc §12's acceptance criteria, for the ones a browser can settle.
 *
 * These were queued as manual checklist items across Tasks 1-10 on the
 * grounds that "no Playwright/Puppeteer in this project". There is now, and
 * controller correction C5 is explicit that anything automatable must be
 * automated rather than written down: on this branch four blocking 3D
 * defects passed straight through 389 unit tests, and every one of them
 * would have been a tick on a checklist nobody ran.
 *
 * Each test names the §12 item it discharges. What is NOT here -- the
 * crossfade reading as a dissolve, orbit feel, screen-reader announcements --
 * is in docs/browser-pass-checklist.md, which is the residue after
 * automation, not the plan.
 */

/** Waits until the stage has finished loading whatever it is showing. */
async function waitForModality(page: Page) {
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
}

/**
 * GPU draw calls issued over `ms`, by wrapping the live context's own draw
 * entry points.
 *
 * This is the measurement that distinguishes "animating" from "idle" on this
 * app, and it had to replace two weaker ones. Counting rAF callbacks proves
 * nothing: the counting loop itself keeps rAF alive. Screenshot diffing
 * cannot see a camera that is moving but re-rendering identical pixels.
 * Draw calls are what the on-demand renderer actually withholds.
 */
async function countDraws(page: Page, ms: number): Promise<number> {
  return page.evaluate(duration => new Promise<number>((resolve) => {
    const canvas = document.querySelector('canvas')!
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext
    let draws = 0
    const realElements = gl.drawElements.bind(gl)
    const realArrays = gl.drawArrays.bind(gl)
    gl.drawElements = ((...a: Parameters<WebGLRenderingContext['drawElements']>) => {
      draws++
      return realElements(...a)
    }) as WebGLRenderingContext['drawElements']
    gl.drawArrays = ((...a: Parameters<WebGLRenderingContext['drawArrays']>) => {
      draws++
      return realArrays(...a)
    }) as WebGLRenderingContext['drawArrays']
    setTimeout(() => {
      gl.drawElements = realElements
      gl.drawArrays = realArrays
      resolve(draws)
    }, duration)
  }), ms)
}

test.describe('§12 acceptance', () => {
  test('items 2 and 3: no 404s, and no request for a placeholder asset', async ({ page }) => {
    // Item 2 -- zero 404 asset requests. Item 3 -- `m2d.nrrd` is never
    // requested at all, and `u2d.nrrd` only ever for benign-cyst, the one
    // case whose ultrasound is not a copy of another case's (design doc
    // §3.1). A request for either from anywhere else means the catalogue
    // and the assets have drifted apart.
    const notFound: string[] = []
    const placeholders: string[] = []
    page.on('response', (r) => {
      if (r.status() === 404) notFound.push(`${r.status()} ${r.url()}`)
    })
    page.on('request', (r) => {
      const u = r.url()
      if (u.includes('m2d.nrrd')) placeholders.push(u)
      if (u.includes('u2d.nrrd') && !u.includes('benign-cyst')) placeholders.push(u)
    })

    // One case from each shape: the morph family, and a lesion case whose
    // ultrasound modality is the legitimate one.
    for (const path of ['/density-d/anatomy', '/density-d/mammogram', '/benign-cyst/ultrasound']) {
      await page.goto(path)
      await waitForModality(page)
    }

    expect(notFound, 'requests that 404ed').toEqual([])
    expect(placeholders, 'requests for a placeholder volume design doc §3.1 retired').toEqual([])
  })

  test('items 5 and 6: exactly one WebGL context, and it stops drawing when idle', async ({ page }) => {
    await page.goto('/density-d/mammogram')
    await waitForModality(page)

    // Item 5. Counting canvases is the proxy the unit tests already make;
    // this asks each canvas whether it actually holds a live GL context, so
    // a second offscreen renderer could not hide behind a single <canvas>.
    const contexts = await page.evaluate(() =>
      [...document.querySelectorAll('canvas')]
        .filter(c => c.getContext('webgl2') ?? c.getContext('webgl')).length,
    )
    expect(contexts, 'design doc §12 item 5: exactly one WebGL context').toBe(1)

    // Item 6. On-demand rendering (design doc §8.1). Counting rAF ticks
    // would prove nothing -- the test's own loop keeps rAF alive whatever
    // the app does -- so this counts GPU draw calls instead, which is the
    // work `copperRendererOnDemond` exists to stop issuing. Both entry
    // points are hooked: the slice planes and the bounding box are indexed
    // (`drawElements`), but a future non-indexed geometry would come
    // through `drawArrays` and must not slip past.
    await page.waitForTimeout(3000) // let the load's own lease drain
    const draws = await countDraws(page, 3000)
    expect(draws, 'design doc §12 item 6: the renderer kept drawing while idle').toBe(0)
  })

  test('item 7 (asset half): the-breast first screen pulls one GLB and no volume', async ({ page }) => {
    // §12 item 7's full budget is a PRODUCTION number and is asserted in
    // production.spec.ts. It cannot be measured here: the dev server ships
    // Vite's unbundled modules, so the same page costs 24MB of which 15MB
    // is copper3d.js and three.module.js served raw. Measured, not assumed.
    //
    // What IS meaningful against the dev server is the asset side, because
    // the dev server serves public/ exactly as production does: `the-breast`
    // must pull its one Draco GLB and no NRRD at all (design doc §9.2's
    // third row). That is the half a code change would actually break --
    // wiring the entry point to a volume by accident.
    const assets = new Map<string, number>()
    page.on('response', (r) => {
      if (!r.url().includes('/modelView/')) return
      assets.set(r.url(), Number(r.headers()['content-length'] ?? 0))
    })

    await page.goto('/the-breast')
    await waitForModality(page)

    const paths = [...assets.keys()].map(u => u.replace(/^https?:\/\/[^/]+/, ''))
    const total = [...assets.values()].reduce((a, b) => a + b, 0)
    console.log(`the-breast first-screen assets: ${(total / 1048576).toFixed(2)} MB -> ${paths.join(', ')}`)

    expect(paths.filter(p => p.endsWith('.nrrd')), 'no volume on the entry point').toEqual([])
    expect(paths.filter(p => p.endsWith('.glb')), 'exactly one anatomy model').toHaveLength(1)
    expect(total, 'the entry point\'s assets alone should be well under 3MB').toBeLessThan(3 * 1024 * 1024)
  })

  test('item 11: no horizontal scroll at any of the four widths', async ({ page }) => {
    // 375 / 834 / 1440 / 1920, the widths §12 item 11 names. A horizontal
    // scrollbar on a teaching page is the classic symptom of a fixed
    // min-width leaking through a responsive tier, and it is exactly what
    // the tier work in Tasks 5 and 10 could regress without any unit test
    // noticing -- happy-dom has no layout.
    await page.goto('/density-d/mammogram')
    await waitForModality(page)

    for (const width of [375, 834, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      // Let the CSS tiers settle; the panels carry 200ms transitions.
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        widest: [...document.querySelectorAll('*')]
          .map(el => ({ tag: el.tagName + (el.id ? `#${el.id}` : ''), right: el.getBoundingClientRect().right }))
          .filter(x => x.right > document.documentElement.clientWidth + 1)
          .slice(0, 5),
      }))
      expect(
        overflow.scrollWidth,
        `design doc §12 item 11: horizontal scroll at ${width}px, overflowing elements: `
        + JSON.stringify(overflow.widest),
      ).toBeLessThanOrEqual(overflow.clientWidth)
    }
  })

  /**
   * Item 12, as a DIFFERENTIAL: the same navigation, run twice, once with
   * `prefers-reduced-motion: reduce` and once without.
   *
   * Asserting "no motion under reduced motion" on its own would be a test
   * that cannot fail. Commit 1e7671f removed camera animation entirely at
   * the human's request -- no entrance orbit, no inter-modality flight, no
   * locate-lesion push-in -- so on a plain modality change nothing moves in
   * either condition and a one-sided assertion passes for the wrong reason.
   *
   * What survives that ruling, and is therefore the whole of §12 item 12's
   * remaining surface, is §7.1's density crossfade. It runs through
   * `useCameraChoreography.animate`, which collapses to a single `t = 1`
   * call when reduced motion is set. So the control leg is load-bearing:
   * it proves the animated path is real, which is what makes the reduced
   * leg's zero mean something.
   */
  test('item 12: the density crossfade animates, and reduced motion collapses it', async ({ page }) => {
    async function morphDraws(reduce: boolean) {
      await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' })
      await page.goto('/density-a/anatomy')
      await waitForModality(page)
      await page.waitForTimeout(2500) // let the load's own lease drain

      // Same-family navigation -> `chooseTransition` returns 'density-morph'
      // and the two models crossfade over MORPH_MS inside ONE renderer.
      const counting = countDraws(page, 2500)
      await page.locator('a[href="/density-b"]').first().click()
      return counting
    }

    const animated = await morphDraws(false)
    const reduced = await morphDraws(true)
    console.log(`density crossfade draw calls -- animated: ${animated}, reduced-motion: ${reduced}`)

    expect(
      animated,
      'the crossfade did not animate even with motion allowed, so the reduced-motion '
      + 'assertion below would pass for the wrong reason',
    ).toBeGreaterThan(10)
    expect(
      reduced,
      'design doc §12 item 12: the crossfade still animated under prefers-reduced-motion',
    ).toBeLessThan(animated / 4)
  })

  test('items 1 and 15: every enabled case and every legacy URL resolves', async ({ page }) => {
    // Item 1 -- all ten enabled cases reachable with exactly §4.3's modality
    // sequence. Item 15 -- all ten legacy URLs land on the right new page.
    // Both are checked against the catalogue rather than a hand-written
    // list, so a case added to content/cases.ts is covered without editing
    // this test. Navigation only: no modality is loaded, which keeps this
    // to seconds rather than the ten minutes a full asset walk would cost.
    const cases = enabledCases()
    expect(cases.length, 'design doc §12 item 1: ten enabled cases').toBe(10)

    for (const c of cases) {
      await page.goto(`/${c.slug}`)
      const stepper = page.getByRole('list', { name: 'Imaging modalities' })
      // Wait for the stepper to be rendered before reading it. `goto` alone
      // resolves on the document, not on hydration, and reading too early
      // returned an empty list that looked like a missing modality.
      await expect(stepper.getByRole('link').first()).toBeVisible({ timeout: 30_000 })
      // The stepper renders one link per modality, in sequence order.
      const got = (await stepper.getByRole('link').allInnerTexts())
        .map(t => t.replace(/\s+/g, ' ').trim())
      for (const m of c.modalities) {
        expect(got.join(' | '), `${c.slug} is missing its ${m.id} step`).toContain(m.label)
      }
      expect(got.length, `${c.slug} has the wrong number of steps`).toBe(c.modalities.length)
    }

    const LEGACY: Record<string, string> = {
      '/model-breast': '/the-breast',
      '/density-1': '/density-a',
      '/density-2': '/density-b',
      '/density-3': '/density-c',
      '/density-4': '/density-d',
      // The other five legacy paths are unchanged by the rebuild and are
      // served directly by the real route (content/legacyRoutes.ts).
      '/benign-cyst': '/benign-cyst',
      '/benign-fibroadenoma': '/benign-fibroadenoma',
      '/cancer-dcis': '/cancer-dcis',
      '/cancer-lobular': '/cancer-lobular',
      '/cancer-ductal': '/cancer-ductal',
    }
    for (const [from, to] of Object.entries(LEGACY)) {
      await page.goto(from)
      await expect(page).toHaveURL(new RegExp(`${to}(/|$)`), { timeout: 20_000 })
    }
  })
})
