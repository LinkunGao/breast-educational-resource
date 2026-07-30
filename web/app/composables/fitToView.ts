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
  /**
   * The box's centre in scene units, relative to the view preset's target.
   *
   * `[0, 0, 0]` for the NRRD volumes -- `RASDimensions` describes a box
   * centred on the origin, which is what every preset targets. A GLB is not
   * centred there, so framing it from the origin puts part of it out of
   * frame; `refitCurrentScene` aims at this instead. Not read by
   * `fitDistance`, which only needs the extents.
   */
  center: [number, number, number]
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
 * @param margin     Multiplier applied at the end, and it is deliberately
 *                   BELOW 1.
 *
 *                   A bounding sphere circumscribes the object: a cube's
 *                   sphere has 1.73x its half-side, so fitting the sphere
 *                   exactly (margin 1) leaves the object itself filling
 *                   well under half the frame. 1.35 and 1.05 were both
 *                   tried against the real panels and both read as too
 *                   small; 0.75 was too large, with the MRI's bounding cage
 *                   pressed right against the panel edges. 0.85 lets the
 *                   sphere overflow enough that the object inside it reads
 *                   at a sensible size while still clearing the edges.
 *
 *                   This is the knob to turn if the panels ever look wrong
 *                   again -- smaller means larger on screen. It is not a
 *                   correctness threshold, and no test pins its value.
 */
export function fitDistance(
  bounds: FitBounds,
  aspect: number,
  fovDeg: number,
  margin = 0.85,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const vHalf = (fovDeg * Math.PI) / 360
  // Horizontal half-angle for this aspect. Below aspect 1 the horizontal
  // field is the narrower of the two, and it is the narrower one that has
  // to contain the object.
  const hHalf = Math.atan(Math.tan(vHalf) * safeAspect)
  const half = Math.min(vHalf, hHalf)

  /**
   * The object's bounding SPHERE, not its box.
   *
   * Fitting the box face plus half its depth framed each object by the
   * dimension that happened to face the camera, so objects of similar
   * overall size ended up wildly different on screen: a mammogram volume
   * is a tall, wide, THIN slab (33 slices), so almost nothing was added
   * for depth and it filled its panel edge to edge, while the MRI's
   * near-cubic volume was pushed far enough back to look half the size
   * beside it. The human saw the result across three panels: "尽量让所有
   * 模型的 size 都差不多一样大，你没发现所有的 mammogram 的图像都很大吗？
   * 大的过分了".
   *
   * A sphere has no orientation, so the framing no longer depends on which
   * face is toward the camera or on how thin the object is. Two objects of
   * comparable overall extent get comparable screen size, which is what
   * makes three panels read as one set. It is also why orbiting can no
   * longer push a corner out of frame.
   */
  const radius = Math.hypot(bounds.width, bounds.height, bounds.depth) / 2

  const distance = (radius / Math.sin(half)) * margin
  return Math.max(distance, MIN_DISTANCE)
}
