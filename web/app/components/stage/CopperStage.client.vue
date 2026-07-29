<script setup lang="ts">
import type { ModalityId } from '~~/content/types'

const props = defineProps<{ modality: ModalityId }>()

const host = ref<HTMLDivElement>()
const stage = useCopperStage(host)

/**
 * Design doc §5.3: imaging modalities get a dark reading-lightbox
 * background, Anatomy gets a light one. copper3d's canvas is alpha:true,
 * so the background is entirely CSS's call here.
 */
const isFilm = computed(() => props.modality !== 'anatomy')

defineExpose({ stage, host })
</script>

<template>
  <div
    class="relative flex-1 transition-colors duration-500"
    :class="isFilm
      ? 'bg-linear-to-b from-film-bg to-film-bg-2'
      : 'bg-linear-to-b from-surface-sunken to-bg'"
  >
    <div
      ref="host"
      class="absolute inset-0"
      role="img"
      :aria-label="`Interactive ${props.modality} viewer`"
      tabindex="0"
    />
  </div>
</template>
