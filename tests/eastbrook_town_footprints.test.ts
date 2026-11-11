import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import { isBlocked, queryOpenWorldColliders } from '../src/sim/colliders';
import { ZONE1_PROPS } from '../src/sim/content/zone1';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import {
  EASTBROOK_TOWN_FOOTPRINTS,
  EASTBROOK_TOWN_RETIRED,
  eastbrookTownRecordBoxes,
  eastbrookTownRetiresDecorRow,
  type TownFootprint,
} from '../src/sim/eastbrook_town_footprints';
import { ebv2Owns, ebv2Point, ebv2StandingColliderIndexes } from '../src/sim/eastbrook_v2';
import { EBV2_COLLIDER_IDS, EBV2_COLLIDERS } from '../src/sim/eastbrook_v2/layout.generated';
import { isResting } from '../src/sim/progression/xp';
import { Sim } from '../src/sim/sim';
import { WORLD_SEED } from '../src/sim/world_seed';

// Solid matches solid in Eastbrook: the server blocks on the boxes of the town the Early
// Access client draws (src/sim/eastbrook_town_footprints.ts), and the painted models' own
// walls, annexes and kit boxes it no longer draws stand down.

const TOWN = { minX: -100, maxX: 70, minZ: -140, maxZ: -8 };

function townColliders(): Collider[] {
  const out: Collider[] = [];
  queryOpenWorldColliders(WORLD_SEED, TOWN.minX, TOWN.minZ, TOWN.maxX, TOWN.maxZ, out);
  return out;
}

function sameBox(collider: Collider, box: { x: number; z: number; hw: number; hd: number }) {
  return (
    collider.type === 'obb' &&
    Math.abs(collider.x - box.x) < 1e-6 &&
    Math.abs(collider.z - box.z) < 1e-6 &&
    Math.abs(collider.hw - box.hw) < 1e-6 &&
    Math.abs(collider.hd - box.hd) < 1e-6
  );
}

function inside(box: TownFootprint, x: number, z: number, margin: number): boolean {
  const cos = Math.cos(box.rot);
  const sin = Math.sin(box.rot);
  const lx = (x - box.x) * cos - (z - box.z) * sin;
  const lz = (x - box.x) * sin + (z - box.z) * cos;
  return Math.abs(lx) < box.hw + margin && Math.abs(lz) < box.hd + margin;
}

