<script setup lang="ts">
const store = useViewerStore()
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4"
  >
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

    <NuxtLink to="/" class="flex items-center gap-2">
      <span class="size-3 rounded-full bg-brand" aria-hidden="true" />
      <span class="text-h3 font-bold text-text">Te Uma</span>
    </NuxtLink>

    <NuxtLink
      to="/about"
      class="ml-auto flex min-h-11 items-center rounded-ctl px-3 text-body-sm text-text-muted hover:bg-surface-sunken hover:text-text"
    >
      About
    </NuxtLink>
  </header>
</template>
