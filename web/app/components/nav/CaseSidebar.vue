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

// Below xl this <nav> is an off-canvas modal drawer (default.vue makes it
// `fixed` -- `max-md:fixed` at phone, `md:max-xl:fixed` at tablet); at xl
// and above it's a permanently resident (collapsible, but never modal)
// panel and none of the modal behaviour below should engage. Rather than
// duplicating the `xl`/`md` breakpoints as JS pixel literals (the thing the
// "CSS decides layout" constraint forbids), this asks the browser what CSS
// already decided for this exact element: neither below-xl tier's `fixed`
// rule takes effect at xl+, so reading the computed `position` back is a
// point-in-time query of CSS's own decision, not a parallel width
// measurement that could drift from it or run before CSS has painted.
const navEl = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function isDrawerMode(): boolean {
  return !!navEl.value && getComputedStyle(navEl.value).position === 'fixed'
}

function focusableEls(): HTMLElement[] {
  return Array.from(
    navEl.value?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
  )
}

watch(() => store.sidebarOpen, (open) => {
  if (!isDrawerMode()) return
  if (open) {
    previouslyFocused = document.activeElement as HTMLElement | null
    nextTick(() => focusableEls()[0]?.focus())
  }
  else {
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

/** Escape closes the drawer; Tab traps focus inside it while it's the
 *  modal drawer. Both no-op at xl+, where this <nav> is not a modal. */
function onKeydown(event: KeyboardEvent) {
  if (!store.sidebarOpen || !isDrawerMode()) return

  if (event.key === 'Escape') {
    store.sidebarOpen = false
    return
  }
  if (event.key !== 'Tab') return

  const list = focusableEls()
  if (list.length === 0) return
  const first = list[0]!
  const last = list[list.length - 1]!

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <nav
    id="case-sidebar"
    ref="navEl"
    aria-label="Cases"
    class="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-4"
    @keydown="onKeydown"
  >
    <div v-for="g in groups" :key="g.group">
      <h2
        v-if="g.label"
        class="mb-2 px-2 text-caption font-bold uppercase tracking-wide text-text-muted"
      >
        {{ g.label }}
      </h2>
      <ul class="flex flex-col gap-0.5">
        <li v-for="c in g.items" :key="c.slug">
          <NuxtLink
            :to="`/case/${c.slug}`"
            class="flex min-h-11 items-center gap-2 rounded-ctl px-2 text-body-sm hover:bg-surface-sunken"
            :class="c.slug === store.caseSlug
              ? 'bg-brand-subtle font-bold text-anatomy-ink'
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
