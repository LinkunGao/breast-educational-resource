<script setup lang="ts">
import { CASE_GROUP_LABEL, enabledCases } from '~~/content/cases'
import { organisations } from '~~/content/team'
import type { CaseGroup } from '~~/content/types'
// Imported, not auto-imported: the unit suite runs on plain Vitest with
// Nuxt's auto-imports stubbed out.
import { GROUP_INK } from '~/utils/groupInk'

const store = useViewerStore()
const { publicUrl } = useAssetUrl()

/**
 * Per-group icon paths (client feedback item 9), drawn stroke-only at
 * 24×24 so they read at 16px and inherit the heading's own colour.
 *
 * Icons are on the home row and the three group headings ONLY, never on
 * the nine case rows. Nine glyphs that distinguish A/B/C/D, Cyst from
 * Fibroadenoma, and DCIS from Lobular from Ductal cannot be drawn legibly
 * at this size -- see ModalityStepper.vue's header for what happened the
 * last time abstract geometry was tried in this app.
 *
 *   density   three horizontal bands, increasingly dense
 *   benign    a smooth closed ellipse -- a well-circumscribed lesion
 *   cancer    a lobulated outline with a few short, irregular spiculations
 *             off it (deliberately uneven -- 8 spikes at even 45° steps
 *             read as a sun/gear, not a spiculated mass; see below)
 */
const GROUP_ICON: Record<Exclude<CaseGroup, 'overview'>, string[]> = {
  density: ['M4 7h16', 'M4 12h16', 'M4 17h16', 'M8 12v5', 'M12 12v5', 'M16 12v5'],
  benign: ['M12 5.5c3.6 0 6.5 2.9 6.5 6.5s-2.9 6.5-6.5 6.5S5.5 15.6 5.5 12 8.4 5.5 12 5.5z'],
  // Five spikes, at irregular angles and lengths, instead of the original
  // eight evenly-spaced radial rays: at 16px the evenly-spaced version read
  // as a sun or a settings gear rather than a spiculated mass. Uneven
  // spacing and length is what reads as organic/pathological rather than
  // as a mechanical/decorative asterisk.
  cancer: [
    'M12 7.5c2.5 0 4.5 2 4.5 4.5S14.5 16.5 12 16.5 7.5 14.5 7.5 12 9.5 7.5 12 7.5z',
    'M9.5 8 6.5 6.8', 'M14 7.6 17 5', 'M16.4 13.5 20.5 15.5', 'M8.7 15 7.2 16.8 6 19.5',
  ],
}

/**
 * The home row's own icon.
 *
 * This does NOT reuse ModalityStepper's anatomy mark (a chest-wall line plus
 * a semicircular breast profile). That glyph is correct at the stepper's own
 * size, but at this row's smaller `size-5` rendering it collapsed into an
 * unmistakable right-pointing play triangle -- exactly the failure mode
 * ModalityStepper's own header warns about, just re-triggered at a size the
 * anatomy glyph was never checked against. This row is the site's home
 * entry, not an imaging modality, so it does not have to share that mark;
 * legibility at its actual rendered size wins over that consistency. A
 * house -- roof, walls, door -- is unambiguous at 16-20px and reads as
 * "home" rather than "start".
 */
const HOME_ICON = ['M4 11 12 4l8 7', 'M5.5 10.5v9.5h13v-9.5', 'M10 20v-6h4v6']

/**
 * `the-breast` is pulled OUT of the grouped lists (client feedback item 8).
 * It is already `/`'s redirect target, so it is the home page; rendering it
 * as an unlabelled bullet above the first group heading made it read as
 * just another case.
 */
const home = computed(() => enabledCases().find(c => c.slug === 'the-breast'))

/** Grouped by `group`, preserving cases.ts's declaration order. `overview`
 *  is absent by construction: its one member is the home row above. */
