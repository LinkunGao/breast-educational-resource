import { assetUrl, resolveAssetBase } from './assetUrl'

export function useAssetUrl() {
  const config = useRuntimeConfig()
  // Review fix #3: `assetBase` alone ignores `app.baseURL`, so a GitHub
  // Pages subpath deploy (NUXT_APP_BASE_URL=/te-uma/) would silently
  // 404 every asset by requesting them from the site root instead of
  // "/te-uma/modelView/". See resolveAssetBase's own comment.
  const base = resolveAssetBase(config.public.assetBase as string, config.app.baseURL)
  return { url: (path: string) => assetUrl(path, base) }
}
