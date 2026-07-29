import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CaseHeader from '../app/components/content/CaseHeader.vue'
import ModalityText from '../app/components/content/ModalityText.vue'
import { splitLede } from '../app/components/content/splitLede'
import ModalityStepper from '../app/components/stage/ModalityStepper.vue'
import StageControls from '../app/components/stage/StageControls.vue'
import { getModality } from '../content/cases'
import CasePage from '../app/pages/case/[slug]/[[modality]].vue'

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
      <div class="stepper-slot"><slot name="stepper" /></div>
      <div class="stage-slot"><slot name="stage" /></div>
      <div class="controls-slot"><slot name="controls" /></div>
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
const CopperStageStub = {
  props: ['slug', 'group', 'lesionSliceIndex', 'modality'],
  template: `<div
    class="copper-stage-stub"
    :data-slug="slug"
    :data-group="group"
    :data-lesion="lesionSliceIndex"
  >{{ modality.id }}</div>`,
}

function mountPage() {
  return mount(CasePage, {
    global: {
      stubs: { NuxtLayout: NuxtLayoutStub, NuxtLink: NuxtLinkStub, CopperStage: CopperStageStub },
      // Nuxt auto-registers these three by directory scanning at build
      // time (nuxt.config.ts's `components: [{ pathPrefix: false }]`);
      // plain Vitest has no such step, so they need registering by hand to
      // render for real rather than warning and rendering nothing.
      components: { CaseHeader, ModalityStepper, ModalityText, StageControls },
    },
  })
}

describe('case page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    capturedPageMeta = undefined
  })

  it('renders heading/stepper/stage/content into NuxtLayout\'s slots, falling back to the first modality', () => {
    stubRoute({ slug: 'density-d', modality: undefined })
    const wrapper = mountPage()

    // The stage slot now renders CopperStage (stubbed above); what matters
    // is that it receives the resolved Modality and the case slug (Task 8
    // needs both to namespace copper3d scenes as `${slug}:${modality.id}`).
    expect(wrapper.find('.stage-slot .copper-stage-stub').text()).toBe('anatomy')
    expect(wrapper.find('.stage-slot .copper-stage-stub').attributes('data-slug')).toBe('density-d')
    // Case heading lives in its own #heading slot (design doc §10.1's ASCII
    // puts it atop the stage column, not the content column).
    expect(wrapper.find('.heading-slot h1').text()).toBe('Extremely dense')
    expect(wrapper.find('.content-slot h1').exists()).toBe(false)
    // The modality stepper (also atop the stage column, its own #stepper
    // slot) carries the active modality's label instead of a caption in
    // the content column.
    expect(wrapper.find('.stepper-slot').text()).toContain('Anatomy')
    expect(wrapper.find('.stepper-slot a[aria-current="step"]').text()).toContain('Anatomy')
  })

  it('honours an explicit modality in the URL instead of the fallback', () => {
    stubRoute({ slug: 'cancer-dcis', modality: 'mri' })
    const wrapper = mountPage()

    expect(wrapper.find('.heading-slot h1').text()).toBe('DCIS')
    expect(wrapper.find('.stepper-slot a[aria-current="step"]').text()).toContain('3D MRI')
    expect(wrapper.find('.stage-slot .copper-stage-stub').text()).toBe('mri')
    // cancer-dcis has no anatomy modality (design doc §3.1's asset audit) --
    // the stepper must never hard-code the modality sequence.
    expect(wrapper.find('.stepper-slot').text()).not.toContain('Anatomy')
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

  // Task 10, controller correction C13: the control bar renders into the
  // layout's own #controls slot rather than overlaying the canvas, so the
  // page -- the nearest common ancestor of the two sibling slots -- is what
  // wires them together.
  it('renders the control bar into the layout\'s #controls slot, not into the stage', () => {
    stubRoute({ slug: 'density-d', modality: undefined })
    const wrapper = mountPage()

    const bar = wrapper.find('.controls-slot')
    expect(bar.text()).toContain('Reset view')
    expect(bar.text()).toContain('Fullscreen')
    expect(wrapper.find('.stage-slot').text()).not.toContain('Reset view')
  })

  // Asserted on the prop rather than on the rendered button: the locator
  // also needs a slice stack to glide through, and that only arrives once
  // the (here stubbed out) stage has actually loaded a volume.
  // StageControls.test.ts covers the button's own gating.
  it('tells the control bar which slice holds this case\'s lesion, and zero when it has none', () => {
    stubRoute({ slug: 'cancer-dcis', modality: 'mri' })
    expect(mountPage().findComponent(StageControls).props('lesionSliceIndex')).toBe(90)

    stubRoute({ slug: 'density-d', modality: 'mri' })
    expect(mountPage().findComponent(StageControls).props('lesionSliceIndex')).toBe(0)
  })

  it('gives the stage the case fields its §7 transitions depend on', () => {
    stubRoute({ slug: 'cancer-dcis', modality: 'mri' })
    const stage = mountPage().find('.copper-stage-stub')
    expect(stage.attributes('data-group')).toBe('cancer')
    expect(stage.attributes('data-lesion')).toBe('90')

    // A case with no lesion must send 0, never `undefined` -- `Case`'s own
    // field is optional and the four density cases simply omit it.
    stubRoute({ slug: 'density-d', modality: 'mri' })
    expect(mountPage().find('.copper-stage-stub').attributes('data-lesion')).toBe('0')
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
