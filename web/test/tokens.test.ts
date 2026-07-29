import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../app/utils/contrast'

/** Read every --color-* value out of the @theme block in tokens.css.
 *  Note: this cannot be written as `new URL('../app/....css', import.meta.url)`.
 *  Vite's import-analysis plugin recognises that literal pattern statically as
 *  an "asset URL" and rewrites it to a dev-server address (something like
 *  http://localhost:3000/...) rather than resolving it at runtime against
 *  import.meta.url. fileURLToPath then throws on the non-file: scheme before
 *  it ever checks whether the file exists. Building the path by hand with
 *  node:path sidesteps that static rewrite. */
function readColorTokens(): Record<string, string> {
  const tokensPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../app/assets/css/tokens.css',
  )
  const css = readFileSync(tokensPath, 'utf8')
  const theme = css.match(/@theme\s*\{([\s\S]*?)\n\}/)
  if (!theme) throw new Error('No @theme block found in tokens.css')

  const out: Record<string, string> = {}
  for (const m of theme[1]!.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    out[m[1]!] = m[2]!
  }
  return out
}

const t = readColorTokens()

/** A parsing test fails silently when nothing matches, so pin the list first. */
const REQUIRED = [
  'bg', 'surface', 'surface-sunken', 'border', 'border-strong',
  'text', 'text-muted', 'text-subtle',
  'brand', 'brand-hover', 'brand-subtle', 'accent-plum', 'accent-hot',
  'film-bg', 'film-bg-2', 'film-border',
  'anatomy-ink', 'anatomy-fill',
  'mammogram-ink', 'mammogram-fill',
  'ultrasound-ink', 'ultrasound-fill',
  'mri-ink', 'mri-fill',
] as const

const AA_BODY = 4.5
const AA_LARGE = 3

describe('tokens.css exposes every token the app relies on', () => {
  for (const name of REQUIRED) {
    it(`defines --color-${name}`, () => {
      expect(t[name], `--color-${name} missing from tokens.css`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
  }
})

describe('body text meets AA on every light surface', () => {
  for (const surface of ['surface', 'bg', 'surface-sunken'] as const) {
    for (const ink of ['text', 'text-muted'] as const) {
      it(`--color-${ink} on --color-${surface}`, () => {
        expect(contrastRatio(t[ink]!, t[surface]!)).toBeGreaterThanOrEqual(AA_BODY)
      })
    }
  }
})

describe('brand and modality inks meet AA on white', () => {
  const inks = [
    'brand', 'brand-hover', 'accent-plum',
    'anatomy-ink', 'mammogram-ink', 'ultrasound-ink', 'mri-ink',
  ] as const

  for (const ink of inks) {
    it(`--color-${ink}`, () => {
      expect(contrastRatio(t[ink]!, t.surface!)).toBeGreaterThanOrEqual(AA_BODY)
    })
  }
})

describe('documented exceptions stay in the graphics-only band', () => {
  // Design doc §5.1: neither colour reaches body-text AA, so both are pinned
  // into the 3:1 graphics band. Asserting both ends stops someone darkening
  // one in passing and letting it drift back into body text.
  for (const name of ['text-subtle', 'accent-hot'] as const) {
    it(`--color-${name} is 3:1..4.5:1 on white`, () => {
      const ratio = contrastRatio(t[name]!, t.surface!)
      expect(ratio).toBeGreaterThanOrEqual(AA_LARGE)
      expect(ratio).toBeLessThan(AA_BODY)
    })
  }
})

describe('the dark reading panel is readable', () => {
  for (const film of ['film-bg', 'film-bg-2'] as const) {
    it(`--color-surface on --color-${film}`, () => {
      expect(contrastRatio(t.surface!, t[film]!)).toBeGreaterThanOrEqual(AA_BODY)
    })
  }
})

describe('modality ink and fill are distinguishable from each other', () => {
  const pairs = [
    ['anatomy-ink', 'anatomy-fill'],
    ['mammogram-ink', 'mammogram-fill'],
    ['ultrasound-ink', 'ultrasound-fill'],
    ['mri-ink', 'mri-fill'],
  ] as const

  for (const [ink, fill] of pairs) {
    it(`${ink} reads on ${fill}`, () => {
      expect(contrastRatio(t[ink]!, t[fill]!)).toBeGreaterThanOrEqual(AA_BODY)
    })
  }
})

describe('prefers-reduced-motion disables motion globally, not just here', () => {
  // Global constraint: this must DISABLE motion, not shorten it. A CSS
  // engine isn't available in happy-dom, so this can only check the source
  // declares zero-duration overrides -- it cannot confirm a real browser
  // actually suppresses a specific transition. That needs a manual check
  // (or an e2e test) with OS-level "reduce motion" turned on.
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../app/assets/css/tokens.css'),
    'utf8',
  )
  const query = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n {2}\}/)

  it('declares an @media (prefers-reduced-motion: reduce) block', () => {
    expect(query, 'no prefers-reduced-motion block found in tokens.css').not.toBeNull()
  })

  it('zeroes duration and delay for both transitions and animations, not a shortened value', () => {
    const body = query![1]!
    // Zero, not merely "short" (e.g. 1ms) -- a nonzero value would still
    // run a (very fast) animation, which is exactly what this constraint
    // forbids.
    expect(body).toMatch(/animation-duration:\s*0s\s*!important/)
    expect(body).toMatch(/animation-delay:\s*0s\s*!important/)
    expect(body).toMatch(/transition-duration:\s*0s\s*!important/)
    expect(body).toMatch(/transition-delay:\s*0s\s*!important/)
  })

  it('also forces instant (non-animated) scrolling', () => {
    expect(query![1]!).toMatch(/scroll-behavior:\s*auto\s*!important/)
  })
})
