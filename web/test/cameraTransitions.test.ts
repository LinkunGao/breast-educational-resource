import { describe, expect, it } from 'vitest'
import type { CopperViewPoint } from '../app/composables/copper-types'
import {
  chooseTransition,
  easeInOutCubic,
  interpolateFlightPose,
  orbitSwingAngle,
  rotateAroundAxis,
  viewPointToPose,
} from '../app/composables/cameraTransitions'
import type { Pose } from '../app/composables/cameraTransitions'

describe('easeInOutCubic', () => {
  it('is pinned at both ends', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
  })

  it('passes through the midpoint', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5)
  })

  it('is monotonically increasing', () => {
    let prev = -1
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeInOutCubic(t)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('clamps out-of-range input', () => {
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
  })
})

describe('chooseTransition (design doc §7.1)', () => {
  const anatomyA = { group: 'density' as const, slug: 'density-a', modality: 'anatomy' as const }
  const anatomyD = { group: 'density' as const, slug: 'density-d', modality: 'anatomy' as const }
  const mriD = { group: 'density' as const, slug: 'density-d', modality: 'mri' as const }
  const anatomyOverview = { group: 'overview' as const, slug: 'the-breast', modality: 'anatomy' as const }
  const mammoDcis = { group: 'cancer' as const, slug: 'cancer-dcis', modality: 'mammogram' as const }

  it('morphs between density levels while on anatomy', () => {
    expect(chooseTransition(anatomyA, anatomyD)).toBe('density-morph')
  })

  it('morphs between the overview and a density level on anatomy', () => {
    expect(chooseTransition(anatomyOverview, anatomyA)).toBe('density-morph')
  })

  it('does not morph when the modality is imaging', () => {
    expect(chooseTransition(mriD, { ...mriD, slug: 'density-a' })).toBe('modality-flight')
  })

  it('does not morph across groups', () => {
    expect(chooseTransition(anatomyD, mammoDcis)).toBe('modality-flight')
  })

  it('flies when only the modality changes', () => {
    expect(chooseTransition(anatomyD, mriD)).toBe('modality-flight')
  })

  it('cuts when nothing changed', () => {
    expect(chooseTransition(anatomyD, anatomyD)).toBe('cut')
  })
})

/**
 * Genuine coverage of the interpolation math itself, per Task 9's brief:
 * "endpoints, monotonicity, that a flight actually reaches the target
 * pose." This is the part controller correction C1 made possible without
 * WebGL or a second `three` copy -- interpolateFlightPose is pure numeric
 * tuples in, pure numeric tuples out.
 */
describe('interpolateFlightPose', () => {
  const from: Pose = { position: [0, 0, 10], up: [0, 1, 0], target: [0, 0, 0] }
  const to: Pose = { position: [10, 0, 0], up: [0, 1, 0], target: [0, 0, 0] }

  it('reproduces the starting pose exactly at t=0', () => {
    const pose = interpolateFlightPose(from, to, 0)
    expect(pose.position[0]).toBeCloseTo(from.position[0], 5)
    expect(pose.position[1]).toBeCloseTo(from.position[1], 5)
    expect(pose.position[2]).toBeCloseTo(from.position[2], 5)
    expect(pose.target).toEqual(from.target)
  })

  it('reaches the target pose exactly at t=1', () => {
    const pose = interpolateFlightPose(from, to, 1)
    expect(pose.position[0]).toBeCloseTo(to.position[0], 5)
    expect(pose.position[1]).toBeCloseTo(to.position[1], 5)
    expect(pose.position[2]).toBeCloseTo(to.position[2], 5)
    expect(pose.target).toEqual(to.target)
  })

  it('clamps out-of-range t to the nearest endpoint', () => {
    expect(interpolateFlightPose(from, to, -1)).toEqual(interpolateFlightPose(from, to, 0))
    expect(interpolateFlightPose(from, to, 2)).toEqual(interpolateFlightPose(from, to, 1))
  })

  it('arcs rather than cutting a straight line through the pivot: the mid-flight distance from the pivot never collapses toward zero', () => {
    // Both endpoints sit at distance 10 from the shared target/pivot. A
    // straight-line lerp between them would swing close to the pivot at
    // t=0.5 (chord length ~14, but passing near the centre for two
    // perpendicular points); the arc, by contrast, holds a near-constant
    // radius throughout.
    for (let t = 0; t <= 1; t += 0.1) {
      const pose = interpolateFlightPose(from, to, t)
      const dx = pose.position[0] - pose.target[0]
      const dy = pose.position[1] - pose.target[1]
      const dz = pose.position[2] - pose.target[2]
      const radius = Math.sqrt(dx * dx + dy * dy + dz * dz)
      expect(radius).toBeCloseTo(10, 1)
    }
  })

  it('interpolates a moving look-target linearly, so the pivot itself lerps from one target to the other', () => {
    const movingTo: Pose = { position: [10, 0, 0], up: [0, 1, 0], target: [4, 0, 0] }
    const pose = interpolateFlightPose(from, movingTo, 0.5)
    expect(pose.target[0]).toBeCloseTo(2, 5)
    expect(pose.target[1]).toBeCloseTo(0, 5)
    expect(pose.target[2]).toBeCloseTo(0, 5)
  })

  it('always returns a normalized up vector', () => {
    const tiltedFrom: Pose = { position: [0, 0, 10], up: [0, 2, 0], target: [0, 0, 0] }
    const tiltedTo: Pose = { position: [10, 0, 0], up: [1, 1, 0], target: [0, 0, 0] }
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = interpolateFlightPose(tiltedFrom, tiltedTo, t)
      const len = Math.hypot(...pose.up)
      expect(len).toBeCloseTo(1, 5)
    }
  })
})

