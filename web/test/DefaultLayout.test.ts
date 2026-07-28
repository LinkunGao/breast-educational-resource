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

  it('starts with the drawer closed, so a narrow first load is not covered by it', () => {
    // Regression test for the sidebarOpen default: a phone-width visitor's
    // first paint must be the case they came for, not a drawer + scrim over
    // it. Deliberately does NOT set store.sidebarOpen -- this exercises the
    // store's actual default, not a value forced by the test.
    const wrapper = mountLayout()
    const sidebar = wrapper.getComponent(CaseSidebarStub)
    expect(sidebar.classes()).toContain('max-xl:-translate-x-full')
    expect(sidebar.classes()).not.toContain('max-xl:translate-x-0')
    expect(wrapper.find('button[aria-label="Close case navigation"]').exists()).toBe(false)
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

  it('also toggles visible/invisible (not just the transform), so a closed drawer leaves the tab order', async () => {
    // A `-translate-x-full` element is still visible and focusable by
    // default; only `visibility: hidden` removes a closed off-canvas drawer
    // from keyboard/screen-reader traversal. Both are max-xl:-scoped so xl+
    // (where the sidebar is resident, not a drawer) is never affected.
    const store = useViewerStore()
    store.sidebarOpen = false
    const wrapper = mountLayout()
    const sidebar = wrapper.getComponent(CaseSidebarStub)
    expect(sidebar.classes()).toContain('max-xl:invisible')
    expect(sidebar.classes()).not.toContain('max-xl:visible')

    store.sidebarOpen = true
    await wrapper.vm.$nextTick()
    expect(sidebar.classes()).toContain('max-xl:visible')
    expect(sidebar.classes()).not.toContain('max-xl:invisible')
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

  it('insets the scrim below the header, so it never dims/blocks the header', async () => {
    // A `fixed inset-0` scrim paints over the header too: with the drawer
    // open the header looks dimmed and clicking the logo/About just closes
    // the drawer instead of navigating. top-14 matches AppHeader's own h-14.
    const store = useViewerStore()
    store.sidebarOpen = true
    const wrapper = mountLayout()
    const scrim = wrapper.get('button[aria-label="Close case navigation"]')
    expect(scrim.classes()).toContain('top-14')
    expect(scrim.classes()).not.toContain('inset-0')
  })

  it('has exactly one <main> landmark wrapping stage and content, with no <aside> mislabelling the copy', () => {
    const wrapper = mountLayout()
    const mains = wrapper.findAll('main')
    expect(mains).toHaveLength(1)
    expect(mains[0]!.attributes('id')).toBe('main-content')
    // A skip-link target needs to be programmatically focusable.
    expect(mains[0]!.attributes('tabindex')).toBe('-1')
    expect(mains[0]!.find('.stage-marker').exists()).toBe(true)
    expect(mains[0]!.find('.content-marker').exists()).toBe(true)
    expect(wrapper.find('aside').exists()).toBe(false)
  })

  it('gives the stage an accessible name', () => {
    const wrapper = mountLayout()
    const stage = wrapper.find('.stage-marker').element.closest('section')
    expect(stage?.getAttribute('aria-label')).toBeTruthy()
  })

  it('gives the stage a minimum height below xl, so it cannot be flexed to 0', () => {
    // In a column flex layout with a shrink-0 sibling, flex-1 alone lets a
    // flex-basis-0 stage resolve to 0px once content exceeds the container
    // (negative free space defeats flex-grow). A min-height floors it.
    const wrapper = mountLayout()
    const stage = wrapper.find('.stage-marker').element.closest('section')
    expect(stage?.className).toMatch(/max-xl:min-h-\d/)
  })

  it('has a skip link, as the very first focusable element, targeting #main-content', () => {
    const wrapper = mountLayout()
    const skipLink = wrapper.get('a[href="#main-content"]')
    expect(skipLink.text()).toMatch(/skip/i)
    // "First focusable element" -- must precede the header in DOM order.
    const html = wrapper.html()
    expect(html.indexOf('#main-content')).toBeLessThan(html.indexOf('<header'))
  })

  it('decides layout tiers purely in CSS: no window/matchMedia/userAgent probing', () => {
    // Regression guard for the global constraint this task is scoped around:
    // the old Vue 2 app measured panel height in JS and re-measured on
    // `updated()`, so the pre-rendered markup was phone-shaped for every
    // visitor until the bundle ran. Reads the raw SFC source (not the
    // compiled component) so a reintroduced `window.innerWidth` read would
    // fail this even if it were buried inside a computed property. Covers
    // all three of Task 5's own files, not just this one -- the same
    // mistake in AppHeader or CaseSidebar would be just as much a
    // reintroduction of the bug this guards against. (CaseSidebar
    // deliberately uses `getComputedStyle(el).position` to gate its focus
    // trap -- that's a point-in-time read of what CSS already decided for
    // one element, not a duplicated pixel threshold, so it isn't in this
    // banned list; see the comment above `isDrawerMode` in CaseSidebar.vue.)
    const files = [
      '../app/layouts/default.vue',
      '../app/components/nav/AppHeader.vue',
      '../app/components/nav/CaseSidebar.vue',
    ]
    for (const file of files) {
      const src = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), file),
        'utf8',
      )
      expect(src, `${file}: window.innerWidth/outerWidth`).not.toMatch(/window\.(inner|outer)(Width|Height)/)
      expect(src, `${file}: matchMedia`).not.toMatch(/matchMedia/)
      expect(src, `${file}: navigator.userAgent`).not.toMatch(/navigator\.userAgent/)
      expect(src, `${file}: ResizeObserver`).not.toMatch(/ResizeObserver/)
    }
  })
})
