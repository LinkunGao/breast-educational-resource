import type { CaseGroup, ModalityId } from '~~/content/types'
import type { CopperViewPoint } from './copper-types'

/**
 * Pure functions only. No `three`, no copper3d runtime, no Vue reactivity --
 * everything here operates on plain numbers and `[x, y, z]` tuples so it can
 * be unit-tested with no WebGL and no mocks (Task 9 brief: "TDD the pure
 * functions first").
 *
 * Controller correction C1 (task-9-brief.md): copper3d's shipped bundle
 * (`dist/bundle.umd.js`, resolved via `main`, no `module`/`exports`) inlines
 * its own copy of three's source rather than importing it -- `three` itself
 * is only present in node_modules as copper3d's own hoisted transitive dep,
 * not a declared dependency of this app. `import 'three'` here would load a
 * second, distinct three, and every `instanceof` across the copper3d
 * boundary would then fail. So this file never imports `three`; the
 * quaternion-based orientation interpolation and axis rotation below are
 * hand-rolled over plain numbers instead.
 */

export interface ViewKey {
  group: CaseGroup
  slug: string
  modality: ModalityId
}

export type Transition = 'density-morph' | 'modality-flight' | 'cut'

/** A camera pose as plain numeric tuples -- never a `three.Vector3` (see
 * this file's header). `target` is the look-at point (mirrors copper3d's
 * OrbitControls `target`, not the camera's own position). */
export interface Pose {
  position: [number, number, number]
  up: [number, number, number]
  target: [number, number, number]
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/**
 * Design doc §7.1: the density morph only triggers when switching between
 * density levels while staying on the Anatomy modality. `the-breast`
 * borrows density-1's GLB, so the `overview` group belongs to the same
 * morph family as `density`.
 */
function inDensityFamily(v: ViewKey) {
  return v.group === 'density' || v.group === 'overview'
}

export function chooseTransition(from: ViewKey, to: ViewKey): Transition {
  if (from.slug === to.slug && from.modality === to.modality) return 'cut'

  if (
    from.modality === 'anatomy'
    && to.modality === 'anatomy'
    && inDensityFamily(from)
    && inDensityFamily(to)
  ) {
    return 'density-morph'
  }

  return 'modality-flight'
}

/** Converts copper3d's own view-preset JSON shape into a `Pose`, so a
 * flight's destination can be built from the same data `next.loadView()`
 * (useModalityScene.ts) already applies instantly, without re-deriving it
 * from anything three-shaped. Field names differ (`eyePosition` /
 * `targetPosition` / `upVector` vs `position` / `target` / `up`); the
 * values are carried across verbatim. */
export function viewPointToPose(vp: CopperViewPoint): Pose {
  return {
    position: toTuple(vp.eyePosition),
    up: toTuple(vp.upVector),
    target: toTuple(vp.targetPosition),
  }
}

function toTuple(v: number[]): [number, number, number] {
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0]
}

// ---- plain-tuple vector helpers (no `three`, see header) ----

type Vec3Tuple = [number, number, number]
/** Row-major 3x3 matrix: [m00,m01,m02, m10,m11,m12, m20,m21,m22]. */
type Mat3 = [number, number, number, number, number, number, number, number, number]
/** [w, x, y, z]. */
type Quat = [number, number, number, number]

const IDENTITY_QUAT: Quat = [1, 0, 0, 0]

function sub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v: Vec3Tuple, s: number): Vec3Tuple {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function length(v: Vec3Tuple): number {
  return Math.hypot(v[0], v[1], v[2])
}

/** Falls back to `[0, 0, 1]` for a zero-length input -- there is no
 * meaningful direction to normalize, and a fallback keeps every caller
 * total instead of propagating NaN into a render. */
function normalize(v: Vec3Tuple): Vec3Tuple {
  const len = length(v)
  return len > 1e-9 ? scale(v, 1 / len) : [0, 0, 1]
}

function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [lerpScalar(a[0], b[0], t), lerpScalar(a[1], b[1], t), lerpScalar(a[2], b[2], t)]
}

