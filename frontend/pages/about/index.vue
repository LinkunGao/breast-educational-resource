<template>
  <div :class="mdAndUp ? 'aboutPanel-l' : 'aboutPanel-s'">
    
    <div
      v-if="section == 'team'"
      class="container-default research-page flexbox --vertical"
      :class="$breakpoint.mdAndUp ? 'full-height' : ''"
    >
      <div class="pt-1 heading">
        <h3 class="heading__main">Our Team</h3>
      </div>
      <div class="detail">
        <!-- <img src="~assets/images/headshots.png" /> -->
      </div>
      <div class="detail my-auto p-2 rounded border shadow-md m-2">
        <img src="~assets/images/team.png" />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  layout: "default",
  name: "AboutPage",

  data() {
    return {
      section: "team",
    };
  },
  computed: {
    mdAndUp() {
      return this.$breakpoint.mdAndUp;
    },
  },
  created() {
    // this.$nuxt.$on("about-navigation", (componentName) => {
    //   this.section = "team";
    // });
    // this.$store.commit("setChartLoaded", "");
  },

  beforeDestroy() {
    // this.$nuxt.$off("about-navigation");
  },
};
</script>

<style lang="scss" scoped src="@/assets/sass/pages/about.scss">

</style>
