<script setup lang="ts">
const store = useViewerStore()
const tour = useTourStore()
const emit = defineEmits<{ startTour: [] }>()
</script>

<template>
  <!-- `pane-flat`, not `bg-surface`: the header is one of the app's glass
       panes, so it lets the ground's tint through and carries the same
       specular top edge every other pane does. -->
  <header
    class="pane-flat flex h-14 shrink-0 items-center gap-3 border-b border-border px-4"
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
        findable again afterwards, so it stays a quiet outline. The corner-
        bracket glyph previews the tour HUD's own visual language.

        Border is text-muted, not border-strong (1.48:1 on white -- under
        the 3:1 non-text floor; see nav-contrast.test.ts's existing rejection
        of border-strong for the same reason on ModalityStepper/default.vue).
      -->
      <button
        type="button"
        data-tour-open
        class="flex min-h-11 items-center gap-1.5 rounded-full border border-text-muted
               px-3 text-body-sm font-semibold text-text-muted hover:bg-surface-sunken hover:text-text md:px-4"
        :aria-label="tour.active ? 'Guided tour is running' : 'Start the guided tour'"
        @click="emit('startTour')"
      >
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M1 4.5V1h3.5" />
          <path d="M11.5 1H15v3.5" />
          <path d="M15 11.5V15h-3.5" />
          <path d="M4.5 15H1v-3.5" />
        </svg>
        <span data-tour-label class="max-md:sr-only">Guided tour</span>
      </button>

      <!--
        A filled control, not a text link -- a touch device never hovers, so
        bare text with only a hover background read as a grey word, not a
        control.

        Soft neutral fill, not the old heavy black: still filled (outranks
        the tour button's outline), still NOT `--color-brand` (rose is this
        app's focus semantic -- the focused panel's ring, the sidebar's
        current row, Locate lesion -- and spending it here would blur what
        "current" means everywhere else).
      -->
      <NuxtLink
        to="/about"
        class="flex min-h-11 items-center gap-1.5 rounded-full bg-surface-sunken px-4
               text-body-sm font-bold text-text transition-colors hover:bg-border"
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
