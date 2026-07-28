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

  // Panel presence state -- tracks the user's explicit intent only; CSS
  // decides what that intent actually renders as at a given width (see
  // default.vue, design doc §10.1-10.3). Both fields mean "is this panel in
  // its normal, visible resting state" -- what that resting state looks
  // like is a different CSS treatment at each of the three tiers:
  //
  // sidebarOpen (case navigation):
  //   - xl+ (desktop, §10.1): the sidebar is resident; this toggles it
  //     between its normal 240px width and fully collapsed (0px), the
  //     "collapse both panels for projection" feature.
  //   - md..xl (tablet, §10.2): a drawer sliding in from the left.
  //   - <md (phone, §10.3): a drawer dropping down from the top.
  //   Defaults closed: below xl this is a full-screen drawer + dimming
  //   scrim, so a narrow-viewport visitor's first paint must be the case
  //   they came for, not a drawer already covering it.
  //
  // contentOpen (case content -- ModalityText, prev/next):
  //   - xl+ only: toggles the content column between its normal 400px
  //     width and fully collapsed (0px), the other half of the "collapse
  //     both panels for projection" feature.
  //   - Below xl this has no consumer: tablet's bottom sheet peek/expand
  //     state is deliberately its own local, non-persisted ref in
  //     default.vue (see `sheetExpanded`), not this field -- a bottom sheet
  //     always partially shows regardless of open/closed, which doesn't
  //     map cleanly onto contentOpen's xl+ "fully present or fully gone"
  //     meaning, and forcing one field to mean both would make whichever
  //     default (true) fires on tablet's first paint either always-peeking
  //     (fine) or always-expanded-to-half-screen (obstructs the stage,
  //     the exact first-paint mistake sidebarOpen's default already fixed
  //     once). Phone has no content-collapse concept at all -- the copy is
  //     just inline in the single column.
  //   Defaults open: this is the desktop-only "expanded by default, collapse
  //     on demand" panel the design doc describes, so xl+ visitors see it
  //     exactly as before this field had any consumer.
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
