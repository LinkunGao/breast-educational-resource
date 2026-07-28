import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Pull the four lookup tables out of frontend/plugins/data.js.
 *
 * data.js default-exports a Nuxt 2 plugin function, so importing it directly
 * would also run inject(). Instead, slice off everything before
 * `export default` — all of it constant declarations — append an export
 * statement, write that to a temporary .mjs and dynamically import it. What
 * comes back are the real strings as the JS engine evaluated them, with zero
 * transcription risk.
 *
 * The temporary file goes in web/.tmp-extract-copy/ inside the repo rather
 * than the OS tmpdir: this function also runs under Vitest (web/test/
 * cases.test.ts imports it directly), and Vite's SSR module runner applies
 * the server.fs.allow serving boundary to dynamic import() as well. The OS
 * tmpdir sits outside that boundary and fails with "Cannot find module" even
 * though the file is on disk. Writing inside web/ lands in the default
 * allowed tree, so fs.allow needs no widening.
 */
const SHIM_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', '.tmp-extract-copy')

export async function extractLegacyCopy(dataJsPath) {
  const src = readFileSync(dataJsPath, 'utf8')
  const marker = 'export default'
  const cut = src.indexOf(marker)
  if (cut === -1) {
    throw new Error(`No "export default" found in ${dataJsPath}; file layout changed`)
  }
  if (src.indexOf(marker, cut + 1) !== -1) {
    throw new Error(
      `"${marker}" appears more than once in ${dataJsPath}; refusing to guess which one ends the constant declarations`,
    )
  }

  const shim = `${src.slice(0, cut)}
export { leftPanelText, middlePanelText, rightPanelText, rightBoundingBoxIndex }
`
  mkdirSync(SHIM_DIR, { recursive: true })
  const tmp = join(SHIM_DIR, `te-uma-copy-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(tmp, shim, 'utf8')
  try {
    // @vite-ignore — this file also runs inside Vitest (via `scripts/lib/extract-copy.mjs`
    // imported straight into web/test/cases.test.ts). Vite's import-analysis plugin can't
    // statically resolve a runtime-computed specifier anyway, but the comment makes that
    // explicit and silences its warning.
    const mod = await import(/* @vite-ignore */ pathToFileURL(tmp).href)
    for (const name of ['leftPanelText', 'middlePanelText', 'rightPanelText', 'rightBoundingBoxIndex']) {
      if (!mod[name]) throw new Error(`${name} missing from ${dataJsPath}`)
    }
    return {
      leftPanelText: mod.leftPanelText,
      middlePanelText: mod.middlePanelText,
      rightPanelText: mod.rightPanelText,
      rightBoundingBoxIndex: mod.rightBoundingBoxIndex,
    }
  } finally {
    unlinkSync(tmp)
  }
}
