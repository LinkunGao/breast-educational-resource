<script setup lang="ts">
import { enabledCases, getCase } from '~~/content/cases'
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
  <div class="p-8">
    <p class="text-caption uppercase tracking-wide text-text-muted">
      {{ current!.group }}
    </p>
    <h1 class="text-h1 font-bold text-text">{{ current!.heading }}</h1>
    <p class="mt-2 text-body-sm text-text-muted">
      Modality: {{ modality.label }} ({{ modalityId }})
    </p>
    <p class="prose-medical mt-6 text-text" v-html="modality.text" />

    <nav class="mt-8 flex gap-3">
      <NuxtLink
        v-for="m in current!.modalities"
        :key="m.id"
        :to="`/case/${slug}/${m.id}`"
        class="rounded-ctl border border-border px-3 py-2 text-body-sm"
        :class="m.id === modalityId ? 'bg-brand-subtle text-brand' : 'text-text-muted'"
      >
        {{ m.label }}
      </NuxtLink>
    </nav>

    <nav class="mt-8 flex flex-wrap gap-2">
      <NuxtLink
        v-for="c in enabledCases()"
        :key="c.slug"
        :to="`/case/${c.slug}`"
        class="rounded-chip border border-border px-2 py-1 text-caption"
        :class="c.slug === slug ? 'bg-brand text-surface' : 'text-text-muted'"
      >
        {{ c.title }}
      </NuxtLink>
    </nav>
  </div>
</template>
