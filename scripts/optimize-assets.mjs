#!/usr/bin/env node
/**
 * Asset compression pipeline (design doc §9.1).
 *
 *   assets-src/modelView/**  ->  web/public/modelView/**
 *
 * · *.nrrd  re-encoded raw -> gzip (three's NRRDLoader reads it natively)
 * · *.glb   Draco geometry compression (@gltf-transform/cli)
 * · *.json  copied as-is (view presets, only tens of bytes)
 * · m2d.nrrd, and u2d.nrrd outside benign-cyst, are skipped as placeholder
 *   copies (design doc §3.1)
 *
 * Idempotent, so it is safe to re-run. Each run builds a full copy of the
 * output into a disposable staging directory, and only replaces the real
 * output directory once every file has succeeded (see the staging-swap
 * comment below) — so a deleted source file, or output from a run predating
 * a placeholder-filter change, can never linger and ship, but a run that
 * fails partway also can't leave web/public/modelView half-populated. An
 * NRRD already declaring encoding: gzip or gz is not recompressed (see
 * gzipNrrd in nrrd-gzip.mjs) — repeated successful runs produce identical
 * output.
 *
 * If a compressed NRRD ever fails to load in copper3d, add its path
 * (relative to assets-src/modelView, forward slashes) to the SKIP_GZIP array
 * below and the pipeline will copy the uncompressed original instead.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipNrrd } from './lib/nrrd-gzip.mjs'

// Locate @gltf-transform/cli's bin entry point and run it with node. It is a
// devDependency of web/ — web/ is the repo's only Node project (yarn) and the
// root has no package.json — so resolve it from web/node_modules.
// Not via `npx`: on Windows npx is a .cmd batch script that execFileSync
// cannot launch without a shell (EINVAL), and going through a shell stops the
// array arguments being escaped properly, so a path containing spaces (such
// as this repo's own "ABI apps" directory) gets split into several arguments.
// `node <bin.js>` is platform-independent and runs an ordinary executable
// (node.exe), needing no shell at all.
const gltfTransformBin = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'web', 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js',
)

/** Add a path here by hand to skip gzip re-encoding when it fails to load.
 *  Currently empty — all 18 NRRDs verified. */
const SKIP_GZIP = []

const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'assets-src', 'modelView')
const out = join(root, 'web', 'public', 'modelView')
// A sibling of `out`, derived from the same constant, never from input: the
// whole run is written here first and swapped into `out` only on success.
const staging = `${out}.staging`

/** Design doc §3.1: these are placeholder copies and never ship. */
function isPlaceholder(rel) {
  const p = rel.split(sep).join('/')
  if (p.includes('m2d.nrrd')) return true
  if (p.includes('u2d.nrrd') && !p.startsWith('benign-cyst/')) return true
  if (p.includes('u_view.json') && !p.startsWith('benign-cyst/')) return true
  return false
}

// Start every run with a fresh staging directory, never the live `out`.
// Wiping `out` up front (an earlier version of this script did that) meant a
// mid-run failure -- a malformed file, a Draco crash -- left
// web/public/modelView partially populated: some files rebuilt, some
// missing, and the app would 404 on whatever wasn't reprocessed yet, with
// nothing about the directory's appearance saying it was incomplete.
// Building into a disposable staging directory instead means a failed run
// leaves the PREVIOUS complete build in `out` exactly as it was; only the
// throwaway `staging` directory ends up half-written, and it is deleted
// before the process exits so it can never be mistaken for a finished build.
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

const mb = n => (n / 1024 / 1024).toFixed(1)
let srcTotal = 0
let outTotal = 0
let skipped = 0

try {
  for await (const file of glob('**/*.{nrrd,glb,json}', { cwd: src })) {
    const rel = file
    const from = join(src, rel)
    const to = join(staging, rel)

    if (isPlaceholder(rel)) {
      skipped++
      console.log(`  skip  ${rel}  (placeholder copy)`)
      continue
    }

    // Attach the offending path to any failure. A malformed file anywhere in
    // a 43-file run must fail loudly and name itself -- a bare "NRRD header
    // has no encoding field" with no path is useless when it could be any of
    // them.
    try {
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
        // Draco geometry compression. --simplify false: teaching models are
        // not mesh-simplified, so the anatomy's appearance stays unchanged.
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
    } catch (err) {
      throw new Error(`optimize-assets: failed on "${rel}": ${err.message}`, { cause: err })
    }
  }
} catch (err) {
  // The run did not complete: discard the half-built staging directory so it
  // can never look like a finished build, and leave the previous successful
  // build in `out` untouched -- the app keeps serving it.
  rmSync(staging, { recursive: true, force: true })
  console.error(`\n  FAILED -- ${out} is untouched and still holds the previous build.`)
  throw err
}

// Every file in this run succeeded: swap the new build into place. Both
// directories are on the same filesystem (under web/public/), so this is a
// cheap, near-atomic rename rather than a second multi-hundred-MB copy.
rmSync(out, { recursive: true, force: true })
renameSync(staging, out)

console.log(`\n  total  ${mb(srcTotal)}MB -> ${mb(outTotal)}MB`)
console.log(`  skipped ${skipped} placeholder file(s)`)
