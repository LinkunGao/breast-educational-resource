import type { CopperScene, SceneObject } from './copper-types'

/** The name the helper is added under, so `evictScene`'s children sweep can
 * find and dispose it like anything else in the scene. */
export const VOLUME_BOUNDS_NAME = 'volume-bounds'

/**
 * Draws the wireframe box around an NRRD volume that the legacy app drew
 * (frontend/components/model/Model.vue:276-282, and the identical block in
 * PanelControls.vue:163-169). It is the only thing that gives a lone axial
 * slice plane any spatial context -- without it the plane floats in an
 * unbounded void and nothing tells the reader how far through the volume
 * they have scrubbed.
 *
 * Reproduces the legacy construction exactly: a `BoxGeometry` at the
 * volume's RAS dimensions, wrapped in a `BoxHelper`. The intermediate mesh
 * exists only because `BoxHelper` derives its lines from an object's
 * bounding box; it is never added to the scene, so its geometry and material
 * are disposed here rather than leaked.
 *
 * ONE deliberate divergence: the legacy passed `0xffffff`, white, which read
 * against its dark viewer. This stage's background is light now (the dark
 * "film" palette was removed at the human's request), where white lines are
 * invisible. The colour below is the design system's own border tone.
 *
 * Uses `three` directly for the same reason `loadGltfModel` does, and under
 * the same version pin -- see that file's header. copper3d's own exported
 * `addBoxHelper` is not used: it defaults to a module-level `cube` this app
 * never populates, and takes the volume's `matrix` rather than its RAS
 * dimensions, which is not the shape the legacy app built.
 */
export async function addVolumeBoundingBox(
  target: CopperScene,
  rasDimensions: number[],
): Promise<void> {
  const [x, y, z] = rasDimensions
  if (!x || !y || !z) return

  const { BoxGeometry, BoxHelper, Mesh, MeshBasicMaterial } = await import('three')

  const geometry = new BoxGeometry(x, y, z)
  const material = new MeshBasicMaterial()
  const cube = new Mesh(geometry, material)
  const box = new BoxHelper(cube, 0x8A7F84)
  box.name = VOLUME_BOUNDS_NAME

  target.scene.add(box as unknown as SceneObject)

  geometry.dispose()
  material.dispose()
}
