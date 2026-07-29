/**
 * Joins an asset URL (design doc §9.2). `base` comes from
 * runtimeConfig.public.assetBase:
 *   - local / GitHub Pages -> "/modelView/"
 *   - external object storage -> "https://.../"
 */
export function assetUrl(path: string, base: string): string {
  if (!path) throw new Error('assetUrl received an empty path')
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/**
 * Prefixes a root-relative asset base with the app's own base path
 * (Nuxt's `app.baseURL`, set via `NUXT_APP_BASE_URL` for a GitHub Pages
 * subpath deploy per design doc §8.5). Without this, a subpath deploy
 * with the default `assetBase` of "/modelView/" would request assets from
 * the site root instead of "/<subpath>/modelView/", 404ing everything.
 *
 * Absolute bases (an external CDN/object store) are returned untouched --
 * they are never served under this app's own path.
 */
export function resolveAssetBase(assetBase: string, appBaseURL: string): string {
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(assetBase)) return assetBase
  const prefix = appBaseURL.replace(/\/+$/, '')
  if (!prefix) return assetBase
  return `${prefix}/${assetBase.replace(/^\/+/, '')}`
}
