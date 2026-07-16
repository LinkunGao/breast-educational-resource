<template>
  <v-app ref="base_background" class="select-none p-0 m-0">
    <div v-show="loadApp" class="loading">
      <loading-bar />
    </div>
    <div class="rightPanel pa-0">
      <Nuxt />
    </div>
    <div
      class="firefox"
      :class="mdAndUp ? 'outer-large' : 'outer-small'"
      ref="leftPanel"
    >
      <v-row class="flex" no-gutters>
        <div class="p-0 w-full" :class="mdAndUp ? 'full-height' : ''">
            <v-row class="d-flex flex-column" no-gutters>
              <v-col ref="panel" class="out-card">
                <v-card
                  outlined
                  tile
                  class="p-0 transparent"
                  :class="mdAndUp ? 'panel-height' + multiplier : ''"
                >
                  <left-pane :panel-height="panelHeight" />
                </v-card>
              </v-col>
              <v-col class="d-none d-md-block fix-it">
                <navigation />
              </v-col>
            </v-row>
          </div>
      </v-row>
      <div class="flex fixed md:hidden left-0 bottom-0">
        <navigation />
      </div>
    </div>
  </v-app>
</template>

<script>
export default {
  name: "DefaultLayout",

  data: () => {
    return {
      multiplier: 1,
      panelHeight: 0,
      isVideo: true,
      loadApp: true,
    };
  },

  computed: {
    mdAndUp() {
      // this.loadApp = false;
      return this.$breakpoint.mdAndUp;
    },
  },

  mounted() {
    // this.panelHeight = this.$refs.panel.clientHeight;
    const base_background = this.$refs.base_background.$el;
    const Copper = this.$Copper();

    const updateFullscreen = () => {
      setTimeout(() => {
        this.panelHeight = this.$refs.panel.clientHeight;
      }, 200);
    };
    this.$nuxt.$on("finishLoad", this.onFinishLoad);
    setTimeout(() => {
      this.loadApp = false;
    }, 30000);
    document.addEventListener("fullscreenchange", () => {
      updateFullscreen();
    });

    document.addEventListener("keydown", (e) => {
      if (e.code === "KeyF") {
        Copper.fullScreenListenner(base_background);
      }
    });
  },

  methods: {
    onFinishLoad() {
      this.loadApp = false;
    },
  },

  watch: {
    panelHeight: (height) => {},
  },

  updated() {    
    this.panelHeight = this.$refs.panel.clientHeight;
  },

  created() {
    console.log(
      "%cABI Breast App %cBeta:v1.0.0",
      "padding: 3px;color:white; background:#023047",
      "padding: 3px;color:white; background:#219EBC"
    );
    this.$nuxt.$on("menu-height-changed", (multiplier) => {
      this.multiplier = multiplier;
    });
  },

  beforeDestroy() {
    this.$nuxt.$off("menu-height-changed");
  },
};
</script>

<style scoped lang="scss">

.loading {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  width: 100vw;
  height: 100vh;
  background: black;
  display: flex;
  justify-content: center;
  align-items: center;
}
.outer-large {
  min-width: 499px;
  width: 30vw;
  position: fixed;
  top: 0;
  left: 0;
}
.outer-small {
  width: 100vw;
}
.firefox {
  z-index: 1;
}
.fix-it {
  position: -webkit-sticky; /* Safari */
  position: sticky;
  bottom: 0;
}

.panel-height1 {
  height: calc(100vh - 56px);
}
.panel-height2 {
  height: calc(100vh - 112px);
}
.transparent {
  margin: 0;
  padding: 0;
  opacity: 0.8;
}
.out-card {
  // border-left: 1px solid black;
  margin: 0;
  padding: 0;
  background: linear-gradient(81deg, rgba(254,205,211,0.8) 0%, rgba(253,164,175,0.8) 0%, rgba(251,113,133,0.8) 100%);
}

.rightPanel {
  order: 2;
}

</style>
