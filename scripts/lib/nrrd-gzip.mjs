import { gzipSync } from 'node:zlib'

/**
 * An NRRD header is ASCII text, separated from the binary data block by a
 * single blank line (\n\n).
 * Reference: https://teem.sourceforge.net/nrrd/format.html
 */
export function splitNrrd(buf) {
  const marker = buf.indexOf('\n\n')
  if (marker === -1) {
    throw new Error('Not a valid attached NRRD: no blank-line header terminator found')
  }
  return {
    // Keep the terminating blank line, so reassembly needs no separator
    header: buf.subarray(0, marker + 2).toString('ascii'),
    data: buf.subarray(marker + 2),
  }
}

export function rewriteEncoding(header, encoding) {
  if (!/^encoding:\s*\S+\s*$/m.test(header)) {
    throw new Error('NRRD header has no encoding field')
  }
  return header.replace(/^encoding:\s*\S+\s*$/m, `encoding: ${encoding}`)
}

export function readEncoding(header) {
  const m = header.match(/^encoding:\s*(\S+)\s*$/m)
  if (!m) throw new Error('NRRD header has no encoding field')
  return m[1]
}

/**
 * Re-encode raw -> gzip. Files already encoded as gzip are returned unchanged.
 * three's NRRDLoader reads gzip natively via fflate, so the rendering layer
 * needs no changes.
 */
export function gzipNrrd(buf) {
  const { header, data } = splitNrrd(buf)
  if (readEncoding(header) === 'gzip') return buf
  return Buffer.concat([
    Buffer.from(rewriteEncoding(header, 'gzip'), 'ascii'),
    gzipSync(data, { level: 9 }),
  ])
}
