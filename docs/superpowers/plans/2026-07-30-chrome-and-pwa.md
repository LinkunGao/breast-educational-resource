# Chrome & PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five client-feedback items that touch only navigation chrome, case headings, and app packaging — About alignment, BI-RADS removal, the sidebar home row and group icons, and a restored installable PWA with its icon.

**Architecture:** Every task here is a self-contained edit to one or two files plus its tests. Nothing in this plan touches the 3D stage, the content model's `modalities` array, or the layout's column structure — those belong to the sibling plan `2026-07-30-three-up-viewer.md` and the two can land in either order.

**Tech Stack:** Nuxt 4.5, Vue 3.5, TypeScript, Tailwind 4, Pinia 4, Vitest 4 + happy-dom + @vue/test-utils, Playwright 1.62.

**Spec:** [`docs/superpowers/specs/2026-07-30-client-feedback-round-1-design.md`](../specs/2026-07-30-client-feedback-round-1-design.md) §8 and §9.

## Global Constraints

- **Medical copy is never edited.** The strings in `web/content/copy.generated.ts` are byte-for-byte clinical copy containing zero-width spaces and double spaces. Never retype, reflow, or "fix" them. `Case.title` and `Modality.label` are navigation labels, not medical copy, and may be changed.
- **CSS decides layout.** No breakpoint pixel literals in JavaScript. Where a component must know which tier it is in, probe what CSS already decided (e.g. `getComputedStyle(el).position`), as `CaseSidebar.vue` already does.
- **Comments in English**, even though the spec and commit discussion are in Chinese.
- Tailwind breakpoints in use: `md` = 768px, `xl` = 1280px. `xl` is the desktop/tablet divide throughout.
- Unit tests run with plain Vitest (no Nuxt runtime). Nuxt auto-imports are stubbed onto `globalThis` in `web/test/setup.ts`; a new auto-import used by a component under test must be added there or the test throws `ReferenceError`.
- Run unit tests from `web/`: `yarn test`. Run browser tests from `web/`: `yarn test:browser`.
- Commit after every task. Branch is `rebuild/foundation`; do not push unless asked.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `web/app/components/nav/AppHeader.vue` | Modify — move `ml-auto` onto the About link | 1 |
| `web/test/AppHeader.test.ts` | Modify — assert the right-alignment class lives on About | 1 |
| `web/test-browser/a11y.spec.ts` | Modify — add a below-xl geometry check for About | 1 |
| `web/content/types.ts` | Modify — delete `BiRads`, `Case.biRads`, `Case.referenceDensity` | 2 |
| `web/content/cases.ts` | Modify — drop the BI-RADS args, rename density titles | 2 |
| `web/app/components/content/CaseHeader.vue` | Modify — delete badge and reference-density line | 2 |
| `web/app/layouts/default.vue` | Modify — one stale comment | 2 |
| `web/test/cases.test.ts` | Modify — drop the `referenceDensity` assertion, add title assertions | 2 |
| `web/test/nav-contrast.test.ts` | Modify — delete the badge contrast block | 2 |
| `web/app/components/nav/CaseSidebar.vue` | Modify — home row, group icons | 3 |
| `web/test/CaseSidebar.test.ts` | Modify — home row is not a group item; icons present | 3 |
| `web/public/icon.png` | Create — the legacy source mark, recovered from git | 4 |
| `web/public/pwa-*.png`, `apple-touch-icon-180x180.png`, `maskable-icon-512x512.png`, `favicon.ico` | Create — generated icon set | 4 |
| `web/package.json` | Modify — add `@vite-pwa/nuxt`, `@vite-pwa/assets-generator`, an `icons` script | 4, 5 |
| `web/pwa-assets.config.ts` | Create — icon generation preset | 4 |
| `web/nuxt.config.ts` | Modify — register the PWA module, manifest, workbox rules, head links | 5 |
| `web/test/pwa.test.ts` | Create — manifest fields and the `modelView` exclusion | 5 |
| `web/test-browser/pwa.spec.ts` | Create — manifest reachable, SW registers, no volumes precached | 5 |

---

### Task 1: About link right-aligns at every width

**Files:**
- Modify: `web/app/components/nav/AppHeader.vue:72-91`
- Test: `web/test/AppHeader.test.ts`
- Test: `web/test-browser/a11y.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

**Background.** `AppHeader.vue` puts `ml-auto` on the content-panel toggle button, and that button is `hidden ... xl:flex`. Below `xl` (1280px) the button is `display: none`, so its `ml-auto` disappears with it and the About link — the next sibling — has nothing pushing it right. On an iPad Air (1180×820) About renders flush against the wordmark. At `xl+` the bug is invisible because the button is there.

The fix is to move the auto margin onto the About link itself, which is present at every width. The `xl+` visual order (wordmark … content toggle, About) is unchanged, because `ml-auto` on About pushes the *pair* right only if the toggle sits after the auto margin — it does not, it sits before. So at `xl+` the toggle would now sit immediately left of About with both pushed right together only if the margin is on the first of them. Put the margin on a wrapper around both instead; that keeps `xl+` byte-identical and fixes below-`xl`.

- [ ] **Step 1: Write the failing unit test**

Add to `web/test/AppHeader.test.ts`, inside the top-level `describe('AppHeader', ...)`:

```ts
  describe('right-hand controls stay right-aligned at every width (client feedback item 10)', () => {
    // The auto margin used to live on the content-panel toggle, which is
    // `hidden ... xl:flex`. Below xl that button is display:none and takes
    // its margin with it, so About collapsed back against the wordmark --
    // visible on an iPad Air (1180px) and invisible on desktop. The margin
    // has to live on something that is present at every width.
    it('the auto margin is not on the xl-only content-panel toggle', () => {
      const wrapper = mountHeader()
      const toggle = wrapper.get('button[aria-label="Toggle content panel"]')
      expect(toggle.classes()).not.toContain('ml-auto')
    })

    it('the auto margin is on a wrapper that renders at every width', () => {
      const wrapper = mountHeader()
      const group = wrapper.get('[data-header-actions]')
      expect(group.classes()).toContain('ml-auto')
      // Nothing may hide the wrapper itself at any tier -- that would
      // reintroduce exactly the bug this block exists for.
      expect(group.classes()).not.toContain('hidden')
      expect(group.classes().some(c => c.endsWith(':hidden'))).toBe(false)
    })

    it('the About link is inside that wrapper', () => {
      const wrapper = mountHeader()
      const about = wrapper.get('[data-header-actions] a[href="/about"]')
      expect(about.text()).toBe('About')
    })
  })
