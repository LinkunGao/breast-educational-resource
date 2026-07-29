import type { Ref } from 'vue'
import type { CopperScene } from './copper-types'
import type { SliceState } from './useModalityScene'

/**
 * Slice scrubbing (design doc §7.5 and §11's `[`/`]` binding).
 *
 * The legacy implementation (frontend/plugins/copper.js:68-129) moved the
 * slice by exactly ±1 spacing per pointermove regardless of how far the
 * pointer had actually travelled, so the feel had nothing to do with the
 * gesture, and it added/removed its own `pointerdown` listener from inside
 * `pointermove` on every raycast miss. Here the drag distance sets a TARGET
 * slice number and an eased follower chases it, and the listeners are
 * attached exactly once.
 *
 * Three things this file deliberately does not do:
 *
 *  · It owns no animation loop. The follower runs on `run`, which is
 *    useCameraChoreography's `animate` (Task 10 controller correction C8):
 *    one interruptible, reduced-motion-aware, lease-owning driver for the
 *    whole app. Injected rather than imported so this file cannot quietly
 *    become a second one.
 *  · It does not announce every value it passes through. `index` changes on
 *    every frame of an eased scrub; `settledIndex` changes only when the
 *    scrub stops, and that is what the screen-reader live region is bound to
 *    (controller correction C11 -- a live region on the per-frame value
 *    queues one utterance per frame and makes the app unusable with a
 *    screen reader on).
 *  · It does not scrub every drag. A drag that does not START on the slice
 *    plane belongs to OrbitControls, exactly as in the legacy app.
 */

/** useCameraChoreography's `animate`, injected. See the header. */
export type AnimateFn = (durationMs: number, onFrame: (easedT: number) => void) => Promise<void>

/** Slice numbers per pixel of vertical drag. At 0.25 a full 400px stage
 * height sweeps 100 slices, roughly the depth of this catalogue's volumes
 * (`MaxIndex` runs 27-104), so one full-height drag traverses the volume. */
const SENSITIVITY = 0.25

/** How long the follower takes to reach a newly set target. Short enough
 * that a drag does not feel detached from the pointer, long enough that a
 * single `[`/`]` step reads as motion rather than a jump. */
const FOLLOW_MS = 180

function clamp(value: number, max: number) {
  return Math.min(max, Math.max(0, value))
}

