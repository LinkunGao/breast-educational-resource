import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { vi } from 'vitest'
import { useViewerStore } from '../app/stores/viewer'

// Nuxt auto-imports Vue's reactivity APIs and its own composables/stores as
// bare globals inside every <script setup>. Plain Vitest has no equivalent
// transform, so the compiled setup functions throw ReferenceError on these
// identifiers unless something puts them on globalThis first. This runs
// before every test file (see vitest.config.ts's `setupFiles`).
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('watchEffect', watchEffect)
vi.stubGlobal('useViewerStore', useViewerStore)