```

- [ ] **Step 2: Run the test and confirm it fails**

Run from `web/`:

```
yarn vitest run test/AppHeader.test.ts
```

Expected: three failures. The first two fail on the missing `[data-header-actions]` element (`get` throws "Unable to get [data-header-actions]"); the `not.toContain('ml-auto')` one fails because the toggle still carries it.

- [ ] **Step 3: Make the change**

In `web/app/components/nav/AppHeader.vue`, replace the content-panel toggle button and the About link (currently the last two elements in the `<header>`) with a wrapper holding both:

```vue
    <!--
      Right-hand header actions.

      `ml-auto` lives HERE and not on the first child, which is the fix for
      client feedback item 10. It used to sit on the content-panel toggle
      below, which is `hidden ... xl:flex`: below xl that button is
      display:none and its auto margin goes with it, so the About link had
      nothing pushing it right and rendered flush against the wordmark. An
      iPad Air (1180px) shows this; a desktop never does, because there the
      button exists. A wrapper that is present at every width cannot have
      that failure mode.
    -->
    <div data-header-actions class="ml-auto flex items-center gap-3">
      <!-- Desktop-only (design doc §10.1): the content column's other half of
           "collapse both panels for projection". Below xl the content pane
           has no collapse concept (bottom sheet at tablet, inline at phone),
           so there is nothing for this control to do there. -->
      <button
        type="button"
        class="hidden size-11 shrink-0 items-center justify-center rounded-ctl text-text-muted hover:bg-surface-sunken xl:flex"
        :aria-expanded="store.contentOpen"
        aria-controls="case-content-panel"
        aria-label="Toggle content panel"
        @click="store.contentOpen = !store.contentOpen"
      >
        <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
          <line x1="15" y1="5" x2="15" y2="19" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>

      <NuxtLink
        to="/about"
        class="flex min-h-11 items-center rounded-ctl px-3 text-body-sm text-text-muted hover:bg-surface-sunken hover:text-text"
      >
        About
      </NuxtLink>
    </div>
```

- [ ] **Step 4: Run the unit tests and confirm they pass**

Run from `web/`:

```
yarn vitest run test/AppHeader.test.ts
```

Expected: PASS, all tests in the file. The pre-existing `only renders (as a flex box) at xl+` test for the content toggle must still pass — the button keeps its own `hidden`/`xl:flex`.

- [ ] **Step 5: Add the browser geometry check**

Append to `web/test-browser/a11y.spec.ts`:

```ts
/**
 * Client feedback item 10, measured rather than asserted through class names.
 *
 * The unit test above can only check which element carries `ml-auto`;
 * happy-dom has no layout engine. This is the tier the bug actually
 * appeared on -- an iPad Air, below xl, where the element that used to
 * carry the margin is display:none.
 */
test('About sits at the right edge of the header below xl', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.goto('/the-breast')

  const header = page.locator('header').first()
  const about = page.getByRole('link', { name: 'About' })
  await expect(about).toBeVisible()

  const headerBox = (await header.boundingBox())!
  const aboutBox = (await about.boundingBox())!

  // Right-aligned: the gap between About's right edge and the header's is
  // the header's own px-4 padding (16px), with a little slack for the
  // rounded hit area. If the margin regressed onto an xl-only element,
  // About lands next to the wordmark and this gap is hundreds of pixels.
  const gap = (headerBox.x + headerBox.width) - (aboutBox.x + aboutBox.width)
  expect(gap).toBeLessThan(32)
  expect(gap).toBeGreaterThanOrEqual(0)
})
```

- [ ] **Step 6: Run the browser test**

Run from `web/`:

```
yarn test:browser test-browser/a11y.spec.ts
```

Expected: PASS. If the dev server is not already up, Playwright starts it (`reuseExistingServer: true`).

- [ ] **Step 7: Commit**

```bash
git add web/app/components/nav/AppHeader.vue web/test/AppHeader.test.ts web/test-browser/a11y.spec.ts
git commit -m "fix(header): right-align About at every width, not only at xl+

The auto margin sat on the content-panel toggle, which is hidden below
xl -- so on an iPad Air the About link lost its push and rendered flush
against the wordmark. Moved onto a wrapper that is present at every
width; the xl+ arrangement is unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Remove BI-RADS

**Files:**
- Modify: `web/content/types.ts:3`, `:26`, `:28`
- Modify: `web/content/cases.ts:2`, `:26-47`, `:49-72`, `:74-87`, `:89-92`
- Modify: `web/app/components/content/CaseHeader.vue:20-50`
- Modify: `web/app/layouts/default.vue:128`
- Test: `web/test/cases.test.ts:110-114`
- Test: `web/test/nav-contrast.test.ts:63`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Case` no longer has `biRads` or `referenceDensity`; the `BiRads` type no longer exists. `Case.title` for the four density cases becomes `'Density A'`…`'Density D'`.

**Background.** The client wrote "There are some minor consistency aspects e.g. BIRADs missing from some titles etc (I think we can remove BIRADS)". Removing the badge alone would leave the sidebar showing four bare letters `A`/`B`/`C`/`D`, which *are* the BI-RADS grades and read as nothing without the label, so the titles change too. `Case.heading` (`Almost entirely fat` and friends) is unchanged.

`Case.referenceDensity` exists only to render the "Reference density background: grade C" line, which goes with the badge. It has one other reader: a `cases.test.ts` assertion, removed here.

- [ ] **Step 1: Write the failing tests**

In `web/test/cases.test.ts`, **delete** this block entirely (lines 110-114):

```ts
describe('borrowed anatomy models are declared', () => {
  it('the-breast declares it borrows density A assets', () => {
    expect(getCase('the-breast')?.referenceDensity).toBe('A')
  })
})
```

and add in its place:

```ts
/**
 * Client feedback item 3: "I think we can remove BIRADS".
 *
 * Removing only the header badge would leave the sidebar showing four bare
 * letters, which ARE the BI-RADS grades and say nothing without the label.
 * The nav titles carry the word instead. `heading` is untouched -- it was
 * never a BI-RADS string.
 */
