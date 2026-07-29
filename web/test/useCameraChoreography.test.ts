import type { Ref } from 'vue'
import { defineComponent, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopperCamera, CopperControls, CopperRenderer, CopperScene, StageApi, Vec3 } from '../app/composables/copper-types'
import type { Pose } from '../app/composables/cameraTransitions'
import { useCameraChoreography } from '../app/composables/useCameraChoreography'

/**
 * `useCameraChoreography` drives real camera math (cameraTransitions.test.ts
 * covers the pure interpolation itself) through copper3d's own
 * position/up/lookAt/updateProjectionMatrix setters, on a fake rAF clock
 * this file steps by hand -- no WebGL involved, matching the pattern
 * useCopperStage.test.ts and useModalityScene.test.ts already established
 * for this codebase. What's under test: the driver's requestContinuous /
 * releaseContinuous bracketing (a leak would starve the on-demand renderer
 * of frames, or worse, never let it go idle), interrupt-in-place semantics
 * (controller correction C3), reduced-motion skip/instant-jump (C6), and
 * the controls.target sync that C7 flags as load-bearing.
 */

/** A minimal but fully-functional Vec3 fake -- mutable in place via `.set`,
 * exactly the surface useCameraChoreography actually calls. The other
 * methods on the real `Vec3` interface are never exercised by this
 * composable (controller correction C1: mutation goes through `.set` only),
 * so they're stubbed just deeply enough to satisfy the type. */
function makeVec3(x = 0, y = 0, z = 0): Vec3 {
  const self: Vec3 = {
    x,
    y,
    z,
    set: (nx, ny, nz) => { self.x = nx; self.y = ny; self.z = nz },
    copy: (o) => { self.x = o.x; self.y = o.y; self.z = o.z; return self },
    clone: () => makeVec3(self.x, self.y, self.z),
    length: () => Math.hypot(self.x, self.y, self.z),
    normalize: () => self,
    lerp: () => self,
    applyAxisAngle: () => self,
    sub: () => self,
    add: () => self,
    multiplyScalar: () => self,
  }
  return self
}

function makeFakeScene(cameraPos: [number, number, number], up: [number, number, number] = [0, 1, 0]): CopperScene {
  const camera: CopperCamera = {
    position: makeVec3(...cameraPos),
    up: makeVec3(...up),
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
  }
  const controls: CopperControls = {
    rotateSpeed: 0,
    panSpeed: 0,
    enableRotate: true,
    enablePan: true,
    enabled: true,
    target: makeVec3(0, 0, 0),
  }
  return { camera, controls } as CopperScene
}

function makeFakeStage(): StageApi {
  const renderer = { render: vi.fn() } as unknown as CopperRenderer
  return {
    renderer: shallowRef(renderer),
    Copper: shallowRef(undefined),
    ready: shallowRef(true),
    loadError: shallowRef(undefined),
    requestContinuous: vi.fn(),
    releaseContinuous: vi.fn(),
  }
}

/** A hand-driven rAF clock: `requestAnimationFrame` just remembers the
 * latest callback instead of scheduling it, and `advance(ms)` invokes it
 * synchronously with a controlled, monotonically increasing timestamp.
 * `performance.now()` is stubbed to read the same clock (see `beforeEach`),
 * so `animate()`'s own `(now - start) / durationMs` math sees a consistent
 * timeline across multiple flights in one test. */
function makeFakeClock() {
  let now = 0
  let queued: FrameRequestCallback | null = null
  const raf = vi.fn((cb: FrameRequestCallback) => { queued = cb; return 1 })
  const caf = vi.fn(() => { queued = null })
  function advance(ms: number) {
    now += ms
    const cb = queued
    queued = null
    cb?.(now)
  }
  return { raf, caf, advance, now: () => now }
}

