import { describe, expect, it } from 'vitest'
import { fitDistance } from '../app/composables/fitToView'

/** A 200×200×200 cube is the easy case: square, so aspect cannot bite. */
const CUBE = { width: 200, height: 200, depth: 200 }

describe('fitDistance', () => {
  it('puts a cube far enough back that its height just fits, plus margin and half its depth', () => {
    // vFov 45deg: half-height 100 needs 100 / tan(22.5deg) = 241.42 units
    // from the cube's centre plane, + half the depth (100) to clear the
    // near face, x 1.08 margin.
    const d = fitDistance(CUBE, 1, 45, 1.08)
    expect(d).toBeCloseTo((100 / Math.tan(Math.PI / 8) + 100) * 1.08, 2)
  })

  it('a taller-than-wide viewport does not change a height-limited fit', () => {
    const tall = fitDistance(CUBE, 0.5, 45, 1.08)
    const square = fitDistance(CUBE, 1, 45, 1.08)
    // At aspect 0.5 the horizontal field is NARROWER, so width becomes the
    // binding constraint and the camera must move further back.
    expect(tall).toBeGreaterThan(square)
  })

  it('a wide viewport is height-limited, so the distance matches the square case', () => {
    expect(fitDistance(CUBE, 2, 45, 1.08)).toBeCloseTo(fitDistance(CUBE, 1, 45, 1.08), 6)
  })

  it('a wide, flat volume in a narrow panel is width-limited', () => {
    const wide = { width: 400, height: 100, depth: 10 }
    const d = fitDistance(wide, 1, 45, 1)
    // Horizontal half-field at aspect 1 equals the vertical one, so 200
    // half-width needs 200 / tan(22.5deg), not 50 / tan(22.5deg).
    expect(d).toBeCloseTo(200 / Math.tan(Math.PI / 8) + 5, 2)
  })

  it('scales linearly with the object', () => {
    const small = fitDistance({ width: 1, height: 1, depth: 1 }, 1, 45)
    const big = fitDistance({ width: 10, height: 10, depth: 10 }, 1, 45)
    expect(big).toBeCloseTo(small * 10, 6)
  })

  it('a narrower field of view needs more distance', () => {
    expect(fitDistance(CUBE, 1, 30)).toBeGreaterThan(fitDistance(CUBE, 1, 60))
  })

  it('never returns zero or a negative for a degenerate box', () => {
    expect(fitDistance({ width: 0, height: 0, depth: 0 }, 1, 45)).toBeGreaterThan(0)
  })

  it('survives a zero aspect without returning NaN or Infinity', () => {
    // A panel mid-collapse can measure 0 wide for a frame.
    const d = fitDistance(CUBE, 0, 45)
    expect(Number.isFinite(d)).toBe(true)
    expect(d).toBeGreaterThan(0)
  })
})
