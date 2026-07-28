/**
 * Old site route -> new route (design doc §4.5).
 * Source: `generate.routes` in frontend/nuxt.config.js.
 * These paths may be bookmarked or linked externally and must stay reachable.
 *
 * Lives in content/ (not app/) so nuxt.config.ts can import it directly at
 * config-evaluation time -- app/ is wired through Nuxt's `~`/`~~` aliases,
 * which are not resolved yet while nuxt.config.ts itself is loading.
 *
 * This is the only place this table exists. Design doc §4.5's static-hosting
 * mechanism is entirely build-time: `nuxi generate` turns the `redirect`
 * entries this table produces in nuxt.config.ts's `routeRules` into stub
 * `index.html` files with `<meta http-equiv="refresh">` and
 * `<link rel="canonical">`. Nothing resolves a legacy path at runtime, so
 * there is deliberately no client-side lookup helper here -- add one only
 * if a future task actually introduces a client-side router fallback.
 */
export const LEGACY_ROUTES: Record<string, string> = {
  '/model-breast': '/case/the-breast',
  '/density-1': '/case/density-a',
  '/density-2': '/case/density-b',
  '/density-3': '/case/density-c',
  '/density-4': '/case/density-d',
  '/benign-cyst': '/case/benign-cyst',
  '/benign-fibroadenoma': '/case/benign-fibroadenoma',
  '/cancer-dcis': '/case/cancer-dcis',
  '/cancer-lobular': '/case/cancer-lobular',
  '/cancer-ductal': '/case/cancer-ductal',
}
