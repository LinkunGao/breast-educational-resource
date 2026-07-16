import colors from "vuetify/es5/util/colors";
const serveStatic = require("serve-static");
const path = require("path");

const routerBase =
  process.env.DEPLOY_ENV === "GH_PAGES"
    ? {
        router: {
          base: "/breast-educational-resource/",
        },
      }
    : {
        router: {
          // mode: "hash",
          mode: "history",
          base: "/",
        },
      };

export default {
  // Global page headers: https://go.nuxtjs.dev/config-head
  head: {
    title: "Breast Educational Resource",
    htmlAttrs: {
      lang: "en",
    },
    // link: [
    //   {
    //     rel: "icon",
    //     type: "image/x-icon",
    //     href: "/breast-educational-resource/favicon2.ico",
    //   },
    // ],
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "google-site-verification",
        content: "L6CIHWX38cm1gLthoxa4mWPpp_l6UGCrtyRe5ZNeKB0",
      },
      {
        hid: "description",
        name: "description",
        content: "Auckland Bioengineering Institute Breast Research App",
      },
      { name: "format-detection", content: "telephone=no" },
      {
        name: "keywords",
        content: "Your Key words",
      },
    ],
    script: [
      {
        src: "https://www.googletagmanager.com/gtag/js?id=G-LXD5LJXP2Y",
        async: true,
      },
    ],
  },

  serverMiddleware: [
    // add middlewares
    {
      handler: serveStatic(path.resolve(__dirname, "static"), {
        setHeaders(res, path) {
          if (/\.mp4$/.test(path)) {
            res.setHeader("Content-Type", "video/mp4");
          }
        },
      }),
      prefix: "@/static",
    },
  ],
  server: {
    host: "0.0.0.0", // default: localhost
    port: 3158, // default: 3000
  },

  // Global CSS: https://go.nuxtjs.dev/config-css
  css: [
    "@/assets/sass/global.scss",
    "@/assets/sass/base.scss",
    // Last, so utilities win ties the way the old runtime-injected CDN did.
    "@/assets/css/tailwind.css",
  ],

  // Plugins to run before rendering page: https://go.nuxtjs.dev/config-plugins
  plugins: [
    "@/plugins/breakpoint",
    "@/plugins/topics",
    "@/plugins/current-content",
    "@/plugins/models",
    "@/plugins/data",
    { src: "~/plugins/copper.js", ssr: false },
  ],

  // Auto import components: https://go.nuxtjs.dev/config-components
  components: {
    dirs: [
      "~/components/about",
      "~/components/model",
      "~/components/navigation",
      "~/components/topics",
      "~/components/loading",
    ],
  },

  // Modules for dev and build (recommended): https://go.nuxtjs.dev/config-modules
  buildModules: [
    // https://go.nuxtjs.dev/vuetify
    "@nuxtjs/vuetify",
    "@nuxtjs/pwa"
  ],
  pwa: {
    manifest: {
      name: 'Breast Educational Resource',
      short_name: 'Breast Education App',
      description: 'An ABI Education App for Breast Cancer.',
      theme_color: '#ffffff',
    },

  },

  // Modules: https://go.nuxtjs.dev/config-modules
  modules: ["@nuxtjs/axios"],

  // Vuetify module configuration: https://go.nuxtjs.dev/config-vuetify
  vuetify: {
    customVariables: ["@/assets/sass/variables.scss"],
    treeShake: true,
    theme: {
      options: { customProperties: true },
      dark: true,
      themes: {
        dark: {
          background: "#f8cdd6",
          primary: colors.blue.darken2,
          accent: colors.grey.darken3,
          secondary: "#7d1e7d",
          info: colors.teal.lighten1,
          warning: "#695e01",
          subWarning: "#dede09",
          error: "#451306",
          subError: "#fc2400",
          // left panel color
          success: "#f1a5b5",
          subSuccess: "#eb3175",
        },
      },
    },
  },

  // Build Configuration: https://go.nuxtjs.dev/config-build
  build: {
    postcss: {
      plugins: {
        tailwindcss: {},
        autoprefixer: {},
      },
    },
    extend(config) {
      config.module.rules.push({
        test: /\.md$/i,
        use: "raw-loader",
      });
    },
    loaders: {
      sass: {
        implementation: require("sass"),
      },
      scss: {
        implementation: require("sass"),
      },
    },
  },

  target: "static",

  ...routerBase,
  generate: {
    dir: "build",
    routes: [
      // Modify these routes, when you config your routes for app
      "/model-breast",
      "/density-1",
      "/density-2",
      "/density-3",
      "/density-4",
      "/benign-cyst",
      "/benign-fibroadenoma",
      "/cancer-dcis",
      "/cancer-lobular",
      "/cancer-ductal",
    ],
  },
};
