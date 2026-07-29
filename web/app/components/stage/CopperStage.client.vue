<script setup lang="ts">
import type { CaseGroup, Modality } from '~~/content/types'
import { chooseTransition, poseDistance, viewPointToPose } from '~/composables/cameraTransitions'
import type { ViewKey } from '~/composables/cameraTransitions'

/**
 * Controller correction C7: this component takes `slug` plus the two case
 * fields the choreography actually reads, not the whole `Case`. `slug` has
 * to stay a prop of its own regardless (it namespaces copper3d's scenes),
 * and the alternative -- passing the `Case` and reading `case.slug` here --
 * would give the same value two names inside one component. Everything else
 * on `Case` is content, which this component has no business seeing.
 */
const props = defineProps<{
  /** Namespaces the scene copper3d builds (`${slug}:${modality.id}`), so
   * two cases can never collide and switching back to an already-loaded
   * modality of the same case can find its scene again. */
  slug: string
  /** Design doc §7.1's morph family gate: the density crossfade fires only
   * within the `density`/`overview` family (see `chooseTransition`). */
  group: CaseGroup
  /** §7.2: the slice holding this case's lesion, or 0 when it has none.
   * Only the five lesion cases carry a non-zero value. */
  lesionSliceIndex: number
  modality: Modality
}>()

/** §7.1: the crossfade's own duration. */
const MORPH_MS = 800
/** §7.3: a modality flight. */
const FLIGHT_MS = 1200
/** §7.2: the locate glide (camera push-in and slice glide together). */
const LOCATE_MS = 900
/** §7.2's "push in toward the lesion region", expressed as a fraction of
 * the modality's own framed composition distance rather than of wherever
 * the user happens to be. That makes repeated clicks idempotent, and it
 * cannot creep the camera into the volume over a run of them. */
const LESION_DOLLY = 0.6
/** "Reset view" is a short flight rather than a jump so the user can see
 * where the view went; reduced motion collapses it to the jump. */
const RESET_MS = 500
/** §11: one 5-degree orbit step per arrow key, 10% per `+`/`-`. */
const ORBIT_STEP = Math.PI / 36
const ZOOM_STEP = 0.9

const host = ref<HTMLDivElement>()
const stage = useCopperStage(host)
const modalityScene = useModalityScene(stage)
// Destructured at the top level so Vue's template compiler auto-unwraps
// these (a nested `stage.loadError` access in the template would not be).
const { loadError: chunkLoadError } = stage
const { loading, loadError: assetLoadError } = modalityScene

/**
 * Design doc §7: camera choreography for the loaded scene. Task 9 built the
 * primitives; this component decides which one runs when.
 */
const camera = useCameraChoreography(stage, modalityScene.scene)

/**
 * §7.5 slice scrubbing. `camera.animate` is handed in rather than imported
 * so the follower shares the one animation driver -- see useSliceControl's
 * header and controller correction C8.
 */
const slice = useSliceControl(host, modalityScene.scene, modalityScene.sliceState, camera.animate)

/**
 * Design doc §5.3: imaging modalities get a dark reading-lightbox
 * background, Anatomy gets a light one. copper3d's canvas is alpha:true,
 * so the background is entirely CSS's call here.
 */
const isFilm = computed(() => props.modality.id !== 'anatomy')

/** Nothing has failed and something is actually on screen. Every action and
 * every transition checks this: `useModalityScene`'s catch clears neither
 * `viewpoint` nor `sliceState` on a failed load, so a stale preset can
 * coexist with a scene that was already evicted from copper3d's map. */
function isHealthy() {
  return !assetLoadError.value && !chunkLoadError.value && Boolean(modalityScene.scene.value)
}

// ── Navigation choreography ──────────────────────────────────────────────
//
// Controller correction C5: ONE watcher decides. An earlier draft of this
// task added a second watcher on the same sources to pick the transition,
// leaving this one to load unconditionally -- so a density morph would have
// crossfaded two models inside a scene that the other watcher was
// simultaneously replacing out from under it, and §7.1 would have done
// nothing at all while appearing to be wired up. The density branch below
// therefore SUPPRESSES the load entirely; that is the whole point of §7.1,
// where the scene and the camera both stay put and only the model changes.

/** The view this stage last settled on, so `chooseTransition` has a "from".
 * Not reactive: nothing renders from it. */
let previousView: ViewKey | null = null

/** Bumped on every navigation. `useModalityScene` has its own token for its
 * own refs; this one guards the choreography that runs AFTER the awaited
 * load resolves, so a slow load finishing behind the user's back cannot
 * start a flight for a view that is no longer on screen. */
let navToken = 0

/**
 * §7.1. Returns true when the crossfade handled this navigation, false when
 * the caller should fall through to an ordinary load -- there is nothing on
 * screen to fade from, or (controller correction C12) the incoming asset is
 * the one already displayed, as for `the-breast` <-> `density-a`, which
 * share `density25.glb`.
 */
