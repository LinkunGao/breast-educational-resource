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
  '/model-breast': '/the-breast',
  '/density-1': '/density-a',
  '/density-2': '/density-b',
  '/density-3': '/density-c',
  '/density-4': '/density-d',
}

/**
 * The five lesion cases are deliberately absent from the table above.
 *
 * Case pages used to live under `/case/<slug>`; they are now served at
 * `/<slug>` directly (the human's #9: "你这个app的路由为何会有一个case呢？
 * 很奇怪"). For `benign-cyst`, `benign-fibroadenoma`, `cancer-dcis`,
 * `cancer-lobular` and `cancer-ductal` the legacy path and the new path are
 * now the SAME string, so a redirect entry for them would be a rule pointing
 * at itself -- a loop in the router and a `<meta http-equiv="refresh">`
 * pointing at its own page in the generated stub.
 *
 * They still resolve, because the real route now answers on that path. Only
 * the five paths whose names actually changed need a redirect.
 */
export const LEGACY_ROUTES_SERVED_DIRECTLY = [
  '/benign-cyst',
  '/benign-fibroadenoma',
  '/cancer-dcis',
  '/cancer-lobular',
  '/cancer-ductal',
] as const
