import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractLegacyCopy } from '../../scripts/lib/extract-copy.mjs'
import { cases, enabledCases, getCase, getModality, isMorphFamilyGroup, lesionSliceIndexFor } from '../content/cases'
import type { ModalityId } from '../content/types'

/** Re-extract the source copy independently of copy.generated.ts, so the
 *  mapping itself is verified rather than assumed.
 *  Note: this cannot be written as `new URL('../../frontend/...', import.meta.url)`.
 *  Vite's import-analysis plugin recognises that literal pattern statically as
 *  an "asset URL" and rewrites it away; see the comment at the top of
 *  web/test/tokens.test.ts. Build the path by hand with node:path instead. */
let legacy: Awaited<ReturnType<typeof extractLegacyCopy>>

beforeAll(async () => {
  const dataJsPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../frontend/plugins/data.js',
  )
  legacy = await extractLegacyCopy(dataJsPath)
})

/** New slug -> legacy model name */
const SLUG_TO_LEGACY: Record<string, string> = {
  'the-breast': 'normal',
  'density-a': 'density_1',
  'density-b': 'density_2',
  'density-c': 'density_3',
  'density-d': 'density_4',
  'benign-cyst': 'benign_cyst',
  'benign-fibroadenoma': 'benign_fibroadenoma',
  'benign-calcifications': 'benign_calcifications',
  'cancer-dcis': 'cancer_dcis',
  'cancer-lobular': 'cancer_lobular',
  'cancer-ductal': 'cancer_ductal',
}

/** Which source table each modality draws from. Wiring one to the wrong table
 *  is this task's most realistic failure. */
const MODALITY_TO_TABLE = {
  anatomy: 'leftPanelText',
  mammogram: 'middlePanelText',
  ultrasound: 'middlePanelText',
  mri: 'rightPanelText',
} as const satisfies Record<ModalityId, string>

