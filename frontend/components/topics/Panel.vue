<template>
  <div class="p-2">
    <div class="flexbox demo-head pl-3">
      <div>
        <h1 class="pt-2 main-heading">
          {{ $parentTopic().heading }}
        </h1>
        <h4 class="sub-heading font-black" :style="{ color: subTitleColor }">
          {{ $heading() }}
        </h4>
      </div>
    </div>
    <div
      v-if="fileFound"
      ref="markedDiv"
      class="pt-2 xl:pt-4 marked"
      v-html="markedText"
    ></div>
    <div v-if="!fileFound" class="error-message">
      <span>Data Not Found</span>
    </div>
  </div>
</template>

<script>
import { marked } from "marked";
import LeftModel from "../model/LeftModel.vue";
import themeColors from "~/theme-colors";

export default {
  name: "Panel",

  data() {
    return {
      select: "",
      currentPanel: "",
      fileFound: false,
      items: ["latest", "version 2.0", "version 1.0"],
    };
  },

  methods: {
    play: function (event) {
      // /model-heart#video-div
      const routeStr = this.$nuxt.$route.path;

      const lastChar = routeStr.charAt(routeStr.length - 1);

      if (lastChar === "/") {
        const newstr = routeStr.substr(0, routeStr.length - 1);
        this.$router.push({
          name: "video",
          params: { videoId: event.target.id, originPath: newstr },
        });
      } else {
        this.$router.push({
          name: "video",
          params: { videoId: event.target.id, originPath: routeStr },
        });
      }
    },
    refreshContent: function () {
      const fileName = this.$dataFile();
      try {
        const panelData = require(`@/assets/data/markdown/${fileName}.md`);
        this.fileFound = true;
        this.currentPanel = panelData.default;
      } catch (e) {
        this.fileFound = false;
      }
    },
    addVideoLinks: function () {
      if (this.fileFound) {
        const markedDiv = this.$refs.markedDiv;
        const links = markedDiv.getElementsByTagName("span");
        let i;
        for (i = 0; i < links.length; i++) {
          let element = links[i];

          if (element.getAttribute("data-aed-play") == "aed_img") {
            element.addEventListener("click", () => {
              this.$router.push("/electricity-healthy");
            });
          }
          if (element.getAttribute("data-play") == "video") {
            element.addEventListener("click", this.play);
          }
        }
      }
    },
  },

  computed: {
    markedText() {
      return marked(this.currentPanel);
    },
    // Was `${$subTitle()}--text`, a Vuetify colour class; topics.json stores
    // the name, so resolve it to a value here.
    subTitleColor() {
      const name = this.$subTitle();
      return themeColors[name] || name;
    },
  },

  mounted() {
    this.addVideoLinks();
  },

  created() {
    this.refreshContent();
  },

  updated() {
    this.refreshContent();
    this.addVideoLinks();
  },
};
</script>

<style lang="scss" scoped>
.select {
  width: 127px;
}
.v-input__slot {
  background: #fff;
}
.theme--dark.v-list {
  // v-secondary-base
  background: rgba(34, 155, 34, 1);
}
// .primary--text {
//   // color: var(--v-secondary-base) !important;
//   // caret-color: var(--v-secondary-base) !important;
//   color: #fff;
// }
</style>
