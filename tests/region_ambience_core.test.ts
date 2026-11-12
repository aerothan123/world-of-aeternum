import { describe, expect, it } from 'vitest';
import { SFX_CLIPS } from '../src/game/sfx_manifest.generated';
import { sfxMixBus } from '../src/game/sfx_mix_bus';
import { ForestDensitySampler } from '../src/render/forest_density_core';
import {
  createRegionAmbience,
  dayWeightForPhase,
  interiorBedIndex,
  LEGACY_FLOOR,
  REGION_BED_GAINS,
  REGION_BED_KEYS,
  type RegionAmbience,
  type RegionZone,
  sampleRegionAmbienceInto,
  TOWN_FADE_YARDS,
  TOWN_SOUNDSCAPES,
  ZONE_BLEND_YARDS,
  zoneBedIndex,
} from '../src/render/region_ambience_core';
import { PROVING_SHORE_ZONE } from '../src/sim/content/proving_shore';
import { ZONE1_ZONE } from '../src/sim/content/zone1';
import { DUNGEONS, ZONES, zoneAt } from '../src/sim/data';

// The region beds (src/render/region_ambience_core.ts): which long zone and town
// soundscapes play where the player stands, and how they crossfade.

const weight = (r: RegionAmbience, key: (typeof REGION_BED_KEYS)[number]): number =>
  r.weights[REGION_BED_KEYS.indexOf(key)];

// A synthetic strip: a meadow west of x = 0 with a town hub at (-200, 0), a marsh east of it.
const MEADOW: RegionZone = {
  id: 'eastbrook_vale',
  biome: 'vale',
  hub: { x: -200, z: 0, radius: 26 },
};
const MARSH: RegionZone = { id: 'test_marsh', biome: 'marsh' };
const strip = (x: number): RegionZone => (x < 0 ? MEADOW : MARSH);
const byId = (id: string): RegionZone | undefined => (id === MEADOW.id ? MEADOW : undefined);

function at(x: number, z: number, opts: { day?: number; forest?: number; dungeon?: boolean } = {}) {
  return sampleRegionAmbienceInto(
    createRegionAmbience(),
    {
      x,
      z,
      inDungeon: opts.dungeon ?? false,
      dungeonInterior: null,
      dayWeight: opts.day ?? 1,
      forestDensity: opts.forest ?? 0,
    },
    strip,
    byId,
  );
}

