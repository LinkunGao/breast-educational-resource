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