describe('BI-RADS is gone from the content model', () => {
  it('no case carries a biRads or referenceDensity field', () => {
    for (const c of cases) {
      expect(c).not.toHaveProperty('biRads')
      expect(c).not.toHaveProperty('referenceDensity')
    }
  })

  it('the density series is titled Density A..D in navigation', () => {
    expect(['density-a', 'density-b', 'density-c', 'density-d'].map(s => getCase(s)!.title))
      .toEqual(['Density A', 'Density B', 'Density C', 'Density D'])
  })

  it('the density headings are untouched', () => {
    expect(['density-a', 'density-b', 'density-c', 'density-d'].map(s => getCase(s)!.heading))
      .toEqual([
        'Almost entirely fat',
        'Scattered fibroglandular densities',
        'Heterogeneously dense',
        'Extremely dense',
      ])
  })
})
```

In `web/test/nav-contrast.test.ts`, **delete** the whole `describe` block that begins at line 63 (`'CaseHeader: BI-RADS badge ink on its own highlight background (12px caption text)'`). Read the file first and remove the block and only the block.

Add to `web/test/CaseHeader`-related coverage — if `web/test/` has no `CaseHeader.test.ts`, create it:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { getCase } from '../content/cases'
import CaseHeader from '../app/components/content/CaseHeader.vue'

describe('CaseHeader', () => {
  it('renders the group label and the heading', () => {
    const wrapper = mount(CaseHeader, { props: { case: getCase('density-c')! } })
    expect(wrapper.text()).toContain('Breast Density')
    expect(wrapper.text()).toContain('Heterogeneously dense')
  })

  it('renders no BI-RADS badge (client feedback item 3)', () => {
    for (const slug of ['the-breast', 'density-a', 'density-d', 'cancer-dcis']) {
      const wrapper = mount(CaseHeader, { props: { case: getCase(slug)! } })
      expect(wrapper.text()).not.toMatch(/BI-?RADS/i)
    }
  })

  it('renders no reference-density line (client feedback item 3)', () => {
    for (const slug of ['the-breast', 'cancer-dcis', 'benign-cyst']) {
      const wrapper = mount(CaseHeader, { props: { case: getCase(slug)! } })
      expect(wrapper.text()).not.toMatch(/Reference density/i)
    }
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run from `web/`:

```
yarn vitest run test/cases.test.ts test/CaseHeader.test.ts test/nav-contrast.test.ts
```

Expected: failures in `cases.test.ts` (`biRads` and `referenceDensity` still present; titles still `'A'`…`'D'`) and in `CaseHeader.test.ts` (badge and reference line still rendered). `nav-contrast.test.ts` should pass — you deleted its failing-to-be block rather than adding one.

- [ ] **Step 3: Strip the fields from the type**

In `web/content/types.ts`:

- delete line 3: `export type BiRads = 'A' | 'B' | 'C' | 'D'`
- delete `biRads?: BiRads` and its doc, and `referenceDensity?: BiRads` and its doc, from `interface Case`

- [ ] **Step 4: Strip the fields from the catalogue**

In `web/content/cases.ts`:

- line 2: drop `BiRads` from the type import, leaving `import type { Case, CaseGroup, Modality, ModalityId } from './types'`
- `densityCase(...)`: delete the `biRads: BiRads,` parameter and the `biRads,` property in the returned object
- `lesionCase(...)`: change the return to `return { slug, group, title, heading, lesionSliceIndex, modalities }`
- `the-breast` literal: delete `referenceDensity: 'A',` and the comment line above it that mentions it, replacing that comment with:

```ts
    // Has no assets of its own; borrows density-1 throughout (design doc §4.4)
```

- the four `densityCase(...)` calls lose their sixth argument and gain the new titles:

```ts
  densityCase('density-a', 'density-1', 'density25.glb', 'Density A', 'Almost entirely fat', 'density_1'),
  densityCase('density-b', 'density-2', 'density50.glb', 'Density B', 'Scattered fibroglandular densities', 'density_2'),
  densityCase('density-c', 'density-3', 'density75.glb', 'Density C', 'Heterogeneously dense', 'density_3'),
  densityCase('density-d', 'density-4', 'density100.glb', 'Density D', 'Extremely dense', 'density_4'),
```

- [ ] **Step 5: Strip the badge and the reference line from the header**

In `web/app/components/content/CaseHeader.vue`, replace the whole `<template>` with:

```vue
<template>
  <header>
    <p class="text-caption font-bold uppercase tracking-wide text-text-muted">
      {{ GROUP_LABEL[props.case.group] }}
    </p>

    <!--
      No BI-RADS badge and no "Reference density background: grade X" line.
      Both are gone at the client's instruction (feedback item 3, "I think we
      can remove BIRADS"). The density series carries the grade in its nav
      title instead -- see content/cases.ts.
    -->
    <h1 class="mt-1 text-h1 font-bold text-text xl:text-display">
      {{ props.case.heading }}
    </h1>
  </header>
</template>
```

In `web/app/layouts/default.vue` line 128, update the stale comment:

```
          <!-- Case heading (group label + title). -->
```

- [ ] **Step 6: Run the full unit suite**

Run from `web/`:

```
yarn test
```

Expected: PASS. `cases.test.ts`'s `keyFacts`, copy-fidelity, lesion-index and morph-family blocks are untouched by this task and must still pass; if the copy-fidelity block fails, a medical string was edited by accident — revert and redo.

- [ ] **Step 7: Commit**

```bash
git add web/content/types.ts web/content/cases.ts web/app/components/content/CaseHeader.vue web/app/layouts/default.vue web/test/cases.test.ts web/test/CaseHeader.test.ts web/test/nav-contrast.test.ts
git commit -m "feat(content): remove BI-RADS, name the density cases in nav

Client feedback item 3. The badge and the reference-density line are
gone, along with Case.biRads, Case.referenceDensity and the BiRads type.
The four density cases are titled Density A..D in navigation, because a
bare letter with the label removed says nothing. Headings are unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Sidebar home row and group icons

**Files:**
- Modify: `web/app/components/nav/CaseSidebar.vue:9-24`, `:88-122`
- Test: `web/test/CaseSidebar.test.ts:70-76`

**Interfaces:**
- Consumes: `Case.title` from Task 2 (the density titles are `'Density A'`…). If Task 2 has not landed, the tests here still pass — nothing in this task asserts on density titles.
- Produces: the sidebar renders `the-breast` outside the `<ul>` group lists. Any later test counting `li a` links gets `enabledCases().length - 1`.

**Background.** The client wrote: "Bit of inconsistencies on the top left panel - starts with The breast heading under a bullet point when seems it should be a section on it's own?" `the-breast` is already the target of `/`'s 302 redirect (`pages/index.vue`), so it *is* the home page; the sidebar just does not look like it. It renders inside the `overview` group, whose `GROUP_LABEL` is `''`, so it appears as an unlabelled bullet above the first real group heading.

Item 9 ("加点 icon 来丰富一下") is folded in here because it edits the same two regions of the same file. Icons go on the home row and on the three group headings only — not on the nine case rows. Nine 16px glyphs distinguishing A/B/C/D, Cyst/Fibroadenoma and DCIS/Lobular/Ductal cannot be drawn legibly, and `ModalityStepper.vue`'s header records what happened last time abstract glyphs were tried here.

- [ ] **Step 1: Write the failing test**

In `web/test/CaseSidebar.test.ts`, replace the existing test at lines 70-76 (`does not render a group heading for the label-less overview group`) with:

```ts
  /**
   * Client feedback item 8: "starts with The breast heading under a bullet
   * point when seems it should be a section on it's own". It is already the
   * target of `/`'s redirect, so it is the home page; it just did not look
   * like one.
   */
  describe('the-breast is the home row, not a case bullet', () => {
    it('renders outside the group lists', () => {
      const wrapper = mountSidebar()
      const groupHrefs = wrapper.findAll('li a').map(a => a.attributes('href'))
      expect(groupHrefs).not.toContain('/the-breast')
    })

    it('still links to /the-breast, from a dedicated home row', () => {
      const wrapper = mountSidebar()
      const home = wrapper.get('[data-home-row]')
      expect(home.attributes('href')).toBe('/the-breast')
      expect(home.text()).toContain('The Breast')
    })

    it('marks the home row as current when it is the active case', () => {
      const store = useViewerStore()
      store.caseSlug = 'the-breast'
      const wrapper = mountSidebar()
      expect(wrapper.get('[data-home-row]').attributes('aria-current')).toBe('page')
      expect(wrapper.findAll('a[aria-current="page"]')).toHaveLength(1)
    })

    it('does not mark the home row as current on another case', () => {
      const store = useViewerStore()
      store.caseSlug = 'density-c'
      const wrapper = mountSidebar()
      expect(wrapper.get('[data-home-row]').attributes('aria-current')).toBeUndefined()
    })

    it('renders exactly the three real group headings and no empty one', () => {
      const wrapper = mountSidebar()
      expect(wrapper.findAll('h2').map(h => h.text()))
        .toEqual(['Breast Density', 'Benign Conditions', 'Breast Cancer'])
    })
  })

  /** Client feedback item 9. Icons on the home row and the three group
   *  headings only -- deliberately not one per case, see the component. */
  describe('icons', () => {
    it('the home row has one', () => {
      const wrapper = mountSidebar()
      expect(wrapper.get('[data-home-row]').findAll('svg')).toHaveLength(1)
    })

    it('each group heading has one, marked decorative', () => {
      const wrapper = mountSidebar()
      const headings = wrapper.findAll('h2')
      expect(headings).toHaveLength(3)
      for (const h of headings) {
        const icons = h.findAll('svg')
        expect(icons).toHaveLength(1)
        expect(icons[0]!.attributes('aria-hidden')).toBe('true')
      }
    })

    it('case rows keep their dot and gain no icon', () => {
      const wrapper = mountSidebar()
      for (const row of wrapper.findAll('li a')) {
        expect(row.findAll('svg')).toHaveLength(0)
      }
    })
  })
```

