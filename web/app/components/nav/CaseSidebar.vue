<script setup lang="ts">
import { enabledCases } from '~~/content/cases'
import type { CaseGroup } from '~~/content/types'

const store = useViewerStore()

const GROUP_LABEL: Record<CaseGroup, string> = {
  overview: '',
  density: 'Breast Density',
  benign: 'Benign Conditions',
  cancer: 'Breast Cancer',
}

/** Grouped by `group`, preserving cases.ts's declaration order. */
const groups = computed(() => {
  const order: CaseGroup[] = ['overview', 'density', 'benign', 'cancer']
  return order.map(group => ({
    group,
    label: GROUP_LABEL[group],
    items: enabledCases().filter(c => c.group === group),
  })).filter(g => g.items.length > 0)
})
</script>

<template>
  <nav
    id="case-sidebar"
    aria-label="Cases"
    class="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-4"
  >
    <div v-for="g in groups" :key="g.group">
      <h2
        v-if="g.label"
        class="mb-2 px-2 text-caption font-bold uppercase tracking-wide text-text-subtle"
      >
        {{ g.label }}
      </h2>
      <ul class="flex flex-col gap-0.5">
        <li v-for="c in g.items" :key="c.slug">
          <NuxtLink
            :to="`/case/${c.slug}`"
            class="flex min-h-11 items-center gap-2 rounded-ctl px-2 text-body-sm hover:bg-surface-sunken"
            :class="c.slug === store.caseSlug
              ? 'bg-brand-subtle font-bold text-brand'
              : 'text-text-muted'"
            :aria-current="c.slug === store.caseSlug ? 'page' : undefined"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="c.slug === store.caseSlug ? 'bg-brand' : 'bg-border-strong'"
              aria-hidden="true"
            />
            {{ c.title }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
