import type { SceneObject } from './copper-types'

/**
 * Loads a GLB with three's own GLTFLoader instead of copper3d's
 * `scene.loadGltf`, then hands the result to the caller to add to a
 * copper3d scene.
 *
 * ## Why not `scene.loadGltf`
 *
 * copper3d builds its GLTFLoader in `copperGltfLoader`
 * (`dist/bundle.esm.js:77344-77352`) with a DRACO decoder path hardcoded to
 * an external CDN:
 *
 *   `https://unpkg.com/three@0.185.x/examples/js/libs/draco/gltf/`
 *
 * That is a module-level `const`, and neither it, `MANAGER`, nor
 * `copperGltfLoader` is exported, so there is no supported way to change
 * it. Two things are wrong with it. It 404s -- three removed `examples/js/`
 * long ago; the decoder lives under `examples/jsm/` -- so the CORS failure
 * on the 404 is what surfaces in the console. And even if the URL resolved,
 * a teaching resource that has to reach unpkg.com at runtime breaks on any
 * offline, air-gapped or firewalled deployment.
 *
 * Task 3's asset pipeline compresses every GLB with Draco
 * (`scripts/optimize-assets.mjs:154`, `--compress draco`), taking
 * `density25.glb` from 10.18MB to 598KB. Verified with the shipped file:
 * `extensionsRequired: ["EXT_texture_webp", "KHR_draco_mesh_compression"]`.
 * So every anatomy model on this branch REQUIRES a Draco decoder that
 * copper3d cannot be pointed at. The legacy app never hit this because its
 * GLBs are uncompressed.
 *
 * ## Why importing three here is safe
 *
 * copper3d inlines its own copy of three, so two copies now exist. Objects
 * cross that boundary (a group built here is added to a copper3d scene and
 * rendered by copper3d's WebGLRenderer), but three's scene graph and
 * renderer dispatch on `.isMesh` / `.isBufferGeometry` / `.isMaterial`
 * marker properties rather than `instanceof`, precisely so that mixed
 * copies interoperate. The legacy app did exactly this, importing `three`
 * alongside copper3d in `frontend/plugins/copper.js:2`.
 *
 * What makes it safe here specifically is that the versions are identical:
 * `three@0.185.1` is pinned in package.json and is the same build copper3d
 * inlines (its canvas reports `data-engine="three.js r185"`, and yarn
 * resolves our three from copper3d's own dependency). If copper3d ever
 * bundles a different revision, this pin must move with it -- that is the
 * one thing that would make the two copies diverge.
 */

interface GltfResult {
  scene: SceneObject & {
    position: { x: number, y: number, z: number }
  }
}

type Loader = {
  load: (
    url: string,
    onLoad: (gltf: GltfResult) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ) => void
}

let loaderPromise: Promise<{ loader: Loader, centre: (o: GltfResult['scene']) => number }> | null = null

/**
 * Built once and reused. The DRACO decoder spins up a worker and fetches a
 * ~190KB wasm on first use; a fresh loader per model would repeat both.
 *
 * `dracoPath` must already include the deployment's base URL -- on a
 * GitHub Pages subpath deploy the decoder lives at `/te-uma/draco/`, and
 * three joins this path with the file name verbatim, with no base applied.
 */
function getLoader(dracoPath: string) {
  loaderPromise ??= (async () => {
    const [{ GLTFLoader }, { DRACOLoader }, { Box3, Vector3 }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
      import('three'),
    ])

    const draco = new DRACOLoader().setDecoderPath(dracoPath)
    const loader = new GLTFLoader().setCrossOrigin('anonymous').setDRACOLoader(draco)

    /**
     * Recentres the model on the origin and returns its bounding-sphere
     * diameter, reproducing what `copperSceneOnDemond.loadGltf` did
     * (`bundle.esm.js:83645-83651`) before this replaced it. It matters:
     * every view preset in `public/modelView/**` targets `[0,0,0]`, so a
     * model left at its authored offset would be framed off-screen.
     *
     * The camera framing that `loadGltf` also did is deliberately NOT
     * reproduced -- it only ran when `cameraPositionFlag` was unset, and
     * Task 8 applies the modality's own view preset immediately afterwards
     * regardless, which overwrites it.
     */
    function centre(object: GltfResult['scene']) {
      const box = new Box3().setFromObject(object as never)
      const size = box.getSize(new Vector3()).length()
      const center = box.getCenter(new Vector3())
      object.position.x -= center.x
      object.position.y -= center.y
      object.position.z -= center.z
      return size
    }

    return { loader: loader as unknown as Loader, centre }
  })()
  return loaderPromise
}

/**
 * Resolves with the loaded group, already recentred, NOT yet added to any
 * scene -- the caller owns naming, tinting and insertion, exactly as it did
 * when `scene.loadGltf` handed the group back.
 *
 * Unlike copper3d's loader this one DOES report failure: three's
 * `GLTFLoader.load` takes a real `onError`, so a 404, a CORS refusal or a
 * malformed GLB rejects here rather than hanging until a wall-clock
 * timeout. The caller's timeout remains as the stall net.
 */
export async function loadGltfModel(
  url: string,
  dracoPath: string,
): Promise<{ group: SceneObject, size: number }> {
  const { loader, centre } = await getLoader(dracoPath)
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const size = centre(gltf.scene)
        resolve({ group: gltf.scene, size })
      },
      undefined,
      err => reject(err instanceof Error ? err : new Error(`Failed to load ${url}: ${String(err)}`)),
    )
  })
}
