<script setup lang="ts">
import { getCase, lesionSliceIndexFor } from '~~/content/cases'
import type { ModalityId } from '~~/content/types'

// This must be a route guard, not a setup-time `throw createError`.
// app.vue's <NuxtPage :page-key> now pins this component's instance to the
// case slug only (not the modality param, review fix #6), so the WebGL
// canvas survives modality switches -- setup no longer re-runs on a
// modality-only navigation, so a throw here would only ever catch the
// *first* load of a given case. A `validate` guard runs on every
// navigation regardless of component reuse, so it keeps 404 behaviour
// correct even with the key pinned. Do not "simplify" this back to a
// throw.
definePageMeta({
  validate: (route) => {
    const c = getCase(String(route.params.slug))
    return Boolean(c && !c.disabled)
  },
})

const route = useRoute()
const store = useViewerStore()

const slug = computed(() => String(route.params.slug))
const current = computed(() => getCase(slug.value))

/** Falls back to the first modality in the sequence when the URL omits one. */
const modalityId = computed<ModalityId>(() => {
  const requested = route.params.modality as ModalityId | undefined
  const available = current.value!.modalities.map(m => m.id)
  return requested && available.includes(requested)
    ? requested
    : available[0]
})

const modality = computed(
  () => current.value!.modalities.find(m => m.id === modalityId.value)!,
)

watchEffect(() => {
  store.caseSlug = slug.value
  store.modalityId = modalityId.value
})

useHead(() => ({
  title: `${current.value!.heading} — ${modality.value.label} — Te Uma`,
}))

/**
 * The control bar (design doc §10.1) lives in the layout's `#controls`
 * slot, which is a SIBLING of the stage slot -- so this page, the nearest
 * common ancestor of both, owns the state they share. See
 * useStageControls.ts for why the slot rather than an overlay on the
 * canvas, and why provide/inject rather than a bus.
 */
const stageControls = provideStageControls()

/**
 * §7.2's locate target for the modality actually on screen. Zero on every
 * modality but MRI -- `lesionSliceIndexFor` explains why, and the shipped
 * mammogram volumes are shallower than the index, so this is a correctness
 * gate rather than a presentational one.
 */
const lesionSliceIndex = computed(() => lesionSliceIndexFor(current.value!, modalityId.value))
</script>

<template>
  <NuxtLayout>
    <!-- design doc §10.1's ASCII places the case heading atop the stage
         column (above the modality stepper), not in the content column. -->
    <template #heading>
      <div class="p-6 pb-0">
        <CaseHeader :case="current!" />
      </div>
    </template>

    <template #stepper>
      <ModalityStepper
        :modalities="current!.modalities"
        :active="modalityId"
        :slug="slug"
        class="shrink-0 border-b border-border bg-surface"
      />
    </template>

    <template #stage>
      <CopperStage
        :slug="slug"
        :group="current!.group"
        :lesion-slice-index="lesionSliceIndex"
        :modality="modality"
      />
    </template>

    <template #controls>
      <StageControls
        :slice-index="stageControls.sliceIndex.value"
        :slice-max="stageControls.sliceMax.value"
        :settled-slice-index="stageControls.settledSliceIndex.value"
        :lesion-slice-index="lesionSliceIndex"
        :ready="Boolean(stageControls.actions.value)"
        @reset="stageControls.actions.value?.reset()"
        @locate="stageControls.actions.value?.locateLesion()"
      />
    </template>

    <template #content>
      <div class="flex flex-col gap-6 p-6">
        <ModalityText :modality="modality" />
      </div>
    </template>

    <template #prevnext>
      <CaseNav :slug="slug" />
    </template>
  </NuxtLayout>
</template>
