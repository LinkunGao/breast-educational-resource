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

/**
 * Where the card sits.
 *
 * Anchored from whichever edge faces the target rather than guessing the
 * card's own height/width: `top` placement sets `bottom`, `left` placement
 * sets `right`, and so on. The browser positions from that edge, so no
 * height/width constant is needed and a taller card never grows through its
 * own target.
 */
const style = computed(() => {
  if (!props.rect || props.placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const r = props.rect
  const vw = globalThis.innerWidth || 1024
  const vh = globalThis.innerHeight || 768

  if (props.placement === 'right') {
    return { top: `${Math.max(GAP, r.top)}px`, left: `${Math.max(GAP, r.right + GAP)}px` }
  }
  if (props.placement === 'left') {
    return { top: `${Math.max(GAP, r.top)}px`, right: `${Math.max(GAP, vw - r.left + GAP)}px` }
  }
  if (props.placement === 'bottom') {
    return { top: `${Math.max(GAP, r.bottom + GAP)}px`, left: `${Math.max(GAP, r.left)}px` }
  }
  // 'top': anchor the card's bottom edge above the target instead of its
  // top edge, so the card grows upward and never covers the target.
  return { bottom: `${Math.max(GAP, vh - r.top + GAP)}px`, left: `${Math.max(GAP, r.left)}px` }
})

const btn = 'flex min-h-11 items-center rounded-full px-4 text-body-sm font-bold'
</script>

<template>
  <div
    role="dialog"
    :aria-labelledby="titleId"
    data-tour-card
    class="fixed z-50 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto
           rounded-card border border-border bg-surface/95 p-5 shadow-lg backdrop-blur-sm"
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
        :class="`${btn} text-text-muted hover:bg-surface-sunken`"
        @click="emit('exit')"
      >
        ✕
      </button>
    </div>
  </div>
</template>