Then fix the existing `lists exactly the enabled cases, never the disabled one` test, which counts `li a` and will now be one short:

```ts
  it('lists exactly the enabled cases, never the disabled one', () => {
    const wrapper = mountSidebar()
    // Scoped to the case list. The sidebar also carries a partner-logo link
    // to /about at its foot and (since client feedback item 8) a dedicated
    // home row above the groups -- neither is a case bullet and neither may
    // be counted here.
    const links = wrapper.findAll('li a')
      .map(el => wrapper.findAllComponents(NuxtLinkStub).find(c => c.element === el.element)!)
    const grouped = enabledCases().filter(c => c.slug !== 'the-breast')
    expect(links).toHaveLength(grouped.length)
    const hrefs = links.map(l => l.props('to'))
    expect(hrefs).not.toContain('/benign-calcifications')
    expect(hrefs).not.toContain('/the-breast')
    for (const c of grouped) {
      expect(hrefs).toContain(`/${c.slug}`)
    }
  })
```

The focus-trap tests further down the file use `wrapper.findAll('a')` unscoped and keep working: the home row is a focusable `<a>` inside the same `<nav>`, so it simply becomes the new first tab stop.

- [ ] **Step 2: Run the test and confirm it fails**

Run from `web/`:

```
yarn vitest run test/CaseSidebar.test.ts
```

Expected: failures on the missing `[data-home-row]` element, and on `li a` still containing `/the-breast`.

- [ ] **Step 3: Rewrite the component**

Replace `web/app/components/nav/CaseSidebar.vue`'s `GROUP_LABEL` / `groups` block (lines 9-24) with:

```ts
const GROUP_LABEL: Record<Exclude<CaseGroup, 'overview'>, string> = {
  density: 'Breast Density',
  benign: 'Benign Conditions',
  cancer: 'Breast Cancer',
}

/**
 * Per-group icon paths (client feedback item 9), drawn stroke-only at
 * 24×24 so they read at 16px and inherit the heading's own colour.
 *
 * Icons are on the home row and the three group headings ONLY, never on
 * the nine case rows. Nine glyphs that distinguish A/B/C/D, Cyst from
 * Fibroadenoma, and DCIS from Lobular from Ductal cannot be drawn legibly
 * at this size -- see ModalityStepper.vue's header for what happened the
 * last time abstract geometry was tried in this app.
 *
 *   density   three horizontal bands, increasingly dense
 *   benign    a smooth closed ellipse -- a well-circumscribed lesion
 *   cancer    a lobulated outline with spiculations off it
 */
const GROUP_ICON: Record<Exclude<CaseGroup, 'overview'>, string[]> = {
  density: ['M4 7h16', 'M4 12h16', 'M4 17h16', 'M8 12v5', 'M12 12v5', 'M16 12v5'],
  benign: ['M12 5.5c3.6 0 6.5 2.9 6.5 6.5s-2.9 6.5-6.5 6.5S5.5 15.6 5.5 12 8.4 5.5 12 5.5z'],
  cancer: [
    'M12 7.5c2.5 0 4.5 2 4.5 4.5S14.5 16.5 12 16.5 7.5 14.5 7.5 12 9.5 7.5 12 7.5z',
    'M12 7.5V4', 'M16.5 12H20', 'M12 16.5V20', 'M7.5 12H4',
    'M15.2 8.8 17.7 6.3', 'M15.2 15.2l2.5 2.5', 'M8.8 15.2l-2.5 2.5', 'M8.8 8.8 6.3 6.3',
  ],
}

/** The home row's own icon: a breast in profile against the chest wall,
 *  the same mark ModalityStepper uses for the anatomy step, so the two
 *  places that mean "the model" agree. */
const HOME_ICON = ['M4.5 3.5v17', 'M4.5 5.5a6.5 6.5 0 0 1 0 13', 'M11 12h3.5']

/**
 * `the-breast` is pulled OUT of the grouped lists (client feedback item 8).
 * It is already `/`'s redirect target, so it is the home page; rendering it
 * as an unlabelled bullet above the first group heading made it read as
 * just another case.
 */
const home = computed(() => enabledCases().find(c => c.slug === 'the-breast'))

/** Grouped by `group`, preserving cases.ts's declaration order. `overview`
 *  is absent by construction: its one member is the home row above. */
const groups = computed(() => {
  const order = ['density', 'benign', 'cancer'] as const
  return order.map(group => ({
    group,
    label: GROUP_LABEL[group],
    icon: GROUP_ICON[group],
    items: enabledCases().filter(c => c.group === group),
  })).filter(g => g.items.length > 0)
})
```

Replace the `<template>`'s group loop (lines 96-122) with the home row followed by the groups:

```vue
    <NuxtLink
      v-if="home"
      data-home-row
      :to="`/${home.slug}`"
      class="-mt-1 flex min-h-11 items-center gap-2.5 rounded-ctl border-b border-border px-2 pb-3 text-body font-bold"
      :class="home.slug === store.caseSlug
        ? 'text-anatomy-ink'
        : 'text-text hover:bg-surface-sunken'"
      :aria-current="home.slug === store.caseSlug ? 'page' : undefined"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path v-for="d in HOME_ICON" :key="d" :d="d" />
      </svg>
      {{ home.title }}
    </NuxtLink>

    <div v-for="g in groups" :key="g.group">
      <h2
        class="mb-2 flex items-center gap-1.5 px-2 text-caption font-bold uppercase tracking-wide text-text-muted"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-for="d in g.icon" :key="d" :d="d" />
        </svg>
        {{ g.label }}
      </h2>
      <ul class="flex flex-col gap-0.5">
        <li v-for="c in g.items" :key="c.slug">
          <NuxtLink
            :to="`/${c.slug}`"
            class="flex min-h-11 items-center gap-2 rounded-ctl px-2 text-body-sm hover:bg-surface-sunken"
            :class="c.slug === store.caseSlug
              ? 'bg-brand-subtle font-bold text-anatomy-ink'
              : 'text-text-muted'"
            :aria-current="c.slug === store.caseSlug ? 'page' : undefined"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="c.slug === store.caseSlug ? 'bg-brand' : 'bg-border-strong'"
              aria-hidden="true"
            />
            {{ c.title }}
          </NuxtLink>
        </li>
      </ul>
    </div>
```

