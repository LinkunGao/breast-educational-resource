import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useViewerStore } from '../app/stores/viewer'
import DefaultLayout from '../app/layouts/default.vue'

// AppHeader/CaseSidebar are Task 5's own components but aren't under test
// here -- this file is about the shell's responsive class wiring, which is
// independent of what those two components render.
const AppHeaderStub = { template: '<header />' }
const CaseSidebarStub = { template: '<nav id="case-sidebar" />' }

function mountLayout() {
  return mount(DefaultLayout, {
    global: {
      stubs: { AppHeader: AppHeaderStub, CaseSidebar: CaseSidebarStub },
    },
    slots: {
      stage: '<div class="stage-marker">stage content</div>',
      content: '<div class="content-marker">content content</div>',
    },
  })
}

describe('default layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders both slots into the layout', () => {
    const wrapper = mountLayout()
    expect(wrapper.find('.stage-marker').exists()).toBe(true)
    expect(wrapper.find('.content-marker').exists()).toBe(true)
  })

  it('translates the sidebar drawer on/off screen based on store.sidebarOpen (below xl)', async () => {
    const store = useViewerStore()
    store.sidebarOpen = false
    const wrapper = mountLayout()
    const sidebar = wrapper.getComponent(CaseSidebarStub)
    expect(sidebar.classes()).toContain('max-xl:-translate-x-full')
    expect(sidebar.classes()).not.toContain('max-xl:translate-x-0')

    store.sidebarOpen = true
    await wrapper.vm.$nextTick()
    expect(sidebar.classes()).toContain('max-xl:translate-x-0')
    expect(sidebar.classes()).not.toContain('max-xl:-translate-x-full')
  })

  it('only renders the drawer overlay while the sidebar is explicitly open', async () => {
    const store = useViewerStore()
    store.sidebarOpen = false
    const wrapper = mountLayout()
    expect(wrapper.find('button[aria-label="Close case navigation"]').exists()).toBe(false)

    store.sidebarOpen = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button[aria-label="Close case navigation"]').exists()).toBe(true)
  })

  it('clicking the overlay closes the sidebar', async () => {
    const store = useViewerStore()
    store.sidebarOpen = true
    const wrapper = mountLayout()
    await wrapper.get('button[aria-label="Close case navigation"]').trigger('click')
    expect(store.sidebarOpen).toBe(false)
  })

  it('decides layout tiers purely in CSS: no window/matchMedia/userAgent probing', () => {
    // Regression guard for the global constraint this task is scoped around:
    // the old Vue 2 app measured panel height in JS and re-measured on
    // `updated()`, so the pre-rendered markup was phone-shaped for every
    // visitor until the bundle ran. Reads the raw SFC source (not the
    // compiled component) so a reintroduced `window.innerWidth` read would
    // fail this even if it were buried inside a computed property.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../app/layouts/default.vue'),
      'utf8',
    )
    expect(src).not.toMatch(/window\.(inner|outer)(Width|Height)/)
    expect(src).not.toMatch(/matchMedia/)
    expect(src).not.toMatch(/navigator\.userAgent/)
    expect(src).not.toMatch(/ResizeObserver/)
  })
})
