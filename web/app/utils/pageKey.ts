import { getCase, isMorphFamilyGroup } from '~~/content/cases'

/**
 * The key `<NuxtPage>` uses to decide when the case page -- and with it
 * `CopperStage`, `useCopperStage`, and the one WebGLRenderer -- is reused
 * rather than rebuilt.
 *
 * Extracted from `app.vue` so this rule is testable: it is not cosmetic, it
 * decides which of design doc §7's transitions can physically happen.
 *
 * ## Why the modality is not in the key
 *
 * NuxtPage's default key is derived from the full matched route, including
 * the optional `modality` param, so `/x/anatomy` -> `/x/mri` would
 * tear down and rebuild the renderer on every step of the modality stepper --
 * exactly what design doc §8.2's "switch the scene, not the renderer" exists
 * to eliminate. Under Suspense it would also transiently double the live
 * WebGL context count, since a still-mounting new page can resolve before
 * the old one unmounts.
 *
 * ## Why §7.1's morph family shares ONE key (fix round 1)
 *
 * Every §7.1 trigger is a CASE navigation: `the-breast` and `density-a..d`
 * are five separate cases, stepped through from the sidebar. A crossfade
 * needs the outgoing and incoming models alive in one scene on one
 * renderer, so keying those five by slug destroyed, on exactly the
 * navigation meant to trigger it, the thing the transition needs. §7.1 --
 * "the app's central teaching point" -- could never fire.
 *
 * The cost is that the family shares one scene cache, so imaging scenes
 * accumulate across cases instead of being freed by the page teardown.
 * `useModalityScene` caps that at `MAX_CACHED_SCENES` with an LRU, which
 * pins residency back to the "at most 3 scenes" its own cache comment
 * already assumed. Anatomy-to-anatomy inside the family costs nothing extra
 * either way: a morph loads its model into the EXISTING scene and creates
 * no new one.
 *
 * Lesion cases keep a key of their own. They cannot morph (they have no
 * anatomy modality at all), and they hold this catalogue's largest volumes
 * (`cancer-lobular/right/mri.nrrd` alone is 53MB), so there is nothing to
 * buy and a lot to pay by sharing an instance across them.
 */
export function casePageKey(slug: string | undefined): string | undefined {
  if (typeof slug !== 'string') return undefined
  const current = getCase(slug)
  return current && isMorphFamilyGroup(current.group)
    ? 'case-density-family'
    : `case-${slug}`
}
