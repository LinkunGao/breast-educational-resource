/**
 * Rebuilds all four density anatomy models from density-3's source.
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
 * triangles for what should be roughly half again the baseline.
 *
 * And the source itself carries four fragments that no duct reaches --
 * lobes whose duct was deleted in Blender, left floating unattached inside
 * the fat layer. Those are dropped from every model including density-3,
 * which is why density-3 is rebuilt here too despite its lobe count being
 * unchanged. See ORPHAN_DISTANCE. The real baseline is 15 lobes, not 19.
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
const DUCTS = 'VH_F_main_lactiferous_ducts_L'

/**
 * How close a lobe's nearest vertex must come to duct geometry to count as
 * a real lobe rather than debris.
 *
 * Read off the source model's own distribution rather than guessed. Measured
 * on density75.glb, the nineteen islands fall into two groups with nothing
 * between them:
 *
 *   15 lobes    3,398-6,802 triangles   0.00003-0.00026 from a duct
 *    4 shards       2-200 triangles     0.00193-0.00793 from a duct
 *
 * Seven times the distance and a seventeenth of the size; both criteria
 * select the same four. Those four are the geometry the human pointed at --
 * lobes whose duct was deleted in Blender and which were left floating
 * unattached. 0.001 sits in the gap.
 */
const ORPHAN_DISTANCE = 0.001

/** Refuse to run if the filter would take an implausible share of the model.
 * A threshold that has drifted out of the gap should stop the build, not
 * quietly halve the anatomy. */
const MAX_ORPHAN_FRACTION = 0.35
const DRY_RUN = process.argv.includes('--dry-run')

/** Output file per target, and the lobe count each should end up with as a
 * fraction of density-3's. */
const TARGETS = [
  { dir: 'density-1', file: 'density25.glb', ratio: 0.5 },
  { dir: 'density-2', file: 'density50.glb', ratio: 0.75 },
  // density-3 is the baseline and its lobe count is unchanged, but it is
  // rebuilt like the others so the orphan shards come out of it too. It
  // shipped with them.
  { dir: 'density-3', file: 'density75.glb', ratio: 1 },
  { dir: 'density-4', file: 'density100.glb', ratio: 1.5 },
]

/**
 * How far a duplicated lobe is moved ALONG THE DUCT TREE, as a fraction of
 * its own size.
 *
 * A duplicate is not translated freely. Two earlier versions were, and both
 * were wrong in the same way. The first used 6% of the distance to the lobe
 * cloud's centre -- about a twentieth of a lobe -- so copies landed on top
 * of their originals and added no visible density. The second used half a
 * lobe toward the centre, which was visible and produced exactly the defect
 * the whole orphan filter exists to remove: a lobe hanging in the fat with
 * no duct reaching it. The human found them immediately.
 *
 * A duplicate now slides to a different point on the SAME duct, so it is
 * attached by construction -- two lobes on one duct, which is what a denser
 * breast actually looks like. This is how far along, measured from the
 * original's own contact point.
 */
const DUPLICATE_NUDGE = 0.8

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
function rewriteLobes(doc, prim, kept, duplicates) {
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
    for (const t of island.tris) emit(t, { id: i, delta: island.duplicateDelta })
  })

  for (const s of semantics) {
    prim.getAttribute(s).setArray(new Float32Array(outVerts[s]))
  }
  prim.getIndices().setArray(
    outIdx.length > 65535 ? new Uint32Array(outIdx) : new Uint16Array(outIdx),
  )
  return outIdx.length / 3
}

/**
 * A spatial hash over the duct mesh's vertices, with a nearest-point query.
 *
 * Searched shell by shell outward from the query point and stopped as soon
 * as the best hit is closer than the shell being examined, so the common
 * case -- a lobe sitting right on its duct -- costs one bucket lookup.
 */
