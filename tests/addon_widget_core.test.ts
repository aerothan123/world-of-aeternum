// The declarative add-on UI layer's pure core (src/ui/hud/addons/
// addon_widget_core.ts): op parsing, prop sanitizing (no CSS, no URL, strict
// colors), caps, the widget tree, and secure-button combat lockdown.
// docs/design/addon-api.md sections 5.6 and 6.
import { describe, expect, it } from 'vitest';
import {
  ADDON_UI_LIMITS,
  anchorCss,
  barFraction,
  createAddonWidgetTree,
  parseAddonUiOp,
  sanitizeAddonColor,
  sanitizeAddonProps,
} from '../src/ui/hud/addons/addon_widget_core';

const open = { secureAllowed: true };
const closed = { secureAllowed: false };

describe('sanitizeAddonColor', () => {
  it('accepts strict hex and named game tokens only', () => {
    expect(sanitizeAddonColor('#ABC')).toBe('#abc');
    expect(sanitizeAddonColor('#11223344')).toBe('#11223344');
    expect(sanitizeAddonColor('accent')).toBe('var(--color-accent)');
    expect(sanitizeAddonColor('class:warrior')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each([
    'red',
    'url(https://evil.example/x)',
    'var(--anything)',
    '#12345',
    'expression(alert(1))',
    '#fff; background:url(x)',
    'class:nope',
  ])('rejects %s', (c) => {
    expect(sanitizeAddonColor(c)).toBeNull();
  });
});

describe('sanitizeAddonProps', () => {
  it('drops unknown keys, so there is no free CSS or HTML channel', () => {
    const r = sanitizeAddonProps(
      'frame',
      { style: 'x', html: '<img src=x>', className: 'window', x: 3 },
      open,
    );
    expect(r.ok && r.props).toEqual({ x: 3 });
  });

  it('rejects a bad value for a known key', () => {
    expect(sanitizeAddonProps('text', { color: 'url(x)' }, open).ok).toBe(false);
    expect(sanitizeAddonProps('text', { size: 'big' }, open).ok).toBe(false);
    expect(sanitizeAddonProps('frame', { point: 'MIDDLE' }, open).ok).toBe(false);
  });

  it('clamps coordinates, sizes, alpha and font size', () => {
    const r = sanitizeAddonProps('text', { x: 1e9, width: -5, alpha: 3, size: 100 }, open);
    expect(r.ok && r.props).toEqual({ x: ADDON_UI_LIMITS.maxCoord, width: 0, alpha: 1, size: 32 });
  });

  it('caps text length', () => {
    const r = sanitizeAddonProps('text', { text: 'a'.repeat(10_000) }, open);
    expect(r.ok && r.props.text?.length).toBe(ADDON_UI_LIMITS.maxTextChars);
  });

  it('allows secure actions only from the allowlist, only on buttons, only with the permission', () => {
    expect(sanitizeAddonProps('button', { secure: { type: 'actionSlot', slot: 3 } }, open).ok).toBe(
      true,
    );
    expect(sanitizeAddonProps('frame', { secure: { type: 'actionSlot', slot: 3 } }, open).ok).toBe(
      false,
    );
    const denied = sanitizeAddonProps(
      'button',
      { secure: { type: 'actionSlot', slot: 3 } },
      closed,
    );
    expect(!denied.ok && denied.reason).toBe('permission');
    for (const bad of [
      { type: 'cast', ability: 'fireball' },
      { type: 'actionSlot', slot: 999 },
      { type: 'targetUnit', unit: 'target' },
      { type: 'toggleWindow', window: 'mail' },
      { type: 'sendChat', text: 'hi' },
    ]) {
      expect(sanitizeAddonProps('button', { secure: bad }, open).ok, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });
});

describe('parseAddonUiOp', () => {
  it('parses create, set and destroy, and rejects anything else', () => {
    expect(
      parseAddonUiOp({ op: 'c', id: 1, type: 'frame', parent: null, props: {} }, open).ok,
    ).toBe(true);
    expect(parseAddonUiOp({ op: 's', id: 1, props: {} }, open).ok).toBe(true);
    expect(parseAddonUiOp({ op: 'd', id: 1 }, open).ok).toBe(true);
    for (const bad of [
      { op: 'c', id: 1, type: 'iframe' },
      { op: 'c', id: 1, type: 'img' },
      { op: 'cast', id: 1 },
      { op: 'c', id: -1, type: 'frame' },
      { op: 'c', id: 1, type: 'frame', parent: 'body' },
      null,
    ]) {
      expect(parseAddonUiOp(bad, open).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('createAddonWidgetTree', () => {
  const c = (id: number, type: 'frame' | 'button', parent: number | null, props = {}) => {
    const r = parseAddonUiOp({ op: 'c', id, type, parent, props }, open);
    if (!r.ok) throw new Error('fixture');
    return r.op;
  };

  it('builds a tree, removes whole subtrees, and refuses orphans and duplicates', () => {
    const t = createAddonWidgetTree(open);
    expect(t.apply(c(1, 'frame', null)).ok).toBe(true);
    expect(t.apply(c(2, 'frame', 1)).ok).toBe(true);
    expect(t.apply(c(3, 'frame', 2)).ok).toBe(true);
    expect(t.apply(c(3, 'frame', 1)).ok).toBe(false);
    expect(t.apply(c(9, 'frame', 77)).ok).toBe(false);
    const d = t.apply({ op: 'd', id: 2 });
    expect(d.ok && d.removed.sort()).toEqual([2, 3]);
    expect([...t.widgets.keys()]).toEqual([1]);
  });

  it('enforces the widget cap', () => {
    const t = createAddonWidgetTree(open);
    for (let i = 1; i <= ADDON_UI_LIMITS.maxWidgets; i++)
      expect(t.apply(c(i, 'frame', null)).ok).toBe(true);
    const over = t.apply(c(ADDON_UI_LIMITS.maxWidgets + 1, 'frame', null));
    expect(!over.ok && over.reason).toBe('cap');
  });

  it('allows movable only on top-level frames', () => {
    const t = createAddonWidgetTree(open);
    t.apply(c(1, 'frame', null, { movable: true }));
    expect(t.apply(c(2, 'frame', 1, { movable: true })).ok).toBe(false);
  });

  it('locks secure buttons and their ancestors in combat, and nothing else', () => {
    const t = createAddonWidgetTree(open);
    t.apply(c(1, 'frame', null));
    t.apply(c(2, 'button', 1, { secure: { type: 'toggleWindow', window: 'bags' } }));
    t.apply(c(3, 'frame', null));
    // creating, hiding, moving or re-declaring a secure button (or a parent) waits
    expect(
      t.lockedInCombat(c(4, 'button', null, { secure: { type: 'actionSlot', slot: 1 } })),
    ).toBe(true);
    expect(t.lockedInCombat({ op: 's', id: 1, props: { shown: false } })).toBe(true);
    expect(
      t.lockedInCombat({ op: 's', id: 2, props: { secure: { type: 'actionSlot', slot: 2 } } }),
    ).toBe(true);
    expect(t.lockedInCombat({ op: 's', id: 2, props: { alpha: 0 } })).toBe(true);
    expect(t.lockedInCombat({ op: 'd', id: 1 })).toBe(true);
    // relabelling is fine; unrelated frames are untouched
    expect(t.lockedInCombat({ op: 's', id: 2, props: { text: 'Bags' } })).toBe(false);
    expect(t.lockedInCombat({ op: 's', id: 3, props: { shown: false } })).toBe(false);
    // the count follows destroy
    t.apply({ op: 'd', id: 2 });
    expect(t.lockedInCombat({ op: 's', id: 1, props: { shown: false } })).toBe(false);
  });
});

describe('layout math', () => {
  it('anchors by percent + translate, never a layout read', () => {
    expect(anchorCss({ point: 'CENTER', relativePoint: 'CENTER', x: 5, y: -3 })).toEqual({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%) translate(5px, -3px)',
    });
    expect(anchorCss({ point: 'TOPRIGHT', relativePoint: 'BOTTOMRIGHT' }).top).toBe('100%');
  });

  it('computes bar fractions and tolerates degenerate ranges', () => {
    expect(barFraction({ value: 5, min: 0, max: 10 })).toBe(0.5);
    expect(barFraction({ value: 50, min: 0, max: 10 })).toBe(1);
    expect(barFraction({ value: 1, min: 3, max: 3 })).toBe(0);
  });
});
