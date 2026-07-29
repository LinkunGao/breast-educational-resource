import type { CaseGroup, ModalityId } from '~~/content/types'
import type { CopperViewPoint } from './copper-types'

/**
 * Pure functions only. No `three`, no copper3d runtime, no Vue reactivity --
 * everything here operates on plain numbers and `[x, y, z]` tuples so it can
 * be unit-tested with no WebGL and no mocks (Task 9 brief's "先 TDD 纯函数
 *部分").
 *
 * Controller correction C1 (task-9-brief.md): copper3d's shipped bundle
 * (`dist/bundle.umd.js`, resolved via `main`, no `module`/`exports`) inlines
 * its own copy of three's source rather than importing it -- `three` itself
 * is only present in node_modules as copper3d's own hoisted transitive dep,
 * not a declared dependency of this app. `import 'three'` here would load a
 * second, distinct three, and every `instanceof` across the copper3d
 * boundary would then fail. So this file never imports `three`; the
 * quaternion-free spherical interpolation and axis rotation below are
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

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/**
 * 设计文档 §7.1：密度形变只在「Anatomy 模态 + density 分组内切换」时触发。
 * the-breast 借用 density-1 的 GLB，因此与 density 分组同属一个形变族。
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

/** Spherical linear interpolation between two unit vectors. Falls back to a
 * direct pick (not a lerp -- there is no meaningful "in between" direction
 * once two vectors coincide or oppose closely enough that `acos` loses
 * precision) when the angle between them is negligible. */
function slerpUnit(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  const cosTheta = Math.min(1, Math.max(-1, dot(a, b)))
  const theta = Math.acos(cosTheta)
  if (theta < 1e-6) return t < 1 ? a : b
  const sinTheta = Math.sin(theta)
  const wa = Math.sin((1 - t) * theta) / sinTheta
  const wb = Math.sin(t * theta) / sinTheta
  return normalize(add(scale(a, wa), scale(b, wb)))
}

/**
 * Rodrigues' rotation formula: rotates `v` by `angleRad` around `axis`
 * (need not be pre-normalized). This is the pure-numeric replacement for
 * three's `Vector3.applyAxisAngle`, which the original brief's Step 5 code
 * used directly on a `three.Vector3` -- unusable here per C1.
 */
export function rotateAroundAxis(v: Vec3Tuple, axis: Vec3Tuple, angleRad: number): Vec3Tuple {
  const [ax, ay, az] = normalize(axis)
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const d = dot(v, [ax, ay, az])
  const cross: Vec3Tuple = [ay * v[2] - az * v[1], az * v[0] - ax * v[2], ax * v[1] - ay * v[0]]
  return [
    v[0] * cos + cross[0] * sin + ax * d * (1 - cos),
    v[1] * cos + cross[1] * sin + ay * d * (1 - cos),
    v[2] * cos + cross[2] * sin + az * d * (1 - cos),
  ]
}

/**
 * §7.3 modality-flight interpolation. `t` is expected already eased (see
 * `easeInOutCubic`) -- this function has no timing concerns of its own,
 * which is what makes it directly unit-testable without a driver or a
 * clock.
 *
 * The pivot itself lerps from the outgoing look-target to the incoming one
 * (rather than snapping straight to the destination target), and the
 * camera's offset from that pivot is slerped between its two unit
 * directions and lerped in length -- an arc around the subject rather than
 * a straight cut through it, without needing three's Quaternion class.
 * Guaranteed (by construction, not by clamping) to reproduce `from` exactly
 * at t=0 and `to` exactly at t=1.
 */
export function interpolateFlightPose(from: Pose, to: Pose, t: number): Pose {
  const u = Math.min(1, Math.max(0, t))
  const pivot = lerpVec3(from.target, to.target, u)

  const fromOffset = sub(from.position, from.target)
  const toOffset = sub(to.position, to.target)
  const fromLen = length(fromOffset)
  const toLen = length(toOffset)
  const fromDir = fromLen > 1e-9 ? scale(fromOffset, 1 / fromLen) : [0, 0, 1] as Vec3Tuple
  const toDir = toLen > 1e-9 ? scale(toOffset, 1 / toLen) : [0, 0, 1] as Vec3Tuple

  const dir = slerpUnit(fromDir, toDir, u)
  const len = lerpScalar(fromLen, toLen, u)
  const position = add(pivot, scale(dir, len))
  const up = normalize(lerpVec3(from.up, to.up, u))

  return { position, up, target: pivot }
}

/**
 * §7.4 entrance-orbit swing angle. Controller correction C4: `turns` is a
 * SWING AMPLITUDE, not a net rotation -- `sin(t*pi)` goes out and comes
 * back to zero, so the camera always ends exactly on the framed preset
 * view (`t=1` -> angle 0) no matter how large `turns` is. Do not "fix" this
 * into a net rotation; that would end the intro off-preset.
 */
export function orbitSwingAngle(t: number, turns: number): number {
  const u = Math.min(1, Math.max(0, t))
  return Math.sin(u * Math.PI) * turns * Math.PI * 2
}
