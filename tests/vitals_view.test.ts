import { describe, expect, it } from 'vitest';
import {
  fillVitalsDescriptor,
  newVitalsCache,
  newVitalsDescriptor,
  resetVitalsCache,
  VITALS_LOW_CLASS,
  VITALS_LOW_HEALTH_FRAC,
  type VitalsInput,
  VitalsPainter,
  vitalsLevelText,
  vitalsLow,
} from '../src/ui/hud/vitals';
import { makeWriterFacet, type PainterHostWriters } from '../src/ui/painter_host';
import { unitFrameView } from '../src/ui/unit_frame';
import type { UnitFrameElements } from '../src/ui/unit_frame_painter';
import { FakeDocument, type FakeElement } from './helpers/fake_dom';

// A Sim-shaped input (the player's absorb aura is live) and a ClientWorld-shaped
// one (the mirror zeroes the shield) with the same numbers: the core must map
// both to the same descriptor apart from the absorb reference it passes through.
function input(shape: 'sim' | 'client', over: Partial<VitalsInput> = {}): VitalsInput {
  const absorb =
    shape === 'sim'
      ? { hp: 300, maxHp: 600, auras: [{ kind: 'absorb', value: 100 }] }
      : { hp: 300, maxHp: 600, auras: [] };
  return {
    hp: 300,
    maxHp: 600,
    resource: 80.4,
    maxResource: 100,
    resourceType: 'mana',
    level: 12,
    name: 'Aerwynn',
    hpModeSetting: 3,
    pvpRisk: false,
    borderSlug: '',
    absorb: absorb as unknown as VitalsInput['absorb'],
    ...over,
  };
}

describe('vitals_view: the player descriptor of the unit_frame family', () => {
  it('fills the descriptor from live vitals, formatted through the frame formatters', () => {
    const cache = newVitalsCache();
    const d = newVitalsDescriptor();
    fillVitalsDescriptor(cache, d, input('sim'));
    expect(d.present).toBe(true);
    expect(d.hpFrac).toBe(0.5);
    expect(d.hpText).toBe('300 / 600');
    expect(d.showAbsorbText).toBe(true);
    expect(d.resourceKind).toBe('mana');
    expect(d.resFrac).toBeCloseTo(0.804, 6);
    expect(d.resText).toBe('80 / 100');
    expect(d.levelText).toBe('12');
    expect(d.name).toBe('Aerwynn');
    expect(d.portraitKey).toBe('player');
  });

  it('yields the same descriptor for a Sim- and a ClientWorld-shaped input', () => {
    const a = fillVitalsDescriptor(newVitalsCache(), newVitalsDescriptor(), input('sim'));
    const b = fillVitalsDescriptor(newVitalsCache(), newVitalsDescriptor(), input('client'));
    const { absorb: _a, ...restA } = a;
    const { absorb: _b, ...restB } = b;
    expect(restA).toEqual(restB);
    // The family then derives the shield from the absorb input: present offline,
    // absent in the mirror, with the health text otherwise identical.
    expect(unitFrameView(a).absorbSizeFrac).toBeGreaterThan(0);
    expect(unitFrameView(b).absorbSizeFrac).toBe(0);
  });

  it('is allocation-light: a repeated identical frame reuses the descriptor and formats nothing', () => {
    const cache = newVitalsCache();
    const d = newVitalsDescriptor();
    const first = fillVitalsDescriptor(cache, d, input('sim'));
    const hpText = first.hpText;
    const resText = first.resText;
    const levelText = first.levelText;
    const again = fillVitalsDescriptor(cache, d, input('sim'));
    expect(again).toBe(d);
    // Same string references: the producers did not run again.
    expect(again.hpText).toBe(hpText);
    expect(again.resText).toBe(resText);
    expect(again.levelText).toBe(levelText);
  });

  it('re-formats only the text whose numbers moved', () => {
    const cache = newVitalsCache();
    const d = newVitalsDescriptor();
    fillVitalsDescriptor(cache, d, input('sim'));
    fillVitalsDescriptor(cache, d, input('sim', { hp: 150 }));
    expect(d.hpText).toBe('150 / 600');
    expect(d.hpFrac).toBe(0.25);
    expect(d.resText).toBe('80 / 100');
    fillVitalsDescriptor(cache, d, input('sim', { hp: 150, level: 13 }));
    expect(d.levelText).toBe('13');
  });

  it('honours the health text mode setting, including the no-text mode', () => {
    const cache = newVitalsCache();
    const d = newVitalsDescriptor();
    fillVitalsDescriptor(cache, d, input('sim', { hpModeSetting: 1 }));
    expect(d.hpText).toBe('50%');
    fillVitalsDescriptor(cache, d, input('sim', { hpModeSetting: 0 }));
    expect(d.hpText).toBe('');
    expect(d.showAbsorbText).toBe(false);
    // An unset setting falls back to current / max.
    fillVitalsDescriptor(cache, d, input('sim', { hpModeSetting: undefined }));
    expect(d.hpText).toBe('300 / 600');
  });

  it('resetVitalsCache forces every text to re-format on the next fill', () => {
    const cache = newVitalsCache();
    const d = newVitalsDescriptor();
    const first = fillVitalsDescriptor(cache, d, input('sim'));
    const before = first.hpText;
    resetVitalsCache(cache);
    expect(Number.isNaN(cache.hp)).toBe(true);
    expect(Number.isNaN(cache.level)).toBe(true);
    const after = fillVitalsDescriptor(cache, d, input('sim'));
    expect(after.hpText).toEqual(before);
  });

  it('passes the self-only surfaces through (PvP risk, border slug, absorb input)', () => {
    const d = fillVitalsDescriptor(
      newVitalsCache(),
      newVitalsDescriptor(),
      input('sim', { pvpRisk: true, borderSlug: 'gilded' }),
    );
    expect(d.pvpRisk).toBe(true);
    expect(d.borderSlug).toBe('gilded');
    expect(d.absorb).not.toBeNull();
    expect(d.dead).toBe(false);
    expect(d.outOfRange).toBe(false);
  });

  it('level text is plain locale digits', () => {
    expect(vitalsLevelText(7)).toBe('7');
    expect(vitalsLevelText(60)).toBe('60');
  });

  it('vitalsLow marks a third health or less, never full or absent health', () => {
    expect(VITALS_LOW_HEALTH_FRAC).toBe(0.35);
    expect(vitalsLow(1)).toBe(false);
    expect(vitalsLow(0.5)).toBe(false);
    expect(vitalsLow(0.35)).toBe(true);
    expect(vitalsLow(0.1)).toBe(true);
    expect(vitalsLow(0)).toBe(false);
  });
});

