// Thin painter for the vitals bar (docs/design/project-h-interface.md): the
// Project H player frame as a descriptor of the unit_frame FAMILY. It owns no
// paint rules of its own: it composes the family's UnitFramePainter over the
// vitals element set (the wide health bar, its level numeral, the thin resource
// bar, the absorb overlay and the self PvP / Book of Deeds surfaces) and adds
// exactly ONE write, the low-health state class the core's threshold decides.
// Every write rides the host's elided writers, so a repeated identical frame
// costs no DOM mutation; no literal hex / px / color lives here (the CSS reads
// the --vitals-* and --vital-* tokens).

import type { PainterHostWriters } from '../../painter_host';
import type { UnitFrameView } from '../../unit_frame';
import {
  type UnitFrameElements,
  type UnitFrameOptions,
  UnitFramePainter,
} from '../../unit_frame_painter';
import { VITALS_LOW_CLASS, vitalsLow } from './vitals_view';

/** The vitals DOM is the family element set: the player instance supplies no
 *  `name` (set once at login) and no `shownDisplay` (always present). */
export type VitalsElements = UnitFrameElements;

export class VitalsPainter {
  private readonly frame: UnitFramePainter;

  constructor(
    private readonly writers: PainterHostWriters,
    private readonly el: VitalsElements,
    opts: UnitFrameOptions = {},
  ) {
    this.frame = new UnitFramePainter(writers, el, opts);
  }

  paint(view: UnitFrameView): void {
    this.frame.paint(view);
    this.writers.toggleClass(
      this.el.frame,
      VITALS_LOW_CLASS,
      view.present && vitalsLow(view.hpFrac),
    );
  }

  /** Force the next paint to repaint the portrait (the family's asset-reload hook). */
  invalidatePortrait(): void {
    this.frame.invalidatePortrait();
  }
}
