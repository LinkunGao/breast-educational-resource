import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../app/utils/contrast'

/** 从 tokens.css 的 @theme 块里读出全部 --color-* 值。
 *  注意：这里不能写成 `new URL('../app/....css', import.meta.url)` ——
 *  Vite 的 import-analysis 插件会把这个字面量模式静态识别为「资源 URL」
 *  并改写成 dev-server 资源地址（如 http://localhost:3000/...），
 *  而不是运行时按 import.meta.url 做路径解析，导致 fileURLToPath 在
 *  真正检查文件是否存在之前就先因为 scheme 不是 file: 而抛错。
 *  用 node:path 手动拼路径可以绕开这个静态改写。 */
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

/** 解析式测试的失效模式是「匹配不到就静默跳过」。先钉死名单。 */
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
  // 设计文档 §5.1：这两个色达不到正文 AA，被钉在 3:1 图形带里，
  // 断言两端是为了防止它们哪天被"顺手调深"后重新流回正文。
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
