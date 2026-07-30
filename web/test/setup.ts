import { computed, inject, nextTick, onMounted, onScopeDispose, provide, reactive, ref, shallowRef, watch, watchEffect } from 'vue'
import { vi } from 'vitest'
import { installTrackballControls } from '../app/composables/installTrackballControls'
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

// useModalityScene reaches these three as auto-imports too. They are here
// rather than in one test file because forgetting them does not fail
// loudly: `load()` catches its own errors into `loadError`, so a missing
// global surfaces as "loadNrrd was never called" thirty tests later, which
// is exactly how it surfaced the first time.
//
// The real `installTrackballControls` -- it is pure object and DOM work,
// and swapping copper3d's OrbitControls for the trackball is behaviour the
// unit tests genuinely check.
vi.stubGlobal('installTrackballControls', installTrackballControls)
// These two dynamically `import('three')`, which a happy-dom unit test has
// no business loading. Their real behaviour is covered in test-browser/.
// A test that wants to assert on either can stub its own over the top.
vi.stubGlobal('installFastSliceRepaint', vi.fn(async () => {}))
vi.stubGlobal('addVolumeBoundingBox', vi.fn(async () => {}))
