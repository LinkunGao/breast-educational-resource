import type { NrrdVolume } from './copper-types'

/**
 * How much to lift an MRI's mid-tones so its tissue is actually readable.
 *
 * ## The complaint, and the two wrong answers
 *
 * copper3d maps a voxel to grey with
 * `(raw - windowLow) * 255 / (windowHigh - windowLow)` and sets that window
 * to the volume's own min/max. On these MRIs the max is a handful of bright
 * outliers, so the tissue sits in the bottom of the range: measured across
 * all nine volumes, the median tissue voxel landed at grey 31-55 of 255.
 * That is the client's "all the images are very dark" -- the window, not the
 * camera.
 *
 * Narrowing that window was tried twice and rejected twice, and the reason
 * is the same both times: ANY linear window bright enough to lift the tissue
 * saturates the top of the range, and on a contrast-enhanced study the
 * lesion IS the top of the range. The client's words were that the tumour
 * and its bounding box had both disappeared -- literally so for the box,
 * which is drawn in white over a lesion the window had just made white.
 *
 * ## What this does instead
 *
 * A gamma curve, `out = 255 * (in / 255) ** exponent`, applied in
 * `installFastSliceRepaint`'s pixel loop. It is monotonic and fixes both
 * ends -- 0 stays 0, 255 stays 255 -- so nothing can clip, no matter how
 * much the middle is lifted. The lesion keeps its separation from the tissue
 * around it and the white box keeps something to sit on.
 *
 * The exponent is per volume, solved so the median tissue voxel lands on
 * `TARGET_GREY`, which is what makes nine volumes with maxima from 246 to
 * 27014 come out looking alike.
 */

/**
 * Where the median tissue voxel should land on the 0-255 greyscale.
 *
 * The nine volumes arrive at 31-55, which the client called too dark. 75 is
 * a deliberately moderate lift: the failures so far were all at the bright
 * end, and unlike a window this costs nothing at the top, so there is no
 * reason to reach further than the complaint requires.
 */
const TARGET_GREY = 75
const BINS = 4096
/**
 * Voxels to sample. The volumes run to 35M voxels and a full pass costs
 * ~100ms; a uniform stride is unbiased for the intensity distribution, and
 * 4M samples put both the threshold and the median far inside one bin.
 */
const MAX_SAMPLES = 4_000_000

/**
 * Otsu's threshold: the bin that best separates the histogram into two
 * classes. Used here to tell air from tissue.
 *
 * A fraction of the range would be simpler and is what an earlier draft
 * used, but the range is the one thing these nine volumes disagree on --
 * their maxima span two orders of magnitude -- so any threshold derived
 * from `max` lands somewhere different in each of them.
 */
function otsuBin(hist: Uint32Array, total: number): number {
  let sum = 0
  for (let b = 0; b < BINS; b++) sum += b * hist[b]!

  let sumBelow = 0
  let countBelow = 0
  let bestVariance = 0
  let threshold = 0
  for (let b = 0; b < BINS; b++) {
    countBelow += hist[b]!
    if (countBelow === 0) continue
    const countAbove = total - countBelow
    if (countAbove === 0) break

    sumBelow += b * hist[b]!
    const meanBelow = sumBelow / countBelow
    const meanAbove = (sum - sumBelow) / countAbove
    const spread = meanBelow - meanAbove
    const variance = countBelow * countAbove * spread * spread
    if (variance > bestVariance) {
      bestVariance = variance
      threshold = b
    }
  }
  return threshold
}

/** The gamma exponent for `volume`, or 1 when it needs no lift or cannot
 *  be measured. */
export function exposureExponent(volume: NrrdVolume): number {
  const { data, min, max } = volume
  if (!data || data.length === 0 || !(max > min)) return 1

  const scale = BINS / (max - min)
  const stride = Math.max(1, Math.floor(data.length / MAX_SAMPLES))
  const hist = new Uint32Array(BINS)
  let sampled = 0
  for (let i = 0; i < data.length; i += stride) {
    let bin = ((data[i]! - min) * scale) | 0
    if (bin >= BINS) bin = BINS - 1
    else if (bin < 0) bin = 0
    hist[bin]!++
    sampled++
  }

  const air = otsuBin(hist, sampled)
  let tissue = 0
  for (let b = air + 1; b < BINS; b++) tissue += hist[b]!
  if (tissue === 0) return 1 // nothing above the split: not an image we can read

  let seen = 0
  let medianBin = air + 1
  for (let b = air + 1; b < BINS; b++) {
    seen += hist[b]!
    if (seen * 2 >= tissue) {
      medianBin = b
      break
    }
  }

  const median = min + (medianBin + 0.5) / scale
  const grey = (median - min) * 255 / (max - min)
  // Already at or past the target: leave it. Only ever brighten -- this
  // exists to answer "too dark", and darkening a volume nobody complained
  // about is not in its remit.
  if (!(grey > 0) || grey >= TARGET_GREY) return 1

  return Math.log(TARGET_GREY / 255) / Math.log(grey / 255)
}
