/**
 * WCAG 2.2 相对亮度与对比度。
 * 用于在测试中强制校验设计 token 的可读性（设计文档 §5.1）。
 */

function toChannels(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Expected a 6-digit hex colour, received "${hex}"`)
  }
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

/** sRGB 8-bit 通道 -> 线性化分量。https://www.w3.org/TR/WCAG22/#dfn-relative-luminance */
function linearise(channel8bit: number): number {
  const c = channel8bit / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = toChannels(hex)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}
