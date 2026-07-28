import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * 从 frontend/plugins/data.js 取出四张表。
 *
 * data.js 的默认导出是一个 Nuxt 2 plugin 函数，直接 import 会连带执行
 * inject()。这里把 `export default` 之前的部分（全是常量声明）切出来，
 * 补一个 export 语句写成临时 .mjs 再动态 import —— 拿到的是 JS 引擎求值
 * 后的真实字符串，零转写风险。
 *
 * 临时文件写在仓库内的 web/.tmp-extract-copy/（而不是 OS tmpdir）：这个
 * 函数也在 Vitest 里跑（web/test/cases.test.ts 直接 import 它），而 Vite 的
 * SSR 模块运行时对动态 import() 也套用 server.fs.allow 的服务边界 ——
 * OS tmpdir 在这个边界之外，会报 "Cannot find module"，哪怕文件确实存在。
 * 写到 web/ 内部就落在默认允许的目录树里，不需要放宽 fs.allow。
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
