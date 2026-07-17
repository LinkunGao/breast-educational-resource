// Single source of truth for the app's theme colours.
// Consumed by tailwind.config.js and by components that need a real colour
// value at runtime (topics.json stores names like "subSuccess", not hexes).
// These values came from the Vuetify dark theme in nuxt.config.js.
module.exports = {
  background: "#f8cdd6",
  secondary: "#7d1e7d",
  warning: "#695e01",
  subWarning: "#dede09",
  error: "#451306",
  subError: "#fc2400",
  success: "#f1a5b5",
  subSuccess: "#eb3175",
};