The `h2`'s `v-if="g.label"` is gone: every remaining group has a label.

- [ ] **Step 4: Run the tests and confirm they pass**

Run from `web/`:

```
yarn vitest run test/CaseSidebar.test.ts
```

Expected: PASS, including the pre-existing focus-trap block.

- [ ] **Step 5: Run the full unit suite**

Run from `web/`:

```
yarn test
```

Expected: PASS. `nav-contrast.test.ts` may assert on sidebar colour tokens; the home row introduces `text-text` and `text-anatomy-ink` on `--color-surface`, both already used elsewhere in that file's table. If it fails, add the pair rather than changing the colours.

- [ ] **Step 6: Look at it**

Run `yarn dev` from `web/` and open `http://localhost:3158/the-breast`. Confirm: the home row sits above `BREAST DENSITY` with a rule under it, carries an icon and no dot, and reads as bolder than the case rows. Confirm the three group headings each show a small glyph. Then open `/density-c` and confirm the home row is no longer highlighted.

- [ ] **Step 7: Commit**

```bash
git add web/app/components/nav/CaseSidebar.vue web/test/CaseSidebar.test.ts
git commit -m "feat(nav): make The Breast a home row, add group icons

Client feedback items 8 and 9. the-breast is / 's redirect target, so it
is the home page, but it rendered as an unlabelled bullet above the first
group heading. It now sits above the groups with its own icon and a rule
under it. Group headings gain an icon each; case rows keep their dots --
nine legible 16px glyphs for A/B/C/D and five lesion types do not exist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Recover and generate the PWA icon set

**Files:**
- Create: `web/public/icon.png`
- Create: `scripts/recover-legacy-icon.mjs`
- Create: `scripts/generate-pwa-icons.mjs`
- Create (generated): `web/public/pwa-64x64.png`, `web/public/pwa-192x192.png`, `web/public/pwa-512x512.png`, `web/public/maskable-icon-512x512.png`, `web/public/apple-touch-icon-180x180.png`
- Modify: `web/public/favicon.ico`
- Modify: `web/package.json`
- Test: `web/test/pwa-icons.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the six PNG files above under `web/public/`, at exactly those names — Task 5's manifest and `<head>` links reference them verbatim.

**Background and a known limitation.** The client pointed at `frontend/static/icon.png` on `main`. That blob is still in this repository's history, so no network fetch is needed:

```
git show main:frontend/static/icon.png
```

**It is 88×88, 8-bit RGB, no alpha, 15,214 bytes.** A 512×512 maskable icon upscaled from an 88×88 source will be visibly soft on a home screen. There is nothing in the repo at a higher resolution. Proceed with the upscale so the app is installable and branded, and raise the need for a higher-resolution source with the client — see the note at the end of this task.

Do not pipe the blob through PowerShell: its pipeline re-encodes bytes and corrupts PNGs. Use Node.

- [ ] **Step 1: Write the recovery script**

Create `scripts/recover-legacy-icon.mjs`:

```js
/**
 * Recovers the legacy app icon from this repository's own history.
 *
 * The client pointed at
 * github.com/.../blob/main/frontend/static/icon.png, but that blob is
 * reachable locally -- `main` still carries the Nuxt 2 app that the
 * rebuild branch deleted. No network fetch, and the bytes are provably
 * the ones the old app shipped.
 *
 * Node rather than a shell pipeline on purpose: PowerShell re-encodes
 * bytes on the way through a pipe and silently corrupts PNGs.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(repoRoot, 'web/public/icon.png')

const png = execFileSync('git', ['show', 'main:frontend/static/icon.png'], {
  cwd: repoRoot,
  encoding: 'buffer',
  maxBuffer: 64 * 1024 * 1024,
})

if (png.subarray(1, 4).toString('ascii') !== 'PNG') {
  throw new Error('recovered blob is not a PNG -- has main been rewritten?')
}

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, png)

console.log(
  `wrote ${target}: ${png.length} bytes, `
  + `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,
)
```

- [ ] **Step 2: Run it**

Run from the repository root:

```
node scripts/recover-legacy-icon.mjs
```

Expected output: `wrote .../web/public/icon.png: 15214 bytes, 88x88`. If the byte count or the dimensions differ, stop — `main` has moved and the source needs re-checking before anything is generated from it.

- [ ] **Step 3: Write the generator**

**Why not `@vite-pwa/assets-generator`.** It was tried first and is a dead end here: it pulls `sharp`, whose prebuilt native binary fails to load on this machine's Node 24 / win32-x64 with `ERR_DLOPEN_FAILED: The specified procedure could not be found`, reproducibly and after a clean reinstall. Rather than pin an older Node or chase a VC++ runtime for a one-shot image resize, this generates the set with `pngjs` — already a devDependency of `web/`, already used by `web/test/nrrd-gzip.test.ts`, and pure JavaScript with no native component to fail.

Bilinear is also the *right* filter for this input, not merely the available one: the source is 88px and every output but one is an upscale, where a sharpening resampler like Lanczos rings on the edges instead of adding detail that is not there.

Create `scripts/generate-pwa-icons.mjs`:

```js
/**
 * Generates the PWA icon set from `web/public/icon.png`.
 *
 * ## Why this is hand-rolled
 *
 * `@vite-pwa/assets-generator` is the obvious tool and does not work here:
 * it depends on `sharp`, whose prebuilt native binary fails to load on
 * Node 24 / win32-x64 with ERR_DLOPEN_FAILED, reproducibly and after a
 * clean reinstall. `pngjs` is already a devDependency of `web/` (see
 * web/test/nrrd-gzip.test.ts), is pure JS, and has nothing native to fail.
 *
 * Bilinear resampling is also the correct choice for this input rather
 * than a concession: the source is 88x88 and every output but the 64px
 * one is an UPSCALE, where a sharpening filter rings on edges instead of
 * inventing detail.
 *
 * ## The source's known limitation
 *
 * `web/public/icon.png` is 88x88, recovered verbatim from the legacy app
 * (scripts/recover-legacy-icon.mjs). The 512px outputs are therefore soft.
 * No higher-resolution copy exists in this repository or its history.
 * Replacing the source with a vector render or a >=512px raster and
 * re-running this script is the entire fix, with no code change.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(repoRoot, 'web', 'public')

/** Fraction of a maskable icon's width that must survive an aggressive
 *  platform crop. Android's maskable safe zone is the centre 80%. */
const MASKABLE_CONTENT = 0.8
/** Apple crops the corners of a touch icon into a squircle, so the mark
 *  gets a little breathing room there too -- less than maskable's, since
 *  the crop is much gentler. */
const APPLE_CONTENT = 0.9

