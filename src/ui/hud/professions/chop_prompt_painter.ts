// The world-anchored "F Chop" chip over a standing tree the interact press
// would start chopping. Thin HOT painter: it reuses the coach's interact
// bubble chrome (.tut-prompt with a .tut-keycap chip and a .tut-prompt-verb,
// styles/hud.css), so the tree chip reads exactly like the "F Talk" chip over
// an npc. WHICH tree, and whether at all, is the pure
// src/game/chop_prompt_core.ts; WHERE on screen is the shared
// world_prompt_anchor_core.ts (the renderer's unzoomed viewport pixel divided
// by the UI Scale, because the chip is a #ui child under `zoom: --ui-scale`).
//
// Every write after construction goes through the PainterHost facet, so a
// frame where nothing moved writes nothing; the left/top writes are skipped
// on the painter's own half-pixel memo before a string is even built. The
// construction writes (class names, the two aria-hidden stamps, the touch
// glyph's markup) run once and are counted in tests/hud_perf_budget.test.ts.
// aria-hidden like the coach bubble: the cast bar and the press's own error
// line already carry the outcome in text.

import type { ChopPromptTarget } from '../../../game/chop_prompt_core';
import type { PainterHostWriters } from '../../painter_host';
import { svgIcon } from '../../ui_icons';
import {
  type ProjectedScreenPoint,
  type PromptViewport,
  type WorldPromptAnchor,
  worldPromptAnchor,
} from '../../world_prompt_anchor_core';

/** Room the chip needs above its anchor (it draws upward from it, the coach
 *  bubble's translate(-50%, -100%)); nearer the top edge it hides instead.
 *  Viewport px, before the UI scale divide. */
export const CHOP_PROMPT_TOP_CLEARANCE_PX = 40;

/** The chip beside the verb, per input family: the live interact keycap on
 *  keyboard (or a pad's resolved button), the Interact button's own glyph on
 *  touch, nothing when no control is known (the verb shows alone). */
export type ChopPromptChip = { readonly cap: string } | { readonly button: true } | null;

export interface ChopPromptPainterDeps {
  writers: PainterHostWriters;
  /** The #ui root the chip mounts into; null mounts nothing (a host document
   *  without the HUD root), and every paint is then a no-op. */
  host: HTMLElement | null;
  /** Renderer.worldToScreen: unzoomed viewport CSS px. */
  worldToScreen(x: number, y: number, z: number): ProjectedScreenPoint;
  /** The live UI Scale (ui_scale.ts getUiScale), injected. */
  uiScale(): number;
}

export class ChopPromptPainter {
  private readonly root: HTMLElement | null = null;
  private readonly keycap: HTMLElement | null = null;
  // The keycap's show/hide rides this bare wrapper, never the keycap itself:
  // the facet's single-slot writers share ONE cache entry per element, so text
  // and display on the same node would flip it every frame and elide nothing.
  private readonly keyWrap: HTMLElement | null = null;
  private readonly glyph: HTMLElement | null = null;
  private readonly verb: HTMLElement | null = null;
  private readonly anchor: WorldPromptAnchor = { left: 0, top: 0 };
  private lastLeft = Number.NaN;
  private lastTop = Number.NaN;

  constructor(private readonly deps: ChopPromptPainterDeps) {
    const host = deps.host;
    if (!host) return;
    const doc = host.ownerDocument;
    const root = doc.createElement('div');
    root.className = 'tut-prompt chop-prompt';
    root.setAttribute('aria-hidden', 'true');
    const chips = doc.createElement('span');
    chips.className = 'tut-prompt-chips';
    const keyWrap = doc.createElement('span');
    const keycap = doc.createElement('span');
    keycap.className = 'tut-keycap';
    keyWrap.append(keycap);
    const glyph = doc.createElement('span');
    glyph.className = 'tut-keycap tut-keycap-button';
    glyph.innerHTML = svgIcon('interact');
    const verb = doc.createElement('span');
    verb.className = 'tut-prompt-verb';
    chips.append(keyWrap, glyph);
    root.append(chips, verb);
    host.appendChild(root);
    this.root = root;
    this.keycap = keycap;
    this.keyWrap = keyWrap;
    this.glyph = glyph;
    this.verb = verb;
    deps.writers.setDisplay(root, 'none');
  }

  /** The mounted chip root, for tests and the stylesheet pin. */
  get element(): HTMLElement | null {
    return this.root;
  }

  /** Show the chip over `target` (null hides it). Safe every frame. */
  paint(
    target: ChopPromptTarget | null,
    chip: ChopPromptChip,
    verb: string,
    viewport: PromptViewport,
  ): void {
    const root = this.root;
    if (!root || !this.keycap || !this.keyWrap || !this.glyph || !this.verb) return;
    const w = this.deps.writers;
    if (
      target === null ||
      !worldPromptAnchor(
        this.deps.worldToScreen(target.x, target.y, target.z),
        viewport,
        this.deps.uiScale(),
        CHOP_PROMPT_TOP_CLEARANCE_PX,
        this.anchor,
      )
    ) {
      w.setDisplay(root, 'none');
      return;
    }
    const cap = chip !== null && 'cap' in chip ? chip.cap : '';
    w.setText(this.keycap, cap);
    w.setDisplay(this.keyWrap, cap === '' ? 'none' : '');
    w.setDisplay(this.glyph, chip !== null && 'button' in chip ? '' : 'none');
    w.setText(this.verb, verb);
    const { left, top } = this.anchor;
    if (left !== this.lastLeft) {
      this.lastLeft = left;
      w.setStyleProp(root, 'left', `${left}px`);
    }
    if (top !== this.lastTop) {
      this.lastTop = top;
      w.setStyleProp(root, 'top', `${top}px`);
    }
    w.setDisplay(root, 'flex');
  }
}
