<script setup lang="ts">
import { TOUR_CHAPTERS } from '~~/content/tour'
import type { ChapterId } from '~~/content/tourTypes'
// PanelId lives in content/types, not tourTypes -- tourTypes imports it but
// does not re-export it.
import type { PanelId } from '~~/content/types'

/**
 * The tour's one stateful component.
 *
 * Owns the target measurement (a rect that has to follow scroll, resize and
 * the app's own layout changes) and drives the director. Everything visual
 * is delegated to the three presentational children.
 */
const store = useTourStore()
const viewer = useViewerStore()
const route = useRoute()

const director = useTourDirector({
  navigate: async (path) => { await navigateTo(path) },
  focusPanel: (panel: PanelId) => { focusRequest.value = panel },
  openSidebar: () => { viewer.sidebarOpen = true },
  expandSheet: () => { viewer.contentOpen = true },
  currentRoute: () => route.path,
})

/**
 * A panel the tour asked to focus. CasePanels owns focus (it is derived
 * from the URL), so this navigates rather than reaching into it.
 */
const focusRequest = ref<PanelId | null>(null)
watch(focusRequest, async (panel) => {
  if (!panel) return
  const el = document.querySelector<HTMLElement>(`[data-panel="${panel}"]`)
  el?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  focusRequest.value = null
})

const step = computed(() => director.currentStep.value)
const rect = ref<DOMRect | null>(null)
const targetEl = shallowRef<HTMLElement | null>(null)

function measure() {
  rect.value = targetEl.value?.getBoundingClientRect() ?? null
}

/** Marks the focused region so the CSS in tokens.css can dim the rest. */
function paintRegions() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-tour-region]')) {
    const isFocus = Boolean(targetEl.value && (el === targetEl.value || el.contains(targetEl.value)))
    el.toggleAttribute('data-tour-focus', isFocus)
  }
}

watch([() => store.active, () => store.stepIndex], async () => {
  if (!store.active) {
    document.body.removeAttribute('data-tour-active')
    for (const el of document.querySelectorAll('[data-tour-region]')) {
      el.removeAttribute('data-tour-focus')
    }
    targetEl.value = null
    rect.value = null
    return
  }
  document.body.setAttribute('data-tour-active', '')
  const s = step.value
  if (!s) return

  await director.runStep(s)
  await nextTick()
  targetEl.value = director.resolveTarget(s)
  paintRegions()
  measure()
  targetEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}, { immediate: true })

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(document.documentElement)
  addEventListener('scroll', measure, true)
  addEventListener('keydown', onKeydown)
})
onScopeDispose(() => {
  observer?.disconnect()
  removeEventListener('scroll', measure, true)
  removeEventListener('keydown', onKeydown)
})

function onKeydown(event: KeyboardEvent) {
  if (!store.active) return
  if (event.key === 'Escape') { void director.exitTour(); return }
  if (event.key === 'ArrowRight') advance()
  if (event.key === 'ArrowLeft') store.back()
}

function advance() {
  if (store.atEnd) void director.exitTour()
  else store.next()
}

function onChapter(id: ChapterId) {
  const index = director.steps.value.findIndex(s => s.chapter === id)
  if (index >= 0) store.goToStep(index)
}

const activeChapter = computed<ChapterId>(() => step.value?.chapter ?? 'layout')
const chapterLabel = computed(
  () => TOUR_CHAPTERS.find(c => c.id === activeChapter.value)?.label ?? '',
)
/** The fallback copy replaces the demo copy when the stage never arrived. */
const bodyText = computed(() =>
  store.phase === 'fallback' && step.value?.bodyFallback
    ? step.value.bodyFallback
    : step.value?.body ?? '')

// Exposed so the layout can start the tour without owning the director or
// any tour state itself -- both the header button and the launcher route
// through this.
defineExpose({ startTour: director.startTour })
</script>

<template>
  <template v-if="store.active && step">
    <TourSpotlight :rect="rect" />
    <TourCard
      :title="step.title"
      :body="bodyText"
      :step-number="store.stepIndex + 1"
      :step-count="store.stepCount"
      :chapter-label="chapterLabel"
      :at-end="store.atEnd"
      :rect="rect"
      :placement="step.placement ?? 'bottom'"
      @next="advance"
      @back="store.back()"
      @exit="director.exitTour()"
    />
    <TourRail
      :chapters="TOUR_CHAPTERS"
      :active-chapter="activeChapter"
      :step-index="store.stepIndex"
      :step-count="store.stepCount"
      :at-end="store.atEnd"
      @next="advance"
      @back="store.back()"
      @exit="director.exitTour()"
      @chapter="onChapter"
    />
  </template>
</template>
