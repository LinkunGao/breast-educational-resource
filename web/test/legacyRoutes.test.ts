import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { enabledCases } from '../content/cases'
import { LEGACY_ROUTES, LEGACY_ROUTES_SERVED_DIRECTLY } from '../content/legacyRoutes'

/** Parse the old nuxt.config.js's `generate.routes` array directly, rather
 *  than hand-copying the same ten paths into a second literal here: two
 *  copies written in the same commit would go wrong together and this test
 *  would still pass. Comparing against the actual legacy source catches a
 *  mistyped or dropped path the way a second copy cannot.
 *  The file was frontend/nuxt.config.js until Task 12 deleted the Nuxt 2 app;
 *  it is kept verbatim under legacy/ for exactly this comparison, and must
 *  not be edited (see legacy/README.md).
 *  Note: cannot use `new URL('../../legacy/...', import.meta.url)` --
 *  Vite's import-analysis plugin statically rewrites that literal pattern
 *  into an asset URL, so the path has to be built by hand with node:path
 *  instead (see web/test/tokens.test.ts and web/test/cases.test.ts).
 */
function legacyGenerateRoutes(): string[] {
  const configPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../legacy/nuxt.config.js',
  )
  const src = readFileSync(configPath, 'utf8')
  const routesBlock = src.match(/routes:\s*\[([\s\S]*?)\]/)
  if (!routesBlock) {
    throw new Error('Could not find generate.routes in legacy/nuxt.config.js')
  }
  return [...routesBlock[1]!.matchAll(/"([^"]+)"/g)].map(m => m[1]!)
}

describe('legacy route table (design doc §4.5)', () => {
  /**
   * Every legacy path must still resolve -- but not all of them by
   * REDIRECTING. Case pages moved from `/case/<slug>` to `/<slug>`, so five
   * of the ten legacy paths are now the real route's own path and a redirect
   * entry for them would point at itself. Those five are declared in
   * `LEGACY_ROUTES_SERVED_DIRECTLY`, and the two lists together must still
   * account for exactly what the old site generated.
   */
  it('accounts for exactly the routes in the legacy nuxt.config.js generate.routes', () => {
    const covered = [...Object.keys(LEGACY_ROUTES), ...LEGACY_ROUTES_SERVED_DIRECTLY]
    expect(covered.sort()).toEqual(legacyGenerateRoutes().sort())
  })

  it('no legacy path is both redirected and served directly', () => {
    for (const path of LEGACY_ROUTES_SERVED_DIRECTLY) {
      expect(Object.keys(LEGACY_ROUTES)).not.toContain(path)
    }
  })

  it('every redirect target resolves to an enabled case, and is not a self-loop', () => {
    const slugs = new Set(enabledCases().map(c => c.slug))
    for (const [from, target] of Object.entries(LEGACY_ROUTES)) {
      expect(slugs.has(target.replace(/^\//, ''))).toBe(true)
      expect(target).not.toBe(from)
    }
  })

  it('every directly-served legacy path is an enabled case slug', () => {
    const slugs = new Set(enabledCases().map(c => c.slug))
    for (const path of LEGACY_ROUTES_SERVED_DIRECTLY) {
      expect(slugs.has(path.replace(/^\//, ''))).toBe(true)
    }
  })
})
