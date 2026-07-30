export type ModalityId = 'anatomy' | 'mammogram' | 'ultrasound' | 'mri'
export type CaseGroup = 'overview' | 'density' | 'benign' | 'cancer'

export interface Modality {
  id: ModalityId
  /** UI label. Not medical copy, so it may be adjusted. */
  label: string
  /** Path relative to assetBase, e.g. "density-1/middle/m3d.nrrd" */
  asset: string
  /** copper3d view-preset JSON, relative to assetBase */
  viewPreset: string
  /** The medical copy for this modality. Never edited. */
  text: string
  /** Reserved by the schema (design doc §6.2). Always [] for now. */
  keyFacts: string[]
}

export interface Case {
  slug: string
  group: CaseGroup
  /** Short label for navigation */
  title: string
  /** Case heading */
  heading: string
  /**
   * Slice index holding the lesion, **in this case's MRI volume**. 0 or
   * absent means no specific lesion.
   *
   * Read `lesionSliceIndexFor(case, modality)` rather than this field
   * directly. The number is the legacy `rightBoundingBoxIndex`
   * (frontend/plugins/data.js:41), which was only ever read by the
   * right-hand panel and so only ever meant an MRI slice -- and the
   * mammogram volumes are far shallower, so using it there points at a
   * slice that does not exist. The schema keeps one value per case because
   * that is all the source data ever had; it is not one value per modality.
   */
  lesionSliceIndex?: number
  modalities: Modality[]
  /** Has copy but no imaging assets: generates no route and no nav entry */
  disabled?: boolean
}
