import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { enabledCases } from '../content/cases'
import { LEGACY_ROUTES } from '../content/legacyRoutes'

/** Parse frontend/nuxt.config.js's `generate.routes` array directly, rather
 *  than hand-copying the same ten paths into a second literal here: two
 *  copies written in the same commit would go wrong together and this test
 *  would still pass. Comparing against the actual legacy source catches a
 *  mistyped or dropped path the way a second copy cannot.
 *  frontend/ is read-only but still present (it survives until Task 12).
 *  Note: cannot use `new URL('../../frontend/...', import.meta.url)` --
 *  Vite's import-analysis plugin statically rewrites that literal pattern
 *  into an asset URL, so the path has to be built by hand with node:path
 *  instead (see web/test/tokens.test.ts and web/test/cases.test.ts).
 */
function legacyGenerateRoutes(): string[] {
  const configPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../frontend/nuxt.config.js',
  )
  const src = readFileSync(configPath, 'utf8')
  const routesBlock = src.match(/routes:\s*\[([\s\S]*?)\]/)
  if (!routesBlock) {
    throw new Error('Could not find generate.routes in frontend/nuxt.config.js')
  }
  return [...routesBlock[1]!.matchAll(/"([^"]+)"/g)].map(m => m[1]!)
}

describe('legacy route table (design doc §4.5)', () => {
  it('covers exactly the routes in frontend/nuxt.config.js generate.routes', () => {
    expect(Object.keys(LEGACY_ROUTES).sort()).toEqual(legacyGenerateRoutes().sort())
  })

  it('every target resolves to an enabled case', () => {
    const slugs = new Set(enabledCases().map(c => c.slug))
    for (const target of Object.values(LEGACY_ROUTES)) {
      expect(slugs.has(target.replace('/case/', ''))).toBe(true)
    }
  })
})
