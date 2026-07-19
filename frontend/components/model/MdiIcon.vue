<template>
  <svg
    class="mdi-svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    role="img"
    aria-hidden="true"
  >
    <path :d="path" />
  </svg>
</template>

<script>
import icons from "~/assets/icons";

export default {
  name: "MdiIcon",
  props: {
    // an `mdi-*` name, matching the keys in assets/icons.js
    name: { type: String, required: true },
  },
  computed: {
    path() {
      return icons[this.name] || "";
    },
  },
};
</script>

<style scoped>
/* Sizes like a font glyph would: 1em square, coloured by currentColor, so
   existing `font-size`/`color` on the parent keep working. */
.mdi-svg {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: middle;
}
</style>
