/**
 * Old site route -> new route (design doc §4.5).
 * Source: `generate.routes` in frontend/nuxt.config.js.
 * These paths may be bookmarked or linked externally and must stay reachable.
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

export function resolveLegacy(path: string): string | undefined {
  const normalised = path.length > 1 ? path.replace(/\/+$/, '') : path
  return LEGACY_ROUTES[normalised]
}
