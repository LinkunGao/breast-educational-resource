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
  'brand', 'brand-hover', 'brand-subtle',
  'group-anatomy', 'group-benign', 'group-cancer',
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

describe('every ink used for TEXT meets AA on white', () => {
  // `brand` is deliberately absent, and that is the point of the pair of
  // describes: the design system's Breast Rose is an ACCENT (fills,
  // indicators, focus rings) and `brand-hover` -- its Deep Burgundy
  // secondary -- is the ink that goes with it. The band `brand` does have
  // to stay inside is asserted below.
  const inks = [
    'brand-hover',
    'group-anatomy', 'group-benign', 'group-cancer',
    'anatomy-ink', 'mammogram-ink', 'ultrasound-ink', 'mri-ink',
  ] as const

  for (const ink of inks) {
    it(`--color-${ink}`, () => {
      expect(contrastRatio(t[ink]!, t.surface!)).toBeGreaterThanOrEqual(AA_BODY)
    })
  }
})

describe('documented exceptions stay in the graphics-only band', () => {
  // Neither colour reaches body-text AA, so both are pinned into the 3:1
  // graphics band. Asserting BOTH ends is the point: the lower bound stops
  // one being lightened past the non-text floor, and the upper bound is
  // what stops `brand` quietly being darkened until it "can" be used as
  // text again -- which is the exact drift that turned this interface pink
  // in the first place, and which the design system's §3 forbids in words
  // a test cannot check.
  for (const name of ['text-subtle', 'brand'] as const) {
    it(`--color-${name} is 3:1..4.5:1 on white`, () => {
      const ratio = contrastRatio(t[name]!, t.surface!)
      expect(ratio).toBeGreaterThanOrEqual(AA_LARGE)
      expect(ratio).toBeLessThan(AA_BODY)
    })
  }
})

describe('the dark reading panel is gone', () => {
  // §5.3's imaging "reading lightbox" was removed -- every modality sits on
  // the one light background now. Pinning the ABSENCE of the tokens, because
  // a half-revert that restored them without restoring the treatment would
  // otherwise leave three dead custom properties nobody would notice.
  for (const dead of ['film-bg', 'film-bg-2', 'film-border']) {
    it(`does not define --color-${dead}`, () => {
      expect(t[dead]).toBeUndefined()
    })
  }

  // Same reasoning for the two accents the design-system palette dropped:
  // `accent-plum` became `--color-mammogram-ink`'s job and `accent-hot`
  // existed only as a second graphics-band pink, which `brand` now is.
  // Neither has a use left, and a stray redefinition would be a dead
  // custom property nobody would notice.
  for (const dead of ['accent-plum', 'accent-hot']) {
    it(`does not define --color-${dead}`, () => {
      expect(t[dead]).toBeUndefined()
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

describe('scrollbars are the app\'s own, not the platform default', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../app/assets/css/tokens.css'),
    'utf8',
  )

  it('draws the bar itself, at an explicit width, with a rounded thumb', () => {
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*10px/)
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*9999px/)
    // A transparent border plus padding-box clipping is the only way to
    // inset a thumb inside its gutter; a thumb has no padding of its own.
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*background-clip:\s*padding-box/)
  })

  it('removes the stepper arrows', () => {
    // The two buttons at the ends of a Windows scrollbar. Reported
    // directly: "上下的那两个箭头不允许存在".
    expect(css).toMatch(/::-webkit-scrollbar-button\s*\{[^}]*display:\s*none/)
  })

  /**
   * The regression this file exists to prevent, and it has already
   * happened once.
   *
   * In Chromium, `scrollbar-width` set to anything but `auto` makes the
   * engine ignore every `::-webkit-scrollbar` rule for that element. A
   * global `:root { scrollbar-width: thin }` therefore does not merely
   * fail to help -- it silently switches off the whole treatment above and
   * hands back the engine's own bar, arrows and all. The standard
   * properties are allowed here only inside the @supports block that
   * excludes the engines which honour the pseudo-elements.
   */
  it('never sets scrollbar-width outside the Firefox-only @supports block', () => {
    const firefoxOnly = css.match(
      /@supports not selector\(::-webkit-scrollbar\)\s*\{([\s\S]*?)\n {2}\}/,
    )
    expect(firefoxOnly, 'no @supports not selector(::-webkit-scrollbar) block').not.toBeNull()
    expect(firefoxOnly![1]!).toMatch(/scrollbar-width:\s*thin/)
    expect(firefoxOnly![1]!).toMatch(/scrollbar-color:/)

    // Comments stripped first: the block above this rule explains the trap
    // in prose and names the property while doing so, which would match.
    const elsewhere = css.replace(firefoxOnly![0]!, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(elsewhere).not.toMatch(/scrollbar-width:/)
    expect(elsewhere).not.toMatch(/scrollbar-color:/)
  })
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
