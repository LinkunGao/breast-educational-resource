<script setup lang="ts">
const store = useViewerStore()
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

    <!-- Desktop-only (design doc §10.1): the content column's other half of
         "collapse both panels for projection". Below xl the content pane
         has no collapse concept (bottom sheet at tablet, inline at phone),
         so there is nothing for this control to do there. -->
    <button
      type="button"
      class="ml-auto hidden size-11 shrink-0 items-center justify-center rounded-ctl text-text-muted hover:bg-surface-sunken xl:flex"
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

    <NuxtLink
      to="/about"
      class="flex min-h-11 items-center rounded-ctl px-3 text-body-sm text-text-muted hover:bg-surface-sunken hover:text-text"
    >
      About
    </NuxtLink>
  </header>
</template>
