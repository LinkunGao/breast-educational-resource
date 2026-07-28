import { gzipSync } from 'node:zlib'

/**
 * NRRD 的头是 ASCII 文本，以一个空行（\n\n）与二进制数据块分隔。
 * 参考：https://teem.sourceforge.net/nrrd/format.html
 */
export function splitNrrd(buf) {
  const marker = buf.indexOf('\n\n')
  if (marker === -1) {
    throw new Error('Not a valid attached NRRD: no blank-line header terminator found')
  }
  return {
    // 保留终止空行，重新拼接时无需再补
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
 * raw -> gzip 重编码。已是 gzip 的文件原样返回。
 * three 的 NRRDLoader 通过 fflate 原生支持 gzip 编码，无需改动渲染层。
 */
export function gzipNrrd(buf) {
  const { header, data } = splitNrrd(buf)
  if (readEncoding(header) === 'gzip') return buf
  return Buffer.concat([
    Buffer.from(rewriteEncoding(header, 'gzip'), 'ascii'),
    gzipSync(data, { level: 9 }),
  ])
}
