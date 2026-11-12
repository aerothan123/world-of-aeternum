import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import { isBlocked, queryOpenWorldColliders } from '../src/sim/colliders';
import { ZONE1_PROPS } from '../src/sim/content/zone1';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import { ebv2Owns, ebv2Point, ebv2StandingColliderIndexes } from '../src/sim/eastbrook_v2';
import { EBV2_COLLIDER_IDS, EBV2_COLLIDERS } from '../src/sim/eastbrook_v2/layout.generated';
import { isResting } from '../src/sim/progression/xp';
import { Sim } from '../src/sim/sim';
import { WORLD_SEED } from '../src/sim/world_seed';

// Solid matches solid in Eastbrook: the Eastbrook Vale v2 design owns the town ground, so the
// server blocks on the design's own boxes there and every box of the old town (the painted
// models' walls and annexes, the town kit) stands down. Renamed from
// eastbrook_town_footprints.test.ts when the pilot town's footprint table
// (eastbrook_town_footprints.ts) was retired with the old town: its table-only pins (owner
// names, box sizes, pilot boxes standing down, the moved-record rule) went with it; the
// gameplay guarantees below stay.

interface TownBox {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly hw: number;
  readonly hd: number;
  readonly rot: number;
}

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

function inside(box: TownBox, x: number, z: number, margin: number): boolean {
  const cos = Math.cos(box.rot);
  const sin = Math.sin(box.rot);
  const lx = (x - box.x) * cos - (z - box.z) * sin;
  const lz = (x - box.x) * sin + (z - box.z) * cos;
  return Math.abs(lx) < box.hw + margin && Math.abs(lz) < box.hd + margin;
}

describe('the Eastbrook town solids', () => {
  it('stands the old town boxes down on the v2 design ground, so nothing unseen blocks', () => {
    const colliders = townColliders();
    // the painted buildings' wall boxes and annexes (each record stands on design ground)
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
      expect(ebv2Owns(building.position.x, building.position.z), building.id).toBe(true);
      for (const box of old) {
        expect(
          colliders.some((collider) => sameBox(collider, box)),
          `${building.id} at ${box.x.toFixed(1)}, ${box.z.toFixed(1)}`,
        ).toBe(false);
      }
    }
    // The town kit pieces' loop retired with the old kit in the Eastbrook Vale
    // v2 port: no kit piece stands, so none can carry a box.
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
    // The rest step re-pinned for the Eastbrook Vale v2 port: the rest area is
    // the design inn's own footprint (eastbrook_v2/rest.ts), so a traveller
    // rests on the v2 inn's doorstep; the shipped inn record stands on ground
    // the design owns and rests nobody there (progression/xp.ts).
    const player = sim.player;
    player.pos = sim.groundPos(innV2.x, innV2.z);
    player.inCombat = false;
    expect(isResting(player)).toBe(true);
  });
});
