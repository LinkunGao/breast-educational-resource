import { expect, test } from '@playwright/test'

/**
 * Client feedback item 1, against a real browser.
 *
 * test/pwa.test.ts asserts the configuration object; this asserts what the
 * browser actually receives -- a reachable manifest, a service worker that
 * registers, and (the one that matters) a precache manifest with no
 * imaging assets in it.
 */

test('the manifest is served with the fields the client\'s old app had', async ({ page }) => {
  await page.goto('/the-breast')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()

  const response = await page.request.get(href!)
  expect(response.ok()).toBe(true)

  const manifest = await response.json()
  expect(manifest.name).toBe('Breast Educational Resource')
  expect(manifest.short_name).toBe('Breast Education App')
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toContain('512x512')
})

test('every icon the manifest declares actually resolves', async ({ page }) => {
  await page.goto('/the-breast')
  const href = (await page.locator('link[rel="manifest"]').getAttribute('href'))!
  const manifest = await (await page.request.get(href)).json()

  for (const icon of manifest.icons as { src: string }[]) {
    const url = new URL(icon.src, new URL(href, page.url())).href
    const response = await page.request.get(url)
    expect(response.ok(), `${icon.src} -> ${response.status()}`).toBe(true)
  }
})

test('the service worker registers', async ({ page }) => {
  await page.goto('/the-breast')
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
    null,
    { timeout: 30_000 },
  )
})

/**
 * The load-bearing assertion of this file. ~355MB of NRRD and GLB must
 * never enter the precache manifest -- see nuxt.config.ts's `pwa` comment.
 */
test('no imaging asset is precached', async ({ page }) => {
  await page.goto('/the-breast')

  const swUrl = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    return registrations[0]?.active?.scriptURL
      ?? registrations[0]?.installing?.scriptURL
      ?? null
  })
  expect(swUrl, 'no service worker script URL').toBeTruthy()

  const source = await (await page.request.get(swUrl!)).text()
  expect(source).not.toMatch(/\.nrrd/)
  expect(source).not.toMatch(/\.glb/)
  expect(source).not.toMatch(/modelView/)
})
