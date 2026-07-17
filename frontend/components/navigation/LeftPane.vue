<template>
  <div class="left-pane">
    <div class="sm-logo md:hidden">
      <logo />
    </div>
    <div v-if="$route.name == 'slug'">
      <!-- currentBg  -->
      <div :class="currentBg" :style="panelHeightStyle">
        <LeftModel />
      </div>
    </div>
    <div v-if="$route.name == 'about'">
      <div class="p-4 bg-secondary" :style="panelHeightStyle">
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
    panelHeightStyle() {
      if (this.$breakpoint.mdAndUp) {
        this.$nuxt.$emit("panel-height", this.panelHeight);
        return {
          "min-height": this.panelHeight - 2 + "px",
        };
      }else if(this.$route.name === 'about'){
        return { height: "100%" };
      } else return { height: "24rem" };
    },
  },
};
</script>

<!-- Not scoped, will be available at other places. Currently, also used in Panel(.md files) and AboutUs components -->

<style lang="scss" src="@/assets/sass/components/left-panel.scss"></style>
