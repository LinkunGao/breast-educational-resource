# Three-Up Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show anatomy, mammogram and MRI side by side when the stage column is wide enough, fall back to today's one-at-a-time stepper when it is not, restore the anatomy panel to the five lesion cases, stop re-downloading volumes on every case navigation, and make the rendered content fill the canvas it is given.

**Architecture:** A "panel slot" layer goes into the content model, mirroring the `left/ middle/ right/` structure the assets already have. Each of the three slots gets its own `CopperStage` instance — three WebGL contexts, as the legacy app had — all of them mounted at all times, with CSS deciding which are visible and the host element's own size deciding which have loaded. A container query on the stage column, not a viewport breakpoint, picks three-up versus one-up, so collapsing the side panels can promote the layout. Scene residency moves from a count of three to a shared byte budget so the three stages survive every case navigation.

**Tech Stack:** Nuxt 4.5, Vue 3.5, TypeScript, Tailwind 4 (container queries), Pinia 4, copper3d 3.7.3, three 0.185.1, Vitest 4 + happy-dom, Playwright 1.62.

**Spec:** [`docs/superpowers/specs/2026-07-30-client-feedback-round-1-design.md`](../specs/2026-07-30-client-feedback-round-1-design.md) §4–§7.

**Sibling plan:** [`2026-07-30-chrome-and-pwa.md`](./2026-07-30-chrome-and-pwa.md) covers client items 1, 3, 8, 9, 10.

**PREREQUISITE, not a suggestion:** the sibling plan's **Task 2 (Remove BI-RADS) must land before Task 1 below.** Both rewrite `densityCase()` and `lesionCase()` in `web/content/cases.ts`, and the code in Task 1 is written against the post-BI-RADS signatures — `densityCase` with six parameters and no `biRads`, `lesionCase` with no `referenceDensity`. Running Task 1 first means either resolving the conflict by hand or writing back a field the client asked to remove. Everything else in the sibling plan is independent and may land at any time.

## Global Constraints

- **Medical copy is never edited.** Strings in `web/content/copy.generated.ts` contain zero-width spaces and double spaces. Never retype or reflow one. The anatomy text this plan adds to the five lesion cases already exists in `anatomyText`; reference it, never transcribe it.
- **CSS decides layout.** No breakpoint pixel literals in JavaScript. Where JS must know the tier, probe what CSS already decided (`getComputedStyle`, `ResizeObserver`), the way `CaseSidebar.vue` already does.
- **Comments in English.**
- **`shallowRef`, never `ref`, for anything transitively holding NRRD voxel data.** `useModalityScene.ts` documents why: Vue 3's proxy traps on a typed array cost ~29% of CPU during a scrub.
- Tailwind breakpoints: `md` = 768px, `xl` = 1280px. The three-up threshold is a **container** query at 1000px, unrelated to those.
- Unit tests: plain Vitest, no Nuxt runtime. New auto-imports used by components under test must be stubbed in `web/test/setup.ts` or the test throws `ReferenceError`.
- Run from `web/`: `yarn test` (unit), `yarn test:browser` (Playwright).
- Commit after every task. Branch is `rebuild/foundation`; do not push unless asked.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `web/content/types.ts` | Modify — add `PanelId`, `Panel`, `Case.panels` | 1 |
| `web/content/cases.ts` | Modify — build cases from panels; anatomy for lesion cases | 1 |
| `web/test/cases.test.ts` | Modify — panel shape, derived `modalities`, lesion anatomy | 1 |
| `web/app/composables/sceneBudget.ts` | Create — shared byte-budget LRU across the three stages | 2 |
| `web/test/sceneBudget.test.ts` | Create | 2 |
| `web/app/composables/useModalityScene.ts` | Modify — delegate residency to the budget | 2 |
| `web/app/utils/pageKey.ts` | Modify — one page instance for every case | 2 |
| `web/test/pageKey.test.ts` | Modify | 2 |
| `web/app/composables/fitToView.ts` | Create — bounds → camera distance, pure | 3 |
| `web/test/fitToView.test.ts` | Create | 3 |
| `web/app/composables/useModalityScene.ts` | Modify — apply the fit after `loadView` | 3 |
| `web/app/components/stage/CopperStage.client.vue` | Modify — own its control bar; load only when sized | 4 |
| `web/app/components/stage/StageControls.vue` | Modify — per-panel fullscreen target, compact mode | 4 |
| `web/app/composables/useStageControls.ts` | Delete — the slot seam it bridges no longer exists | 4 |
| `web/app/components/stage/CasePanels.vue` | Create — the three slots, three-up or one-up | 5 |
| `web/app/components/stage/PanelTabs.vue` | Create — one-up slot tabs + the 3D/2D variant control | 5 |
| `web/app/pages/[slug]/[[modality]].vue` | Modify — render `CasePanels`, drop the controls slot | 5 |
| `web/app/layouts/default.vue` | Modify — container context, drop `#controls`/`#stepper` | 5 |
| `web/test/CasePanels.test.ts`, `web/test/PanelTabs.test.ts` | Create | 5 |
| `web/test-browser/three-up.spec.ts` | Create — the acceptance evidence | 6 |

---

### Task 1: Panel slots, and anatomy for the five lesion cases

**Files:**
- Modify: `web/content/types.ts`
- Modify: `web/content/cases.ts`
- Test: `web/test/cases.test.ts`

**Interfaces:**
- Produces:
  - `type PanelId = 'anatomy' | 'mammogram' | 'mri'`
  - `interface Panel { id: PanelId; label: string; modalities: Modality[] }`
  - `Case.panels: Panel[]` — the source of truth
  - `Case.modalities: Modality[]` — still a real array field, flattened from `panels` at construction
  - `getPanel(c: Case, id: PanelId): Panel | undefined`
  - `panelIdOf(c: Case, modalityId: ModalityId): PanelId | undefined`

**Background.** `public/modelView/<case>/{left,middle,right}/` and the legacy app's `leftPanelText` / `middlePanelText` / `rightPanelText` (see `legacy/data.js`) are the same three slots. `middle/` holds both `m3d.nrrd` and `u2d.nrrd`, which is exactly the client's "有的页面可能有 2d 和 3d 的 mammogram，他们是不用展开的，是需要切换的，默认先显示 3d 的".

Client item 2 falls out of the same change: the five lesion cases get an anatomy slot pointing at `density-3/left/density75.glb`, the model the client named. Their anatomy copy already exists in `anatomyText` under `benign_cyst`, `benign_fibroadenoma`, `cancer_dcis`, `cancer_lobular`, `cancer_ductal` — the legacy app's left panel showed exactly these. Nothing is written by hand.

`Case.modalities` stays a real field rather than becoming a helper, so `nuxt.config.ts`'s prerender seed, the `/:slug/:modality` route and `content/legacyRoutes.ts` need no change at all. A test asserts the two stay in step.

- [ ] **Step 1: Write the failing tests**

In `web/test/cases.test.ts`:

Replace the `modality sequences match the asset audit (design doc §4.3)` block's `expected` table with:

```ts
  const expected: Record<string, ModalityId[]> = {
    'the-breast': ['anatomy', 'mammogram', 'mri'],
    'density-a': ['anatomy', 'mammogram', 'mri'],
    'density-b': ['anatomy', 'mammogram', 'mri'],
    'density-c': ['anatomy', 'mammogram', 'mri'],
    'density-d': ['anatomy', 'mammogram', 'mri'],
    // The five lesion cases gained an anatomy modality (client feedback
    // item 2): they borrow density-3's model, which is what the client
    // asked for, and their anatomy copy has existed in anatomyText since
    // the extraction -- the legacy app's left panel showed it.
    'benign-cyst': ['anatomy', 'mammogram', 'ultrasound', 'mri'],
    'benign-fibroadenoma': ['anatomy', 'mammogram', 'mri'],
    'cancer-dcis': ['anatomy', 'mammogram', 'mri'],
    'cancer-lobular': ['anatomy', 'mammogram', 'mri'],
    'cancer-ductal': ['anatomy', 'mammogram', 'mri'],
  }
```

**Delete** the `no benign or cancer case claims an anatomy modality` block entirely (it asserts the exact thing the client asked to be reversed).

Change the `getModality returns undefined for a modality the case lacks` test to a modality that is still genuinely absent:

```ts
  it('getModality returns undefined for a modality the case lacks', () => {
    expect(getModality('cancer-dcis', 'ultrasound')).toBeUndefined()
  })
```

Add a new block at the end of the file:

```ts
/**
 * Client feedback item 6's foundation. The slots mirror the asset layout
 * (`left/ middle/ right/`) and the legacy app's three text tables. Only
 * the middle slot ever holds two modalities, and only for benign-cyst --
 * the one case with a `u2d.nrrd`.
 */
describe('panel slots', () => {
  it('every enabled case has exactly the three slots, in order', () => {
    for (const c of enabledCases()) {
      expect(c.panels.map(p => p.id)).toEqual(['anatomy', 'mammogram', 'mri'])
    }
  })

  it('modalities is exactly panels flattened -- the two must never drift', () => {
    for (const c of cases) {
      expect(c.modalities).toEqual(c.panels.flatMap(p => p.modalities))
    }
  })

  it('every slot holds at least one modality', () => {
    for (const c of enabledCases()) {
      for (const p of c.panels) {
        expect(p.modalities.length).toBeGreaterThan(0)
      }
    }
  })

  it('only benign-cyst has a two-modality slot, and it is the middle one', () => {
    for (const c of enabledCases()) {
      const multi = c.panels.filter(p => p.modalities.length > 1)
      if (c.slug === 'benign-cyst') {
        expect(multi.map(p => p.id)).toEqual(['mammogram'])
      }
      else {
        expect(multi).toEqual([])
      }
    }
  })

  it('the 3D modality is the default variant of the mammogram slot', () => {
    const middle = getPanel(getCase('benign-cyst')!, 'mammogram')!
    expect(middle.modalities.map(m => m.id)).toEqual(['mammogram', 'ultrasound'])
    expect(middle.modalities[0]!.label).toBe('3D Mammogram')
  })

  it('panelIdOf maps every modality back to the slot that holds it', () => {
    for (const c of enabledCases()) {
      for (const p of c.panels) {
        for (const m of p.modalities) {
          expect(panelIdOf(c, m.id)).toBe(p.id)
        }
      }
    }
  })

  it('panelIdOf returns undefined for a modality the case does not have', () => {
    expect(panelIdOf(getCase('cancer-dcis')!, 'ultrasound')).toBeUndefined()
  })
})

/** Client feedback item 2, stated as its own contract. */
describe('the lesion cases borrow density-3\'s anatomy model', () => {
  const lesionSlugs = [
    'benign-cyst', 'benign-fibroadenoma', 'cancer-dcis', 'cancer-lobular', 'cancer-ductal',
  ]

  for (const slug of lesionSlugs) {
    it(`${slug} has an anatomy modality pointing at density75.glb`, () => {
      const anatomy = getModality(slug, 'anatomy')
      expect(anatomy).toBeDefined()
      expect(anatomy!.asset).toBe('density-3/left/density75.glb')
      expect(anatomy!.viewPreset).toBe('left_breast_view.json')
    })
  }

  it('all five point at the same asset, so the file is shipped once', () => {
    const assets = new Set(lesionSlugs.map(s => getModality(s, 'anatomy')!.asset))
    expect(assets.size).toBe(1)
  })
})
```

Update the imports at the top of `cases.test.ts`:

```ts
import { cases, enabledCases, getCase, getModality, getPanel, isMorphFamilyGroup, lesionSliceIndexFor, panelIdOf } from '../content/cases'
```

The pre-existing `every modality carries the right paragraph, byte for byte` block needs no change: its `MODALITY_TO_TABLE` already maps `anatomy -> leftPanelText`, so the five new anatomy modalities are automatically checked against the legacy source. That is the guard that the copy was referenced rather than retyped.

- [ ] **Step 2: Run the tests and confirm they fail**

Run from `web/`:

```
yarn vitest run test/cases.test.ts
```

Expected: import error on `getPanel`/`panelIdOf` (not exported), plus failures on the five lesion sequences and on `c.panels` being undefined.

- [ ] **Step 3: Add the types**