/**
 * Rodrigues' rotation formula: rotates `v` by `angleRad` around `axis`
 * (need not be pre-normalized). This is the pure-numeric replacement for
 * three's `Vector3.applyAxisAngle`, which the original brief's Step 5 code
 * used directly on a `three.Vector3` -- unusable here per C1. Unlike
 * `slerp`-between-two-vectors (see `interpolateFlightPose`'s history below),
 * this has no degeneracy at any angle, including a half turn: the axis is
 * given, not derived from a dot product between two vectors that might be
 * antiparallel.
 */
export function rotateAroundAxis(v: Vec3Tuple, axis: Vec3Tuple, angleRad: number): Vec3Tuple {
  const [ax, ay, az] = normalize(axis)
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const d = dot(v, [ax, ay, az])
  const axisCross: Vec3Tuple = [ay * v[2] - az * v[1], az * v[0] - ax * v[2], ax * v[1] - ay * v[0]]
  return [
    v[0] * cos + axisCross[0] * sin + ax * d * (1 - cos),
    v[1] * cos + axisCross[1] * sin + ay * d * (1 - cos),
    v[2] * cos + axisCross[2] * sin + az * d * (1 - cos),
  ]
}

/**
 * Picks a unit vector perpendicular to `v` (which need not be unit length
 * itself). Used only when Gram-Schmidt against a camera's `up` produces a
 * near-zero vector -- i.e. `up` is parallel or antiparallel to the view
 * direction, a degenerate but real possibility in hand-authored preset
 * data. Picks whichever world axis is least aligned with `v` so the cross
 * product is always well-conditioned.
 */
function arbitraryPerpendicular(v: Vec3Tuple): Vec3Tuple {
  const nv = normalize(v)
  const axis: Vec3Tuple = Math.abs(nv[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  return normalize(cross(axis, nv))
}

/**
 * Builds a right-handed orthonormal basis (`right`, `up`, `dir`) from a
 * camera's offset-from-target and its (possibly only approximately
 * perpendicular) up vector. `dir` is the unit direction from the look-at
 * point out to the camera. Gram-Schmidt against `dir` guarantees `right`
 * and the returned `up` are exactly orthogonal to it and to each other,
 * even if the source JSON's `up` isn't quite.
 */
function buildBasis(offset: Vec3Tuple, upRaw: Vec3Tuple): { right: Vec3Tuple, up: Vec3Tuple, dir: Vec3Tuple } {
  const dir = normalize(offset)
  const rightRaw = cross(upRaw, dir)
  const right = length(rightRaw) > 1e-6 ? normalize(rightRaw) : arbitraryPerpendicular(dir)
  const up = cross(dir, right)
  return { right, up, dir }
}

function basisToMatrix(right: Vec3Tuple, up: Vec3Tuple, dir: Vec3Tuple): Mat3 {
  // Columns are the basis vectors, expressed in world coordinates.
  return [
    right[0], up[0], dir[0],
    right[1], up[1], dir[1],
    right[2], up[2], dir[2],
  ]
}

function transposeMat3(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
}

function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9) as number[]
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0
      for (let k = 0; k < 3; k++) sum += a[row * 3 + k]! * b[k * 3 + col]!
      r[row * 3 + col] = sum
    }
  }
  return r as Mat3
}

/**
 * Converts an orthonormal rotation matrix to a quaternion using the
 * standard largest-diagonal-term method (Shepperd/Shoemake). Unlike
 * deriving a rotation from a dot product between two vectors (the old
 * `slerpUnit` approach this replaced), this has no ill-conditioned input:
 * every branch's divisor is bounded away from zero for *some* branch,
 * because at least one of `1+trace`, `1+m00-m11-m22`, `1+m11-m00-m22`,
 * `1+m22-m00-m11` is always >= 1 for a valid rotation matrix. This is what
 * makes it safe to use on the exact antipodal cases (a 180-degree roll, or
 * two opposite view directions) that broke the vector-pair approach.
 */