const doc = new FakeDocument();
const el = (): HTMLElement => doc.createElement('div') as unknown as HTMLElement;
const fake = (e: HTMLElement): FakeElement => e as unknown as FakeElement;
const facet = (): PainterHostWriters =>
  makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {},
    () => {},
  );

describe('vitals_painter: the family painter plus the low-health class', () => {
  function rig() {
    const els: UnitFrameElements = {
      frame: el(),
      level: el(),
      hpFill: el(),
      hpText: el(),
      absorb: el(),
      resource: { container: el(), fill: el(), text: el() },
    };
    const painter = new VitalsPainter(facet(), els);
    return { els, painter };
  }

  it('paints the family values and toggles the low class at the threshold', () => {
    const { els, painter } = rig();
    const d = fillVitalsDescriptor(newVitalsCache(), newVitalsDescriptor(), input('client'));
    painter.paint(unitFrameView(d));
    expect(fake(els.level).textContent).toBe('12');
    expect(fake(els.hpText!).textContent).toBe('300 / 600');
    expect(fake(els.hpFill).style.transform).toBe('scaleX(0.5)');
    expect(fake(els.resource!.container).classList.contains('mana')).toBe(true);
    expect(fake(els.frame).classList.contains(VITALS_LOW_CLASS)).toBe(false);
    painter.paint(
      unitFrameView(
        fillVitalsDescriptor(newVitalsCache(), newVitalsDescriptor(), input('client', { hp: 120 })),
      ),
    );
    expect(fake(els.frame).classList.contains(VITALS_LOW_CLASS)).toBe(true);
    expect(fake(els.hpText!).textContent).toBe('120 / 600');
  });
});