In `web/content/types.ts`, after `ModalityId`:

```ts
/**
 * A viewing slot, not an imaging technique.
 *
 * These are the legacy app's left/middle/right panels, which is also how
 * the assets are laid out on disk (`public/modelView/<case>/{left,middle,
 * right}/`) and how the copy tables are keyed (`leftPanelText` and friends
 * in legacy/data.js). A slot can hold more than one modality: the middle
 * slot of `benign-cyst` holds both the 3D mammogram and the 2D ultrasound,
 * which the reader switches between rather than seeing side by side.
 */
export type PanelId = 'anatomy' | 'mammogram' | 'mri'

export interface Panel {
  id: PanelId
  /** Slot label. Navigation text, not medical copy, so it may be adjusted. */
  label: string
  /** One or two. `[0]` is the default variant, always the 3D one. */
  modalities: Modality[]
}
```

and in `interface Case`, add `panels` above `modalities` with this doc:

```ts
  /**
   * The three viewing slots, always in `anatomy, mammogram, mri` order.
   * SOURCE OF TRUTH. `modalities` below is this, flattened.
   */
  panels: Panel[]
  /**
   * Every modality across every slot, flattened at construction time.
   *
   * Kept as a real field rather than a derived helper on purpose: it is
   * what `nuxt.config.ts`'s prerender seed, the `/:slug/:modality` route
   * and `content/legacyRoutes.ts` all read, and none of them should have
   * to know that slots exist. `cases.test.ts` asserts the two stay equal.
   */
  modalities: Modality[]
```

- [ ] **Step 4: Rebuild the catalogue from slots**

In `web/content/cases.ts`, replace the two builder functions and add the helpers:

```ts
/** The anatomy model every case without one of its own borrows. The client
 *  named it: "复用 density-3/left/density75.glb". */
const SHARED_ANATOMY_GLB = 'density-3/left/density75.glb'
/** One preset for every anatomy slot -- there is only one in the catalogue. */
const ANATOMY_VIEW_PRESET = 'left_breast_view.json'

/** Build a slot. */
function panel(id: PanelId, label: string, modalities: Modality[]): Panel {
  return { id, label, modalities }
}

/**
 * Flattens `panels` into `modalities` so the two can never be written
 * separately and drift. Every case literal below goes through this.
 */
function buildCase(c: Omit<Case, 'modalities'>): Case {
  return { ...c, modalities: c.panels.flatMap(p => p.modalities) }
}

/** Shared builder for the density series: three slots, one directory layout. */
function densityCase(
  slug: string,
  dir: string,
  glb: string,
  title: string,
  heading: string,
  legacyKey: keyof typeof anatomyText,
): Case {
  return buildCase({
    slug,
    group: 'density',
    title,
    heading,
    panels: [
      panel('anatomy', 'Anatomy', [
        modality('anatomy', 'Anatomy', `${dir}/left/${glb}`, ANATOMY_VIEW_PRESET, anatomyText[legacyKey]),
      ]),
      panel('mammogram', 'Mammogram', [
        modality('mammogram', '3D Mammogram', `${dir}/middle/m3d.nrrd`, `${dir}/middle/m_view.json`, mammogramText[legacyKey]),
      ]),
      panel('mri', 'MRI', [
        modality('mri', '3D MRI', `${dir}/right/mri.nrrd`, `${dir}/right/mri_view.json`, mriText[legacyKey]),
      ]),
    ],
  })
}

/**
 * benign/cancer series.
 *
 * These now carry an anatomy slot (client feedback item 2: "The anatomy
 * section is missing from a few of the sections"). They have no GLB of
 * their own, so all five borrow density-3's -- the model the client
 * specified. Their anatomy copy is NOT new: `anatomyText` has carried
 * these five keys since the extraction, because the legacy app's left
 * panel displayed exactly this text on exactly these pages.
 */
function lesionCase(
  slug: string,
  group: 'benign' | 'cancer',
  dir: string,
  title: string,
  heading: string,
  lesionSliceIndex: number,
  legacyKey: keyof typeof mammogramText,
  withUltrasound = false,
): Case {
  const middle: Modality[] = [
    modality('mammogram', '3D Mammogram', `${dir}/middle/m3d.nrrd`, `${dir}/middle/m_view.json`, mammogramText[legacyKey]),
  ]
  if (withUltrasound) {
    // Second variant of the SAME slot, not a slot of its own: the reader
    // switches between them, 3D first. Only benign-cyst has a u2d.nrrd
    // (design doc §3.1's md5 audit).
    middle.push(
      modality('ultrasound', '2D Ultrasound', `${dir}/middle/u2d.nrrd`, `${dir}/middle/u_view.json`, mammogramText[legacyKey]),
    )
  }
  return buildCase({
    slug,
    group,
    title,
    heading,
    lesionSliceIndex,
    panels: [
      panel('anatomy', 'Anatomy', [
        modality('anatomy', 'Anatomy', SHARED_ANATOMY_GLB, ANATOMY_VIEW_PRESET, anatomyText[legacyKey]),
      ]),
      panel('mammogram', 'Mammogram', middle),
      panel('mri', 'MRI', [
        modality('mri', '3D MRI', `${dir}/right/mri.nrrd`, `${dir}/right/mri_view.json`, mriText[legacyKey]),
      ]),
    ],
  })
}
```

Update the imports on line 2 to include the new types:

```ts
import type { Case, CaseGroup, Modality, ModalityId, Panel, PanelId } from './types'
```

Rewrite the `the-breast` and `benign-calcifications` literals to go through `buildCase`:

```ts
  buildCase({
    slug: 'the-breast',
    group: 'overview',
    title: 'The Breast',
    heading: 'The Breast',
    // Has no assets of its own; borrows density-1 throughout (design doc §4.4)
    panels: [
      panel('anatomy', 'Anatomy', [
        modality('anatomy', 'Anatomy', 'density-1/left/density25.glb', ANATOMY_VIEW_PRESET, anatomyText.normal),
      ]),
      panel('mammogram', 'Mammogram', [
        modality('mammogram', '3D Mammogram', 'density-1/middle/m3d.nrrd', 'density-1/middle/m_view.json', mammogramText.normal),
      ]),
      panel('mri', 'MRI', [
        modality('mri', '3D MRI', 'density-1/right/mri.nrrd', 'density-1/right/mri_view.json', mriText.normal),
      ]),
    ],
  }),
```

and, at the end of the array:

```ts
  buildCase({
    // Copy and lesion index are both present, but there are no imaging
    // assets at all (design doc §4.4). Kept so the copy is not lost;
    // generates no route and no nav entry.
    slug: 'benign-calcifications',
    group: 'benign',
    title: 'Calcifications',
    heading: 'Calcifications',
    lesionSliceIndex: 0,
    disabled: true,
    panels: [],
  }),
```

Also update the header comment's third bullet, which is now false:

```ts
//   · GLBs exist only for density-1..4 -> every other case borrows one
//     (the five lesion cases all borrow density-3's, client feedback item 2)
```

Add the two lookup helpers next to `getModality`:

```ts
/** The slot with this id, if the case has it. */
export function getPanel(c: Case, id: PanelId): Panel | undefined {
  return c.panels.find(p => p.id === id)
}

/**
 * Which slot holds `modalityId`, or undefined if this case has no such
 * modality. The URL carries a modality; the layout reasons in slots, and
 * this is the one place that translates.
 */
export function panelIdOf(c: Case, modalityId: ModalityId): PanelId | undefined {
  return c.panels.find(p => p.modalities.some(m => m.id === modalityId))?.id
}
```

- [ ] **Step 5: Run the unit tests**

Run from `web/`:

```
yarn test
```

Expected: PASS. The copy-fidelity block now also checks the five new anatomy paragraphs against `legacy/data.js`'s `leftPanelText`; if any of those fail, the wrong `legacyKey` was passed and the wrong medical text is on a page — fix the key, never the text.

- [ ] **Step 6: Confirm the new routes prerender**

Run from `web/`:

```
yarn generate
```

Then:

```
node -e "const fs=require('fs');for(const s of ['benign-cyst','benign-fibroadenoma','cancer-dcis','cancer-lobular','cancer-ductal']){console.log(s, fs.existsSync('.output/public/'+s+'/anatomy/index.html'))}"
```

Expected: `true` for all five. These are the routes `nuxt.config.ts`'s prerender seed picked up from the flattened `modalities` — confirmation that leaving `modalities` a real field was enough.

- [ ] **Step 7: Look at it**

Run `yarn dev` and open `http://localhost:3158/cancer-dcis`. The modality stepper now shows an `Anatomy` step first, and it loads density-3's model with the case's own anatomy paragraph beside it.

- [ ] **Step 8: Commit**

```bash
git add web/content/types.ts web/content/cases.ts web/test/cases.test.ts
git commit -m "feat(content): panel slots, and anatomy for the five lesion cases

Client feedback item 2, and the foundation for item 6. The three slots
mirror the asset layout (left/middle/right) and the legacy app's three
copy tables; only benign-cyst's middle slot holds two modalities, with
3D first.

The lesion cases borrow density-3's GLB, as the client specified. Their
anatomy copy is not new -- anatomyText has carried those five keys since
the extraction, because the legacy left panel showed exactly them.

modalities stays a real field, flattened from panels at construction, so
the prerender seed, the route and the legacy redirect table are all
untouched. A test asserts the two never drift.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: One resident renderer set, and a byte budget

**Files:**
- Create: `web/app/composables/sceneBudget.ts`
- Create: `web/test/sceneBudget.test.ts`
- Modify: `web/app/composables/useModalityScene.ts`
- Modify: `web/app/utils/pageKey.ts`
- Test: `web/test/pageKey.test.ts`, `web/test/useModalityScene.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `createSceneBudget(limitBytes: number): SceneBudget`
  - `getSceneBudget(): SceneBudget` — the process-wide instance the three stages share
  - `defaultBudgetBytes(): number`
  - `useModalityScene(stage, budget = getSceneBudget())` — the optional second parameter is how tests inject an isolated budget
  - `casePageKey(slug)` returns the constant `'case'` for every known, enabled case

**Background.** The client wrote "The 3d views (images and models) no longer cache and reload each time (slows interaction)", and they are right about two distinct causes:

1. `casePageKey` gives every case outside the density family its own key, so leaving a case unmounts `CopperStage`, `useCopperStage`'s `onScopeDispose` destroys the renderer, and every decoded volume for that case is gone. Returning re-downloads 10–53MB.
2. `MAX_CACHED_SCENES = 3` is shared by the density family's five cases × three modalities. Walking A→B→C→D evicts on nearly every step.

The legacy app built three renderers at module scope and never tore them down, so anything loaded stayed loaded for the session. This task restores that, bounded by bytes instead of by nothing.

**Do not remove the eviction machinery in `useModalityScene`.** `evictScene` frees GPU geometry and textures and documents (at length) why it must not call `controls.dispose()`. Only the *decision* of what to evict moves out.

- [ ] **Step 1: Write the budget's failing test**

