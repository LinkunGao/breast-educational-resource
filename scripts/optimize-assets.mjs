#!/usr/bin/env node
/**
 * 资产压缩流水线（设计文档 §9.1）。
 *
 *   assets-src/modelView/**  ->  web/public/modelView/**
 *
 * · *.nrrd  raw -> gzip 重编码（three 的 NRRDLoader 原生支持）
 * · *.glb   Draco 几何压缩（@gltf-transform/cli）
 * · *.json  原样复制（视角预设，只有几十字节）
 * · m2d.nrrd / 非 benign-cyst 的 u2d.nrrd  跳过（占位副本，设计文档 §3.1）
 *
 * 幂等：可重复运行。NRRD 若已声明 encoding: gzip 则跳过重压缩
 * （见 nrrd-gzip.mjs 的 gzipNrrd）；GLB/JSON 每次重新生成/复制，
 * 因为 Draco 压缩与直接拷贝本身都是幂等操作（相同输入产生相同或
 * 等效输出），无需额外记账。
 *
 * 若某个压缩后的 NRRD 在 copper3d 里加载失败，把它的仓库相对路径
 * （相对 assets-src/modelView，正斜杠）加入下面的 SKIP_GZIP 数组，
 * 流水线会原样拷贝未压缩版本。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipNrrd } from './lib/nrrd-gzip.mjs'

// 直接找到 @gltf-transform/cli 的 bin 入口，用 node 执行它（它是本仓库根
// package.json 的 devDependency，位置固定）。不走 `npx`：Windows 上 npx 是
// 一个 .cmd 批处理脚本，execFileSync 若不经过 shell 无法启动它（EINVAL），
// 而经过 shell 时数组参数不会被正确转义，含空格的路径（如本仓库所在目录
// "ABI apps"）会被错误拆分成多个参数。`node <bin.js>` 调用则和平台无关，
// 且是普通的可执行文件（node.exe），无需 shell。
const gltfTransformBin = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js',
)

/** 加载失败时手动把路径加进来，跳过 gzip 重编码。目前为空——全部 18 个 NRRD 验证通过。 */
const SKIP_GZIP = []

const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'assets-src', 'modelView')
const out = join(root, 'web', 'public', 'modelView')

/** 设计文档 §3.1：这些是占位副本，不进产物。 */
function isPlaceholder(rel) {
  const p = rel.split(sep).join('/')
  if (p.includes('m2d.nrrd')) return true
  if (p.includes('u2d.nrrd') && !p.startsWith('benign-cyst/')) return true
  if (p.includes('u_view.json') && !p.startsWith('benign-cyst/')) return true
  return false
}

const mb = n => (n / 1024 / 1024).toFixed(1)
let srcTotal = 0
let outTotal = 0
let skipped = 0

for await (const file of glob('**/*.{nrrd,glb,json}', { cwd: src })) {
  const rel = file
  const from = join(src, rel)
  const to = join(out, rel)

  if (isPlaceholder(rel)) {
    skipped++
    console.log(`  skip  ${rel}  (placeholder copy)`)
    continue
  }

  mkdirSync(dirname(to), { recursive: true })
  const before = statSync(from).size
  srcTotal += before

  if (rel.endsWith('.nrrd')) {
    const relPosix = rel.split(sep).join('/')
    if (SKIP_GZIP.includes(relPosix)) {
      cpSync(from, to)
    } else {
      writeFileSync(to, gzipNrrd(readFileSync(from)))
    }
  } else if (rel.endsWith('.glb')) {
    // Draco 几何压缩。--simplify false：教学模型不做网格简化，避免改变解剖外观。
    execFileSync(process.execPath, [gltfTransformBin, 'optimize', from, to,
      '--compress', 'draco', '--texture-compress', 'webp', '--simplify', 'false'],
      { stdio: 'inherit' })
  } else {
    cpSync(from, to)
  }

  const after = statSync(to).size
  outTotal += after
  const pct = before ? Math.round((1 - after / before) * 100) : 0
  console.log(`  ok    ${rel}  ${mb(before)}MB -> ${mb(after)}MB  (-${pct}%)`)
}

console.log(`\n  total  ${mb(srcTotal)}MB -> ${mb(outTotal)}MB`)
console.log(`  skipped ${skipped} placeholder file(s)`)
