<template>
  <div class="left-pane">
    <div class="sm-logo md:hidden">
      <logo />
    </div>
    <div v-if="$route.name == 'slug'">
      <!-- currentBg  -->
      <div :class="[currentBg, 'panel-slug-fill']">
        <LeftModel />
      </div>
    </div>
    <div v-if="$route.name == 'about'">
      <div class="p-4 bg-secondary panel-about-fill">
        <lazy-about-us />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "LeftPane",

  props: {
    panelHeight: {
      type: Number,
    },
  },

  computed: {
    currentBg() {
      // return this.$category() ? "bg-" + this.$category() : "bg-pink-success";
      return "bg-pink-success";
    },
  },

  watch: {
    // The panel's own size is CSS now. This only forwards the measured pixel
    // height, which LeftModel needs because copper sizes its canvas in px.
    // It used to be emitted from inside a computed, which meant a render
    // side effect firing on every re-evaluation.
    panelHeight: {
      immediate: true,
      handler(height) {
        if (process.client && this.$breakpoint.mdAndUp) {
          this.$nuxt.$emit("panel-height", height);
        }
      },
    },
  },
};
</script>

<!-- Not scoped, will be available at other places. Currently, also used in Panel(.md files) and AboutUs components -->

<style lang="scss" src="@/assets/sass/components/left-panel.scss"></style>
