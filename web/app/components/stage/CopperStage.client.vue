<script setup lang="ts">
import type { CaseGroup, Modality } from '~~/content/types'
import { chooseTransition } from '~/composables/cameraTransitions'
import type { ViewKey } from '~/composables/cameraTransitions'
import type { StageOptions } from '~/composables/useCopperStage'

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

/** §7.1: the crossfade's own duration. This is a MATERIAL crossfade between
 * two density models, not camera motion, so it survives the human's "no
 * animation" ruling -- nothing about it moves the view. */
const MORPH_MS = 800
/** §11: one 5-degree orbit step per arrow key, 10% per `+`/`-`. */
const ORBIT_STEP = Math.PI / 36
const ZOOM_STEP = 0.9

const host = ref<HTMLDivElement>()
/**
 * Passed to `useCopperStage` below, then mutated once `modalityScene`
 * exists -- `useModalityScene` is built FROM `stage`, so there is nothing to
 * pass a resize hook that calls into it until both are constructed. The
 * `ResizeObserver`'s callback closes over this same object and reads
 * `.onResize` fresh on every fire, so assigning it here (before the observer
 * can ever fire -- `onMounted`'s dynamic `import('copper3d')` has not even
 * started yet) is enough. See `StageOptions`.
 */
const stageOptions: StageOptions = {}
const stage = useCopperStage(host, stageOptions)
const modalityScene = useModalityScene(stage)
stageOptions.onResize = ({ width, height }) => {
  modalityScene.refitCurrentScene(height > 0 ? width / height : 1)
}
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

/*
 * §5.3's dark "reading lightbox" background for imaging modalities is GONE,
 * at the human's instruction: "所有images的panel背景为何是黑色的呢？不应该
 * 是要一致都是透明色吗？". Every modality now sits on the same background,
 * and copper3d's canvas is alpha:true, so that background is entirely CSS's
 * -- exactly as the legacy app had it (frontend/plugins/copper.js's
 * `alpha: true` on all three renderers, with the page's own colour showing
 * through).
 *
 * The `film` flag on `useStageControls` went with it; the control bar is a
 * single appearance now.
 */

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
async function runDensityMorph(token: number): Promise<boolean> {
  const morph = await modalityScene.prepareMorph(props.slug, props.modality).catch(() => {
    // The incoming GLB never arrived. Fall through to the ordinary load,
    // which reports the failure through `loadError` like any other.
    return null
  })
  if (!morph) return false

  // Fix round 1: that await is a ~1.28MB download, and the user can step to
  // a third density inside it. Without this check the superseded morph
  // would come back and call `camera.animate`, whose unconditional
  // `interrupt()` kills whatever the NEWER navigation started (its entrance
  // orbit, mid-swing) and then spends 800ms crossfading a scene nobody is
  // looking at. Task 8 and Task 9 both already guard their own awaits this
  // way; this was the one path that did not.
  //
  // Committing rather than bailing outright: the incoming model is already
  // in that scene (copper3d's `loadGltf` adds it itself), so abandoning it
  // here would leave two models stacked, one of them invisible, forever.
  // `commit` settles the swap without animating and without touching the
  // driver the newer navigation now owns.
  if (token !== navToken) {
    morph.commit()
    return true
  }

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

  if (transition === 'density-morph' && await runDensityMorph(token)) return
  if (token !== navToken) return

  // Every modality switch is a hard cut, and the first view of a case has no
  // entrance orbit. Both §7.3's inter-modality camera flight and §7.4's
  // entrance orbit were built and then removed at the human's explicit
  // instruction ("去掉所有的模型和image上的旋转动画", and the flight with it):
  // they moved the camera away from wherever the reader had put it and got
  // in the way of the interactions this stage exists for. `load()` applies
  // the modality's own view preset and renders, which is the whole job now.
  //
  // `chooseTransition` is still consulted above -- the density morph is a
  // material crossfade with a stationary camera, and is unaffected.
  await modalityScene.load(props.slug, props.modality)
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
 * An instant jump, not a flight: see `enterView` on why no camera animation
 * survives on this stage. `loadView` writes the camera AND `controls.target`
 * together (Scene/baseScene.js:88-98), which is the sync correction C3
 * flagged as load-bearing -- so going through it directly, rather than
 * through an animation driver, keeps that in one place too.
 */
function onReset() {
  if (!isHealthy()) return
  const target = modalityScene.scene.value
  const preset = modalityScene.viewpoint.value
  if (!target || !preset) return
  target.loadView(preset)
  // "Reset view" means back to the opening framing, which includes handing
  // refitting back to the layout.
  modalityScene.markPosed(false)
  modalityScene.refitCurrentScene(stage.aspect())
  stage.renderer.value?.render()
}

/**
 * §7.2, reduced to what survives the no-camera-animation ruling: jump the
 * slice to the one holding the lesion. §7.2's camera push-in is gone with
 * every other camera move (see `enterView`), so this no longer needs the
 * animation driver at all -- it writes the index, repaints, and renders.
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
  if (!state || props.lesionSliceIndex <= 0) return

  slice.jumpTo(props.lesionSliceIndex)
}

// ── Input ────────────────────────────────────────────────────────────────

/**
 * Any user input immediately interrupts an in-flight animation and hands
 * control back to OrbitControls (design doc §7.4). Controller correction
 * C3 (Task 9): `camera.interrupt()` stops the camera exactly where the
 * current frame left it rather than snapping to either end.
 *
 * Also marks this scene posed (Task 3, three-up plan): any real gesture
 * means a later panel resize must refit nothing and leave the reader's view
 * where they put it. This fires on exactly the two gestures that mean the
 * user is driving -- see the `pointerdown`/`wheel` listeners below.
 */
function onUserInput() {
  camera.interrupt()
  modalityScene.markPosed(true)
}

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
  const canRotate = modalityScene.scene.value?.controls.noRotate !== true

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

// `await nextTick()` for the same reason as useSliceControl's `attach` and
// useCopperStage's mount hook: `host` is not bound yet when `onMounted`
// fires, so both of these registered on `undefined` and did nothing.
onMounted(async () => {
  await nextTick()
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
  })
  /**
   * Published only once the actions can DO something.
   *
   * This used to run in `onMounted`, before the async renderer build. The
   * control bar takes `ready` from whether `actions` is set, so Reset and
   * Locate rendered enabled and silently did nothing through a 53MB NRRD
   * download -- a control that looks available and no-ops is a worse failure
   * than a disabled one, and it contradicted StageControls' own prop
   * documentation.
   *
   * `isHealthy()` is the same gate both actions check internally, so the
   * enabled state and the actions' own guards can no longer disagree.
   */
  watchEffect(() => {
    stageControls.actions.value = isHealthy()
      ? { reset: onReset, locateLesion: onLocate }
      : null
  })
  onScopeDispose(() => {
    stageControls.actions.value = null
  })
}

