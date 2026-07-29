/**
 * Rebuilds the density-1/2/4 anatomy models from density-3.
 *
 * The four `density*.glb` models differ in ONE thing: how many mammary lobes
 * the breast contains. Everything else -- fat, areola, nipple, ducts,
 * sinuses, suspensory ligaments -- is identical across all four, and
 * `density75.glb` (density-3) is the model the author actually built. The
 * others were meant to be it with lobes removed or added:
 *
 *     density-1  -50%   density-2  -25%   density-3  baseline   density-4  +50%
 *
 * They had drifted badly from that. Measured on the shipped assets, counting
 * connected lobe islands: density-1 had 4 of 19 (-79%), density-2 had 7
 * (-63%), and density-4 was not thinned or thickened by lobe at all -- it
 * carried THREE whole copies of the lobes mesh at ~1cm offsets, 227,364
 * triangles for what should be roughly half again the baseline. That
 * triplication is what read as geometry "not deleted cleanly".
 *
 * ## Method
 *
 * Lobes are removed and added as WHOLE LOBES, never as loose triangles. A
 * lobe is a connected component of the `VH_F_mammary_lobes_L` primitive,
 * found by union-find over the index buffer after welding vertices by
 * position -- the mesh is exported unwelded, so without the weld every quad
 * looks like its own island (9,325 of them, which is what a first pass
 * reported).
 *
 * Which lobes go is decided deterministically and spatially: islands are
 * ordered by centroid height and picked with an even stride, so thinning
 * empties the breast uniformly instead of hollowing out one end of it.
 * Re-running this script always produces the same models.
 *
 * For density-4, the extra lobes are copies of existing ones nudged toward
 * the lobe cloud's own centroid, so they stay inside the fat layer.
 *
 * ## Running it
 *
 *     node scripts/build-density-models.mjs [--dry-run]
 *
 * Reads the uncompressed original under `assets-src/modelView/` and writes
 * Draco-compressed output to `web/public/modelView/`, the same arrangement
 * `optimize-assets.mjs` produces. The source is never written.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The repo root has no `node_modules` -- `web/` is the only Node project
// here -- so these resolve by path rather than by bare specifier.
const modules = join(root, 'web/node_modules').replaceAll('\\', '/')
const { NodeIO } = await import(`file:///${modules}/@gltf-transform/core/dist/index.js`)
const { ALL_EXTENSIONS } = await import(`file:///${modules}/@gltf-transform/extensions/dist/index.js`)
const SOURCE = join(root, 'assets-src/modelView/density-3/left/density75.glb')
const LOBES = 'VH_F_mammary_lobes_L'
const DRY_RUN = process.argv.includes('--dry-run')

/** Output file per target, and the lobe count each should end up with as a
 * fraction of density-3's. */
const TARGETS = [
  { dir: 'density-1', file: 'density25.glb', ratio: 0.5 },
  { dir: 'density-2', file: 'density50.glb', ratio: 0.75 },
  { dir: 'density-4', file: 'density100.glb', ratio: 1.5 },
]

/**
 * How far a duplicated lobe moves, as a fraction of the MEAN LOBE SIZE --
 * an absolute distance in model units, not a fraction of anything else.
 *
 * A first version used 6% of the lobe's distance to the cloud centre, which
 * for a typical lobe worked out to ~0.0012 units: a twentieth of a lobe. The
 * copies landed essentially on top of their originals, adding no visible
 * density at all and inviting z-fighting. Half a lobe is roughly the offset
 * the model's own author used when they duplicated the whole lobes mesh
 * (~0.011 on nodes whose lobes span ~0.022), and it is far short of the
 * ~0.05 that would push one outside the fat layer.
 */
const DUPLICATE_NUDGE = 0.5

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

