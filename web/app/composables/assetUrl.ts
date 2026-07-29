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
