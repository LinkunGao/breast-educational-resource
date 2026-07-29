import type { InjectionKey, Ref, ShallowRef } from 'vue'

/**
 * The seam between the 3D stage and the control bar (design doc §10.1).
 *
 * Controller correction C13 asked for a deliberate choice of where the bar
 * lives. It lives in `layouts/default.vue`'s `#controls` slot, NOT overlaid
 * on the canvas:
 *
 *  · §10.1's ASCII draws it as a sibling below the stage, and §10.3 spells
 *    the phone order out as `heading -> stepper -> 1:1 stage -> control bar
 *    -> body copy -> prev/next`. An overlay is a different layout, not a
 *    different styling of the same one.
 *  · Task 5 found the tablet content sheet is `fixed bottom-0` with an 80px
 *    peek, and the layout already reserves room for this bar there
 *    (`md:max-xl:pb-20`). An overlaid bar at `inset-x-0 bottom-0` would sit
 *    underneath that sheet at every width between md and xl.
 *  · The phone tier gives the stage an exact 1:1 square; an overlay eats
 *    into the smallest stage in the app, on the tier that can least afford
 *    it.
 *
 * The cost, recorded in the ledger before this task started, is that the
 * slot is a SIBLING of the stage, so `defineExpose` cannot reach it. Hence
 * this: the case page owns the state and provides it, `CopperStage`
 * publishes into it, and `StageControls` is left a plain presentational
 * component driven by props and events (its own tests need no injection at
 * all). No event bus.
 */

/** The stage's imperative surface, published by `CopperStage` once its
 * renderer exists. Null before that -- during SSR, while copper3d's chunk is
 * still downloading, and after the stage unmounts -- so the bar can render
 * its buttons disabled instead of throwing. */
export interface StageActions {
  /** §10.1's "Reset view": back to the modality's own framed preset. */
  reset: () => void
  /** §7.2's "Locate lesion": push in and glide the slice to the lesion. */
  locateLesion: () => void
}

export interface StageControlsContext {
  /** Live slice number; changes every frame during an eased scrub. */
  sliceIndex: Ref<number>
  sliceMax: Ref<number>
  /** Only updated once a scrub or glide comes to rest. This, not
   * `sliceIndex`, is what may be announced (controller correction C11). */
  settledSliceIndex: Ref<number>
  /** True while the stage is showing an imaging modality, which the bar
   * matches with the dark reading-lightbox palette (§5.3). */
  actions: ShallowRef<StageActions | null>
}

const STAGE_CONTROLS: InjectionKey<StageControlsContext> = Symbol('stage-controls')

/** Called by the case page, which is an ancestor of both the `#stage` and
 * `#controls` slot contents however Vue resolves slot ownership -- providing
 * from the layout instead would depend on that resolution. */
export function provideStageControls(): StageControlsContext {
  const context: StageControlsContext = {
    sliceIndex: ref(0),
    sliceMax: ref(0),
    settledSliceIndex: ref(0),
    actions: shallowRef(null),
  }
  provide(STAGE_CONTROLS, context)
  return context
}

/** Returns null rather than throwing when nothing provided a context, so
 * `CopperStage` stays mountable on its own (it is, in tests and in any
 * future page that wants a stage without a control bar). */
export function useStageControls(): StageControlsContext | null {
  return inject(STAGE_CONTROLS, null)
}
