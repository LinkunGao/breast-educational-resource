import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Design doc §12 item 10: zero `serious` or `critical` axe violations.
 *
 * These run as tests rather than as a console tool (controller correction
 * C6) so a regression fails a run. The brief originally reached for
 * `@axe-core/cli`, which drives its own Chrome and races an unmanaged
 * `yarn dev &`; Playwright already owns both a browser and the server
 * lifecycle.
 *
 * ## Scanned AFTER the modality has loaded, never before
 *
 * The stage spends the first several seconds of a case page showing a
 * spinner, and the control bar's buttons are disabled until the renderer
 * exists. Scanning that state would audit a page no reader ever settles on
 * and would miss the enabled controls entirely -- which is where colour
 * contrast and accessible names actually have to hold up.
 *
 * ## Impact levels are reported, not just the failing ones
 *
 * `moderate`/`minor` findings are printed for the record but do not fail:
 * §12 sets the bar at serious/critical, and silently swallowing the rest
 * would make the number in the report unverifiable.
 */

/**
 * Waits until the stage has finished loading AND the renderer exists.
 *
 * The control bar's Reset button is disabled until `actions` is published,
 * which happens only after the async renderer build completes -- so waiting
 * on it is the strongest available proof that the scan below is auditing a
 * settled page rather than a spinner. It also puts the bar's ENABLED colours
 * under the contrast rules, which is the state that has to hold up and the
 * one a scan run too early would never see.
 */
async function waitForModality(page: Page) {
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })
  await expect(page.getByRole('button', { name: /reset/i })).toBeEnabled({ timeout: 60_000 })
}

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    // The @nuxt/devtools overlay, and nothing else. It is injected by the
    // dev server these tests run against and is not part of the shipped
    // page: `devtools` appears once in the dev HTML for /density-a and zero
    // times in .output/public/density-a/index.html from `nuxi generate`.
    // Left in, it contributes a `region` violation that belongs to Nuxt's
    // tooling rather than to this app, and would sit in the report forever
    // as a finding nobody can act on.
    .exclude('nuxt-devtools-frame')
    .analyze()

  const byImpact = (level: string) => results.violations.filter(v => v.impact === level)
  const blocking = [...byImpact('critical'), ...byImpact('serious')]

  const summary = results.violations.map(v =>
    `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n`
    + v.nodes.slice(0, 3).map(n => `      ${n.target.join(' ')}`).join('\n'),
  ).join('\n')

  console.log(
    `axe ${label}: ${results.violations.length} violation(s) total; `
    + `${blocking.length} serious/critical; ${results.passes.length} checks passed`
    + (summary ? `\n${summary}` : ''),
  )

  expect(
    blocking.map(v => `${v.impact}/${v.id} on ${v.nodes.map(n => n.target.join(' ')).join(', ')}`),
    `design doc §12 item 10 requires zero serious/critical violations on ${label}`,
  ).toEqual([])
}

test.describe('§12.10 axe-core', () => {
  test('case page, anatomy modality', async ({ page }) => {
    // density-a's anatomy is the light-backdrop GLB path, and the only
    // modality where the stage backdrop is not the dark film box -- a
    // different set of foreground/background pairs for the contrast rules.
    await page.goto('/density-a/anatomy')
    await waitForModality(page)
    await scan(page, '/density-a/anatomy')
  })

  test('case page, imaging modality', async ({ page }) => {
    // density-d's mammogram is the catalogue's smallest volume and puts the
    // slice readout, the scrub control and the dark film backdrop on screen.
    await page.goto('/density-d/mammogram')
    await waitForModality(page)
    await scan(page, '/density-d/mammogram')
  })

  test('case page with the lesion locator, MRI modality', async ({ page }) => {
    // The locate-lesion button only renders on MRI and only for a case with
    // a lesion index, so it is unreachable by either scan above.
    await page.goto('/cancer-ductal/mri')
    await waitForModality(page)
    await scan(page, '/cancer-ductal/mri')
  })

  test('about page', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await scan(page, '/about')
  })

  test('case page with the navigation drawer open, phone width', async ({ page }) => {
    // Below xl the sidebar is a modal drawer with a focus trap and a scrim
    // button. Nothing above ever opens it, so its roles, its accessible
    // names and the scrim's contrast are otherwise never audited.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/density-d/mammogram')
    await waitForModality(page)
    await page.getByRole('button', { name: 'Toggle case navigation' }).click()
    await expect(page.getByRole('button', { name: 'Close case navigation' })).toBeVisible()
    await scan(page, '/density-d/mammogram (drawer open, 375px)')
  })
})

/**
 * Client feedback item 10, measured rather than asserted through class names.
 *
 * The unit test above can only check which element carries `ml-auto`;
 * happy-dom has no layout engine. This is the tier the bug actually
 * appeared on -- an iPad Air, below xl, where the element that used to
 * carry the margin is display:none.
 */
test('About sits at the right edge of the header below xl', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.goto('/the-breast')

  const header = page.locator('header').first()
  const about = page.getByRole('link', { name: 'About' })
  await expect(about).toBeVisible()

  const headerBox = (await header.boundingBox())!
  const aboutBox = (await about.boundingBox())!

  // Right-aligned: the gap between About's right edge and the header's is
  // the header's own px-4 padding (16px), with a little slack for the
  // rounded hit area. If the margin regressed onto an xl-only element,
  // About lands next to the wordmark and this gap is hundreds of pixels.
  const gap = (headerBox.x + headerBox.width) - (aboutBox.x + aboutBox.width)
  expect(gap).toBeLessThan(32)
  expect(gap).toBeGreaterThanOrEqual(0)
})
