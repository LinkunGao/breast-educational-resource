import { describe, expect, it } from 'vitest'
import { enabledCases } from '../content/cases'
import { casePageKey } from '../app/utils/pageKey'

/**
 * Fix round 1. The page key is the difference between §7.1 firing and §7.1
 * being unreachable code: a crossfade needs the outgoing model, its scene
 * and its renderer to survive the case navigation that triggers it, and a
 * key change destroys all three. See `pageKey.ts` for the full reasoning
 * and the memory tradeoff this buys.
 */
describe('casePageKey', () => {
  it('gives the whole §7.1 morph family one key, so a density step reuses the renderer', () => {
    const family = ['the-breast', 'density-a', 'density-b', 'density-c', 'density-d']
    const keys = new Set(family.map(slug => casePageKey(slug)))
    expect(keys.size).toBe(1)
  })

  it('gives every lesion case a key of its own, so its volumes are freed on the way out', () => {
    const lesion = ['benign-cyst', 'benign-fibroadenoma', 'cancer-dcis', 'cancer-lobular', 'cancer-ductal']
    const keys = lesion.map(slug => casePageKey(slug))
    expect(new Set(keys).size).toBe(lesion.length)
    // ...and none of them collides with the shared family key.
    expect(keys).not.toContain(casePageKey('density-a'))
  })

  it('never returns the same key for two cases that are not in the morph family together', () => {
    const seen = new Map<string, string[]>()
    for (const c of enabledCases()) {
      const key = casePageKey(c.slug)!
      seen.set(key, [...(seen.get(key) ?? []), c.slug])
    }
    for (const [, slugs] of seen) {
      // A shared key is only ever legitimate for the morph family.
      if (slugs.length > 1) {
        expect(slugs).toEqual(['the-breast', 'density-a', 'density-b', 'density-c', 'density-d'])
      }
    }
  })

  it('leaves non-case routes to NuxtPage\'s own default', () => {
    expect(casePageKey(undefined)).toBeUndefined()
  })

  // A slug that resolves to no case still has to produce a key: the validate
  // guard 404s it, but the key is computed on the way there regardless.
  it('falls back to a per-slug key for an unknown slug rather than throwing', () => {
    expect(casePageKey('not-a-case')).toBe('case-not-a-case')
  })
})
