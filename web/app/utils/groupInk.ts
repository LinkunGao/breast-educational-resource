import type { CaseGroup } from '~~/content/types'

/**
 * The colour a case's group is drawn in (design system §4). Shared by the
 * sidebar headings, the case-page overline and the prev/next cards.
 * `overview` is anatomy: that is where §7 puts "Breast Structure".
 */
export const GROUP_INK: Record<CaseGroup, string> = {
  overview: 'text-group-anatomy',
  density: 'text-group-anatomy',
  benign: 'text-group-benign',
  cancer: 'text-group-cancer',
}
