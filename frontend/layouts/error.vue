<template>
  <div class="error-root">
    <div class="show-error p-10">
      <h1 v-if="error.statusCode === 404">
        {{ pageNotFound }}
      </h1>
      <h1 v-else>
        {{ otherError }}
      </h1>
      <span>
        Please visit
        <NuxtLink to="/">Home page</NuxtLink>
      </span>
    </div>
  </div>
</template>

<script>
export default {
  layout: 'empty',
  props: {
    error: {
      type: Object,
      default: null
    }
  },
  data () {
    return {
      pageNotFound: 'Error 404 - Page not found',
      otherError: 'An unexpected error occurred'
    }
  },
  head () {
    const title =
      this.error.statusCode === 404 ? this.pageNotFound : this.otherError
    return {
      title
    }
  }
}
</script>

<style scoped>

/* Ports what <v-app dark> supplied. `secondary` was a Vuetify colour class
   that only resolved under a .v-application ancestor. */
.error-root{
  display:flex;
  min-height:100vh;
  background:#121212;
  color:#ffffff;
  font-family:"Helvetica", sans-serif;
  line-height:1.2;
}
.show-error{
  margin: auto;
  text-align:center;
  width:80%;
  background:#7d1e7d;
}
h1{
  font-size: 1.5rem;
  padding-bottom:4px;
}
</style>
