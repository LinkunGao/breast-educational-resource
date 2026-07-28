export type ModalityId = 'anatomy' | 'mammogram' | 'ultrasound' | 'mri'
export type CaseGroup = 'overview' | 'density' | 'benign' | 'cancer'
export type BiRads = 'A' | 'B' | 'C' | 'D'

export interface Modality {
  id: ModalityId
  /** UI 标签。非医学原文，可调整。 */
  label: string
  /** 相对 assetBase 的路径，如 "density-1/middle/m3d.nrrd" */
  asset: string
  /** copper3d 视角预设 JSON，相对 assetBase */
  viewPreset: string
  /** 该模态对应的医学原文。一字不改。 */
  text: string
  /** 架构预留（设计文档 §6.2）。本次一律为 []。 */
  keyFacts: string[]
}

export interface Case {
  slug: string
  group: CaseGroup
  /** 导航短标签 */
  title: string
  /** 病例标题 */
  heading: string
  biRads?: BiRads
  /** 借用其他病例解剖模型时的明示标注 */
  referenceDensity?: BiRads
  /** 病灶所在切片索引。0 或缺省表示无特定病灶。 */
  lesionSliceIndex?: number
  modalities: Modality[]
  /** 有文案但无影像资产，不生成路由与导航入口 */
  disabled?: boolean
}