describe('region_ambience_core', () => {
  it('maps the shipped zones to their beds', () => {
    expect(REGION_BED_KEYS[zoneBedIndex(PROVING_SHORE_ZONE)]).toBe('amb_bed_shore');
    expect(REGION_BED_KEYS[zoneBedIndex(ZONE1_ZONE)]).toBe('amb_bed_meadow');
    expect(REGION_BED_KEYS[zoneBedIndex(zoneAt(0, 300))]).toBe('amb_bed_marsh');
    // the Proving Shore island plays the surf at its camp. Eastbrook Vale v2 grew
    // the vale west to x -270, so the island's east seam now lies 30 yd from the
    // camp (-300, 50), inside the ZONE_BLEND_YARDS crossfade: the surf still leads
    // at the camp itself and plays whole a few yards west, past the crossfade.
    const camp = PROVING_SHORE_ZONE.hub;
    expect(camp).toBeDefined();
    const shoreAt = (x: number, z: number) =>
      weight(
        sampleRegionAmbienceInto(
          createRegionAmbience(),
          { x, z, inDungeon: false, dungeonInterior: null, dayWeight: 1, forestDensity: 0 },
          zoneAt,
          () => undefined,
        ),
        'amb_bed_shore',
      );
    const cx = camp?.x ?? 0;
    const cz = camp?.z ?? 0;
    expect(shoreAt(cx, cz)).toBeGreaterThanOrEqual(0.9);
    expect(shoreAt(cx - 4, cz)).toBeCloseTo(1, 5);
  });

  it('plays the zone bed whole away from borders and towns', () => {
    const r = at(-120, 0);
    expect(weight(r, 'amb_bed_meadow')).toBeCloseTo(1, 5);
    expect(weight(r, 'amb_bed_marsh')).toBe(0);
    expect(weight(r, 'amb_bed_town_day')).toBe(0);
  });

  it('crossfades a zone border over the blend reach, never stepping', () => {
    let prevMeadow = 1;
    for (let x = -ZONE_BLEND_YARDS - 4; x <= ZONE_BLEND_YARDS + 4; x += 1) {
      const r = at(x, 0);
      const m = weight(r, 'amb_bed_meadow');
      expect(m).toBeLessThanOrEqual(prevMeadow + 1e-6);
      // one yard moves at most one tap (a tenth) of the mix
      expect(prevMeadow - m).toBeLessThanOrEqual(0.2 + 1e-6);
      expect(m + weight(r, 'amb_bed_marsh')).toBeCloseTo(1, 5);
      prevMeadow = m;
    }
    expect(weight(at(-ZONE_BLEND_YARDS - 1, 0), 'amb_bed_marsh')).toBe(0);
    expect(weight(at(ZONE_BLEND_YARDS + 1, 0), 'amb_bed_meadow')).toBe(0);
  });

  it('swells the town soundscape toward its hub and ducks the zone bed under it', () => {
    const far = at(-200 + 26 + TOWN_FADE_YARDS + 1, 0);
    expect(weight(far, 'amb_bed_town_day')).toBe(0);
    let prev = 0;
    for (let d = 26 + TOWN_FADE_YARDS; d >= 0; d -= 2) {
      const r = at(-200 + d, 0);
      const t = weight(r, 'amb_bed_town_day');
      expect(t).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = t;
    }
    const square = at(-200, 0);
    expect(weight(square, 'amb_bed_town_day')).toBeCloseTo(1, 5);
    expect(weight(square, 'amb_bed_meadow')).toBeGreaterThan(0);
    expect(weight(square, 'amb_bed_meadow')).toBeLessThan(0.5);
  });

  it('blends the town day and night variants by the day weight', () => {
    const night = at(-200, 0, { day: 0 });
    expect(weight(night, 'amb_bed_town_day')).toBe(0);
    expect(weight(night, 'amb_bed_town_night')).toBeCloseTo(1, 5);
    const dusk = at(-200, 0, { day: 0.5 });
    expect(weight(dusk, 'amb_bed_town_day')).toBeCloseTo(0.5, 5);
    expect(weight(dusk, 'amb_bed_town_night')).toBeCloseTo(0.5, 5);
    // after dark the meadow's larks give way to the country's crickets
    const field = at(-120, 0, { day: 0 });
    expect(weight(field, 'amb_bed_meadow')).toBe(0);
    expect(weight(field, 'amb_bed_night_wild')).toBeCloseTo(1, 5);
    const twilight = at(-120, 0, { day: 0.5 });
    expect(weight(twilight, 'amb_bed_meadow') + weight(twilight, 'amb_bed_night_wild')).toBeCloseTo(
      1,
      5,
    );
  });

  it('plays a dungeon interior bed in place of the zone beds, and the hearth in a house', () => {
    const crypt = sampleRegionAmbienceInto(
      createRegionAmbience(),
      {
        x: 5000,
        z: 0,
        inDungeon: true,
        dungeonInterior: 'hollow_crypt',
        dayWeight: 1,
        forestDensity: 0,
      },
      strip,
      byId,
    );
    expect(weight(crypt, 'amb_bed_crypt')).toBe(1);
    expect(crypt.legacyScale).toBeCloseTo(LEGACY_FLOOR, 5);
    expect(REGION_BED_KEYS[interiorBedIndex('cave')]).toBe('amb_bed_cave');
    expect(REGION_BED_KEYS[interiorBedIndex('drowned_temple')]).toBe('amb_bed_temple');
    expect(REGION_BED_KEYS[interiorBedIndex('ignivar_depths')]).toBe('amb_bed_forge');
    expect(REGION_BED_KEYS[interiorBedIndex('lastkeep')]).toBe('amb_bed_castle');
    expect(REGION_BED_KEYS[interiorBedIndex('dawnhold')]).toBe('amb_bed_palace');
    expect(REGION_BED_KEYS[interiorBedIndex('sunken_bastion')]).toBe('amb_bed_bastion');
    expect(REGION_BED_KEYS[interiorBedIndex('nythraxis')]).toBe('amb_bed_lair');
    expect(REGION_BED_KEYS[interiorBedIndex('mine')]).toBe('amb_bed_mine');
    expect(REGION_BED_KEYS[interiorBedIndex('wildheart')]).toBe('amb_bed_wildheart');
    expect(REGION_BED_KEYS[interiorBedIndex('house')]).toBe('amb_bed_house');
    expect(interiorBedIndex('arena')).toBe(-1);
    expect(interiorBedIndex(null)).toBe(-1);
    expect(interiorBedIndex('toString')).toBe(-1);
  });

  it('gives every shipped zone a bed, and every listed town a zone with a hub', () => {
    for (const zone of ZONES) {
      expect(zoneBedIndex(zone), zone.id).toBeGreaterThanOrEqual(0);
    }
    // a town whose zone is not in the shipped list yet (Goldcrest Harbor) simply stays silent
    for (const t of TOWN_SOUNDSCAPES) {
      const zone = ZONES.find((z) => z.id === t.zoneId);
      if (zone) expect(zone.hub, t.zoneId).toBeDefined();
    }
    expect(ZONES.find((z) => z.id === 'eastbrook_vale')?.hub).toBeDefined();
  });

  it('gives every shipped dungeon interior a bed', () => {
    for (const d of Object.values(DUNGEONS)) {
      expect(interiorBedIndex(d.interior ?? null), d.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('hands a wooded meadow to the forest bed and its reverb space', () => {
    const wood = at(-120, 0, { forest: 1 });
    expect(weight(wood, 'amb_bed_forest')).toBeCloseTo(1, 5);
    expect(weight(wood, 'amb_bed_meadow')).toBe(0);
    expect(wood.reverbEnv).toBe('forest');
    const edge = at(-120, 0, { forest: 0.3 });
    expect(weight(edge, 'amb_bed_forest')).toBeCloseTo(0.3, 5);
    expect(edge.reverbEnv).toBeNull();
  });

  it('is silent in an unmapped instance and keeps the older loops whole there', () => {
    const r = at(-120, 0, { dungeon: true });
    for (let i = 0; i < r.weights.length; i++) expect(r.weights[i]).toBe(0);
    expect(r.legacyScale).toBe(1);
    expect(r.reverbEnv).toBeNull();
  });

  it('turns the older biome loops down to the floor where the new beds cover fully', () => {
    expect(at(-120, 0).legacyScale).toBeCloseTo(LEGACY_FLOOR, 5);
  });

  it('reports each gain as weight times the bed mix gain', () => {
    const r = at(-200, 0, { day: 0.5 });
    for (let i = 0; i < REGION_BED_KEYS.length; i++) {
      expect(r.gains[i]).toBeCloseTo(r.weights[i] * REGION_BED_GAINS[REGION_BED_KEYS[i]], 6);
    }
  });

  it('rises from night to day through dawn and falls through dusk', () => {
    expect(dayWeightForPhase(0)).toBe(0);
    expect(dayWeightForPhase(0.5)).toBe(1);
    expect(dayWeightForPhase(0.25)).toBeCloseTo(0.5, 5);
    expect(dayWeightForPhase(0.75)).toBeCloseTo(0.5, 5);
    expect(dayWeightForPhase(0.2)).toBe(0);
    expect(dayWeightForPhase(0.3)).toBe(1);
  });

  it('ships every bed as a stereo, non-positional loop on the Ambience bus', () => {
    for (const key of REGION_BED_KEYS) {
      const clip = (SFX_CLIPS as Record<string, { category?: string } | undefined>)[key];
      expect(clip, key).toBeDefined();
      expect(sfxMixBus(key, clip?.category)).toBe('ambient');
    }
  });
});

describe('forest_density_core', () => {
  it('reads 0 in the open and 1 in a closed wood, gliding between cells', () => {
    // trees only east of x = 0, densely
    const sampler = new ForestDensitySampler((minX, maxX) => {
      const wooded = Math.max(0, Math.min(maxX, 1e9) - Math.max(minX, 0));
      return (wooded / (maxX - minX)) * 40;
    });
    // fill the cache (two new cells a call)
    for (let i = 0; i < 4; i++) sampler.sample(-200, 0);
    expect(sampler.sample(-200, 0)).toBe(0);
    for (let i = 0; i < 4; i++) sampler.sample(200, 0);
    expect(sampler.sample(200, 0)).toBe(1);
    let prev = 0;
    for (let x = -60; x <= 60; x += 2) {
      for (let i = 0; i < 4; i++) sampler.sample(x, 0);
      const d = sampler.sample(x, 0);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-6);
      expect(d - prev).toBeLessThan(0.25);
      prev = d;
    }
  });

  it('counts each cell once and holds the last value while a cell is pending', () => {
    let calls = 0;
    const sampler = new ForestDensitySampler(() => {
      calls++;
      return 100;
    });
    expect(sampler.sample(0, 0)).toBe(0); // only two of the four cells counted yet
    expect(sampler.sample(0, 0)).toBe(1);
    const after = calls;
    sampler.sample(1, 1);
    sampler.sample(0, 0);
    expect(calls).toBe(after);
  });
});
