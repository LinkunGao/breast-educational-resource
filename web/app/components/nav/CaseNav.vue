<script setup lang="ts">
import { CASE_GROUP_LABEL, enabledCases } from '~~/content/cases'
import type { Case } from '~~/content/types'
import { GROUP_INK } from '~/utils/groupInk'

/**
 * Previous / next case, at the foot of the content column.
 *
 * This is what the layout's `prevnext` slot was reserved for. It stood empty
 * behind a "Placeholder: prev/next case navigation (Task 6)" fallback that
 * shipped to the browser and was the first thing the human asked about
 * (the human asked what that "Placeholder" was).
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
  <!-- A CONTAINER query, not `sm:`: this nav lives in the 400px content
       panel, where a viewport breakpoint forced two ~176px columns and
       broke long headings across three lines. -->
  <nav
    v-if="neighbours.previous || neighbours.next"
    aria-label="Previous and next case"
    class="@container border-t border-border px-6 py-6"
  >
    <ul class="grid gap-3 @[30rem]:grid-cols-2">
      <li v-if="neighbours.previous">
        <!-- A card (§11). An earlier boxed version was reverted for
             competing with the stage's control bar; each stage owns its
             own bar now, so nothing here is left to compete with. -->
        <NuxtLink
          :to="`/${neighbours.previous.slug}`"
          class="group flex h-full flex-col rounded-card border border-border bg-surface p-4
                 transition-[box-shadow,border-color,transform] duration-200
                 hover:-translate-y-px hover:border-border-strong hover:shadow-sm"
        >
          <span
            class="flex items-center gap-1.5 text-caption font-bold uppercase tracking-[0.14em]"
            :class="GROUP_INK[neighbours.previous.group]"
          >
            <svg viewBox="0 0 24 24" class="size-3 transition-transform group-hover:-translate-x-0.5" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="m15 5-7 7 7 7" />
            </svg>
            {{ CASE_GROUP_LABEL[neighbours.previous.group] }}
          </span>
          <span class="mt-1.5 block text-body-sm font-bold leading-snug text-text
                       transition-colors group-hover:text-brand-hover">
            {{ neighbours.previous.heading }}
          </span>
        </NuxtLink>
      </li>

      <!-- Keeps "next" in the right-hand column when there is no
           "previous" (the overview case). -->
      <li
        v-if="neighbours.next"
        :class="neighbours.previous ? '' : '@[30rem]:col-start-2'"
      >
        <NuxtLink
          :to="`/${neighbours.next.slug}`"
          class="group flex h-full flex-col rounded-card border border-border bg-surface p-4
                 text-right transition-[box-shadow,border-color,transform] duration-200
                 hover:-translate-y-px hover:border-border-strong hover:shadow-sm"
        >
          <span
            class="flex items-center justify-end gap-1.5 text-caption font-bold uppercase tracking-[0.14em]"
            :class="GROUP_INK[neighbours.next.group]"
          >
            {{ CASE_GROUP_LABEL[neighbours.next.group] }}
            <svg viewBox="0 0 24 24" class="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="m9 5 7 7-7 7" />
            </svg>
          </span>
          <span class="mt-1.5 block text-body-sm font-bold leading-snug text-text
                       transition-colors group-hover:text-brand-hover">
            {{ neighbours.next.heading }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
