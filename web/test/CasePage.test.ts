import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CaseHeader from '../app/components/content/CaseHeader.vue'
import ModalityText from '../app/components/content/ModalityText.vue'
import { splitLede } from '../app/components/content/splitLede'
import StageControls from '../app/components/stage/StageControls.vue'
import { getModality } from '../content/cases'
import CasePage from '../app/pages/[slug]/[[modality]].vue'

// This page relies on several Nuxt auto-imports that plain Vitest doesn't
// provide: useRoute, useHead, and the definePageMeta macro. test/setup.ts
// already covers ref/computed/watchEffect/useViewerStore; the route-specific
// ones are stubbed per test below since the route params vary per case.
let capturedPageMeta: Record<string, unknown> | undefined

function stubRoute(params: Record<string, string | undefined>) {
  vi.stubGlobal('useRoute', () => ({ params }))
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('definePageMeta', (meta: Record<string, unknown>) => {
    capturedPageMeta = meta
  })
}

const NuxtLayoutStub = {
  template: `
    <div>
      <div class="heading-slot"><slot name="heading" /></div>
      <div class="stage-slot"><slot name="stage" /></div>
      <div class="content-slot"><slot name="content" /></div>
    </div>
  `,
}

// ModalityStepper (rendered into #stepper) links between modalities with
// NuxtLink, matching the stub CaseSidebar.test.ts already uses for the
// same reason: plain Vitest has no Nuxt router to resolve it against.
const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

// Task 7 replaced the #stage placeholder with the real CopperStage, which
// dynamically imports copper3d in onMounted and drives a WebGL canvas --
// none of which plain Vitest/happy-dom can do (no WebGL) or should try to
// (see web/test/*.test.ts's testing notes: don't fake a passing render
// test). Task 8 gave CopperStage a `slug` prop (scene namespacing) and
// widened `modality` from a bare ModalityId to the full Modality object
// (asset/viewPreset paths). Stubbed here, the only thing worth asserting is
// that the page still resolves and forwards the right slug/modality -- the
// same per-modality wiring the old placeholder text used to prove, just via
// props instead of display text now that #stage renders a real viewer.
// Task 10 added `group` and `lesionSliceIndex`: the stage decides which §7
// transition a navigation gets (density morph vs. modality flight) and
// whether "Locate lesion" has anywhere to glide to. Controller correction
// C7 chose those two fields over handing it the whole `Case`.
// Task 5 (three-up plan) moved the stage, the slot strip and the control
// bars all inside CasePanels, so the page's #stage slot now renders that
// one component. What is left for the page to get right is which case and
// which modality it resolves and hands over, which is what this stub
// exposes. CasePanels.test.ts owns everything downstream of it.
const CasePanelsStub = {
  props: ['case', 'modalityId'],
  // `case` is a reserved word, so a bare `case.slug` in a template
  // expression is a syntax error -- reach it through `$props`.
  template: `<div
    class="case-panels-stub"
    :data-slug="$props.case.slug"
    :data-group="$props.case.group"
  >{{ modalityId }}</div>`,
}

function mountPage() {
  return mount(CasePage, {
    global: {
      stubs: { NuxtLayout: NuxtLayoutStub, NuxtLink: NuxtLinkStub, CasePanels: CasePanelsStub },
      // Nuxt auto-registers these by directory scanning at build time
      // (nuxt.config.ts's `components: [{ pathPrefix: false }]`); plain
      // Vitest has no such step, so they need registering by hand to render
      // for real rather than warning and rendering nothing.
      components: { CaseHeader, ModalityText, StageControls },
    },
  })
}

