/**
 * Replaces copper3d's `VolumeSlice.repaint` with an equivalent that does not
 * rebuild the world on every scrub step.
 *
 * ## What the original does, per slice change
 *
 * `slice.index = n` sets `geometryNeedsUpdate`, so the next `repaint()`
 * (bundle.esm.js:60705) runs `updateGeometry()` (:60793) first. That method
 * unconditionally:
 *
 *   - assigns `canvas.width` / `canvas.height` and the same on `canvasBuffer`
 *     -- assigning either RESETS the whole 2D backing store even when the
 *     value is unchanged;
 *   - re-fetches both 2D contexts;
 *   - calls `geometry.dispose()` and builds a `new PlaneGeometry(...)`, i.e.
 *     deletes and recreates GPU buffers, every frame.
 *
 * Then `repaint()` itself calls `ctx.getImageData(...)`, a full canvas
 * read-back that allocates a fresh `Uint8ClampedArray` -- and every one of
 * those pixels is overwritten by the loop immediately below it, so the read
 * is pure waste.
 *
 * For the Z axis -- the only one this app displays -- `planeWidth`,
 * `planeHeight`, `iLength` and `jLength` are the SAME for every slice in a
 * volume. Only `sliceAccess` and `matrix` differ. So all of the above is
 * redundant on every scrub step but the first.
 *
 * ## Why this is worth a monkey-patch
 *
 * Measured in a real browser on `/case/density-a/mri`, dragging the slice
 * plane: 59 long tasks (>50ms) in ~2s, p90 frame time 61ms. The control --
 * the same drag on the anatomy page, which rotates but never repaints --
 * showed ZERO long tasks at the same p50. The cost is `repaint`, it is plain
 * JS, and it is not an artefact of the headless renderer.
 *
 * copper3d exposes no option for any of this and the method is an ordinary
 * prototype method, so replacing it per instance is the available lever.
 *
 * ## Fidelity
 *
 * The pixel loop below is copied from the original, byte for byte in its
 * arithmetic, including the threshold and window-level handling. The ONLY
 * differences are the ones described above: cached `ImageData`, and geometry
 * work skipped while the plane dimensions are unchanged. `label` volumes are
 * handed back to the original implementation -- the original only logs an
 * error for those, and this app ships none, but silently doing something
 * different from upstream on a data type nobody tested is not worth it.
 */

/** copper3d's `VolumeSlice`, as far as this file needs it. Deliberately not
 * exported: nothing else should reach into these internals. */
interface RawSlice {
  axis: string
  index: number
  volume: {
    dataType?: string
    data: ArrayLike<number>
    upperThreshold: number
    lowerThreshold: number
    windowLow: number
    windowHigh: number
    extractPerpendicularPlane: (axis: string, index: number) => {
      sliceAccess: (i: number, j: number) => number
      iLength: number
      jLength: number
      planeWidth: number
      planeHeight: number
      matrix: unknown
    }
  }
  geometryNeedsUpdate: boolean
  sliceAccess: (i: number, j: number) => number
  iLength: number
  jLength: number
  matrix: unknown
  canvas: HTMLCanvasElement
  canvasBuffer: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  ctxBuffer: CanvasRenderingContext2D
  geometry?: { dispose: () => void }
  mesh?: {
    geometry: unknown
    matrix: { identity: () => void }
    applyMatrix4: (m: unknown) => void
    material: { map: { needsUpdate: boolean } }
  }
  repaint: (this: RawSlice) => void
}

const PATCHED = Symbol('fast-repaint')

export async function installFastSliceRepaint(rawSlice: unknown): Promise<void> {
  const slice = rawSlice as RawSlice & { [PATCHED]?: true }
  if (!slice || slice[PATCHED]) return
  if (slice.volume?.dataType === 'label') return

  const { PlaneGeometry } = await import('three')

  const original = slice.repaint
  /** Reused across repaints; re-created only when the plane resizes. */
  let buffer: ImageData | null = null

  slice.repaint = function fastRepaint(this: RawSlice) {
    if (this.volume.dataType === 'label') {
      original.call(this)
      return
    }

    if (this.geometryNeedsUpdate) {
      const e = this.volume.extractPerpendicularPlane(this.axis, this.index)
      const resized = this.iLength !== e.iLength
        || this.jLength !== e.jLength
        || this.canvas.width !== e.planeWidth
        || this.canvas.height !== e.planeHeight

      this.sliceAccess = e.sliceAccess
      this.iLength = e.iLength
      this.jLength = e.jLength
      this.matrix = e.matrix

      if (resized) {
        this.canvas.width = e.planeWidth
        this.canvas.height = e.planeHeight
        this.canvasBuffer.width = e.iLength
        this.canvasBuffer.height = e.jLength
        this.ctx = this.canvas.getContext('2d')!
        this.ctxBuffer = this.canvasBuffer.getContext('2d')!
        this.geometry?.dispose()
        const geometry = new PlaneGeometry(e.planeWidth, e.planeHeight)
        this.geometry = geometry as unknown as RawSlice['geometry']
        if (this.mesh) this.mesh.geometry = geometry
        buffer = null
      }

      // Always: the plane's POSITION along the axis is exactly what changed.
      if (this.mesh) {
        this.mesh.matrix.identity()
        this.mesh.applyMatrix4(this.matrix)
      }
      this.geometryNeedsUpdate = false
    }

    const { iLength, jLength, sliceAccess, volume } = this
    if (!buffer || buffer.width !== iLength || buffer.height !== jLength) {
      // `createImageData` allocates zeroed pixels without reading the canvas
      // back, which is the whole point.
      buffer = this.ctxBuffer.createImageData(iLength, jLength)
    }
    const data = buffer.data
    const volumeData = volume.data
    const { upperThreshold, lowerThreshold, windowLow, windowHigh } = volume
    const scale = 255 / (windowHigh - windowLow)

    let pixelCount = 0
    for (let j = 0; j < jLength; j++) {
      for (let i = 0; i < iLength; i++) {
        const raw = volumeData[sliceAccess(i, j)]!
        const alpha = upperThreshold >= raw ? (lowerThreshold <= raw ? 0xFF : 0) : 0
        let value = Math.floor((raw - windowLow) * scale)
        value = value > 255 ? 255 : (value < 0 ? 0 : value | 0)

        const at = 4 * pixelCount
        data[at] = value
        data[at + 1] = value
        data[at + 2] = value
        data[at + 3] = alpha
        pixelCount++
      }
    }

    this.ctxBuffer.putImageData(buffer, 0, 0)
    this.ctx.drawImage(
      this.canvasBuffer,
      0, 0, iLength, jLength,
      0, 0, this.canvas.width, this.canvas.height,
    )
    if (this.mesh) this.mesh.material.map.needsUpdate = true
  }

  slice[PATCHED] = true
}
