<template>
  <div class="navi">
    <div v-if="subMenuActive" class="sub-menu">
      <div class="flex w-full">
        <nuxt-link
          v-for="(subTopic, index) in selectedTopic.subTopics"
          :key="index"
          class="button-default"
          :class="$isSubTopicDisabled(subTopic) ? 'is-disabled' : ''"
          :style="{ color: menuCaption === index ? activeColor : inactiveColor }"
          :to="{ name: 'slug', params: { slug: menuCaption + '-' + index } }"
        >
          <i class="mdi nav-icon" :class="subTopic.icon"></i>
          <span class="nav-label">{{ subTopic.title }}</span>
        </nuxt-link>
      </div>
    </div>

    <div class="flex w-full nav-main">
      <nuxt-link
        v-for="(topic, index) in topics"
        :key="index"
        class="button-default"
        :class="$isTopicDisabled(topic) ? 'is-disabled' : ''"
        :style="{ color: menuCaption === index ? activeColor : inactiveColor }"
        :to="{
          name: 'slug',
          params: { slug: index + '-' + getDefaultSlug(topic) },
        }"
        @click.native="handTopicClick(topic)"
      >
        <i class="mdi nav-icon" :class="topic.icon"></i>
        <span class="nav-label">{{ topic.title }}</span>
      </nuxt-link>

      <nuxt-link
        class="button-default"
        :style="{ color: menuCaption === 'about' ? activeColor : inactiveColor }"
        :to="{ name: 'about' }"
        @click.native="updateAbout()"
      >
        <i class="mdi mdi-account-group nav-icon"></i>
        <span class="nav-label">About</span>
      </nuxt-link>
    </div>
  </div>
</template>

<script>
import themeColors from "~/theme-colors";

export default {
  data: () => {
    return {
      selectedTopic: {},
      topics: {},
      subMenuActive: false,
      inactiveColor: "#ffffff",
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
      // topics.json stores colour names ("subSuccess"), not values; fall back to
      // the raw string so a literal colour still works.
      const name = this.$route.name === "about" ? "secondary" : this.$subTitle();
      return themeColors[name] || name;
    },
    menuCaption() {
      return this.$route.name === "slug" ? this.$parentTopic().slug : "about";
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

/* These three used to be toggled from $breakpoint in the template, which
   made the pre-rendered markup phone-shaped for everyone until JS ran.
   Media queries decide them at first paint instead. */
.sub-menu {
  @media #{map-get($display-breakpoints, "sm-and-down")} {
    position: fixed;
    bottom: 56px;
    width: 100%;
  }
}

.nav-main {
  @media #{map-get($display-breakpoints, "sm-and-down")} {
    position: fixed;
    bottom: 0;
    left: 0;
    z-index: 4;
  }
}

.button-default {
  min-width: 0;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  background: linear-gradient(
    rgba(5, 5, 5, 1),
    rgba(30, 30, 30, 1) 4%,
    rgba(5, 5, 5, 1)
  );
  border-left: 2px rgb(5, 5, 5) solid;
  transition: color 0.2s;

  /* was the `btn-sm` class, toggled from JS */
  flex: 0 0 auto;
  width: 100px;

  @media #{map-get($display-breakpoints, "md-and-up")} {
    flex: 1 1 0%;
    width: auto;
  }
}

.nav-icon {
  font-size: 22px;
  line-height: 1;
}

.nav-label {
  font-size: 12px;
  line-height: 1;
}

.is-disabled {
  pointer-events: none;
  opacity: 0.4;
}
</style>
