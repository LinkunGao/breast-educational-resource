import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

/**
 * The first tests on this branch that actually run copper3d.
 *
 * What each assertion is worth is stated where it is made. The point of
 * being explicit is that these tests are the ONLY evidence the 3D core
 * works at all -- a test here that quietly proves less than it appears to
 * would be worse than no test, because it would retire a risk that is
 * still live.
 */

/** The stage host: a `role="img"` div copper3d appends its canvas into. */
function stage(page: Page): Locator {
  return page.getByRole('img', { name: /viewer$/ })
}

/**
 * Waits for the modality to finish loading, then fails loudly on the two
 * ways the app reports giving up. Without the error check a failed 31MB
 * fetch would look identical to a slow one until the timeout.
 */
async function waitForModality(page: Page) {
  const failed = page.getByRole('alert')
  // Scoped to the spinner's own text on purpose. Once an imaging modality
  // has loaded, Task 10's slice readout is ALSO a `role="status"` live
  // region ("Slice 12 of 24"), so an unscoped role lookup never goes
  // hidden -- an earlier version of this helper timed out against a stage
  // that had in fact loaded perfectly.
  const loading = page.getByRole('status').filter({ hasText: /^Loading/ })

  // The canvas, not the spinner, is the readiness signal to wait on FIRST.
  // Waiting on the spinner alone is a race: the stage host is visible from
  // the first paint and the spinner only appears once `stage.ready` flips,
  // so "spinner is hidden" is trivially true before loading has even
  // started -- an earlier version of this helper returned instantly and
  // made the assertions below check an empty page.
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
  await expect(loading).toBeHidden({ timeout: 150_000 })
  await expect(failed).toHaveCount(0)
}

/**
 * Proves a real WebGL context exists on the canvas copper3d created, by
 * asking the canvas itself rather than by inferring it from the DOM.
 *
 * `getContext` returns the EXISTING context when one has already been
 * created, so this observes copper3d's own context and cannot manufacture
 * a passing result by creating a second one: a canvas that copper3d never
 * initialised returns a fresh context whose `drawingBufferWidth` is the
 * untouched default, which the size assertion below rejects.
 */
async function webglReport(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { present: false as const }
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return { present: true as const, context: null }
    return {
      present: true as const,
      context: {
        version: gl.getParameter(gl.VERSION) as string,
        renderer: gl.getParameter(gl.RENDERER) as string,
        error: gl.getError(),
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
      },
    }
  })
}

/**
 * The fraction of the stage's pixels that differ from its own background.
 *
 * This is the assertion that catches "the stage is there, the asset loaded,
 * and it drew nothing". Two earlier versions of it did not:
 *
 * - PNG byte length. Worthless: the stage carries a CSS gradient
 *   background, so a screenshot of a completely blank stage sailed past
 *   any threshold. It reported the NRRD path as healthy while every
 *   imaging modality in the app rendered solid black.
 * - `drawImage` from the live WebGL canvas. Always zero: without
 *   `preserveDrawingBuffer` the drawing buffer is cleared once composited,
 *   so it reported a stage we had visually confirmed as working as blank.
 *
 * A Playwright element screenshot captures the composited result, which is
 * what a human would see. The reference colour is the stage's own top-left
 * pixel -- background under every modality, since all content is centred --
 * so this works against both the light anatomy backdrop and the dark film
 * one without hard-coding either.
 */
async function drawnFraction(page: Page): Promise<number> {
  const png = PNG.sync.read(await stage(page).screenshot())
  const { data, width, height } = png
  const [br, bg, bb] = [data[0], data[1], data[2]]

  let drawn = 0
  for (let i = 0; i < data.length; i += 4) {
    // Manhattan distance from the background, comfortably above the
    // gradient's own top-to-bottom drift and any SwiftShader dithering.
    if (Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb) > 30) {
      drawn++
    }
  }
  return drawn / (width * height)
}

test.describe('3D stage', () => {
  // Reported rather than asserted: a WebGL warning is normal under
  // SwiftShader, but a copper3d or three error here would explain any
  // failure below far faster than the assertion message would.
  const consoleErrors: string[] = []
  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))
  })

  test('renders the anatomy GLB in a real WebGL context', async ({ page }) => {
    await page.goto('/density-a')
    await waitForModality(page)

    const report = await webglReport(page)
    expect(report.present, 'copper3d appended no canvas to the stage host').toBe(true)
    expect(report.context, 'the canvas has no WebGL context').not.toBeNull()
    expect(report.context!.width).toBeGreaterThan(0)
    expect(report.context!.height).toBeGreaterThan(0)
    expect(report.context!.error, 'WebGL reported an error code').toBe(0)

    expect(await drawnFraction(page), "the stage rendered nothing").toBeGreaterThan(0.01)

    console.log('WebGL:', report.context!.version, '|', report.context!.renderer)
    if (consoleErrors.length) console.log('console errors:', consoleErrors)
  })

  test('decodes and renders an NRRD volume', async ({ page }) => {
    // density-4 carries this catalogue's smallest volume (10.9MB) and is
    // still a full decode-and-upload of the real shipped asset.
    await page.goto('/density-d/mammogram')
    await waitForModality(page)

    const report = await webglReport(page)
    expect(report.context, 'the canvas has no WebGL context').not.toBeNull()
    expect(report.context!.error).toBe(0)
    expect(await drawnFraction(page), "the stage rendered nothing").toBeGreaterThan(0.01)

    if (consoleErrors.length) console.log('console errors:', consoleErrors)
  })

  test('keeps one canvas across a modality switch', async ({ page }) => {
    // Design doc §8.2 -- "switch the scene, not the renderer". A second
    // canvas here means the renderer was rebuilt, which is the leak
    // app.vue's page key exists to prevent.
    await page.goto('/density-d')
    await waitForModality(page)

    await page.getByRole('link', { name: /3D Mammogram/i }).click()
    await waitForModality(page)

    await expect(page.locator('canvas')).toHaveCount(1)
    if (consoleErrors.length) console.log('console errors:', consoleErrors)
  })
})
