<template>
  <div id="video-div">
    <div
      v-if="showVideo"
      class="video-overlay"
      :class="$breakpoint.mdAndUp ? 'is-absolute' : 'is-fixed'"
    >
      <div>
        <video-player :videoId="currentVideoId" @close-video="closeVideo()" />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  // layout: "empty",
  layout: "default",
  data() {
    return {
      currentVideoId: null,
      showVideo: false,
      overlay: false,
      lastOffset: 0,
      outerWidth: 0,
    };
  },

  methods: {
    closeVideo() {
      this.showVideo = false;
      /* Scroll back to the point where user clicked on video icon - for small devices */
      if (!this.$breakpoint.mdAndUp)
        window.scrollTo({ top: this.lastOffset, behavior: "smooth" });
    },
  },
  mounted() {
    this.currentVideoId = this.$route.params.videoId
      ? this.$route.params.videoId
      : "";
    this.showVideo = true;
    this.lastOffset = process.client ? window.pageYOffset : 0;
  },
  beforeDestroy() {
    this.showVideo = false;
  },
};
</script>

<style scoped>
#video-div {
  width: 100vw;
  height: 100vh;
}

/* Ports <v-overlay color="black" opacity="1">: full-bleed black scrim,
   absolute on desktop and fixed on mobile as the :absolute prop did. */
.video-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #000;
  z-index: 5;
}
.is-absolute {
  position: absolute;
}
.is-fixed {
  position: fixed;
}
</style>