describe('the Eastbrook town footprints', () => {
  it('names a real owner for every box it replaces or retires', () => {
    const ids = EASTBROOK_TOWN_FOOTPRINTS.map((box) => box.id);
    expect(new Set(ids).size).toBe(ids.length);
    const buildings = new Set([
      ...EASTBROOK_LAYOUT.buildings.map((building) => `building:${building.id}`),
      `building:${EASTBROOK_LAYOUT.weeklyVault.id}`,
    ]);
    const kit = new Set(EASTBROOK_LAYOUT.townKit.map((piece) => `kit:${piece.id}`));
    const owners = [
      ...EASTBROOK_TOWN_FOOTPRINTS.flatMap((box) => (box.replaces === null ? [] : [box.replaces])),
      ...EASTBROOK_TOWN_RETIRED,
    ];
    for (const owner of owners) {
      expect(buildings.has(owner) || kit.has(owner), owner).toBe(true);
    }
    // every town building record is redrawn: none keeps the painted model's walls
    for (const owner of buildings) expect(owners, owner).toContain(owner);
    for (const box of EASTBROOK_TOWN_FOOTPRINTS) {
      expect(box.hw, box.id).toBeGreaterThan(0.1);
      expect(box.hd, box.id).toBeGreaterThan(0.1);
      // SCALE_STANDARD: only a piece over 1.2 m that looks solid gets a box
      expect(box.h, box.id).toBeGreaterThan(1.2);
    }
  });

  // Eastbrook Vale v2 (src/sim/eastbrook_v2/): the Unreal design's own solids stand on
  // the design's ground, so every pilot box there stands down, and so does every box
  // of a building record that stands there (the record is replaced whole); one the
  // design does not own would still stand, exactly once.
  it('stands every pilot box down on the v2 design ground, and any other exactly once', () => {
    const colliders = townColliders();
    const recordOwned = (box: TownFootprint) => {
      const id = box.replaces?.startsWith('building:') ? box.replaces.slice(9) : null;
      const record = ZONE1_PROPS.buildings.find((b) => b.id === id);
      return record !== undefined && ebv2Owns(record.x, record.z);
    };
    let down = 0;
    for (const box of EASTBROOK_TOWN_FOOTPRINTS) {
      const hits = colliders.filter((collider) => sameBox(collider, box));
      if (ebv2Owns(box.x, box.z) || recordOwned(box)) {
        expect(hits, box.id).toHaveLength(0);
        down++;
        continue;
      }
      expect(hits, box.id).toHaveLength(1);
      expect(hits[0]).toMatchObject({ type: 'obb', rot: box.rot });
      expect(isBlocked(WORLD_SEED, box.x, box.z), box.id).toBe(true);
    }
    // the town stands on the design's terrace: nearly every pilot box stood down
    expect(down).toBeGreaterThan(EASTBROOK_TOWN_FOOTPRINTS.length * 0.8);
  });

  it('stands the replaced and retired boxes down, so nothing unseen blocks', () => {
    const colliders = townColliders();
    // the painted buildings' wall boxes and annexes
    for (const building of EASTBROOK_LAYOUT.buildings) {
      const old = [
        {
          x: building.position.x,
          z: building.position.z,
          hw: building.nativeDimensions.width / 2,
          hd: building.nativeDimensions.depth / 2,
        },
        ...building.annexes.map((annex) => ({
          x: annex.center.x,
          z: annex.center.z,
          hw: annex.halfWidth,
          hd: annex.halfDepth,
        })),
      ];
      for (const box of old) {
        expect(
          colliders.some((collider) => sameBox(collider, box)),
          `${building.id} at ${box.x.toFixed(1)}, ${box.z.toFixed(1)}`,
        ).toBe(false);
      }
    }
    // the town kit pieces: a retired row carries no box, a kept one still does
    const owners = new Set([
      ...EASTBROOK_TOWN_FOOTPRINTS.flatMap((box) => (box.replaces === null ? [] : [box.replaces])),
      ...EASTBROOK_TOWN_RETIRED,
    ]);
    let kept = 0;
    for (const piece of EASTBROOK_LAYOUT.townKit) {
      const retired = owners.has(`kit:${piece.id}`);
      expect(
        eastbrookTownRetiresDecorRow(piece.propKey, piece.position.x, piece.position.z),
        piece.id,
      ).toBe(retired);
      const stands = colliders.some((collider) =>
        sameBox(collider, {
          x: piece.collider.center.x,
          z: piece.collider.center.z,
          hw: piece.collider.halfWidth,
          hd: piece.collider.halfDepth,
        }),
      );
      // a kept piece on the v2 design ground stands down with the rest of the old town
      const owned = ebv2Owns(piece.collider.center.x, piece.collider.center.z);
      expect(stands, piece.id).toBe(!retired && !owned);
      if (!retired) kept++;
    }
    // the crafting stations, the stalls, the cart, the clutter and the well keep their boxes
    expect(kept).toBeGreaterThanOrEqual(13);
    // a decor row that is not a town kit piece is never retired
    for (const row of ZONE1_PROPS.decorProps ?? []) {
      if (row.key.startsWith('town')) continue;
      expect(eastbrookTownRetiresDecorRow(row.key, row.x, row.z), row.key).toBe(false);
    }
  });

  it('leaves a record a custom world moved, turned or renamed on its own collider', () => {
    const record = ZONE1_PROPS.buildings.find((building) => building.id === 'eastbrook_inn');
    if (!record) throw new Error('missing the inn record');
    expect(eastbrookTownRecordBoxes(record)).not.toBeNull();
    expect(eastbrookTownRecordBoxes({ ...record, x: record.x + 3 })).toBeNull();
    expect(eastbrookTownRecordBoxes({ ...record, z: record.z - 3 })).toBeNull();
    expect(eastbrookTownRecordBoxes({ ...record, rot: record.rot + 0.4 })).toBeNull();
    expect(eastbrookTownRecordBoxes({ ...record, id: undefined })).toBeNull();
    expect(eastbrookTownRecordBoxes({ ...record, id: 'some_other_house' })).toBeNull();
    expect(eastbrookTownRecordBoxes({ ...EASTBROOK_LAYOUT.weeklyVault })).not.toBeNull();
  });

  it('keeps every town NPC, service and quest object out of the walls', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    // the walls that stand: the v2 design's boxes on its own ground (the pilot boxes
    // stood down above)
    const walls = ebv2StandingColliderIndexes().map((i) => {
      const [x, z, hw, hd, rot] = EBV2_COLLIDERS[i];
      return { id: `ebv2 ${EBV2_COLLIDER_IDS[i]}`, replaces: null, x, z, hw, hd, rot, h: 3 };
    });
    let checked = 0;
    for (const entity of sim.entities.values()) {
      if (entity.kind !== 'npc' && entity.kind !== 'object') continue;
      const { x, z } = entity.pos;
      if (x < TOWN.minX || x > TOWN.maxX || z < TOWN.minZ || z > TOWN.maxZ) continue;
      checked++;
      for (const box of walls) {
        expect(
          inside(box, x, z, 0.3),
          `${entity.templateId} at ${x.toFixed(1)}, ${z.toFixed(1)} in ${box.id}`,
        ).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("stands Jorren and the inn's own things at the inn, and the doorstep still rests a traveller", () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    const inn = EASTBROOK_LAYOUT.buildings.find((building) => building.id === 'eastbrook_inn');
    if (!inn) throw new Error('missing the inn');
    const innV2 = ebv2Point('svc_inn');
    const INN_THINGS = [
      'innkeeper_jorren',
      'ground_c1_tapping_wall_panel',
      'ground_c1_speaking_pipe',
      'ground_c1_nibbled_rent_notice',
      'ground_c1_bread_heel',
      'ground_c1_pantry_saucer',
      'ground_c1_covered_stew_bowl',
      'ground_c1_bread_bundle',
      'ground_c1_inn_hearth',
    ];
    const seen = new Set<string>();
    for (const entity of sim.entities.values()) {
      if (!entity.templateId || !INN_THINGS.includes(entity.templateId)) continue;
      seen.add(entity.templateId);
      const { x, z } = entity.pos;
      // within the v2 design inn's own ground (the inn's things moved with it,
      // data/eastbrook_v2/sites_config.json objectGroups)
      expect(
        Math.hypot(x - innV2.x, z - innV2.z),
        `${entity.templateId} at ${x.toFixed(1)}, ${z.toFixed(1)}`,
      ).toBeLessThan(inn.maxCornerRadius + 6);
      expect(isBlocked(WORLD_SEED, x, z, 0.3), entity.templateId).toBe(false);
    }
    expect([...seen].sort()).toEqual([...INN_THINGS].sort());
    const player = sim.player;
    player.pos = sim.groundPos(inn.frontStandingPoint.x, inn.frontStandingPoint.z);
    player.inCombat = false;
    expect(isResting(player)).toBe(true);
  });
});