function ductVertices(doc) {
  const mesh = doc.getRoot().listMeshes().find(m => m.getName().startsWith(DUCTS))
  const prim = mesh?.listPrimitives()[0]
  if (!prim) throw new Error(`No ${DUCTS} mesh in ${SOURCE}`)
  const pos = prim.getAttribute('POSITION').getArray()
  const count = prim.getAttribute('POSITION').getCount()
  // Every 6th vertex. The duct mesh is dense tubing; the planner only needs
  // somewhere plausible to slide to, and the full set makes its O(n*m) scan
  // needlessly slow.
  const out = []
  for (let i = 0; i < count; i += 6) out.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])
  return out
}

function buildDuctIndex(doc) {
  const mesh = doc.getRoot().listMeshes().find(m => m.getName().startsWith(DUCTS))
  const prim = mesh?.listPrimitives()[0]
  if (!prim) throw new Error(`No ${DUCTS} mesh in ${SOURCE}`)
  const pos = prim.getAttribute('POSITION').getArray()
  const count = prim.getAttribute('POSITION').getCount()

  const CELL = 0.004
  const grid = new Map()
  const key = (a, b, c) => `${a},${b},${c}`
  for (let i = 0; i < count; i++) {
    const k = key(
      Math.floor(pos[i * 3] / CELL),
      Math.floor(pos[i * 3 + 1] / CELL),
      Math.floor(pos[i * 3 + 2] / CELL),
    )
    let bucket = grid.get(k)
    if (!bucket) { bucket = []; grid.set(k, bucket) }
    bucket.push(i)
  }

  return function nearest(x, y, z) {
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)
    const cz = Math.floor(z / CELL)
    let best = Infinity
    for (let r = 0; r <= 25; r++) {
      for (let a = cx - r; a <= cx + r; a++) {
        for (let b = cy - r; b <= cy + r; b++) {
          for (let c = cz - r; c <= cz + r; c++) {
            // Shell only: skip the interior, which earlier rings covered.
            if (r > 0 && Math.abs(a - cx) !== r && Math.abs(b - cy) !== r && Math.abs(c - cz) !== r) continue
            for (const i of grid.get(key(a, b, c)) ?? []) {
              const d = Math.hypot(pos[i * 3] - x, pos[i * 3 + 1] - y, pos[i * 3 + 2] - z)
              if (d < best) best = d
            }
          }
        }
      }
      if (best <= r * CELL) return best
    }
    return best
  }
}

/**
 * Drops lobes that no duct reaches -- the "删除不彻底" geometry: fragments
 * left behind when a lobe's duct was deleted in Blender, which then float
 * unattached inside the fat layer.
 *
 * See ORPHAN_DISTANCE for where the threshold comes from. Throws rather than
 * proceeds if it would take an implausible share of the model.
 */
function dropOrphans(islands, prim, nearestDuct) {
  const idx = prim.getIndices().getArray()
  const pos = prim.getAttribute('POSITION').getArray()

  const attached = []
  const orphans = []
  for (const island of islands) {
    let min = Infinity
    outer: for (const t of island.tris) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k] * 3
        const d = nearestDuct(pos[v], pos[v + 1], pos[v + 2])
        if (d < min) min = d
        if (min <= ORPHAN_DISTANCE) break outer
      }
    }
    ;(min <= ORPHAN_DISTANCE ? attached : orphans).push({ ...island, ductDistance: min })
  }

  if (orphans.length / islands.length > MAX_ORPHAN_FRACTION) {
    throw new Error(
      `Orphan filter would drop ${orphans.length} of ${islands.length} lobes, `
      + `over the ${MAX_ORPHAN_FRACTION * 100}% ceiling. ORPHAN_DISTANCE `
      + `(${ORPHAN_DISTANCE}) no longer sits in this model's distribution.`,
    )
  }
  return { attached, orphans }
}


