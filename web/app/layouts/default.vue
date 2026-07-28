<script setup lang="ts">
const store = useViewerStore()
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-bg">
    <AppHeader />

    <div class="flex min-h-0 flex-1">
      <!-- Sidebar: resident at xl and above; an overlay drawer below it. -->
      <CaseSidebar
        class="max-xl:fixed max-xl:inset-y-14 max-xl:left-0 max-xl:z-30 max-xl:shadow-lg
               max-xl:transition-transform max-xl:duration-200"
        :class="store.sidebarOpen
          ? 'max-xl:translate-x-0'
          : 'max-xl:-translate-x-full'"
      />

      <!-- Drawer scrim, narrow screens only, while the drawer is open. -->
      <button
        v-if="store.sidebarOpen"
        type="button"
        aria-label="Close case navigation"
        class="fixed inset-0 z-20 bg-text/20 xl:hidden"
        @click="store.sidebarOpen = false"
      />

      <!-- Main area: stage|content sit side by side at xl and above; below
           it they stack vertically in a single scrollable column. -->
      <div class="flex min-w-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
        <section class="flex min-h-0 min-w-0 flex-1 flex-col">
          <slot name="stage" />
        </section>

        <aside
          class="shrink-0 border-border bg-surface
                 max-xl:border-t xl:w-100 xl:overflow-y-auto xl:border-l"
        >
          <slot name="content" />
        </aside>
      </div>
    </div>
  </div>
</template>
