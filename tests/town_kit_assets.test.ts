// The Eastbrook town kit (docs/design/town-layout-eastbrook.md, phase 2): the
// shipped generated props and their placements. The layout's TOWN_KIT_ASSETS
// numbers (each model's normalized height and ground extents, the inputs to
// every collider and clearance) are measured off the shipped files here, and
// every placement is walked against the town it stands in: dry level ground,
// clear of every building, annex, stall, fence, NPC stand, station point and
// house door, and out of the ferry landing's sightline up the main street.
import { statSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import { PROP_ASSET_DEFS } from '../src/render/props';
import { TOWN_KIT_PROP_DEFS } from '../src/render/town_kit_props';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import { ZONE1_PROPS } from '../src/sim/content/zone1';
import {
  distancePointToObb,
  EASTBROOK_LAYOUT,
  type Obb2,
  obbsOverlap,
  segmentToObb,
  TOWN_KIT_ASSETS,
} from '../src/sim/eastbrook_layout';
import { FERRY_BELL_TOWN_LANDING } from '../src/sim/interactions/ferry_bell';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const ROOT = path.join(__dirname, '..');
const KIT = EASTBROOK_LAYOUT.townKit;

interface Measured {
  height: number;
  w: number;
  d: number;
  minY: number;
  cx: number;
  cz: number;
  triangles: number;
  bytes: number;
  textures: { mime: string; w: number; h: number }[];
}
const measured = new Map<string, Measured>();

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const [id, asset] of Object.entries(TOWN_KIT_ASSETS)) {
    const file = path.join(ROOT, 'public', asset.url);
    const doc = await io.read(file);
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const b = getBounds(scene);
    let triangles = 0;
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const indices = prim.getIndices();
        const count = indices
          ? indices.getCount()
          : (prim.getAttribute('POSITION')?.getCount() ?? 0);
        triangles += count / 3;
      }
    }
    measured.set(id, {
      height: b.max[1] - b.min[1],
      w: b.max[0] - b.min[0],
      d: b.max[2] - b.min[2],
      minY: b.min[1],
      cx: (b.max[0] + b.min[0]) / 2,
      cz: (b.max[2] + b.min[2]) / 2,
      triangles,
      bytes: statSync(file).size,
      textures: root.listTextures().map((t) => {
        const size = t.getSize() ?? [0, 0];
        return { mime: t.getMimeType(), w: size[0], h: size[1] };
      }),
    });
  }
}, 60_000);

describe('the town kit models', () => {
  it('ship normalized: base on the ground, centred, at the height and extents the layout reads', () => {
    for (const [id, asset] of Object.entries(TOWN_KIT_ASSETS)) {
      const m = measured.get(id);
      expect(m, id).toBeDefined();
      if (!m) continue;
      expect(Math.abs(m.minY), `${id} base`).toBeLessThan(0.02);
      expect(Math.abs(m.height - asset.propHeight), `${id} height`).toBeLessThan(0.02);
      expect(Math.abs(m.w - asset.w), `${id} w`).toBeLessThan(0.02);
      expect(Math.abs(m.d - asset.d), `${id} d`).toBeLessThan(0.02);
      expect(Math.abs(m.cx), `${id} centred x`).toBeLessThan(0.05);
      expect(Math.abs(m.cz), `${id} centred z`).toBeLessThan(0.05);
    }
  });

  it('stay inside the prop budget: at most 6000 triangles, 350 KB and 512 px WEBP maps each', () => {
    for (const [id, m] of measured) {
      expect(m.triangles, `${id} triangles`).toBeLessThanOrEqual(6000);
      expect(m.bytes, `${id} bytes`).toBeLessThanOrEqual(350 * 1024);
      for (const tex of m.textures) {
        expect(['image/webp', 'image/ktx2'], `${id} texture`).toContain(tex.mime);
        expect(Math.max(tex.w, tex.h), `${id} texture size`).toBeLessThanOrEqual(512);
      }
    }
  });

  it('join the props registry under their layout keys', () => {
    for (const asset of Object.values(TOWN_KIT_ASSETS)) {
      expect(TOWN_KIT_PROP_DEFS[asset.propKey]?.url).toBe(asset.url);
      expect(PROP_ASSET_DEFS[asset.propKey]?.url).toBe(asset.url);
    }
  });
});

