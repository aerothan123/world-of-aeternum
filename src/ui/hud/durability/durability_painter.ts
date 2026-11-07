// Thin painter for the HUD durability indicator (#dura-figure beside the
// minimap): shows it while any worn piece is low or broken, with the state
// class the CSS tints and the localized label. Every write rides the host's
// elided writers, so a repeated identical state costs no DOM mutation. Painted
// on the HUD's slow band (gear wear changes on hits and deaths, not per frame).

import type { PainterHostWriters } from '../../painter_host';
import type { DurabilityView } from './durability_view';

export class DurabilityPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly el: HTMLElement | null,
  ) {}

  paint(view: DurabilityView): void {
    const el = this.el;
    if (!el) return;
    const shown = view.state !== 'ok';
    this.writers.setAttr(el, 'hidden', shown ? null : '');
    this.writers.toggleClass(el, 'is-low', view.state === 'low');
    this.writers.toggleClass(el, 'is-broken', view.state === 'broken');
    this.writers.setAttr(el, 'title', shown ? view.label : null);
    this.writers.setAttr(el, 'aria-label', shown ? view.label : null);
  }
}
