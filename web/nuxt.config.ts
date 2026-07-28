import tailwindcss from '@tailwindcss/vite'

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
  // §4.5). `redirect` here emits meta-refresh HTML stubs under `nuxi
  // generate`, so these survive static hosting too.
  routeRules: {
    '/model-breast': { redirect: { to: '/case/the-breast', statusCode: 301 } },
    '/density-1': { redirect: { to: '/case/density-a', statusCode: 301 } },
    '/density-2': { redirect: { to: '/case/density-b', statusCode: 301 } },
    '/density-3': { redirect: { to: '/case/density-c', statusCode: 301 } },
    '/density-4': { redirect: { to: '/case/density-d', statusCode: 301 } },
    '/benign-cyst': { redirect: { to: '/case/benign-cyst', statusCode: 301 } },
    '/benign-fibroadenoma': { redirect: { to: '/case/benign-fibroadenoma', statusCode: 301 } },
    '/cancer-dcis': { redirect: { to: '/case/cancer-dcis', statusCode: 301 } },
    '/cancer-lobular': { redirect: { to: '/case/cancer-lobular', statusCode: 301 } },
    '/cancer-ductal': { redirect: { to: '/case/cancer-ductal', statusCode: 301 } },
  },

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
