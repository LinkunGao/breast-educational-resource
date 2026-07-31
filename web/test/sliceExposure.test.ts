import { describe, expect, it } from 'vitest'
import type { NrrdVolume } from '../app/composables/copper-types'
import { exposureExponent } from '../app/composables/sliceExposure'

/**
 * Client feedback, three rounds of it. The MRIs are too dark: measured over
 * all nine shipped volumes, copper3d's min/max window puts the median tissue
 * voxel at grey 31-55 of 255. Then, twice, that a narrower window had lost
 * the tumour and its white bounding box -- because on a contrast-enhanced
 * study the lesion is the bright end of the histogram, which is exactly what
 * a narrower window throws away.
 *
 * So the property under test is both-ended: the tissue comes up AND nothing
 * clips.
 */

/** A volume as copper3d's loader leaves it. */
function volumeOf(data: number[]): NrrdVolume {
  return {
    data,
    min: Math.min(...data),
    max: Math.max(...data),
    windowHigh: Math.max(...data),
    RASDimensions: [1, 1, 1],
    repaintAllSlices: () => {},
  }
}

/**
 * The greyscale a voxel comes out as: copper3d's linear window, then the
 * exposure curve `installFastSliceRepaint` applies on top of it.
 */
function grey(v: NrrdVolume, value: number, exponent: number): number {
  const linear = Math.min(255, Math.max(0, Math.floor((value - v.min) * 255 / (v.max - v.min))))
  return Math.round(255 * (linear / 255) ** exponent)
}

/**
 * The real volumes' shape in miniature: a large block of air, a tissue band,
 * and a 1% bright tail -- vessels, and the enhancing lesion.
 */
function realistic(airVoxels = 600) {
  return [
    ...Array.from({ length: airVoxels }, () => 0),
    ...Array.from({ length: 390 }, (_, i) => 100 + (i % 21)),
    ...Array.from({ length: 10 }, (_, i) => 130 + i * 52),
  ]
}
/** The median tissue voxel, which is what the exposure is anchored to. */
const TISSUE = 110
/** Halfway up the bright tail -- a lesion, not a noise spike. */
const LESION = 390

describe('exposureExponent', () => {
  it('lifts the tissue out of the shadows', () => {
    const v = volumeOf(realistic())
    // The complaint, as a number, and in the band measured on the real
    // volumes.
    expect(grey(v, TISSUE, 1)).toBeLessThan(55)

    const e = exposureExponent(v)
    expect(grey(v, TISSUE, e)).toBeGreaterThan(65)
    expect(grey(v, TISSUE, e)).toBeLessThan(85)
  })

  it('cannot clip, however far it lifts', () => {
    const data = realistic()
    const v = volumeOf(data)
    const e = exposureExponent(v)
    // The curve fixes both ends, so the only voxel that reaches white is
    // the one that was already white.
    expect(grey(v, v.max, e)).toBe(255)
    expect(data.filter(x => x < v.max && grey(v, x, e) >= 255)).toEqual([])
  })

  it('keeps the lesion clear of the white bounding box drawn over it', () => {
    const v = volumeOf(realistic())
    const e = exposureExponent(v)
    expect(grey(v, LESION, e)).toBeLessThan(240)
    // And still plainly brighter than the tissue around it.
    expect(grey(v, LESION, e) - grey(v, TISSUE, e)).toBeGreaterThan(40)
  })

  /**
   * Air is 48-85% of a volume depending on the case, so an exposure that
   * moved with it would be a different exposure per case. Otsu's split is
   * what keeps this measuring tissue.
   */
  it('does not move when there is more air around the same tissue', () => {
    const sparse = exposureExponent(volumeOf(realistic(600)))
    const roomy = exposureExponent(volumeOf(realistic(4000)))
    // Within a few percent. Otsu's split does shift a little as the class
    // weights change; what matters is that 6.7x the air does not drag the
    // exposure with it.
    expect(roomy / sparse).toBeGreaterThan(0.95)
    expect(roomy / sparse).toBeLessThan(1.05)
  })

  it('is scale-free -- the nine volumes\' maxima span 246 to 27014', () => {
    const small = exposureExponent(volumeOf(realistic()))
    const large = exposureExponent(volumeOf(realistic().map(x => x * 1000)))
    expect(large).toBeCloseTo(small, 2)
  })

  it('leaves a volume alone when it is already bright enough', () => {
    // Tissue sitting near the top of the range: nothing to fix, and this
    // only ever brightens.
    const v = volumeOf([...Array.from({ length: 100 }, () => 0), ...Array.from({ length: 100 }, () => 240)])
    expect(exposureExponent(v)).toBe(1)
  })

  it('declines to measure a volume it cannot read', () => {
    expect(exposureExponent({ ...volumeOf([7]), data: [] })).toBe(1)
    expect(exposureExponent(volumeOf([5, 5, 5]))).toBe(1)
  })
})
