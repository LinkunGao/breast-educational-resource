<script setup lang="ts">
const store = useViewerStore()
const tour = useTourStore()
const emit = defineEmits<{ startTour: [] }>()
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4"
  >
    <!-- Mobile/tablet only: opens/closes the case-nav drawer. Below xl the
         drawer's presence is sidebarOpen's job; at xl+ the sidebar is
         resident and a separate button (below) collapses it instead --
         two fields, two controls, because one field can't have two correct
         defaults for two tiers with opposite "normal" states (see
         sidebarOpen's comment in stores/viewer.ts). -->
    <button
      type="button"
      class="flex size-11 shrink-0 items-center justify-center rounded-ctl text-text-muted hover:bg-surface-sunken xl:hidden"
      :aria-expanded="store.sidebarOpen"
      aria-controls="case-sidebar"
      aria-label="Toggle case navigation"
      @click="store.sidebarOpen = !store.sidebarOpen"
    >
      <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
        <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
      </svg>
    </button>

    <!-- Desktop-only (design doc §10.1): collapses the resident sidebar to
         0 width, the other half of "collapse both panels for projection". -->
    <button
      type="button"
      class="hidden size-11 shrink-0 items-center justify-center rounded-ctl text-text-muted hover:bg-surface-sunken xl:flex"
      :aria-expanded="store.sidebarExpanded"
      aria-controls="case-sidebar"
      aria-label="Toggle case navigation panel"
      @click="store.sidebarExpanded = !store.sidebarExpanded"
    >
      <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
        <line x1="9" y1="5" x2="9" y2="19" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>

    <!--
      The wordmark carries BOTH names, te reo above English.

      It used to read "Te Uma" alone. `Te Uma` is te reo Māori for the breast
      and belongs on this app -- it is a New Zealand resource built with Iwi
      United Engaged -- but on its own it told a reader who does not speak te
      reo nothing at all about what they were looking at. Pairing the names is
      the ordinary treatment here, and it costs one line of 12px type.

      `leading-none` on both, so the pair occupies about the same height the
      single line did and the 56px header does not grow.
    -->
    <NuxtLink to="/" class="flex items-center gap-2.5">
      <span class="size-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
      <span class="flex flex-col gap-0.5">
        <span class="text-caption font-medium leading-none tracking-[0.14em] text-text-muted">
          TE UMA
        </span>
        <span class="text-body-sm font-bold leading-none tracking-tight text-text sm:text-h3">
          Breast Educational Resource
        </span>
      </span>
    </NuxtLink>

    <!--
      Right-hand header actions.

      `ml-auto` lives HERE and not on the first child, which is the fix for
      client feedback item 10. It used to sit on the content-panel toggle
      below, which is `hidden ... xl:flex`: below xl that button is
      display:none and its auto margin goes with it, so the About link had
      nothing pushing it right and rendered flush against the wordmark. An
      iPad Air (1180px) shows this; a desktop never does, because there the
      button exists. A wrapper that is present at every width cannot have
      that failure mode.
    -->
    <div data-header-actions class="ml-auto flex items-center gap-3">
      <!-- Desktop-only (design doc §10.1): the content column's other half of
           "collapse both panels for projection". Below xl the content pane
           has no collapse concept (bottom sheet at tablet, inline at phone),
           so there is nothing for this control to do there. -->
      <button
        type="button"
        class="hidden size-11 shrink-0 items-center justify-center rounded-ctl text-text-muted hover:bg-surface-sunken xl:flex"
        :aria-expanded="store.contentOpen"
        aria-controls="case-content-panel"
        aria-label="Toggle content panel"
        @click="store.contentOpen = !store.contentOpen"
      >
        <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
          <line x1="15" y1="5" x2="15" y2="19" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>

      <!--
        Secondary to About by design. The loud, unmissable invitation is the
        first-visit launcher, which expires; this one only has to be
        findable again afterwards, so it is an outline, not a fill.
      -->
      <button
        type="button"
        data-tour-open
        class="flex min-h-11 items-center gap-1.5 rounded-full border border-border-strong
               px-3 text-body-sm font-semibold text-text hover:bg-surface-sunken md:px-4"
        :aria-label="tour.active ? 'Guided tour is running' : 'Start the guided tour'"
        @click="emit('startTour')"
      >
        <svg viewBox="0 0 24 24" class="size-4 shrink-0" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2.5 13.6 8l5.4 1.6-5.4 1.6L12 16.6 10.4 11.2 5 9.6 10.4 8z"
          />
        </svg>
        <span data-tour-label class="max-md:sr-only">Guided tour</span>
      </button>

      <!--
        A filled control, not a text link.

        It used to be `text-body-sm text-text-muted` with a hover background
        and nothing else, so on a touch device -- where nothing ever hovers
        -- it read as a grey word rather than a control. Below xl the
        content-panel toggle beside it is display:none too, leaving it the
        lone item on the right with no context that this strip is controls
        at all.

        Filled with `--color-text`, NOT `--color-brand`: rose is this app's
        focus semantic (the focused panel's ring, the sidebar's current row,
        Locate lesion), and spending it on a permanent header button would
        blur what "current" means everywhere else.
      -->
      <NuxtLink
        to="/about"
        class="flex min-h-11 items-center gap-1.5 rounded-full bg-text px-4
               text-body-sm font-bold text-surface transition-opacity hover:opacity-90"
      >
        <svg viewBox="0 0 24 24" class="size-4 shrink-0" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
          <path fill="currentColor" d="M11 10.5h2V17h-2zM11 7h2v2h-2z" />
        </svg>
        <span data-about-label>About</span>
      </NuxtLink>
    </div>
  </header>
</template>