Create `web/test/sceneBudget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSceneBudget, defaultBudgetBytes } from '../app/composables/sceneBudget'

const MB = 1024 * 1024

describe('createSceneBudget', () => {
  it('reports nothing resident to start with', () => {
    const budget = createSceneBudget(100 * MB)
    expect(budget.bytes()).toBe(0)
    expect(budget.overflow()).toEqual([])
  })

  it('accumulates registered bytes', () => {
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 30 * MB)
    budget.register('b', 20 * MB)
    expect(budget.bytes()).toBe(50 * MB)
  })

  it('re-registering a key replaces its size rather than adding to it', () => {
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 30 * MB)
    budget.register('a', 10 * MB)
    expect(budget.bytes()).toBe(10 * MB)
  })

  it('names the least-recently-touched key once the limit is passed', () => {
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 40 * MB)
    budget.register('b', 40 * MB)
    budget.register('c', 40 * MB)
    // 120MB registered against a 100MB limit; 'a' is oldest.
    expect(budget.overflow()).toEqual(['a'])
  })

  it('touch moves a key to the back of the queue', () => {
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 40 * MB)
    budget.register('b', 40 * MB)
    budget.touch('a')
    budget.register('c', 40 * MB)
    expect(budget.overflow()).toEqual(['b'])
  })

  it('keeps naming victims until the total is back under the limit', () => {
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 40 * MB)
    budget.register('b', 40 * MB)
    budget.register('c', 40 * MB)
    budget.register('d', 40 * MB)
    expect(budget.overflow()).toEqual(['a', 'b'])
  })

  /**
   * The one that matters for three-up: two or three panels are on screen
   * at once, and no amount of memory pressure may blank one of them.
   */
  it('never names a pinned key, even when it is the oldest', () => {
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 40 * MB)
    budget.register('b', 40 * MB)
    budget.register('c', 40 * MB)
    budget.pin('a')
    expect(budget.overflow()).toEqual(['b'])
  })

  it('gives up rather than evicting pinned keys when nothing else is left', () => {
    const budget = createSceneBudget(50 * MB)
    budget.register('a', 40 * MB)
    budget.register('b', 40 * MB)
    budget.pin('a')
    budget.pin('b')
    expect(budget.overflow()).toEqual([])
  })

  it('unpin makes a key evictable again', () => {
    const budget = createSceneBudget(50 * MB)
    budget.register('a', 40 * MB)
    budget.register('b', 40 * MB)
    budget.pin('a')
    expect(budget.overflow()).toEqual(['b'])
    budget.unpin('a')
    budget.pin('b')
    expect(budget.overflow()).toEqual(['a'])
  })

  it('release removes a key and its bytes', () => {
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 40 * MB)
    budget.release('a')
    expect(budget.bytes()).toBe(0)
    expect(budget.overflow()).toEqual([])
  })

  it('release and unpin are safe on keys that were never registered', () => {
    const budget = createSceneBudget(100 * MB)
    expect(() => { budget.release('nope'); budget.unpin('nope') }).not.toThrow()
  })

  it('renaming carries the bytes, the position and the pin across', () => {
    // useModalityScene's density morph renames a scene in place.
    const budget = createSceneBudget(100 * MB)
    budget.register('a', 40 * MB)
    budget.register('b', 40 * MB)
    budget.pin('a')
    budget.rename('a', 'a2')
    budget.register('c', 40 * MB)
    expect(budget.bytes()).toBe(120 * MB)
    expect(budget.overflow()).toEqual(['b'])
  })
})

describe('defaultBudgetBytes', () => {
  it('is conservative when the browser will not say how much memory it has', () => {
    // Safari and every iOS browser omit navigator.deviceMemory entirely,
    // and an iPad is the device most likely to be killed for using too
    // much -- so "unknown" must mean the small budget, not the large one.
    expect(defaultBudgetBytes(undefined)).toBe(250 * MB)
  })

  it('is conservative on a low-memory device', () => {
    expect(defaultBudgetBytes(4)).toBe(250 * MB)
  })

  it('allows the full budget on a roomy device', () => {
    expect(defaultBudgetBytes(8)).toBe(500 * MB)
    expect(defaultBudgetBytes(16)).toBe(500 * MB)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run from `web/`:

```
yarn vitest run test/sceneBudget.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the budget**

Create `web/app/composables/sceneBudget.ts`:

```ts
/**
 * How much decoded scene data may stay resident, across every stage.
 *
 * ## Why this replaced a scene count
 *
 * `useModalityScene` used to cap residency at `MAX_CACHED_SCENES = 3`.
 * That number was chosen when one page instance served at most one case's
 * three modalities. Two things broke it:
 *
 *  · the density family already shared one instance across five cases,
 *    so three slots served fifteen possible scenes and a walk through
 *    A -> B -> C -> D evicted on nearly every step;
 *  · every other case had its own page key, so leaving it destroyed the
 *    renderer and everything in it.
 *
 * The client reported both as "The 3d views no longer cache and reload
 * each time (slows interaction)".
 *
 * A count is the wrong unit regardless: this catalogue's volumes run from
 * 51KB (`benign-cyst/middle/u2d.nrrd`) to 53MB
 * (`cancer-lobular/right/mri.nrrd`), and NRRD decodes to a typed array
 * larger than its compressed size on disk. Three scenes can be 150KB or
 * 250MB. Bytes are the thing actually at risk.
 *
 * ## Pinning
 *
 * Three-up shows up to three scenes at once. Whatever is on screen is
 * pinned and is never a victim, however far over the limit that puts us
 * -- blanking a panel the reader is looking at to satisfy a soft budget
 * would be strictly worse than the memory it saves.
 */

const MB = 1024 * 1024

/** Roomy devices get this. */
const FULL_BUDGET = 500 * MB
/** Low-memory devices, and any browser that will not say, get this. */
const CONSERVATIVE_BUDGET = 250 * MB
/** `navigator.deviceMemory` in GiB, at or above which the full budget applies. */
const ROOMY_DEVICE_GIB = 8

export interface SceneBudget {
  /** Records (or re-records) a resident scene's decoded size and marks it
   *  most-recently-used. */
  register: (key: string, bytes: number) => void
  /** Marks an already-registered scene most-recently-used. No-op if absent. */
  touch: (key: string) => void
  /** Protects a scene from eviction while it is on screen. */
  pin: (key: string) => void
  unpin: (key: string) => void
  /** Forgets a scene entirely. Call after its GPU resources are freed. */
  release: (key: string) => void
  /** Carries bytes, queue position and pin state to a new key. The density
   *  morph renames a scene in place; see `adoptSceneName`. */
  rename: (from: string, to: string) => void
  /** Keys to evict, least-recently-used first, never pinned. Empty when the
   *  total is within budget or nothing evictable is left. */
  overflow: () => string[]
  bytes: () => number
}

/**
 * `deviceMemory` is a Chromium-only hint in GiB, absent in Safari and
 * every iOS browser. Absent must mean the SMALL budget: an iPad is both
 * the device that omits the API and the one most likely to have its tab
 * killed for using too much.
 */
export function defaultBudgetBytes(deviceMemoryGiB?: number): number {
  return typeof deviceMemoryGiB === 'number' && deviceMemoryGiB >= ROOMY_DEVICE_GIB
    ? FULL_BUDGET
    : CONSERVATIVE_BUDGET
}

export function createSceneBudget(limitBytes: number): SceneBudget {
  /** Insertion order is LRU order: Map preserves it, and re-inserting a key
   *  after deleting it moves it to the back. */
  const sizes = new Map<string, number>()
  const pinned = new Set<string>()

  function total(): number {
    let sum = 0
    for (const bytes of sizes.values()) sum += bytes
    return sum
  }

  return {
    register(key, bytes) {
      sizes.delete(key)
      sizes.set(key, bytes)
    },
    touch(key) {
      const bytes = sizes.get(key)
      if (bytes === undefined) return
      sizes.delete(key)
      sizes.set(key, bytes)
    },
    pin(key) { pinned.add(key) },
    unpin(key) { pinned.delete(key) },
    release(key) {
      sizes.delete(key)
      pinned.delete(key)
    },
    rename(from, to) {
      const bytes = sizes.get(from)
      if (bytes === undefined) return
      sizes.delete(from)
      sizes.set(to, bytes)
      if (pinned.delete(from)) pinned.add(to)
    },
    overflow() {
      const victims: string[] = []
      let remaining = total()
      for (const [key, bytes] of sizes) {
        if (remaining <= limitBytes) break
        if (pinned.has(key)) continue
        victims.push(key)
        remaining -= bytes
      }
      return victims
    },
    bytes: total,
  }
}

let shared: SceneBudget | undefined

/**
 * The one budget every stage shares. Three-up means three
 * `useModalityScene` instances competing for the same device memory, so
 * a per-instance cap would be three caps and the device would see the sum.
 */
export function getSceneBudget(): SceneBudget {
  if (!shared) {
    const memory = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined
    shared = createSceneBudget(defaultBudgetBytes(memory))
  }
  return shared
}
```

- [ ] **Step 4: Run the budget tests**

Run from `web/`:

```
yarn vitest run test/sceneBudget.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the budget on its own**

```bash
git add web/app/composables/sceneBudget.ts web/test/sceneBudget.test.ts
git commit -m "feat(viewer): byte-based scene residency budget

Replaces the count-of-three cap that could mean 150KB or 250MB depending
on which three. Pinned scenes -- whatever is on screen -- are never
victims. Unknown device memory means the small budget, because the
browsers that omit the API are the ones on the devices that get killed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Point `useModalityScene` at the budget**

In `web/app/composables/useModalityScene.ts`:

- change the signature to `export function useModalityScene(stage: StageApi, budget: SceneBudget = getSceneBudget())` and import the two symbols
- delete the `MAX_CACHED_SCENES` constant and its long comment; replace with a one-line pointer to `sceneBudget.ts`
- delete `recentScenes`, `residentScenes`, `pickEvictionVictim` and `evictOverflow`
- in `load()`'s success path, replace `residentScenes.add(name)` with a `budget.register(name, bytesOf(slice))` call, where:

```ts
/**
 * A scene's decoded size, for the residency budget.
 *
 * NRRD: the volume's own typed array, which is the whole cost -- the slice
 * plane's canvas texture is one slice, kilobytes against megabytes.
 * GLB (slice === null): the anatomy models in this catalogue are 617KB to
 * 1.05MB on disk and decode to a similar order, so a flat estimate is
 * accurate enough to keep them from being free. Being wrong here changes
 * eviction order, not correctness.
 */
const GLB_ESTIMATED_BYTES = 2 * 1024 * 1024

function sceneBytes(slice: SliceState | null): number {
  const data = slice?.raw.volume.data as { byteLength?: number } | undefined
  return data?.byteLength ?? GLB_ESTIMATED_BYTES
}
```

- replace `touchScene`'s body with:

```ts
  /** Records `name` as most-recently-used and applies the budget. Called
   *  only once a scene genuinely holds content AND is the one the user is
   *  actually looking at -- a failed load is evicted by `load()`'s own
   *  catch instead, and a superseded load registers itself in `load()`
   *  without touching the queue. */
  function touchScene(renderer: CopperRenderer, scene: CopperScene, name: string) {
    nameOfScene.set(scene, name)
    budget.touch(name)
    // Whatever this stage is showing is off limits: three-up has up to
    // three of these composables live at once, and evicting a visible
    // scene to satisfy a soft byte budget would blank a panel the reader
    // is looking at.
    if (pinnedName && pinnedName !== name) budget.unpin(pinnedName)
    pinnedName = name
    budget.pin(name)
    for (const victim of budget.overflow()) evictScene(renderer, victim)
  }
```

with `let pinnedName: string | undefined` declared alongside `loadToken`.

- in `evictScene`, add `budget.release(name)` where `residentScenes.delete(name)` was, and delete the `recentScenes.indexOf/splice` lines
- in `adoptSceneName`, replace the `residentScenes`/`recentScenes` bookkeeping with `budget.rename(currentName, nextName)`; when `currentName` is undefined, call `budget.register(nextName, GLB_ESTIMATED_BYTES)` instead. Also update `pinnedName` to `nextName` when it equalled `currentName`.
- add to `onScopeDispose`: release this stage's pin so a torn-down stage does not protect a scene forever.

```ts
  onScopeDispose(() => {
    disposed = true
    if (pinnedName) budget.unpin(pinnedName)
  })
```

- [ ] **Step 7: Update `useModalityScene`'s tests**

Read `web/test/useModalityScene.test.ts` and update every assertion that referenced the count-of-three cap. Each such test should now construct an isolated budget and pass it in:

```ts
import { createSceneBudget } from '../app/composables/sceneBudget'

// ...
const budget = createSceneBudget(10 * 1024 * 1024)
const scene = useModalityScene(stage, budget)
```

Add one new test proving the pin holds:

```ts
it('never evicts the scene this stage is currently showing', async () => {
  // A budget so small that everything overflows, so the only thing that
  // can keep the visible scene alive is the pin.
  const budget = createSceneBudget(1)
  const scene = useModalityScene(stage, budget)
  await scene.load('density-a', anatomyModality)
  await scene.load('density-a', mriModality)
  await scene.load('density-a', mammogramModality)
  // The last one loaded is the one on screen.
  expect(renderer.getSceneByName('density-a:mammogram')).toBeDefined()
})
```

