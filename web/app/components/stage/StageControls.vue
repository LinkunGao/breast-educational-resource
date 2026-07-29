<script setup lang="ts">
/**
 * Design doc §10.1's control bar: `⟲ Reset  ⛶ Fullscreen  ⌖ Locate lesion
 * ... 62/104`. Rendered into the layout's `#controls` slot, not overlaid on
 * the canvas -- see useStageControls.ts for why.
 *
 * Deliberately presentational: everything it knows arrives as props and
 * everything it does (except fullscreen, which is pure DOM) leaves as an
 * event. That keeps the 3D wiring in one place and lets this file be tested
 * without a renderer.
 */
const props = defineProps<{
  /** Live slice number. 0/0 when the modality has no slices (Anatomy, and
   * the 2D ultrasound). */
  sliceIndex: number
  sliceMax: number
  /** The value to announce -- only changes once a scrub settles. */
  settledSliceIndex: number
  /** The case's lesion slice, or 0 when it has none. §7.2 shows the locate
   * control only for the five cases that actually have a lesion. */
  lesionSliceIndex: number
  /** False until the stage's renderer exists; the buttons do nothing until
   * then, so they say so rather than silently no-opping. */
  ready: boolean
}>()

const emit = defineEmits<{
  reset: []
  locate: []
}>()

const hasSlices = computed(() => props.sliceMax > 0)
const hasLesion = computed(() => props.lesionSliceIndex > 0 && hasSlices.value)

/**
 * The element fullscreen targets: the whole stage column (case heading,
 * modality stepper, stage, and this bar), marked by the layout. Fullscreening
 * the canvas alone would take this bar off screen with it, leaving Esc as
 * the only way back out -- and §10.1's collapse-both-panels case already
 * covers "just the stage, bigger".
 */
const root = ref<HTMLElement>()
const isFullscreen = ref(false)

function syncFullscreen() {
  isFullscreen.value = Boolean(typeof document !== 'undefined' && document.fullscreenElement)
}

async function onFullscreen() {
  if (typeof document === 'undefined') return
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => {})
    return
  }
  const target = root.value?.closest<HTMLElement>('[data-stage-column]') ?? root.value?.parentElement
  // Safari and any browser with the Fullscreen API blocked by permissions
  // policy reject this; there is nothing to recover, and an unhandled
  // rejection here would surface as a dev-overlay error on a decorative
  // control.
  await target?.requestFullscreen?.().catch(() => {})
}

onMounted(() => {
  syncFullscreen()
  document.addEventListener('fullscreenchange', syncFullscreen)
})
onScopeDispose(() => {
  // Guarded because this component (unlike CopperStage) is not `.client`
  // and so is part of the server render too.
  if (typeof document !== 'undefined') {
    document.removeEventListener('fullscreenchange', syncFullscreen)
  }
})

/** Shared by all three buttons. `min-h-11` is §11's 44px touch-target
 * floor; `hover:bg-current/10` tints from the bar's own foreground colour. */
const buttonClass = 'flex min-h-11 items-center gap-1.5 rounded-ctl px-3 text-body-sm '
  + 'hover:bg-current/10 disabled:opacity-50 disabled:hover:bg-transparent'
</script>

<template>
  <div
    ref="root"
    class="flex shrink-0 flex-wrap items-center gap-2 border-t border-border
           bg-surface px-4 py-2 text-text"
  >
    <button
      type="button"
      :class="buttonClass"
      :disabled="!props.ready"
      @click="emit('reset')"
    >
      <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
        <path fill="currentColor" d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7" />
      </svg>
      Reset view
    </button>

    <button
      type="button"
      :class="buttonClass"
      :aria-pressed="isFullscreen"
      @click="onFullscreen"
    >
      <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
        <path fill="currentColor" d="M5 5h5V3H3v7h2zm14 0v5h2V3h-7v2zM5 19v-5H3v7h7v-2zm14 0h-5v2h7v-7h-2z" />
      </svg>
      {{ isFullscreen ? 'Exit fullscreen' : 'Fullscreen' }}
    </button>

    <button
      v-if="hasLesion"
      type="button"
      :class="`${buttonClass} font-bold text-brand hover:bg-brand/10`"
      :disabled="!props.ready"
      @click="emit('locate')"
    >
      <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          d="M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8m0-6v3m0 14v3M2 12h3m14 0h3"
        />
      </svg>
      Locate lesion
    </button>

    <!--
      Two nodes for one number, on purpose (controller correction C11). The
      visible one updates on every frame of an eased scrub, which is right
      for the eye and catastrophic for a screen reader: an `aria-live` region
      bound to it queues one utterance per frame. The live region instead
      carries `settledSliceIndex`, which changes only when the scrub stops.
      `tabular-nums` is design doc §7.5's own requirement -- without it the
      readout's width jitters as the digits change.
    -->
    <p
      v-if="hasSlices"
      class="ml-auto text-body-sm tabular-nums opacity-80"
      aria-hidden="true"
    >
      Slice {{ props.sliceIndex }} / {{ props.sliceMax }}
    </p>
    <span v-if="hasSlices" class="sr-only" role="status" aria-live="polite">
      Slice {{ props.settledSliceIndex }} of {{ props.sliceMax }}
    </span>
  </div>
</template>
