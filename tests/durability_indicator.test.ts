// The HUD durability indicator (src/ui/hud/durability/): the pure view picks
// the worst worn piece (low under a quarter, broken at zero) and the painter
// writes only through the host's elided writers.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { DurabilityPainter, durabilityView } from '../src/ui/hud/durability';

const CHEST = 'recruit_tunic'; // common chest, 80 durability

describe('durabilityView', () => {
  it('is hidden while every piece is healthy', () => {
    expect(durabilityView({ chest: CHEST }, {}, ITEMS)).toEqual({ state: 'ok', label: '' });
    expect(durabilityView({ chest: CHEST }, { chest: { wear: 50 } }, ITEMS).state).toBe('ok');
  });
  it('turns low under a quarter and broken at zero, with a label', () => {
    const low = durabilityView({ chest: CHEST }, { chest: { wear: 70 } }, ITEMS);
    expect(low.state).toBe('low');
    expect(low.label).not.toBe('');
    const broken = durabilityView({ chest: CHEST }, { chest: { wear: 80 } }, ITEMS);
    expect(broken.state).toBe('broken');
    expect(broken.label).not.toBe(low.label);
  });
});

describe('DurabilityPainter', () => {
  it('shows, tints and labels through the writers only', () => {
    const writes: unknown[][] = [];
    const writers = {
      setAttr: (...a: unknown[]) => writes.push(['attr', ...a.slice(1)]),
      toggleClass: (...a: unknown[]) => writes.push(['class', ...a.slice(1)]),
    } as never;
    const el = {} as HTMLElement;
    new DurabilityPainter(writers, el).paint({ state: 'broken', label: 'Broken gear' });
    expect(writes).toEqual([
      ['attr', 'hidden', null],
      ['class', 'is-low', false],
      ['class', 'is-broken', true],
      ['attr', 'title', 'Broken gear'],
      ['attr', 'aria-label', 'Broken gear'],
    ]);
    new DurabilityPainter(writers, null).paint({ state: 'low', label: 'x' });
  });
});
