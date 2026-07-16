module.exports = {
  content: [
    "./components/**/*.{vue,js}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.js",
    "./assets/data/markdown/**/*.md", // rendered via v-html, classes must be scanned
    "./nuxt.config.js",
  ],
  corePlugins: {
    // Stays off until Vuetify is removed, so the two resets never fight.
    preflight: false,
  },
  theme: {
    // Vuetify's breakpoint values, so templates (md:) and JS (mdAndUp) finally agree.
    screens: {
      sm: "600px",
      md: "960px",
      lg: "1264px",
      xl: "1904px",
    },
  },
  plugins: [],
};
