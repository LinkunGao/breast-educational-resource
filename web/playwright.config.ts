import { defineConfig, devices } from '@playwright/test'

/**
 * Browser smoke tests for the 3D core.
 *
 * Every other test in this repo mocks copper3d wholesale, so until this
 * config existed the entire 3D stack -- renderer creation, NRRD and GLB
 * decoding, scene switching, the camera driver -- had never executed once.
 * Its correctness rested entirely on reading `copper3d/dist/bundle.esm.js`.
 * These tests exist to put a real WebGL context and real assets under it.
 *
 * They are deliberately NOT part of `yarn test`: they need a downloaded
 * browser, they start a dev server, and they pull assets up to 31MB, so a
 * unit-test run should not wait on them. Run with `yarn test:browser`.
 */
export default defineConfig({
  testDir: './test-browser',
  // A cold Nuxt dev server plus a 31MB volume decode is far past the 30s
  // default, and CI machines are slower than this one.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:3158',
    // Keeps the failure artefact that matters here: what the stage actually
    // drew, which no assertion message can convey.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Headless Chromium has no GPU, so WebGL falls back to SwiftShader.
          // Without these it reports no WebGL context at all and every test
          // here would fail for a reason that has nothing to do with the app.
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
  ],

  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:3158',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
