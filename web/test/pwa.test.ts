import { describe, expect, it } from 'vitest'
import config from '../nuxt.config'

/**
 * Client feedback item 1. Asserts the CONFIGURATION rather than a built
 * service worker: a real build takes minutes and pulls 355MB of public
 * assets through the prerenderer, which no unit run should do. The
 * built-artefact side is covered in test-browser/pwa.spec.ts.
 */
const pwa = (config as Record<string, any>).pwa

describe('PWA configuration', () => {
  it('is registered', () => {
    expect((config as Record<string, any>).modules).toContain('@vite-pwa/nuxt')
    expect(pwa).toBeDefined()
  })

  it('carries the legacy app\'s manifest fields verbatim', () => {
    expect(pwa.manifest.name).toBe('Breast Educational Resource')
    expect(pwa.manifest.short_name).toBe('Breast Education App')
    expect(pwa.manifest.description).toBe('An ABI Education App for Breast Cancer.')
    expect(pwa.manifest.theme_color).toBe('#ffffff')
  })

  it('declares the icon sizes Task 4 generated, at the paths it wrote them to', () => {
    const bySrc = Object.fromEntries(
      pwa.manifest.icons.map((i: Record<string, string>) => [i.src, i]),
    )
    expect(bySrc['pwa-192x192.png']?.sizes).toBe('192x192')
    expect(bySrc['pwa-512x512.png']?.sizes).toBe('512x512')
    expect(bySrc['maskable-icon-512x512.png']?.purpose).toBe('maskable')
  })

  /**
   * The load-bearing one. `modelView/` is ~355MB of NRRD and GLB, and
   * Chromium will not store responses that size anyway -- measured on this
   * catalogue, see pages/[slug]/[[modality]].vue's §9.2 correction. They
   * must never enter the precache manifest.
   */
  it('never precaches the imaging assets', () => {
    const globs: string[] = pwa.workbox.globPatterns
    expect(globs.every(g => !g.includes('nrrd'))).toBe(true)
    expect(globs.every(g => !g.includes('glb'))).toBe(true)
    expect(pwa.workbox.globIgnores).toContain('**/modelView/**')
  })

  it('does not precache the draco decoder wasm either', () => {
    // Only needed when a GLB is actually loaded, which is a network path.
    expect(pwa.workbox.globIgnores).toContain('**/draco/**')
  })
})