(Match the existing file's fixture names for `stage`, `renderer` and the modality objects — do not invent new ones.)

- [ ] **Step 8: Make every case share one page instance**

Rewrite `web/app/utils/pageKey.ts`:

```ts
import { getCase } from '~~/content/cases'

/**
 * The key `<NuxtPage>` uses to decide when the case page -- and with it
 * the three `CopperStage` instances, their renderers and their scene
 * caches -- is reused rather than rebuilt.
 *
 * ## One key for every case
 *
 * It is a constant. Every case page reuses one component instance, so a
 * navigation from `benign-cyst` to `cancer-dcis` keeps three live
 * renderers and everything decoded into them.
 *
 * This is client feedback item 5, "The 3d views (images and models) no
 * longer cache and reload each time (slows interaction)". Per-slug keys
 * meant leaving a case ran `useCopperStage`'s `onScopeDispose`, which
 * destroys the WebGLRenderer and every scene in it -- so returning
 * re-downloaded and re-decoded 10-53MB. The legacy app built its three
 * renderers at module scope and never tore them down; this is the same
 * lifetime, expressed through the page key.
 *
 * What bounds memory now is `sceneBudget.ts`, not the page key. Before,
 * teardown was doing that job by accident, badly: it freed everything on
 * every navigation whether or not there was any pressure to.
 *
 * ## Why a validate guard is still required
 *
 * With the key pinned, `pages/[slug]/[[modality]].vue`'s setup does not
 * re-run on navigation, so a setup-time `throw createError` would only
 * ever fire on the first case page of a session. `definePageMeta({
 * validate })` runs on EVERY navigation regardless of instance reuse,
 * which is why the 404 behaviour survives this. Do not replace it.
 *
 * Every non-case route falls back to `route.path` in `app.vue`, which is
 * what NuxtPage derives its default key from.
 */
const CASE_PAGE_KEY = 'case'

export function casePageKey(slug: string | undefined): string | undefined {
  if (typeof slug !== 'string') return undefined
  return getCase(slug) ? CASE_PAGE_KEY : undefined
}
```

`isMorphFamilyGroup` stays in `content/cases.ts` and keeps its other reader, `cameraTransitions.ts`. Update its doc comment there: it no longer has anything to do with the page key, only with which navigations may crossfade.

- [ ] **Step 9: Update `pageKey.test.ts`**

Read `web/test/pageKey.test.ts` and rewrite it to the new contract:

```ts
import { describe, expect, it } from 'vitest'
import { casePageKey } from '../app/utils/pageKey'
import { enabledCases } from '../content/cases'

describe('casePageKey', () => {
  it('gives every case the same key, so the stages survive case navigation', () => {
    const keys = new Set(enabledCases().map(c => casePageKey(c.slug)))
    expect(keys.size).toBe(1)
    expect([...keys][0]).toBeTypeOf('string')
  })

  it('returns undefined for a slug that is not a case, so the route path is used', () => {
    expect(casePageKey('nope')).toBeUndefined()
  })

  it('returns undefined when there is no slug param at all', () => {
    expect(casePageKey(undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 10: Run the full unit suite**

Run from `web/`:

```
yarn test
```

Expected: PASS.

- [ ] **Step 11: Prove the caching in a real browser**

Append to `web/test-browser/stage.spec.ts`:

```ts
/**
 * Client feedback item 5. Leaving a case and coming back must not
 * re-download its volume. Before the page key became a constant, this
 * downloaded ~10MB twice.
 */
test('returning to a case does not re-download its volume', async ({ page }) => {
  const volumeRequests: string[] = []
  page.on('request', (request) => {
    if (/\.nrrd(\?|$)/.test(request.url())) volumeRequests.push(request.url())
  })

  await page.goto('/cancer-ductal/mammogram')
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })
  const afterFirst = volumeRequests.length
  expect(afterFirst).toBeGreaterThan(0)

  await page.goto('/benign-fibroadenoma/mammogram')
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })

  const beforeReturn = volumeRequests.length
  await page.goto('/cancer-ductal/mammogram')
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })

  expect(volumeRequests.length).toBe(beforeReturn)
})
```

Note: `page.goto` is a full document load and would defeat the point. Use client-side navigation instead — click the sidebar links:

```ts
  await page.goto('/cancer-ductal/mammogram')
  // ... wait
  await page.getByRole('link', { name: 'Fibroadenoma' }).click()
  // ... wait
  await page.getByRole('link', { name: 'Ductal' }).click()
```

Write it with the link clicks, not the three `goto`s. A `goto` reloads the document and rebuilds every renderer from scratch, which is a different thing entirely and is not what a reader stepping through the sidebar does.

- [ ] **Step 12: Run the browser test**

Run from `web/`:

```
yarn test:browser test-browser/stage.spec.ts
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add web/app/composables/useModalityScene.ts web/app/utils/pageKey.ts web/content/cases.ts web/test/useModalityScene.test.ts web/test/pageKey.test.ts web/test-browser/stage.spec.ts
git commit -m "fix(viewer): keep loaded scenes across case navigation

Client feedback item 5. Two causes: every case outside the density
family had its own page key, so leaving it destroyed the renderer and
everything decoded into it; and the surviving family shared a cap of
three scenes across fifteen possibilities.

One page key for every case now, bounded by the byte budget instead of
by teardown. The 404 guard is unaffected -- validate runs per navigation
regardless of instance reuse, which is why it was written that way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Fit the content to the canvas

**Files:**
- Create: `web/app/composables/fitToView.ts`
- Create: `web/test/fitToView.test.ts`
- Modify: `web/app/composables/copper-types.ts`
- Modify: `web/app/composables/useModalityScene.ts`
- Modify: `web/app/components/stage/CopperStage.client.vue`

**Verified before this plan was executed** (do not re-derive, but do not assume beyond it either):
- `web/app/composables/copper-types.ts`'s `CopperCamera` declares only `position`, `up`, `lookAt`, `updateProjectionMatrix`. It has **no `fov`**. Step 5 adds it.
- Tailwind 4.3.3 compiles `@[1000px]:` to `@container (width >= 1000px)` and `@max-[1000px]:` to `@container (width < 1000px)`. Both variants work as written in Task 5 — checked against the generated stylesheet, not assumed.
- Chromium fires a `ResizeObserver` callback immediately on observing a `display:none` element, reporting 0×0, and fires again with real dimensions when it is shown. Task 4's load gate depends on both directions and both hold.

**Interfaces:**
- Consumes: `SceneBudget` from Task 2 only incidentally (same file is edited).
- Produces:
  - `fitDistance(bounds: FitBounds, aspect: number, fovDeg: number, margin?: number): number`
  - `interface FitBounds { width: number; height: number; depth: number }`
  - `useModalityScene` gains `refitCurrentScene(aspect: number): void` and tracks a per-scene `userPosed` flag, cleared by `markSceneUnposed(name)`.

**Background.** Client item 7: "The image and model views could take up more of the space available - they start of very small." The screenshot the client's colleague supplied shows an MRI bounding box occupying about a quarter of the canvas height with white space all round.

The presets are hand-written and fixed: `density-1/right/mri_view.json` puts the eye at `[0, 0, 650]`. At a 45° vertical field of view that is a visible height of `2 * 650 * tan(22.5°) ≈ 538` units, against a volume roughly 200 units tall. The content is a third of the frame before the panel is narrowed at all — and three-up narrows every panel.

Only the **distance** is computed. The preset's view direction and up vector are kept: they encode which way the reader looks at the data, which is not this task's business to decide. See the spec's §6.3 note on the density/lesion up-vector disagreement, which is deliberately left alone.

- [ ] **Step 1: Write the failing test**

Create `web/test/fitToView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitDistance } from '../app/composables/fitToView'

/** A 200×200×200 cube is the easy case: square, so aspect cannot bite. */
const CUBE = { width: 200, height: 200, depth: 200 }

describe('fitDistance', () => {
  it('puts a cube far enough back that its height just fits, plus margin and half its depth', () => {
    // vFov 45deg: half-height 100 needs 100 / tan(22.5deg) = 241.42 units
    // from the cube's centre plane, + half the depth (100) to clear the
    // near face, x 1.08 margin.
    const d = fitDistance(CUBE, 1, 45, 1.08)
    expect(d).toBeCloseTo((100 / Math.tan(Math.PI / 8) + 100) * 1.08, 2)
  })

  it('a taller-than-wide viewport does not change a height-limited fit', () => {
    const tall = fitDistance(CUBE, 0.5, 45, 1.08)
    const square = fitDistance(CUBE, 1, 45, 1.08)
    // At aspect 0.5 the horizontal field is NARROWER, so width becomes the
    // binding constraint and the camera must move further back.
    expect(tall).toBeGreaterThan(square)
  })

  it('a wide viewport is height-limited, so the distance matches the square case', () => {
    expect(fitDistance(CUBE, 2, 45, 1.08)).toBeCloseTo(fitDistance(CUBE, 1, 45, 1.08), 6)
  })

  it('a wide, flat volume in a narrow panel is width-limited', () => {
    const wide = { width: 400, height: 100, depth: 10 }
    const d = fitDistance(wide, 1, 45, 1)
    // Horizontal half-field at aspect 1 equals the vertical one, so 200
    // half-width needs 200 / tan(22.5deg), not 50 / tan(22.5deg).
    expect(d).toBeCloseTo(200 / Math.tan(Math.PI / 8) + 5, 2)
  })

  it('scales linearly with the object', () => {
    const small = fitDistance({ width: 1, height: 1, depth: 1 }, 1, 45)
    const big = fitDistance({ width: 10, height: 10, depth: 10 }, 1, 45)
    expect(big).toBeCloseTo(small * 10, 6)
  })

  it('a narrower field of view needs more distance', () => {
    expect(fitDistance(CUBE, 1, 30)).toBeGreaterThan(fitDistance(CUBE, 1, 60))
  })

  it('never returns zero or a negative for a degenerate box', () => {
    expect(fitDistance({ width: 0, height: 0, depth: 0 }, 1, 45)).toBeGreaterThan(0)
  })

  it('survives a zero aspect without returning NaN or Infinity', () => {
    // A panel mid-collapse can measure 0 wide for a frame.
    const d = fitDistance(CUBE, 0, 45)
    expect(Number.isFinite(d)).toBe(true)
    expect(d).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run from `web/`:

```
yarn vitest run test/fitToView.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `web/app/composables/fitToView.ts`:

```ts
/**
 * How far a perspective camera must sit from an object's centre for the
 * whole object to fit in frame.
 *
 * ## Why this exists
 *
 * The `*_view.json` presets carry a hand-written `eyePosition` and nothing
 * else. `density-1/right/mri_view.json` puts the eye at `[0, 0, 650]`; at
 * a 45-degree vertical field that frames 538 units of height for a volume
 * about 200 units tall, so the content occupies a third of the canvas
 * before anything narrows it. The client reported this as "The image and
 * model views could take up more of the space available - they start of
 * very small", with a screenshot of an MRI filling roughly a quarter of
 * its panel.
 *
 * A fixed distance also cannot survive three-up, where each panel is
 * roughly a third as wide as the single-panel stage it replaced.
 *
 * ## What is NOT computed here
 *
 * Only the distance. The preset's view direction and up vector are kept
 * as authored: they encode which way a reader is meant to look at the
 * data, which is a clinical decision and not this function's business.
 * (The density and lesion MRI presets disagree about the up vector; that
 * is a real pre-existing inconsistency, deliberately left alone -- see
 * the spec's §6.3.)
 *
 * Pure and framework-free so it can be tested without a renderer.
 */

export interface FitBounds {
  width: number
  height: number
  depth: number
}

/** Nothing smaller than this, so a degenerate or not-yet-measured box can
 *  never put the camera at the origin looking at itself. */
const MIN_DISTANCE = 1e-3

/**
 * @param bounds     The object's axis-aligned size, in scene units.
 * @param aspect     Viewport width / height. Zero or non-finite is treated
 *                   as 1 -- a panel mid-collapse measures 0 for a frame,
 *                   and NaN in a camera's projection matrix is unrecoverable.
 * @param fovDeg     The camera's VERTICAL field of view, in degrees.
 * @param margin     Multiplier applied at the end. 1.08 leaves ~8% breathing
 *                   room, which is what stops a tightly-fitted volume from
 *                   touching the panel edges.
 */
export function fitDistance(
  bounds: FitBounds,
  aspect: number,
  fovDeg: number,
  margin = 1.08,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const vHalf = (fovDeg * Math.PI) / 360
  const tanV = Math.tan(vHalf)
  // Horizontal half-angle for this aspect. At aspect < 1 the horizontal
  // field is narrower than the vertical one, which is when width binds.
  const tanH = tanV * safeAspect

  const forHeight = bounds.height / 2 / tanV
  const forWidth = bounds.width / 2 / tanH

  // Half the depth, because the distance above frames the object's centre
  // plane and the near face sits half a depth closer to the camera.
  const distance = (Math.max(forHeight, forWidth) + bounds.depth / 2) * margin
  return Math.max(distance, MIN_DISTANCE)
}
```

