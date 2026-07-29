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
   * Regression test for a real bug: the active step's number chip used to
   * be `bg-current text-surface` on the *same* element. `bg-current`
   * resolves against that element's own `color`, which `text-surface` had
   * just set to white -- a 1.00:1 white-on-white chip, on exactly the step
   * that matters. A `class` string assertion on the old markup would still
   * have read as "has a background, has white text" and passed; this
   * asserts there is no `bg-current` at all, and that the chip instead
   * carries an explicit, modality-specific ink background (whose contrast
   * against white is separately pinned in nav-contrast.test.ts).
   */
  it('the active step\'s number chip never uses bg-current, and pairs an explicit ink background with white text', () => {
    const wrapper = mountStepper('anatomy')
    const activeLink = wrapper.get('a[aria-current="step"]')
    const chip = activeLink.find('span')

    expect(chip.classes()).not.toContain('bg-current')
    expect(chip.classes()).toContain('bg-anatomy-ink')
    expect(chip.classes()).toContain('text-surface')
    // The chip is the only element carrying `text-surface`/`bg-*-ink` for
    // this step -- no leftover nested span duplicating the colour class.
    expect(activeLink.findAll('span.text-surface')).toHaveLength(1)
  })

  it('picks the right ink background per modality, not just for anatomy', () => {
    const wrapper = mountStepper('mri')
    const chip = wrapper.get('a[aria-current="step"]').find('span')
    expect(chip.classes()).toContain('bg-mri-ink')
    expect(chip.classes()).not.toContain('bg-anatomy-ink')
  })

  it('inactive steps ring and connect with text-muted, not the sub-3:1 border-strong', () => {
    const wrapper = mountStepper('anatomy')
    const inactiveLinks = wrapper.findAll('a').filter(a => a.attributes('aria-current') === undefined)
    expect(inactiveLinks.length).toBeGreaterThan(0)

    for (const link of inactiveLinks) {
      const chip = link.find('span')
      expect(chip.classes()).toContain('border-text-muted')
      expect(chip.classes()).not.toContain('border-border-strong')
    }

    const connectors = wrapper.findAll('li > span[aria-hidden="true"].mx-1')
    expect(connectors.length).toBeGreaterThan(0)
    for (const connector of connectors) {
      expect(connector.classes()).toContain('bg-text-muted')
      expect(connector.classes()).not.toContain('bg-border-strong')
    }
  })

})
