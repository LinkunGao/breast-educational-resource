<script setup lang="ts">
const store = useViewerStore()
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-bg">
    <!-- Skip link: first tab stop, hidden until focused. Below-xl the
         resident-looking sidebar is really 10+ off-canvas links a keyboard
         user would otherwise have to tab past on every single page. -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50
             focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2 focus:text-body-sm
             focus:text-text focus:shadow-md"
    >
      Skip to main content
    </a>

    <AppHeader />

    <div class="flex min-h-0 flex-1">
      <!-- Sidebar: resident at xl and above; an overlay drawer below it.
           `invisible`/`visible` (not just the transform) keeps the closed
           drawer's ~10 links out of the tab order and off-screen-reader,
           since a `-translate-x-full` element is still visible/focusable
           by default -- only `max-xl:`, so this never touches xl+. The
           delay pairing lets the close transition finish before the panel
           actually goes non-interactive, and open react instantly. -->
      <CaseSidebar
        class="max-xl:fixed max-xl:inset-y-14 max-xl:left-0 max-xl:z-30 max-xl:shadow-lg
               max-xl:transition-[transform,visibility] max-xl:duration-200"
        :class="store.sidebarOpen
          ? 'max-xl:visible max-xl:translate-x-0 max-xl:delay-0'
          : 'max-xl:invisible max-xl:-translate-x-full max-xl:delay-200'"
      />

      <!-- Drawer scrim, narrow screens only, while the drawer is open.
           Inset below the header (h-14 = the same 56px CaseSidebar already
           reserves via inset-y-14) so it dims the stage/content behind it
           without painting over the header -- otherwise the header looks
           dimmed and "About"/the logo silently just close the drawer. -->
      <button
        v-if="store.sidebarOpen"
        type="button"
        aria-label="Close case navigation"
        class="fixed inset-x-0 top-14 bottom-0 z-20 bg-text/20 xl:hidden"
        @click="store.sidebarOpen = false"
      />

      <!-- Main area: stage|content sit side by side at xl and above; below
           it they stack vertically in a single scrollable column. -->
      <main
        id="main-content"
        tabindex="-1"
        class="flex min-w-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden"
      >
        <!-- min-h ensures the stage can't be squeezed to 0 below xl: in a
             column flex layout with a shrink-0 sibling, flex-1 alone lets
             flex-basis 0 win once content pushes past the viewport height
             (negative free space defeats flex-grow). Not an issue at xl+,
             where this is a row layout instead. -->
        <section aria-label="3D case viewer" class="flex min-h-0 min-w-0 flex-1 flex-col max-xl:min-h-100">
          <slot name="stage" />
        </section>

        <div
          class="shrink-0 border-border bg-surface
                 max-xl:border-t xl:w-100 xl:overflow-y-auto xl:border-l"
        >
          <slot name="content" />
        </div>
      </main>
    </div>
  </div>
</template>
