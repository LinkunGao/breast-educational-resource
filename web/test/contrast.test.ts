import { describe, expect, it } from 'vitest'
import { contrastRatio, relativeLuminance } from '../app/utils/contrast'

describe('relativeLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5)
  })

  it('accepts hex without the leading hash', () => {
    expect(relativeLuminance('FFFFFF')).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#D81B60', '#FFFFFF'))
      .toBeCloseTo(contrastRatio('#FFFFFF', '#D81B60'), 5)
  })

  it('returns 1 for identical colours', () => {
    expect(contrastRatio('#FBF7F8', '#FBF7F8')).toBeCloseTo(1, 5)
  })

  it('scores the brand pink above the AA body-text floor', () => {
    expect(contrastRatio('#D81B60', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('scores the legacy accent below the AA body-text floor', () => {
    // 设计文档 §5.1：#EB3175 实测 4.02:1，因此降级为图形色
    expect(contrastRatio('#EB3175', '#FFFFFF')).toBeLessThan(4.5)
    expect(contrastRatio('#EB3175', '#FFFFFF')).toBeGreaterThanOrEqual(3)
  })
})
