<script setup lang="ts">
import type { ModalityId } from '~~/content/types'

const props = defineProps<{
  modality: ModalityId
  /** Display label, e.g. "3D MRI" -- for the accessible name below.
   * Not medical copy (content/types.ts), so it's fine to pass through
   * as-is rather than re-deriving it from the ModalityId here. */
  label: string
}>()

const host = ref<HTMLDivElement>()
const stage = useCopperStage(host)
// Destructured at the top level so Vue's template compiler auto-unwraps
// it (a nested `stage.loadError` access in the template would not be).
const { loadError } = stage

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
    <!-- Review fix #7: surface a copper3d chunk-load failure instead of
         leaving a permanently-empty stage with only an unhandled
         rejection in the console. -->
    <p
      v-if="loadError"
      role="alert"
      class="absolute inset-0 flex items-center justify-center p-4 text-center text-body-sm text-text-muted"
    >
      Couldn't load the 3D viewer. Check your connection and reload the page.
    </p>
    <!--
      Review fix #9: `role="img"` (correct today -- there is no keyboard
      interaction yet, only Task 8's loaded content and Task 9/10's mouse
      orbit) previously carried `tabindex="0"` with no keyboard handler,
      which is exactly what axe flags as a focusable-but-non-operable
      element (WCAG 2.1.1/4.1.2). Design doc §11 does want this stage
      focusable with arrow-key rotate / +-/zoom / [/]-slice -- Task 9/10's
      job, once those handlers actually exist. Re-add `tabindex="0"`
      there, alongside the handlers, not before.

      The aria-label now uses the resolved display label ("3D MRI"), not
      the raw ModalityId ("mri") the previous version interpolated.
    -->
    <div
      v-else
      ref="host"
      class="absolute inset-0"
      role="img"
      :aria-label="`${props.label} viewer`"
    />
  </div>
</template>
