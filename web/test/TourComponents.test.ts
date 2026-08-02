import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TourCard from '../app/components/tour/TourCard.vue'
import TourRail from '../app/components/tour/TourRail.vue'
import TourSpotlight from '../app/components/tour/TourSpotlight.vue'
import { TOUR_CHAPTERS } from '../content/tour'

const rect = { top: 100, left: 200, width: 300, height: 150 } as DOMRect

describe('TourSpotlight', () => {
  it('positions itself over the target rect', () => {
    const w = mount(TourSpotlight, { props: { rect } })
    const style = w.get('[data-tour-halo]').attributes('style')!
    expect(style).toContain('top: 100px')
    expect(style).toContain('left: 200px')
    expect(style).toContain('width: 300px')
    expect(style).toContain('height: 150px')
  })

  it('renders nothing when there is no target (a centred step)', () => {
    const w = mount(TourSpotlight, { props: { rect: null } })
    expect(w.find('[data-tour-halo]').exists()).toBe(false)
  })
})

const cardProps = {
  title: 'Rotate the model', body: 'demo copy',
  stepNumber: 8, stepCount: 14, chapterLabel: 'Interacting',
  atEnd: false, rect, placement: 'right' as const,
}

describe('TourCard', () => {
  it('shows the chapter, the position and the copy', () => {
    const w = mount(TourCard, { props: cardProps })
    expect(w.text()).toContain('Interacting')
    expect(w.text()).toContain('8')
    expect(w.text()).toContain('14')
    expect(w.text()).toContain('demo copy')
  })

  it('emits next, back and exit', async () => {
    const w = mount(TourCard, { props: cardProps })
    await w.get('[data-tour-next]').trigger('click')
    await w.get('[data-tour-back]').trigger('click')
    await w.get('[data-tour-exit]').trigger('click')
    expect(w.emitted('next')).toHaveLength(1)
    expect(w.emitted('back')).toHaveLength(1)
    expect(w.emitted('exit')).toHaveLength(1)
  })

  it('labels the last step Finish rather than Next', () => {
    const w = mount(TourCard, { props: { ...cardProps, atEnd: true } })
    expect(w.get('[data-tour-next]').text()).toBe('Finish')
  })

  it('is a dialog with its title as the accessible name', () => {
    const w = mount(TourCard, { props: cardProps })
    const dialog = w.get('[role="dialog"]')
    const labelledBy = dialog.attributes('aria-labelledby')!
    expect(w.get(`#${labelledBy}`).text()).toBe('Rotate the model')
  })

  it('every control clears the 44px tap-target floor', () => {
    const w = mount(TourCard, { props: cardProps })
    for (const sel of ['[data-tour-next]', '[data-tour-back]', '[data-tour-exit]']) {
      expect(w.get(sel).classes()).toContain('min-h-11')
    }
  })
})

describe('TourRail', () => {
  const railProps = {
    chapters: TOUR_CHAPTERS, activeChapter: 'interacting' as const,
    stepIndex: 7, stepCount: 14, atEnd: false,
  }

  it('renders one segment per chapter and marks the active one', () => {
    const w = mount(TourRail, { props: railProps })
    const segs = w.findAll('[data-tour-chapter]')
    expect(segs).toHaveLength(TOUR_CHAPTERS.length)
    const active = segs.find(s => s.attributes('data-tour-chapter') === 'interacting')!
    expect(active.attributes('aria-current')).toBe('step')
  })

  it('emits the chapter id when a segment is chosen', async () => {
    const w = mount(TourRail, { props: railProps })
    await w.findAll('[data-tour-chapter]')[0]!.trigger('click')
    expect(w.emitted('chapter')![0]).toEqual(['layout'])
  })

  it('announces position as a live region for screen readers', () => {
    const w = mount(TourRail, { props: railProps })
    const status = w.get('[role="status"]')
    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.text()).toContain('8')
    expect(status.text()).toContain('14')
  })
})
