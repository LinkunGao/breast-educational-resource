import tailwindcss from '@tailwindcss/vite'
import { publicUrl } from './app/composables/assetUrl'
import { enabledCases } from './content/cases'
import { LEGACY_ROUTES } from './content/legacyRoutes'

// Mirrors @nuxt/schema's own default resolution for `app.baseURL` (it reads
// this same env var with this same fallback). Needed at config-eval time
// because `app.head.link` entries are rendered as literal strings -- Nuxt
// does NOT rewrite them against `app.baseURL` the way it does page assets --
// so the apple-touch-icon link below has to be made subpath-aware by hand,
// same trap `assetBase` documents above.
const appBaseURL = process.env.NUXT_APP_BASE_URL || '/'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-28',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@vite-pwa/nuxt'],

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

  /**
   * Installable app shell (client feedback item 1). The legacy app had this
   * via `@nuxtjs/pwa` (legacy/nuxt.config.js) and the rebuild dropped it
   * along with the icon; the manifest fields below are that config's,
   * verbatim.
   *
   * APP SHELL ONLY. `globIgnores` keeps `modelView/**` out of the precache
   * manifest, and that is load-bearing rather than tidy: those assets total
   * ~355MB, and Chromium refuses to store responses of that size in its
   * HTTP cache at all -- measured on this exact catalogue, see the §9.2
   * correction in pages/[slug]/[[modality]].vue. Listing them would produce
   * a service worker that either fails to install or silently drops them,
   * and would inflate sw.js with thousands of useless entries. The volumes
   * and models go over the network, as they do today.
   *
   * `registerType: 'autoUpdate'` because this is a reference resource with
   * no user state: there is nothing to lose by taking the new version, and
   * a stale shell pinned behind a prompt nobody clicks is worse.
   */
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Breast Educational Resource',
      short_name: 'Breast Education App',
      description: 'An ABI Education App for Breast Cancer.',
      theme_color: '#ffffff',
      background_color: '#FBF7F8',
      display: 'standalone',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: 'maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      globIgnores: ['**/modelView/**', '**/draco/**'],
      // A 5MB ceiling on any single precached file. Belt and braces on top
      // of globIgnores: a future asset added outside modelView/ that is
      // genuinely too large should be skipped, not silently bloat sw.js.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // DO NOT DELETE THIS KEY, even though `undefined` looks like "unset"
      // and therefore redundant. @vite-pwa/nuxt checks presence, not value:
      // `if (!("navigateFallback" in options.workbox)) options.workbox
      // .navigateFallback = nuxt.options.app.baseURL ?? "/"`. Deleting the
      // line removes the key, which re-enables that default; setting it to
      // `undefined` keeps the key (and so the `in` check true) without
      // giving workbox a fallback URL. This was deleted once already as
      // "cargo-culted" and had to be restored -- see the fix commit.
      //
      // With a fallback set, workbox emits a NavigationRoute with no
      // allow/deny list, which intercepts EVERY navigation in scope, not
      // only offline ones -- online included, immediately, because
      // `registerType: 'autoUpdate'` calls `skipWaiting()` +
      // `clientsClaim()`. Every legitimate route here is prerendered by
      // `nuxi generate` and already in the 142-entry precache; the only
      // requests a fallback would catch are typos, stale links and bad
      // slugs, which it would silently serve the cached homepage shell for
      // instead of the real `404.html` the generate step already produces.
      // For a clinical reference, a wrong link should fail visibly, not
      // resolve to the wrong page. See
      // test-browser/production.spec.ts's "no navigation fallback is
      // registered" test, which reads the built sw.js for exactly this.
      navigateFallback: undefined,
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

  nitro: {
    prerender: {
      // Nitro's crawler cannot discover the case pages on its own. It seeds
      // from `/`, and pages/index.vue turns that into a redirect -- under
      // `nuxi generate` a meta-refresh stub, which has no links to follow.
      // Left to itself the build emits nine files (the stub, /about, the
      // legacy redirect stubs, 200/404) and not one case page, so every case
      // URL would 404 on a static host. Seed them explicitly instead, from
      // the same table the pages read, so a case added to content/cases.ts is
      // deployed without touching this file.
      routes: enabledCases().flatMap(c => [
        `/${c.slug}`,
        ...c.modalities.map(m => `/${c.slug}/${m.id}`),
      ]),
    },
  },

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
          /**
           * Inter, replacing Inria Sans.
           *
           * Inria Sans is a handsome face with a lot of personality -- a
           * single-storey `g`, flared stems, wide apertures -- and personality
           * is the thing this particular application should not have. It is a
           * clinical reference read by patients and students, where the type's
           * job is to disappear. Inter is the neutral humanist grotesk that
           * the medical references this is modelled on use, it was drawn for
           * screens at small sizes, and its tabular figures matter here: the
           * slice readout counts up and down under the reader's hand.
           *
           * Weights are 400/500/600/700 -- 500 for the tab strip and 600 for
           * headings, so emphasis does not have to jump straight to bold.
           */
          href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&display=swap',
        },
        {
          rel: 'apple-touch-icon',
          // Absolute-from-root and baseURL-prefixed, not a bare relative
          // filename: case pages are nested (`/te-uma/density-c/anatomy/`),
          // and a relative href resolves against the *document* URL, not
          // the site root, so it would break at that depth.
          href: publicUrl('apple-touch-icon-180x180.png', appBaseURL),
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