describe('case page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    capturedPageMeta = undefined
  })

  it('renders heading/stage/content into NuxtLayout\'s slots, falling back to the first modality', () => {
    stubRoute({ slug: 'density-d', modality: undefined })
    const wrapper = mountPage()

    // The stage slot renders CasePanels (stubbed above); what matters here
    // is that it receives the resolved case and the resolved modality id.
    expect(wrapper.find('.stage-slot .case-panels-stub').text()).toBe('anatomy')
    expect(wrapper.find('.stage-slot .case-panels-stub').attributes('data-slug')).toBe('density-d')
    // Case heading lives in its own #heading slot (design doc §10.1's ASCII
    // puts it atop the stage column, not the content column).
    expect(wrapper.find('.heading-slot h1').text()).toBe('Extremely dense')
    expect(wrapper.find('.content-slot h1').exists()).toBe(false)
  })

  it('honours an explicit modality in the URL instead of the fallback', () => {
    stubRoute({ slug: 'cancer-dcis', modality: 'mri' })
    const wrapper = mountPage()

    expect(wrapper.find('.heading-slot h1').text()).toBe('DCIS')
    // Client feedback item 2 gave every lesion case an anatomy modality, so
    // anatomy is now cancer-dcis's FIRST modality -- this proves the
    // explicit `mri` param still wins over that fallback.
    expect(wrapper.find('.stage-slot .case-panels-stub').text()).toBe('mri')
  })

  it('renders the frozen medical copy for the resolved modality, byte for byte', () => {
    stubRoute({ slug: 'benign-cyst', modality: 'ultrasound' })
    const wrapper = mountPage()
    const expected = getModality('benign-cyst', 'ultrasound')!.text
    const { lede, rest } = splitLede(expected)

    // Rendered as separate <p v-html> elements (the lede enlarged, the rest
    // as body paragraphs), so compare each against splitLede's own output
    // rather than the whole modality text in one node.
    const paragraphs = wrapper.findAll('.content-slot .prose-medical > p')
    expect(paragraphs[0]!.element.innerHTML).toBe(lede)
    rest.forEach((para, i) => {
      expect(paragraphs[i + 1]!.element.innerHTML).toBe(para)
    })
  })

  /**
   * The control bar is no longer this page's business.
   *
   * It used to render into the layout's `#controls` slot, a sibling of the
   * stage slot, so this page -- their nearest common ancestor -- had to own
   * the state between them. Each stage now renders its own bar under its own
   * canvas, because the three-up layout gives every panel one. What is left
   * for the page to get right is the lesion index it hands the stage, and
   * that is what these two assert. `CopperStage.test.ts` covers the bar
   * itself.
   */
  it('renders no control bar of its own', () => {
    stubRoute({ slug: 'density-d', modality: undefined })
    const wrapper = mountPage()

    expect(wrapper.text()).not.toContain('Reset view')
    expect(wrapper.findComponent(StageControls).exists()).toBe(false)
  })

  /**
   * The lesion index is no longer computed here: three-up shows three
   * modalities at once, so "which slice holds this lesion" is a per-panel
   * question. `CasePanels` asks `lesionSliceIndexFor` per slot, and
   * `CasePanels.test.ts` pins that. What the page still owes is the case
   * itself, unmodified.
   */
  it('gives CasePanels the case its §7 transitions depend on', () => {
    stubRoute({ slug: 'cancer-dcis', modality: 'mri' })
    expect(mountPage().find('.case-panels-stub').attributes('data-group')).toBe('cancer')

    stubRoute({ slug: 'density-d', modality: 'mri' })
    expect(mountPage().find('.case-panels-stub').attributes('data-group')).toBe('density')
  })

  it('the validate guard 404s disabled and unknown cases but not enabled ones', () => {
    stubRoute({ slug: 'the-breast', modality: undefined })
    mountPage()
    const validate = capturedPageMeta!.validate as (route: { params: Record<string, string> }) => boolean

    expect(validate({ params: { slug: 'the-breast' } })).toBe(true)
    expect(validate({ params: { slug: 'benign-calcifications' } })).toBe(false)
    expect(validate({ params: { slug: 'nope' } })).toBe(false)
  })
})
