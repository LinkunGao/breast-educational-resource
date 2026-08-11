import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Needed so component tests (test/*.test.ts importing .vue files) can
  // compile SFCs; Tasks 1-4 never mounted a component, so this wasn't
  // required until Task 5's nav/layout tests.
  plugins: [vue()],
  resolve: {
    alias: {
      // Mirror Nuxt's own aliases (~ -> app/, ~~ -> project root) so
      // components authored against those aliases resolve under plain
      // Vitest too, without booting a full Nuxt runtime for unit tests.
      '~~': root,
      '~': resolve(root, 'app'),
    },
  },
  test: {
    environment: 'happy-dom',
    // The suites for the functions this app contributed back to copper3d
    // moved out with them: they live in that repo now and run against
    // copper3d's own harness. What is left here is this app's own code.
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
