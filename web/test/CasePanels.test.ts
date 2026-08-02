import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CasePanels from '../app/components/stage/CasePanels.vue'
import { getCase } from '../content/cases'

const CopperStageStub = {
  props: ['slug', 'group', 'panelLabel', 'lesionSliceIndex', 'modality', 'compact', 'panelId', 'loadEnabled'],
  emits: ['settled'],
  template: '<div data-stub-stage :data-panel-id="panelId" :data-load-enabled="loadEnabled" />',
}

function mountPanels() {
  return mount(CasePanels, {
    props: { case: getCase('the-breast')!, modalityId: 'anatomy' },
    global: {
      stubs: { CopperStage: CopperStageStub, PanelTabs: { template: '<div />' } },
    },
  })
}

function enabledMap(wrapper: ReturnType<typeof mountPanels>) {
  return Object.fromEntries(
    wrapper.findAll('[data-stub-stage]').map(el => [
      el.attributes('data-panel-id'),
      el.attributes('data-load-enabled'),
    ]),
  )
}

describe('CasePanels staged loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('navigateTo', vi.fn())
  })

  it('enables only the focused panel on first paint', () => {
    const wrapper = mountPanels()
    const map = enabledMap(wrapper)
    expect(map.anatomy).toBe('true')
    expect(map.mammogram).toBe('false')
    expect(map.mri).toBe('false')
  })

  it('releases the remaining panels once the focused one settles', async () => {
    const wrapper = mountPanels()
    const focused = wrapper.findAll('[data-stub-stage]')
      .find(el => el.attributes('data-panel-id') === 'anatomy')!
    await focused.getComponent(CopperStageStub).vm.$emit('settled')
    await wrapper.vm.$nextTick()

    const map = enabledMap(wrapper)
    expect(map.mammogram).toBe('true')
    expect(map.mri).toBe('true')
  })

  it('releases the remaining panels after the safety timeout, even with no settle', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanels()
    vi.advanceTimersByTime(15_000)
    await wrapper.vm.$nextTick()
    expect(enabledMap(wrapper).mri).toBe('true')
    vi.useRealTimers()
  })

  it('never re-locks a panel once released', async () => {
    const wrapper = mountPanels()
    const focused = wrapper.findAll('[data-stub-stage]')
      .find(el => el.attributes('data-panel-id') === 'anatomy')!
    await focused.getComponent(CopperStageStub).vm.$emit('settled')
    await wrapper.setProps({ modalityId: 'mri' })
    expect(enabledMap(wrapper).anatomy).toBe('true')
  })
})