/** Mounts `useCameraChoreography` inside a real component instance so
 * `onMounted`/`onScopeDispose` genuinely run, matching useCopperStage.
 * test.ts's approach to the same lifecycle-hook concern. `stage`/`scene`
 * are captured via closure, not passed as props -- a `Ref` handed through
 * Vue's props system risks its own top-level auto-unwrapping. */
function mountChoreography(stage: StageApi, scene: Ref<CopperScene | undefined>) {
  let api!: ReturnType<typeof useCameraChoreography>
  const Host = defineComponent({
    setup() {
      api = useCameraChoreography(stage, scene)
      return {}
    },
    template: '<div />',
  })
  const wrapper = mount(Host)
  return { wrapper, camera: api }
}

describe('useCameraChoreography', () => {
  let clock: ReturnType<typeof makeFakeClock>

  beforeEach(() => {
    clock = makeFakeClock()
    vi.stubGlobal('requestAnimationFrame', clock.raf)
    vi.stubGlobal('cancelAnimationFrame', clock.caf)
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Not vi.unstubAllGlobals(): that would also wipe test/setup.ts's
    // ref/onMounted/onScopeDispose stubs (installed once, before this whole
    // file runs), which every subsequent test's component mount depends on.
    // beforeEach re-stubs requestAnimationFrame/cancelAnimationFrame fresh
    // for each test regardless.
  })

  const target: Pose = { position: [10, 0, 0], up: [0, 1, 0], target: [0, 0, 0] }

  it('flyTo arcs the camera and reaches the target pose exactly at completion', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    const flight = camera.flyTo(target, 1000)
    clock.advance(500)
    clock.advance(500)
    await flight

    const cam = scene.value!.camera
    expect(cam.position.x).toBeCloseTo(10, 5)
    expect(cam.position.y).toBeCloseTo(0, 5)
    expect(cam.position.z).toBeCloseTo(0, 5)
    expect(cam.updateProjectionMatrix).toHaveBeenCalled()
  })

  // Controller correction C7 -- explicitly called "load-bearing": without
  // this, the next OrbitControls drag re-aims the camera at whatever
  // `controls.target` was still holding and undoes the flight.
  it('syncs controls.target to the flight destination, not just the camera', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    const flight = camera.flyTo({ ...target, target: [3, 1, -2] }, 1000)
    clock.advance(1000)
    await flight

    const controlsTarget = scene.value!.controls.target!
    expect(controlsTarget.x).toBeCloseTo(3, 5)
    expect(controlsTarget.y).toBeCloseTo(1, 5)
    expect(controlsTarget.z).toBeCloseTo(-2, 5)
  })

  it('leases and releases continuous rendering exactly once for a completed flight', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    const flight = camera.flyTo(target, 1000)
    clock.advance(500)
    clock.advance(500)
    await flight

    expect(stage.requestContinuous).toHaveBeenCalledTimes(1)
    expect(stage.releaseContinuous).toHaveBeenCalledTimes(1)
  })

  // Controller correction C3: interrupting must stop the camera exactly
  // where the last completed frame left it, never snap it to either
  // endpoint (the original brief's `onFrame(1)` defect).
  it('interrupt() stops the camera in place, not at the flight\'s start or end pose', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    const flight = camera.flyTo(target, 1000)
    clock.advance(300) // partway through -- eased(0.3) != 0 and != 1
    const cam = scene.value!.camera
    const midX = cam.position.x
    const midZ = cam.position.z

    camera.interrupt()
    await flight

    expect(midX).toBeGreaterThan(0) // moved off the start pose (0,0,10)...
    expect(midZ).toBeLessThan(10) // ...toward, but not reaching, the target
    expect(cam.position.x).toBeCloseTo(midX, 10) // interrupt did not move it further
    expect(cam.position.z).toBeCloseTo(midZ, 10)
    expect(stage.releaseContinuous).toHaveBeenCalledTimes(1) // no leaked lease
  })

  it('starting a new flyTo mid-flight interpolates from the interrupted pose, not the original start', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    void camera.flyTo(target, 1000)
    clock.advance(500)
    const cam = scene.value!.camera
    const interruptedX = cam.position.x

    const second = camera.flyTo({ position: [0, 0, -10], up: [0, 1, 0], target: [0, 0, 0] }, 1000)
    // The very first frame of the new flight (t=0, eased=0) should reproduce
    // exactly the interrupted pose, since `flyTo` reads `currentPose()`
    // fresh rather than remembering the first flight's original start.
    clock.advance(0)
    expect(cam.position.x).toBeCloseTo(interruptedX, 5)

    clock.advance(1000)
    await second
  })

  // Review round 1, I-3: onScopeDispose only removed the matchMedia
  // listener before this fix -- a component unmounting mid-animation (e.g.
  // the user navigates to another case while the 3s entrance orbit is still
  // running) left the rAF chain rescheduling against a torn-down scope for
  // as long as the animation had left to run.
  it('unmounting mid-animation interrupts in place and releases the continuous-render lease immediately', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { wrapper, camera } = mountChoreography(stage, scene)

    void camera.flyTo(target, 1000)
    clock.advance(300)
    const cam = scene.value!.camera
    const midX = cam.position.x
    const midZ = cam.position.z

    wrapper.unmount()

    expect(stage.releaseContinuous).toHaveBeenCalledTimes(1)

    // The cancelled rAF must not still be queued -- advancing the clock
    // further must not move the camera (or throw against a torn-down scope).
    expect(() => clock.advance(700)).not.toThrow()
    expect(cam.position.x).toBeCloseTo(midX, 10)
    expect(cam.position.z).toBeCloseTo(midZ, 10)
  })

  // Review round 1, M-9: a throwing frame callback used to call `finish()`
  // (which resolves) and then rethrow into the rAF dispatch, where nothing
  // downstream could catch it -- an `await camera.flyTo(pose);
  // showHighlight()` caller would proceed as though the flight had landed.
  // It must REJECT instead, so a caller genuinely learns the flight failed.
  it('a frame callback that throws rejects the flight and still releases the continuous-render lease', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)
    vi.mocked(scene.value!.camera.lookAt).mockImplementationOnce(() => { throw new Error('boom') })

    const flight = camera.flyTo(target, 1000)
    // Suppress the unhandled-rejection warning race: the assertion below
    // attaches its own rejection handler, but do it eagerly too so nothing
    // depends on ordering.
    flight.catch(() => {})
    clock.advance(500)

    await expect(flight).rejects.toThrow('boom')
    expect(stage.releaseContinuous).toHaveBeenCalledTimes(1)
  })

  it('reduced motion collapses flyTo to a single instant jump, with no continuous-render lease taken at all', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)
    camera.prefersReducedMotion.value = true

    await camera.flyTo(target, 1000)

    const cam = scene.value!.camera
    expect(cam.position.x).toBeCloseTo(10, 5)
    expect(cam.position.z).toBeCloseTo(0, 5)
    expect(stage.requestContinuous).not.toHaveBeenCalled()
    expect(stage.releaseContinuous).not.toHaveBeenCalled()
    expect(stage.renderer.value?.render).toHaveBeenCalledTimes(1)
    expect(clock.raf).not.toHaveBeenCalled()
  })

  // Review round 1, M-8: the instant path (reduced motion, or durationMs<=0)
  // used to have no try/catch at all -- a throwing frame callback there
  // would leave the returned promise permanently unsettled.
  it('the instant path also rejects (never hangs) when its frame callback throws', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)
    camera.prefersReducedMotion.value = true
    vi.mocked(scene.value!.camera.lookAt).mockImplementationOnce(() => { throw new Error('boom') })

    await expect(camera.flyTo(target, 1000)).rejects.toThrow('boom')
  })

  // Review round 1, I-4: every entry to `animate()` -- including the
  // instant/reduced-motion path, not only the animated one -- must cancel
  // whatever animation was already running, or the running one's own
  // still-queued next frame fires right after and undoes the instant jump.
  it('the instant path takes ownership of a running animation instead of letting it keep going', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    const orbit = camera.orbitIntro(1000, 0.6) // long-running animated path, lease held
    clock.advance(500) // orbit mid-swing

    await camera.flyTo(target, 0) // instant path: durationMs<=0

    const cam = scene.value!.camera
    expect(cam.position.x).toBeCloseTo(10, 5) // snapped straight to the flight's destination
    expect(cam.position.z).toBeCloseTo(0, 5)

    // The orbit's own rAF must no longer be queued -- advancing the clock
    // further (to the orbit's own original t=1) must NOT move the camera
    // back toward the orbit's start pose.
    clock.advance(500)
    expect(cam.position.x).toBeCloseTo(10, 5)
    expect(cam.position.z).toBeCloseTo(0, 5)

    expect(stage.requestContinuous).toHaveBeenCalledTimes(1) // only the orbit ever leased
    expect(stage.releaseContinuous).toHaveBeenCalledTimes(1) // released when interrupted, not leaked

    await orbit // the superseded orbit's own promise still resolves
  })

  // Controller correction C6: orbitIntro is pure decoration with no
  // end-state difference, so reduced motion skips it entirely rather than
  // jumping to some "end" pose (there is no motion to shorten or complete).
  it('reduced motion skips orbitIntro entirely -- no camera writes, no render, no continuous lease', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)
    camera.prefersReducedMotion.value = true

    await camera.orbitIntro()

    const cam = scene.value!.camera
    expect(cam.position.x).toBe(0)
    expect(cam.position.z).toBe(10)
    expect(cam.lookAt).not.toHaveBeenCalled()
    expect(stage.requestContinuous).not.toHaveBeenCalled()
    expect(stage.renderer.value?.render).not.toHaveBeenCalled()
  })

  // Controller correction C4: orbitIntro's net rotation is zero by
  // construction (a swing out and back), so it must land back on exactly
  // the pose it started from.
  it('orbitIntro swings out and returns to exactly its starting pose', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    const intro = camera.orbitIntro(1000, 0.6)
    clock.advance(500) // mid-swing: should have moved away from the start
    const cam = scene.value!.camera
    expect(cam.position.x).not.toBeCloseTo(0, 3)

    clock.advance(500) // back to t=1 -> net rotation 0
    await intro

    expect(cam.position.x).toBeCloseTo(0, 4)
    expect(cam.position.y).toBeCloseTo(0, 4)
    expect(cam.position.z).toBeCloseTo(10, 4)
    expect(stage.requestContinuous).toHaveBeenCalledTimes(1)
    expect(stage.releaseContinuous).toHaveBeenCalledTimes(1)
  })

  it('locateLesion glides the slice index toward the target and calls repaint every frame', async () => {
    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)
    const repaint = vi.fn()
    const raw = { index: 0, MaxIndex: 100, volume: { spacing: [1, 1, 2] }, repaint }

    const glide = camera.locateLesion(raw, 50, 1000)
    clock.advance(1000)
    await glide

    expect(raw.index).toBeCloseTo(100, 5) // 50 slices * spacing 2
    expect(repaint).toHaveBeenCalled()
  })

  it('reads the media query on mount and updates prefersReducedMotion when it changes', () => {
    let changeHandler: (() => void) | undefined
    const mql = {
      matches: false,
      addEventListener: vi.fn((_type: string, h: () => void) => { changeHandler = h }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => mql))

    const scene = shallowRef(makeFakeScene([0, 0, 10]))
    const stage = makeFakeStage()
    const { camera } = mountChoreography(stage, scene)

    expect(camera.prefersReducedMotion.value).toBe(false)
    // Mirrors real MediaQueryList semantics: `matches` is already updated by
    // the time `change` fires, and the handler (`syncMotion`) reads it back
    // off the list rather than off the event object.
    mql.matches = true
    changeHandler?.()
    expect(camera.prefersReducedMotion.value).toBe(true)
  })
})
