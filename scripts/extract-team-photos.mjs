/**
 * Cuts the legacy `team.png` composite into one image per person.
 *
 * The old About page was a single 3310x2437 PNG, 4.9MB, holding four partner
 * logos, sixteen headshots and the dataset citations -- all of it baked into
 * pixels. Nothing in it could be read by a screen reader, searched, selected,
 * translated, or corrected without re-exporting the whole sheet, and the
 * citation DOIs in it were not clickable. The rebuilt About page needs the
 * photographs as photographs and everything else as text.
 *
 * ## How the crops are found
 *
 * The sheet is transparent apart from the logos and the photos, and the
 * photos are the only large FULLY opaque rectangles on it. So: find the rows
 * that are opaque across a wide span (the photo strips), then the columns
 * within each strip, then divide each strip by the number of people in it --
 * the headshots inside a strip butt directly against each other with no
 * gutter, so there is no seam to detect and equal division is the only thing
 * that can separate them. Strip bounds are measured, not hardcoded; only the
 * roster is.
 *
 *     node scripts/extract-team-photos.mjs [--dry-run]
 */

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modules = join(root, 'web/node_modules').replaceAll('\\', '/')
const sharp = (await import(`file:///${modules}/sharp/lib/index.js`)).default

const SOURCE = join(root, 'assets-src/images/team.png')
const OUT_DIR = join(root, 'web/public/team')
const DRY_RUN = process.argv.includes('--dry-run')

/** Output size. Displayed at ~96px on the About page; 2x for retina. */
const SIZE = 192

/**
 * The roster, in the sheet's own reading order: top strip left to right, then
 * the next strip down, and so on.
 *
 * Transcribed from a screenshot of the DEPLOYED old site, which is newer than
 * anything that was in this repository -- the names appear nowhere in the
 * legacy source, because on the version we had they were part of the bitmap.
 * They therefore need a human to check spelling and current affiliation.
 */
const STRIPS = [
  { org: 'Breast Cancer Foundation NZ', people: ['Suzanne Bull', 'Natalie James'] },
  { org: 'Iwi United Engaged', people: ['Kika Faagatu', 'Misty Edmonds'] },
  {
    org: 'Auckland Bioengineering Institute',
    people: ['Linkun Gao', 'Jiali Xu', 'Prasad Babarenda Gamage', 'Martyn Nash', 'Poul Nielsen', 'Gonzalo Maso Talou'],
  },
  {
    org: 'Breast Biomechanics Research Group',
    people: ['Chinchien Lin', 'Xinyue Zhong', 'Matthew French', 'John Pan', 'Robin Laven', 'Max Dang Vu'],
  },
]

const slug = name => name.toLowerCase().replace(/[^a-z]+/g, '-')

const image = sharp(SOURCE)
const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info
const opaque = (x, y) => data[(y * width + x) * channels + 3] > 200

/** Longest run of consecutive opaque pixels on a row. A photo strip produces
 * a run hundreds of pixels wide; logo artwork and antialiased text do not. */
function longestRun(y) {
  let best = 0
  let run = 0
  for (let x = 0; x < width; x++) {
    run = opaque(x, y) ? run + 1 : 0
    if (run > best) best = run
  }
  return best
}

const MIN_RUN = 260
const rowIsStrip = []
for (let y = 0; y < height; y++) rowIsStrip[y] = longestRun(y) >= MIN_RUN

/** Contiguous bands of strip rows, ignoring anything too short to be a photo. */
const bands = []
for (let y = 0; y < height; y++) {
  if (!rowIsStrip[y]) continue
  const start = y
  while (y < height && rowIsStrip[y]) y++
  if (y - start >= 120) bands.push({ top: start, bottom: y })
}

/**
 * Photo blocks inside a band.
 *
 * Three passes, and each exists because a simpler version got it wrong:
 *
 *  1. Columns opaque over MOST of the band (0.6, not 0.9). A band's row span
 *     is set by the widest thing in it, so a strip that does not fill the
 *     band's full height has no column that is opaque for 90% of it -- the
 *     six-person ABI strip vanished entirely at the stricter threshold.
 *  2. Tighten each block's top and bottom against its own columns, which
 *     recovers the exact photo bounds the loose band lost.
 *  3. Merge blocks separated by a hairline. Headshots inside a strip butt
 *     together, but not always at exactly zero pixels: 2-3px seams split the
 *     bottom strip into four pieces.
 */
const COLUMN_COVERAGE = 0.6
const MERGE_GAP = 12

