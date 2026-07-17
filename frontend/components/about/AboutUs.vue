<template>
  <div class="p-2">
    <h1 class="pt-2 main-heading">About Us</h1>
    <div class="about-panel">
      <div class="navigate flexbox --vertical lg:-mt-10">
        <!-- <div
          class="button"
          :class="researchSelected ? 'button --active' : 'button --inactive'"
        >
          <v-btn plain @click="toggleNavigation('research')">
            Our Research
          </v-btn>
        </div> -->
        <div
          class="button"
          :class="teamSelected ? 'button --active' : 'button --inactive'"
        >
          <button class="btn-plain" @click="toggleNavigation('team')">
            Our Team
          </button>
        </div>
      </div>
      <div class="feedback font-medium">
        Visit our
        <a
          href="https://docs.google.com/forms/d/e/1FAIpQLScsab93B7uPg389gxCNfCSgG4sMNIFk_mxDFTFF_-UC2TcSJQ/viewform?usp=sf_link"
          target="view_window"
          >Online form</a
        >
        to give us your valuable feedback about this app.
      </div>

      <div>
        <div class="mx-auto contributor" max-width="344">
          <div class="p-4">
            <!-- <div class="text-h6 text--darken-6">Website Developers</div>
            <div class="text--darken-4 pl-6">Members Here <br /></div> -->
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "AboutUs",

  data() {
    return {
      teamSelected: true,
      researchSelected: false,
      select: "",
      items: ["latest", "version 2.0", "version 1.0"],
    };
  },

  methods: {
    toggleNavigation: function (componentName) {
      this.teamSelected = !this.teamSelected;
      this.researchSelected = !this.researchSelected;
      $nuxt.$emit("about-navigation", componentName);
    },
  },
};
</script>

<style scoped lang="scss">
/* Ports <v-btn plain>: v-btn's 36px/14px/500 uppercase metrics, with
   v-btn--plain's transparent background and 0.62 content opacity. */
.btn-plain {
  height: 36px;
  min-width: 64px;
  padding: 0 16px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.0892857143em;
  text-transform: uppercase;
  opacity: 0.62;
  transition: opacity 0.2s;

  &:hover,
  &:focus-visible {
    opacity: 1;
  }
}

.navigate {
  padding-top: 4rem;
  padding-bottom: 2rem;
  align-items: center;
  row-gap: 1.5rem;

  .button {
    width: 80%;
    max-width: 16rem;
    padding: 1.2rem;
    border-radius: 1.25rem;
    text-align: center;
    span {
      font-size: 1.3rem;
      font-weight: 600;
    }

    &.--active {
      color: white;
      background-color: rgba(150, 30, 150, 0.6);
    }
    &.--inactive {
      color: rgba(175, 175, 175);
      background-color: rgba(255, 255, 255, 0.2);
    }
  }
}
.contributor {
  background-color: rgba(150, 30, 150, 0.3);
}
.about-panel {
  height: 75vh;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.feedback {
  padding: 1rem;
  line-height: 2rem;
  a {
    color: yellow;
  }
}
.select {
  width: 127px;
}
.v-input__slot {
  background: #fff;
}
.theme--dark.v-list {
  // v-secondary-base
  background: rgba(150, 30, 150, 0.5);
}
</style>
