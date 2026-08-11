<script setup lang="ts">
/**
 * First-visit invitation.
 *
 * A floating button rather than a modal, deliberately: a welcome card,
 * however polite, is a door in the way. This can be ignored and still be
 * found. Once the reader has started or dismissed it, the header's own
 * permanent button is the only entry point from then on.
 */
const store = useTourStore()
const emit = defineEmits<{ start: [] }>()

const dismissed = ref(false)
// Read synchronously (not in onMounted): this file is `.client` only, so it
// never runs server-side, and the initial render must already reflect
// localStorage rather than flashing the launcher for one frame first.
store.restoreSeen()

const visible = computed(() => !store.hasSeen && !dismissed.value && !store.active)
</script>

<template>
  <!-- Stable root, `display: contents` so it generates no box. Same reason
       as TourLayer's: a component whose root is a `v-if` alternates between
       a comment and an element, and on the deployed build that produced an
       update against a subtree with no DOM node. Costs nothing. -->
  <div class="contents">
  <div
    v-if="visible"
    data-tour-launcher
    class="hud-glass fixed right-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2.5
           rounded-card p-3.5
           max-md:bottom-4 md:max-xl:bottom-24 xl:bottom-6"
  >
    <!-- Above the tablet bottom sheet's 80px peek and clear of the phone
         layout's prev/next cards: the app already owns its bottom-right. -->
    <p class="text-caption font-medium whitespace-nowrap text-(--hud-ink)">
      New here? A 90-second guided tour.
    </p>
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        data-tour-dismiss
        class="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-body-sm
               text-(--hud-dim) hover:bg-white/5"
        @click="dismissed = true; store.markSeen()"
      >
        Not now
      </button>
      <button
        type="button"
        data-tour-take
        class="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-(--hud-accent)
               px-4 text-body-sm font-bold text-(--hud-base) hover:opacity-90"
        @click="emit('start')"
      >
        ✦ Take the tour
      </button>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Same glass FAMILY as TourCard/TourRail (design doc T2), but more opaque:
   --hud-glass's .74 alpha is tuned for sitting over the dimmed tour theatre.
   This launcher floats over the ordinary, undimmed light page instead, so
   that alpha lets enough page colour bleed through to fail --hud-dim's
   contrast (axe caught this: composited over white it measures ~3:1, not
   the 4.5:1 body floor). .94 keeps the frosted-glass read while measuring
   ~5.6-6.3:1 for every HUD ink against any real page background. */
.hud-glass {
  background: rgb(20 18 26 / .94);
  backdrop-filter: blur(14px) saturate(1.15);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
  border: 1px solid var(--hud-line);
  box-shadow: 0 16px 40px rgb(0 0 0 / .45), inset 0 1px 0 rgb(255 255 255 / .07);
}
</style>