- [ ] **Step 4: Run the test**

Run from `web/`:

```
yarn vitest run test/fitToView.test.ts
```

Expected: PASS.

- [ ] **Step 5: Widen `CopperCamera` to expose the field the fit reads**

`web/app/composables/copper-types.ts`'s `CopperCamera` declares `position`, `up`, `lookAt` and `updateProjectionMatrix` — and **no `fov`**. Verified by reading the file; `refitCurrentScene` below needs it, so without this the next step does not type-check.

The field exists at runtime: `copperSceneOnDemond` builds a three `PerspectiveCamera`, and the `*_view.json` presets already drive `nearPlane`/`farPlane` on the same object. Add it with a comment saying so, in the same spirit as the rest of that file, which documents each field against the copper3d source it was read from:

```ts
  /**
   * Vertical field of view in degrees. Not used by copper3d's own view
   * presets -- `fitToView` reads it to work out how far back the camera
   * has to sit for the object to fill the frame. Present because the
   * underlying object is a three `PerspectiveCamera`; declared here
   * because this type is the app's whole view of it.
   */
  fov: number
```

- [ ] **Step 6: Apply the fit after every load**

In `web/app/composables/useModalityScene.ts`:

Add a per-scene bounds record and a per-scene "the user has moved this" flag:

```ts
  /** Each scene's object bounds, for `fitDistance`. NRRD gives this
   *  directly as `volume.RASDimensions`; a GLB is measured with a Box3. */
  const boundsByScene = new Map<string, FitBounds>()
  /**
   * Scenes the reader has moved the camera on.
   *
   * A refit on resize is right for a scene still showing its opening
   * framing and wrong for one the reader has posed -- there, it would
   * yank the view back every time a panel collapsed. `CopperStage`
   * already listens for the two gestures that mean "the user is driving"
   * (`pointerdown` and `wheel`, for `onUserInput`); this is set from the
   * same place, and `Reset view` clears it.
   */
  const posedScenes = new Set<string>()
```

Capture the bounds. In `loadAnatomy`:

```ts
  async function loadAnatomy(target: CopperScene, assetUrl: string, name: string): Promise<null> {
    const group = await loadGlb(target, assetUrl)
    group.name = 'anatomy-model'
    anatomyAssetByScene.set(target, assetUrl)
    const { Box3, Vector3 } = await import('three')
    const size = new Box3().setFromObject(group as never).getSize(new Vector3())
    boundsByScene.set(name, { width: size.x, height: size.y, depth: size.z })
    return null
  }
```

(`loadAnatomy`'s call site in `load()` gains the `name` argument; `three` is already a direct dependency pinned to the revision copper3d inlines — see `loadGltfModel`'s header.)

In `loadImaging`'s success callback, alongside the existing `resolve`:

```ts
            const [rx, ry, rz] = volume.RASDimensions
            boundsByScene.set(name, { width: rx ?? 0, height: ry ?? 0, depth: rz ?? 0 })
```

(`loadImaging` gains a `name` parameter for this; it already takes `token`.)

Add the refit itself:

```ts
  /**
   * Moves the current scene's camera along its existing view direction to
   * the distance that frames the object, and renders.
   *
   * No-op on a scene the reader has posed: see `posedScenes`.
   */
  function refitCurrentScene(aspect: number) {
    const target = scene.value
    const renderer = stage.renderer.value
    const name = target ? nameOfScene.get(target) : undefined
    if (!target || !renderer || !name || posedScenes.has(name)) return

    const bounds = boundsByScene.get(name)
    const preset = viewpointByScene.get(name)
    if (!bounds || !preset) return

    const [tx, ty, tz] = preset.targetPosition
    const [ex, ey, ez] = preset.eyePosition
    const dx = ex - tx
    const dy = ey - ty
    const dz = ez - tz
    const length = Math.hypot(dx, dy, dz)
    // A preset whose eye sits exactly on its target has no direction to
    // preserve; leave it to `loadView`'s own result rather than guessing one.
    if (length === 0) return

    const distance = fitDistance(bounds, aspect, target.camera.fov)
    target.camera.position.set(
      tx + (dx / length) * distance,
      ty + (dy / length) * distance,
      tz + (dz / length) * distance,
    )
    target.camera.updateProjectionMatrix()
    target.controls.handleResize?.()
    renderer.render()
  }

  /** Called by `CopperStage` on the first real user gesture, and undone by
   *  `Reset view`. */
  function markPosed(posed: boolean) {
    const target = scene.value
    const name = target ? nameOfScene.get(target) : undefined
    if (!name) return
    if (posed) posedScenes.add(name)
    else posedScenes.delete(name)
  }
```

Call `refitCurrentScene(hostAspect)` immediately after `next.loadView(preset)` in `load()`'s success path (before `renderer.render()`), and in the cached-scene early-return branch. The aspect comes from the stage host; add an `aspect: () => number` accessor to `StageApi` in `copper-types.ts`, implemented in `useCopperStage` from the host's `getBoundingClientRect()`, returning 1 when the box is degenerate.

Add `refitCurrentScene`, `markPosed` to the composable's return object, and clean up `boundsByScene`/`posedScenes` inside `evictScene` and `adoptSceneName` exactly the way `viewpointByScene` is handled there.

- [ ] **Step 7: Wire the flag and the resize refit in `CopperStage`**

In `web/app/components/stage/CopperStage.client.vue`:

```ts
/**
 * Any real gesture marks this scene as posed, so a later panel resize
 * refits nothing and leaves the reader's view where they put it.
 * `onUserInput` already fires on exactly the two gestures that mean the
 * user is driving.
 */
function onUserInput() {
  camera.interrupt()
  modalityScene.markPosed(true)
}
```

and in `onReset`, after `target.loadView(preset)`:

```ts
  // "Reset view" means back to the opening framing, which includes handing
  // refitting back to the layout.
  modalityScene.markPosed(false)
  modalityScene.refitCurrentScene(stage.aspect())
```

Add a refit to the existing `ResizeObserver` in `useCopperStage`, after `current?.onWindowResize()` and the `handleResize()` call.

The observer lives in `useCopperStage` and `refitCurrentScene` lives in `useModalityScene`, which is constructed *from* the stage — so the callback cannot be passed in the options object, because `modalityScene` does not exist yet at that point. Use a mutable hook, assigned once both exist. Task 4 Step 3 needs the same seam for the load gate and wires the final form; build it here as:

```ts
// useCopperStage(host, options)
export interface StageOptions {
  /**
   * Called on every container resize with the host's measured box.
   *
   * A mutable hook rather than a constructor argument because its only
   * caller lives in `useModalityScene`, which is built FROM this stage --
   * so at the moment `useCopperStage` is called there is nothing to pass.
   * `CopperStage` assigns it on the next line, before any resize can fire.
   */
  onResize?: (box: { width: number, height: number }) => void
}
```

and in the observer, after the existing `handleResize()` call:

```ts
      options.onResize?.({ width, height })
```

The `width === 0 || height === 0` early return above it already guarantees the hook never sees a degenerate box.

- [ ] **Step 8: Run the unit suite**

Run from `web/`:

```
yarn test
```

Expected: PASS. `useCopperStage.test.ts` and `CopperStage.test.ts` will need their fakes extended with `camera: { fov: 45, position: { set() {} }, updateProjectionMatrix() {} }` and an `aspect()` on the stage stub.

- [ ] **Step 9: See it**

Run `yarn dev` and open `http://localhost:3158/cancer-dcis/mri`. The volume should now fill most of the panel height with a small margin, instead of a quarter of it. Compare against the client's screenshot. Then drag to rotate, collapse the content panel from the header, and confirm the view does **not** jump back — that is `posedScenes` working. Press `Reset view`, collapse the panel again, and confirm it now does refit.

- [ ] **Step 10: Settle the up-vector question, or hand it to the client**

The spec's §6.3 records a pre-existing inconsistency this task must not silently paper over: `density-*/right/mri_view.json` has `upVector: [0, 1, 0]` and every lesion case's has `[0, -1, 0]`, so the two groups' MRIs are displayed upside down relative to each other. The client did not report it, and flipping a medical image the wrong way is worse than leaving it inconsistent.

Compare against the deployed legacy app, which shipped these same JSON files:

```
https://abi-breast-biomechanics-group.github.io/breast-educational-resource/density-3
https://abi-breast-biomechanics-group.github.io/breast-educational-resource/cancer-dcis
```

Screenshot the MRI panel on both, side by side with this branch's `/density-c/mri` and `/cancer-dcis/mri`.

- If the legacy app shows the two groups the same way, one of this repo's presets has drifted — change that one to match and note which in the commit message.
- If the legacy app shows the same disagreement, **change nothing.** Add a line to the spec's §6.3 recording that it was verified as pre-existing, and raise it with the client as a question rather than fixing it unilaterally.

Either way, write the outcome down. An investigation with no recorded result gets redone.

- [ ] **Step 11: Commit**

```bash
git add web/app/composables/fitToView.ts web/test/fitToView.test.ts web/app/composables/useModalityScene.ts web/app/composables/useCopperStage.ts web/app/composables/copper-types.ts web/app/components/stage/CopperStage.client.vue web/test/useCopperStage.test.ts web/test/CopperStage.test.ts
git commit -m "feat(viewer): frame each scene to the canvas it is given

Client feedback item 7. The presets carry a fixed eyePosition -- 650
units for an MRI volume about 200 units tall, so the content filled a
third of the frame before any panel narrowed it. Only the distance is
computed; the preset's direction and up vector are kept as authored.

Refitting stops once the reader has moved the camera, and resumes after
Reset view -- otherwise collapsing a panel would yank their view back.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `CopperStage` owns its own control bar and loads only when sized

**Files:**
- Modify: `web/app/components/stage/CopperStage.client.vue`
- Modify: `web/app/components/stage/StageControls.vue`
- Delete: `web/app/composables/useStageControls.ts`
- Modify: `web/test/setup.ts` (drop the two stubs for the deleted composable)
- Test: `web/test/CopperStage.test.ts`, `web/test/StageControls.test.ts`

**Interfaces:**
- Consumes: `refitCurrentScene`, `markPosed` from Task 3.
- Produces: `<CopperStage>` renders its own `<StageControls>` and needs no provide/inject. New prop `panelLabel: string`. `StageControls` gains a `compact: boolean` prop and targets `[data-stage-panel]` for fullscreen, falling back to `[data-stage-column]`.

**Background.** `useStageControls.ts` exists for exactly one reason, stated in its own header: the control bar lives in the layout's `#controls` slot, a *sibling* of the `#stage` slot, so `defineExpose` cannot reach across. Three-up gives each panel its own bar directly under its own canvas, so the sibling problem disappears and the provide/inject seam has nothing left to bridge. Deleting it removes a whole indirection rather than adapting it.

The second half of this task is the load gate. Three stages are always mounted; only the ones CSS has given a non-zero box may download anything. That keeps one-up costing exactly one asset, as it does today, while three-up loads all three — and it does so without any breakpoint literal in JS, because the host's measured size *is* CSS's decision.

- [ ] **Step 1: Write the failing tests**

In `web/test/CopperStage.test.ts`, add:

