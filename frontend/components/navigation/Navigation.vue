<template>
  <div class="navi">
    <div
      v-if="subMenuActive"
      :class="$breakpoint.smAndDown ? 'sub-menu' : ''"
    >
      <v-bottom-navigation
        grow
        :input-value="subMenuActive"
        :color="activeColor"
      >
        <v-btn
          class="button-default"
          v-for="(subTopic, index) in selectedTopic.subTopics"
          :key="index"
          :disabled="$isSubTopicDisabled(subTopic)"
          :to="{ name: 'slug', params: { slug: menuCaption + '-' + index } }"
        >
          <span>{{ subTopic.title }}</span>
          <v-icon>{{ subTopic.icon }}</v-icon>
        </v-btn>
      </v-bottom-navigation>
    </div>
    <v-bottom-navigation
      grow
      :fixed="$breakpoint.smAndDown ? true : false"
      :color="activeColor"
      v-model="menuCaption"
    >
      <v-btn
        v-for="(topic, index) in topics"
        class="button-default"
        :class="mdAndUp ? '' : 'btn-sm'"
        :key="index"
        :value="index"
        :disabled="$isTopicDisabled(topic)"
        :to="{
          name: 'slug',
          params: { slug: index + '-' + getDefaultSlug(topic) },
        }"
        @click="handTopicClick(topic)"
      >
        <span>{{ topic.title }}</span>
        <v-icon>{{ topic.icon }}</v-icon>
      </v-btn>
      <v-btn
        class="button-default"
        :class="mdAndUp ? '' : 'btn-sm'"
        :to="{ name: 'about' }"
        @click="updateAbout()"
        :value="'about'"
      >
        <span>About</span>
        <v-icon>mdi-account-group</v-icon>
      </v-btn>
    </v-bottom-navigation>
  </div>
</template>

<script>
export default {
  data: () => {
    return {
      selectedTopic: {},
      topics: {},
      subMenuActive: false,
    };
  },
  methods: {
    updateAbout: function () {
      this.subMenuActive = false;
    },
    getDefaultSlug(topic) {
      return topic.subTopics != null ? Object.keys(topic.subTopics)[0] : "";
    },
    handTopicClick(topic) {
      this.selectedTopic = topic;
      if (topic.title !== "Home") {
        this.subMenuActive = true;
      }
    },
  },

  computed: {
    activeColor() {
      return this.$route.name === "about"
        ? this.$vuetify.theme.themes.dark.secondary
        : this.$subTitle();
    },
    menuCaption() {
      return this.$route.name === "slug" ? this.$parentTopic().slug : "about";
    },
    mdAndUp() {
      return this.$breakpoint.mdAndUp;
    },
  },


  watch: {
    selectedTopic: function (currentTopic) {
      this.subMenuActive =
        Object.keys(currentTopic.subTopics).length > 1 ? true : false;
    },
    subMenuActive: function (isActive) {
      $nuxt.$emit("menu-height-changed", isActive ? "2" : "1");
    },
  },

  created() {
    this.topics = this.$getTopics();
    if (this.$route.name === "slug") {
      const parentSlug = this.$parentTopic().slug.toLowerCase();
      this.selectedTopic = this.topics[parentSlug];
    }
  },
};
</script>

<style scoped lang="scss">
.navi {
  position: relative;
  width: 100%;
}

.sub-menu {
  position: fixed;
  bottom: 56px;
  width: 100%;
}

.button-default {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  height: 56px !important;
  background: -webkit-linear-gradient(
    rgba(5, 5, 5, 1),
    rgba(30, 30, 30, 1) 4%,
    rgba(5, 5, 5, 1)
  ); /* For Safari 5.1 to 6.0 */
  background: -o-linear-gradient(
    rgba(5, 5, 5, 1),
    rgba(30, 30, 30, 1) 4%,
    rgba(5, 5, 5, 1)
  ); /* For Opera 11.1 to 12.0 */
  background: -moz-linear-gradient(
    rgba(5, 5, 5, 1),
    rgba(30, 30, 30, 1) 4%,
    rgba(5, 5, 5, 1)
  ); /* For Firefox 3.6 to 15 */
  background: linear-gradient(
    rgba(5, 5, 5, 1),
    rgba(30, 30, 30, 1) 4%,
    rgba(5, 5, 5, 1)
  ); /* Standard syntax */
  border-left: 2px rgb(5, 5, 5) solid;
}
.btn-sm{
  width: 100px !important;
  min-width: 0 !important;
}

</style>
