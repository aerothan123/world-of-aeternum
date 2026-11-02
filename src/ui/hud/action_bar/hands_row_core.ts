// The hands row (docs/design/project-h-interface.md, "Hands row"): the Project H
// shape of the primary action bar, a row of square slots above the vitals bar
// with no rail plate and no XP plate. It is a DESCRIPTOR for the existing
// ActionBarPainter family, never a fork of it: the painter stamps the row class
// once at construction (ActionBarPaintDescriptor.rowClass) and hud.css keys the
// geometry on that class through the --hands-slot-size / --hands-slot-gap
// tokens, whose pixel values this module names so a test can hold the sheet and
// the descriptor to one number. Pure and DOM-free.

/** The state class the painter stamps on a hands-row container. */
export const HANDS_ROW_CLASS = 'hands-row';
/** The slot square, in px (the `--hands-slot-size` token). */
export const HANDS_SLOT_SIZE_PX = 36;
/** The gap between slots, in px (the `--hands-slot-gap` token). */
export const HANDS_SLOT_GAP_PX = 4;

/** What a hands-row container carries beyond its slot set. */
export interface HandsRowDescriptor {
  /** The class the painter stamps on the container. */
  readonly rowClass: string;
  readonly slotSizePx: number;
  readonly slotGapPx: number;
  /** The row never paints a rail plate behind its slots. */
  readonly railPlate: false;
}

/** The one hands-row descriptor every primary-bar instance shares. */
export const HANDS_ROW: HandsRowDescriptor = {
  rowClass: HANDS_ROW_CLASS,
  slotSizePx: HANDS_SLOT_SIZE_PX,
  slotGapPx: HANDS_SLOT_GAP_PX,
  railPlate: false,
};

/** The row's natural width for `slots` square slots (the XP line matches it). */
export function handsRowWidthPx(slots: number, d: HandsRowDescriptor = HANDS_ROW): number {
  if (slots <= 0) return 0;
  return slots * d.slotSizePx + (slots - 1) * d.slotGapPx;
}
