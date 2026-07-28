import { describe, expect, it } from 'vitest'
import { LEGACY_ROUTES, resolveLegacy } from '../app/utils/legacyRoutes'
import { enabledCases } from '../content/cases'

describe('legacy route table (design doc §4.5)', () => {
  const expected: Record<string, string> = {
    '/model-breast': '/case/the-breast',
    '/density-1': '/case/density-a',
    '/density-2': '/case/density-b',
    '/density-3': '/case/density-c',
    '/density-4': '/case/density-d',
    '/benign-cyst': '/case/benign-cyst',
    '/benign-fibroadenoma': '/case/benign-fibroadenoma',
    '/cancer-dcis': '/case/cancer-dcis',
    '/cancer-lobular': '/case/cancer-lobular',
    '/cancer-ductal': '/case/cancer-ductal',
  }

  it('covers all ten routes from the old generate.routes list', () => {
    expect(LEGACY_ROUTES).toEqual(expected)
  })

  it('every target resolves to an enabled case', () => {
    const slugs = new Set(enabledCases().map(c => c.slug))
    for (const target of Object.values(LEGACY_ROUTES)) {
      expect(slugs.has(target.replace('/case/', ''))).toBe(true)
    }
  })
})

describe('resolveLegacy', () => {
  it('resolves a known legacy path', () => {
    expect(resolveLegacy('/density-4')).toBe('/case/density-d')
  })

  it('tolerates a trailing slash', () => {
    expect(resolveLegacy('/density-4/')).toBe('/case/density-d')
  })

  it('returns undefined for an unknown path', () => {
    expect(resolveLegacy('/electricity-healthy')).toBeUndefined()
  })

  it('returns undefined for a new-style path', () => {
    expect(resolveLegacy('/case/density-d')).toBeUndefined()
  })
})
