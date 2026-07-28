import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useViewerStore } from '../app/stores/viewer'
import { enabledCases } from '../content/cases'
import CaseSidebar from '../app/components/nav/CaseSidebar.vue'

const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function mountSidebar() {
  return mount(CaseSidebar, {
    global: { stubs: { NuxtLink: NuxtLinkStub } },
  })
}

describe('CaseSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the nav landmark AppHeader\'s hamburger points at', () => {
    const wrapper = mountSidebar()
    expect(wrapper.get('nav').attributes('id')).toBe('case-sidebar')
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Cases')
  })

  it('lists exactly the enabled cases, never the disabled one', () => {
    const wrapper = mountSidebar()
    const links = wrapper.findAllComponents(NuxtLinkStub)
    expect(links).toHaveLength(enabledCases().length)
    const hrefs = links.map(l => l.props('to'))
    expect(hrefs).not.toContain('/case/benign-calcifications')
    for (const c of enabledCases()) {
      expect(hrefs).toContain(`/case/${c.slug}`)
    }
  })

  it('does not render a group heading for the label-less overview group', () => {
    const wrapper = mountSidebar()
    const headings = wrapper.findAll('h2').map(h => h.text())
    expect(headings).not.toContain('')
    expect(headings).toEqual(['Breast Density', 'Benign Conditions', 'Breast Cancer'])
  })

  it('marks the case matching store.caseSlug as current, and only that one', () => {
    const store = useViewerStore()
    store.caseSlug = 'density-c'
    const wrapper = mountSidebar()
    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]!.attributes('href')).toBe('/case/density-c')
  })

  it('re-renders the active link when the store slug changes', async () => {
    const store = useViewerStore()
    store.caseSlug = 'the-breast'
    const wrapper = mountSidebar()
    expect(wrapper.get('a[aria-current="page"]').attributes('href')).toBe('/case/the-breast')

    store.caseSlug = 'cancer-dcis'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('a[aria-current="page"]').attributes('href')).toBe('/case/cancer-dcis')
  })
})
