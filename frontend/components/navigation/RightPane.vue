<template>
  <div class="w-screen h-screen flex flex-col md:flex-row right-panel">
    <div class="flex-1">
      <model />
    </div>
    <div
      class="flex-1 flex flex-col justify-center items-center md:fixed md:right-0 md:top-0 md:h-full  md:min-w-[499px] md:w-[30vw]"
    >
      <PanelControls />
      <div
        class="hidden md:flex md:fixed md:bottom-0 md:right-0 "
      >
         <logo/>
      </div>
    </div>
  </div>

  <!-- </div> -->
</template>

<script>
import PanelControls from "../model/PanelControls.vue";

export default {
  data() {
    return {};
  },
  mounted() {
    // $nuxt.$emit(
    //   "send-emitter-data",
    //   "data in RightPanel.vue send to Model.vue"
    // );
  },
  computed: {
    mdAndUp() {
      return this.$breakpoint.mdAndUp;
    },
  },
  components: { PanelControls },
};
</script>

<style scoped lang="scss">
.right-panel {
  background: rgb(251,113,133);
  background: linear-gradient(90deg, rgba(251,113,133,1) 0%, rgba(253,164,175,1) 48%, rgba(251,113,133,1) 100%);
}
.logo-mdAndUp {
  width: 50%;
  // height: 100px;
  // display: block;
}
.logo-md {
  display: block;
  height: 10%;
}

</style>
