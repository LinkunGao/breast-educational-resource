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

  // Panel collapse state. Expanded by default on desktop; narrow screens hide
  // panels via CSS. This only tracks the user's explicit intent.
  const sidebarOpen = ref(true)
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
