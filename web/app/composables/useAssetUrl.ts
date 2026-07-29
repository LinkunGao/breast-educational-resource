import { assetUrl } from './assetUrl'

export function useAssetUrl() {
  const base = useRuntimeConfig().public.assetBase as string
  return { url: (path: string) => assetUrl(path, base) }
}
