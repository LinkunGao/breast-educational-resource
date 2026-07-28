import { tmpdir } from 'node:os'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
  server: {
    fs: {
      // web/test/cases.test.ts calls extractLegacyCopy(), which writes a shim
      // module to the OS tmpdir and dynamically imports it (see
      // scripts/lib/extract-copy.mjs). Vite's SSR module runner resolves
      // dynamic import() through the same fs.allow boundary used for asset
      // serving, so without this the import fails with "Cannot find module"
      // even though the file exists on disk.
      allow: [tmpdir()],
    },
  },
})
