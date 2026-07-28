/**
 * Runtime-side view onto the legacy route table. The table itself lives in
 * `content/legacyRoutes.ts` so nuxt.config.ts can build `routeRules` from
 * the same data without depending on the app/ alias graph -- see that
 * file's header comment for why. Imported by relative path (not `~~`) so
 * this module also resolves under plain Vitest, with no Nuxt alias setup.
 */
import { LEGACY_ROUTES } from '../../content/legacyRoutes'

export { LEGACY_ROUTES }

/**
 * Resolves a legacy path client-side.
 *
 * Note: case-sensitive and does not strip a `?query` or `#hash` suffix, so
 * e.g. `/density-4?utm_source=fb` returns undefined even though Nitro's
 * `routeRules` (path-only matching) would still redirect it correctly at
 * the server. Harmless today because nothing calls this for anything other
 * than exact paths; revisit if a client-side fallback ever consumes
 * `location.pathname + location.search`.
 */
export function resolveLegacy(path: string): string | undefined {
  return LEGACY_ROUTES[path.replace(/\/+$/, '')]
}
