import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useViewerStore } from '../app/stores/viewer'
import AppHeader from '../app/components/nav/AppHeader.vue'
import CaseSidebar from '../app/components/nav/CaseSidebar.vue'
import DefaultLayout from '../app/layouts/default.vue'

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

  it('aria-controls matches the id CaseSidebar actually renders, so the a11y contract holds', () => {
    // Previously compared aria-controls to the literal 'case-sidebar' without
    // ever mounting CaseSidebar, so renaming CaseSidebar's id would still
    // pass. Mounting both and comparing the live values means either side
    // drifting from the other actually fails this.
    const header = mountHeader()
    const sidebar = mount(CaseSidebar, { global: { stubs: { NuxtLink: NuxtLinkStub } } })
    expect(header.get('button').attributes('aria-controls'))
      .toBe(sidebar.get('nav').attributes('id'))
  })

  it('links to home and about', () => {
    const wrapper = mountHeader()
    const links = wrapper.findAllComponents(NuxtLinkStub)
    const targets = links.map(l => l.props('to'))
    expect(targets).toContain('/')
    expect(targets).toContain('/about')
  })

  it('the hamburger and the About link both meet the 44px tap-target floor', () => {
    // happy-dom has no real layout engine, so this can't measure actual
    // rendered pixels -- it asserts the Tailwind utilities that are the only
    // thing controlling the size (size-11 = 44px, min-h-11 = 44px min
    // height). Sizing needs a real browser to confirm the rendered box.
    const wrapper = mountHeader()
    const hamburger = wrapper.get('button[aria-controls="case-sidebar"]')
    expect(hamburger.classes()).toContain('size-11')

    const about = wrapper.findAllComponents(NuxtLinkStub)
      .find(l => l.props('to') === '/about')!
    expect(about.classes()).toContain('min-h-11')
  })

  it('the case-nav toggle stays visible at every width (design doc §10.1: xl+ collapses, it does not hide)', () => {
    // Below xl this opens/closes a drawer; at xl+ the same control instead
    // collapses the resident sidebar to 0 width -- so unlike a mobile-only
    // hamburger, it must never carry `xl:hidden`.
    const wrapper = mountHeader()
    const hamburger = wrapper.get('button[aria-controls="case-sidebar"]')
    expect(hamburger.classes()).not.toContain('xl:hidden')
  })

  describe('content-panel toggle (design doc §10.1, desktop-only)', () => {
    it('reflects and toggles store.contentOpen', async () => {
      const store = useViewerStore()
      store.contentOpen = true
      const wrapper = mountHeader()
      const toggle = wrapper.get('button[aria-label="Toggle content panel"]')
      expect(toggle.attributes('aria-expanded')).toBe('true')

      await toggle.trigger('click')
      expect(store.contentOpen).toBe(false)
      expect(toggle.attributes('aria-expanded')).toBe('false')
    })

    it('only renders (as a flex box) at xl+, since below xl the content pane has no collapse concept', () => {
      const wrapper = mountHeader()
      const toggle = wrapper.get('button[aria-label="Toggle content panel"]')
      expect(toggle.classes()).toContain('hidden')
      expect(toggle.classes()).toContain('xl:flex')
    })

    it('aria-controls matches the id the content panel actually renders, so the a11y contract holds', () => {
      const header = mountHeader()
      const layout = mount(DefaultLayout, {
        global: {
          stubs: {
            AppHeader: { template: '<header />' },
            CaseSidebar: { template: '<nav id="case-sidebar" />' },
          },
        },
        slots: { stage: '<div />', content: '<div />' },
      })
      expect(header.get('button[aria-label="Toggle content panel"]').attributes('aria-controls'))
        .toBe(layout.get('#case-content-panel').attributes('id'))
    })
  })
})
