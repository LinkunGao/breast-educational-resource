import { anatomyText, mammogramText, mriText } from './copy.generated'
import type { BiRads, Case, Modality, ModalityId } from './types'

/** 构造一个模态条目，统一保证 keyFacts 为空数组（全局约束）。 */
function modality(
  id: ModalityId,
  label: string,
  asset: string,
  viewPreset: string,
  text: string,
): Modality {
  return { id, label, asset, viewPreset, text, keyFacts: [] }
}

// ── 病例目录 ───────────────────────────────────────────────
// 医学原文来自 ./copy.generated.ts（由 scripts/extract-copy.mjs 生成）。
//
// 模态序列由资产真相驱动（设计文档 §3.1 的 md5 审计）：
//   · m2d.nrrd  4 份 = 2 张图，density A 与 D 相同 → 全部弃用
//   · u2d.nrrd  5 份 = 1 张图，原为 Cyst 制作 → 仅 Cyst 保留
//   · GLB 仅 density-1..4 存在 → benign/cancer 无 anatomy 模态

/** density 系列共用的构造器：三个模态、同一目录布局。 */
function densityCase(
  slug: string,
  dir: string,
  glb: string,
  title: string,
  heading: string,
  biRads: BiRads,
  legacyKey: keyof typeof anatomyText,
): Case {
  return {
    slug,
    group: 'density',
    title,
    heading,
    biRads,
    modalities: [
      modality('anatomy', 'Anatomy', `${dir}/left/${glb}`, 'left_breast_view.json', anatomyText[legacyKey]),
      modality('mammogram', '3D Mammogram', `${dir}/middle/m3d.nrrd`, `${dir}/middle/m_view.json`, mammogramText[legacyKey]),
      modality('mri', '3D MRI', `${dir}/right/mri.nrrd`, `${dir}/right/mri_view.json`, mriText[legacyKey]),
    ],
  }
}

/** benign/cancer 系列：无 anatomy，两个或三个影像模态。 */
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
  return { slug, group, title, heading, lesionSliceIndex, referenceDensity: 'C', modalities }
}

export const cases: Case[] = [
  {
    slug: 'the-breast',
    group: 'overview',
    title: 'The Breast',
    heading: 'The Breast',
    // 无自有资产，全部借用 density-1（设计文档 §4.4）
    referenceDensity: 'A',
    modalities: [
      modality('anatomy', 'Anatomy', 'density-1/left/density25.glb', 'left_breast_view.json', anatomyText.normal),
      modality('mammogram', '3D Mammogram', 'density-1/middle/m3d.nrrd', 'density-1/middle/m_view.json', mammogramText.normal),
      modality('mri', '3D MRI', 'density-1/right/mri.nrrd', 'density-1/right/mri_view.json', mriText.normal),
    ],
  },

  densityCase('density-a', 'density-1', 'density25.glb', 'A', 'Almost entirely fat', 'A', 'density_1'),
  densityCase('density-b', 'density-2', 'density50.glb', 'B', 'Scattered fibroglandular densities', 'B', 'density_2'),
  densityCase('density-c', 'density-3', 'density75.glb', 'C', 'Heterogeneously dense', 'C', 'density_3'),
  densityCase('density-d', 'density-4', 'density100.glb', 'D', 'Extremely dense', 'D', 'density_4'),

  lesionCase('benign-cyst', 'benign', 'benign-cyst', 'Cyst', 'Cyst', 58, 'benign_cyst', true),
  lesionCase('benign-fibroadenoma', 'benign', 'benign-fib', 'Fibroadenoma', 'Fibroadenoma', 68, 'benign_fibroadenoma'),

  lesionCase('cancer-dcis', 'cancer', 'cancer-dcis', 'DCIS', 'DCIS', 90, 'cancer_dcis'),
  lesionCase('cancer-lobular', 'cancer', 'cancer-lobular', 'Lobular', 'Lobular', 80, 'cancer_lobular'),
  lesionCase('cancer-ductal', 'cancer', 'cancer-ductal', 'Ductal', 'Ductal', 27, 'cancer_ductal'),

  {
    // 文案与病灶索引齐备，但无任何影像资产（设计文档 §4.4）。
    // 保留以免文案丢失；不生成路由与导航入口。
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
