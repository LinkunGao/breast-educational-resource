export type ModalityId = 'anatomy' | 'mammogram' | 'ultrasound' | 'mri'
export type CaseGroup = 'overview' | 'density' | 'benign' | 'cancer'
export type BiRads = 'A' | 'B' | 'C' | 'D'

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
  biRads?: BiRads
  /** Stated explicitly when the case borrows another case's anatomy model */
  referenceDensity?: BiRads
  /** Slice index holding the lesion. 0 or absent means no specific lesion. */
  lesionSliceIndex?: number
  modalities: Modality[]
  /** Has copy but no imaging assets: generates no route and no nav entry */
  disabled?: boolean
}
