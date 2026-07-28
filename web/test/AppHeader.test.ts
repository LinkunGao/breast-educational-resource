import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useViewerStore } from '../app/stores/viewer'
import AppHeader from '../app/components/nav/AppHeader.vue'

const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function mountHeader() {
  return mount(AppHeader, {
    global: { stubs: { NuxtLink: NuxtLinkStub } },
  })
}

describe('AppHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reflects the store\'s sidebarOpen state on the toggle button', () => {
    const store = useViewerStore()
    store.sidebarOpen = false
    const wrapper = mountHeader()
    const toggle = wrapper.get('button[aria-controls="case-sidebar"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('toggles store.sidebarOpen when the hamburger is clicked', async () => {
    const store = useViewerStore()
    store.sidebarOpen = false
    const wrapper = mountHeader()
    await wrapper.get('button[aria-controls="case-sidebar"]').trigger('click')
    expect(store.sidebarOpen).toBe(true)
    await wrapper.get('button[aria-controls="case-sidebar"]').trigger('click')
    expect(store.sidebarOpen).toBe(false)
  })

  it('aria-controls matches the id CaseSidebar renders, so the a11y contract holds', () => {
    const wrapper = mountHeader()
    expect(wrapper.get('button').attributes('aria-controls')).toBe('case-sidebar')
  })

  it('links to home and about', () => {
    const wrapper = mountHeader()
    const links = wrapper.findAllComponents(NuxtLinkStub)
    const targets = links.map(l => l.props('to'))
    expect(targets).toContain('/')
    expect(targets).toContain('/about')
  })
})
