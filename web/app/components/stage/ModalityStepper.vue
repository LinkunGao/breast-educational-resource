<script setup lang="ts">
import type { Modality, ModalityId } from '~~/content/types'

const props = defineProps<{
  modalities: Modality[]
  active: ModalityId
  slug: string
}>()

/**
 * Per-modality ink token and icon.
 *
 * ## The icons
 *
 * The previous set was a filled blob, an empty square, two arcs and a pair of
 * concentric circles. They were abstract geometry with no relationship to
 * anything, which is exactly how they read: "你那三个图标有什么含义吗？完全
 * 搞不懂". Each of these draws HOW THE IMAGE IS MADE, which is the one thing
 * that actually distinguishes the four:
 *
 *   anatomy     a breast in profile against the chest wall -- the model
 *   mammogram   the same profile flattened between two compression plates
 *   ultrasound  a transducer and the sector it insonates
 *   mri         a stack of parallel slices through a volume
 *
 * All stroke, no fill, so they hold up at 16px and inherit the step's own
 * colour without a second token.
 */
const STYLE: Record<ModalityId, { ink: string, paths: string[] }> = {
  anatomy: {
    ink: 'text-anatomy-ink',
    // A semicircle off a vertical chest wall, plus the nipple. The first
    // attempt drew the profile as a shallow bezier and, at 16px, came out as
    // a play triangle. An arc is unambiguous at any size, and the roundness
    // is the whole contrast with the flattened mammogram icon below.
    paths: ['M4.5 3.5v17', 'M4.5 5.5a6.5 6.5 0 0 1 0 13', 'M11 12h3.5'],
  },
  mammogram: {
    ink: 'text-mammogram-ink',
    // The same breast, flattened between two compression plates -- which is
    // literally what a mammogram does to it, and reads against the anatomy
    // icon precisely because the two share a shape.
    paths: ['M3 6.5h18', 'M3 17.5h18', 'M4.5 9v6', 'M4.5 9c7 0 11 .9 11 3s-4 3-11 3'],
  },
  ultrasound: {
    ink: 'text-ultrasound-ink',
    // Transducer plus the sector it insonates. The sector is deliberately
    // wide and the arc inside it is what makes it read as a beam rather than
    // as a lampshade.
    paths: ['M9.5 3h5v3.5h-5z', 'M9.5 6.5 4.5 19.5h15L14.5 6.5', 'M8 14.5a6.6 6.6 0 0 1 8 0'],
  },
  mri: {
    ink: 'text-mri-ink',
    paths: ['M12 3.5 3.5 8 12 12.5 20.5 8z', 'M3.5 12 12 16.5 20.5 12', 'M3.5 16 12 20.5 20.5 16'],
  },
}

const activeIndex = computed(
  () => props.modalities.findIndex(m => m.id === props.active),
)

/** Left/right arrow keys move between steps (design doc §11). */
function onKeydown(event: KeyboardEvent) {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return
  const next = activeIndex.value + delta
  if (next < 0 || next >= props.modalities.length) return
  event.preventDefault()
  navigateTo(`/${props.slug}/${props.modalities[next]!.id}`)
}
</script>

<template>
  <!--
    A tab strip, not a numbered stepper.

    What this replaces: a numbered chip, then an icon, then a label, then a
    dashed connector, then the same again -- with the active step wrapped in a
    coloured pill. Four competing marks per step and a hard-edged pill on top;
    the human's verdict was "你这个设计也太丑了吧".

    The order is still conveyed -- an `<ol>`, read left to right, with
    `aria-current="step"` -- but by the arrangement rather than by drawing
    numbers over it. The active step is marked by weight, by the modality's
    own ink, and by a 2px rule sitting on the container's bottom border, which
    is the quietest available way to say "you are here".
  -->
  <ol
    class="flex items-center gap-1 overflow-x-auto px-4"
    aria-label="Imaging modalities"
    @keydown="onKeydown"
  >
    <li v-for="m in props.modalities" :key="m.id">
      <NuxtLink
        :to="`/${props.slug}/${m.id}`"
        class="relative flex min-h-12 shrink-0 items-center gap-2 px-3 text-body-sm
               transition-colors
               after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full
               after:bg-current after:transition-opacity"
        :class="m.id === props.active
          ? [STYLE[m.id].ink, 'font-bold after:opacity-100']
          : 'text-text-muted hover:text-text after:opacity-0'"
        :aria-current="m.id === props.active ? 'step' : undefined"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-for="d in STYLE[m.id].paths" :key="d" :d="d" />
        </svg>

        <span class="whitespace-nowrap">{{ m.label }}</span>
      </NuxtLink>
    </li>
  </ol>
</template>
