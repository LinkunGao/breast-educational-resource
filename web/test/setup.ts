import { computed, inject, nextTick, onErrorCaptured, onMounted, onScopeDispose, provide, reactive, ref, shallowRef, watch, watchEffect } from 'vue'
import { vi } from 'vitest'
import { useAssetUrl } from '../app/composables/useAssetUrl'
import { useViewerStore } from '../app/stores/viewer'
import { useTourStore } from '../app/stores/tour'

/**
 * copper3d's real `installFastSliceRepaint` patches a `VolumeSlice` with a
 * canvas-backed repaint, which happy-dom has no business running -- its real
 * behaviour is covered in `test-browser/mri-exposure.spec.ts`. Everything
 * else in the barrel is the genuine library.
 *
 * A test that wants to assert on the patch can override this per file.
 */
vi.mock('../app/composables/copperExtras', async importOriginal => ({
  ...(await importOriginal<typeof import('../app/composables/copperExtras')>()),
  installFastSliceRepaint: vi.fn(async () => {}),
}))

// Nuxt auto-imports Vue's reactivity APIs and its own composables/stores as
// bare globals inside every <script setup>. Plain Vitest has no equivalent
// transform, so the compiled setup functions throw ReferenceError on these
// identifiers unless something puts them on globalThis first. This runs
// before every test file (see vitest.config.ts's `setupFiles`).
vi.stubGlobal('ref', ref)
vi.stubGlobal('shallowRef', shallowRef)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('watchEffect', watchEffect)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onScopeDispose', onScopeDispose)
// TourLayer's guard against a child render error leaving the app dimmed.
vi.stubGlobal('onErrorCaptured', onErrorCaptured)
vi.stubGlobal('provide', provide)
vi.stubGlobal('inject', inject)
vi.stubGlobal('useViewerStore', useViewerStore)
vi.stubGlobal('useTourStore', useTourStore)
// useModalityScene calls the real useAssetUrl, which itself calls
// useRuntimeConfig -- a Nuxt global with no plain-Vitest equivalent.
// Mirrors nuxt.config.ts's actual defaults (assetBase '/modelView/', root
// baseURL), so tests exercise the same URL-joining logic production does.
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { assetBase: '/modelView/', appVersion: '0.0.0-test' },
  app: { baseURL: '/' },
}))
vi.stubGlobal('useAssetUrl', useAssetUrl)

