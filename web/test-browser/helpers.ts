import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Shared locators for a page that mounts three stages at once.
 *
 * Every spec here used to do `expect(page.locator('canvas')).toHaveCount(1)`.
 * Three-up mounts all three panels at every width -- that is what stops a
 * panel reloading when the reader comes back to it -- so there are always
 * three canvases and three WebGL contexts. Measured, not assumed: see
 * `one live context per panel` in acceptance.spec.ts.
 */

/** The panel the URL's modality lives in: the one shown at one-up, ringed
 *  at three-up. Exactly one carries `data-focused="true"`. */
export function focusedPanel(page: Page): Locator {
  return page.locator('[data-panel][data-focused="true"]')
}

/** The focused panel's stage host -- the focusable div copper3d draws into. */
export function focusedStage(page: Page): Locator {
  return focusedPanel(page).getByRole('application')
}

export function panel(page: Page, id: 'anatomy' | 'mammogram' | 'mri'): Locator {
  return page.locator(`[data-panel="${id}"]`)
}

/**
 * Waits for the FOCUSED panel to finish loading, then fails loudly on the
 * two ways the app reports giving up.
 *
 * Scoped to that panel on purpose. At three-up the other two load their own
 * assets on their own schedule, and waiting on all three would make every
 * test pay for two volumes it does not assert anything about.
 */
export async function waitForModality(page: Page) {
  const stage = focusedPanel(page)
  // The canvas, not the spinner, is the readiness signal to wait on FIRST:
  // the spinner only appears once `stage.ready` flips, so "spinner hidden"
  // is trivially true before loading has started.
  await expect(stage.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
  // Scoped to the spinner's own text: the slice readout is also a
  // `role="status"` live region once an imaging modality has loaded.
  await expect(stage.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })
  await expect(stage.getByRole('alert')).toHaveCount(0)
}

/** Waits for every visible panel, for the tests that assert across all
 *  three (three-up, and the no-404 sweep). */
export async function waitForAllPanels(page: Page) {
  await expect(page.locator('[data-panel] canvas')).toHaveCount(3, { timeout: 60_000 })
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
    .toHaveCount(0, { timeout: 240_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
}
