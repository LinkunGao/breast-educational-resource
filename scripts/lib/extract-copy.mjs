import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 从 frontend/plugins/data.js 取出四张表。
 *
 * data.js 的默认导出是一个 Nuxt 2 plugin 函数，直接 import 会连带执行
 * inject()。这里把 `export default` 之前的部分（全是常量声明）切出来，
 * 补一个 export 语句写成临时 .mjs 再动态 import —— 拿到的是 JS 引擎求值
 * 后的真实字符串，零转写风险。
 */
export async function extractLegacyCopy(dataJsPath) {
  const src = readFileSync(dataJsPath, 'utf8')
  const cut = src.indexOf('export default')
  if (cut === -1) {
    throw new Error(`No "export default" found in ${dataJsPath}; file layout changed`)
  }

  const shim = `${src.slice(0, cut)}
export { leftPanelText, middlePanelText, rightPanelText, rightBoundingBoxIndex }
`
  const tmp = join(tmpdir(), `te-uma-copy-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(tmp, shim, 'utf8')
  try {
    // @vite-ignore — this file also runs inside Vitest (via `scripts/lib/extract-copy.mjs`
    // imported straight into web/test/cases.test.ts). Vite's SSR module runner intercepts
    // every dynamic import() in transformed code and tries to resolve it through its own
    // module graph, which does not know about files written straight to the OS tmpdir at
    // runtime; without this comment the import silently fails with "Cannot find module"
    // even though the file is on disk. The comment tells Vite to leave this call alone and
    // fall through to a native dynamic import.
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
