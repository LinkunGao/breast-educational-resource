import { computed, inject, nextTick, onMounted, onScopeDispose, provide, reactive, ref, shallowRef, watch, watchEffect } from 'vue'
import { vi } from 'vitest'
import { useAssetUrl } from '../app/composables/useAssetUrl'
import { provideStageControls, useStageControls } from '../app/composables/useStageControls'
import { useViewerStore } from '../app/stores/viewer'

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
// useStageControls (Task 10) crosses the layout's stage/controls slot
// boundary with provide/inject rather than an event bus.
vi.stubGlobal('provide', provide)
vi.stubGlobal('inject', inject)
vi.stubGlobal('provideStageControls', provideStageControls)
vi.stubGlobal('useStageControls', useStageControls)
vi.stubGlobal('useViewerStore', useViewerStore)
// useModalityScene calls the real useAssetUrl, which itself calls
// useRuntimeConfig -- a Nuxt global with no plain-Vitest equivalent.
// Mirrors nuxt.config.ts's actual defaults (assetBase '/modelView/', root
// baseURL), so tests exercise the same URL-joining logic production does.
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { assetBase: '/modelView/' },
  app: { baseURL: '/' },
}))
vi.stubGlobal('useAssetUrl', useAssetUrl)
