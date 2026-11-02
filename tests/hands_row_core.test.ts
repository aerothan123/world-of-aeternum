import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type ActionBarPaintDescriptor,
  ActionBarPainter,
} from '../src/ui/hud/action_bar/action_bar_painter';
import {
  HANDS_ROW,
  HANDS_ROW_CLASS,
  HANDS_SLOT_GAP_PX,
  HANDS_SLOT_SIZE_PX,
  handsRowWidthPx,
} from '../src/ui/hud/action_bar/hands_row_core';
import { makeWriterFacet } from '../src/ui/painter_host';
import { FakeDocument, type FakeElement } from './helpers/fake_dom';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string) => readFileSync(`${REPO}${rel}`, 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('hands_row_core: the Project H shape of the action bar', () => {
  it('names the 36px square slot and its gap (docs/design/project-h-interface.md)', () => {
    expect(HANDS_SLOT_SIZE_PX).toBe(36);
    expect(HANDS_SLOT_GAP_PX).toBe(4);
    expect(HANDS_ROW).toEqual({
      rowClass: 'hands-row',
      slotSizePx: 36,
      slotGapPx: 4,
      railPlate: false,
    });
  });

  it('holds the sheet and the descriptor to one number', () => {
    const tokens = stripComments(read('src/styles/tokens.css'));
    expect(tokens).toContain(`--hands-slot-size: ${HANDS_SLOT_SIZE_PX}px;`);
    expect(tokens).toContain(`--hands-slot-gap: ${HANDS_SLOT_GAP_PX}px;`);
    // The socket family sizes itself from the hands tokens, so every desktop
    // row (and the XP line's --action-rail-w) follows the descriptor.
    expect(tokens).toContain('--socket-size: var(--hands-slot-size);');
    expect(tokens).toContain('--socket-gap: var(--hands-slot-gap);');
    const hud = stripComments(read('src/styles/hud.css'));
    expect(hud).toContain(`#actionbar.${HANDS_ROW_CLASS}`);
  });

  it('computes the row width the XP line matches', () => {
    expect(handsRowWidthPx(0)).toBe(0);
    expect(handsRowWidthPx(1)).toBe(36);
    expect(handsRowWidthPx(12)).toBe(12 * 36 + 11 * 4);
  });

  it('the action bar painter stamps the row class once at construction, through the facet', () => {
    const doc = new FakeDocument();
    const container = doc.createElement('div');
    let writes = 0;
    const facet = makeWriterFacet(
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      () => {
        writes++;
      },
      () => {},
    );
    const descriptor: ActionBarPaintDescriptor = {
      container: container as unknown as HTMLElement,
      slots: [],
      rowClass: HANDS_ROW.rowClass,
    };
    new ActionBarPainter(facet, descriptor, (key) => key);
    expect((container as FakeElement).classList.contains(HANDS_ROW_CLASS)).toBe(true);
    expect(writes).toBe(1);
    // An instance without a row class (the mobile pager) stamps nothing.
    const plain = doc.createElement('div');
    new ActionBarPainter(
      facet,
      { container: plain as unknown as HTMLElement, slots: [] },
      (k) => k,
    );
    expect((plain as FakeElement).classList.contains(HANDS_ROW_CLASS)).toBe(false);
  });
});
