import { describe, expect, it } from 'vitest'
import { TOUR_CHAPTERS, tourSteps } from '../content/tour'
import { enabledCases, getCase } from '../content/cases'

const LAYOUTS = ['wide', 'narrow'] as const

describe('tour script', () => {
  it('every step with a demo also carries fallback copy', () => {
    // Non-negotiable: on GitHub Pages a 20-30MB volume routinely misses the
    // demo window, and a step with no fallback would have nothing to say.
    for (const layout of LAYOUTS) {
      for (const step of tourSteps(layout)) {
        if (step.demo) expect(step.bodyFallback, `${layout}/${step.id}`).toBeTruthy()
      }
    }
  })

  it('every step with a demo declares which stage it needs', () => {
    for (const layout of LAYOUTS) {
      for (const step of tourSteps(layout)) {
        if (step.demo) expect(step.requiresStage, `${layout}/${step.id}`).toBeTruthy()
      }
    }
  })

  it('every route points at a case that actually ships', () => {
    const slugs = new Set(enabledCases().map(c => c.slug))
    for (const layout of LAYOUTS) {
      for (const step of tourSteps(layout)) {
        if (!step.route) continue
        const [, slug, modality] = step.route.split('/')
        expect(slugs.has(slug!), `${layout}/${step.id}: unknown slug ${slug}`).toBe(true)
        const ids = getCase(slug!)!.modalities.map(m => m.id)
        expect(ids, `${layout}/${step.id}`).toContain(modality)
      }
    }
  })

  it('step ids are unique within a layout', () => {
    for (const layout of LAYOUTS) {
      const ids = tourSteps(layout).map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('both layouts cover all four chapters', () => {
    for (const layout of LAYOUTS) {
      const chapters = new Set(tourSteps(layout).map(s => s.chapter))
      expect([...chapters].sort()).toEqual(TOUR_CHAPTERS.map(c => c.id).sort())
    }
  })

  it('steps are grouped by chapter in chapter order, never interleaved', () => {
    const order = TOUR_CHAPTERS.map(c => c.id)
    for (const layout of LAYOUTS) {
      const seen = tourSteps(layout).map(s => order.indexOf(s.chapter))
      expect(seen).toEqual([...seen].sort((a, b) => a - b))
    }
  })

  it('the lesion chapter targets the lightest cancer case', () => {
    // cancer-ductal is 14.7MB; cancer-lobular is 72MB. Measured, not chosen.
    const routes = tourSteps('wide').filter(s => s.route).map(s => s.route)
    expect(routes).toContain('/cancer-ductal/mri')
  })

  it('the first chapter needs no stage at all, so it can start instantly', () => {
    for (const layout of LAYOUTS) {
      const first = tourSteps(layout).filter(s => s.chapter === 'layout')
      expect(first.every(s => !s.demo && !s.requiresStage)).toBe(true)
      expect(first.length).toBeGreaterThanOrEqual(4)
    }
  })
})
