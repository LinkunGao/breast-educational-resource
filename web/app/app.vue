<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * Pins the case page's component instance to the case slug only, not the
 * modality param (review fix #6). Design doc §8.2's whole point --
 * "switch the scene, not the renderer" -- only holds if Vue actually
 * reuses CopperStage (and useCopperStage's single renderer inside it)
 * across a modality change instead of unmounting and remounting it.
 * NuxtPage's default key is derived from the full matched route, which
 * includes the optional `modality` param, so
 * /case/x/anatomy -> /case/x/mri would otherwise tear down and rebuild
 * the renderer on every step -- exactly what this task exists to
 * eliminate, and under Suspense a still-mounting new page can resolve
 * before the old one unmounts, transiently doubling the WebGL context
 * count besides.
 *
 * Keying by slug only is safe specifically because
 * pages/case/[slug]/[[modality]].vue's 404 guard is a `definePageMeta({
 * validate })` route guard, not a setup-time `throw` -- a validate guard
 * re-runs on every navigation regardless of whether the component
 * instance is reused, so navigating to an invalid slug still 404s even
 * though a *valid* slug's instance persists across its own modality
 * steps. Do not replace that guard with a setup-time throw: it would
 * only ever fire once per persisted instance instead of on every
 * navigation.
 *
 * Every other route (there is no other dynamic, multi-param page today)
 * falls back to the route's own full path, matching NuxtPage's default
 * behaviour there.
 */
function pageKey(route: RouteLocationNormalizedLoaded) {
  return typeof route.params.slug === 'string' ? `case-${route.params.slug}` : route.fullPath
}
</script>

<template>
  <NuxtPage :page-key="pageKey" />
</template>
