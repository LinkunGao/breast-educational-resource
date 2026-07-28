import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      <div class="stage-slot"><slot name="stage" /></div>
      <div class="content-slot"><slot name="content" /></div>
    </div>
  `,
}

function mountPage() {
  return mount(CasePage, {
    global: { stubs: { NuxtLayout: NuxtLayoutStub } },
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

    expect(wrapper.find('.stage-slot').text()).toContain('Anatomy')
    // Case heading lives in its own #heading slot (design doc §10.1's ASCII
    // puts it atop the stage column, not the content column).
    expect(wrapper.find('.heading-slot h1').text()).toBe('Extremely dense')
    expect(wrapper.find('.content-slot h1').exists()).toBe(false)
    expect(wrapper.find('.content-slot p.text-caption').text()).toBe('Anatomy')
  })

  it('honours an explicit modality in the URL instead of the fallback', () => {
    stubRoute({ slug: 'cancer-dcis', modality: 'mri' })
    const wrapper = mountPage()

    expect(wrapper.find('.heading-slot h1').text()).toBe('DCIS')
    expect(wrapper.find('.content-slot p.text-caption').text()).toBe('3D MRI')
    expect(wrapper.find('.stage-slot').text()).toContain('3D MRI')
  })

  it('renders the frozen medical copy for the resolved modality, byte for byte', () => {
    stubRoute({ slug: 'benign-cyst', modality: 'ultrasound' })
    const wrapper = mountPage()
    const expected = getModality('benign-cyst', 'ultrasound')!.text
    // Rendered via v-html, so compare against the source paragraph's raw HTML.
    expect(wrapper.find('.content-slot .prose-medical').element.innerHTML).toBe(expected)
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
