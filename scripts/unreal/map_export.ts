// W6 (map and minimap) exports for the native Unreal client, in the W0 parity exporter's file
// shape (scripts/unreal/parity_export.ts). Two kinds of output:
//   - parity suites (scripts/unreal/protocol/parity/<suite>.json): the authoritative TS minimap
//     core (src/ui/minimap_markers.ts createMinimapMarkers) and zone-map frame
//     (src/ui/map_window_view.ts buildOverworldMapModel) run over FIXED snapshots; every emitted
//     marker carries the world point it marks, so the Unreal tests `Wyndlewood.Map.Parity.*`
//     re-project the same snapshot and must land within 0.5 yd of every TS marker;
//   - the map content (scripts/unreal/protocol/map/map_content.json): zone rects and POIs,
//     gather nodes, crafting stations, farm patches, town project sites and the minimap
//     constants the client's map views read.
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_map_export.test.ts`, then
// copy into the Unreal worktree (Data/Parity/, Data/Map/).

import { FARM_PATCHES } from '../../src/sim/content/farm_patches';
import { TOWN_PROJECTS } from '../../src/sim/content/town_projects';
import { GATHER_NODES, getActiveWorldContent, QUESTS, STATIONS, ZONES } from '../../src/sim/data';
import { isProfessionQuest } from '../../src/sim/quests/ambient_quest_marker';
import { buildOverworldMapModel } from '../../src/ui/map_window_view';
import {
  createMinimapMarkers,
  MINIMAP_CLIP_INSET,
  type MinimapMarker,
} from '../../src/ui/minimap_markers';
import { MINIMAP_BASE_SCALE } from '../../src/ui/minimap_painter';
import { MINIMAP_ZOOM_LEVELS } from '../../src/ui/minimap_zoom';
import type { IWorld } from '../../src/world_api';
import type { ParityCase, ParitySuite } from './parity_export';

export const MAP_EXPORT_SUBDIR = 'map';
export const MAP_CONTENT_FILE = 'map_content.json';
/** The minimap canvas side the web HUD paints (#minimap). */
export const MINIMAP_CANVAS = 162;
/** The world map canvas side the parity cases use. */
export const ZONE_MAP_CANVAS = 512;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------------------
// Content

export function buildMapContent() {
  const zones = ZONES.map((z) => ({
    id: z.id,
    name: z.name,
    xMin: z.xMin ?? null,
    xMax: z.xMax ?? null,
    zMin: z.zMin,
    zMax: z.zMax,
    pois: ((z as { pois?: { x: number; z: number; name?: string }[] }).pois ?? []).map((p, i) => ({
      index: i,
      x: p.x,
      z: p.z,
    })),
  }));
  return {
    minimap: {
      canvas: MINIMAP_CANVAS,
      baseScale: MINIMAP_BASE_SCALE,
      clipInset: MINIMAP_CLIP_INSET,
      zoomLevels: [...MINIMAP_ZOOM_LEVELS],
    },
    zones,
    gatherNodes: GATHER_NODES.map((n) => ({
      id: n.id,
      type: n.type,
      tier: n.tier,
      x: n.pos.x,
      z: n.pos.z,
    })),
    stations: STATIONS.map((s) => ({ id: s.id, type: s.type, x: s.pos.x, z: s.pos.z })),
    farmPatches: FARM_PATCHES.map((p) => ({ id: p.id, x: p.x, z: p.z })),
    townProjects: TOWN_PROJECTS.map((t) => ({
      id: t.id,
      zoneId: t.zoneId,
      x: t.site.x,
      z: t.site.z,
    })),
  };
}

// ---------------------------------------------------------------------------
// Fixed snapshots

interface SnapEntity {
  id: number;
  kind: 'player' | 'npc' | 'mob' | 'object';
  x: number;
  z: number;
  hostile?: boolean;
  lootable?: boolean;
  quest?: boolean;
}
interface SnapParty {
  pid: number;
  cls: string;
  dead: number;
  x: number;
  z: number;
}
interface Snapshot {
  name: string;
  px: number;
  pz: number;
  facing: number;
  entities: SnapEntity[];
  party: SnapParty[];
}

const GIVER = Object.values(QUESTS).find((q) => q.giverNpcId && !isProfessionQuest(q));

function snapshotAround(name: string, cx: number, cz: number): Snapshot {
  return {
    name,
    px: cx,
    pz: cz,
    facing: 0.5,
    entities: [
      { id: 2, kind: 'npc', x: cx + 6.25, z: cz + 3.5, quest: true },
      { id: 3, kind: 'npc', x: cx - 4, z: cz + 9 },
      { id: 4, kind: 'mob', x: cx - 10.5, z: cz + 4.25, hostile: true },
      { id: 5, kind: 'mob', x: cx + 30, z: cz - 12, hostile: true },
      { id: 6, kind: 'object', x: cx + 2, z: cz - 7.75, lootable: true },
      { id: 7, kind: 'mob', x: cx + 400, z: cz, hostile: true },
    ],
    party: [
      { pid: 1, cls: 'warrior', dead: 0, x: cx, z: cz },
      { pid: 20, cls: 'mage', dead: 0, x: cx + 5, z: cz - 8 },
      { pid: 21, cls: 'priest', dead: 1, x: cx + 30, z: cz + 140 },
      { pid: 22, cls: 'rogue', dead: 0, x: cx - 260, z: cz - 90 },
    ],
  };
}

function fixedSnapshots(): Snapshot[] {
  const out: Snapshot[] = [];
  const project = TOWN_PROJECTS[0];
  if (project) out.push(snapshotAround('town_project', project.site.x + 3, project.site.z - 2));
  const station = STATIONS[0];
  if (station) out.push(snapshotAround('station', station.pos.x - 6, station.pos.z + 4));
  const node = GATHER_NODES[0];
  if (node) out.push(snapshotAround('gather_node', node.pos.x + 8, node.pos.z + 5));
  return out;
}

function worldFor(s: Snapshot): IWorld {
  const ent = (e: SnapEntity) => ({
    id: e.id,
    kind: e.kind,
    name: `E${e.id}`,
    pos: { x: e.x, y: 0, z: e.z },
    dead: false,
    hostile: e.hostile === true,
    lootable: e.lootable === true,
    aggroTargetId: null,
    questIds: e.quest && GIVER ? [GIVER.id] : [],
    templateId: e.quest && GIVER ? GIVER.giverNpcId : '',
  });
  const player = {
    id: 1,
    kind: 'player',
    name: 'Me',
    pos: { x: s.px, y: 0, z: s.pz },
    facing: s.facing,
    level: 20,
    dead: false,
    ghost: false,
    corpsePos: null,
    questIds: [],
    templateId: '',
  };
  const entities = new Map<number, unknown>([[1, player]]);
  for (const e of s.entities) entities.set(e.id, ent(e));
  return {
    player,
    entities,
    playerId: 1,
    partyInfo: { leader: 1, raid: false, members: s.party },
    socialInfo: null,
    delveRun: null,
    riftFloor: null,
    hillInfo: null,
    bgInfo: null,
    cfg: { seed: 42, playerClass: 'warrior' },
    stationPlacements: STATIONS,
    farmPatches: FARM_PATCHES,
    civicServicePlacements: [],
    questState: (q: string) => (GIVER && q === GIVER.id ? 'available' : 'unavailable'),
    inventory: [],
    gatherToolSlots: [],
    gatheringProficiency: {},
    nodeHarvestableByMe: () => true,
    raidLockouts: () => [],
    worldBossActive: () => false,
    worldQuestCycle: { questIds: [], cycleId: 0 },
    worldQuestReplacements: {},
    worldQuestLog: new Map(),
    questsDone: new Set<string>(),
    questLog: new Map(),
    craftingIdentity: { version: 1, synced: false, cadenceBlockedQuests: [] },
  } as unknown as IWorld;
}

/** World point each candidate source sits at, keyed `<family>:<id>`. */
function candidateSources(s: Snapshot): { ref: string; kinds: string[]; x: number; z: number }[] {
  const out: { ref: string; kinds: string[]; x: number; z: number }[] = [];
  for (const e of s.entities) {
    out.push({ ref: `entity:${e.id}`, kinds: ['npc', 'mob', 'object-loot'], x: e.x, z: e.z });
  }
  for (const n of GATHER_NODES) {
    out.push({ ref: `node:${n.id}`, kinds: ['gather-node'], x: n.pos.x, z: n.pos.z });
  }
  for (const st of STATIONS) {
    out.push({ ref: `station:${st.id}`, kinds: ['station'], x: st.pos.x, z: st.pos.z });
  }
  for (const f of FARM_PATCHES)
    out.push({ ref: `farm:${f.id}`, kinds: ['farm-patch'], x: f.x, z: f.z });
  for (const t of TOWN_PROJECTS) {
    out.push({ ref: `project:${t.id}`, kinds: ['town-project'], x: t.site.x, z: t.site.z });
  }
  for (const m of s.party) {
    out.push({ ref: `party:${m.pid}`, kinds: ['party-disc', 'party-arrow'], x: m.x, z: m.z });
  }
  return out;
}

const EXPORTED_KINDS = new Set([
  'npc',
  'mob',
  'object-loot',
  'gather-node',
  'station',
  'farm-patch',
  'town-project',
  'party-disc',
  'party-arrow',
  'player',
]);

/** Match a marker to its source: exact re-projection for unclamped markers, bearing for arrows. */
function refFor(
  m: MinimapMarker,
  s: Snapshot,
  half: number,
  ppy: number,
  sources: ReturnType<typeof candidateSources>,
): { ref: string; x: number; z: number } {
  if (m.kind === 'player') return { ref: 'player', x: s.px, z: s.pz };
  let best: { ref: string; x: number; z: number } | null = null;
  let bestErr = Number.POSITIVE_INFINITY;
  for (const c of sources) {
    if (!c.kinds.includes(m.kind)) continue;
    const dx = -(c.x - s.px) * ppy;
    const dz = -(c.z - s.pz) * ppy;
    let err: number;
    if (m.kind === 'party-arrow') {
      const a = Math.atan2(dz, dx);
      err = Math.abs(a - m.angle);
    } else {
      err = Math.hypot(half + dx - m.mx, half + dz - m.my);
    }
    if (err < bestErr) {
      bestErr = err;
      best = { ref: c.ref, x: c.x, z: c.z };
    }
  }
  if (!best || bestErr > 1e-6) throw new Error(`no source for ${m.kind} at ${m.mx},${m.my}`);
  return best;
}

/** Minimap markers for each fixed snapshot at every zoom level and both marker profiles. */
function minimapMarkers(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const snap of fixedSnapshots()) {
    const sources = candidateSources(snap);
    for (const zoom of MINIMAP_ZOOM_LEVELS) {
      for (const profile of ['standard', 'compact'] as const) {
        const ppy = MINIMAP_BASE_SCALE * zoom;
        const model = createMinimapMarkers().build(worldFor(snap), MINIMAP_CANVAS, ppy, profile);
        const markers = model.markers
          .filter((m) => EXPORTED_KINDS.has(m.kind))
          .map((m) => {
            const src = refFor(m, snap, MINIMAP_CANVAS / 2, ppy, sources);
            return {
              kind: m.kind,
              ref: src.ref,
              wx: src.x,
              wz: src.z,
              mx: r3(m.mx),
              my: r3(m.my),
            };
          });
        cases.push({
          in: {
            snapshot: snap.name,
            px: snap.px,
            pz: snap.pz,
            zoom,
            profile,
            canvas: MINIMAP_CANVAS,
            pxPerYard: ppy,
          },
          out: { zoneId: model.zoneId, markers },
        });
      }
    }
  }
  return {
    suite: 'map_minimap_markers',
    source: 'src/ui/minimap_markers.ts createMinimapMarkers',
    note:
      'fixed snapshots (scripts/unreal/map_export.ts fixedSnapshots); mx,my rounded to 0.001 px; ' +
      'party-arrow is rim-clamped (wx,wz is the member); acceptance is 0.5 yd per marker',
    cases,
  };
}

/** The party member a zone-map party marker draws (exact re-projection through the region). */
function partyMemberAt(
  s: Snapshot,
  region: { minX: number; maxX: number; minZ: number; maxZ: number },
  mx: number,
  my: number,
): SnapParty {
  const spanX = region.maxX - region.minX;
  const spanZ = region.maxZ - region.minZ;
  for (const m of s.party) {
    const ex = ((region.maxX - m.x) / spanX) * ZONE_MAP_CANVAS;
    const ey = ((region.maxZ - m.z) / spanZ) * ZONE_MAP_CANVAS;
    if (Math.hypot(ex - mx, ey - my) < 1e-6) return m;
  }
  throw new Error(`no party member at ${mx},${my}`);
}

/** Zone map frame: view region and the player and party projection per zone, zoom and pan. */
function zoneMapFrame(): ParitySuite {
  const cases: ParityCase[] = [];
  const props = getActiveWorldContent().props;
  for (const snap of fixedSnapshots()) {
    const world = worldFor(snap);
    const zone = ZONES.find(
      (z) =>
        snap.pz >= z.zMin &&
        snap.pz < z.zMax &&
        (z.xMin === undefined || snap.px >= z.xMin) &&
        (z.xMax === undefined || snap.px < z.xMax),
    );
    if (!zone) continue;
    for (const zoom of [1, 2, 4]) {
      for (const center of [null, { x: snap.px + 40, z: snap.pz - 25 }]) {
        const model = buildOverworldMapModel({
          world,
          props,
          zone,
          zoom,
          center,
          canvasSize: ZONE_MAP_CANVAS,
          decorations: [],
        });
        cases.push({
          in: {
            snapshot: snap.name,
            zone: zone.id,
            px: snap.px,
            pz: snap.pz,
            zoom,
            panned: center !== null,
            cx: center?.x ?? 0,
            cz: center?.z ?? 0,
            canvas: ZONE_MAP_CANVAS,
          },
          out: {
            region: model.region,
            player: model.player ? { mx: r3(model.player.mx), my: r3(model.player.my) } : null,
            party: model.party.map((m) => {
              const src = partyMemberAt(snap, model.region, m.mx, m.my);
              return { pid: src.pid, wx: src.x, wz: src.z, mx: r3(m.mx), my: r3(m.my) };
            }),
          },
        });
      }
    }
  }
  return {
    suite: 'map_zone_frame',
    source: 'src/ui/map_window_view.ts buildOverworldMapModel (region, player, party)',
    note: 'the zoom window clamps inside the zone square; party order follows partyInfo.members',
    cases,
  };
}

export const MAP_PARITY_SUITES: Record<string, () => ParitySuite> = {
  map_minimap_markers: minimapMarkers,
  map_zone_frame: zoneMapFrame,
};

export function buildMapSuite(name: string): ParitySuite {
  const f = MAP_PARITY_SUITES[name];
  if (!f) throw new Error(`unknown map suite ${name}`);
  return f();
}
