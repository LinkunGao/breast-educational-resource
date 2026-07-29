<script setup lang="ts">
import { getCase } from '~~/content/cases'
import type { ModalityId } from '~~/content/types'

// This must be a route guard, not a setup-time `throw createError`. Today
// <NuxtPage> happens to remount this component on every param change
// because its key interpolates the route path, so a top-level throw fires
// on every navigation. Tasks 5/6 pin the page key so the WebGL canvas
// survives modality switches -- once that happens, setup no longer re-runs
// on navigation, so a throw here would only catch the *first* load. A
// `validate` guard runs on every navigation regardless of component reuse,
// so it keeps 404 behaviour correct after the key is pinned. Do not
// "simplify" this back to a throw.
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
      <!-- Placeholder: Task 7 replaces this with the copper3d viewer. -->
      <div class="flex flex-1 items-center justify-center bg-surface-sunken">
        <p class="text-body-sm text-text-muted">
          Stage placeholder — {{ modality.label }}
        </p>
      </div>
    </template>

    <template #content>
      <div class="flex flex-col gap-6 p-6">
        <ModalityText :modality="modality" />
      </div>
    </template>
  </NuxtLayout>
</template>
