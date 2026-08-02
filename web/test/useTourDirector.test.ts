import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTourStages, registerTourStage } from '../app/composables/useTourStageBridge'
import type { TourStageApi } from '../app/composables/useTourStageBridge'
import { useTourDirector } from '../app/composables/useTourDirector'
import { useTourStore } from '../app/stores/tour'
import type { TourStep } from '../content/tourTypes'

function stage(overrides: Partial<TourStageApi> = {}): TourStageApi {
  return {
    isReady: () => true,
    isFailed: () => false,
    snapshot: () => ({ position: [0, 0, 1], up: [0, 1, 0], target: [0, 0, 0] }),
    applyPose: vi.fn(),
    orbit: vi.fn(async () => {}),
    scrubTo: vi.fn(),
    sliceMax: () => 100,
    loadProgress: () => 1,
    lesionSliceIndex: () => 62,
    locate: vi.fn(),
    reset: vi.fn(),
    prefersReducedMotion: () => false,
    ...overrides,
  }
}

function makeDirector(extra: Partial<Parameters<typeof useTourDirector>[0]> = {}) {
  const navigate = vi.fn(async () => {})
  const focusPanel = vi.fn()
  const openSidebar = vi.fn()
  const expandSheet = vi.fn()
  const director = useTourDirector({
    navigate,
    focusPanel,
    openSidebar,
    expandSheet,
    currentRoute: () => '/the-breast/anatomy',
    stallMs: 20,
    ceilingMs: 100,
    ...extra,
  })
  return { director, navigate, focusPanel, openSidebar, expandSheet }
}

const ORBIT_STEP: TourStep = {
  id: 'rotate', chapter: 'interacting', target: ['[data-panel="anatomy"]'],
  title: 'T', body: 'demo copy', bodyFallback: 'manual copy',
  demo: { kind: 'orbit', panel: 'anatomy', degrees: 120, durationMs: 10 },
  requiresStage: 'anatomy',
}

