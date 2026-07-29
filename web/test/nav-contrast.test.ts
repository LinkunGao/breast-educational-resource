import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../app/utils/contrast'

/** Tokens.test.ts guards the raw --color-* values in isolation; it can't
 *  catch a component pairing two individually-fine tokens into a
 *  non-compliant combination (e.g. a 14px-body ink that's only compliant at
 *  >=18.66px, paired with a background it was never checked against). This
 *  file guards the actual pairings the nav components use. Re-implements
 *  the same tiny --color-* reader tokens.test.ts uses, kept local rather
 *  than shared, matching this repo's existing one-file-one-helper style. */
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
const AA_BODY = 4.5
const AA_LARGE = 3

describe('CaseSidebar: active link ink on its highlight background (14px body text)', () => {
  it('text-anatomy-ink on bg-brand-subtle meets AA body (text-brand does not)', () => {
    const used = contrastRatio(t['anatomy-ink']!, t['brand-subtle']!)
    const rejected = contrastRatio(t.brand!, t['brand-subtle']!)
    expect(used).toBeGreaterThanOrEqual(AA_BODY)
    // Pin the failure this replaced, so nobody "fixes" it back to text-brand
    // because brand is the more obvious colour to reach for.
    expect(rejected).toBeLessThan(AA_BODY)
  })
})

describe('CaseSidebar: group heading ink on white (12px caption text)', () => {
  it('text-text-muted on white meets AA body (text-text-subtle does not, at this size)', () => {
    const used = contrastRatio(t['text-muted']!, t.surface!)
    const rejected = contrastRatio(t['text-subtle']!, t.surface!)
    expect(used).toBeGreaterThanOrEqual(AA_BODY)
    expect(rejected).toBeLessThan(AA_BODY)
  })
})

describe('case page stage placeholder: ink on the sunken stage background (14px body text)', () => {
  it('text-text-muted on bg-surface-sunken meets AA body (text-text-subtle does not)', () => {
    const used = contrastRatio(t['text-muted']!, t['surface-sunken']!)
    const rejected = contrastRatio(t['text-subtle']!, t['surface-sunken']!)
    expect(used).toBeGreaterThanOrEqual(AA_BODY)
    expect(rejected).toBeLessThan(AA_BODY)
  })
})

describe('CaseHeader: BI-RADS badge ink on its own highlight background (12px caption text)', () => {
  it('text-brand-hover on bg-brand-subtle meets AA body (text-brand does not)', () => {
    const used = contrastRatio(t['brand-hover']!, t['brand-subtle']!)
    // Pin the failure Task 6's own brief markup shipped with: text-brand on
    // brand-subtle is the same class of bug the stage placeholder above
    // guards against -- a token that reads fine on white failing once it's
    // paired with the app's highlight background instead.
    const rejected = contrastRatio(t.brand!, t['brand-subtle']!)
    expect(used).toBeGreaterThanOrEqual(AA_BODY)
    expect(rejected).toBeLessThan(AA_BODY)
  })
})

describe('ModalityStepper: active step number, white text on a solid ink chip (12px bold)', () => {
  // tokens.test.ts already checks each ink against white as *foreground*
  // (ink text on a white page); contrastRatio is symmetric, so the same
  // numbers apply here with white as the *chip's* colour and the ink as its
  // background. Pinned again here, next to the pairing it belongs to, so a
  // reviewer of ModalityStepper.vue doesn't have to go find tokens.test.ts
  // to see why `bg-current` (which resolved to white-on-white, 1.00:1) was
  // wrong and an explicit `bg-*-ink` utility is required instead.
  const inks = ['anatomy-ink', 'mammogram-ink', 'ultrasound-ink', 'mri-ink'] as const
  for (const ink of inks) {
    it(`text-surface on bg-${ink} meets AA body`, () => {
      expect(contrastRatio(t.surface!, t[ink]!)).toBeGreaterThanOrEqual(AA_BODY)
    })
  }
})

describe('ModalityStepper: inactive step ring and connector on white (non-text, 3:1 floor)', () => {
  it('text-muted meets the 3:1 non-text floor (border-strong does not)', () => {
    const used = contrastRatio(t['text-muted']!, t.surface!)
    // default.vue's bottom-sheet handle documents this exact failure
    // (border-strong measures 1.73:1 on white) and the same fix.
    const rejected = contrastRatio(t['border-strong']!, t.surface!)
    expect(used).toBeGreaterThanOrEqual(AA_LARGE)
    expect(rejected).toBeLessThan(AA_LARGE)
  })
})

/**
 * Task 10 controller correction C10: the stage became focusable this task
 * (`tabindex="0"`, alongside the keyboard handlers Task 7 said to wait for),
 * so its focus indicator now has to meet §11's 3:1 non-text floor -- against
 * BOTH stage backgrounds, because the same element sits on the light
 * anatomy background and on the dark imaging lightbox depending on the
 * modality. `--color-brand` is the app's one focus colour (tokens.css's
 * `:focus-visible` rule), so a token change that quietly broke this would
 * otherwise only be visible to someone tabbing onto the canvas.
 */
describe('CopperStage: focus ring on both stage backgrounds', () => {
  it('the brand focus outline clears 3:1 on the dark imaging lightbox', () => {
    expect(contrastRatio(t.brand!, t['film-bg']!)).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the brand focus outline clears 3:1 on the light anatomy background', () => {
    // The stage paints a gradient from surface-sunken to bg; the ring must
    // clear the floor against either end of it.
    expect(contrastRatio(t.brand!, t.bg!)).toBeGreaterThanOrEqual(AA_LARGE)
    expect(contrastRatio(t.brand!, t['surface-sunken']!)).toBeGreaterThanOrEqual(AA_LARGE)
  })
})
