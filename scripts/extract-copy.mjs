#!/usr/bin/env node
/**
 * frontend/plugins/data.js  ->  web/content/copy.generated.ts
 *
 * Leaving the medical copy untouched is a hard constraint, so these strings
 * are always generated, never hand-written. Re-run this script whenever
 * data.js changes; the generated file is committed so the diff is reviewable.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractLegacyCopy } from './lib/extract-copy.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const copy = await extractLegacyCopy(join(root, 'frontend', 'plugins', 'data.js'))

function table(name, obj) {
  const rows = Object.entries(obj)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')
  return `export const ${name} = {\n${rows}\n} as const\n`
}

const out = `// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: frontend/plugins/data.js
// Regenerate: node scripts/extract-copy.mjs
//
// These paragraphs are clinical copy and must stay byte-for-byte identical
// to the source. They contain invisible characters (zero-width spaces,
// double spaces) that hand-transcription would silently drop.

${table('anatomyText', copy.leftPanelText)}
${table('mammogramText', copy.middlePanelText)}
${table('mriText', copy.rightPanelText)}
${table('lesionSliceIndex', copy.rightBoundingBoxIndex)}`

const dest = join(root, 'web', 'content', 'copy.generated.ts')
writeFileSync(dest, out, 'utf8')
console.log(`wrote ${dest}`)
console.log(`  anatomy   ${Object.keys(copy.leftPanelText).length} entries`)
console.log(`  mammogram ${Object.keys(copy.middlePanelText).length} entries`)
console.log(`  mri       ${Object.keys(copy.rightPanelText).length} entries`)
