/**
 * Recovers the legacy app icon from this repository's own history.
 *
 * The client pointed at
 * github.com/.../blob/main/frontend/static/icon.png, but that blob is
 * reachable locally -- `main` still carries the Nuxt 2 app that the
 * rebuild branch deleted. No network fetch, and the bytes are provably
 * the ones the old app shipped.
 *
 * Node rather than a shell pipeline on purpose: PowerShell re-encodes
 * bytes on the way through a pipe and silently corrupts PNGs.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(repoRoot, 'web/public/icon.png')

const png = execFileSync('git', ['show', 'main:frontend/static/icon.png'], {
  cwd: repoRoot,
  encoding: 'buffer',
  maxBuffer: 64 * 1024 * 1024,
})

if (png.subarray(1, 4).toString('ascii') !== 'PNG') {
  throw new Error('recovered blob is not a PNG -- has main been rewritten?')
}

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, png)

console.log(
  `wrote ${target}: ${png.length} bytes, `
  + `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,
)
