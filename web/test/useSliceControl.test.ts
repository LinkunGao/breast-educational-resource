import type { Ref } from 'vue'
import { defineComponent, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { CopperControls, CopperScene } from '../app/composables/copper-types'
import type { SliceState } from '../app/composables/useModalityScene'
import { useSliceControl } from '../app/composables/useSliceControl'

/**
 * What is genuinely testable here without a browser: the slice arithmetic
 * (drag pixels -> slice numbers -> copper3d's world coordinate), the gate
 * that decides whether a drag scrubs or orbits, the OrbitControls hand-off
 * around a scrub, and which of the two readouts a screen reader is allowed
 * to hear (controller correction C11).
 *
 * What is NOT testable here, and is listed for the human browser pass: that
 * copper3d's raycast actually hits the slice plane where the pointer looks
 * like it is, and that the capture-phase `enableRotate = false` really does
 * beat OrbitControls' own bubble-phase pointerdown handler on the shared
 * canvas. Both depend on a real WebGL scene and a real event dispatch order
 * through copper3d's own listeners; neither is faked into a passing
 * assertion below.
 */

const SPACING = 2

function makeSliceState(overrides: Partial<{ index: number, max: number }> = {}): SliceState {
  const index = overrides.index ?? 0
  return {
    max: overrides.max ?? 100,
    raw: {
      index: index * SPACING,
      MaxIndex: overrides.max ?? 100,
      volume: { spacing: [1, 1, SPACING] },
      repaint: vi.fn(),
    },
    mesh: { name: 'z' },
  }
}

/** `pickSpecifiedModel` is made to hit or miss on demand -- the one thing
 * standing between "this drag scrubs" and "this drag orbits". */
function makeScene(hit: boolean, enableRotate = true): CopperScene {
  const controls = {
    rotateSpeed: 0,
    panSpeed: 0,
    enableRotate,
    enablePan: true,
    enabled: true,
  } as CopperControls
  return {
    controls,
    pickSpecifiedModel: vi.fn(() => ({ intersectedObject: hit ? { name: 'z' } : null })),
  } as unknown as CopperScene
}

/** The injected animation driver. `instant` resolves the whole animation in
 * one frame (which is also exactly what the real driver does under reduced
 * motion); `stepped` hands the frames back so a test can drive them. */
function instantRun() {
  return vi.fn((_ms: number, onFrame: (t: number) => void) => {
    onFrame(1)
    return Promise.resolve()
  })
}

function steppedRun() {
  const frames: Array<{ onFrame: (t: number) => void, resolve: () => void }> = []
  const run = vi.fn((_ms: number, onFrame: (t: number) => void) => {
    return new Promise<void>((resolve) => {
      frames.push({ onFrame, resolve })
    })
  })
  return { run, frames }
}

function mountControl(
  scene: Ref<CopperScene | undefined>,
  sliceState: Ref<SliceState | null>,
  run: (ms: number, onFrame: (t: number) => void) => Promise<void>,
) {
  let api!: ReturnType<typeof useSliceControl>
  const host = ref<HTMLElement>()
  const Host = defineComponent({
    setup() {
      api = useSliceControl(host, scene, sliceState, run)
      return { host }
    },
    template: '<div ref="host" />',
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, api, el: host.value! }
}

/** happy-dom has no PointerEvent constructor; the handlers only ever read
 * `button`, `isPrimary`, `clientX` and `clientY`. */
function pointer(type: string, init: { clientY?: number, clientX?: number, button?: number } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>
  event.button = init.button ?? 0
  event.isPrimary = true
  event.clientX = init.clientX ?? 0
  event.clientY = init.clientY ?? 0
  return event as unknown as PointerEvent
}

describe('useSliceControl', () => {
  it('starts from the loaded slice state rather than from zero', () => {
    const state = makeSliceState({ index: 42, max: 104 })
    const { api } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    expect(api.index.value).toBe(42)
    expect(api.max.value).toBe(104)
    expect(api.settledIndex.value).toBe(42)
  })

  /**
   * Fix round 1, Important. The readout and the follower must both start
   * from where the slice plane ACTUALLY is, which lives in
   * `raw.index` (a world coordinate) and nowhere else.
   *
   * Concrete failure this closes: open `/case/cancer-dcis/mri`, scrub to
   * 40, step to 3D Mammogram, step back. `load()`'s cache-hit branch
   * restores the same `SliceState` object it stored at load time, and the
   * scene was never repainted, so the plane is still at 40 -- but a
   * load-time snapshot would say 88, and the first drag pixel would ease
   * the plane 48 slices to catch up with a number that was only ever a
   * stale copy.
   */
  it('seeds from where the slice plane actually is, not from a value captured at load time', () => {
    // A cached scene coming back into view: the user scrubbed it to 40 on
    // an earlier visit and nothing has repainted it since.
    const state = makeSliceState({ index: 40, max: 175 })

    const { api } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    expect(api.index.value).toBe(40)
    expect(api.settledIndex.value).toBe(40)
  })

  it('starts a drag from the plane\'s real position, so the first pixel does not jump', () => {
    const state = makeSliceState({ index: 40, max: 175 })
    const { el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 4 })) // +1 slice

    expect(state.raw.index).toBeCloseTo(41 * SPACING, 10)
  })

  it('converts a vertical drag into slice numbers and writes copper3d\'s world coordinate', () => {
    const state = makeSliceState({ index: 10 })
    const { api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 100 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 140 })) // +40px

    // SENSITIVITY is 0.25 slices per pixel: 10 + 40*0.25 = 20 slices, and
    // `raw.index` is a WORLD coordinate, so 20 * spacing[2].
    expect(api.index.value).toBe(20)
    expect(state.raw.index).toBeCloseTo(20 * SPACING, 10)
    expect(state.raw.repaint).toHaveBeenCalled()
  })

  /**
   * Regression test for the follower's accumulator. An earlier draft used
   * the ROUNDED, displayed index as the follower's own current value, which
   * quantised every step: four 1px moves (0.25 slices each) would have
   * rounded away to nothing instead of summing to exactly one slice. The
   * same defect also made the follower unable to converge at all once the
   * remaining distance dropped below half a slice.
   */
  it('accumulates sub-slice drag distance instead of rounding it away', () => {
    const state = makeSliceState({ index: 0 })
    const { api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    for (let i = 1; i <= 4; i++) el.dispatchEvent(pointer('pointermove', { clientY: i }))

    expect(state.raw.index).toBeCloseTo(1 * SPACING, 10)
    expect(api.index.value).toBe(1)
  })

  it('clamps at both ends of the volume', () => {
    const state = makeSliceState({ index: 5, max: 20 })
    const { api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 4000 }))
    expect(api.index.value).toBe(20)
    expect(state.raw.index).toBeCloseTo(20 * SPACING, 10)

    el.dispatchEvent(pointer('pointermove', { clientY: -4000 }))
    expect(api.index.value).toBe(0)
    expect(state.raw.index).toBeCloseTo(0, 10)
  })

  // The legacy app gated on the same raycast (frontend/plugins/copper.js:90).
  // Without a gate, one drag both scrubs and orbits, because OrbitControls
  // listens on the same canvas.
  it('ignores a drag that does not start on the slice plane, and leaves rotation alone', () => {
    const state = makeSliceState({ index: 10 })
    const scene = makeScene(false)
    const { api, el } = mountControl(shallowRef(scene), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 100 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 300 }))

    expect(api.index.value).toBe(10)
    expect(scene.controls.enableRotate).toBe(true)
  })

  it('suppresses camera rotation for the duration of a scrub and restores it afterwards', () => {
    const state = makeSliceState()
    const scene = makeScene(true)
    const { el } = mountControl(shallowRef(scene), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    expect(scene.controls.enableRotate).toBe(false)

    el.dispatchEvent(pointer('pointerup', { clientY: 0 }))
    expect(scene.controls.enableRotate).toBe(true)
  })

  // The 2D ultrasound modality ships with rotation already off
  // (useModalityScene's `flat` branch). Restoring a hardcoded `true` would
  // silently make the one flat modality orbitable after any scrub.
  it('restores rotation to whatever it was, not to true, so the 2D modality stays locked', () => {
    const state = makeSliceState()
    const scene = makeScene(true, false)
    const { el } = mountControl(shallowRef(scene), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    el.dispatchEvent(pointer('pointerup', { clientY: 0 }))

    expect(scene.controls.enableRotate).toBe(false)
  })

  it('restores rotation on pointercancel too, so a cancelled gesture cannot leave the camera locked', () => {
    const state = makeSliceState()
    const scene = makeScene(true)
    const { el } = mountControl(shallowRef(scene), shallowRef(state), instantRun())

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    el.dispatchEvent(pointer('pointercancel', { clientY: 0 }))

    expect(scene.controls.enableRotate).toBe(true)
  })

  it('steps one slice per [ and ] (design doc §11)', () => {
    const state = makeSliceState({ index: 10 })
    const { api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    el.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }))
    expect(api.index.value).toBe(11)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }))
    expect(api.index.value).toBe(9)
  })

  it('leaves other keys alone', () => {
    const state = makeSliceState({ index: 10 })
    const { api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    el.dispatchEvent(event)

    expect(api.index.value).toBe(10)
    expect(event.defaultPrevented).toBe(false)
  })

  /**
   * Controller correction C11. The visible number moves every frame; the
   * announced one must not, or a screen reader queues an utterance per
   * frame and the app becomes unusable with one on.
   */
  it('does not publish the announced index until the scrub actually comes to rest', async () => {
    const state = makeSliceState({ index: 0 })
    const { run, frames } = steppedRun()
    const { api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), run)

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 40 }))

    // Mid-animation: the eye sees the number move, the screen reader does not.
    frames[0]!.onFrame(0.5)
    expect(api.index.value).toBe(5)
    expect(api.settledIndex.value).toBe(0)

    frames[0]!.onFrame(1)
    frames[0]!.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(api.index.value).toBe(10)
    expect(api.settledIndex.value).toBe(10)
  })

  /** A superseded follow's own promise still resolves; it must not announce
   * over the top of the follow that replaced it. */
  it('announces once for a run of drag updates, not once per update', async () => {
    const state = makeSliceState({ index: 0 })
    const { run, frames } = steppedRun()
    const { api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), run)

    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 20 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 40 }))

    // The first (superseded) follow resolves late, as an interrupted
    // animation does.
    frames[0]!.onFrame(0.4)
    frames[0]!.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(api.settledIndex.value).toBe(0)

    frames[1]!.onFrame(1)
    frames[1]!.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(api.settledIndex.value).toBe(api.index.value)
  })

  it('syncFromRaw follows a slice another animation is driving, without announcing it', () => {
    const state = makeSliceState({ index: 0 })
    const { api } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    // What `locateLesion` does per frame: it writes the world coordinate
    // itself, and this composable only has to keep the readout in step.
    state.raw.index = 33 * SPACING
    api.syncFromRaw()

    expect(api.index.value).toBe(33)
    expect(api.settledIndex.value).toBe(0)

    api.settle()
    expect(api.settledIndex.value).toBe(33)
  })

  it('resets to an empty readout when the modality has no slices at all', async () => {
    const sliceState = shallowRef<SliceState | null>(makeSliceState({ index: 7, max: 40 }))
    const { api } = mountControl(shallowRef(makeScene(true)), sliceState, instantRun())
    expect(api.index.value).toBe(7)

    sliceState.value = null
    await Promise.resolve()

    expect(api.index.value).toBe(0)
    expect(api.max.value).toBe(0)
    expect(api.settledIndex.value).toBe(0)
  })

  it('does nothing at all once its owning component has unmounted', () => {
    const state = makeSliceState({ index: 10 })
    const { wrapper, api, el } = mountControl(shallowRef(makeScene(true)), shallowRef(state), instantRun())

    wrapper.unmount()
    el.dispatchEvent(pointer('pointerdown', { clientY: 0 }))
    el.dispatchEvent(pointer('pointermove', { clientY: 400 }))

    expect(api.index.value).toBe(10)
  })
})
