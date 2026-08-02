<script setup lang="ts">
/**
 * The halo drawn over the current target.
 *
 * Purely an overlay: it never touches the target element, so nothing about
 * the app's own layout, stacking or canvas sizing changes while the tour
 * runs. Positioning is viewport-fixed because the rect handed in comes from
 * getBoundingClientRect.
 */
const props = defineProps<{ rect: DOMRect | null }>()
</script>

<template>
  <div
    v-if="props.rect"
    data-tour-halo
    aria-hidden="true"
    class="pointer-events-none fixed z-40 rounded-card motion-safe:animate-[tour-breathe_2.8s_ease-in-out_infinite]"
    :style="{
      top: `${props.rect.top}px`,
      left: `${props.rect.left}px`,
      width: `${props.rect.width}px`,
      height: `${props.rect.height}px`,
    }"
  />
</template>
