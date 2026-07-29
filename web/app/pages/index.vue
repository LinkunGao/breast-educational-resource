<script setup lang="ts">
// 302, not 301: a permanent redirect on the site root would be cached by
// browsers forever, so if `/` ever becomes a real landing page, everyone
// who visited before that change would never see it, with no server-side
// fix available. The ten legacy paths in nuxt.config.ts stay 301 -- those
// really are permanent.
await navigateTo('/the-breast', { redirectCode: 302 })
</script>

<template>
  <div />
</template>
