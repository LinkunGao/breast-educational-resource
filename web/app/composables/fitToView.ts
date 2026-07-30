/**
 * How far a perspective camera must sit from an object's centre for the
 * whole object to fit in frame.
 *
 * ## Why this exists
 *
 * The `*_view.json` presets carry a hand-written `eyePosition` and nothing
 * else. `density-1/right/mri_view.json` puts the eye at `[0, 0, 650]`; at
 * a 45-degree vertical field that frames 538 units of height for a volume
 * about 200 units tall, so the content occupies a third of the canvas
 * before anything narrows it. The client reported this as "The image and
 * model views could take up more of the space available - they start of
 * very small", with a screenshot of an MRI filling roughly a quarter of
 * its panel.
 *
 * A fixed distance also cannot survive three-up, where each panel is
 * roughly a third as wide as the single-panel stage it replaced.
 *
 * ## What is NOT computed here
 *
 * Only the distance. The preset's view direction and up vector are kept
 * as authored: they encode which way a reader is meant to look at the
 * data, which is a clinical decision and not this function's business.
 * (The density and lesion MRI presets disagree about the up vector; that
 * is a real pre-existing inconsistency, deliberately left alone -- see
 * the spec's §6.3.)
 *
 * Pure and framework-free so it can be tested without a renderer.
 */

export interface FitBounds {
  width: number
  height: number
  depth: number
}

/** Nothing smaller than this, so a degenerate or not-yet-measured box can
 *  never put the camera at the origin looking at itself. */
const MIN_DISTANCE = 1e-3

/**
 * @param bounds     The object's axis-aligned size, in scene units.
 * @param aspect     Viewport width / height. Zero or non-finite is treated
 *                   as 1 -- a panel mid-collapse measures 0 for a frame,
 *                   and NaN in a camera's projection matrix is unrecoverable.
 * @param fovDeg     The camera's VERTICAL field of view, in degrees.
 * @param margin     Multiplier applied at the end. 1.08 leaves ~8% breathing
 *                   room, which is what stops a tightly-fitted volume from
 *                   touching the panel edges.
 */
export function fitDistance(
  bounds: FitBounds,
  aspect: number,
  fovDeg: number,
  margin = 1.08,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const vHalf = (fovDeg * Math.PI) / 360
  const tanV = Math.tan(vHalf)
  // Horizontal half-angle for this aspect. At aspect < 1 the horizontal
  // field is narrower than the vertical one, which is when width binds.
  const tanH = tanV * safeAspect

  const forHeight = bounds.height / 2 / tanV
  const forWidth = bounds.width / 2 / tanH

  // Half the depth, because the distance above frames the object's centre
  // plane and the near face sits half a depth closer to the camera.
  const distance = (Math.max(forHeight, forWidth) + bounds.depth / 2) * margin
  return Math.max(distance, MIN_DISTANCE)
}