function matrixToQuaternion(m: Mat3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m
  const trace = m00 + m11 + m22

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    return [s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s]
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    return [(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s]
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    return [(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s]
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2
  return [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4]
}

/** Quaternion slerp. Negates `b` when the dot product is negative so the
 * interpolation always takes the shorter path (`q` and `-q` represent the
 * same rotation), and falls back to a normalized lerp when `a`/`b` are
 * nearly identical (where slerp's own division is ill-conditioned, but a
 * lerp is visually indistinguishable from the true result anyway). */
function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  let [bw, bx, by, bz] = b
  const [aw, ax, ay, az] = a
  let cosHalfTheta = aw * bw + ax * bx + ay * by + az * bz

  if (cosHalfTheta < 0) {
    bw = -bw; bx = -bx; by = -by; bz = -bz
    cosHalfTheta = -cosHalfTheta
  }

  if (cosHalfTheta > 1 - 1e-9) {
    const lerped: Quat = [
      lerpScalar(aw, bw, t),
      lerpScalar(ax, bx, t),
      lerpScalar(ay, by, t),
      lerpScalar(az, bz, t),
    ]
    const len = Math.hypot(...lerped) || 1
    return [lerped[0] / len, lerped[1] / len, lerped[2] / len, lerped[3] / len]
  }

  const halfTheta = Math.acos(cosHalfTheta)
  const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta)
  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta
  return [
    aw * ratioA + bw * ratioB,
    ax * ratioA + bx * ratioB,
    ay * ratioA + by * ratioB,
    az * ratioA + bz * ratioB,
  ]
}

/** Rotates a vector by a unit quaternion: `v + 2*qw*(qv x v) + 2*(qv x (qv x v))`. */
function rotateByQuaternion(v: Vec3Tuple, q: Quat): Vec3Tuple {
  const [qw, qx, qy, qz] = q
  const qv: Vec3Tuple = [qx, qy, qz]
  const t2 = scale(cross(qv, v), 2)
  const t3 = cross(qv, t2)
  return [v[0] + qw * t2[0] + t3[0], v[1] + qw * t2[1] + t3[1], v[2] + qw * t2[2] + t3[2]]
}

