<template>
  <div ref="base_background" class="app-root select-none p-0 m-0">
    <div class="app-wrap">
      <div class="rightPanel p-0">
        <Nuxt />
      </div>
      <div class="firefox left-outer" ref="leftPanel">
        <div class="row-x flex">
          <div class="p-0 w-full md-full-height">
            <div class="row-x flex flex-col">
              <div ref="panel" class="col-x out-card">
                <div
                  class="card-x p-0 transparent"
                  :class="'panel-height' + multiplier"
                >
                  <left-pane :panel-height="panelHeight" />
                </div>
              </div>
              <div class="col-x hidden md:block fix-it">
                <navigation />
              </div>
            </div>
          </div>
        </div>
        <div class="flex fixed md:hidden left-0 bottom-0">
          <navigation />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "DefaultLayout",

  data: () => {
    return {
      multiplier: 1,
      panelHeight: 0,
      isVideo: true,
    };
  },

  mounted() {
    // this.panelHeight = this.$refs.panel.clientHeight;
    const base_background = this.$refs.base_background;
    const Copper = this.$Copper();

    const updateFullscreen = () => {
      setTimeout(() => {
        this.panelHeight = this.$refs.panel.clientHeight;
      }, 200);
    };
    document.addEventListener("fullscreenchange", () => {
      updateFullscreen();
    });

    document.addEventListener("keydown", (e) => {
      if (e.code === "KeyF") {
        Copper.fullScreenListenner(base_background);
      }
    });
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

/* Ports of the Vuetify rules the removed <v-app>/<v-row>/<v-col>/<v-card>
   used to supply. Kept 1:1 so the layout does not shift.
   .rightPanel's `order: 2` depends on .app-wrap being a flex column. */
.app-root {
  display: flex;
  position: relative;
  background: #121212;
  color: #ffffff;
  font-family: "Helvetica", sans-serif;
  line-height: 1.2;
}

.app-wrap {
  flex: 1 1 auto;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 100%;
  position: relative;
}

.row-x {
  display: flex;
  flex-wrap: wrap;
  flex: 1 1 auto;
}

.col-x {
  flex-basis: 0;
  flex-grow: 1;
  max-width: 100%;
}

.card-x {
  position: relative;
  border: thin solid rgba(255, 255, 255, 0.12);
  border-radius: 0;
}

/* Was `mdAndUp ? 'outer-large' : 'outer-small'`. Decided in CSS now so the
   pre-rendered HTML is correct at first paint on any width. */
.left-outer {
  width: 100vw;

  @media #{map-get($display-breakpoints, "md-and-up")} {
    min-width: 499px;
    width: 30vw;
    position: fixed;
    top: 0;
    left: 0;
  }
}
.firefox {
  z-index: 1;
}
.fix-it {
  position: -webkit-sticky; /* Safari */
  position: sticky;
  bottom: 0;
}

/* multiplier tracks whether the sub-menu is open, which is app state rather
   than viewport width, so it stays in JS. The md gate moves to CSS. */
@media #{map-get($display-breakpoints, "md-and-up")} {
  .panel-height1 {
    height: calc(100vh - 56px);
  }
  .panel-height2 {
    height: calc(100vh - 112px);
  }
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
