// The Eastbrook Vale v2 brook bridge (src/sim/eastbrook_v2/bridge.ts): the north road
// crosses the brook on a timber deck beside the Broken Span, which stays a ruin.
import { describe, expect, it } from 'vitest';
import { EBV2_BROOK_BRIDGE, ebv2BridgeSurface } from '../src/sim/eastbrook_v2/bridge';
import { EBV2_ROADS } from '../src/sim/eastbrook_v2/layout.generated';
import { ebv2Point } from '../src/sim/eastbrook_v2/points';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const B = EBV2_BROOK_BRIDGE;
const road = (id: string) => {
  const r = EBV2_ROADS.find((x) => x.id === id);
  if (!r) throw new Error(`no design road ${id}`);
  return r.points;
};

describe('Eastbrook v2 brook bridge', () => {
  it('joins the two north road lanes, one at each end of the deck', () => {
    const south = road('north_road');
    expect(south[south.length - 1]).toEqual([B.x, B.z0]);
    expect(road('north_road_n')[0]).toEqual([B.x, B.z1]);
  });

  it('spans real water, and a body walks the whole deck dry with no step', () => {
    let wet = 0;
    let prev = groundHeight(B.x, B.z0 - 1, WORLD_SEED);
    for (let z = B.z0 - 1; z <= B.z1 + 1; z += 0.5) {
      for (const dx of [-B.halfWidth + 0.3, 0, B.halfWidth - 0.3]) {
        const g = groundHeight(B.x + dx, z, WORLD_SEED);
        expect(g, `deck (${B.x + dx}, ${z})`).toBeGreaterThan(WATER_LEVEL + 1);
        if (terrainHeight(B.x + dx, z, WORLD_SEED) < WATER_LEVEL) wet++;
      }
      const g = groundHeight(B.x, z, WORLD_SEED);
      expect(Math.abs(g - prev), `step at z ${z}`).toBeLessThan(0.45);
      prev = g;
    }
    expect(wet).toBeGreaterThan(0);
  });

  it('meets each bank flush: both deck ends within 5 cm of the bank ground', () => {
    // The import holds the two abutments at the design's flat offset (dryAnchors), so
    // the bank Unreal builds the deck onto is the bank the server walks off.
    for (const z of [B.z0, B.z1]) {
      const deck = ebv2BridgeSurface(B.x, z);
      const bank = terrainHeight(B.x, z, WORLD_SEED);
      expect(Math.abs(deck - bank), `deck end at z ${z}: deck ${deck}, bank ${bank}`).toBeLessThan(
        0.05,
      );
    }
    // and the arch still rises over the brook
    const mid = ebv2BridgeSurface(B.x, (B.z0 + B.z1) / 2);
    expect(mid).toBeGreaterThan(Math.max(B.y0, B.y1) + 0.2);
  });

  it('leaves the Broken Span standing as a landmark a few yards upstream', () => {
    const ruin = ebv2Point('lm_brokenspan');
    expect(ruin.name).toBe('The Broken Span');
    expect(Math.abs(ruin.x - B.x)).toBeGreaterThan(B.halfWidth + 6);
  });
});
