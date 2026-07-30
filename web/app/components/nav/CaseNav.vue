<script setup lang="ts">
import { CASE_GROUP_LABEL, enabledCases } from '~~/content/cases'
import type { Case } from '~~/content/types'

/**
 * Previous / next case, at the foot of the content column.
 *
 * This is what the layout's `prevnext` slot was reserved for. It stood empty
 * behind a "Placeholder: prev/next case navigation (Task 6)" fallback that
 * shipped to the browser and was the first thing the human asked about
 * ("这个 Placeholder ... 是什么东西？").
 *
 * Order comes from `enabledCases()` -- the same declaration order the sidebar
 * groups and renders, so "next" always means the entry visibly below the
 * current one there, and the two navigations can never disagree.
 *
 * ## On the presentation
 *
 * Each side shows the case's GROUP as a quiet overline and its HEADING as the
 * link text -- "Breast Density / Extremely dense", not "Breast Density / D".
 * The density cases are titled with bare letters, so a first pass that used
 * `title` produced a link whose entire label was the character "D". The
 * heading is the sentence the case page itself leads with, and it is the only
 * field that says what the reader is about to look at.
 */
const props = defineProps<{ slug: string }>()

const neighbours = computed<{ previous?: Case, next?: Case }>(() => {
  const all = enabledCases()
  const at = all.findIndex(c => c.slug === props.slug)
  // -1 cannot happen behind the page's `validate` guard, but a missing case
  // must degrade to "no neighbours" rather than wrapping around to the ends
  // of the list, which `at - 1` on -1 would do.
  if (at === -1) return {}
  return { previous: all[at - 1], next: all[at + 1] }
})
</script>

<template>
  <nav
    v-if="neighbours.previous || neighbours.next"
    aria-label="Previous and next case"
    class="border-t border-border px-6 py-5"
  >
    <!-- A hairline rule and two columns, no cards. The boxed version this
         replaces put a border around each link, which at this size read as
         two buttons competing with the control bar rather than as quiet
         continuation links. -->
    <ul class="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      <li v-if="neighbours.previous">
        <NuxtLink :to="`/${neighbours.previous.slug}`" class="group block">
          <span class="flex items-center gap-1.5 text-caption uppercase tracking-[0.14em] text-text-muted">
            <svg viewBox="0 0 24 24" class="size-3 transition-transform group-hover:-translate-x-0.5" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="m15 5-7 7 7 7" />
            </svg>
            {{ CASE_GROUP_LABEL[neighbours.previous.group] }}
          </span>
          <span class="mt-1 block text-body font-medium leading-snug text-text
                       decoration-brand/40 underline-offset-4 group-hover:text-brand group-hover:underline">
            {{ neighbours.previous.heading }}
          </span>
        </NuxtLink>
      </li>

      <!-- `sm:col-start-2` keeps "next" hard right when there is no
           "previous" (the overview case), so the pair reads as one strip in
           both states instead of the single link jumping to the left edge. -->
      <li
        v-if="neighbours.next"
        class="sm:text-right"
        :class="neighbours.previous ? '' : 'sm:col-start-2'"
      >
        <NuxtLink :to="`/${neighbours.next.slug}`" class="group block">
          <span class="flex items-center gap-1.5 text-caption uppercase tracking-[0.14em] text-text-muted sm:justify-end">
            {{ CASE_GROUP_LABEL[neighbours.next.group] }}
            <svg viewBox="0 0 24 24" class="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="m9 5 7 7-7 7" />
            </svg>
          </span>
          <span class="mt-1 block text-body font-medium leading-snug text-text
                       decoration-brand/40 underline-offset-4 group-hover:text-brand group-hover:underline">
            {{ neighbours.next.heading }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
