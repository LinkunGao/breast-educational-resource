<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * Decides when the case page's component instance -- and the single
 * WebGLRenderer inside it -- is reused rather than rebuilt. The rule itself
 * lives in `app/utils/pageKey.ts`, where it is documented and unit-tested;
 * it is not cosmetic, it decides which of design doc §7's transitions can
 * physically happen.
 *
 * Whatever that rule returns is safe specifically because
 * pages/[slug]/[[modality]].vue's 404 guard is a `definePageMeta({
 * validate })` route guard, not a setup-time `throw` -- a validate guard
 * re-runs on every navigation regardless of whether the component instance
 * is reused, so navigating to an invalid slug still 404s even though a
 * *valid* slug's instance persists across its own modality steps (and now,
 * across the density family). Do not replace that guard with a setup-time
 * throw: it would only ever fire once per persisted instance instead of on
 * every navigation.
 *
 * Every non-case route falls back to `route.path`, which is what NuxtPage
 * derives its default key from -- the matched path with params
 * interpolated. `fullPath` would include the query string, so `/about` and
 * `/about?x=1` would be different keys and remount where the default does
 * not.
 */
function pageKey(route: RouteLocationNormalizedLoaded) {
  return casePageKey(route.params.slug as string | undefined) ?? route.path
}
</script>

<template>
  <NuxtPage :page-key="pageKey" />
</template>
