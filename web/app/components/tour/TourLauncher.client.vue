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
  <div
    v-if="visible"
    data-tour-launcher
    class="fixed right-4 z-40 flex flex-col items-end gap-2
           max-md:bottom-4 md:max-xl:bottom-24 xl:bottom-6"
  >
    <!-- Above the tablet bottom sheet's 80px peek and clear of the phone
         layout's prev/next cards: the app already owns its bottom-right. -->
    <p class="rounded-ctl bg-text px-3 py-2 text-caption font-medium text-surface shadow-md">
      New here? A 90-second guided tour.
    </p>
    <div class="flex items-center gap-2">
      <button
        type="button"
        data-tour-dismiss
        class="flex min-h-11 items-center rounded-full px-3 text-body-sm text-text-muted
               hover:bg-surface-sunken"
        @click="dismissed = true; store.markSeen()"
      >
        Not now
      </button>
      <button
        type="button"
        data-tour-take
        class="flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-body-sm
               font-bold text-surface shadow-md
               motion-safe:animate-[tour-breathe_2.8s_ease-in-out_infinite]"
        @click="emit('start')"
      >
        ✦ Take the tour
      </button>
    </div>
  </div>
</template>
