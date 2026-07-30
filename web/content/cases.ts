import { anatomyText, mammogramText, mriText } from './copy.generated'
import type { Case, CaseGroup, Modality, ModalityId } from './types'

/** Build a modality entry, always with an empty keyFacts (global constraint). */
function modality(
  id: ModalityId,
  label: string,
  asset: string,
  viewPreset: string,
  text: string,
): Modality {
  return { id, label, asset, viewPreset, text, keyFacts: [] }
}

// ── Case catalogue ─────────────────────────────────────────
// The medical copy comes from ./copy.generated.ts (produced by
// scripts/extract-copy.mjs).
//
// Modality sequences are driven by what the assets actually are (the md5
// audit in design doc §3.1):
//   · m2d.nrrd  4 files = 2 images, density A and D identical -> all dropped
//   · u2d.nrrd  5 files = 1 image, originally made for Cyst -> Cyst only
//   · GLBs exist only for density-1..4 -> benign/cancer have no anatomy

/** Shared builder for the density series: three modalities, one directory layout. */
function densityCase(
  slug: string,
  dir: string,
  glb: string,
  title: string,
  heading: string,
  legacyKey: keyof typeof anatomyText,
): Case {
  return {
    slug,
    group: 'density',
    title,
    heading,
    modalities: [
      modality('anatomy', 'Anatomy', `${dir}/left/${glb}`, 'left_breast_view.json', anatomyText[legacyKey]),
      modality('mammogram', '3D Mammogram', `${dir}/middle/m3d.nrrd`, `${dir}/middle/m_view.json`, mammogramText[legacyKey]),
      modality('mri', '3D MRI', `${dir}/right/mri.nrrd`, `${dir}/right/mri_view.json`, mriText[legacyKey]),
    ],
  }
}

/** benign/cancer series: no anatomy, two or three imaging modalities. */
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
  const modalities: Modality[] = [
    modality('mammogram', '3D Mammogram', `${dir}/middle/m3d.nrrd`, `${dir}/middle/m_view.json`, mammogramText[legacyKey]),
  ]
  if (withUltrasound) {
    modalities.push(
      modality('ultrasound', '2D Ultrasound', `${dir}/middle/u2d.nrrd`, `${dir}/middle/u_view.json`, mammogramText[legacyKey]),
    )
  }
  modalities.push(
    modality('mri', '3D MRI', `${dir}/right/mri.nrrd`, `${dir}/right/mri_view.json`, mriText[legacyKey]),
  )
  return { slug, group, title, heading, lesionSliceIndex, modalities }
}

export const cases: Case[] = [
  {
    slug: 'the-breast',
    group: 'overview',
    title: 'The Breast',
    heading: 'The Breast',
    // Has no assets of its own; borrows density-1 throughout (design doc §4.4)
    modalities: [
      modality('anatomy', 'Anatomy', 'density-1/left/density25.glb', 'left_breast_view.json', anatomyText.normal),
      modality('mammogram', '3D Mammogram', 'density-1/middle/m3d.nrrd', 'density-1/middle/m_view.json', mammogramText.normal),
      modality('mri', '3D MRI', 'density-1/right/mri.nrrd', 'density-1/right/mri_view.json', mriText.normal),
    ],
  },

  densityCase('density-a', 'density-1', 'density25.glb', 'Density A', 'Almost entirely fat', 'density_1'),
  densityCase('density-b', 'density-2', 'density50.glb', 'Density B', 'Scattered fibroglandular densities', 'density_2'),
  densityCase('density-c', 'density-3', 'density75.glb', 'Density C', 'Heterogeneously dense', 'density_3'),
  densityCase('density-d', 'density-4', 'density100.glb', 'Density D', 'Extremely dense', 'density_4'),

  lesionCase('benign-cyst', 'benign', 'benign-cyst', 'Cyst', 'Cyst', 58, 'benign_cyst', true),
  lesionCase('benign-fibroadenoma', 'benign', 'benign-fib', 'Fibroadenoma', 'Fibroadenoma', 68, 'benign_fibroadenoma'),

  lesionCase('cancer-dcis', 'cancer', 'cancer-dcis', 'DCIS', 'DCIS', 90, 'cancer_dcis'),
  lesionCase('cancer-lobular', 'cancer', 'cancer-lobular', 'Lobular', 'Lobular', 80, 'cancer_lobular'),
  lesionCase('cancer-ductal', 'cancer', 'cancer-ductal', 'Ductal', 'Ductal', 27, 'cancer_ductal'),

  {
    // Copy and lesion index are both present, but there are no imaging
    // assets at all (design doc §4.4). Kept so the copy is not lost;
    // generates no route and no nav entry.
    slug: 'benign-calcifications',
    group: 'benign',
    title: 'Calcifications',
    heading: 'Calcifications',
    lesionSliceIndex: 0,
    disabled: true,
    modalities: [],
  },
]

export function enabledCases(): Case[] {
  return cases.filter(c => !c.disabled)
}

export function getCase(slug: string): Case | undefined {
  return cases.find(c => c.slug === slug)
}

export function getModality(slug: string, id: ModalityId): Modality | undefined {
  return getCase(slug)?.modalities.find(m => m.id === id)
}

/**
 * The modality `lesionSliceIndex` was measured on. See that field's doc:
 * it is the legacy `rightBoundingBoxIndex`, which only ever reached the
 * right-hand (MRI) panel.
 */
const LESION_MODALITY: ModalityId = 'mri'

/**
 * How many slices into `modality`'s volume this case's lesion sits, or 0 if
 * that question has no answer for this case/modality pair.
 *
 * Guards design doc §7.2's "Locate lesion" affordance. The number is an MRI
 * slice index and the volumes are not interchangeable: cancer-dcis's lesion
 * is at slice 90, but its mammogram volume is 39 slices deep (`sizes: 517
 * 1018 39` in the shipped NRRD header) and cancer-ductal's is 18 deep
 * against an index of 27. Offering to "locate the lesion" there would move
 * the slice plane to a position in a mammogram volume and label it as where
 * the lesion is -- which, in a resource that teaches people to read these
 * images, is worse than not offering it at all.
 */
export function lesionSliceIndexFor(c: Case, modality: ModalityId): number {
  return modality === LESION_MODALITY ? (c.lesionSliceIndex ?? 0) : 0
}

/**
 * Design doc §7.1's morph family: the four density levels plus `the-breast`,
 * which borrows density-1's GLB. Membership has two consequences that must
 * agree, so both read this one predicate:
 *
 *  · `chooseTransition` (cameraTransitions.ts) only returns 'density-morph'
 *    within the family, and
 *  · `app.vue`'s page key gives the whole family ONE component instance, so
 *    the renderer and the outgoing model survive the case navigation a
 *    crossfade needs.
 *
 * If those two ever disagreed the app would either share a renderer across
 * cases it never morphs between (paying the residency for nothing) or try to
 * morph across a boundary the renderer is torn down at (doing nothing at
 * all, the exact failure mode fix round 1 exists to close).
 */
export function isMorphFamilyGroup(group: CaseGroup): boolean {
  return group === 'density' || group === 'overview'
}