async function runDensityMorph(): Promise<boolean> {
  const morph = await modalityScene.prepareMorph(props.modality).catch(() => {
    // The incoming GLB never arrived. Fall through to the ordinary load,
    // which reports the failure through `loadError` like any other.
    return null
  })
  if (!morph) return false

  try {
    await camera.animate(MORPH_MS, t => morph.apply(t))
  }
  finally {
    // On completion, on interruption, and on a throwing frame alike: the
    // stage must never be left showing two half-transparent models.
    // `commit` snaps to the end state rather than trusting the last frame.
    morph.commit()
    stage.renderer.value?.render()
  }
  return true
}

/**
 * Loads (or switches to) the scene for the current case/modality pair and
 * runs whichever §7 transition that navigation calls for.
 *
 * Controller correction C6: the flight is driven off ACTUAL load
 * completion. `await load()` is that signal for both a fresh download and a
 * cache hit; `nextTick` (which an earlier draft used) only flushes Vue's
 * render queue and would have measured the camera before a GLB or a 53MB
 * NRRD had arrived, flying to whatever pose happened to be current. It also
 * settles C6's second half: a flight and an entrance orbit are alternatives
 * chosen here, so they can never both fire for one load.
 */
async function enterView() {
  const token = ++navToken
  const next: ViewKey = {
    group: props.group,
    slug: props.slug,
    modality: props.modality.id,
  }
  const transition = previousView ? chooseTransition(previousView, next) : 'cut'
  previousView = next

  if (transition === 'density-morph' && await runDensityMorph()) return

  // Captured BEFORE the load: a flight starts from the outgoing scene's
  // orientation, and `load()` switches the renderer to the incoming scene's
  // own camera (each modality owns one -- Task 8's per-modality cache).
  const orientation = transition === 'modality-flight' ? camera.captureOrientation() : null

  await modalityScene.load(props.slug, props.modality)
  if (token !== navToken || !isHealthy()) return

  const preset = modalityScene.viewpoint.value
  if (!preset) return
  const destination = viewPointToPose(preset)

  if (orientation) {
    // Snap the incoming camera to the apparent orientation the outgoing one
    // had, at the incoming scene's own composition distance, then fly on to
    // its framed preset. The viewer sees one camera swinging across rather
    // than a cut followed by an unrelated flight.
    camera.applyOrientation(orientation, poseDistance(destination))
    await camera.flyTo(destination, FLIGHT_MS)
    return
  }

  // §7.4: the first view of a case gets the entrance orbit instead.
  await camera.orbitIntro()
}

watch(
  [() => stage.ready.value, () => props.slug, () => props.modality.id],
  ([ready]) => {
    // Fire-and-forget by design, but never unhandled: a frame callback that
    // throws rejects the driver's promise (Task 9's M-9), and there is
    // nothing useful to do about a failed decorative transition beyond not
    // stacking a second error on top of whatever the load-failure overlay
    // is already showing.
    if (ready) void enterView().catch(() => {})
  },
  { immediate: true },
)

// ── Control bar actions ──────────────────────────────────────────────────

/**
 * Controller correction C3: `resetView()` does not exist on this renderer's
 * scene class, and `getDefaultViewPoint()` returns copper3d's own default
 * rather than the framing this app chose. The modality's real preset --
 * what the user first saw, which is what "Reset view" means here -- is
 * `modalityScene.viewpoint`.
 *
 * Routed through `flyTo` rather than `loadView` + `render`: it lands on the
 * identical pose, and it means the `controls.target` sync C3 flags as
 * load-bearing lives in exactly one place instead of being re-remembered at
 * every call site. Under reduced motion the driver collapses this to the
 * instant jump C3 describes, with no lease taken.
 */
function onReset() {
  if (!isHealthy()) return
  const preset = modalityScene.viewpoint.value
  if (!preset) return
  void camera.flyTo(viewPointToPose(preset), RESET_MS).catch(() => {})
}

/**
 * §7.2. Controller correction C9: the camera push-in and the slice glide
 * are ONE animation (see `locateLesion`), because this driver has a single
 * cancel slot and two calls would cancel each other.
 *
 * The third thing §7.2 asks for -- a 600ms outline highlight on arrival --
 * is NOT built. There is nothing in this app that knows where a lesion is:
 * `lesionSliceIndex` is a single slice number, with no bounding box, no
 * contour and no segmentation mask anywhere in the content model or the
 * shipped assets. Any "outline" drawn from that would be an invented shape
 * in an invented place on a medical image. See task-10-report.md.
 */