```ts
describe('load gate: nothing downloads until CSS has given this panel a box', () => {
  /**
   * Three stages are mounted at all times (client feedback item 5 -- an
   * unmounted stage is a destroyed renderer). One-up hides two of them
   * with `display: none`, which measures 0x0, and that measurement is the
   * only signal here about which tier the layout is in. No breakpoint
   * literal in JS: the host's size IS what CSS decided.
   */
  it('does not call load() while the host measures zero', async () => {
    const wrapper = mountStage({ hostSize: { width: 0, height: 0 } })
    await flushPromises()
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('loads as soon as the host is given a size', async () => {
    const wrapper = mountStage({ hostSize: { width: 0, height: 0 } })
    await flushPromises()
    expect(loadSpy).not.toHaveBeenCalled()

    await resizeHost(wrapper, { width: 400, height: 300 })
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('stays loaded when the host is hidden again', async () => {
    const wrapper = mountStage({ hostSize: { width: 400, height: 300 } })
    await flushPromises()
    expect(loadSpy).toHaveBeenCalledTimes(1)

    await resizeHost(wrapper, { width: 0, height: 0 })
    await resizeHost(wrapper, { width: 400, height: 300 })
    // Re-shown, not re-downloaded: the scene is cached and load() short-
    // circuits on it, but it must not be called again from the gate.
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })
})

describe('the control bar is the stage\'s own', () => {
  it('renders one StageControls inside the stage', async () => {
    const wrapper = mountStage({ hostSize: { width: 400, height: 300 } })
    await flushPromises()
    expect(wrapper.findAllComponents(StageControls)).toHaveLength(1)
  })

  it('shows Locate lesion only on a panel that has a lesion slice', async () => {
    const withLesion = mountStage({ lesionSliceIndex: 90, hostSize: { width: 400, height: 300 } })
    await flushPromises()
    expect(withLesion.text()).toContain('Locate lesion')

    const without = mountStage({ lesionSliceIndex: 0, hostSize: { width: 400, height: 300 } })
    await flushPromises()
    expect(without.text()).not.toContain('Locate lesion')
  })
})
```

`mountStage` and `resizeHost` are new helpers. happy-dom does not implement `ResizeObserver`, so `CopperStage.test.ts` already stubs it; extend that stub to capture the callback so a test can drive it. Read the file's existing stub first and adapt this to it rather than adding a second one:

```ts
/** The callbacks live `ResizeObserver` instances were constructed with,
 *  newest last. `useCopperStage` creates exactly one per stage. */
const resizeCallbacks: ResizeObserverCallback[] = []

beforeEach(() => {
  resizeCallbacks.length = 0
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback) }
    observe() {}
    disconnect() {}
  })
})

/**
 * Drives the stage's ResizeObserver with a new box.
 *
 * `useCopperStage`'s observer reads the size back off the host with
 * `getBoundingClientRect()` rather than from the entry, so that is what
 * has to be stubbed -- the entry is only the trigger.
 */
async function resizeHost(
  wrapper: ReturnType<typeof mountStage>,
  box: { width: number, height: number },
) {
  const host = wrapper.get('[role="application"]').element as HTMLElement
  host.getBoundingClientRect = () => ({
    ...box, top: 0, left: 0, right: box.width, bottom: box.height, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect
  for (const callback of resizeCallbacks) {
    callback([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)
  }
  await flushPromises()
}
```

`mountStage(overrides)` wraps the file's existing mount call, defaulting `hostSize` to `{ width: 400, height: 300 }` and applying it through the same `getBoundingClientRect` stub before the first flush — otherwise every pre-existing test in the file measures 0×0 and the load gate keeps them from ever loading.

In `web/test/StageControls.test.ts`, add:

```ts
it('fullscreens the panel it belongs to, not the whole column', async () => {
  const panel = document.createElement('div')
  panel.setAttribute('data-stage-panel', '')
  const column = document.createElement('div')
  column.setAttribute('data-stage-column', '')
  column.appendChild(panel)
  document.body.appendChild(column)

  const requestFullscreen = vi.fn(() => Promise.resolve())
  panel.requestFullscreen = requestFullscreen as never
  column.requestFullscreen = vi.fn(() => Promise.resolve()) as never

  const wrapper = mount(StageControls, {
    props: {
      sliceIndex: 0, sliceMax: 0, settledSliceIndex: 0, lesionSliceIndex: 0, ready: true,
    },
    attachTo: panel,
  })
  await wrapper.get('button[aria-pressed]').trigger('click')
  expect(requestFullscreen).toHaveBeenCalled()
  expect(column.requestFullscreen).not.toHaveBeenCalled()

  column.remove()
})

it('compact mode drops the button labels but keeps their accessible names', () => {
  const wrapper = mount(StageControls, {
    props: {
      sliceIndex: 3, sliceMax: 10, settledSliceIndex: 3, lesionSliceIndex: 0,
      ready: true, compact: true,
    },
  })
  const reset = wrapper.get('button[aria-label="Reset view"]')
  expect(reset.text()).toBe('')
  expect(wrapper.text()).toContain('3 / 10')
})
```

- [ ] **Step 2: Run and confirm they fail**

```
yarn vitest run test/CopperStage.test.ts test/StageControls.test.ts
```

- [ ] **Step 3: Add the load gate**

In `CopperStage.client.vue`, replace the `watch` that drives `enterView` with one that also requires a measured host:

```ts
/**
 * True once CSS has given this panel a real box.
 *
 * Three stages are mounted at all times -- unmounting one destroys its
 * renderer and everything decoded into it, which is client feedback item
 * 5. One-up hides two of them with `display: none`; a hidden element
 * measures 0x0, and that is the whole signal. No breakpoint literal
 * appears in this file, because the measurement IS what CSS decided.
 *
 * Sticky on purpose: once a panel has loaded, hiding it again must not
 * unload it, or stepping between slots would re-download on every step.
 */
const everSized = ref(false)

watch(
  [() => stage.ready.value, () => everSized.value, () => props.slug, () => props.modality.id],
  ([ready, sized]) => {
    if (ready && sized) void enterView().catch(() => {})
  },
  { immediate: true },
)
```

Set `everSized` from the host's own `ResizeObserver`. `useCopperStage` already owns one over the same element; give it an `onResize` callback (Task 3 introduced the same need for refitting) and set the flag from there:

```ts
const stage = useCopperStage(host, {
  onResize: ({ width, height }) => {
    if (width > 0 && height > 0) everSized.value = true
    modalityScene.refitCurrentScene(width / height)
  },
})
```

Note the ordering problem: `modalityScene` is created from `stage`, so it cannot be referenced in `stage`'s own options object. Declare a mutable `let onResizeHook: ((box: { width: number, height: number }) => void) | undefined`, pass a thin closure that calls it, and assign the real one after `modalityScene` exists. Document why in a comment.

- [ ] **Step 4: Move the control bar inside**

Delete `web/app/composables/useStageControls.ts`, and remove the `provideStageControls` / `useStageControls` stubs from `web/test/setup.ts`.

In `CopperStage.client.vue`, replace the whole "Control bar wiring" section with plain local state, and render the bar at the end of the template:

```vue
    <StageControls
      :slice-index="slice.index.value"
      :slice-max="slice.max.value"
      :settled-slice-index="slice.settledIndex.value"
      :lesion-slice-index="props.lesionSliceIndex"
      :ready="isHealthy()"
      :compact="props.compact"
      @reset="onReset"
      @locate="onLocate"
    />
```

Wrap the canvas host and the bar in a single element carrying `data-stage-panel`, so `StageControls`' fullscreen target is this panel:

```vue
<template>
  <div data-stage-panel class="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
    <div class="relative flex-1 bg-linear-to-b from-surface-sunken to-bg">
      <!-- ... existing host div, keyboard help, error and loading overlays ... -->
    </div>

    <StageControls ... />
  </div>
</template>
```

Add the two new props:

```ts
  /** The slot's label, for the canvas's accessible name in three-up where
   *  three canvases are on screen at once. */
  panelLabel: string
  /** Three-up: icon-only buttons, since three bars share the width one had. */
  compact?: boolean
```

and use `panelLabel` in the host's `aria-label`: `` `${props.panelLabel}: ${props.modality.label} viewer` ``.

- [ ] **Step 5: Add compact mode to `StageControls`**

Give every button an explicit `aria-label` (`Reset view`, `Fullscreen`/`Exit fullscreen`, `Locate lesion`) so hiding the text costs nothing to a screen reader, wrap each label span in `<span v-if="!props.compact">`, and shorten the readout to `{{ props.sliceIndex }} / {{ props.sliceMax }}` when compact. The `sr-only` live region is unchanged — it already carries the long form.

Change the fullscreen target lookup:

```ts
  // Prefers this panel; falls back to the whole stage column for any caller
  // that is not inside a panel. In three-up, fullscreening the column would
  // blow up all three panels when the reader asked for one.
  const target = root.value?.closest<HTMLElement>('[data-stage-panel]')
    ?? root.value?.closest<HTMLElement>('[data-stage-column]')
    ?? root.value?.parentElement
```

- [ ] **Step 6: Unhook the page and the layout**

In `web/app/pages/[slug]/[[modality]].vue`, delete the `provideStageControls()` call and the entire `#controls` template block. In `web/app/layouts/default.vue`, delete the `<slot name="controls" />` line and update the comment above it.

- [ ] **Step 7: Run the unit suite**

```
yarn test
```

Expected: PASS. `CasePage.test.ts` and `DefaultLayout.test.ts` both assert on the controls slot and need updating to the new arrangement.

- [ ] **Step 8: Run the browser suite**

```
yarn test:browser
```

Expected: PASS. `a11y.spec.ts`'s `waitForModality` waits on `getByRole('button', { name: /reset/i })` — that still resolves, now from inside the stage. `stage.spec.ts` may assert on the control bar's position relative to the layout; update rather than delete those assertions.

- [ ] **Step 9: Commit**

```bash
git add -A web/app web/test
git commit -m "refactor(viewer): CopperStage owns its control bar and its load gate

The provide/inject seam existed only because the bar lived in a sibling
slot of the layout; with a bar per panel it has nothing to bridge, so
useStageControls is deleted rather than adapted.

The load gate is the host's own measured size: three stages stay mounted
(unmounting destroys a renderer, feedback item 5) and only the ones CSS
has given a box download anything. No breakpoint literal in JS -- the
measurement is what CSS already decided.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Three-up when there is room, one-up when there is not

**Files:**
- Create: `web/app/components/stage/CasePanels.vue`
- Create: `web/app/components/stage/PanelTabs.vue`
- Modify: `web/app/pages/[slug]/[[modality]].vue`
- Modify: `web/app/layouts/default.vue`
- Modify: `web/app/components/content/ModalityText.vue` (heading for the focused slot)
- Delete: `web/app/components/stage/ModalityStepper.vue` (replaced by `PanelTabs`)
- Test: `web/test/CasePanels.test.ts`, `web/test/PanelTabs.test.ts`, `web/test/CasePage.test.ts`, `web/test/DefaultLayout.test.ts`
- Delete: `web/test/ModalityStepper.test.ts`

**Interfaces:**
- Consumes: `Panel`, `PanelId`, `getPanel`, `panelIdOf` (Task 1); `CopperStage`'s `panelLabel` and `compact` props (Task 4).
- Produces: `CasePanels` takes `{ case: Case; modalityId: ModalityId }` and renders three `CopperStage`s.

**Background.** The client asked: "Is it possible to show the different panels: anatomy, mammogram/ultrasound, MRI etc on the same page but if the width is too small then it switches to the current approach where you have to click next or switch panels manually?" — with the reason: the old version showed all three so a lecturer could look across them, and the new one is more digestible because it shows one paragraph at a time. Both, then: three canvases, one paragraph.

**Container query, not a viewport breakpoint.** The threshold is the *stage column's* width, so collapsing the sidebar and the content panel — which the header already offers, for exactly this projection use case — can promote a 1440px laptop into three-up. A viewport breakpoint cannot do that. `@container (min-width: 1000px)` gives each panel about 333px at the threshold.

**Variant state is local, not in the URL.** The URL carries one modality, which is the focused one. A slot showing a non-default variant keeps that in component state, so a lecturer can put the middle slot on 2D ultrasound, focus the MRI, and have the ultrasound stay. This is stated with its trade-off in the spec's §4.3: the combination does not survive a reload.

- [ ] **Step 1: Write `PanelTabs` and its failing test**

Create `web/test/PanelTabs.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { getCase } from '../content/cases'
import PanelTabs from '../app/components/stage/PanelTabs.vue'

const NuxtLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

function mountTabs(slug: string, active: string, variants: Record<string, string> = {}) {
  return mount(PanelTabs, {
    props: { case: getCase(slug)!, activePanel: active, variants },
    global: { stubs: { NuxtLink: NuxtLinkStub } },
  })
}

describe('PanelTabs', () => {
  it('lists the three slots, not the four modalities', () => {
    const wrapper = mountTabs('benign-cyst', 'mammogram')
    expect(wrapper.findAll('li').map(li => li.text().trim().split('\n')[0]))
      .toEqual(['Anatomy', 'Mammogram', 'MRI'])
  })

  it('each tab links to its slot\'s current variant', () => {
    const wrapper = mountTabs('benign-cyst', 'anatomy')
    const hrefs = wrapper.findAll('li a').map(a => a.attributes('href'))
    expect(hrefs).toEqual(['/benign-cyst/anatomy', '/benign-cyst/mammogram', '/benign-cyst/mri'])
  })

  it('respects a non-default variant when linking to that slot', () => {
    const wrapper = mountTabs('benign-cyst', 'mri', { mammogram: 'ultrasound' })
    const hrefs = wrapper.findAll('li a').map(a => a.attributes('href'))
    expect(hrefs[1]).toBe('/benign-cyst/ultrasound')
  })

  it('marks the active slot with aria-current', () => {
    const wrapper = mountTabs('benign-cyst', 'mri')
    const current = wrapper.findAll('a[aria-current="step"]')
    expect(current).toHaveLength(1)
    expect(current[0]!.attributes('href')).toBe('/benign-cyst/mri')
  })

  it('offers a variant control only for a slot with two modalities, and only when active', () => {
    expect(mountTabs('benign-cyst', 'mammogram').findAll('[data-variant] button'))
      .toHaveLength(2)
    // Not the active slot -- no variant control to clutter the strip with.
    expect(mountTabs('benign-cyst', 'mri').findAll('[data-variant] button'))
      .toHaveLength(0)
    // No case but benign-cyst has a two-modality slot at all.
    expect(mountTabs('cancer-dcis', 'mammogram').findAll('[data-variant] button'))
      .toHaveLength(0)
  })

  it('the variant control offers 3D first and marks the current one pressed', () => {
    const wrapper = mountTabs('benign-cyst', 'mammogram')
    const buttons = wrapper.findAll('[data-variant] button')
    expect(buttons.map(b => b.text())).toEqual(['3D Mammogram', '2D Ultrasound'])
    expect(buttons[0]!.attributes('aria-pressed')).toBe('true')
  })

  it('emits the chosen variant rather than navigating itself', async () => {
    const wrapper = mountTabs('benign-cyst', 'mammogram')
    await wrapper.findAll('[data-variant] button')[1]!.trigger('click')
    expect(wrapper.emitted('variant')).toEqual([[{ panel: 'mammogram', modality: 'ultrasound' }]])
  })
})
```

Then write `web/app/components/stage/PanelTabs.vue`. It is `ModalityStepper.vue` re-keyed from `ModalityId` to `PanelId`, so **copy that file and edit it** rather than writing a new one — its `STYLE` record (the four hand-drawn modality icons and their ink tokens), the `after:` underline treatment and the `<ol aria-label="Imaging modalities">` shell all carry documented reasoning that must survive. Read its header comment before touching it.

The three changes:

```ts
const props = defineProps<{
  case: Case
  activePanel: PanelId
  /** The non-default modality each slot is currently showing, if any.
   *  Owned by CasePanels; this component only reads it, so a tab links to
   *  the variant its slot is actually on rather than always to the 3D one. */
  variants: Partial<Record<PanelId, ModalityId>>
}>()

const emit = defineEmits<{ variant: [{ panel: PanelId, modality: ModalityId }] }>()

/** `STYLE` keeps all four entries -- `ultrasound` is still drawn, just in
 *  the variant control below rather than as a tab of its own. Tabs read
 *  their icon from the modality their slot is currently showing, so the
 *  middle tab's glyph changes when the reader switches to 2D. */
const tabs = computed(() => props.case.panels.map((panel) => {
  const current = panel.modalities.find(m => m.id === props.variants[panel.id])
    ?? panel.modalities[0]!
  return { panel, current }
}))

/** Left/right arrow keys move between SLOTS (was: between modalities), so
 *  benign-cyst's 2D ultrasound is no longer a step the reader has to pass
 *  through to reach the MRI. */
function onKeydown(event: KeyboardEvent) {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return
  const index = props.case.panels.findIndex(p => p.id === props.activePanel)
  const next = props.case.panels[index + delta]
  if (!next) return
  event.preventDefault()
  const target = next.modalities.find(m => m.id === props.variants[next.id])
    ?? next.modalities[0]!
  navigateTo(`/${props.case.slug}/${target.id}`)
}
```

and, after the active tab's `<span>`, the variant control the test above asserts on:

```vue
        <span
          v-if="t.panel.id === props.activePanel && t.panel.modalities.length > 1"
          data-variant
          class="ml-1 flex gap-1"
        >
          <button
            v-for="m in t.panel.modalities"
            :key="m.id"
            type="button"
            class="rounded-chip px-2 py-0.5 text-caption"
            :class="m.id === t.current.id
              ? 'bg-brand-subtle font-bold text-brand-hover'
              : 'text-text-muted hover:bg-surface-sunken'"
            :aria-pressed="m.id === t.current.id"
            @click.prevent="emit('variant', { panel: t.panel.id, modality: m.id })"
          >
            {{ m.label }}
          </button>
        </span>
```

Note the `.prevent`: these buttons sit inside the tab's `<NuxtLink>`, so without it a click would both emit and follow the link.

- [ ] **Step 2: Run the `PanelTabs` test**

```
yarn vitest run test/PanelTabs.test.ts
```

Expected: PASS.

- [ ] **Step 3: Write `CasePanels`'s failing test**

Create `web/test/CasePanels.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { getCase } from '../content/cases'
import CasePanels from '../app/components/stage/CasePanels.vue'

const CopperStageStub = {
  props: ['slug', 'group', 'lesionSliceIndex', 'modality', 'panelLabel', 'compact'],
  template: '<div data-stage :data-modality="modality.id" :data-label="panelLabel" />',
}

function mountPanels(slug: string, modalityId: string) {
  return mount(CasePanels, {
    props: { case: getCase(slug)!, modalityId },
    global: { stubs: { CopperStage: CopperStageStub, PanelTabs: true } },
  })
}

describe('CasePanels', () => {
  /**
   * All three are ALWAYS mounted, at every width. Unmounting one destroys
   * its renderer and everything decoded into it (client feedback item 5);
   * CSS hides them and CopperStage's own size gate decides what downloads.
   */
  it('mounts one stage per slot at every width', () => {
    expect(mountPanels('density-a', 'mri').findAll('[data-stage]')).toHaveLength(3)
    expect(mountPanels('benign-cyst', 'anatomy').findAll('[data-stage]')).toHaveLength(3)
  })

  it('gives each stage its slot\'s default variant', () => {
    const wrapper = mountPanels('benign-cyst', 'anatomy')
    expect(wrapper.findAll('[data-stage]').map(s => s.attributes('data-modality')))
      .toEqual(['anatomy', 'mammogram', 'mri'])
  })

  it('gives the focused slot the modality the URL asked for', () => {
    const wrapper = mountPanels('benign-cyst', 'ultrasound')
    expect(wrapper.findAll('[data-stage]').map(s => s.attributes('data-modality')))
      .toEqual(['anatomy', 'ultrasound', 'mri'])
  })

  it('marks exactly one panel focused, the one holding the URL\'s modality', () => {
    const wrapper = mountPanels('benign-cyst', 'ultrasound')
    const focused = wrapper.findAll('[data-panel][data-focused="true"]')
    expect(focused).toHaveLength(1)
    expect(focused[0]!.attributes('data-panel')).toBe('mammogram')
  })

  /**
   * The lecturer case from the spec's §4.3: put the middle slot on 2D,
   * then focus the MRI, and the middle slot stays on 2D.
   */
  it('keeps a chosen variant when focus moves to another slot', async () => {
    const wrapper = mountPanels('benign-cyst', 'ultrasound')
    await wrapper.setProps({ modalityId: 'mri' })
    expect(wrapper.findAll('[data-stage]').map(s => s.attributes('data-modality')))
      .toEqual(['anatomy', 'ultrasound', 'mri'])
  })

  it('passes the lesion index only to the MRI panel', () => {
    const wrapper = mountPanels('cancer-dcis', 'mri')
    const stages = wrapper.findAllComponents(CopperStageStub)
    expect(stages.map(s => s.props('lesionSliceIndex'))).toEqual([0, 0, 90])
  })

  it('labels each stage with its slot', () => {
    const wrapper = mountPanels('density-a', 'anatomy')
    expect(wrapper.findAll('[data-stage]').map(s => s.attributes('data-label')))
      .toEqual(['Anatomy', 'Mammogram', 'MRI'])
  })
})
```

- [ ] **Step 4: Run and confirm it fails**

```
yarn vitest run test/CasePanels.test.ts
```

- [ ] **Step 5: Write `CasePanels.vue`**

```vue
<script setup lang="ts">
import { getPanel, lesionSliceIndexFor, panelIdOf } from '~~/content/cases'
import type { Case, ModalityId, PanelId } from '~~/content/types'

const props = defineProps<{ case: Case, modalityId: ModalityId }>()

/**
 * Which slot the URL's modality lives in. That slot is the focused one:
 * three-up highlights it and shows its paragraph; one-up shows only it.
 */
const focusedPanel = computed<PanelId>(
  () => panelIdOf(props.case, props.modalityId) ?? 'anatomy',
)

/**
 * The non-default variant a slot is currently showing, if any.
 *
 * LOCAL state, deliberately not in the URL (spec §4.3). The URL carries
 * one modality and that is the focused one, so a lecturer who puts the
 * middle slot on 2D ultrasound and then focuses the MRI would otherwise
 * see the middle slot snap back to 3D. The cost is that the combination
 * does not survive a page reload, which is the right trade against a
 * query param that every prerendered route and legacy redirect would
 * have to learn about.
 */
const variants = ref<Partial<Record<PanelId, ModalityId>>>({})

// Seeded from the URL: navigating straight to /benign-cyst/ultrasound must
// put the middle slot on 2D, not merely focus a slot showing 3D.
watchEffect(() => {
  const panel = panelIdOf(props.case, props.modalityId)
  if (panel) variants.value[panel] = props.modalityId
})

/** The modality each slot is showing: its remembered variant if it has
 *  one and the case still offers it, otherwise the slot's 3D default. */
function modalityFor(id: PanelId) {
  const panel = getPanel(props.case, id)!
  const chosen = variants.value[id]
  return panel.modalities.find(m => m.id === chosen) ?? panel.modalities[0]!
}

function onVariant(choice: { panel: PanelId, modality: ModalityId }) {
  variants.value[choice.panel] = choice.modality
  // Choosing a variant also focuses its slot -- the URL always names the
  // focused modality, and there is exactly one URL.
  navigateTo(`/${props.case.slug}/${choice.modality}`)
}
</script>

