import { getTourStage } from '~/composables/useTourStageBridge'
import type { Pose } from '~/composables/copperExtras'
import { tourSteps } from '~~/content/tour'
import type { TourDemo, TourLayoutScope, TourStep } from '~~/content/tourTypes'
import type { PanelId } from '~~/content/types'
import { useTourStore } from '~/stores/tour'

export interface TourDirectorDeps {
  navigate: (path: string) => Promise<void>
  focusPanel: (panel: PanelId) => void
  openSidebar: () => void
  expandSheet: () => void
  currentRoute: () => string
  /** How long a stage may make no progress before the step degrades. */
  stallMs?: number
  /** Absolute ceiling on any single wait. */
  ceilingMs?: number
}

const DEG = Math.PI / 180

export function useTourDirector(deps: TourDirectorDeps) {
  const store = useTourStore()
  const stallMs = deps.stallMs ?? 10_000
  const ceilingMs = deps.ceilingMs ?? 60_000

  /** Poses captured before a demo, restored on step end or tour exit. */
  const captured = new Map<PanelId, Pose>()

  /** First selector that matches wins; all missing means "skip this step". */
  function resolveTarget(step: TourStep): HTMLElement | null {
    for (const selector of step.target ?? []) {
      const el = document.querySelector<HTMLElement>(selector)
      if (el) return el
    }
    return null
  }

  /**
   * Wide or narrow, asked of CSS rather than of the window.
   *
   * One-up hides the non-focused panels with `display: none` (CasePanels'
   * container query), so a visible non-focused panel IS three-up. This is
   * the same technique CaseSidebar's drawer gate uses -- read back what CSS
   * already decided, never measure the viewport in JS.
   */
  function isWideLayout(): boolean {
    const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'))
    const unfocused = panels.filter(el => el.dataset.focused !== 'true')
    return unfocused.some(el => getComputedStyle(el).display !== 'none')
  }

  function layoutScope(): TourLayoutScope {
    return isWideLayout() ? 'wide' : 'narrow'
  }

  const steps = computed(() => tourSteps(store.layout))
  const currentStep = computed<TourStep | undefined>(() => steps.value[store.stepIndex])

  async function runPrepare(step: TourStep) {
    for (const action of step.prepare ?? []) {
      if (action.kind === 'openSidebar') deps.openSidebar()
      else if (action.kind === 'expandSheet') deps.expandSheet()
      else deps.focusPanel(action.panel)
    }
    await nextTick()
  }

  /**
   * Waits for a stage, degrading rather than blocking.
   *
   * Not a fixed timeout: on GitHub Pages a 20-30MB volume routinely takes
   * longer than any timeout short enough to feel responsive. Returns false
   * once the stage has made no progress for `stallMs`, or `ceilingMs` has
   * passed outright -- the caller then shows the step's manual copy.
   */
  async function awaitStage(panel: PanelId, token: number): Promise<boolean> {
    const api = getTourStage(panel)
    if (!api) return false
    if (api.isFailed()) return false
    if (api.isReady()) return true

    store.phase = 'waiting'
    const began = Date.now()
    let lastChange = Date.now()
    // sliceMax() is binary -- 0 until the whole asset lands, then final --
    // so it can never show a slow download progressing. loadProgress() is
    // copper3d's real fractional byte progress; it can be NaN mid-flight,
    // so compare with Object.is (NaN !== NaN, but Object.is(NaN, NaN) is
    // true, and a number-to-NaN transition still reads as a change).
    let lastProgress = api.loadProgress()

    while (Date.now() - began < ceilingMs) {
      await new Promise(r => setTimeout(r, 100))
      if (token !== store.runToken) return false
      if (api.isFailed()) return false
      if (api.isReady()) return true
      const progress = api.loadProgress()
      if (!Object.is(progress, lastProgress)) { lastProgress = progress; lastChange = Date.now() }
      if (Date.now() - lastChange > stallMs) return false
    }
    return false
  }

  async function runDemo(demo: TourDemo, token: number) {
    const api = getTourStage(demo.panel)
    if (!api) return

    if (demo.kind === 'focusPanel') {
      deps.focusPanel(demo.panel)
      return
    }
    if (demo.kind === 'locateLesion') {
      api.locate()
      return
    }
    if (demo.kind === 'orbit') {
      // Only the orbit demo moves the camera, so only it needs to capture
      // and restore a pose. Captured here (not up front) and deleted right
      // after its own restore, so exitTour only ever restores a demo that
      // was interrupted before it could put the camera back itself --
      // never a reader's own rotation made after the demo finished.
      const pose = api.snapshot()
      if (pose) captured.set(demo.panel, pose)
      await api.orbit(demo.degrees * DEG, demo.durationMs)
      if (token !== store.runToken) return
      const entry = captured.get(demo.panel)
      if (entry) {
        api.applyPose(entry)
        captured.delete(demo.panel)
      }
      return
    }
    // scrubSlices: step to the far end of the volume and back to where the
    // reader was, so nothing is left displaced.
    const max = api.sliceMax()
    if (max <= 0) return
    const from = Math.round(max / 2)
    api.scrubTo(max)
    await new Promise(r => setTimeout(r, demo.durationMs))
    if (token !== store.runToken) return
    api.scrubTo(from)
  }

  /** Runs one step end to end. Never throws; never blocks indefinitely. */
  async function runStep(step: TourStep) {
    try {
      await runStepBody(step)
    }
    catch {
      // A caller-supplied dep (navigate, focusPanel, a TourStageApi method,
      // ...) can throw synchronously or reject. The tour must never die
      // mid-step for it -- fall back to the manual copy like any other
      // degraded step.
      store.phase = 'fallback'
    }
  }

  async function runStepBody(step: TourStep) {
    const token = store.runToken

    if (step.route && deps.currentRoute() !== step.route) {
      await deps.navigate(step.route)
      if (token !== store.runToken) return
    }
    await runPrepare(step)
    if (token !== store.runToken) return

    if (!step.demo) {
      store.phase = 'playing'
      return
    }

    const api = getTourStage(step.demo.panel)
    // Reduced motion means no automatic movement at all -- the reader gets
    // the manual instructions instead, which is the honest version of the
    // same information.
    if (api?.prefersReducedMotion()) {
      store.phase = 'fallback'
      return
    }

    const ready = step.requiresStage
      ? await awaitStage(step.requiresStage, token)
      : true
    if (token !== store.runToken) return
    if (!ready) {
      store.phase = 'fallback'
      return
    }

    store.phase = 'playing'
    await runDemo(step.demo, token)
  }

  function startTour() {
    const scope = layoutScope()
    store.start(scope, tourSteps(scope).length, deps.currentRoute())
  }

  /** Puts everything back: every captured pose, then the entry route. */
  async function exitTour() {
    for (const [panel, pose] of captured) getTourStage(panel)?.applyPose(pose)
    captured.clear()
    const back = store.entryRoute
    store.exit()
    if (deps.currentRoute() !== back) await deps.navigate(back)
  }

  return { steps, currentStep, resolveTarget, isWideLayout, layoutScope, runStep, startTour, exitTour }
}
