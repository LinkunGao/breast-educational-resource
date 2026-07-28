import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { gzipNrrd, rewriteEncoding, splitNrrd } from '../../scripts/lib/nrrd-gzip.mjs'

/** 造一个最小的合法 NRRD：头 + 空行 + 二进制体。 */
function makeNrrd(encoding = 'raw', data = Buffer.from([1, 2, 3, 4])): Buffer {
  const header = [
    'NRRD0004',
    '# Complete NRRD file format specification at:',
    'type: unsigned char',
    'dimension: 3',
    'sizes: 2 2 1',
    `encoding: ${encoding}`,
    'endian: little',
    '',
    '',
  ].join('\n')
  return Buffer.concat([Buffer.from(header, 'ascii'), data])
}

describe('splitNrrd', () => {
  it('splits at the blank line that terminates the header', () => {
    const { header, data } = splitNrrd(makeNrrd())
    expect(header).toContain('NRRD0004')
    expect(header).toContain('encoding: raw')
    expect(data).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  it('throws when there is no header terminator', () => {
    expect(() => splitNrrd(Buffer.from('NRRD0004\ntype: short\n', 'ascii')))
      .toThrow(/header terminator/i)
  })

  it('does not treat a comment line as the terminator', () => {
    const { data } = splitNrrd(makeNrrd())
    expect(data.length).toBe(4)
  })
})

describe('rewriteEncoding', () => {
  it('replaces the encoding field', () => {
    const out = rewriteEncoding('type: short\nencoding: raw\nendian: little\n', 'gzip')
    expect(out).toContain('encoding: gzip')
    expect(out).not.toContain('encoding: raw')
  })

  it('leaves every other field untouched', () => {
    const out = rewriteEncoding('type: short\nencoding: raw\nendian: little\n', 'gzip')
    expect(out).toContain('type: short')
    expect(out).toContain('endian: little')
  })

  it('throws when the header has no encoding field', () => {
    expect(() => rewriteEncoding('type: short\n', 'gzip')).toThrow(/encoding/i)
  })
})

describe('gzipNrrd', () => {
  it('produces a file whose data block gunzips back to the original', () => {
    const original = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2])
    const out = gzipNrrd(makeNrrd('raw', original))
    const { header, data } = splitNrrd(out)
    expect(header).toContain('encoding: gzip')
    expect(gunzipSync(data)).toEqual(original)
  })

  it('is a no-op for an already gzipped file', () => {
    const already = gzipNrrd(makeNrrd())
    expect(gzipNrrd(already)).toEqual(already)
  })
})
