const themeColors = require("./theme-colors");

module.exports = {
  content: [
    "./components/**/*.{vue,js}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.js",
    "./assets/data/markdown/**/*.md", // rendered via v-html, classes must be scanned
    "./nuxt.config.js",
  ],
  // preflight is on and is now the only reset: Vuetify shipped ress.css,
  // which went away with it.
  theme: {
    // Vuetify's breakpoint values, so templates (md:) and JS (mdAndUp) agree.
    screens: {
      sm: "600px",
      md: "960px",
      lg: "1264px",
      xl: "1904px",
    },
    extend: {
      colors: {
        brand: themeColors,
      },
    },
  },
  plugins: [],
};
