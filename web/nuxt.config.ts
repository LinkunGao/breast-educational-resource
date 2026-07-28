import tailwindcss from '@tailwindcss/vite'
import { LEGACY_ROUTES } from './content/legacyRoutes'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-28',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  css: ['~/assets/css/tokens.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    public: {
      // Design doc §9.2: local and GitHub Pages serve same-origin; Vercel can
      // point this at object storage instead.
      assetBase: '/modelView/',
    },
  },

  // Legacy paths from frontend/nuxt.config.js's generate.routes (design doc
  // §4.5), built from content/legacyRoutes.ts so there is one table instead
  // of two copies drifting apart. `redirect` here emits meta-refresh HTML
  // stubs under `nuxi generate`, so these survive static hosting too.
  routeRules: Object.fromEntries(
    Object.entries(LEGACY_ROUTES).map(([from, to]) => [
      from,
      { redirect: { to, statusCode: 301 } },
    ]),
  ),

  app: {
    head: {
      title: 'Te Uma — The Breast Educational Platform',
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inria+Sans:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap',
        },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Auckland Bioengineering Institute Breast Research App',
        },
      ],
    },
  },

  devServer: {
    host: '0.0.0.0',
    port: 3158,
  },
})