describe('tour director', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearTourStages()
    document.body.innerHTML = '<div data-panel="anatomy"></div>'
  })

  it('resolves the first matching selector and skips a step whose targets all miss', async () => {
    const { director } = makeDirector()
    expect(director.resolveTarget({ ...ORBIT_STEP, target: ['#nope', '[data-panel="anatomy"]'] }))
      .toBe(document.querySelector('[data-panel="anatomy"]'))
    expect(director.resolveTarget({ ...ORBIT_STEP, target: ['#nope'] })).toBeNull()
  })

  it('runs the demo when the stage is already ready', async () => {
    const api = stage()
    registerTourStage('anatomy', api)
    const { director } = makeDirector()
    await director.runStep(ORBIT_STEP)
    expect(api.orbit).toHaveBeenCalledOnce()
    expect(useTourStore().phase).toBe('playing')
  })

  it('restores the entry pose after the demo', async () => {
    const api = stage()
    registerTourStage('anatomy', api)
    const { director } = makeDirector()
    await director.runStep(ORBIT_STEP)
    expect(api.applyPose).toHaveBeenCalledWith({ position: [0, 0, 1], up: [0, 1, 0], target: [0, 0, 0] })
  })

  it('waits, then falls back when the stage never becomes ready', async () => {
    registerTourStage('anatomy', stage({ isReady: () => false }))
    const { director } = makeDirector()
    await director.runStep(ORBIT_STEP)
    expect(useTourStore().phase).toBe('fallback')
  })

  it('skips the demo outright when the stage has failed to load', async () => {
    const api = stage({ isReady: () => false, isFailed: () => true })
    registerTourStage('anatomy', api)
    const { director } = makeDirector()
    await director.runStep(ORBIT_STEP)
    expect(api.orbit).not.toHaveBeenCalled()
    expect(useTourStore().phase).toBe('fallback')
  })

  it('skips the demo when no stage ever registered for that panel', async () => {
    const { director } = makeDirector()
    await director.runStep(ORBIT_STEP)
    expect(useTourStore().phase).toBe('fallback')
  })

  it('does not orbit under reduced motion; it goes straight to the manual copy', async () => {
    const api = stage({ prefersReducedMotion: () => true })
    registerTourStage('anatomy', api)
    const { director } = makeDirector()
    await director.runStep(ORBIT_STEP)
    expect(api.orbit).not.toHaveBeenCalled()
    expect(useTourStore().phase).toBe('fallback')
  })

  it('a step advanced while waiting voids its queued demo', async () => {
    let ready = false
    const api = stage({ isReady: () => ready })
    registerTourStage('anatomy', api)
    const { director } = makeDirector({ stallMs: 200 })
    const store = useTourStore()
    store.start('wide', 5, '/')
    const running = director.runStep(ORBIT_STEP)
    store.next()          // bumps runToken
    ready = true
    await running
    expect(api.orbit).not.toHaveBeenCalled()
  })

  it('gives up at the ceiling even when progress keeps ticking (never trips the stall window)', async () => {
    let progress = 0
    const api = stage({ isReady: () => false, loadProgress: () => (progress += 0.01) })
    registerTourStage('anatomy', api)
    // stallMs is large enough that steadily-increasing progress never trips
    // it; only the absolute ceiling can end this wait.
    const { director } = makeDirector({ stallMs: 1000, ceilingMs: 250 })
    await director.runStep(ORBIT_STEP)
    expect(useTourStore().phase).toBe('fallback')
  })

  it('steady progress keeps the tour waiting instead of tripping the stall window', async () => {
    let p = 0
    const api = stage({ isReady: () => false, loadProgress: () => (p += 0.05) })
    registerTourStage('anatomy', api)
    // stallMs is short and ceilingMs is long -- the opposite of the ceiling
    // test above. With a real progress signal this must still be 'waiting'
    // well past stallMs; a frozen signal (e.g. sliceMax(), constant in this
    // fake) would have declared it stalled by then.
    const { director } = makeDirector({ stallMs: 50, ceilingMs: 2000 })
    const store = useTourStore()
    const running = director.runStep(ORBIT_STEP)
    await new Promise(r => setTimeout(r, 250))
    expect(store.phase).toBe('waiting')
    store.next() // bump runToken so the pending wait exits promptly instead of running to the ceiling
    await running
  })

  it('a throwing dep degrades to fallback instead of rejecting', async () => {
    const { director } = makeDirector({
      navigate: vi.fn(() => { throw new Error('boom') }),
    })
    await expect(director.runStep({
      id: 'x', chapter: 'lesion', title: 'T', body: 'B', route: '/cancer-ductal/mri',
    })).resolves.toBeUndefined()
    expect(useTourStore().phase).toBe('fallback')
  })

  it('navigates first when the step names a route', async () => {
    const { director, navigate } = makeDirector()
    await director.runStep({ id: 'x', chapter: 'lesion', title: 'T', body: 'B', route: '/cancer-ductal/mri' })
    expect(navigate).toHaveBeenCalledWith('/cancer-ductal/mri')
  })

  it('runs prepare actions before showing the card', async () => {
    const { director, openSidebar, focusPanel } = makeDirector()
    await director.runStep({
      id: 'x', chapter: 'layout', title: 'T', body: 'B',
      prepare: [{ kind: 'openSidebar' }, { kind: 'focusPanel', panel: 'mri' }],
    })
    expect(openSidebar).toHaveBeenCalled()
    expect(focusPanel).toHaveBeenCalledWith('mri')
  })

  it('scrubSlices walks to the last slice and locateLesion jumps to the lesion', async () => {
    const api = stage()
    registerTourStage('mri', api)
    const { director } = makeDirector()
    await director.runStep({
      id: 's', chapter: 'interacting', title: 'T', body: 'B', bodyFallback: 'F',
      demo: { kind: 'scrubSlices', panel: 'mri', durationMs: 10 }, requiresStage: 'mri',
    })
    expect(api.scrubTo).toHaveBeenCalled()

    await director.runStep({
      id: 'l', chapter: 'lesion', title: 'T', body: 'B', bodyFallback: 'F',
      demo: { kind: 'locateLesion', panel: 'mri' }, requiresStage: 'mri',
    })
    expect(api.locate).toHaveBeenCalledOnce()
  })

  it('startTour picks the wide script when a non-focused panel is visible', () => {
    document.body.innerHTML = `
      <div data-tour="panels">
        <div data-panel="anatomy" data-focused="true"></div>
        <div data-panel="mri" data-focused="false"></div>
      </div>`
    // happy-dom reports display:block for anything without a rule, which is
    // exactly the "not hidden" signal isWideLayout reads.
    const { director } = makeDirector()
    expect(director.isWideLayout()).toBe(true)
  })

  it('exitTour restores the entry route and every captured pose', async () => {
    const api = stage()
    registerTourStage('anatomy', api)
    const { director, navigate } = makeDirector()
    const store = useTourStore()
    store.start('wide', 5, '/density-c/mri')
    await director.runStep(ORBIT_STEP)
    await director.exitTour()
    expect(store.active).toBe(false)
    expect(navigate).toHaveBeenLastCalledWith('/density-c/mri')
  })
})