defineExpose({ stage, modalityScene, host, camera, slice })
</script>

<template>
  <div
    class="relative flex-1 bg-linear-to-b from-surface-sunken to-bg"
  >
    <!--
      `role="application"`, NOT `role="img"`.

      This element advertises arrow-key rotation through
      `aria-describedby`, and with `role="img"` that was a lie: NVDA and JAWS
      are in browse mode over an image and consume the arrow keys themselves,
      so the keys never reached `onStageKeydown`. `application` is the
      documented escape hatch for a widget that handles its own keys, and it
      costs nothing here -- the only thing inside is a canvas, so there is no
      readable content for browse mode to have been useful on. The name and
      the key help both still come through, because `aria-label` and
      `aria-describedby` are unaffected by the role.

      The focus ring is drawn with an inset double box-shadow rather than an
      outline, and that is a contrast fix, not a stylistic one. The stage is
      `absolute inset-0` inside a column that scrolls and clips, so an
      outward ring gets cut off -- but the inward `-outline-offset-2` it used
      instead put the brand ring straight onto canvas pixels, where its
      contrast depends on whatever the model happens to be showing and cannot
      be guaranteed at all. The inner shadow pairs the brand ring with a 2px
      surface-coloured ring just outside it, so it always sits against a
      known colour: 4.95:1 on `--color-surface`, comfortably over §11's 3:1
      non-text floor, whatever is rendered underneath. Pinned in
      test/nav-contrast.test.ts.

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
      class="absolute inset-0 focus-visible:outline-none
             focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand),inset_0_0_0_4px_var(--color-surface)]"
      role="application"
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
      class="absolute inset-0 flex items-center justify-center bg-bg p-4 text-center text-body-sm text-text-muted"
    >
      Couldn't load the 3D viewer. Check your connection and reload the page.
    </p>

    <div
      v-else-if="loading"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div
        class="flex items-center gap-3 rounded-card bg-surface/80 px-4 py-3 text-text backdrop-blur-sm"
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
