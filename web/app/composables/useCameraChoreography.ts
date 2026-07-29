import type { Ref } from 'vue'
import { easeInOutCubic, interpolateFlightPose, orbitSwingAngle, rotateAroundAxis } from './cameraTransitions'
import type { Pose } from './cameraTransitions'
import type { CopperScene, NrrdSlice, StageApi, Vec3 } from './copper-types'

/**
 * Camera choreography (design doc §7): the entrance orbit and the
 * modality-flight primitive, built as an interruptible, reduced-motion-aware
 * driver on top of Task 7's `requestContinuous`/`releaseContinuous` and
 * Task 8's per-modality scene cache.
 *
 * Controller correction C1 (task-9-brief.md): every camera mutation below
 * goes through exactly the four members `CopperCamera` (copper-types.ts)
 * declares -- `position.set`, `up.set`, `lookAt`, `updateProjectionMatrix`.
 * No `three` object of any kind crosses into or out of this file; all the
 * actual interpolation math lives in `cameraTransitions.ts` as pure
 * functions over plain `[x, y, z]` tuples.
 */

/** Reads copper3d's own Vec3-shaped object out as a plain tuple. Never used
 * to construct a foreign vector instance -- only to hand plain numbers to
 * this file's pure helpers and back out through `.set()`. */
function tuple(v: Vec3): [number, number, number] {
  return [v.x, v.y, v.z]
}

