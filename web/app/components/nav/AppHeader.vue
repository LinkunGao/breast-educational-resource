<script setup lang="ts">
const store = useViewerStore()
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4"
  >
    <!-- Below xl this opens/closes the case-nav drawer; at xl+ (design doc
         §10.1) the sidebar is resident and this instead collapses it to 0
         width -- same control, same store field, different CSS per tier
         (see sidebarOpen's comment in stores/viewer.ts), so it stays
         visible at every width rather than being xl:hidden. -->
    <button
      type="button"
      class="flex size-11 shrink-0 items-center justify-center rounded-ctl text-text-muted hover:bg-surface-sunken"
      :aria-expanded="store.sidebarOpen"
      aria-controls="case-sidebar"
      aria-label="Toggle case navigation"
      @click="store.sidebarOpen = !store.sidebarOpen"
    >
      <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
        <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
      </svg>
    </button>

    <NuxtLink to="/" class="flex items-center gap-2">
      <span class="size-3 rounded-full bg-brand" aria-hidden="true" />
      <span class="text-h3 font-bold text-text">Te Uma</span>
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