<template>
  <div class="@container flex min-h-0 min-w-0 flex-1 flex-col">
    <!--
      One-up only: the slot strip. Three-up labels each panel in place, so
      a strip there would name the same three things twice.
    -->
    <PanelTabs
      :case="props.case"
      :active-panel="focusedPanel"
      :variants="variants"
      class="shrink-0 border-b border-border bg-surface @[1000px]:hidden"
      @variant="onVariant"
    />

    <!--
      Three-up above a 1000px CONTAINER, one-up below it.

      A container query, not a viewport breakpoint, and that is the point:
      the threshold is this column's width, so collapsing the sidebar and
      the content panel (both already offered in the header, for exactly
      this projection case) can promote a 1440px laptop into three-up. A
      viewport breakpoint could not. 1000px gives each panel ~333px.

      All three panels are mounted at every width. Hiding is `hidden`
      (display:none), never `invisible`: a display:none element measures
      0x0, and that measurement is the whole load gate inside CopperStage.
    -->
    <div
      class="flex min-h-0 flex-1 flex-col
             @[1000px]:grid @[1000px]:grid-cols-3 @[1000px]:gap-px @[1000px]:bg-border"
    >
      <div
        v-for="panel in props.case.panels"
        :key="panel.id"
        :data-panel="panel.id"
        :data-focused="panel.id === focusedPanel"
        class="min-h-0 min-w-0 flex-col"
        :class="[
          panel.id === focusedPanel ? 'flex' : 'hidden @[1000px]:flex',
          panel.id === focusedPanel ? '@[1000px]:ring-2 @[1000px]:ring-inset @[1000px]:ring-brand' : '',
        ]"
        @focusin="navigateTo(`/${props.case.slug}/${modalityFor(panel.id).id}`)"
      >
        <!-- Three-up only: the slot's own label, plus its variant control
             where it has one. One-up gets both from PanelTabs above. -->
        <div class="hidden items-center gap-2 border-b border-border bg-surface px-3 py-1.5 @[1000px]:flex">
          <span class="text-caption font-bold uppercase tracking-wide text-text-muted">
            {{ panel.label }}
          </span>
          <span v-if="panel.modalities.length > 1" data-variant class="ml-auto flex gap-1">
            <button
              v-for="m in panel.modalities"
              :key="m.id"
              type="button"
              class="rounded-chip px-2 py-0.5 text-caption"
              :class="m.id === modalityFor(panel.id).id
                ? 'bg-brand-subtle font-bold text-brand-hover'
                : 'text-text-muted hover:bg-surface-sunken'"
              :aria-pressed="m.id === modalityFor(panel.id).id"
              @click="onVariant({ panel: panel.id, modality: m.id })"
            >
              {{ m.label }}
            </button>
          </span>
        </div>

        <CopperStage
          :slug="props.case.slug"
          :group="props.case.group"
          :panel-label="panel.label"
          :lesion-slice-index="lesionSliceIndexFor(props.case, modalityFor(panel.id).id)"
          :modality="modalityFor(panel.id)"
          :compact="true"
        />
      </div>
    </div>
  </div>
</template>
```

Note on `compact`: it is hardcoded `true` here because a container query cannot be read from `<script>` without reintroducing a JS breakpoint. If the one-up bar reads too sparse with icon-only buttons, express the labels with a `@[1000px]:hidden` span inside `StageControls` instead of a prop — that keeps the decision in CSS. Do whichever looks right and record the choice in the component's comment.

- [ ] **Step 6: Run the `CasePanels` test**

```
yarn vitest run test/CasePanels.test.ts
```

Expected: PASS.

- [ ] **Step 7: Rewire the page and the layout**

In `web/app/pages/[slug]/[[modality]].vue`: delete the `#stepper` and `#controls` template blocks, and replace the `#stage` block with:

```vue
    <template #stage>
      <CasePanels :case="current!" :modality-id="modalityId" />
    </template>
```

Keep the `#heading`, `#content` and `#prevnext` blocks and the `validate` guard as they are. `lesionSliceIndex` is now computed per panel inside `CasePanels`, so the page's own `lesionSliceIndex` computed goes.

In `web/app/layouts/default.vue`: delete the `<slot name="stepper" />` and `<slot name="controls" />` lines and their comments, and let the `#stage` slot fill the column.

Delete `web/app/components/stage/ModalityStepper.vue` and `web/test/ModalityStepper.test.ts`.

In `web/app/components/content/ModalityText.vue`, add the slot's name above the paragraph so a reader in three-up can tell which panel the text belongs to. Take the label from the modality already passed in; add no new prop if `Modality.label` is enough.

- [ ] **Step 8: Run the whole unit suite**

```
yarn test
```

Expected: PASS. `CasePage.test.ts` and `DefaultLayout.test.ts` both assert on the removed slots and need rewriting to the new arrangement.

- [ ] **Step 9: Look at it, at both widths**

Run `yarn dev`.

- At 1920 wide, open `/benign-cyst`. Three panels side by side, the anatomy one ringed. Click the MRI panel — the ring and the right-hand paragraph both move. Set the middle slot to `2D Ultrasound`, then click the MRI panel, and confirm the middle slot stays on 2D.
- Collapse the sidebar and the content panel from the header at 1440 and confirm the layout promotes to three-up.
- Narrow the window to 1180 (the client's iPad width). One panel, with the slot strip above it, exactly as today.

- [ ] **Step 10: Commit**

```bash
git add -A web/app web/test
git commit -m "feat(viewer): three panels side by side when the column has room

Client feedback item 6. anatomy / mammogram / MRI render together above a
1000px CONTAINER width and fall back to today's one-at-a-time strip below
it. A container query rather than a viewport breakpoint, so collapsing
the sidebar and the content panel promotes a 1440px laptop into three-up
-- which is the projection case the client described.

Only the focused panel's paragraph is shown, which is the readability
the client asked to keep. A slot's 2D/3D choice is local state, so it
survives focus moving elsewhere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Browser acceptance

**Files:**
- Create: `web/test-browser/three-up.spec.ts`
- Modify: `web/test-browser/a11y.spec.ts`, `web/test-browser/acceptance.spec.ts`

**Interfaces:**
- Consumes: everything above.

**Background.** Every existing browser spec assumes one canvas. `a11y.spec.ts`'s `waitForModality` asserts `toHaveCount(1)` on `page.locator('canvas')`. That is now three at every width — three stages are always mounted, and a `display: none` stage still has a canvas in the DOM. Fix the helper rather than the app.

- [ ] **Step 1: Repair the shared helper**

In `web/test-browser/a11y.spec.ts`, change `waitForModality` to scope to the focused panel:

```ts
async function waitForModality(page: Page) {
  const focused = page.locator('[data-panel][data-focused="true"]')
  await expect(focused.locator('canvas')).toHaveCount(1, { timeout: 60_000 })
  await expect(focused.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })
  await expect(focused.getByRole('button', { name: /reset/i })).toBeEnabled({ timeout: 60_000 })
}
```

- [ ] **Step 2: Write the acceptance spec**

Create `web/test-browser/three-up.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

/** Wide enough that the stage column clears the 1000px container
 *  threshold even with both side panels open. */
const WIDE = { width: 1920, height: 1080 }
/** The client's own device. Below the threshold, so one-up. */
const IPAD = { width: 1180, height: 820 }

async function waitForFocusedPanel(page: import('@playwright/test').Page) {
  const focused = page.locator('[data-panel][data-focused="true"]')
  await expect(focused.getByRole('status').filter({ hasText: /^Loading/ }))
    .toBeHidden({ timeout: 150_000 })
}

test('three panels are visible side by side on a wide screen', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await page.goto('/density-a')

  const panels = page.locator('[data-panel]')
  await expect(panels).toHaveCount(3)
  for (let i = 0; i < 3; i++) await expect(panels.nth(i)).toBeVisible()

  // Side by side, not stacked: all three share a top edge.
  const boxes = await panels.evaluateAll(els => els.map(e => e.getBoundingClientRect().top))
  expect(new Set(boxes.map(Math.round)).size).toBe(1)
})

test('only the focused panel is visible on the client\'s iPad width', async ({ page }) => {
  await page.setViewportSize(IPAD)
  await page.goto('/density-a')

  await expect(page.locator('[data-panel]')).toHaveCount(3)
  await expect(page.locator('[data-panel]:visible')).toHaveCount(1)
  await expect(page.locator('[data-panel][data-focused="true"]')).toBeVisible()
})

/**
 * The load gate. One-up must still cost exactly one asset -- three stages
 * are mounted but two have no box, so they download nothing.
 */
test('one-up downloads one asset, three-up downloads three', async ({ page }) => {
  const assets: string[] = []
  page.on('request', (r) => {
    if (/\.(nrrd|glb)(\?|$)/.test(r.url())) assets.push(new URL(r.url()).pathname)
  })

  await page.setViewportSize(IPAD)
  await page.goto('/density-a')
  await waitForFocusedPanel(page)
  expect(assets).toHaveLength(1)

  await page.setViewportSize(WIDE)
  await expect(page.locator('[data-panel]:visible')).toHaveCount(3)
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ }))
    .toHaveCount(0, { timeout: 150_000 })
  expect(assets).toHaveLength(3)
})

/** Client feedback item 7, measured. */
test('the rendered volume fills most of its panel', async ({ page }) => {
  await page.setViewportSize(IPAD)
  await page.goto('/cancer-dcis/mri')
  await waitForFocusedPanel(page)

  // Count non-black pixels per row of the canvas and find the extent of
  // the drawn content. Before fit-to-view this was roughly a quarter of
  // the height; the fit targets ~92% with an 8% margin.
  const coverage = await page.locator('[data-focused="true"] canvas').evaluate((canvas) => {
    const el = canvas as HTMLCanvasElement
    const gl = el.getContext('webgl2') ?? el.getContext('webgl')
    if (!gl) return null
    const pixels = new Uint8Array(el.width * el.height * 4)
    gl.readPixels(0, 0, el.width, el.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let top = el.height
    let bottom = 0
    for (let y = 0; y < el.height; y++) {
      for (let x = 0; x < el.width; x++) {
        if (pixels[(y * el.width + x) * 4 + 3]! > 8) {
          if (y < top) top = y
          if (y > bottom) bottom = y
          break
        }
      }
    }
    return bottom > top ? (bottom - top) / el.height : 0
  })

  expect(coverage).not.toBeNull()
  console.log(`vertical coverage: ${((coverage as number) * 100).toFixed(1)}%`)
  expect(coverage as number).toBeGreaterThan(0.6)
})

/** Client feedback item 2. */
test('every lesion case offers an anatomy panel', async ({ page }) => {
  await page.setViewportSize(IPAD)
  for (const slug of ['benign-cyst', 'benign-fibroadenoma', 'cancer-dcis', 'cancer-lobular', 'cancer-ductal']) {
    await page.goto(`/${slug}/anatomy`)
    await waitForFocusedPanel(page)
    await expect(page.locator('[data-panel="anatomy"][data-focused="true"]')).toBeVisible()
  }
})
```

The WebGL read-back above assumes `preserveDrawingBuffer`. copper3d's renderer does not set it, so `readPixels` after a frame has been presented returns zeros. If the coverage measurement comes back 0 on a page that visibly renders, take a Playwright screenshot of the canvas element instead and measure the PNG with `pngjs` (already a devDependency, and `nrrd-gzip.test.ts` shows the pattern). Do not lower the threshold to make a broken measurement pass.

- [ ] **Step 3: Run the browser suite**

```
yarn test:browser
```

Expected: PASS. `acceptance.spec.ts`'s "the-breast first screen pulls one GLB and no volume" uses the default 1280×720 viewport, where the stage column is well under 1000px, so it should still see exactly one asset — confirm that rather than assuming it.

- [ ] **Step 4: Run everything**

```
yarn test
yarn test:browser
```

- [ ] **Step 5: Commit**

```bash
git add web/test-browser
git commit -m "test(browser): acceptance for three-up, the load gate and framing

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done criteria

- `yarn test` and `yarn test:browser` pass from `web/`.
- At 1920 wide, a case page shows anatomy, mammogram and MRI side by side, one of them ringed, with only that one's paragraph in the content column.
- At 1180 wide (the client's iPad), one panel with a slot strip, exactly as before.
- Collapsing both side panels at 1440 promotes the layout to three-up.
- `benign-cyst`'s middle slot switches between 3D Mammogram and 2D Ultrasound, defaults to 3D, and keeps the choice when focus moves.
- All five lesion cases show an anatomy panel using `density-3/left/density75.glb`.
- Clicking sidebar links away from a case and back does not re-request its `.nrrd`.
- An MRI fills most of its panel rather than a quarter of it.

## Out of scope

Client item 4 (MRI images too dark) is deliberately not addressed here. The suspected cause is window/level rather than the camera, and it has not been measured. See the spec's §11.
