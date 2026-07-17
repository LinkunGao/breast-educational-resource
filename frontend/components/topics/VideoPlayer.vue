<template>
  <div>
    <div
      v-if="videoFound"
      class="container-default video-player flexbox --vertical md-full-height"
    >
      <div class="video-player-container">
        <video :src="selectedVideo.link" autoplay controls></video>
      </div>

      <div id="outer-credits">
        <div class="credits flexbox">
          <img src="" class="img-icon" />
          <div class="credit-button flexbox --vertical">
            <div class="annie-liz flexbox hidden sm:block">
              <span>{{ credits1 }} {{ credits2 }}</span>
            </div>
            <div class="button">
              <button class="btn-close bg-secondary" @click="close">
                <span> Click to Close</span>
              </button>
            </div>
          </div>
          <img src="" class="img-icon" />
        </div>
        <div class="pt-2 annie-liz flexbox sm:hidden">
          <span>{{ credits1 }}<br />{{ credits2 }}</span>
        </div>
      </div>
    </div>
    <div v-if="!videoFound" class="error-message">
      <h3>Specified video was not found</h3>
    </div>
  </div>
</template>

<script>
import videosData from "@/assets/data/videos.json";

export default {
  data() {
    return {
      videoFound: false,
      videos: videosData,
      selectedVideo: {},

      credits1: "Movie credits to Annie Jones and Dr. Liz Broadbent,",
      credits2: " University of Auckland",
    };
  },

  props: {
    videoId: {
      type: String,
      required: true,
    },
  },

  methods: {
    refreshVideo: function (currentId) {
      this.videoFound = false;
      if (currentId) {
        this.selectedVideo = this.videos[currentId];
        if (this.selectedVideo) {
          this.videoFound = true;
        }
      }
    },

    close: function () {
      window.history.back();
      this.$emit("close-video");
    },
  },

  watch: {
    videoId: function (currentId) {
      this.refreshVideo(currentId);
    },
  },

  created() {
    this.refreshVideo(this.videoId);
  },
};
</script>

<style
  lang="scss"
  scoped
  src="@/assets/sass/components/video-player.scss"
></style>