/**
 * §7.3 modality-flight interpolation. `t` is expected already eased (see
 * `easeInOutCubic`) -- this function has no timing concerns of its own,
 * which is what makes it directly unit-testable without a driver or a
 * clock.
 *
 * The look-at pivot lerps from the outgoing target to the incoming one, and
 * the camera's *orientation* (both its direction from the pivot and its up
 * vector) is carried by a single interpolated rotation built from the two
 * poses' full orthonormal bases, not by lerping/slerping `dir` and `up`
 * independently. This is a correctness fix, not a style choice: this app's
 * real shipped presets include exactly antipodal up vectors on the same
 * view axis. Review round 2, NEW-3: verified on disk for all four density
 * levels -- `density-1/middle/m_view.json` and `density-2/middle/m_view.json`
 * (mammogram) ship `eyePosition: [0,0,2000]`, `upVector: [0,-1,0]`;
 * `density-1/right/mri_view.json` and `density-2/right/mri_view.json` (MRI)
 * ship `eyePosition: [0,0,650]`, `upVector: [0,1,0]` (density-3/density-4's
 * MRI preset uses `[0,0,550]` instead -- the eye distance differs slightly
 * across density levels, but every one of the four ships the same antipodal
 * `up` pair on the same +z view axis, which is the part that actually
 * matters here). A plain `lerp(upFrom, upTo, t)` passes through the zero
 * vector at t=0.5, where `normalize` has no correct answer and falls back to
 * an arbitrary axis parallel to the view direction -- the camera holds
 * upside-down, then snaps 180 degrees in a single frame. Composing the two
 * poses' full bases into a relative rotation matrix and converting that
 * matrix to a quaternion (see `matrixToQuaternion`) has no such degeneracy: a
 * pure-roll case like the one above becomes a perfectly well-defined
 * 180-degree rotation about the shared view axis, so the fix is a smooth
 * roll through the midpoint rather than a snap. The same construction also
 * covers two antipodal camera *positions* about one target (this file's
 * old `slerpUnit` blew up there too, for the same underlying reason: it
 * derived a rotation axis from a dot product between two vectors that can
 * be exactly opposite, rather than from a full, always-invertible basis).
 *
 * Guaranteed (by construction, not by clamping) to reproduce `from.position`
 * exactly at t=0 and `to.position` exactly at t=1, and likewise for `up`
 * WHEN each pose's own `up` is already perpendicular to its own view
 * direction. Review round 2, NEW-4: what the function actually returns at
 * the endpoints is `from.up`/`to.up` Gram-Schmidt-orthogonalised against
 * `from.dir`/`to.dir` (`buildBasis`'s `up`, not the raw input `up`), which
 * only equals the raw input verbatim when it was already exactly
 * perpendicular. Checked every `*_view.json` under `public/modelView`
 * directly (20 files: all 4 density levels' mammogram/MRI pairs, the 8
 * remaining benign/cancer cases' mammogram/MRI/ultrasound presets, and
 * `left_breast_view.json`) -- every one has `up` exactly perpendicular to
 * `eyePosition - targetPosition` (dot product exactly 0), so there is no
 * live divergence today. A future preset with a non-perpendicular `up`
 * would see it silently squared up rather than reproduced verbatim, which
 * is by design (an `up` that leans toward the view axis is not a
 * meaningful camera roll to begin with) but worth knowing if a new preset
 * is ever hand-authored slightly off-perpendicular.
 */
export function interpolateFlightPose(from: Pose, to: Pose, t: number): Pose {
  const u = clamp01(t)
  const pivot = lerpVec3(from.target, to.target, u)

  const fromOffset = sub(from.position, from.target)
  const toOffset = sub(to.position, to.target)
  const fromLen = length(fromOffset)
  const toLen = length(toOffset)
  const len = lerpScalar(fromLen, toLen, u)

  const fromBasis = buildBasis(fromOffset, from.up)
  const toBasis = buildBasis(toOffset, to.up)
  const fromMatrix = basisToMatrix(fromBasis.right, fromBasis.up, fromBasis.dir)
  const toMatrix = basisToMatrix(toBasis.right, toBasis.up, toBasis.dir)
  // The rotation that carries the "from" frame onto the "to" frame: since
  // both matrices are orthonormal, transpose is inverse.
  const relative = multiplyMat3(toMatrix, transposeMat3(fromMatrix))
  const relativeQuat = matrixToQuaternion(relative)
  // The fraction of that rotation completed by progress `u`.
  const stepQuat = slerpQuat(IDENTITY_QUAT, relativeQuat, u)

  const dir = rotateByQuaternion(fromBasis.dir, stepQuat)
  const up = rotateByQuaternion(fromBasis.up, stepQuat)

  const position = add(pivot, scale(dir, len))
  return { position, up: normalize(up), target: pivot }
}

/**
 * §7.4 entrance-orbit swing angle. Controller correction C4: `turns` is a
 * SWING AMPLITUDE, not a net rotation -- `sin(t*pi)` goes out and comes
 * back to zero, so the camera always ends exactly on the framed preset
 * view (`t=1` -> angle 0) no matter how large `turns` is. Do not "fix" this
 * into a net rotation; that would end the intro off-preset.
 */
export function orbitSwingAngle(t: number, turns: number): number {
  const u = clamp01(t)
  return Math.sin(u * Math.PI) * turns * Math.PI * 2
}
