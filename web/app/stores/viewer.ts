import { defineStore } from 'pinia'
import type { ModalityId } from '~~/content/types'

/** Camera pose snapshot, keyed by `${caseSlug}:${modalityId}`. */
export interface CameraSnapshot {
  position: [number, number, number]
  up: [number, number, number]
  target: [number, number, number]
}

export const useViewerStore = defineStore('viewer', () => {
  const caseSlug = ref('the-breast')
  const modalityId = ref<ModalityId>('anatomy')

  // Panel collapse state -- tracks the user's explicit intent only; CSS
  // decides what's actually visible at a given width (see default.vue).
  //
  // sidebarOpen only governs the sub-xl drawer: every consumer of it
  // (default.vue's translate classes and scrim, AppHeader's hamburger) is
  // gated behind `max-xl:`/`xl:hidden`, so at xl and above the sidebar is
  // resident regardless of this value and the field has no visible effect.
  // Below xl it drives a full-screen drawer + dimming scrim, so it defaults
  // closed -- a narrow-viewport visitor's first paint should be the case
  // they came for, not a drawer already covering it.
  const sidebarOpen = ref(false)
  const contentOpen = ref(true)

  const cameraSnapshots = ref<Record<string, CameraSnapshot>>({})

  function snapshotKey(slug = caseSlug.value, id = modalityId.value) {
    return `${slug}:${id}`
  }

  function saveCamera(snapshot: CameraSnapshot, key = snapshotKey()) {
    cameraSnapshots.value[key] = snapshot
  }

  function loadCamera(key = snapshotKey()): CameraSnapshot | undefined {
    return cameraSnapshots.value[key]
  }

  return {
    caseSlug,
    modalityId,
    sidebarOpen,
    contentOpen,
    cameraSnapshots,
    snapshotKey,
    saveCamera,
    loadCamera,
  }
})
