import { describe, expect, it } from 'vitest'
import { fitDistance } from '../app/composables/fitToView'

/** A 200×200×200 cube: square, so aspect cannot bite. */
const CUBE = { width: 200, height: 200, depth: 200, center: [0, 0, 0] as [number, number, number] }

function box(width: number, height: number, depth: number) {
  return { width, height, depth, center: [0, 0, 0] as [number, number, number] }
}

describe('fitDistance', () => {
  it('frames the bounding sphere, so the whole object clears the narrower field', () => {
    // radius = |(200,200,200)| / 2 = 173.205; at vFov 45 and aspect 1 the
    // narrower half-angle is 22.5deg, so the sphere subtends the frame at
    // radius / sin(22.5deg).
    const d = fitDistance(CUBE, 1, 45, 1)
    expect(d).toBeCloseTo((Math.hypot(200, 200, 200) / 2) / Math.sin(Math.PI / 8), 2)
  })

  it('moves further back for a taller-than-wide viewport, where the horizontal field is the narrow one', () => {
    expect(fitDistance(CUBE, 0.5, 45)).toBeGreaterThan(fitDistance(CUBE, 1, 45))
  })

  it('is height-limited once the viewport is wider than tall, so a wider one changes nothing', () => {
    expect(fitDistance(CUBE, 2, 45)).toBeCloseTo(fitDistance(CUBE, 1, 45), 6)
  })

  /**
   * The reason this fits a sphere rather than a box face.
   *
   * A mammogram volume is a wide, tall, THIN slab; an MRI volume is
   * near-cubic. Framing by the facing box face plus half the depth barely
   * moved the camera for the slab and pushed it well back for the cube, so
   * side by side the mammogram filled its panel while the MRI looked half
   * the size. Two objects of comparable overall extent must get comparable
   * screen size, or three panels do not read as one set.
   */
  it('treats a thin slab and a cube of the same overall extent alike', () => {
    const slab = fitDistance(box(300, 300, 20), 1, 45)
    const cube = fitDistance(box(300, 300, 300), 1, 45)
    // Not identical -- the cube genuinely is bigger -- but within the same
    // ballpark, where the old face-plus-depth rule differed by ~2x.
    expect(cube / slab).toBeLessThan(1.3)
    expect(cube / slab).toBeGreaterThan(1)
  })

  it('does not depend on which face is toward the camera', () => {
    // Same box, axes permuted. A sphere has no orientation, so all three
    // must frame identically -- which is also why orbiting cannot push a
    // corner out of frame.
    const a = fitDistance(box(400, 100, 40), 1, 45)
    const b = fitDistance(box(100, 40, 400), 1, 45)
    const c = fitDistance(box(40, 400, 100), 1, 45)
    expect(a).toBeCloseTo(b, 6)
    expect(b).toBeCloseTo(c, 6)
  })

  it('scales linearly with the object', () => {
    expect(fitDistance(box(10, 10, 10), 1, 45)).toBeCloseTo(fitDistance(box(1, 1, 1), 1, 45) * 10, 6)
  })

  it('a narrower field of view needs more distance', () => {
    expect(fitDistance(CUBE, 1, 30)).toBeGreaterThan(fitDistance(CUBE, 1, 60))
  })

  /**
   * The default margin is BELOW 1 on purpose: a bounding sphere
   * circumscribes the object (a cube's is 1.73x its half-side), so fitting
   * the sphere exactly leaves the object filling well under half the frame.
   * Letting the sphere overflow a little is what makes the object itself
   * read at a sensible size. Asserted as a direction, not a value -- the
   * exact figure is a look-at-it judgement and is meant to be tunable.
   */
  it('lets the circumscribing sphere overflow so the object itself is not tiny', () => {
    expect(fitDistance(CUBE, 1, 45)).toBeLessThan(fitDistance(CUBE, 1, 45, 1))
  })

  it('never returns zero or a negative for a degenerate box', () => {
    expect(fitDistance(box(0, 0, 0), 1, 45)).toBeGreaterThan(0)
  })

  it('survives a zero aspect without returning NaN or Infinity', () => {
    // A panel mid-collapse can measure 0 wide for a frame.
    const d = fitDistance(CUBE, 0, 45)
    expect(Number.isFinite(d)).toBe(true)
    expect(d).toBeGreaterThan(0)
  })
})
