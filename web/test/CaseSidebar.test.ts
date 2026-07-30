import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** Focus assertions need real DOM attachment (`document.activeElement`
 *  otherwise never updates) and a way to simulate "below xl" without a
 *  real browser evaluating the `max-xl:fixed` rule, since Tailwind's
 *  compiled CSS isn't loaded in these component tests. CaseSidebar reads
 *  drawer-vs-resident mode via `getComputedStyle(nav).position`, so
 *  stubbing that single browser API is enough to exercise the real
 *  trap/Escape/focus-move logic exactly as it runs in a browser below xl. */
function mountSidebarAsDrawer(open: boolean) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue(
    { position: 'fixed' } as CSSStyleDeclaration,
  )
  const store = useViewerStore()
  store.sidebarOpen = open
  return mount(CaseSidebar, {
    attachTo: document.body,
    global: { stubs: { NuxtLink: NuxtLinkStub } },
  })
}

describe('CaseSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders the nav landmark AppHeader\'s hamburger points at', () => {
    const wrapper = mountSidebar()
    expect(wrapper.get('nav').attributes('id')).toBe('case-sidebar')
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Cases')
  })

  it('lists exactly the enabled cases, never the disabled one', () => {
    const wrapper = mountSidebar()
    // Scoped to the case list. The sidebar also carries a partner-logo link
    // to /about at its foot, which is not a case and must not be counted --
    // an unscoped `findAllComponents` made this test fail the moment that
    // link was added, for no defect.
    const links = wrapper.findAll('li a')
      .map(el => wrapper.findAllComponents(NuxtLinkStub).find(c => c.element === el.element)!)
    expect(links).toHaveLength(enabledCases().length)
    const hrefs = links.map(l => l.props('to'))
    expect(hrefs).not.toContain('/benign-calcifications')
    for (const c of enabledCases()) {
      expect(hrefs).toContain(`/${c.slug}`)
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
    expect(current[0]!.attributes('href')).toBe('/density-c')
  })

  it('re-renders the active link when the store slug changes', async () => {
    const store = useViewerStore()
    store.caseSlug = 'the-breast'
    const wrapper = mountSidebar()
    expect(wrapper.get('a[aria-current="page"]').attributes('href')).toBe('/the-breast')

    store.caseSlug = 'cancer-dcis'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('a[aria-current="page"]').attributes('href')).toBe('/cancer-dcis')
  })

  describe('modal behaviour while it is the below-xl drawer', () => {
    it('moves focus to the first case link when the drawer opens', async () => {
      const wrapper = mountSidebarAsDrawer(false)
      const store = useViewerStore()
      store.sidebarOpen = true
      await wrapper.vm.$nextTick() // watcher fires
      await wrapper.vm.$nextTick() // nextTick() inside the watcher resolves
      expect(document.activeElement).toBe(wrapper.get('a').element)
    })

    it('returns focus to whatever triggered the open, once the drawer closes', async () => {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()
      expect(document.activeElement).toBe(trigger)

      const wrapper = mountSidebarAsDrawer(false)
      const store = useViewerStore()
      store.sidebarOpen = true
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      expect(document.activeElement).not.toBe(trigger)

      store.sidebarOpen = false
      await wrapper.vm.$nextTick()
      expect(document.activeElement).toBe(trigger)
      trigger.remove()
    })

    it('Escape closes the drawer', async () => {
      const wrapper = mountSidebarAsDrawer(true)
      const store = useViewerStore()
      await wrapper.get('nav').trigger('keydown', { key: 'Escape' })
      expect(store.sidebarOpen).toBe(false)
    })

    it('Tab on the last link wraps focus back to the first (and Shift+Tab wraps the other way)', async () => {
      const wrapper = mountSidebarAsDrawer(true)
      const links = wrapper.findAll('a')
      const first = links[0]!.element as HTMLElement
      const last = links[links.length - 1]!.element as HTMLElement

      last.focus()
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      last.dispatchEvent(tabEvent)
      expect(tabEvent.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(first)

      first.focus()
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
      first.dispatchEvent(shiftTabEvent)
      expect(shiftTabEvent.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(last)
    })

    it('does none of this at xl+, where the same <nav> is not a modal', async () => {
      // Same component, same store state, but getComputedStyle reports the
      // resident (non-fixed) position xl+ actually renders it with.
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(
        { position: 'static' } as CSSStyleDeclaration,
      )
      const store = useViewerStore()
      store.sidebarOpen = true
      const wrapper = mount(CaseSidebar, {
        attachTo: document.body,
        global: { stubs: { NuxtLink: NuxtLinkStub } },
      })
      await wrapper.get('nav').trigger('keydown', { key: 'Escape' })
      expect(store.sidebarOpen).toBe(true) // unaffected -- desktop nav ignores Escape
    })
  })
})
