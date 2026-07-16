import Vue from "vue";

// Values are the single source of truth alongside tailwind.config.js
// theme.screens and assets/sass/_breakpoints.scss — keep all three in sync.
const BREAKPOINTS = { sm: 600, md: 960, lg: 1264, xl: 1904 };

// Reactive singleton. Shape mirrors Vuetify's $vuetify.breakpoint so call
// sites only swap the prefix.
const state = Vue.observable({ width: 0 });

function nameOf(w) {
  if (w < BREAKPOINTS.sm) return "xs";
  if (w < BREAKPOINTS.md) return "sm";
  if (w < BREAKPOINTS.lg) return "md";
  if (w < BREAKPOINTS.xl) return "lg";
  return "xl";
}

const breakpoint = {
  get width() {
    return state.width;
  },
  get name() {
    return nameOf(state.width);
  },
  get xsOnly() {
    return state.width < BREAKPOINTS.sm;
  },
  get smAndDown() {
    return state.width < BREAKPOINTS.md;
  },
  get smAndUp() {
    return state.width >= BREAKPOINTS.sm;
  },
  get mdAndDown() {
    return state.width < BREAKPOINTS.lg;
  },
  get mdAndUp() {
    return state.width >= BREAKPOINTS.md;
  },
  get lgAndUp() {
    return state.width >= BREAKPOINTS.lg;
  },
  get xlOnly() {
    return state.width >= BREAKPOINTS.xl;
  },
};

export default (ctx, inject) => {
  if (process.client) {
    const update = () => {
      state.width = window.innerWidth;
    };
    update();
    window.addEventListener("resize", update, { passive: true });
  }
  inject("breakpoint", breakpoint);
};