describe('the town kit placements', () => {
  it('place every kit piece as zone decor with its own box collider', () => {
    const decor = ZONE1_PROPS.decorProps ?? [];
    for (const kit of KIT) {
      const row = decor.find(
        (d) => d.key === kit.propKey && d.x === kit.position.x && d.z === kit.position.z,
      );
      expect(row, kit.id).toBeDefined();
      if (!row) continue;
      expect(row.rot).toBe(kit.rotation);
      expect(row.scale).toBeCloseTo(kit.scale, 9);
      expect(row.hw).toBeCloseTo(kit.collider.halfWidth, 9);
      expect(row.hd).toBeCloseTo(kit.collider.halfDepth, 9);
      expect(row.h).toBe(kit.height);
      // the collider is the walls, inside the model's whole reach
      expect(kit.collider.halfWidth).toBeLessThan(kit.reach.halfWidth);
      expect(kit.collider.halfDepth).toBeLessThan(kit.reach.halfDepth);
    }
  });

  it('stand on dry ground', () => {
    for (const kit of KIT) {
      for (const [u, v] of [
        [0, 0],
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const c = Math.cos(kit.rotation);
        const s = Math.sin(kit.rotation);
        const lx = u * kit.reach.halfWidth;
        const lz = v * kit.reach.halfDepth;
        const x = kit.position.x + lx * c + lz * s;
        const z = kit.position.z - lx * s + lz * c;
        expect(terrainHeight(x, z, WORLD_SEED), `${kit.id} corner ${u},${v}`).toBeGreaterThan(
          WATER_LEVEL + 0.5,
        );
      }
    }
  });

  it('keep clear of the town: buildings, annexes, the vault, stalls, fences and each other', () => {
    const blockers: Obb2[] = [];
    for (const building of EASTBROOK_LAYOUT.buildings) {
      blockers.push(building.reach, ...building.annexes);
    }
    const vault = EASTBROOK_LAYOUT.weeklyVault;
    blockers.push({
      id: vault.id,
      center: { x: vault.x, z: vault.z },
      halfWidth: vault.w / 2,
      halfDepth: vault.d / 2,
      rotation: vault.rot,
    });
    for (const stall of EASTBROOK_LAYOUT.market.stalls) blockers.push(stall.footprint);
    for (const bench of EASTBROOK_LAYOUT.civic.benches) blockers.push(bench.footprint);
    for (const fence of EASTBROOK_LAYOUT.fences) blockers.push(fence.footprint);
    blockers.push(EASTBROOK_LAYOUT.services.noticeboard.footprint);
    const hits: string[] = [];
    for (const kit of KIT) {
      for (const blocker of blockers) {
        if (obbsOverlap(kit.reach, blocker)) hits.push(`${kit.id} x ${blocker.id}`);
      }
    }
    for (let i = 0; i < KIT.length; i++) {
      for (let j = i + 1; j < KIT.length; j++) {
        if (obbsOverlap(KIT[i].collider, KIT[j].collider)) hits.push(`${KIT[i].id} x ${KIT[j].id}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('never wall off a person, a station point, the mailbox or a house door', () => {
    const points: { id: string; x: number; z: number; r: number }[] = [
      ...EASTBROOK_LAYOUT.services.npcs.map((npc) => ({
        id: npc.id,
        ...npc.position,
        r: npc.bodyRadius,
      })),
      ...EASTBROOK_LAYOUT.services.stations.map((station) => ({
        id: station.id,
        ...station.position,
        r: 0.8,
      })),
      { id: 'mailbox', ...EASTBROOK_LAYOUT.services.mailbox.frontStandingPoint, r: 0.5 },
      { id: 'player_start', ...EASTBROOK_LAYOUT.services.playerStart.position, r: 0.8 },
      ...HOUSE_LOTS.filter((lot) => lot.zoneId === 'eastbrook_vale').flatMap((lot) => [
        { id: `${lot.id}:door`, ...lot.doorPos, r: 0.5 },
        {
          id: `${lot.id}:leave`,
          x: lot.doorPos.x + lot.leaveOffset.x,
          z: lot.doorPos.z + lot.leaveOffset.z,
          r: 0.5,
        },
      ]),
    ];
    const blocked: string[] = [];
    for (const kit of KIT) {
      for (const point of points) {
        if (distancePointToObb(point, kit.collider) < point.r)
          blocked.push(`${kit.id} x ${point.id}`);
      }
    }
    expect(blocked).toEqual([]);
  });

  it('leave the ferry landing a clear view up the main street toward the chapel', () => {
    // The Proving Shore graduate lands facing up into town (ferry_bell.ts); the
    // first 60 yd of that look stay free of every kit house and civic block.
    const { x, z, facing } = FERRY_BELL_TOWN_LANDING;
    const end = { x: x + Math.sin(facing) * 60, z: z + Math.cos(facing) * 60 };
    const sightline = segmentToObb('landing_sightline', { x, z }, end, 3);
    const blocking = KIT.filter(
      (kit) => kit.role !== 'dressing' && obbsOverlap(kit.collider, sightline),
    ).map((kit) => kit.id);
    expect(blocking).toEqual([]);
  });
});