describe('orbitSwingAngle (design doc §7.4, controller correction C4)', () => {
  it('starts at zero net rotation', () => {
    expect(orbitSwingAngle(0, 0.6)).toBeCloseTo(0, 10)
  })

  it('ends back at zero net rotation, regardless of the swing amplitude', () => {
    expect(orbitSwingAngle(1, 0.6)).toBeCloseTo(0, 5)
  })

  it('peaks at the midpoint at the full swing amplitude, not a net orbit', () => {
    // turns=0.6 is how far the camera swings out and back, not a net
    // 0.6-turn rotation (C4) -- the peak angle equals turns full circles.
    expect(orbitSwingAngle(0.5, 0.6)).toBeCloseTo(0.6 * Math.PI * 2, 5)
  })

  it('is symmetric around the midpoint', () => {
    expect(orbitSwingAngle(0.3, 0.6)).toBeCloseTo(orbitSwingAngle(0.7, 0.6), 5)
  })
})

describe('rotateAroundAxis', () => {
  it('leaves a vector unchanged at angle 0', () => {
    const v = rotateAroundAxis([1, 0, 0], [0, 1, 0], 0)
    expect(v[0]).toBeCloseTo(1, 5)
    expect(v[1]).toBeCloseTo(0, 5)
    expect(v[2]).toBeCloseTo(0, 5)
  })

  it('rotates a vector 90 degrees around the Y axis into the expected quadrant', () => {
    const [x, y, z] = rotateAroundAxis([1, 0, 0], [0, 1, 0], Math.PI / 2)
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(-1, 5)
  })

  it('preserves vector length (a rotation is not a scale)', () => {
    const v = rotateAroundAxis([3, 4, 0], [0, 0, 1], 1.2345)
    expect(Math.hypot(...v)).toBeCloseTo(5, 5)
  })

  it('returns to the start after a full 360 degree turn', () => {
    const v = rotateAroundAxis([1, 2, 3], [0, 1, 0], Math.PI * 2)
    expect(v[0]).toBeCloseTo(1, 4)
    expect(v[1]).toBeCloseTo(2, 4)
    expect(v[2]).toBeCloseTo(3, 4)
  })
})

describe('viewPointToPose', () => {
  it('maps copper3d\'s view-preset field names onto the Pose shape verbatim', () => {
    const vp: CopperViewPoint = {
      farPlane: 1000,
      nearPlane: 0.01,
      eyePosition: [1, 2, 3],
      targetPosition: [4, 5, 6],
      upVector: [0, 1, 0],
    }
    expect(viewPointToPose(vp)).toEqual({
      position: [1, 2, 3],
      up: [0, 1, 0],
      target: [4, 5, 6],
    })
  })
})