describe('case catalogue shape', () => {
  it('has 11 entries, 10 of them enabled', () => {
    expect(cases).toHaveLength(11)
    expect(enabledCases()).toHaveLength(10)
  })

  it('disables only benign-calcifications (copy exists, imaging does not)', () => {
    const disabled = cases.filter(c => c.disabled).map(c => c.slug)
    expect(disabled).toEqual(['benign-calcifications'])
  })

  it('has unique slugs', () => {
    const slugs = cases.map(c => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('modality sequences match the asset audit (design doc §4.3)', () => {
  const expected: Record<string, ModalityId[]> = {
    'the-breast': ['anatomy', 'mammogram', 'mri'],
    'density-a': ['anatomy', 'mammogram', 'mri'],
    'density-b': ['anatomy', 'mammogram', 'mri'],
    'density-c': ['anatomy', 'mammogram', 'mri'],
    'density-d': ['anatomy', 'mammogram', 'mri'],
    'benign-cyst': ['mammogram', 'ultrasound', 'mri'],
    'benign-fibroadenoma': ['mammogram', 'mri'],
    'cancer-dcis': ['mammogram', 'mri'],
    'cancer-lobular': ['mammogram', 'mri'],
    'cancer-ductal': ['mammogram', 'mri'],
  }

  for (const [slug, ids] of Object.entries(expected)) {
    it(`${slug} -> ${ids.join(' / ')}`, () => {
      expect(getCase(slug)?.modalities.map(m => m.id)).toEqual(ids)
    })
  }
})

describe('placeholder assets are never referenced (design doc §3.1)', () => {
  const allAssets = cases.flatMap(c => c.modalities.map(m => m.asset))

  it('no m2d.nrrd anywhere — four files, two unique images', () => {
    expect(allAssets.filter(a => a.includes('m2d.nrrd'))).toEqual([])
  })

  it('u2d.nrrd only for benign-cyst — five files, one unique image', () => {
    const u2d = allAssets.filter(a => a.includes('u2d.nrrd'))
    expect(u2d).toEqual(['benign-cyst/middle/u2d.nrrd'])
  })
})

describe('no benign or cancer case claims an anatomy modality', () => {
  for (const c of cases.filter(c => c.group === 'benign' || c.group === 'cancer')) {
    it(`${c.slug} has no anatomy modality`, () => {
      expect(c.modalities.some(m => m.id === 'anatomy')).toBe(false)
    })
  }
})

describe('borrowed anatomy models are declared', () => {
  it('the-breast declares it borrows density A assets', () => {
    expect(getCase('the-breast')?.referenceDensity).toBe('A')
  })
})

describe('lesion slice indices carry over from rightBoundingBoxIndex', () => {
  const expected: Record<string, number> = {
    'benign-cyst': 58,
    'benign-fibroadenoma': 68,
    'cancer-dcis': 90,
    'cancer-lobular': 80,
    'cancer-ductal': 27,
  }
  for (const [slug, index] of Object.entries(expected)) {
    it(`${slug} -> ${index}`, () => {
      expect(getCase(slug)?.lesionSliceIndex).toBe(index)
    })
  }

  it('density cases have no lesion', () => {
    for (const c of cases.filter(c => c.group === 'density')) {
      expect(c.lesionSliceIndex ?? 0).toBe(0)
    }
  })
})

/**
 * Fix round 1, Critical. `rightBoundingBoxIndex` was read in exactly one
 * place in the legacy app -- frontend/components/model/PanelControls.vue:100,
 * which is mounted only inside RightPane.vue, whose `start()` loads
 * `right/mri.nrrd`. It is an MRI slice number and has never meant anything
 * on any other modality.
 *
 * The shipped volumes make that concrete rather than theoretical: read
 * straight out of the NRRD headers under public/modelView, cancer-dcis's
 * mammogram is `sizes: 517 1018 39` (39 slices, MaxIndex 38) against a
 * lesion index of 90, and cancer-ductal's is 18 against 27. Offering "Locate
 * lesion" there would point at a place in a mammogram volume and label it as
 * where the lesion is.
 */
describe('the lesion slice index only applies to the modality it was measured on', () => {
  const lesionCases = enabledCases().filter(c => (c.lesionSliceIndex ?? 0) > 0)

  it('covers the five lesion cases and no others', () => {
    expect(lesionCases.map(c => c.slug)).toEqual([
      'benign-cyst', 'benign-fibroadenoma', 'cancer-dcis', 'cancer-lobular', 'cancer-ductal',
    ])
  })

  it('reports the index for MRI', () => {
    for (const c of lesionCases) {
      expect(lesionSliceIndexFor(c, 'mri')).toBe(c.lesionSliceIndex)
    }
  })

  it('reports zero for every non-MRI modality, including ones the case actually has', () => {
    for (const c of lesionCases) {
      for (const m of c.modalities) {
        if (m.id === 'mri') continue
        expect(lesionSliceIndexFor(c, m.id)).toBe(0)
      }
    }
  })

  it('reports zero for a case with no lesion at all', () => {
    expect(lesionSliceIndexFor(getCase('density-d')!, 'mri')).toBe(0)
    expect(lesionSliceIndexFor(getCase('the-breast')!, 'mri')).toBe(0)
  })
})

describe('every modality carries the right paragraph, byte for byte', () => {
  for (const c of cases) {
    for (const m of c.modalities) {
      it(`${c.slug} / ${m.id} <- ${MODALITY_TO_TABLE[m.id]}`, () => {
        const key = SLUG_TO_LEGACY[c.slug]!
        const table = legacy[MODALITY_TO_TABLE[m.id]] as Record<string, string>
        expect(table[key]).toBeDefined()
        expect(m.text).toBe(table[key])
      })
    }
  }

  it('does not cross-wire the anatomy and MRI tables', () => {
    // The easiest pair to confuse: both discuss what is and isn't visible.
    const d = getCase('density-d')!
    expect(d.modalities.find(m => m.id === 'anatomy')!.text)
      .toBe(legacy.leftPanelText.density_4)
    expect(d.modalities.find(m => m.id === 'mri')!.text)
      .toBe(legacy.rightPanelText.density_4)
    expect(legacy.leftPanelText.density_4).not.toBe(legacy.rightPanelText.density_4)
  })
})

describe('lesion indices come from rightBoundingBoxIndex, not from memory', () => {
  for (const c of enabledCases()) {
    it(`${c.slug}`, () => {
      const key = SLUG_TO_LEGACY[c.slug]!
      expect(c.lesionSliceIndex ?? 0).toBe(legacy.rightBoundingBoxIndex[key] ?? 0)
    })
  }
})

describe('keyFacts is reserved but empty (global constraint)', () => {
  it('every modality has an empty keyFacts array', () => {
    for (const c of cases) {
      for (const m of c.modalities) {
        expect(m.keyFacts).toEqual([])
      }
    }
  })
})

describe('lookup helpers', () => {
  it('getCase returns undefined for an unknown slug', () => {
    expect(getCase('nope')).toBeUndefined()
  })

  it('getModality resolves a known pair', () => {
    expect(getModality('density-d', 'mri')?.id).toBe('mri')
  })

  it('getModality returns undefined for a modality the case lacks', () => {
    expect(getModality('cancer-dcis', 'anatomy')).toBeUndefined()
  })
})

/**
 * Fix round 1. The page key now shares one component instance -- and so one
 * WebGLRenderer and one scene cache -- across §7.1's morph family, because a
 * crossfade needs both models alive on one renderer and every morph trigger
 * is a case navigation. `chooseTransition` decides the same membership from
 * a `ViewKey`; both read this one predicate so they cannot drift apart and
 * leave the family sharing a renderer it no longer morphs within (or, worse,
 * morphing across a boundary the renderer is torn down at).
 */
describe('morph family membership', () => {
  it('is exactly the density series plus the overview case that borrows its model', () => {
    const family = enabledCases().filter(c => isMorphFamilyGroup(c.group)).map(c => c.slug)
    expect(family).toEqual(['the-breast', 'density-a', 'density-b', 'density-c', 'density-d'])
  })

  it('excludes every lesion case', () => {
    for (const c of enabledCases().filter(c => c.group === 'benign' || c.group === 'cancer')) {
      expect(isMorphFamilyGroup(c.group)).toBe(false)
    }
  })
})
