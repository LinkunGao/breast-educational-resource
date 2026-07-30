import type { CaseGroup } from '~~/content/types'

/**
 * The colour a case's group is drawn in.
 *
 * From the design system's semantic table (§4) mapped onto its own sidebar
 * hierarchy (§7): ANATOMY is Medical Blue, BENIGN CONDITIONS is Supporting
 * Teal, BREAST CANCER is Deep Burgundy. `overview` -- the one case that is
 * in none of the three lists -- is anatomy, which is where the design
 * system puts "Breast Structure".
 *
 * Shared rather than repeated because three components render the same
 * taxonomy in the same colours (the sidebar's group headings, the case
 * page's overline, the prev/next links' overlines) and three copies of the
 * map is three chances for one of them to drift. The values themselves live
 * in tokens.css as `--color-group-*`, and are pinned for contrast in
 * test/tokens.test.ts.
 */
export const GROUP_INK: Record<CaseGroup, string> = {
  overview: 'text-group-anatomy',
  density: 'text-group-anatomy',
  benign: 'text-group-benign',
  cancer: 'text-group-cancer',
}
