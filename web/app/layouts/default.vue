<script setup lang="ts">
const store = useViewerStore()

// Tablet-only bottom-sheet pull state (design doc §10.2). Deliberately not
// in the Pinia store: see contentOpen's comment in stores/viewer.ts for why
// this needs to be its own field rather than reusing that one. Ephemeral by
// design -- a stale "expanded" carried across an unrelated navigation is a
// much smaller papercut than xl+'s content column defaulting collapsed.
const sheetExpanded = ref(false)
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
      <!-- Case navigation: resident + collapsible at xl+ (§10.1); a drawer
           sliding in from the left at tablet (§10.2); a drawer dropping
           down from the top at phone (§10.3, "case navigation moves into a
           top drawer"). All three below-xl variants set `position: fixed`,
           which is the one invariant CaseSidebar's own focus-trap gate
           (`getComputedStyle(nav).position === 'fixed'`) relies on -- it
           doesn't care which edge the drawer comes from, only whether it's
           a drawer at all, so introducing the phone tier here doesn't
           require touching that gate. Neither below-xl tier nor xl+'s
           collapse ever sets `position` at xl+, so the gate stays false
           there in both the expanded and collapsed state, as it should --
           collapsing to 0 width isn't a modal, so it needs no trap, only a
           reachable reopen control (AppHeader's dedicated xl+ button,
           which lives outside this element entirely).

           `invisible`/`visible` (not just the transform/width) keeps a
           closed drawer's ~10 links, and a collapsed desktop panel's same
           links, out of the tab order and off-screen-reader -- a
           translated-off-screen or 0-width element is still focusable by
           default. The delay pairing lets the closing/collapsing
           transition finish before the panel actually goes
           non-interactive; opening/expanding reacts instantly. -->
      <CaseSidebar
        class="max-md:fixed max-md:inset-x-0 max-md:top-14 max-md:bottom-0 max-md:z-30 max-md:w-full
               max-md:shadow-lg max-md:transition-[transform,visibility] max-md:duration-200
               md:max-xl:fixed md:max-xl:top-14 md:max-xl:bottom-0 md:max-xl:left-0 md:max-xl:z-30 md:max-xl:shadow-lg
               md:max-xl:transition-[transform,visibility] md:max-xl:duration-200
               xl:transition-[width,visibility] xl:duration-200"
        :class="[
          store.sidebarOpen
            ? 'max-md:visible max-md:translate-y-0 max-md:delay-0 md:max-xl:visible md:max-xl:translate-x-0 md:max-xl:delay-0'
            : `max-md:invisible max-md:-translate-y-full max-md:delay-200
               md:max-xl:invisible md:max-xl:-translate-x-full md:max-xl:delay-200`,
          store.sidebarExpanded
            ? 'xl:visible xl:delay-0'
            : 'xl:invisible xl:w-0 xl:border-0 xl:overflow-hidden xl:delay-200',
        ]"
      />

      <!-- Drawer scrim, below xl only, while the drawer is open. Inset below
           the header (h-14 = the same 56px CaseSidebar reserves) so it dims
           the stage/content behind it without painting over the header --
           otherwise the header looks dimmed and "About"/the logo silently
           just close the drawer. Same scrim serves both the left drawer
           (tablet) and the top drawer (phone): both dim the same region. -->
      <button
        v-if="store.sidebarOpen"
        type="button"
        aria-label="Close case navigation"
        class="fixed inset-x-0 top-14 bottom-0 z-20 bg-text/20 xl:hidden"
        @click="store.sidebarOpen = false"
      />

      <!-- Stage column (heading/stepper/stage/controls) and content column
           (case copy/prev-next) sit side by side at xl+; below it they
           stack in DOM order, which is already exactly design doc §10.3's
           required phone order (case heading -> stepper -> 1:1 stage ->
           control bar -> body copy -> prev/next) -- nesting each region in
           that order once and switching flex-direction per tier produces
           the right order at every tier without any CSS `order` juggling.

           md:max-xl:pb-20 reserves space for the tablet bottom sheet's own
           peek height (max-h-20 below): the sheet is `fixed bottom-0` and
           so is not part of this element's normal flow, and without this
           padding its last 80px permanently covers whatever the scrollable
           content ends on -- which will be Task 7's control bar. -->
      <main
        id="main-content"
        tabindex="-1"
        class="flex min-w-0 flex-1 flex-col overflow-y-auto md:max-xl:pb-20 xl:flex-row xl:overflow-hidden"
      >
        <!-- `data-stage-column` marks the fullscreen target for the control
             bar's ⛶ button (design doc §10.1): heading, stepper, stage and
             the bar itself, so the control that entered fullscreen is still
             on screen to leave it again. `bg-bg` is load-bearing only in
             that state -- a fullscreened element with no background of its
             own shows the UA's black backdrop through it. -->
        <!--
          `max-md:flex-none` is the phone fix, and it is not cosmetic.

          With `flex-1 min-h-0` this column is allowed to shrink below its own
          content, and in a column flex container whose height is the viewport
          it does exactly that. Measured at 414x896: the column's content was
          660px and flexbox gave it 461, so 199px -- the control bar included
          -- overflowed and was painted over by the content panel, which comes
          later in the DOM. Worse, the compression kept `main`'s scrollHeight
          equal to its clientHeight, so there was no scroll range at all and
          the body copy underneath was simply unreachable.

          `flex: none` restores `flex-basis: auto` with no shrink, so the
          column keeps its natural height, `main` becomes genuinely
          scrollable, and §10.3's single stacked column works the way it
          reads. Tablet and desktop keep `flex-1`: there the column really is
          meant to fill the space it is given.
        -->
        <div
          data-stage-column
          class="flex min-h-0 min-w-0 flex-1 flex-col bg-bg max-md:flex-none"
        >
          <!-- Case heading (group label + title). -->
          <slot name="heading" />


          <!-- md:max-xl:min-h ensures the stage can't be squeezed to 0 at
               tablet: in a column flex layout with a shrink-0 sibling,
               flex-1 alone lets flex-basis 0 win once content pushes past
               the viewport height (negative free space defeats flex-grow).
               At phone, §10.3 asks for something stronger than a floor --
               an exact 1:1 square -- so aspect-square replaces flex-grow
               sizing there entirely (flex-none, so flex-grow can't fight
               the aspect ratio for the final height). Neither applies at
               xl+, which is a row layout instead. -->
          <section
            aria-label="3D case viewer"
            class="flex min-h-0 flex-1 flex-col md:max-xl:min-h-100 max-md:flex-none max-md:aspect-square"
          >
            <slot name="stage" />
          </section>

          <!-- No `#controls` slot: each stage renders its own control bar
               directly under its own canvas, because the three-up layout
               gives every panel one. The slot existed only while a single
               bar had to sit beside a single stage. -->

        </div>

        <!-- Content column: collapsible width at xl+ (design doc §10.1's
             other collapsible panel, toggled from AppHeader); a pull-up
             bottom sheet at tablet (§10.2); plain inline flow at phone
             (§10.3 -- no sheet, no collapse, just the next region in the
             single column). The two xl+ width utilities and the two
             tablet max-height utilities are each mutually exclusive (never
             both present at once), so there's no same-variant specificity
             ambiguity between them.

             md:max-xl:z-10, below the drawer scrim's z-20: without this the
             sheet sat *above* the scrim, so it stayed undimmed and
             clickable while the case-nav drawer was supposedly modal. -->
        <div
          id="case-content-panel"
          class="shrink-0 border-border bg-surface
                 max-md:border-t
                 md:max-xl:fixed md:max-xl:inset-x-0 md:max-xl:bottom-0 md:max-xl:z-10 md:max-xl:overflow-y-auto
                 md:max-xl:rounded-t-card md:max-xl:border md:max-xl:shadow-lg
                 md:max-xl:transition-[max-height] md:max-xl:duration-200
                 xl:overflow-y-auto xl:border-l xl:transition-[width,visibility] xl:duration-200"
          :class="[
            store.contentOpen
              ? 'xl:w-100 xl:visible xl:delay-0'
              : 'xl:w-0 xl:border-0 xl:overflow-hidden xl:invisible xl:delay-200',
            sheetExpanded ? 'md:max-xl:max-h-[50dvh]' : 'md:max-xl:max-h-20',
          ]"
        >
          <!-- Bottom-sheet handle, tablet only. Dragging it open needs a
               real pointer/touch gesture (a browser, not this test suite);
               tapping it is the keyboard- and gesture-free equivalent of
               "pull up to half-screen". min-h-11 (not the visually-smaller
               py-2 box it used to be) meets the 44px tap-target floor;
               bg-text-muted (not bg-border-strong, 1.73:1 on surface) meets
               the 3:1 non-text contrast floor for the handle's only visual
               affordance. -->
          <button
            type="button"
            class="hidden min-h-11 w-full items-center justify-center md:max-xl:flex"
            :aria-expanded="sheetExpanded"
            :aria-label="sheetExpanded ? 'Collapse content panel' : 'Expand content panel'"
            @click="sheetExpanded = !sheetExpanded"
          >
            <span class="h-1 w-10 rounded-full bg-text-muted" aria-hidden="true" />
          </button>

          <slot name="content" />

          <slot name="prevnext" />
        </div>
      </main>
    </div>
  </div>
</template>