export function useSliceControl(
  host: Ref<HTMLElement | undefined>,
  scene: Ref<CopperScene | undefined>,
  sliceState: Ref<SliceState | null>,
  run: AnimateFn,
) {
  /** The displayed slice number: rounded, updated every frame. */
  const index = ref(0)
  const max = ref(0)
  /** The last value the scrub actually came to rest on -- see the header. */
  const settledIndex = ref(0)

  /**
   * The follower's own fractional position. Kept separate from `index`
   * on purpose: an earlier draft used the rounded `index` as the
   * follower's current value, which made the follower unable to converge
   * at all once the remaining distance dropped below one slice (the eased
   * step rounded back to the value it started from, and the loop spun
   * forever holding the continuous-render lease).
   */
  let current = 0
  let target = 0
  /** Bumped on every `follow()`; guards the settle announcement against a
   * superseded follow's own promise resolving later. */
  let followToken = 0

  let dragging = false
  let lastY = 0
  /** `controls.enableRotate` as it was before a scrub suppressed it. Not a
   * hardcoded `true` on restore: the 2D ultrasound modality ships with
   * rotation already disabled (useModalityScene's `flat` branch), and
   * restoring it to `true` there would silently make the one flat modality
   * orbitable. */
  let rotateWasEnabled: boolean | null = null

  function applyIndex(next: number) {
    const state = sliceState.value
    if (!state) return
    const clamped = clamp(next, state.max)
    current = clamped
    // `raw.index` is a WORLD coordinate, `clamped` a slice number
    // (copper-types.ts's NrrdSlice doc).
    state.raw.index = clamped * state.raw.volume.spacing[2]
    state.raw.repaint.call(state.raw)
    index.value = Math.round(clamped)
  }

  function follow() {
    const token = ++followToken
    const from = current
    const to = target
    if (Math.abs(to - from) < 1e-3) {
      settledIndex.value = index.value
      return
    }
    run(FOLLOW_MS, t => applyIndex(from + (to - from) * t))
      .then(() => {
        // `run` resolves on interruption as well as on completion, so this
        // announces wherever the scrub actually stopped rather than
        // assuming it reached `to`. The token check drops the announcement
        // entirely when a newer follow has already superseded this one.
        if (token === followToken) settledIndex.value = index.value
      })
      .catch(() => {
        // A frame callback that throws is already surfaced by the driver;
        // there is nothing useful to do with it here, and letting it escape
        // would raise an unhandled rejection on every failed scrub.
      })
  }

  /**
   * Whether a pointer event lands on the slice plane. Decided ONCE per
   * gesture, at pointerdown -- unlike the legacy version, which re-raycast
   * on every move and could therefore change its mind mid-drag. Coordinates
   * are measured against the container's own rect because that is what
   * copper3d's raycaster divides by; the array argument is not optional
   * either. Both are explained on `CopperScene.pickSpecifiedModel`.
   */
  function hitsSlicePlane(event: PointerEvent, el: HTMLElement): boolean {
    const state = sliceState.value
    const target3d = scene.value
    if (!state || !target3d?.pickSpecifiedModel) return false
    const rect = el.getBoundingClientRect()
    const hit = target3d.pickSpecifiedModel([state.mesh], {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    return Boolean(hit.intersectedObject)
  }

  function onPointerDown(event: PointerEvent) {
    const el = host.value
    if (!el || !sliceState.value || event.button !== 0 || !event.isPrimary) return
    if (dragging || !hitsSlicePlane(event, el)) return

    dragging = true
    lastY = event.clientY
    target = current
    el.style.cursor = 'ns-resize'

    // This handler runs in the CAPTURE phase specifically so this write
    // lands before OrbitControls sees the same pointerdown: its listener is
    // on the canvas (a descendant of `host`) in the bubble phase, and it
    // latches its rotate state during that handler. Setting `enableRotate`
    // afterwards would be one gesture too late, and the drag would both
    // scrub and orbit.
    const controls = scene.value?.controls
    if (controls) {
      rotateWasEnabled = controls.enableRotate
      controls.enableRotate = false
    }
    // No `setPointerCapture` here: OrbitControls captures the pointer on the
    // canvas during the same gesture, and whichever element captures last
    // wins. Its capture keeps delivering moves to the canvas, which bubble
    // up to `host` regardless, so competing for the capture would buy
    // nothing and lose to it anyway.
  }

  function onPointerMove(event: PointerEvent) {
    const state = sliceState.value
    if (!dragging || !state) return
    const dy = event.clientY - lastY
    lastY = event.clientY
    target = clamp(target + dy * SENSITIVITY, state.max)
    follow()
  }

  function endDrag() {
    if (!dragging) return
    dragging = false
    if (host.value) host.value.style.cursor = ''
    const controls = scene.value?.controls
    if (controls && rotateWasEnabled !== null) controls.enableRotate = rotateWasEnabled
    rotateWasEnabled = null
  }

  /** §11: `[` and `]` step the slice on the focused stage. */
  function onKeydown(event: KeyboardEvent) {
    const state = sliceState.value
    if (!state) return
    const delta = event.key === ']' ? 1 : event.key === '[' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    target = clamp(Math.round(target) + delta, state.max)
    follow()
  }

  function attach() {
    const el = host.value
    if (!el) return
    el.addEventListener('pointerdown', onPointerDown, true)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('keydown', onKeydown)
  }

  function detach() {
    const el = host.value
    if (!el) return
    el.removeEventListener('pointerdown', onPointerDown, true)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', endDrag)
    el.removeEventListener('pointercancel', endDrag)
    el.removeEventListener('keydown', onKeydown)
    endDrag()
  }

  /** Keeps the readout in step with whatever `locateLesion` (or any other
   * writer of `raw.index`) has done to the slice, without this composable
   * having to own that motion itself. Deliberately does not touch
   * `settledIndex`: a caller driving an animation frame by frame calls this
   * every frame, and `settle()` once at the end. */
  function syncFromRaw() {
    const state = sliceState.value
    if (!state) return
    current = state.raw.index / state.raw.volume.spacing[2]
    target = current
    index.value = Math.round(current)
  }

  /** Publishes the current value to the screen-reader readout. */
  function settle() {
    settledIndex.value = index.value
  }

  watch(sliceState, (state) => {
    if (!state) {
      index.value = 0
      max.value = 0
      settledIndex.value = 0
      current = 0
      target = 0
      return
    }
    max.value = state.max
    // Fix round 1, Important: seeded from the plane's actual position, via
    // the same `syncFromRaw` every other reader uses. Switching back to a
    // cached scene restores the very `SliceState` object stored at load
    // time, and nothing repaints that scene on the way in, so anything
    // captured at load time is a stale copy of where the plane really is by
    // then -- see `SliceState`'s own doc.
    syncFromRaw()
    settledIndex.value = index.value
  }, { immediate: true })

  onMounted(attach)
  onScopeDispose(detach)

  return { index, max, settledIndex, syncFromRaw, settle, attach, detach }
}
