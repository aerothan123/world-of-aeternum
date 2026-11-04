// World Style setting: persisted like the other graphics settings, staged in
// the graphics draft, applied through the graphics rebuild, never an Advanced
// dial (so picking it never switches presets), shown in the Graphics panel
// beside the quality preset, and default Refined for anyone who never set it.
import { describe, expect, it } from 'vitest';
import {
  advancedDialSeed,
  captureGraphicsSettingsSnapshot,
  GRAPHICS_DIAL_KEYS,
  GRAPHICS_REBUILD_KEYS,
  GRAPHICS_STYLE_KEYS,
  graphicsApplyMode,
  graphicsDisplaySnapshot,
  normalizeGraphicsSettingsSnapshot,
  stageGraphicsDraftChange,
} from '../src/game/graphics_rebuild_core';
import { SETTING_RANGES } from '../src/game/settings';
import { gfxInternalsForTest, resolveGfxProfile } from '../src/render/gfx';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';
import { buildGraphicsSections, type OptionsSettingsSource } from '../src/ui/options_view';

function source(num: Record<string, number>): OptionsSettingsSource {
  return {
    num: (k) => num[k] ?? (SETTING_RANGES as Record<string, { def: number }>)[k]?.def ?? 0,
    bool: () => false,
    range: (k) => {
      const r = (SETTING_RANGES as Record<string, { min: number; max: number }>)[k];
      return r ? { min: r.min, max: r.max } : { min: 0, max: 1 };
    },
  };
}

const CAPS = {
  maxTouchPoints: 0,
  coarsePointer: false,
  narrowViewport: false,
  nativeApp: false,
  tightMemory: false,
  platform: 'other' as const,
  softwareRendering: false,
  gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
};

describe('World Style setting', () => {
  it('defaults to Refined and persists 0/1', () => {
    expect(SETTING_RANGES.worldStyle).toEqual({ min: 0, max: 1, def: 1 });
    const fresh = captureGraphicsSettingsSnapshot(() => Number.NaN);
    expect(fresh.worldStyle).toBe(1);
  });

  it('rides the graphics rebuild keys but is never an Advanced dial', () => {
    expect(GRAPHICS_REBUILD_KEYS).toContain('worldStyle');
    expect(GRAPHICS_STYLE_KEYS).toEqual(['worldStyle']);
    expect(GRAPHICS_DIAL_KEYS).not.toContain('worldStyle' as never);
    expect(Object.keys(advancedDialSeed(3))).not.toContain('worldStyle');
  });

  it('stages under a fixed preset without switching to Advanced', () => {
    const draft = normalizeGraphicsSettingsSnapshot({ graphicsPreset: 3, worldStyle: 1 });
    const staged = stageGraphicsDraftChange(draft, 'worldStyle', 0);
    expect(staged.graphicsPreset).toBe(3);
    expect(staged.worldStyle).toBe(0);
    expect(graphicsDisplaySnapshot(staged).worldStyle).toBe(0);
    // re-selecting the shown value is a no-op
    expect(stageGraphicsDraftChange(staged, 'worldStyle', 0)).toBe(staged);
  });

  it('keeps the chosen style when a dial edit switches the draft to Advanced', () => {
    const draft = normalizeGraphicsSettingsSnapshot({ graphicsPreset: 2, worldStyle: 0 });
    const staged = stageGraphicsDraftChange(draft, 'terrainDetail', 2);
    expect(staged.graphicsPreset).toBe(5);
    expect(staged.worldStyle).toBe(0);
  });

  it('changes the derived profile, so Apply rebuilds the renderer', () => {
    const refined = normalizeGraphicsSettingsSnapshot({ graphicsPreset: 3, worldStyle: 1 });
    const classic = normalizeGraphicsSettingsSnapshot({ graphicsPreset: 3, worldStyle: 0 });
    const a = resolveGfxProfile(CAPS, refined, '');
    const b = resolveGfxProfile(CAPS, classic, '');
    expect(a.settings.worldStyle).toBe('refined');
    expect(b.settings.worldStyle).toBe('classic');
    expect(graphicsApplyMode(refined, classic, a.fingerprint, b.fingerprint)).toBe('rebuild');
  });

  it('changes nothing else in the derived settings', () => {
    for (const tier of ['low', 'medium', 'high', 'ultra', 'insane'] as const) {
      const c = { ...gfxInternalsForTest.settingsFor(tier, { search: '', worldStyle: 0 }) };
      const r = { ...gfxInternalsForTest.settingsFor(tier, { search: '', worldStyle: 1 }) };
      expect(c.worldStyle).toBe('classic');
      expect(r.worldStyle).toBe('refined');
      const { worldStyle: _c, ...cRest } = c;
      const { worldStyle: _r, ...rRest } = r;
      expect(rRest).toEqual(cRest);
    }
  });
});

describe('World Style in the Graphics panel', () => {
  const quality = (num: Record<string, number>, nativeShell = false) =>
    buildGraphicsSections(source(num), { touch: false, nativeShell }).find(
      (s) => s.titleKey === 'hudChrome.options.gfxSectionQuality',
    );

  it('sits in the Quality card as a staged two-way choice with its note', () => {
    for (const nativeShell of [false, true]) {
      const card = quality({ graphicsPreset: 3 }, nativeShell);
      const row = card?.controls.find((c) => c.control === 'choice' && c.key === 'worldStyle');
      if (row?.control !== 'choice') throw new Error('no World Style row');
      expect(row.labelKey).toBe('hudChrome.options.gfxWorldStyle');
      expect(row.options.map((o) => [o.value, o.labelKey])).toEqual([
        [0, 'hudChrome.options.gfxWorldStyleClassic'],
        [1, 'hudChrome.options.gfxWorldStyleRefined'],
      ]);
      expect(row.rerender).toBe(true);
      expect(row.current).toBe(1); // the default
      expect(
        card?.controls.some(
          (c) => c.control === 'note' && c.textKey === 'hudChrome.options.gfxWorldStyleNote',
        ),
      ).toBe(true);
    }
  });

  it('shows Classic when stored Classic', () => {
    const row = quality({ graphicsPreset: 2, worldStyle: 0 })?.controls.find(
      (c) => c.control === 'choice' && c.key === 'worldStyle',
    );
    expect(row?.control === 'choice' && row.current).toBe(0);
  });

  it('has English catalog copy for every key it renders', () => {
    const o = hudChromeStrings.options as Record<string, string>;
    expect(o.gfxWorldStyle).toBe('World Style');
    expect(o.gfxWorldStyleClassic).toBe('Classic');
    expect(o.gfxWorldStyleRefined).toBe('Refined');
    expect(o.gfxWorldStyleNote).toMatch(/Neither changes what you can see in combat/);
  });
});
