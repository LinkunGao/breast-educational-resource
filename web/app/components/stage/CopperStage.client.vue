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
 * Design doc §7: camera choreography for the loaded scene. Task 9 wires
 * only the entrance orbit and interrupt-on-input here -- deciding *when* to
 * run a density morph vs. a modality flight (chooseTransition) belongs to
 * whatever drives case/modality navigation, which is Task 10's job
 * (controller correction C5). `camera` is exposed below so that wiring can
 * reach `flyTo`/`captureOrientation`/`applyOrientation`/`locateLesion`
 * without this component needing to know about them yet.
 */
const camera = useCameraChoreography(stage, modalityScene.scene)

// Runs the entrance orbit once a load finishes successfully (design doc
// §7.4). Watches the loading->not-loading transition specifically (not
// just "loading is false"), so it never fires on initial mount before any
// load has started. Review round 1, I-5: `useModalityScene`'s catch also
// sets `loading.value = false` on a FAILED load, and at that point
// `scene.value` still points at the scene that just failed (activateScene
// ran before the load threw) and has already been evicted from copper3d's
// own scene map -- without this guard, the `role="alert"` overlay below
// covers the canvas while, behind it, a 3-second continuous-render lease
// orbits an empty, evicted scene.
watch(loading, (isLoading, was) => {
  if (was && !isLoading && !assetLoadError.value && !chunkLoadError.value) {
    // Review round 2, NEW-1: this call is fire-and-forget with no local
    // `await`. Review round 1's M-9 fix made a throwing frame callback
    // REJECT the returned promise rather than throw synchronously out of
    // the rAF dispatch -- an unhandled rejection here would surface as
    // Nuxt's dev-overlay/Sentry noise on every such failure instead of the
    // previous window.onerror. There is nothing meaningful to do about a
    // failed decorative entrance orbit (it's pure animation, not state),
    // so this deliberately swallows it rather than surfacing a second error
    // on top of whatever the load-failure path above already shows.
    camera.orbitIntro().catch(() => {})
  }
})

/**
 * Any user input immediately interrupts an in-flight animation and hands
 * control back to OrbitControls (design doc §7.4). Controller correction
 * C3: `camera.interrupt()` itself stops the camera exactly where the
 * current frame left it, rather than snapping to either end of the
 * animation, so this handles both the orbit intro and any future flight.
 */
function onUserInput() { camera.interrupt() }
onMounted(() => {
  host.value?.addEventListener('pointerdown', onUserInput)
  host.value?.addEventListener('wheel', onUserInput, { passive: true })
})
onScopeDispose(() => {
  host.value?.removeEventListener('pointerdown', onUserInput)
  host.value?.removeEventListener('wheel', onUserInput)
})

/**
 * Design doc §5.3: imaging modalities get a dark reading-lightbox
 * background, Anatomy gets a light one. copper3d's canvas is alpha:true,
 * so the background is entirely CSS's call here.
 */
const isFilm = computed(() => props.modality.id !== 'anatomy')

defineExpose({ stage, modalityScene, host, camera })
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
