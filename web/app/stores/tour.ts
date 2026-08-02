import { defineStore } from 'pinia'
import type { TourLayoutScope } from '~~/content/tourTypes'

/** localStorage key for "this browser has been offered the tour once". */
export const TOUR_SEEN_KEY = 'teuma.tour.seen'

/**
 * `playing`  — the card is up, any demo has run or is running
 * `waiting`  — the card is up, a demo is queued behind an unready stage
 * `fallback` — the stage never arrived; the step shows its manual copy
 */
export type TourPhase = 'playing' | 'waiting' | 'fallback'

export const useTourStore = defineStore('tour', () => {
  const active = ref(false)
  const layout = ref<TourLayoutScope>('wide')
  const stepIndex = ref(0)
  const stepCount = ref(0)
  const phase = ref<TourPhase>('playing')
  const hasSeen = ref(false)

  /** Where the reader was when they pressed the button. Exit returns here. */
  const entryRoute = ref('/')

  /**
   * Bumped on every state change. A demo awaiting a slow stage captures the
   * token it started with and aborts if it no longer matches -- the same
   * guard CopperStage's `navToken` uses against a slow load resolving behind
   * the user's back.
   */
  const runToken = ref(0)
  function bump() { runToken.value++ }

  const atEnd = computed(() => stepIndex.value >= stepCount.value - 1)

  /** Writing can throw in private mode; being offered the tour twice is a
   *  far smaller problem than a thrown error on first paint. */
  function markSeen() {
    hasSeen.value = true
    try { localStorage.setItem(TOUR_SEEN_KEY, '1') }
    catch { /* private mode */ }
  }

  function restoreSeen() {
    try { hasSeen.value = localStorage.getItem(TOUR_SEEN_KEY) === '1' }
    catch { hasSeen.value = false }
  }

  function start(forLayout: TourLayoutScope, count: number, route: string) {
    layout.value = forLayout
    stepCount.value = count
    entryRoute.value = route
    stepIndex.value = 0
    phase.value = 'playing'
    active.value = true
    markSeen()
    bump()
  }

  function next() {
    if (stepIndex.value < stepCount.value - 1) stepIndex.value++
    phase.value = 'playing'
    bump()
  }

  function back() {
    if (stepIndex.value > 0) stepIndex.value--
    phase.value = 'playing'
    bump()
  }

  function goToStep(index: number) {
    stepIndex.value = Math.min(Math.max(index, 0), Math.max(stepCount.value - 1, 0))
    phase.value = 'playing'
    bump()
  }

  function exit() {
    active.value = false
    phase.value = 'playing'
    bump()
  }

  return {
    active, layout, stepIndex, stepCount, phase, hasSeen, entryRoute, runToken,
    atEnd, start, next, back, goToStep, exit, markSeen, restoreSeen,
  }
})
