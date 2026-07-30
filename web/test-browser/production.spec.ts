import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'
import { expect, test } from '@playwright/test'

/**
 * The §12 criteria that can only be measured against what actually ships.
 *
 * The rest of `test-browser/` runs against `yarn dev`, which is right for
 * behaviour and wrong for bytes: Vite serves every dependency unbundled, so
 * `/the-breast` costs 24MB there, 15MB of it copper3d.js and three.module.js
 * in source form. Measuring §12 item 7's 3MB budget against that number
 * would be measuring the dev server, not the app.
 *
 * So this serves `.output/public` -- the real `nuxi generate` artefact, the
 * exact bytes the GitHub Pages workflow publishes -- over a static server
 * modelled on GitHub Pages, measured against the real host on 2026-07-30:
 *
 *   · `Cache-Control: max-age=600` plus an ETag, so caching behaves as it
 *     will in production (`curl -I https://pages.github.com/favicon.ico`).
 *   · gzip for text, which is the difference between passing and failing a
 *     transfer budget: Pages serves `/js/jquery.js` as 33,081 bytes against
 *     93,107 on disk. Without this the §12 item 7 measurement below is
 *     inflated ~2.8x on the JS, which is most of that page's weight.
 *
 * Binary assets (`.wasm`, `.glb`, `.nrrd`, images) are served uncompressed
 * here. Pages may well compress some of them; not modelling that keeps the
 * measured number an UPPER bound, which is the safe side for a budget.
 *
 * SKIPPED when there is no build, rather than failing: `yarn test:browser`
 * has to stay runnable without a 90-second `yarn generate` in front of it.
 * Run `yarn generate` first to include these.
 */

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../.output/public')
const PORT = 3159
const base = `http://localhost:${PORT}`

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
}

/** Text types GitHub Pages gzips. See this file's header for the measurement. */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg'])

function findFile(urlPath: string) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]!)).replace(/^(\.\.[/\\])+/, '')
  for (const candidate of [join(PUBLIC_DIR, clean), join(PUBLIC_DIR, clean, 'index.html')]) {
    try {
      const stat = statSync(candidate)
      if (stat.isFile()) return { path: candidate, stat }
    }
    catch { /* try the next candidate */ }
  }
  return null
}

let server: Server | undefined

test.describe('§12 acceptance, against the generated site', () => {
  test.skip(!existsSync(PUBLIC_DIR), 'no .output/public -- run `yarn generate` first')

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const found = findFile(req.url ?? '/')
      if (!found) {
        res.writeHead(404).end('not found')
        return
      }
      const ext = extname(found.path)
      const etag = `"${found.stat.size.toString(16)}-${found.stat.mtimeMs.toString(16)}"`
      const headers: Record<string, string> = {
        'content-type': TYPES[ext] ?? 'application/octet-stream',
        'etag': etag,
        'last-modified': found.stat.mtime.toUTCString(),
        // What GitHub Pages actually sends, measured against
        // https://pages.github.com on 2026-07-30.
        'cache-control': 'max-age=600',
      }
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers).end()
        return
      }

      const compress = COMPRESSIBLE.has(ext)
        && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
      if (compress) {
        // No content-length: the compressed size is not known until the
        // stream ends, which is also how Pages serves it.
        headers['content-encoding'] = 'gzip'
        res.writeHead(200, headers)
        createReadStream(found.path).pipe(createGzip()).pipe(res)
        return
      }
      headers['content-length'] = String(found.stat.size)
      res.writeHead(200, headers)
      createReadStream(found.path).pipe(res)
    })
    await new Promise<void>(done => server!.listen(PORT, done))
  })

  test.afterAll(async () => {
    await new Promise<void>(done => server?.close(() => done()))
  })

  test('item 7: the-breast first screen transfers under 3MB', async ({ page }) => {
    // Anatomy first, one Draco GLB, zero NRRD -- design doc §9.2's third
    // row, and the entry point every new reader pays for.
    //
    // Counted over CDP, not from `content-length`. A gzipped response has no
    // content-length (the size is not known until the stream ends), and
    // Playwright's `response.body()` hands back the DECODED bytes -- both
    // roads lead to measuring the wrong number. `loadingFinished`'s
    // `encodedDataLength` is what actually crossed the wire.
    const transferred = new Map<string, number>()
    const urlById = new Map<string, string>()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    cdp.on('Network.requestWillBeSent', e => urlById.set(e.requestId, e.request.url))
    cdp.on('Network.loadingFinished', (e) => {
      const url = urlById.get(e.requestId)
      if (url) transferred.set(url, (transferred.get(url) ?? 0) + e.encodedDataLength)
    })

    await page.goto(`${base}/the-breast`)
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
    await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
      .toBeHidden({ timeout: 150_000 })

    const total = [...transferred.values()].reduce((a, b) => a + b, 0)
    console.log(`the-breast first screen (production, gzip): ${(total / 1048576).toFixed(2)} MB`)
    for (const [u, n] of [...transferred.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`   ${(n / 1024).toFixed(0).padStart(6)} KB  ${u.replace(base, '')}`)
    }

    expect(
      [...transferred.keys()].filter(u => u.endsWith('.nrrd')),
      'design doc §9.2: the entry point loads no volume',
    ).toEqual([])
    expect(total, 'design doc §12 item 7: first screen under 3MB').toBeLessThan(3 * 1024 * 1024)
  })

  test('a case page served as a static file boots and renders', async ({ page }) => {
    // The prerendered-HTML path, which nothing else covers. `nuxi generate`
    // emits one file per case and per modality (nuxt.config.ts seeds them
    // from the catalogue because the crawler cannot reach them); this proves
    // one of those files is a working page and not just bytes on disk --
    // which is the failure mode GitHub Pages would ship silently.
    await page.goto(`${base}/density-d/mammogram`)
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
    await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
      .toBeHidden({ timeout: 150_000 })
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /reset/i })).toBeEnabled({ timeout: 60_000 })
  })
})