/**
 * Splits a primitive into connected components.
 *
 * Welds by quantised position first: these meshes duplicate every shared
 * corner per face, so raw index adjacency says nothing about connectivity.
 * 1e-6 is far below the smallest real feature (the smallest lobe spans
 * ~0.014 model units).
 */
function findIslands(prim) {
  const idx = prim.getIndices().getArray()
  const pos = prim.getAttribute('POSITION').getArray()
  const n = prim.getAttribute('POSITION').getCount()

  const canon = new Int32Array(n)
  const seen = new Map()
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * 1e6)},${Math.round(pos[i * 3 + 1] * 1e6)},${Math.round(pos[i * 3 + 2] * 1e6)}`
    const hit = seen.get(key)
    if (hit === undefined) { seen.set(key, i); canon[i] = i }
    else canon[i] = hit
  }

  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb }
  for (let t = 0; t < idx.length; t += 3) {
    union(canon[idx[t]], canon[idx[t + 1]])
    union(canon[idx[t + 1]], canon[idx[t + 2]])
  }

  const groups = new Map()
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(canon[idx[t]])
    let g = groups.get(r)
    if (!g) {
      g = { tris: [], centroid: [0, 0, 0], count: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
      groups.set(r, g)
    }
    g.tris.push(t)
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k] * 3
      for (let a = 0; a < 3; a++) {
        const c = pos[v + a]
        g.centroid[a] += c
        if (c < g.min[a]) g.min[a] = c
        if (c > g.max[a]) g.max[a] = c
      }
      g.count++
    }
  }
  for (const g of groups.values()) {
    g.centroid = g.centroid.map(c => c / g.count)
    /** Longest edge of the lobe's bounding box -- the length scale a
     * duplicate's offset is measured in. */
    g.size = Math.max(g.max[0] - g.min[0], g.max[1] - g.min[1], g.max[2] - g.min[2])
  }
  return [...groups.values()]
}

/** Evenly spaced picks from `total`, always including the first. Used so a
 * thinned breast keeps lobes spread through its whole height. */
function evenPicks(total, keep) {
  if (keep >= total) return [...Array(total).keys()]
  const step = total / keep
  const out = []
  for (let i = 0; i < keep; i++) out.push(Math.min(total - 1, Math.floor(i * step)))
  return [...new Set(out)]
}

/**
 * Rewrites the lobes primitive to contain exactly `keptIslands`, plus
 * `duplicates` extra copies, compacting the vertex buffers so nothing
 * unreferenced survives into the output.
 */
function rewriteLobes(doc, prim, kept, duplicates, cloudCentre) {
  const idx = prim.getIndices().getArray()
  const semantics = prim.listSemantics()
  const src = Object.fromEntries(
    semantics.map(s => [s, prim.getAttribute(s).getArray()]),
  )
  const sizes = Object.fromEntries(
    semantics.map(s => [s, prim.getAttribute(s).getElementSize()]),
  )

  const remap = new Map()
  const outVerts = Object.fromEntries(semantics.map(s => [s, []]))
  const outIdx = []

  /** Appends one triangle, translating its vertices by `offset`. A non-zero
   * offset always allocates fresh vertices: a duplicated lobe must not share
   * positions with the original it was copied from. */
  function emit(triStart, offset) {
    for (let k = 0; k < 3; k++) {
      const v = idx[triStart + k]
      const key = offset ? `d${offset.id}:${v}` : `${v}`
      let mapped = remap.get(key)
      if (mapped === undefined) {
        mapped = outVerts.POSITION.length / 3
        for (const s of semantics) {
          const size = sizes[s]
          for (let c = 0; c < size; c++) {
            let value = src[s][v * size + c]
            if (offset && s === 'POSITION') value += offset.delta[c]
            outVerts[s].push(value)
          }
        }
        remap.set(key, mapped)
      }
      outIdx.push(mapped)
    }
  }

  for (const island of kept) for (const t of island.tris) emit(t, null)
  duplicates.forEach((island, i) => {
    // Fixed distance, aimed inward. Normalising the direction is what makes
    // the offset a real displacement rather than a percentage of however far
    // this particular lobe happens to sit from the centre.
    const dir = [0, 1, 2].map(a => cloudCentre[a] - island.centroid[a])
    const len = Math.hypot(...dir) || 1
    const step = island.size * DUPLICATE_NUDGE
    const delta = dir.map(d => (d / len) * step)
    for (const t of island.tris) emit(t, { id: i, delta })
  })

  for (const s of semantics) {
    prim.getAttribute(s).setArray(new Float32Array(outVerts[s]))
  }
  prim.getIndices().setArray(
    outIdx.length > 65535 ? new Uint32Array(outIdx) : new Uint16Array(outIdx),
  )
  return outIdx.length / 3
}

const baseline = await io.read(SOURCE)
const baseLobes = baseline.getRoot().listMeshes().find(m => m.getName().startsWith(LOBES))
if (!baseLobes) throw new Error(`No ${LOBES} mesh in ${SOURCE}`)
const baseIslands = findIslands(baseLobes.listPrimitives()[0])
console.log(`baseline (density-3): ${baseIslands.length} lobes, ${baseLobes.listPrimitives()[0].getIndices().getCount() / 3} triangles\n`)

for (const target of TARGETS) {
  const doc = await io.read(SOURCE)
  const mesh = doc.getRoot().listMeshes().find(m => m.getName().startsWith(LOBES))
  const prim = mesh.listPrimitives()[0]
  const islands = findIslands(prim)

  // Ordered by centroid height, so an even stride thins the breast evenly
  // rather than clearing it from one end.
  islands.sort((a, b) => a.centroid[1] - b.centroid[1])
  const wanted = Math.round(islands.length * target.ratio)

  let kept = islands
  let duplicates = []
  if (wanted < islands.length) {
    const picks = new Set(evenPicks(islands.length, wanted))
    kept = islands.filter((_, i) => picks.has(i))
  }
  else if (wanted > islands.length) {
    const extra = wanted - islands.length
    duplicates = evenPicks(islands.length, extra).map(i => islands[i])
  }

  const cloudCentre = islands
    .reduce((acc, is) => [acc[0] + is.centroid[0], acc[1] + is.centroid[1], acc[2] + is.centroid[2]], [0, 0, 0])
    .map(c => c / islands.length)

  const tris = rewriteLobes(doc, prim, kept, duplicates, cloudCentre)
  const out = join(root, 'web/public/modelView', target.dir, 'left', target.file)

  console.log(
    `${target.dir}  ${String(Math.round(target.ratio * 100)).padStart(4)}%  `
    + `${String(kept.length + duplicates.length).padStart(2)} lobes `
    + `(${kept.length} kept${duplicates.length ? ` + ${duplicates.length} added` : ''}), `
    + `${tris.toLocaleString()} triangles -> ${target.file}`,
  )
  if (DRY_RUN) continue

  mkdirSync(dirname(out), { recursive: true })
  const raw = join(root, 'web/public/modelView', target.dir, 'left', `.raw-${target.file}`)
  await io.write(raw, doc)

  // Same compression the asset pipeline applies, so these files are
  // interchangeable with anything `yarn assets` produces.
  // Byte-for-byte the same invocation optimize-assets.mjs:154 uses, so these
  // files are indistinguishable from pipeline output. `--simplify false`
  // matters: mesh simplification on anatomy is not ours to apply silently.
  const cli = join(root, 'web/node_modules/@gltf-transform/cli/bin/cli.js')
  execFileSync(process.execPath, [
    cli, 'optimize', raw, out,
    '--compress', 'draco',
    '--texture-compress', 'webp',
    '--simplify', 'false',
  ], { stdio: 'inherit' })
  execFileSync(process.execPath, ['-e', `require('fs').unlinkSync(${JSON.stringify(raw)})`])
}