/** Bilinear resample. `src` and the result are both RGBA PNG instances. */
function resize(src, size) {
  const out = new PNG({ width: size, height: size })
  const { width: sw, height: sh, data: sd } = src

  for (let y = 0; y < size; y++) {
    // Sample at pixel CENTRES (+0.5 / -0.5), otherwise the output is
    // shifted half a destination pixel up and left.
    const sy = ((y + 0.5) * sh) / size - 0.5
    const y0 = Math.max(0, Math.floor(sy))
    const y1 = Math.min(sh - 1, y0 + 1)
    const fy = Math.min(1, Math.max(0, sy - y0))

    for (let x = 0; x < size; x++) {
      const sx = ((x + 0.5) * sw) / size - 0.5
      const x0 = Math.max(0, Math.floor(sx))
      const x1 = Math.min(sw - 1, x0 + 1)
      const fx = Math.min(1, Math.max(0, sx - x0))

      const at = (y * size + x) * 4
      for (let c = 0; c < 4; c++) {
        const p00 = sd[(y0 * sw + x0) * 4 + c]
        const p01 = sd[(y0 * sw + x1) * 4 + c]
        const p10 = sd[(y1 * sw + x0) * 4 + c]
        const p11 = sd[(y1 * sw + x1) * 4 + c]
        const top = p00 + (p01 - p00) * fx
        const bottom = p10 + (p11 - p10) * fx
        out.data[at + c] = Math.round(top + (bottom - top) * fy)
      }
    }
  }
  return out
}

/** Centres `content` on a `size`x`size` canvas filled with `bg` (RGBA). */
function onCanvas(content, size, bg) {
  const out = new PNG({ width: size, height: size })
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = bg[0]
    out.data[i + 1] = bg[1]
    out.data[i + 2] = bg[2]
    out.data[i + 3] = bg[3]
  }
  const offset = Math.round((size - content.width) / 2)
  for (let y = 0; y < content.height; y++) {
    for (let x = 0; x < content.width; x++) {
      const from = (y * content.width + x) * 4
      const to = ((y + offset) * size + (x + offset)) * 4
      // Source over, so a transparent source pixel keeps the background.
      const alpha = content.data[from + 3] / 255
      for (let c = 0; c < 3; c++) {
        out.data[to + c] = Math.round(
          content.data[from + c] * alpha + out.data[to + c] * (1 - alpha),
        )
      }
      out.data[to + 3] = Math.max(out.data[to + 3], content.data[from + 3])
    }
  }
  return out
}

/**
 * A Vista-style ICO: the directory entries point at whole PNG payloads
 * rather than at BMP bitmaps. Every browser this app targets reads it,
 * and it avoids hand-writing a BMP encoder with its bottom-up rows and
 * AND-mask padding.
 */
function ico(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const directory = []
  let offset = 6 + entries.length * 16
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16)
    // 0 means 256 in this field; nothing here is that large, but the
    // encoding is the spec's and writing it out documents the limit.
    entry[0] = size >= 256 ? 0 : size
    entry[1] = size >= 256 ? 0 : size
    entry[2] = 0 // palette size: none, this is truecolour
    entry[3] = 0 // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    directory.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...directory, ...entries.map(e => e.png)])
}

const source = PNG.sync.read(readFileSync(join(publicDir, 'icon.png')))
/** The source has no alpha channel, so its corner pixel is a real colour
 *  and is what the mark was drawn against. Padding with anything else
 *  would put a visible square behind it. */
const background = [source.data[0], source.data[1], source.data[2], 255]

function write(name, png) {
  const buffer = PNG.sync.write(png)
  writeFileSync(join(publicDir, name), buffer)
  console.log(`${name}  ${png.width}x${png.height}  ${buffer.length}B`)
  return buffer
}

for (const size of [64, 192, 512]) {
  write(`pwa-${size}x${size}.png`, resize(source, size))
}

write(
  'maskable-icon-512x512.png',
  onCanvas(resize(source, Math.round(512 * MASKABLE_CONTENT)), 512, background),
)

write(
  'apple-touch-icon-180x180.png',
  onCanvas(resize(source, Math.round(180 * APPLE_CONTENT)), 180, background),
)

writeFileSync(
  join(publicDir, 'favicon.ico'),
  ico([32, 48].map(size => ({ size, png: PNG.sync.write(resize(source, size)) }))),
)
console.log('favicon.ico  32 + 48')
```

- [ ] **Step 4: Add the script and generate**

Add to `web/package.json`'s `scripts`, after `"assets"`:

```json
    "icons": "node ../scripts/generate-pwa-icons.mjs",
```

Run from `web/`:

```
yarn icons
```

Expected: six lines naming each generated file with its dimensions and byte count, then `favicon.ico  32 + 48`.

- [ ] **Step 5: Write the test**

Create `web/test/pwa-icons.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The generated icon set is committed, not built on demand, so these
 * assert the committed artefacts. Task 5's manifest references these
 * names verbatim; a rename that misses one would otherwise surface as an
 * icon that silently 404s on a home screen.
 *
 * Built by `yarn icons` (scripts/generate-pwa-icons.mjs).
 */
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public')

function png(name: string) {
  // `new URL(..., import.meta.url)` cannot be used here: Vite's
  // import-analysis plugin rewrites that literal pattern as an asset URL.
  // See the comment at the top of web/test/tokens.test.ts.
  return readFileSync(join(publicDir, name))
}

describe('generated PWA icons', () => {
  const expected: Record<string, number> = {
    'pwa-64x64.png': 64,
    'pwa-192x192.png': 192,
    'pwa-512x512.png': 512,
    'maskable-icon-512x512.png': 512,
    'apple-touch-icon-180x180.png': 180,
  }

  for (const [name, size] of Object.entries(expected)) {
    it(`${name} is a ${size}x${size} PNG`, () => {
      const buffer = png(name)
      expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG')
      expect(buffer.readUInt32BE(16)).toBe(size)
      expect(buffer.readUInt32BE(20)).toBe(size)
    })
  }

  it('the source is the legacy mark, unmodified', () => {
    const buffer = png('icon.png')
    expect(buffer.readUInt32BE(16)).toBe(88)
    expect(buffer.readUInt32BE(20)).toBe(88)
    expect(buffer.length).toBe(15214)
  })

  it('favicon.ico declares two PNG entries', () => {
    const buffer = png('favicon.ico')
    expect(buffer.readUInt16LE(0)).toBe(0) // reserved
    expect(buffer.readUInt16LE(2)).toBe(1) // type: icon
    expect(buffer.readUInt16LE(4)).toBe(2) // two sizes

    const sizes: number[] = []
    for (let i = 0; i < 2; i++) {
      const entry = 6 + i * 16
      sizes.push(buffer[entry]!)
      const length = buffer.readUInt32LE(entry + 8)
      const offset = buffer.readUInt32LE(entry + 12)
      // Each payload really is a PNG, and really is inside the file.
      expect(offset + length).toBeLessThanOrEqual(buffer.length)
      expect(buffer.subarray(offset + 1, offset + 4).toString('ascii')).toBe('PNG')
    }
    expect(sizes).toEqual([32, 48])
  })

  it('the maskable icon keeps its content inside the safe zone', () => {
    // Android crops a maskable icon to the centre 80%, so the mark must
    // not reach the edge. The generator pads it; this catches the padding
    // being dropped, which no dimension check would notice.
    const { PNG } = require('pngjs') as typeof import('pngjs')
    const image = PNG.sync.read(png('maskable-icon-512x512.png'))
    const plain = PNG.sync.read(png('pwa-512x512.png'))

    function centreRow(source: { width: number, data: Buffer }) {
      const y = Math.floor(source.width / 2)
      return Array.from(
        { length: source.width },
        (_, x) => source.data[(y * source.width + x) * 4]!,
      )
    }

    const maskableRow = centreRow(image)
    const plainRow = centreRow(plain)
    const corner = image.data[0]!
    // The outer 10% of each side is untouched background on the maskable
    // version and, on the unpadded one, is not.
    const edge = Math.floor(512 * 0.05)
    expect(maskableRow.slice(0, edge).every(v => v === corner)).toBe(true)
    expect(plainRow.slice(0, edge).every(v => v === corner)).toBe(false)
  })
})
```

- [ ] **Step 6: Run the test and look at the result**

Run from `web/`:

```
yarn vitest run test/pwa-icons.test.ts
```

Expected: PASS.

Then **look at** `web/public/pwa-512x512.png` and `web/public/maskable-icon-512x512.png` with the Read tool — they render as images. Confirm the mark is centred, recognisable, and (on the maskable one) clear of the edges. Say in your report what you actually saw. If the mark is off-centre or clipped, that is a real defect in the generator, not something to accept.

Then run the full suite once:

```
yarn test
```

- [ ] **Step 7: Commit**

```bash
git add scripts/recover-legacy-icon.mjs scripts/generate-pwa-icons.mjs web/package.json web/test/pwa-icons.test.ts web/public/icon.png web/public/pwa-64x64.png web/public/pwa-192x192.png web/public/pwa-512x512.png web/public/maskable-icon-512x512.png web/public/apple-touch-icon-180x180.png web/public/favicon.ico
git commit -m "feat(pwa): recover the legacy app icon and generate the icon set

