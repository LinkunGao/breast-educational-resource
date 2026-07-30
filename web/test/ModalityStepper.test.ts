import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ModalityStepper from '../app/components/stage/ModalityStepper.vue'
import { getCase } from '../content/cases'
import type { ModalityId } from '../content/types'

// Matches the stub CaseSidebar.test.ts / CasePage.test.ts already use:
// plain Vitest has no Nuxt router to resolve <NuxtLink> against.
const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function mountStepper(active: ModalityId) {
  const modalities = getCase('density-d')!.modalities // anatomy, mammogram, mri
  return mount(ModalityStepper, {
    props: { modalities, active, slug: 'density-d' },
    global: { stubs: { NuxtLink: NuxtLinkStub } },
  })
}

describe('ModalityStepper', () => {
  /**
   * The numbered chips are gone. They existed to carry the step number, and
   * the step order is now conveyed by the `<ol>` and by arrangement instead
   * -- see the component's own comment on why four marks per step was three
   * too many.
   *
   * What replaced the chip's job of marking the active step is the ink
   * colour plus an underline rule, so that is what gets pinned. The old
   * chip's real bug -- `bg-current text-surface` on one element, resolving
   * to white-on-white at 1.00:1 -- is unrepresentable now: no element in
   * this component sets both a background and a foreground.
   */
  it('marks the active step with the modality ink and an underline rule, not a chip', () => {
    const wrapper = mountStepper('anatomy')
    const activeLink = wrapper.get('a[aria-current="step"]')

    expect(activeLink.classes()).toContain('text-anatomy-ink')
    expect(activeLink.classes()).toContain('after:opacity-100')
    expect(activeLink.classes()).not.toContain('bg-current')
    expect(wrapper.findAll('.bg-current')).toHaveLength(0)
  })

  it('picks the right ink per modality, not just for anatomy', () => {
    const wrapper = mountStepper('mri')
    const activeLink = wrapper.get('a[aria-current="step"]')
    expect(activeLink.classes()).toContain('text-mri-ink')
    expect(activeLink.classes()).not.toContain('text-anatomy-ink')
  })

  it('gives every step an icon whose paths differ per modality', () => {
    // The previous icons were abstract geometry with no relationship to the
    // modality. Nothing here can check that a path LOOKS like a transducer,
    // but it can check that four distinct drawings exist rather than one
    // shape recoloured -- which is the failure mode a copy-paste would
    // produce.
    const wrapper = mountStepper('anatomy')
    const drawings = wrapper.findAll('svg').map(
      svg => svg.findAll('path').map(p => p.attributes('d')).join('|'),
    )
    expect(drawings.length).toBeGreaterThan(1)
    expect(new Set(drawings).size).toBe(drawings.length)
    for (const d of drawings) expect(d.length).toBeGreaterThan(0)
  })

  it('inactive steps use text-muted, not the sub-3:1 border-strong', () => {
    const wrapper = mountStepper('anatomy')
    const inactiveLinks = wrapper.findAll('a').filter(a => a.attributes('aria-current') === undefined)
    expect(inactiveLinks.length).toBeGreaterThan(0)

    for (const link of inactiveLinks) {
      expect(link.classes()).toContain('text-text-muted')
      expect(link.classes()).not.toContain('text-border-strong')
      // The underline rule exists on every step and is faded out on the
      // inactive ones, so the active marker cannot shift layout on hover.
      expect(link.classes()).toContain('after:opacity-0')
    }
  })

})