function onLocate() {
  if (!isHealthy()) return
  const state = modalityScene.sliceState.value
  const preset = modalityScene.viewpoint.value
  if (!state || props.lesionSliceIndex <= 0) return

  void camera.locateLesion(state.raw, props.lesionSliceIndex, {
    durationMs: LOCATE_MS,
    dollyTo: preset ? poseDistance(viewPointToPose(preset)) * LESION_DOLLY : undefined,
    // The glide writes `raw.index` directly, so the readout has to be told;
    // per frame, not once at the end, or the number sits still and then
    // jumps.
    onIndex: () => slice.syncFromRaw(),
  })
    .then(() => slice.settle())
    .catch(() => {})
}

// ── Input ────────────────────────────────────────────────────────────────

/**
 * Any user input immediately interrupts an in-flight animation and hands
 * control back to OrbitControls (design doc §7.4). Controller correction
 * C3 (Task 9): `camera.interrupt()` stops the camera exactly where the
 * current frame left it rather than snapping to either end.
 */
function onUserInput() { camera.interrupt() }

/**
 * §11's stage keyboard: arrow keys orbit, `+`/`-` zoom. (`[`/`]` are
 * useSliceControl's, on the same element.)
 *
 * Controller correction C10: Task 7 removed `tabindex="0"` from the stage
 * because a focusable element with no keyboard handler is exactly what axe
 * flags (WCAG 2.1.1/4.1.2), and left a note to re-add it "alongside the
 * handlers, not before". This is those handlers, so the template below
 * re-adds it.
 *
 * Steps are applied instantly rather than eased: a key press is a discrete
 * step, and easing each one visibly lags a held key's own repeat rate.
 */
function onStageKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  // The 2D ultrasound modality has rotation disabled (there is one flat
  // slice to look at), so the arrow keys must not quietly re-enable by
  // another route what the pointer cannot do.
  const canRotate = modalityScene.scene.value?.controls.enableRotate !== false

  switch (event.key) {
    case 'ArrowLeft': if (!canRotate) return; camera.nudgeOrbit(-ORBIT_STEP, 0); break
    case 'ArrowRight': if (!canRotate) return; camera.nudgeOrbit(ORBIT_STEP, 0); break
    case 'ArrowUp': if (!canRotate) return; camera.nudgeOrbit(0, ORBIT_STEP); break
    case 'ArrowDown': if (!canRotate) return; camera.nudgeOrbit(0, -ORBIT_STEP); break
    case '+': case '=': camera.zoomBy(ZOOM_STEP); break
    case '-': case '_': camera.zoomBy(1 / ZOOM_STEP); break
    default: return
  }
  event.preventDefault()
}

onMounted(() => {
  host.value?.addEventListener('pointerdown', onUserInput)
  host.value?.addEventListener('wheel', onUserInput, { passive: true })
})
onScopeDispose(() => {
  host.value?.removeEventListener('pointerdown', onUserInput)
  host.value?.removeEventListener('wheel', onUserInput)
})

// ── Control bar wiring ───────────────────────────────────────────────────
//
// The bar renders into the layout's `#controls` slot, a SIBLING of this
// component, so `defineExpose` cannot reach it (controller correction C13).
// The case page provides this context and both sides talk through it. No
// event bus.
const stageControls = useStageControls()
if (stageControls) {
  watchEffect(() => {
    stageControls.sliceIndex.value = slice.index.value
    stageControls.sliceMax.value = slice.max.value
    stageControls.settledSliceIndex.value = slice.settledIndex.value
    stageControls.film.value = isFilm.value
  })
  onMounted(() => {
    stageControls.actions.value = { reset: onReset, locateLesion: onLocate }
  })
  onScopeDispose(() => {
    stageControls.actions.value = null
  })
}

defineExpose({ stage, modalityScene, host, camera, slice })
</script>

<template>
  <div
    class="relative flex-1 transition-colors duration-500"
    :class="isFilm
      ? 'bg-linear-to-b from-film-bg to-film-bg-2'
      : 'bg-linear-to-b from-surface-sunken to-bg'"
  >
    <!--
      `tabindex="0"` is back, together with the handlers Task 7 said to wait
      for (controller correction C10). The focus outline is drawn INSIDE the
      box: the stage is `absolute inset-0` inside a column that scrolls and
      clips, so the default +2px offset would put the ring outside the
      stage's own bounds where it can be cut off. `--color-brand` on the
      dark film background measures 3.98:1 and on the light one 3.72:1,
      both clear of §11's 3:1 non-text floor (asserted in
      test/nav-contrast.test.ts).

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
      class="absolute inset-0 focus-visible:outline-2 focus-visible:outline-brand
             focus-visible:-outline-offset-2"
      role="img"
      tabindex="0"
      :aria-label="`${props.modality.label} viewer`"
      aria-describedby="stage-keyboard-help"
      @keydown="onStageKeydown"
    />

    <p id="stage-keyboard-help" class="sr-only">
      Arrow keys rotate the view, plus and minus zoom, left and right square
      brackets step through slices.
    </p>

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