Client feedback item 1, first half. The mark the client linked to is
still in this repository's history at main:frontend/static/icon.png, so
it is recovered from there rather than fetched.

The source is 88x88, so the 512px outputs are upscales and are soft on a
home screen. No higher-resolution copy exists in the repo; dropping a
larger source at public/icon.png and re-running \`yarn icons\` is the
whole fix once the client supplies one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Record the open question**

Append to the spec at `docs/superpowers/specs/2026-07-30-client-feedback-round-1-design.md`, at the end of §9.1:

```markdown
**待向甲方提出**：`main:frontend/static/icon.png` 只有 88×88（8-bit RGB，无 alpha）。由它放大出的 512×512 maskable 图标在主屏上明显发虚。仓库与其历史中没有更高分辨率的副本。若甲方能提供矢量图或 ≥512px 的位图，放到 `web/public/icon.png` 后重跑 `yarn icons` 即可，无需改代码。
```

Commit with:

```bash
git add docs/superpowers/specs/2026-07-30-client-feedback-round-1-design.md
git commit -m "docs(spec): record the 88x88 icon source limitation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Installable PWA, app shell only

**Files:**
- Modify: `web/package.json`
- Modify: `web/nuxt.config.ts:5-21` (modules), `:68-116` (head)
- Create: `web/test/pwa.test.ts`
- Create: `web/test-browser/pwa.spec.ts`

**Interfaces:**
- Consumes: the six icon files from Task 4, at exactly those paths.
- Produces: a registered service worker and a `manifest.webmanifest` at the deployment root.

**Background.** The legacy app used `@nuxtjs/pwa`, a Nuxt 2 build module with no Nuxt 4 equivalent; `@vite-pwa/nuxt` is the replacement. The manifest fields are copied verbatim from `legacy/nuxt.config.js`.

**Precaching excludes `modelView/**` and this is not negotiable.** The imaging assets total ~355MB, and this repository already carries a measured finding that Chromium refuses to store multi-megabyte responses in its HTTP cache (see the comment block at `web/app/pages/[slug]/[[modality]].vue:66-79`). A precache manifest listing them would either blow up the service worker install or silently fail, and would add ~355MB of entries to `sw.js`.

- [ ] **Step 1: Write the failing config test**

Create `web/test/pwa.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import config from '../nuxt.config'

/**
 * Client feedback item 1. Asserts the CONFIGURATION rather than a built
 * service worker: a real build takes minutes and pulls 355MB of public
 * assets through the prerenderer, which no unit run should do. The
 * built-artefact side is covered in test-browser/pwa.spec.ts.
 */
const pwa = (config as Record<string, any>).pwa

describe('PWA configuration', () => {
  it('is registered', () => {
    expect((config as Record<string, any>).modules).toContain('@vite-pwa/nuxt')
    expect(pwa).toBeDefined()
  })

  it('carries the legacy app\'s manifest fields verbatim', () => {
    expect(pwa.manifest.name).toBe('Breast Educational Resource')
    expect(pwa.manifest.short_name).toBe('Breast Education App')
    expect(pwa.manifest.description).toBe('An ABI Education App for Breast Cancer.')
    expect(pwa.manifest.theme_color).toBe('#ffffff')
  })

  it('declares the icon sizes Task 4 generated, at the paths it wrote them to', () => {
    const bySrc = Object.fromEntries(
      pwa.manifest.icons.map((i: Record<string, string>) => [i.src, i]),
    )
    expect(bySrc['pwa-192x192.png']?.sizes).toBe('192x192')
    expect(bySrc['pwa-512x512.png']?.sizes).toBe('512x512')
    expect(bySrc['maskable-icon-512x512.png']?.purpose).toBe('maskable')
  })

  /**
   * The load-bearing one. `modelView/` is ~355MB of NRRD and GLB, and
   * Chromium will not store responses that size anyway -- measured on this
   * catalogue, see pages/[slug]/[[modality]].vue's §9.2 correction. They
   * must never enter the precache manifest.
   */
  it('never precaches the imaging assets', () => {
    const globs: string[] = pwa.workbox.globPatterns
    expect(globs.every(g => !g.includes('nrrd'))).toBe(true)
    expect(globs.every(g => !g.includes('glb'))).toBe(true)
    expect(pwa.workbox.globIgnores).toContain('**/modelView/**')
  })

  it('does not precache the draco decoder wasm either', () => {
    // Only needed when a GLB is actually loaded, which is a network path.
    expect(pwa.workbox.globIgnores).toContain('**/draco/**')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run from `web/`:

```
yarn vitest run test/pwa.test.ts
```

Expected: FAIL — `pwa` is `undefined`, so `expect(pwa).toBeDefined()` fails and the rest throw on property access of undefined.

- [ ] **Step 3: Add the dependency**

Run from `web/`:

```
yarn add -D @vite-pwa/nuxt
```

- [ ] **Step 4: Configure the module**

In `web/nuxt.config.ts`, change the `modules` line to:

```ts
  modules: ['@pinia/nuxt', '@vite-pwa/nuxt'],
