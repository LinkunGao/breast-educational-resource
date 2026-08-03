<script setup lang="ts">
import { getCase } from '~~/content/cases'
import { TOUR_CHAPTERS } from '~~/content/tour'
import type { ChapterId } from '~~/content/tourTypes'
// PanelId lives in content/types, not tourTypes -- tourTypes imports it but
// does not re-export it.
import type { PanelId } from '~~/content/types'
// Imported, not auto-imported: exported so the decision rule can be unit-
// tested without mounting this `.client` component.
import { decideTourKeydown } from '~/utils/tourKeydown'
import { tourStepBody } from '~/utils/tourBodyText'

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

const props = defineProps<{
  /** Expands the tablet-only bottom sheet. That state is deliberately local
   *  to the layout (not the store -- see stores/viewer.ts's `contentOpen`
   *  comment), so the layout passes its setter down the same way it takes
   *  `startTour` back up via a template ref. Optional so a host with no
   *  sheet concept needs nothing. */
  expandSheet?: () => void
}>()

const director = useTourDirector({
  navigate: async (path) => { await navigateTo(path) },
  focusPanel: (panel: PanelId) => { void focusPanelByRoute(panel) },
  openSidebar: () => { viewer.sidebarOpen = true },
  closeSidebar: () => { viewer.sidebarOpen = false },
  isSidebarOpen: () => viewer.sidebarOpen,
  // xl+'s content column (its own `contentOpen`) and tablet's bottom sheet
  // (the layout-local prop above) are two different mechanisms for the same
  // "make the description visible" intent -- see I3 in the review this fix
  // came from. Both run; each is a no-op on the tier it doesn't apply to.
  expandSheet: () => { viewer.contentOpen = true; props.expandSheet?.() },
  currentRoute: () => route.path,
})

/**
 * Focus a slot the way the app itself does: by navigating to the modality
 * that slot is showing. Synthesising a pointerdown on the panel worked but
 * depended on CasePanels keeping that exact listener; the URL is the real
 * contract -- it always names the focused modality.
 */
async function focusPanelByRoute(panel: PanelId) {
  const slug = String(route.params.slug ?? '')
  const c = getCase(slug)
  const target = c?.panels.find(p => p.id === panel)?.modalities[0]
  if (target) await navigateTo(`/${slug}/${target.id}`)
}

const step = computed(() => director.currentStep.value)
const rect = ref<DOMRect | null>(null)
const targetEl = shallowRef<HTMLElement | null>(null)

function measure() {
  rect.value = targetEl.value?.getBoundingClientRect() ?? null
}

/**
 * Marks the focused region so the CSS in tokens.css can dim the rest, and
 * makes every dimmed region `inert` -- opacity alone still leaves its text
 * in the accessibility tree at a contrast ratio that only ever passed at
 * full opacity, and still leaves it in the tab order behind the tour's own
 * dialog. `inert` removes both, which is exactly what "dimmed" is meant to
 * communicate.
 */
function paintRegions() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-tour-region]')) {
    // A region is focused if it IS the target, CONTAINS the target (a step
    // targeting one control inside a larger region), or is CONTAINED BY the
    // target (a step like `panels-wide` that targets the parent wrapping
    // several regions -- without this branch none of them ever matched and
    // all three dimmed while the copy described looking across them).
    const isFocus = Boolean(targetEl.value && (
      el === targetEl.value || el.contains(targetEl.value) || targetEl.value.contains(el)
    ))
    el.toggleAttribute('data-tour-focus', isFocus)
    el.inert = !isFocus
  }
}

watch([() => store.active, () => store.stepIndex], async () => {
  if (!store.active) {
    document.body.removeAttribute('data-tour-active')
    for (const el of document.querySelectorAll<HTMLElement>('[data-tour-region]')) {
      el.removeAttribute('data-tour-focus')
      el.inert = false
    }
    targetEl.value = null
    rect.value = null
    return
  }
  document.body.setAttribute('data-tour-active', '')
  const s = step.value
  if (!s) return

  // Guards against a second Next/Back arriving while this step's demo is
  // still running (the rotate step's orbit alone is 2500ms): without this,
  // the older step's tail could overwrite the newer step's target after the
  // reader has already moved on, or after the tour has already exited.
  const token = store.runToken

  // Paint first, so the halo and the dimming match the card that is already
  // on screen -- otherwise the spotlight rings the PREVIOUS step's target
  // for as long as this step's demo takes to run (2500ms for the rotate
  // step), while the card and the demo both already point at the new one.
  // Best effort: runStep may navigate or run prepare actions that change
  // the DOM first, so resolveTarget can legitimately miss here. The pass
  // after runStep is still the authoritative one.
  //
  // A step whose route differs from where we are now is about to navigate
  // away -- resolving its selector here would hit whatever element on THIS
  // (soon-to-be-unmounted) page happens to match, which is only harmless by
  // coincidence when every case shares the same panel grid. Clear instead
  // and let the post-runStep pass, run after the navigation lands, be the
  // only one that paints.
  await nextTick()
  targetEl.value = (s.route && s.route !== route.path) ? null : director.resolveTarget(s)
  paintRegions()
  measure()

  await director.runStep(s)
  if (token !== store.runToken || !store.active) return
  await nextTick()
  targetEl.value = director.resolveTarget(s)
  paintRegions()
  measure()
  targetEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}, { immediate: true })

/** Focus returns to whatever opened the tour, like any modal. */
let opener: HTMLElement | null = null

watch(() => store.active, async (active) => {
  if (active) {
    opener = document.activeElement as HTMLElement | null
    await nextTick()
    document.querySelector<HTMLElement>('[data-tour-card]')?.focus()
  }
  else {
    opener?.focus()
    opener = null
  }
})

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
  const action = decideTourKeydown(event)
  if (action === 'exit') void director.exitTour()
  else if (action === 'next') advance()
  else if (action === 'back') store.back()
}

/**
 * Design doc §4.4: exiting is like closing a modal and returns you to where
 * you started; FINISHING does not. The last step has just said "pressing
 * Next is enough to walk the whole resource", so bouncing the reader back
 * would contradict it.
 */
function advance() {
  if (store.atEnd) director.finishTour()
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
const bodyText = computed(() => tourStepBody(store.phase, step.value))

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
