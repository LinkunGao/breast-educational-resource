<script setup lang="ts">
const props = defineProps<{
  title: string
  body: string
  stepNumber: number
  stepCount: number
  chapterLabel: string
  atEnd: boolean
  /** Null for a centred step with no target. */
  rect: DOMRect | null
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
}>()

const emit = defineEmits<{ next: [], back: [], exit: [] }>()

const titleId = `tour-card-title-${Math.random().toString(36).slice(2, 8)}`

const GAP = 16
const CARD_W = 320

/**
 * Where the card sits.
 *
 * Clamped into the viewport on both axes rather than flipped: a flip moves
 * the card to the far side of the target, which on a three-up stage can put
 * it over a different panel than the one being described.
 */
const style = computed(() => {
  if (!props.rect || props.placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const r = props.rect
  let top = r.top
  let left = r.left
  if (props.placement === 'right') { left = r.right + GAP; top = r.top }
  else if (props.placement === 'left') { left = r.left - CARD_W - GAP; top = r.top }
  else if (props.placement === 'bottom') { top = r.bottom + GAP }
  else { top = r.top - GAP }

  const maxLeft = (globalThis.innerWidth || 1024) - CARD_W - GAP
  return {
    top: `${Math.max(GAP, Math.min(top, (globalThis.innerHeight || 768) - GAP - 200))}px`,
    left: `${Math.max(GAP, Math.min(left, Math.max(GAP, maxLeft)))}px`,
  }
})

const btn = 'flex min-h-11 items-center rounded-full px-4 text-body-sm font-bold'
</script>

<template>
  <div
    role="dialog"
    :aria-labelledby="titleId"
    data-tour-card
    class="fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border
           bg-surface/95 p-5 shadow-lg backdrop-blur-sm"
    :style="style"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-caption font-bold uppercase tracking-[0.14em] text-brand-hover">
        {{ props.chapterLabel }}
      </p>
      <p class="text-caption tabular-nums text-text-muted">
        {{ props.stepNumber }} / {{ props.stepCount }}
      </p>
    </div>
    <h2 :id="titleId" class="mt-1.5 text-h2 font-bold tracking-tight text-text">
      {{ props.title }}
    </h2>
    <p class="mt-2 text-body-sm leading-relaxed text-text-muted">
      {{ props.body }}
    </p>

    <div class="mt-5 flex items-center gap-2">
      <button
        type="button"
        data-tour-back
        :class="`${btn} text-text-muted hover:bg-surface-sunken`"
        @click="emit('back')"
      >
        Back
      </button>
      <button
        type="button"
        data-tour-next
        :class="`${btn} ml-auto bg-text text-surface hover:opacity-90`"
        @click="emit('next')"
      >
        {{ props.atEnd ? 'Finish' : 'Next' }}
      </button>
      <button
        type="button"
        data-tour-exit
        aria-label="Close the guided tour"
        :class="`${btn} px-3 text-text-muted hover:bg-surface-sunken`"
        @click="emit('exit')"
      >
        ✕
      </button>
    </div>
  </div>
</template>