```

and add a top-level `pwa` block (place it directly after `runtimeConfig`, before `routeRules`):

```ts
  /**
   * Installable app shell (client feedback item 1). The legacy app had this
   * via `@nuxtjs/pwa` (legacy/nuxt.config.js) and the rebuild dropped it
   * along with the icon; the manifest fields below are that config's,
   * verbatim.
   *
   * APP SHELL ONLY. `globIgnores` keeps `modelView/**` out of the precache
   * manifest, and that is load-bearing rather than tidy: those assets total
   * ~355MB, and Chromium refuses to store responses of that size in its
   * HTTP cache at all -- measured on this exact catalogue, see the §9.2
   * correction in pages/[slug]/[[modality]].vue. Listing them would produce
   * a service worker that either fails to install or silently drops them,
   * and would inflate sw.js with thousands of useless entries. The volumes
   * and models go over the network, as they do today.
   *
   * `registerType: 'autoUpdate'` because this is a reference resource with
   * no user state: there is nothing to lose by taking the new version, and
   * a stale shell pinned behind a prompt nobody clicks is worse.
   */
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Breast Educational Resource',
      short_name: 'Breast Education App',
      description: 'An ABI Education App for Breast Cancer.',
      theme_color: '#ffffff',
      background_color: '#FBF7F8',
      display: 'standalone',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: 'maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      globIgnores: ['**/modelView/**', '**/draco/**'],
      // A 5MB ceiling on any single precached file. Belt and braces on top
      // of globIgnores: a future asset added outside modelView/ that is
      // genuinely too large should be skipped, not silently bloat sw.js.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      navigateFallback: undefined,
    },
    devOptions: {
      // The service worker is off in `nuxi dev` by default. Enabling it
      // here is what lets test-browser/pwa.spec.ts run against the dev
      // server like every other browser test in this repo.
      enabled: true,
      type: 'module',
    },
  },
```

Add the Apple touch icon to `app.head.link` (Android reads the manifest; iOS reads this tag), appending to the existing `link` array:

```ts
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
```

- [ ] **Step 5: Run the config test**

Run from `web/`:

```
yarn vitest run test/pwa.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write the browser test**

Create `web/test-browser/pwa.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

/**
 * Client feedback item 1, against a real browser.
 *
 * test/pwa.test.ts asserts the configuration object; this asserts what the
 * browser actually receives -- a reachable manifest, a service worker that
 * registers, and (the one that matters) a precache manifest with no
 * imaging assets in it.
 */

test('the manifest is served with the fields the client\'s old app had', async ({ page }) => {
  await page.goto('/the-breast')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()

  const response = await page.request.get(href!)
  expect(response.ok()).toBe(true)

  const manifest = await response.json()
  expect(manifest.name).toBe('Breast Educational Resource')
  expect(manifest.short_name).toBe('Breast Education App')
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toContain('512x512')
})

test('every icon the manifest declares actually resolves', async ({ page }) => {
  await page.goto('/the-breast')
  const href = (await page.locator('link[rel="manifest"]').getAttribute('href'))!
  const manifest = await (await page.request.get(href)).json()

  for (const icon of manifest.icons as { src: string }[]) {
    const url = new URL(icon.src, new URL(href, page.url())).href
    const response = await page.request.get(url)
    expect(response.ok(), `${icon.src} -> ${response.status()}`).toBe(true)
  }
})

test('the service worker registers', async ({ page }) => {
  await page.goto('/the-breast')
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
    null,
    { timeout: 30_000 },
  )
})

/**
 * The load-bearing assertion of this file. ~355MB of NRRD and GLB must
 * never enter the precache manifest -- see nuxt.config.ts's `pwa` comment.
 */
test('no imaging asset is precached', async ({ page }) => {
  await page.goto('/the-breast')

  const swUrl = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    return registrations[0]?.active?.scriptURL
      ?? registrations[0]?.installing?.scriptURL
      ?? null
  })
  expect(swUrl, 'no service worker script URL').toBeTruthy()

  const source = await (await page.request.get(swUrl!)).text()
  expect(source).not.toMatch(/\.nrrd/)
  expect(source).not.toMatch(/\.glb/)
  expect(source).not.toMatch(/modelView/)
})
```

- [ ] **Step 7: Run the browser test**

Run from `web/`:

```
yarn test:browser test-browser/pwa.spec.ts
```

Expected: PASS. If the service worker never registers, check that `pwa.devOptions.enabled` is `true` — without it `@vite-pwa/nuxt` does not emit a worker under `nuxi dev` and every test here fails for a reason unrelated to the app.

- [ ] **Step 8: Verify the static build, including the GitHub Pages subpath**

Run from `web/`:

```
yarn generate
```

Then inspect the output:

```
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('.output/public/manifest.webmanifest','utf8'));console.log(m.name, m.start_url, m.scope);const sw=fs.readFileSync('.output/public/sw.js','utf8');console.log('nrrd in sw:', /\.nrrd/.test(sw), 'glb in sw:', /\.glb/.test(sw));"
```

Expected: the name prints, `nrrd in sw: false`, `glb in sw: false`.

Then repeat under the deployment subpath:

```
NUXT_APP_BASE_URL=/te-uma/ yarn generate
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('.output/public/manifest.webmanifest','utf8'));console.log('start_url:', m.start_url, 'scope:', m.scope);"
```

Expected: both `start_url` and `scope` begin with `/te-uma/`. If they do not, add `base: '/te-uma/'` handling via `pwa.manifest.start_url` and `pwa.manifest.scope` derived from `app.baseURL` and re-verify — a manifest whose `start_url` is `/` under a subpath deploy installs an app that opens a 404.

On Windows PowerShell the env-var prefix is not valid syntax; use `$env:NUXT_APP_BASE_URL = '/te-uma/'; yarn generate` and clear it afterwards with `Remove-Item Env:\NUXT_APP_BASE_URL`.

- [ ] **Step 9: Run the whole suite**

Run from `web/`:

```
yarn test
yarn test:browser
```

Expected: PASS. `test-browser/production.spec.ts`'s "the-breast first screen transfers under 3MB" budget now also carries `sw.js`, the manifest and the registration shim; those are a few KB and the budget has headroom, but if it fails, report the new figure rather than raising the budget.

- [ ] **Step 10: Commit**

```bash
git add web/nuxt.config.ts web/package.json web/yarn.lock web/test/pwa.test.ts web/test-browser/pwa.spec.ts
git commit -m "feat(pwa): installable app shell, imaging assets excluded

Client feedback item 1, second half. @vite-pwa/nuxt replaces the Nuxt 2
@nuxtjs/pwa the legacy app used; the manifest fields are that config's,
verbatim.

Precaching is the app shell only. modelView/ is ~355MB and Chromium
refuses to store responses that size anyway -- measured on this
catalogue -- so listing them would give a worker that fails to install
or silently drops them. Volumes and models stay on the network.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done criteria

- `yarn test` and `yarn test:browser` both pass from `web/`.
- On an iPad-width viewport (1180px) the About link is at the right edge of the header.
- No page shows "BI-RADS" or "Reference density background"; the sidebar reads `Density A`…`Density D`.
- The sidebar's `The Breast` sits above the group headings, with an icon and a rule under it, and the three group headings each carry a glyph.
- Chrome's install prompt offers the app, and the installed icon is the legacy mark.
- `.output/public/sw.js` contains no `.nrrd`, `.glb` or `modelView` reference.