function blocksIn(band) {
  const h = band.bottom - band.top
  const solid = []
  for (let x = 0; x < width; x++) {
    let hits = 0
    for (let y = band.top; y < band.bottom; y += 4) if (opaque(x, y)) hits++
    solid[x] = hits / Math.ceil(h / 4) > COLUMN_COVERAGE
  }

  const runs = []
  for (let x = 0; x < width; x++) {
    if (!solid[x]) continue
    const start = x
    while (x < width && solid[x]) x++
    if (x - start >= 100) runs.push({ left: start, right: x })
  }

  // Merge hairline-separated runs before measuring, so a strip is tightened
  // as one rectangle rather than as several with drifting edges. The seams
  // are KEPT: portraits within a strip are not all the same width, so they
  // are the only reliable evidence of where one ends and the next begins.
  const merged = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run.left - last.right <= MERGE_GAP) {
      last.seams.push((last.right + run.left) / 2)
      last.right = run.right
    }
    else { merged.push({ ...run, seams: [] }) }
  }

  return merged.map((run) => {
    const rowSolid = (y) => {
      let hits = 0
      let total = 0
      for (let x = run.left; x < run.right; x += 4) {
        total++
        if (opaque(x, y)) hits++
      }
      return hits / (total || 1) > 0.95
    }
    let top = band.top
    let bottom = band.bottom
    while (top < bottom && !rowSolid(top)) top++
    while (bottom > top && !rowSolid(bottom - 1)) bottom--
    return { ...run, top, bottom }
  })
}

/**
 * Two of the six opaque rectangles on this sheet are artwork, not people:
 * the University of Auckland shield (418x335) and the Breast Biomechanics
 * Research Group's shaded breast mesh (223x239).
 *
 * Every photo strip holds at least two roughly square portraits butted
 * side by side, so it is always at least 1.5x as wide as it is tall --
 * measured: 1.62, 1.63, 4.52, 4.55. Neither piece of artwork is: 1.25 and
 * 0.93. Colour statistics would not have separated them nearly as cleanly;
 * the mesh render is as colourful as a photograph.
 *
 * This assumes no strip is ever a single portrait. True of this sheet, and
 * the roster check below would catch it if a future one differed.
 */
const MIN_STRIP_ASPECT = 1.5

const found = bands
  .flatMap(blocksIn)
  .filter(b => (b.right - b.left) / (b.bottom - b.top) >= MIN_STRIP_ASPECT)
console.log(`${bands.length} band(s), ${found.length} photo block(s):`)
for (const b of found) {
  console.log(`   x ${b.left}..${b.right} (${b.right - b.left}px)  y ${b.top}..${b.bottom} (${b.bottom - b.top}px)`)
}

const expected = STRIPS.length
if (found.length !== expected) {
  throw new Error(
    `Expected ${expected} photo blocks (one per strip in the roster), found ${found.length}. `
    + 'The detector and the roster disagree; do not crop blind.',
  )
}

if (!DRY_RUN) mkdirSync(OUT_DIR, { recursive: true })
const manifest = []

/**
 * Splits a strip into one cell per person.
 *
 * Equal division was the first attempt and it is wrong: the portraits on
 * this sheet are NOT the same width. The bottom strip measures
 * 648 / 299 / 548 / 309 px between its detected seams, so dividing its
 * 1812px by six put every cell boundary in the wrong place and one person
 * ended up half out of frame with a slice of their neighbour beside them.
 *
 * The seams found while merging are real photo edges. Each seam-delimited
 * segment holds a whole number of portraits, so estimating one portrait's
 * width from the narrowest segment and dividing each segment by it recovers
 * the true boundaries. Falls back to equal division only if the seam
 * evidence disagrees with the roster.
 */
function cellsFor(block, count) {
  const edges = [block.left, ...block.seams, block.right]
  const segments = []
  for (let i = 0; i < edges.length - 1; i++) {
    segments.push({ left: edges[i], right: edges[i + 1] })
  }
  const unit = Math.min(...segments.map(s => s.right - s.left))
  const cells = []
  for (const segment of segments) {
    const n = Math.max(1, Math.round((segment.right - segment.left) / unit))
    const w = (segment.right - segment.left) / n
    for (let k = 0; k < n; k++) {
      cells.push({ left: Math.round(segment.left + k * w), width: Math.round(w) })
    }
  }
  if (cells.length !== count) {
    const w = (block.right - block.left) / count
    return Array.from({ length: count }, (_, k) => ({
      left: Math.round(block.left + k * w),
      width: Math.round(w),
    }))
  }
  return cells
}

for (const [i, block] of found.entries()) {
  const strip = STRIPS[i]
  const cells = cellsFor(block, strip.people.length)
  for (const [j, name] of strip.people.entries()) {
    const file = `${slug(name)}.webp`
    manifest.push({ name, org: strip.org, file })
    if (DRY_RUN) continue
    await sharp(SOURCE)
      .extract({
        left: cells[j].left,
        top: block.top,
        width: cells[j].width,
        height: block.bottom - block.top,
      })
      // `attention`, not a fixed anchor. These cells are portrait-shaped, so
      // squaring them discards a band -- and which band depends on where the
      // person is in frame. Anchoring to the top cropped chins off some and
      // the crown off others, and the round mask on the page then ate another
      // ring. sharp's attention strategy keeps the highest-salience region,
      // which on a headshot is the face.
      .resize(SIZE, SIZE, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 82 })
      .toFile(join(OUT_DIR, file))
  }
  console.log(
    `  ${strip.org}: ${cells.length} cells `
    + `[${cells.map(c => c.width).join(', ')}]px`,
  )
}

console.log(`\n${manifest.length} portraits ${DRY_RUN ? 'planned' : `written to web/public/team/`}`)