export function useCameraChoreography(stage: StageApi, scene: Ref<CopperScene | undefined>) {
  /** Design doc §7: reduced-motion collapses every animation to instant
   * (flyTo) or skips it entirely (orbitIntro, controller correction C6).
   * tokens.css's global reduced-motion guard is CSS-only and does not reach
   * this JS-driven camera motion -- this composable is the unguarded seam
   * design doc §7 calls out, so it owns its own media-query listener. */
  const prefersReducedMotion = ref(false)
  let mql: MediaQueryList | undefined
  const syncMotion = () => { prefersReducedMotion.value = !!mql?.matches }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    syncMotion()
    mql.addEventListener('change', syncMotion)
  })
  // Review round 1, I-3: interrupting on dispose is this composable's own
  // responsibility, not something it should rely on useCopperStage's own
  // teardown to paper over. Without this, a component unmounting mid-orbit
  // (e.g. the user navigates to another case while the 3s entrance orbit is
  // still running) leaves the rAF chain rescheduling against a scene/camera
  // this composable no longer owns for as long as the animation had left to
  // run -- it happens to self-terminate today only because
  // useCopperStage.dispose() separately zeroes continuousHolders, which
  // this file neither knows about nor should depend on.
  onScopeDispose(() => {
    mql?.removeEventListener('change', syncMotion)
    interrupt()
  })

  let cancelCurrent: (() => void) | null = null

  /**
   * Any user input interrupts an in-flight animation. Controller correction
   * C3: this must stop the camera EXACTLY WHERE THE LAST FRAME LEFT IT, not
   * snap it to the animation's end pose -- jumping to the target the
   * instant a drag starts would fight the user's own input (and for
   * `orbitIntro` specifically, the old `onFrame(1)` behaviour mapped to
   * `sin(pi)=0`, teleporting back to the START pose mid-drag, which is
   * worse). A new animation started after an interrupt reads whatever pose
   * is current at that moment (see `flyTo`'s `currentPose()` call) and
   * flies FROM there, never from where an old animation was heading.
   */
  function interrupt() {
    cancelCurrent?.()
    cancelCurrent = null
  }

  /** Generic per-frame interpolation driver. Leases continuous rendering
   * for its own duration and always releases it -- on normal completion, on
   * interruption, and on a throwing frame callback.
   *
   * Review round 1, I-4: `interrupt()` runs unconditionally, BEFORE the
   * reduced-motion/instant-jump branch, not only on the animated path. A
   * running animation (e.g. `orbitIntro`) has its own rAF chain already
   * scheduled; without cancelling it here first, an instant `flyTo(pose, 0)`
   * (a §7.1 "cut", or reduced-motion toggled mid-orbit) would write its
   * destination pose and return, but the orbit's still-queued next frame
   * would fire right after and overwrite it -- the cut silently undone and
   * the orbit's lease outliving it. Every entry to `animate()` now takes
   * ownership of whatever was running, not just the animated one. */
  function animate(durationMs: number, onFrame: (easedT: number) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      interrupt()

      if (prefersReducedMotion.value || durationMs <= 0) {
        // Review round 1, M-8/M-9: this branch used to have no try/catch at
        // all, so a throwing `onFrame` would leave the promise permanently
        // unsettled (an `await camera.flyTo(...)` caller would hang
        // forever). Reject rather than resolve so a caller genuinely learns
        // the jump didn't land, matching the animated path's own failure
        // behaviour below.
        try {
          onFrame(1)
        }
        catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
          return
        }
        stage.renderer.value?.render()
        resolve()
        return
      }

      stage.requestContinuous()
      const start = performance.now()
      let raf = 0
      let done = false

      const finish = () => {
        if (done) return
        done = true
        cancelAnimationFrame(raf)
        stage.releaseContinuous()
        cancelCurrent = null
        resolve()
      }

      // Review round 1, M-9: a throwing frame callback releases the lease
      // and REJECTS -- not `finish()` (which resolves) followed by a
      // rethrow that nothing downstream of a `requestAnimationFrame`
      // dispatch can catch. Without this, `await camera.flyTo(pose);
      // showHighlight()` would proceed as though the flight had landed.
      const fail = (err: unknown) => {
        if (done) return
        done = true
        cancelAnimationFrame(raf)
        stage.releaseContinuous()
        cancelCurrent = null
        reject(err instanceof Error ? err : new Error(String(err)))
      }

      // C3: interrupting cancels in place. No `onFrame(1)` call here.
      cancelCurrent = finish

      const step = (now: number) => {
        let t: number
        try {
          t = Math.min(1, (now - start) / durationMs)
          onFrame(easeInOutCubic(t))
        }
        catch (err) {
          fail(err)
          return
        }
        if (t >= 1) finish()
        else raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
  }

  /** The look-at point every function in this file measures from --
   * `currentPose`, `interpolateFlightPose` (via `flyTo`), `orbitIntro`, and
   * `captureOrientation`/`applyOrientation` all pivot on `controls.target`,
   * falling back to the origin only when OrbitControls hasn't set one yet.
   * `captureOrientation`/`applyOrientation` used to hardcode the origin
   * instead (review round 1, I-2) -- harmless the first time a scene is
   * visited (a fresh scene's `controls.target` really is the origin), but
   * wrong on a repeat visit to a scene an earlier flight had already
   * re-aimed elsewhere. */
  function pivotOf(s: CopperScene | undefined): [number, number, number] {
    const t = s?.controls?.target
    return t ? tuple(t) : [0, 0, 0]
  }

  /** Reads the current scene's camera pose (and OrbitControls target, if
   * any) as a plain `Pose` -- used as a flight's starting point. */
  function currentPose(): Pose | null {
    const cam = scene.value?.camera
    if (!cam) return null
    return {
      position: tuple(cam.position),
      up: tuple(cam.up),
      target: pivotOf(scene.value),
    }
  }

  /**
   * §7.3 modality-flight: arcs the camera from wherever it currently is to
   * `target` over `durationMs`. The actual geometry is
   * `interpolateFlightPose` (cameraTransitions.ts, pure and unit-tested);
   * this just drives it frame by frame and writes the result back through
   * copper3d's own setters.
   */
  async function flyTo(target: Pose, durationMs = 1200) {
    const cam = scene.value?.camera
    const controls = scene.value?.controls
    const from = currentPose()
    if (!cam || !from) return

    await animate(durationMs, (t) => {
      const pose = interpolateFlightPose(from, target, t)
      cam.position.set(pose.position[0], pose.position[1], pose.position[2])
      cam.up.set(pose.up[0], pose.up[1], pose.up[2])
      cam.lookAt(pose.target[0], pose.target[1], pose.target[2])
      cam.updateProjectionMatrix()
      // Controller correction C7 -- LOAD-BEARING: copper3d never syncs
      // OrbitControls' `target` with `camera.lookAt()`. Without this, the
      // user's next drag calls `controls.update()`, which re-aims the
      // camera at whatever `controls.target` still is (stale, usually
      // (0,0,0)) and silently unwinds the flight the instant they touch it.
      controls?.target?.set(pose.target[0], pose.target[1], pose.target[2])
    })
  }

  /**
   * §7.4 entrance orbit: swings out by `turns` and back to the framed
   * preset view -- see `orbitSwingAngle`'s doc and controller correction C4
   * (net rotation is intentionally zero, so `turns` reads as amplitude, not
   * an orbit count). Skipped entirely under reduced motion (C6): unlike
   * `flyTo`, this is pure decoration with no end-state difference from not
   * running it at all, so there is nothing to jump to instantly either.
   */
  async function orbitIntro(durationMs = 3000, turns = 0.6) {
    const cam = scene.value?.camera
    if (!cam || prefersReducedMotion.value) return

    const pivot = pivotOf(scene.value)
    const startOffset: [number, number, number] = [
      cam.position.x - pivot[0],
      cam.position.y - pivot[1],
      cam.position.z - pivot[2],
    ]
    const axis = tuple(cam.up)

    await animate(durationMs, (t) => {
      const angle = orbitSwingAngle(t, turns)
      const rotated = rotateAroundAxis(startOffset, axis, angle)
      cam.position.set(pivot[0] + rotated[0], pivot[1] + rotated[1], pivot[2] + rotated[2])
      cam.lookAt(pivot[0], pivot[1], pivot[2])
    })
  }

  /**
   * §7.2 slice-glide PRIMITIVE ONLY (controller correction C5 -- the camera
   * dolly-in, 600ms outline highlight, and the "Locate lesion" button
   * gating are Task 10's). Glides `sliceRaw`'s slice number from wherever it
   * currently is to `targetIndex`. `sliceRaw.index` is a world coordinate
   * (copper-types.ts's `NrrdSlice` doc), so it's converted to/from a slice
   * number via `volume.spacing[2]`.
   */
  async function locateLesion(sliceRaw: NrrdSlice | undefined, targetIndex: number, durationMs = 900) {
    if (!sliceRaw) return
    const spacing = sliceRaw.volume.spacing[2]
    const fromIndex = sliceRaw.index / spacing

    await animate(durationMs, (t) => {
      const index = fromIndex + (targetIndex - fromIndex) * t
      sliceRaw.index = index * spacing
      sliceRaw.repaint.call(sliceRaw)
    })
  }

  /**
   * Each modality's scene owns its own camera (Task 8's per-modality scene
   * cache), so a cross-modality flight cannot interpolate between two
   * camera instances directly -- there is only ever one "current" camera to
   * read or write. Instead this captures the OUTGOING camera's orientation
   * (unit direction from its pivot, plus its up vector) so the incoming
   * scene's camera can be snapped to the same apparent orientation, at that
   * new scene's own composition distance, as the flight's starting pose --
   * then `flyTo` carries it on to the incoming scene's real preset. The
   * viewer sees one continuous camera swinging across, not a cut followed
   * by an unrelated flight.
   */
  function captureOrientation(): { dir: [number, number, number], up: [number, number, number] } | null {
    const cam = scene.value?.camera
    if (!cam) return null
    const pivot = pivotOf(scene.value)
    const offset: [number, number, number] = [
      cam.position.x - pivot[0],
      cam.position.y - pivot[1],
      cam.position.z - pivot[2],
    ]
    const len = Math.hypot(offset[0], offset[1], offset[2]) || 1
    return {
      dir: [offset[0] / len, offset[1] / len, offset[2] / len],
      up: tuple(cam.up),
    }
  }

  /**
   * Applies a captured orientation to the current scene's camera, at
   * `distance` from its OWN pivot (`controls.target`, or the origin if
   * unset) -- the counterpart to `captureOrientation`. Review round 1, S1 /
   * I-2: this used to place the camera relative to the origin, aim
   * `cam.lookAt(0, 0, 0)`, and never touch `controls.target` at all -- the
   * exact defect C7 calls load-bearing, left standing in this sibling
   * function. If `controls.target` was not already the origin (a scene
   * revisited after an earlier flight had re-aimed it elsewhere), the
   * camera ends up aimed at the origin while `controls.target` still holds
   * the old point, and the user's next drag calls `controls.update()`,
   * which re-aims the camera back at that stale target and silently
   * undoes this call. Reading and re-writing the same pivot keeps both
   * consistent regardless of what `controls.target` was already holding.
   */
  function applyOrientation(
    o: { dir: [number, number, number], up: [number, number, number] } | null,
    distance: number,
  ) {
    const cam = scene.value?.camera
    const controls = scene.value?.controls
    if (!cam || !o) return
    const pivot = pivotOf(scene.value)
    cam.position.set(
      pivot[0] + o.dir[0] * distance,
      pivot[1] + o.dir[1] * distance,
      pivot[2] + o.dir[2] * distance,
    )
    cam.up.set(o.up[0], o.up[1], o.up[2])
    cam.lookAt(pivot[0], pivot[1], pivot[2])
    cam.updateProjectionMatrix()
    controls?.target?.set(pivot[0], pivot[1], pivot[2])
  }

  return {
    prefersReducedMotion,
    flyTo,
    orbitIntro,
    locateLesion,
    interrupt,
    captureOrientation,
    applyOrientation,
    currentPose,
  }
}
