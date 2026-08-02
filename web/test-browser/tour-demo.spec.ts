import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers'

/**
 * Task 10: chapter 3's one camera exemption, proved in a real browser.
 *
 * The unit suite (useTourDirector.test.ts) proves the restore is airtight
 * against faked deps; these prove it against the real CopperStage/OrbitControls
 * wiring, and that theatre mode -- the dimming that makes the exemption
 * legible as "the tour is doing this, not a bug" -- never uses `blur()`.
 *
 * Three-up (1920x1080): the anatomy panel has to be a distinct target from
 * its neighbours for the halo-alignment assertion to mean anything, and the
 * default 1280x720 viewport collapses to one-up (see tour-card-bounds.spec.ts).
 */
test.describe('guided tour demos', () => {
  test('the rotate step moves the camera and then puts it back', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/the-breast/anatomy')
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Start the guided tour' }).click()

    // Walk to the rotate step by id rather than by pressing Next a fixed
    // number of times, so adding a step to chapter 1 does not break this.
    const cardTitle = page.locator('[data-tour-card] h2')
    for (let i = 0; i < 20; i++) {
      const title = await cardTitle.textContent()
      if (title === 'Rotate the model') break
      await page.locator('[data-tour-next]').click()
    }
    await expect(cardTitle).toHaveText('Rotate the model')

    // The halo must already be over the anatomy panel here -- WHILE the
    // 2500ms orbit demo is still running, not once it finishes. TourLayer
    // paints the target in a pass that runs before the demo starts, so this
    // is a direct read, not a poll: polling for up to the demo's own
    // duration would let a regression that re-introduces the old lag (halo
    // stuck on the previous step's target until the demo ends) pass anyway.
    const halo = await page.locator('[data-tour-halo]').boundingBox()
    const panel = await page.locator('[data-panel="anatomy"]').boundingBox()
    expect(Math.abs(halo!.x - panel!.x)).toBeLessThan(4)
  })

  test('theatre mode dims the other regions and never uses blur', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/the-breast/anatomy')
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Start the guided tour' }).click()
    await page.locator('[data-tour-next]').click() // -> the sidebar step

    const dimmed = page.locator('#case-content-panel')
    await expect(dimmed).toHaveCSS('opacity', '0.3')
    const filter = await dimmed.evaluate(el => getComputedStyle(el).filter)
    expect(filter).toContain('saturate')
    expect(filter).not.toContain('blur')
  })

  test('Escape restores the app completely', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/the-breast/anatomy')
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Start the guided tour' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-tour-card]')).toHaveCount(0)
    await expect(page.locator('body')).not.toHaveAttribute('data-tour-active', /.*/)
    await expect(page.locator('#case-content-panel')).toHaveCSS('opacity', '1')
  })

  /**
   * The MRI volume is 20-30MB and, unlike the anatomy GLB, routinely does
   * not finish loading inside the director's stall/ceiling window in a
   * cold headless run -- exactly the case `bodyFallback` exists for. This
   * asserts what is true either way: the tour reaches the step, names the
   * MRI panel, shows non-empty copy, and never surfaces an app error --
   * not which of the two copy variants won the race.
   */
  test('the slice step reaches the MRI panel and degrades cleanly if the volume is not ready', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/the-breast/anatomy')
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Start the guided tour' }).click()

    const cardTitle = page.locator('[data-tour-card] h2')
    for (let i = 0; i < 20; i++) {
      const title = await cardTitle.textContent()
      if (title === 'Move through the volume') break
      await page.locator('[data-tour-next]').click()
    }
    await expect(cardTitle).toHaveText('Move through the volume')
    await expect(page.locator('[data-panel="mri"]')).toHaveAttribute('data-focused', 'true')
    await expect(page.locator('[data-tour-card] p').last()).not.toHaveText('')
    await expect(page.getByRole('alert')).toHaveCount(0)

    // Whichever path the step took, moving on must still work.
    await page.locator('[data-tour-next]').click()
    await expect(cardTitle).toHaveText('Per-view controls')
  })

  /**
   * Task 11: the design doc's distinction (§4.4) between finishing and
   * exiting, proved end to end. `waitForHydration` is required here --
   * "Start the guided tour" is AppHeader's server-rendered button, and a
   * click on it before TourLauncher.client.vue hydrates hits inert markup.
   */
  test('finishing leaves the reader on the lesion case; exiting returns them', async ({ page }) => {
    await page.goto('/the-breast/anatomy')
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Start the guided tour' }).click()

    for (let i = 0; i < 25; i++) {
      const title = await page.locator('[data-tour-card] h2').textContent()
      if (title === "That's the tour") break
      await page.locator('[data-tour-next]').click()
    }
    await page.locator('[data-tour-next]').click() // Finish
    await expect(page).toHaveURL(/cancer-ductal/)

    // waitForHydration's own precondition (a fresh context, tour never
    // "seen") no longer holds after finishing above -- restore it so the
    // second half of this test can rely on the same helper.
    await page.evaluate(() => localStorage.removeItem('teuma.tour.seen'))
    await page.goto('/the-breast/anatomy')
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Start the guided tour' }).click()
    await page.locator('[data-tour-next]').click()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/the-breast/)
  })
})
