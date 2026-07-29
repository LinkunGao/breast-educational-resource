import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { splitLede } from '../app/components/content/splitLede'

describe('splitLede', () => {
  it('lifts the first sentence out as the lede', () => {
    const { lede, rest } = splitLede('First one. Second one. Third one.')
    expect(lede).toBe('First one.')
    expect(rest).toEqual(['Second one. Third one.'])
  })

  it('preserves inline markup in the lede', () => {
    const { lede } = splitLede('Breast density has four grades, A – D. <b>Grade D</b> is dense.')
    expect(lede).toBe('Breast density has four grades, A – D.')
  })

  it('does not split on an abbreviation followed by a lowercase word', () => {
    const { lede } = splitLede('It affects approx. eight women. Then more text.')
    expect(lede).toBe('It affects approx. eight women.')
  })

  it('returns the whole string as lede when there is only one sentence', () => {
    const { lede, rest } = splitLede('Only one sentence here.')
    expect(lede).toBe('Only one sentence here.')
    expect(rest).toEqual([])
  })

  it('joins nothing and loses nothing — lede + rest reconstructs the input', () => {
    const input = 'Alpha one. Beta two. Gamma three.'
    const { lede, rest } = splitLede(input)
    expect([lede, ...rest].join(' ')).toBe(input)
  })

  it('handles an empty string', () => {
    expect(splitLede('')).toEqual({ lede: '', rest: [] })
  })
})

describe('splitLede never mutates characters (global constraint)', () => {
  const samples = [
    'Breast density has four grades, A – D.​ Low density (A) are made up of mostly non dense tissue.',
    'Fibroadenomas are found in the breast lobule, which is the part of the breast that produces milk.  Fibroadenomas occurs when tissues in the lobule overgrows.',
  ]

  for (const s of samples) {
    it(`round-trips ${JSON.stringify(s.slice(0, 30))}…`, () => {
      const { lede, rest } = splitLede(s)
      expect([lede, ...rest].join(' ').replace(/\s+/g, ' '))
        .toBe(s.replace(/\s+/g, ' '))
    })
  }
})

/**
 * The two tests above are given by the task brief, but neither is capable of
 * catching a real bug found while implementing this function: the source
 * copy in copy.generated.ts places a U+200B zero-width space directly after
 * the period ending the "Breast density has four grades..." sentence in the
 * density A/B/C anatomy texts (density_4's phrasing happens to put the
 * ZWSP *before* the period instead, so it alone doesn't expose the bug).
 * Since \s does not match U+200B, a naive `[.!?]\s+` fails to split at that
 * point and instead swallows one or two more sentences into the lede before
 * finding the next break -- silently defeating the whole point of lifting
 * *only* the first sentence into the lede style. The "never mutates
 * characters" round-trip above still passes either way (no character is
 * lost, just misplaced between lede/rest), so it can't tell a correct split
 * from this bug. These tests use the real, untruncated strings from
 * copy.generated.ts and assert the actual split point, which the truncated
 * synthetic samples above cannot do.
 */
describe('splitLede against real copy.generated.ts paragraphs', () => {
  function readCopySource(): string {
    const copyPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../content/copy.generated.ts',
    )
    return readFileSync(copyPath, 'utf8')
  }

  function extractLiteral(source: string, key: string): string {
    const re = new RegExp(`"${key}": "((?:[^"\\\\]|\\\\.)*)"`)
    const match = source.match(re)
    if (!match) throw new Error(`Could not find "${key}" in copy.generated.ts`)
    // These string literals contain no backslash escapes in the source
    // file, so no unescaping is needed beyond lifting the captured text.
    return match[1]!
  }

  const source = readCopySource()

  // density_1/2/3 all share the exact "period, then ZWSP, then space, then
  // capital/tag" shape that exposed the bug; density_4 (ZWSP before the
  // period) already worked under the naive regex and is included as a
  // control to prove the fix doesn't regress it.
  const cases = [
    ['density_1', 'Breast density has four grades, A – D.​'],
    ['density_2', 'Breast density has four grades, A – D.​'],
    ['density_3', 'Breast density has four grades, A – D.​'],
    ['density_4', 'Breast density has four grades, A – D​.'],
  ] as const

  for (const [key, expectedLede] of cases) {
    it(`splits anatomyText.${key} on the first sentence only, not the whole density blurb`, () => {
      const text = extractLiteral(source, key)
      const { lede, rest } = splitLede(text)
      expect(lede).toBe(expectedLede)
      expect(rest.length).toBe(1)
      // No character lost: match[0]'s consumed separator is only ever
      // horizontal whitespace, so lede + rest always reconstructs the
      // original modulo that single run of whitespace.
      expect(lede + rest[0]!).toBe(text.slice(0, lede.length) + text.slice(-rest[0]!.length))
      expect(text.endsWith(rest[0]!)).toBe(true)
      expect(text.startsWith(lede)).toBe(true)
    })
  }

  it('round-trips the untruncated benign_fibroadenoma anatomy paragraph, doubled space and all', () => {
    const text = extractLiteral(source, 'benign_fibroadenoma')
    const { lede, rest } = splitLede(text)
    expect([lede, ...rest].join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '))
    // The doubled space the brief's truncated sample also exercises: assert
    // no non-whitespace character (including the ZWSP class of characters,
    // which \s does not touch) was dropped by comparing character-by-
    // character after stripping ASCII spaces only (never touching ​).
    expect([lede, ...rest].join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''))
  })
})