/**
 * Works out where each duplicated lobe goes.
 *
 * A duplicate slides ALONG the duct tree rather than translating freely
 * through the fat, which is what makes it attached by construction. For each
 * lobe: find where it touches a duct, then find another duct vertex roughly
 * `DUPLICATE_NUDGE` lobe-widths away, and translate by the difference. The
 * copy lands on the same duct at a different height -- two lobes on one
 * duct, which is what a denser breast looks like.
 *
 * Returns only the duplicates it could place. A lobe whose duct has no room
 * further along is skipped rather than dropped somewhere invalid, so the
 * final count can come in under target; the caller reports what it got.
 */
function planDuplicates(candidates, prim, ductPoints) {
  const idx = prim.getIndices().getArray()
  const pos = prim.getAttribute('POSITION').getArray()
  const placed = []

  for (const island of candidates) {
    // The lobe's own contact point on the duct tree, and the duct point it
    // touches.
    let best = Infinity
    let contact = null
    let anchor = null
    for (const t of island.tris) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k] * 3
        const p = [pos[v], pos[v + 1], pos[v + 2]]
        for (const q of ductPoints) {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
          if (d < best) { best = d; contact = p; anchor = q }
        }
      }
    }
    if (!contact || !anchor) continue

    // Another point on the tree, about one lobe further along.
    const want = island.size * DUPLICATE_NUDGE
    let target = null
    let closest = Infinity
    for (const q of ductPoints) {
      const d = Math.hypot(q[0] - anchor[0], q[1] - anchor[1], q[2] - anchor[2])
      const err = Math.abs(d - want)
      if (err < closest) { closest = err; target = q }
    }
    if (!target || closest > want) continue

    placed.push({
      ...island,
      duplicateDelta: [0, 1, 2].map(a => target[a] - anchor[a]),
    })
  }
  return placed
}


const baseline = await io.read(SOURCE)
const baseLobes = baseline.getRoot().listMeshes().find(m => m.getName().startsWith(LOBES))
if (!baseLobes) throw new Error(`No ${LOBES} mesh in ${SOURCE}`)
const basePrim = baseLobes.listPrimitives()[0]
const { attached: baseAttached, orphans: baseOrphans } = dropOrphans(
  findIslands(basePrim), basePrim, buildDuctIndex(baseline),
)
console.log(
  `source: ${baseAttached.length + baseOrphans.length} lobe islands, `
  + `${basePrim.getIndices().getCount() / 3} triangles`,
)
for (const o of baseOrphans) {
  console.log(
    `  ORPHAN dropped: ${String(o.tris.length).padStart(5)} tris, `
    + `${o.ductDistance.toFixed(5)} from the nearest duct`,
  )
}
console.log(`baseline after filtering: ${baseAttached.length} lobes\n`)

for (const target of TARGETS) {
  const doc = await io.read(SOURCE)
  const mesh = doc.getRoot().listMeshes().find(m => m.getName().startsWith(LOBES))
  const prim = mesh.listPrimitives()[0]
  // Orphans go first, so every ratio below is a fraction of the REAL lobe
  // count rather than of a count inflated by debris.
  const { attached: islands } = dropOrphans(
    findIslands(prim), prim, buildDuctIndex(doc),
  )

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
    duplicates = planDuplicates(
      evenPicks(islands.length, extra).map(i => islands[i]),
      prim,
      ductVertices(doc),
    )
  }

  const tris = rewriteLobes(doc, prim, kept, duplicates)

  /**
   * Post-condition, and the reason it exists: the previous version of the
   * duplication translated copies through the fat toward the lobe cloud's
   * centre, which detached every one of them from its duct -- manufacturing
   * exactly the defect the orphan filter above removes. Nothing caught it
   * until a human looked at the render. Re-running the same filter over the
   * FINISHED mesh is what would have.
   */
  const { orphans: leftover } = dropOrphans(findIslands(prim), prim, buildDuctIndex(doc))
  if (leftover.length) {
    throw new Error(
      `${target.dir}: ${leftover.length} lobe(s) ended up detached from the duct tree `
      + `(${leftover.map(o => o.ductDistance.toFixed(5)).join(', ')}). A duplicate was placed `
      + 'somewhere no duct reaches.',
    )
  }
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
