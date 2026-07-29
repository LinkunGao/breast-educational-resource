import tailwindcss from '@tailwindcss/vite'
import { LEGACY_ROUTES } from './content/legacyRoutes'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-28',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  // Nuxt's default component scanning prefixes nested-folder components with
  // the folder name (components/nav/AppHeader.vue -> <NavAppHeader>). Task 5's
  // layout references <AppHeader> and <CaseSidebar> directly, so subfolder
  // components resolve under their own filename instead.
  components: [{ path: '~/components', pathPrefix: false }],

  css: ['~/assets/css/tokens.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    public: {
      // Design doc §9.2: local and GitHub Pages serve same-origin; Vercel can
      // point this at object storage instead.
      //
      // DEPLOYERS: a root-relative value here is resolved against
      // `app.baseURL`, so do NOT include the deployment subpath yourself.
      // On GitHub Pages, `NUXT_APP_BASE_URL=/te-uma/` alone is enough and
      // assets resolve to `/te-uma/modelView/...`. Setting
      // `NUXT_PUBLIC_ASSET_BASE=/te-uma/modelView/` as well would double it
      // to `/te-uma/te-uma/modelView/`. Only override this when the assets
      // live somewhere else entirely, in which case give an absolute URL
      // (e.g. `https://cdn.example/modelView/`), which is used verbatim.
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
      /**
       * The legacy app's own title, verbatim (frontend/nuxt.config.js:22).
       *
       * This replaces "Te Uma — The Breast Educational Platform", which was
       * invented during the rebuild. `Te Uma` is te reo Māori for the breast
       * and is right as the mark in the header, next to the logo -- but a
       * browser tab, a bookmark, a search result and a shared link are all
       * places where a reader who does not speak te reo gets the title and
       * nothing else, and there it says nothing about what the site is. The
       * human's question was exactly that: "你认为把 Te Uma 当做网站的
       * title 合理吗？"
       */
      title: 'Breast Educational Resource',
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
