<script setup lang="ts">
import type { ChapterId, TourChapter } from '~~/content/tourTypes'

const props = defineProps<{
  chapters: TourChapter[]
  activeChapter: ChapterId
  stepIndex: number
  stepCount: number
  atEnd: boolean
}>()

const emit = defineEmits<{
  next: [], back: [], exit: [], chapter: [ChapterId]
}>()
</script>

<template>
  <!-- The chapter rail: a player's transport, not a progress bar. It is the
       one piece of chrome that says "this is a tour with chapters, and you
       are driving". -->
  <div
    data-tour-rail
    class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3
           rounded-full bg-text/92 px-4 py-2 text-surface shadow-lg backdrop-blur-sm"
  >
    <button
      type="button"
      aria-label="Previous step"
      class="flex size-11 items-center justify-center rounded-full hover:bg-surface/15"
      @click="emit('back')"
    >
      ❮
    </button>

    <ol class="flex items-center gap-1.5">
      <li v-for="c in props.chapters" :key="c.id">
        <button
          type="button"
          :data-tour-chapter="c.id"
          :aria-current="c.id === props.activeChapter ? 'step' : undefined"
          :aria-label="`Chapter: ${c.label}`"
          class="h-1.5 rounded-full transition-all"
          :class="c.id === props.activeChapter
            ? 'w-10 bg-brand'
            : 'w-6 bg-surface/35 hover:bg-surface/60'"
          @click="emit('chapter', c.id)"
        />
      </li>
    </ol>

    <button
      type="button"
      :aria-label="props.atEnd ? 'Finish the guided tour' : 'Next step'"
      class="flex size-11 items-center justify-center rounded-full hover:bg-surface/15"
      @click="emit('next')"
    >
      {{ props.atEnd ? '✓' : '❯' }}
    </button>

    <p role="status" aria-live="polite" class="text-caption tabular-nums opacity-70">
      {{ props.stepIndex + 1 }} / {{ props.stepCount }}
    </p>

    <button
      type="button"
      aria-label="Close the guided tour"
      class="flex size-11 items-center justify-center rounded-full hover:bg-surface/15"
      @click="emit('exit')"
    >
      ✕
    </button>
  </div>
</template>