const groups = computed(() => {
  const order = ['density', 'benign', 'cancer'] as const
  return order.map(group => ({
    group,
    label: CASE_GROUP_LABEL[group],
    icon: GROUP_ICON[group],
    ink: GROUP_INK[group],
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
    class="pane-flat flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border p-4"
    @keydown="onKeydown"
  >
    <NuxtLink
      v-if="home"
      data-home-row
      :to="`/${home.slug}`"
      class="relative -mt-1 flex min-h-11 items-center gap-2.5 rounded-ctl border-b border-border px-2 pb-3 text-body font-bold"
      :class="home.slug === store.caseSlug
        ? 'text-brand-hover'
        : 'text-text hover:bg-surface-sunken'"
      :aria-current="home.slug === store.caseSlug ? 'page' : undefined"
    >
      <span
        v-if="home.slug === store.caseSlug"
        data-active-indicator
        class="absolute inset-y-1 left-0 w-1 rounded-r-full bg-brand"
        aria-hidden="true"
      />
      <svg
        viewBox="0 0 24 24"
        class="size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path v-for="d in HOME_ICON" :key="d" :d="d" />
      </svg>
      {{ home.title }}
    </NuxtLink>

    <div v-for="g in groups" :key="g.group">
      <h2
        class="mb-2 flex items-center gap-1.5 px-2 text-caption font-bold uppercase tracking-wide"
        :class="g.ink"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-for="d in g.icon" :key="d" :d="d" />
        </svg>
        {{ g.label }}
      </h2>
      <ul class="flex flex-col gap-0.5">
        <li v-for="c in g.items" :key="c.slug">
          <!-- §8's active state: 8% rose fill, 4px rose edge indicator,
               label in the brand ink. `hover:` sits on the inactive branch
               only -- as a static class it also matched the active row and
               won, turning the selected row grey under the pointer. -->
          <NuxtLink
            :to="`/${c.slug}`"
            class="relative flex min-h-11 items-center rounded-ctl pl-4 pr-2 text-body-sm"
            :class="c.slug === store.caseSlug
              ? 'bg-brand-subtle font-bold text-brand-hover'
              : 'text-text-muted hover:bg-surface-sunken hover:text-text'"
            :aria-current="c.slug === store.caseSlug ? 'page' : undefined"
          >
            <span
              v-if="c.slug === store.caseSlug"
              data-active-indicator
              class="absolute inset-y-1 left-0 w-1 rounded-r-full bg-brand"
              aria-hidden="true"
            />
            {{ c.title }}
          </NuxtLink>
        </li>
      </ul>
    </div>

    <!--
      Partner logos (the human's #14).

      Placed at the foot of the sidebar, and this is a deliberate choice
      rather than a copy of the legacy layout: there they sat inside the
      content pane, competing for width with the case text on every single
      page. Attribution belongs where a reader looks for provenance -- the
      bottom of the persistent chrome -- not interleaved with the medical
      copy. `mt-auto` pins them to the bottom on tall viewports and lets them
      simply follow the list on short ones.

      One link wrapping all three, to About, where the same organisations are
      named in text: three separate outbound links here would be three tab
      stops on every page for something nobody navigates by.
    -->
    <NuxtLink
      to="/about"
      class="mt-auto flex flex-col items-start gap-3 rounded-card border-t border-border
             px-2 pb-1 pt-5 opacity-70 transition-opacity hover:opacity-100"
    >
      <span class="sr-only">About this resource and the team behind it</span>
      <img
        v-for="org in organisations.filter(o => o.logo)"
        :key="org.name"
        :src="publicUrl(`logos/${org.logo}`)"
        :alt="org.name"
        :style="{ width: `${(org.logoWidth ?? 8) * 0.75}rem` }"
        class="h-auto max-w-full"
        loading="lazy"
      >
    </NuxtLink>

    <!-- No version line here. It lives on the About page instead
         ("Breast Educational Resource v{version}"), which is where a reader
         looks for provenance; in the persistent chrome it was a number on
         every screen that almost nobody ever needs. -->
  </nav>
</template>
