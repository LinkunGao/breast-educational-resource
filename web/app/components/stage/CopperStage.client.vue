<script setup lang="ts">
import type { Modality } from '~~/content/types'

const props = defineProps<{
  /** Namespaces the scene copper3d builds (`${slug}:${modality.id}`), so
   * two cases can never collide and switching back to an already-loaded
   * modality of the same case can find its scene again. */
  slug: string
  modality: Modality
}>()

const host = ref<HTMLDivElement>()
const stage = useCopperStage(host)
const modalityScene = useModalityScene(stage)
// Destructured at the top level so Vue's template compiler auto-unwraps
// these (a nested `stage.loadError` access in the template would not be).
const { loadError: chunkLoadError } = stage
const { loading, loadError: assetLoadError } = modalityScene

// Loads (or switches to) the scene for the current case/modality pair.
// Re-runs whenever the stage becomes ready or either prop changes -- the
// page's `[[modality]].vue` keeps this component's instance alive across a
// modality-only navigation (app.vue's pageKey pins it to the case slug), so
// this watcher, not a remount, is what drives every modality switch.
watch(
  [() => stage.ready.value, () => props.slug, () => props.modality.id],
  ([ready]) => {
    if (ready) modalityScene.load(props.slug, props.modality)
  },
  { immediate: true },
)

/**
 * Design doc §5.3: imaging modalities get a dark reading-lightbox
 * background, Anatomy gets a light one. copper3d's canvas is alpha:true,
 * so the background is entirely CSS's call here.
 */
const isFilm = computed(() => props.modality.id !== 'anatomy')

defineExpose({ stage, modalityScene, host })
</script>

<template>
  <div
    class="relative flex-1 transition-colors duration-500"
    :class="isFilm
      ? 'bg-linear-to-b from-film-bg to-film-bg-2'
      : 'bg-linear-to-b from-surface-sunken to-bg'"
  >
    <!--
      Review fix #9 (Task 7): `role="img"` (correct today -- there is no
      keyboard interaction yet, only Task 8's loaded content and Task 9/10's
      mouse orbit) previously carried `tabindex="0"` with no keyboard
      handler, which is exactly what axe flags as a focusable-but-non-
      operable element (WCAG 2.1.1/4.1.2). Design doc §11 does want this
      stage focusable with arrow-key rotate / +-/zoom / [/]-slice -- Task
      9/10's job, once those handlers actually exist. Re-add `tabindex="0"`
      there, alongside the handlers, not before.

      Always mounted, never behind a v-if (a bug fixed while wiring Task 8):
      useCopperStage builds its one WebGLRenderer against whatever DOM node
      `host` pointed to at mount time and never rebuilds it. `assetLoadError`
      clears on every subsequent successful `load()`, so a v-if/v-else here
      would unmount-then-remount this element on recovery, leaving the
      existing canvas attached to an orphaned node while a brand new, empty
      host sits in the document -- a permanently blank stage even though the
      error had cleared. The error/loading states below overlay this
      element instead of replacing it.
    -->
    <div
      ref="host"
      class="absolute inset-0"
      role="img"
      :aria-label="`${props.modality.label} viewer`"
    />

    <!-- Task 7 review fix #7 (copper3d's own chunk failed to import) and
         Task 8's asset-load failure (a timed-out/failed GLB or NRRD fetch)
         both render through this same message rather than leaving a
         permanently-empty stage with nothing but a console warning. -->
    <p
      v-if="chunkLoadError || assetLoadError"
      role="alert"
      class="absolute inset-0 flex items-center justify-center p-4 text-center text-body-sm text-text-muted"
      :class="isFilm ? 'bg-film-bg' : 'bg-bg'"
    >
      Couldn't load the 3D viewer. Check your connection and reload the page.
    </p>

    <div
      v-else-if="loading"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div
        class="flex items-center gap-3 rounded-card px-4 py-3 backdrop-blur-sm"
        :class="isFilm ? 'bg-film-bg/70 text-surface' : 'bg-surface/80 text-text'"
        role="status"
        aria-live="polite"
      >
        <span
          class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
        <span class="text-body-sm">Loading {{ props.modality.label }}…</span>
      </div>
    </div>
  </div>
</template>
