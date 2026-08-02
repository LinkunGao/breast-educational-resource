import { computed } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TourLayer from '../app/components/tour/TourLayer.client.vue'
import { useTourStore } from '../app/stores/tour'
import type { TourStep } from '../content/tourTypes'

/**
 * Fix round 2, finding 2: the step watcher used to assign `targetEl`, paint
 * `data-tour-focus` and scroll AFTER `await director.runStep(s)` with no
 * staleness check. A second Next/Back arriving while the first step's
 * `runStep` was still pending (very reachable -- the rotate step's orbit
 * alone is 2500ms) let the OLDER step's tail overwrite the NEWER step's
 * paint once it finally resolved, and could leave `data-tour-focus` stuck
 * after the tour had already exited.
 *
 * `TourLayer` is `.client` and calls `useRoute()`/`navigateTo()` (Nuxt
 * globals `test/setup.ts` deliberately does not stub) and the bare global
 * `useTourDirector()` (Nuxt auto-import, not a real import in the SFC). All
 * three are stubbed locally in this file only, via `vi.stubGlobal` --
 * `test/setup.ts` itself is untouched. The fake director's `runStep` is a
 * controllable, per-step promise, so this test can hold the FIRST step
 * pending, let a SECOND step start and finish, and only then let the first
 * one resolve -- reproducing the exact interleaving the bug depended on.
 */
describe('TourLayer: superseded steps do not paint', () => {
  const pending = new Map<string, () => void>()

  beforeEach(() => {
    setActivePinia(createPinia())
    pending.clear()
    document.body.innerHTML = `
      <div data-tour-region data-region="a"><div data-target="a">A</div></div>
      <div data-tour-region data-region="b"><div data-target="b">B</div></div>
    `

    vi.stubGlobal('useRoute', () => ({ path: '/test' }))
    vi.stubGlobal('navigateTo', vi.fn(async () => {}))

    const steps: TourStep[] = [
      { id: 'a', chapter: 'layout', title: 'A', body: 'a' },
      { id: 'b', chapter: 'layout', title: 'B', body: 'b' },
    ]
    vi.stubGlobal('useTourDirector', () => {
      const store = useTourStore()
      return {
        steps: computed(() => steps),
        currentStep: computed(() => steps[store.stepIndex]),
        resolveTarget: (step: TourStep) => document.querySelector<HTMLElement>(`[data-target="${step.id}"]`),
        isWideLayout: () => true,
        layoutScope: () => 'wide' as const,
        // Never resolves on its own -- the test resolves it explicitly, so
        // the two steps' completion order is fully under the test's control.
        runStep: (step: TourStep) => new Promise<void>((resolve) => { pending.set(step.id, resolve) }),
        startTour: vi.fn(),
        exitTour: vi.fn(async () => { store.exit() }),
        finishTour: vi.fn(() => { store.exit() }),
      }
    })
  })

  it("an older step's runStep resolving after a newer one does not repaint its own (stale) target", async () => {
    const store = useTourStore()
    mount(TourLayer)

    store.start('wide', 2, '/test') // step 'a' begins; its runStep is now pending
    await flushPromises()
    expect(pending.has('a')).toBe(true)

    store.next() // step 'b' begins (bumps runToken) while 'a' is still pending
    await flushPromises()
    expect(pending.has('b')).toBe(true)

    // 'b' settles first (the normal case); 'a' -- the interrupted step --
    // only catches up and resolves afterwards. This is the interleaving
    // that used to let the OLDER step's tail paint over the newer step's
    // already-correct paint once it finally settled.
    pending.get('b')!()
    await flushPromises()
    pending.get('a')!()
    await flushPromises()

    const regionA = document.querySelector('[data-region="a"]')!
    const regionB = document.querySelector('[data-region="b"]')!
    expect(regionB.hasAttribute('data-tour-focus')).toBe(true)
    expect(regionA.hasAttribute('data-tour-focus')).toBe(false)
  })

  it("an older step's runStep resolving after Escape does not leave data-tour-focus stuck", async () => {
    const store = useTourStore()
    mount(TourLayer)

    store.start('wide', 2, '/test')
    await flushPromises()
    expect(pending.has('a')).toBe(true)

    store.exit() // the reader leaves while 'a' is still pending
    await flushPromises()

    pending.get('a')!()
    await flushPromises()

    expect(document.body.hasAttribute('data-tour-active')).toBe(false)
    expect(document.querySelectorAll('[data-tour-focus]')).toHaveLength(0)
  })
})

/**
 * Task 11, carried-over finding from Task 10's review: a step that NAVIGATES
 * (`lesion-case`, route `/cancer-ductal/mri`) used to get the same "paint
 * before runStep" pass as any other step, which resolved its target against
 * whatever page the reader was still ON -- a stale, about-to-be-unmounted
 * element. Invisible in the real app only because every case shares the
 * same panel grid, so the stale rect coincides with the correct one; not a
 * guarantee, and not something a browser rect-position assertion could
 * distinguish (the two rects are the same by construction). So this pins
 * the decision at the level TourLayer actually makes it: DOM is unmounted
 * only by real navigation, which this fake `navigateTo`/`useRoute` stub
 * deliberately does not perform, leaving the pre-navigation element in
 * place -- the exact condition the fix must refuse to paint.
 */
describe('TourLayer: does not pre-paint a stale target across navigation', () => {
  const pending = new Map<string, () => void>()

  beforeEach(() => {
    setActivePinia(createPinia())
    pending.clear()
    document.body.innerHTML = `
      <div data-tour-region data-region="nav"><div data-target="nav">Nav</div></div>
    `

    vi.stubGlobal('useRoute', () => ({ path: '/test' }))
    vi.stubGlobal('navigateTo', vi.fn(async () => {}))

    const steps: TourStep[] = [
      { id: 'a', chapter: 'layout', title: 'A', body: 'a' },
      {
        id: 'nav', chapter: 'lesion', title: 'Nav', body: 'b',
        route: '/other', target: ['[data-target="nav"]'],
      },
    ]
    vi.stubGlobal('useTourDirector', () => {
      const store = useTourStore()
      return {
        steps: computed(() => steps),
        currentStep: computed(() => steps[store.stepIndex]),
        resolveTarget: (step: TourStep) => document.querySelector<HTMLElement>(`[data-target="${step.id}"]`),
        isWideLayout: () => true,
        layoutScope: () => 'wide' as const,
        runStep: (step: TourStep) => new Promise<void>((resolve) => { pending.set(step.id, resolve) }),
        startTour: vi.fn(),
        exitTour: vi.fn(async () => { store.exit() }),
        finishTour: vi.fn(() => { store.exit() }),
      }
    })
  })

  it("does not paint a navigating step's pre-navigation target before runStep resolves", async () => {
    const store = useTourStore()
    mount(TourLayer)

    store.start('wide', 2, '/test') // step 'a', no target
    await flushPromises()
    pending.get('a')!()
    await flushPromises()

    store.next() // step 'nav': route '/other' differs from the stubbed '/test'
    await flushPromises()
    expect(pending.has('nav')).toBe(true)

    // The pre-paint pass has already run (it happens before `runStep` is
    // awaited); the fix must have refused to paint here, not found the
    // still-present, coincidentally-matching element.
    const region = document.querySelector('[data-region="nav"]')!
    expect(region.hasAttribute('data-tour-focus')).toBe(false)

    // Once runStep (standing in for the navigation) resolves, the
    // post-runStep pass is authoritative and paints normally.
    pending.get('nav')!()
    await flushPromises()
    expect(region.hasAttribute('data-tour-focus')).toBe(true)
  })
})
