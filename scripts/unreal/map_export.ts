// W6 (map and minimap) exports for the native Unreal client, in the W0 parity exporter's file
// shape (scripts/unreal/parity_export.ts). Two kinds of output:
//   - parity suites (scripts/unreal/protocol/parity/<suite>.json): the authoritative TS minimap
//     core (src/ui/minimap_markers.ts createMinimapMarkers), zone-map frame
//     (src/ui/map_window_view.ts buildOverworldMapModel) and continent overview
//     (src/ui/continent_map_view.ts buildContinentMapModel) run over FIXED snapshots; every
//     emitted marker carries the world point it marks, so the Unreal tests
//     `Wyndlewood.Map.Parity.*` re-project the same snapshot and must land within 0.5 yd;
//   - the map content (scripts/unreal/protocol/map/map_content.json): zone rects, POIs, level
//     bands and the EA flag, gather nodes, crafting stations, farm patches, town project sites,
//     quest givers, quest objective areas, navigation landmarks, civic services, the world
//     bounds and the minimap constants the client's map views read.
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_map_export.test.ts`, then
// copy into the Unreal worktree (Data/Parity/, Data/Map/).

import { buildCivicServicePlacements } from '../../src/sim/civic_service_placements';
import { FARM_PATCHES } from '../../src/sim/content/farm_patches';
import { LOW_REACHES_ZONES } from '../../src/sim/content/frontier/low_reaches';
import { SOUTHERN_REACHES_ZONES } from '../../src/sim/content/frontier/southern_reaches';
import { WEST_MARCH_ZONES } from '../../src/sim/content/frontier/west_march';
import { TOWN_PROJECTS } from '../../src/sim/content/town_projects';
import {
  GATHER_NODES,
  getActiveWorldContent,
  QUESTS,
  STATIONS,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  ZONES,
} from '../../src/sim/data';
import { questGiverNpcMarkers, questObjectiveAreas } from '../../src/sim/quest_targets';
import { isProfessionQuest } from '../../src/sim/quests/ambient_quest_marker';
import type { QuestProgress } from '../../src/sim/types';
import { questObjectiveRequired } from '../../src/sim/types';
import { buildContinentMapModel, CONTINENT_FALLBACK_ASPECT } from '../../src/ui/continent_map_view';
import { MAP_MARKER_SIZES } from '../../src/ui/map_marker_icon_art';
import { STABLE_MAP_NAVIGATION_LANDMARKS } from '../../src/ui/map_navigation_landmarks_core';
import {
  buildOverworldMapModel,
  MAP_LANDMARK_MAX_NUDGE_YD,
  MAP_LANDMARK_PLACEMENT_BY_PROFILE,
} from '../../src/ui/map_window_view';
import {
  createMinimapMarkers,
  FARM_PATCH_MARKER_SIZE,
  FARM_PATCH_MARKER_SIZE_COMPACT,
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
/** The zone map's label and party gate (map_window_view.ts LABEL_SPAN). */
const LABEL_SPAN = 900;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The frontier expansion is outside Early Access (ea-plan.md EA definition). */
const FRONTIER_ZONE_IDS = new Set(
  [...SOUTHERN_REACHES_ZONES, ...LOW_REACHES_ZONES, ...WEST_MARCH_ZONES].map((z) => z.id),
);

function freshProgress(questId: string): QuestProgress {
  const quest = QUESTS[questId];
  return {
    questId,
    counts: quest ? quest.objectives.map(() => 0) : [],
    state: 'active',
  } as QuestProgress;
}

/** Every objective area of every quest, from its fresh (nothing done) progress. */
function questObjectiveRows() {
  const rows: {
    questId: string;
    objectiveIndex: number;
    required: number;
    x: number;
    z: number;
    radius: number;
  }[] = [];
  for (const questId of Object.keys(QUESTS).sort()) {
    const quest = QUESTS[questId];
    const progress = freshProgress(questId);
    for (const area of questObjectiveAreas(new Map([[questId, progress]]))) {
      for (const ref of area.objectives) {
        rows.push({
          questId,
          objectiveIndex: ref.objectiveIndex,
          required: questObjectiveRequired(quest, progress, ref.objectiveIndex),
          x: area.center.x,
          z: area.center.z,
          radius: area.radius,
        });
      }
    }
  }
  return rows;
}

function civicServices() {
  const world = getActiveWorldContent();
  return buildCivicServicePlacements(
    world.services?.mailboxes ?? [],
    world.services?.noticeboards ?? [],
  );
}

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
    levelMin: z.levelRange[0],
    levelMax: z.levelRange[1],
    ea: !FRONTIER_ZONE_IDS.has(z.id),
    pois: ((z as { pois?: { x: number; z: number; hideOnMap?: boolean }[] }).pois ?? []).map(
      (p, i) => ({ index: i, x: p.x, z: p.z, hidden: p.hideOnMap === true }),
    ),
  }));
  const npcs = getActiveWorldContent().npcs;
  return {
    minimap: {
      canvas: MINIMAP_CANVAS,
      baseScale: MINIMAP_BASE_SCALE,
      clipInset: MINIMAP_CLIP_INSET,
      zoomLevels: [...MINIMAP_ZOOM_LEVELS],
      markerSizes: Object.fromEntries(
        Object.entries(MAP_MARKER_SIZES).filter(([k]) => k.startsWith('minimap')),
      ),
      farmPatchSize: FARM_PATCH_MARKER_SIZE,
      farmPatchSizeCompact: FARM_PATCH_MARKER_SIZE_COMPACT,
    },
    zoneMap: {
      labelSpan: LABEL_SPAN,
      markerViewMargin: 24,
      landmarkMaxNudgeYd: MAP_LANDMARK_MAX_NUDGE_YD,
      landmarkSeparation: MAP_LANDMARK_PLACEMENT_BY_PROFILE.standard.separation,
      landmarkEdgeInset: MAP_LANDMARK_PLACEMENT_BY_PROFILE.standard.edgeInset,
      landmarkSeparationCompact: MAP_LANDMARK_PLACEMENT_BY_PROFILE.compact.separation,
      landmarkEdgeInsetCompact: MAP_LANDMARK_PLACEMENT_BY_PROFILE.compact.edgeInset,
    },
    world: {
      minX: WORLD_MIN_X,
      maxX: WORLD_MAX_X,
      minZ: WORLD_MIN_Z,
      maxZ: WORLD_MAX_Z,
      continentAspect: CONTINENT_FALLBACK_ASPECT,
    },
    zones,
    gatherNodes: GATHER_NODES.map((n) => ({
      id: n.id,
      type: n.type,
      tier: n.tier,
      zoneId: n.zoneId,
      x: n.pos.x,
      z: n.pos.z,
    })),
    stations: STATIONS.map((s) => ({
      id: s.id,
      type: s.type,
      zoneId: s.zoneId,
      x: s.pos.x,
      z: s.pos.z,
    })),
    farmPatches: FARM_PATCHES.map((p) => ({ id: p.id, zoneId: p.zoneId, x: p.x, z: p.z })),
    townProjects: TOWN_PROJECTS.map((t) => ({
      id: t.id,
      zoneId: t.zoneId,
      x: t.site.x,
      z: t.site.z,
    })),
    // Static quest givers (the zone map reads these, never live entities, so the online
    // interest radius never hides a far giver). The client folds each template's marker.
    questGivers: Object.values(npcs)
      .filter((n) => !(n.dynamic && !n.fixedPost) && n.questIds.length > 0)
      .map((n) => ({ id: n.id, x: n.pos.x, z: n.pos.z }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    questObjectives: questObjectiveRows(),
    navigation: STABLE_MAP_NAVIGATION_LANDMARKS.map((l) => ({
      id: l.id,
      kind: l.kind,
      zoneId: l.zoneId,
      x: l.x,
      z: l.z,
    })),
    services: civicServices().map((s) => ({ kind: s.kind, x: s.x, z: s.z })),
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
  /** A player entity this viewer has as an online friend or guildmate. */
  ally?: 'friend' | 'guild';
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
  /** The viewer's own body while a ghost (the corpse run target). */
  corpse: { x: number; z: number } | null;
  /** Active quests in acceptance order (the quest log). */
  quests: string[];
}

const GIVER = Object.values(QUESTS).find((q) => q.giverNpcId && !isProfessionQuest(q));

/** Up to two quests whose objective areas sit in the zone at (x, z). */
function questsNear(x: number, z: number): string[] {
  const zone = ZONES.find(
    (zn) =>
      z >= zn.zMin &&
      z < zn.zMax &&
      (zn.xMin === undefined || x >= zn.xMin) &&
      (zn.xMax === undefined || x < zn.xMax),
  );
  if (!zone) return [];
  const out: string[] = [];
  for (const questId of Object.keys(QUESTS).sort()) {
    if (GIVER && questId === GIVER.id) continue;
    const areas = questObjectiveAreas(new Map([[questId, freshProgress(questId)]]));
    const minX = zone.xMin ?? -180;
    const maxX = zone.xMax ?? 180;
    const inZone = (a: { center: { x: number; z: number } }) =>
      a.center.z >= zone.zMin &&
      a.center.z < zone.zMax &&
      a.center.x >= minX &&
      a.center.x < maxX &&
      Math.hypot(a.center.x - x, a.center.z - z) < 120;
    if (areas.some(inZone)) out.push(questId);
    if (out.length === 2) break;
  }
  return out;
}

function snapshotAround(
  name: string,
  cx: number,
  cz: number,
  corpse: { x: number; z: number } | null,
): Snapshot {
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
      { id: 8, kind: 'player', x: cx - 7, z: cz - 5, ally: 'friend' },
      { id: 9, kind: 'player', x: cx + 11, z: cz + 13, ally: 'guild' },
      { id: 10, kind: 'player', x: cx + 3, z: cz + 3 },
    ],
    party: [
      { pid: 1, cls: 'warrior', dead: 0, x: cx, z: cz },
      { pid: 20, cls: 'mage', dead: 0, x: cx + 5, z: cz - 8 },
      { pid: 21, cls: 'priest', dead: 1, x: cx + 30, z: cz + 140 },
      { pid: 22, cls: 'rogue', dead: 0, x: cx - 260, z: cz - 90 },
    ],
    corpse,
    quests: questsNear(cx, cz),
  };
}

function fixedSnapshots(): Snapshot[] {
  const out: Snapshot[] = [];
  const project = TOWN_PROJECTS[0];
  if (project) {
    out.push(snapshotAround('town_project', project.site.x + 3, project.site.z - 2, null));
  }
  const station = STATIONS[0];
  if (station) {
    const cx = station.pos.x - 6;
    const cz = station.pos.z + 4;
    out.push(snapshotAround('station', cx, cz, { x: cx - 12, z: cz + 6 }));
  }
  const node = GATHER_NODES[0];
  if (node) {
    const cx = node.pos.x + 8;
    const cz = node.pos.z + 5;
    out.push(snapshotAround('gather_node', cx, cz, { x: cx + 300, z: cz + 50 }));
  }
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
    dead: s.corpse !== null,
    ghost: s.corpse !== null,
    corpsePos: s.corpse ? { x: s.corpse.x, y: 0, z: s.corpse.z } : null,
    questIds: [],
    templateId: '',
  };
  const entities = new Map<number, unknown>([[1, player]]);
  for (const e of s.entities) entities.set(e.id, ent(e));
  const friends = s.entities
    .filter((e) => e.ally === 'friend')
    .map((e) => ({ id: 100 + e.id, name: `E${e.id}`, online: true }));
  const guildMembers = s.entities
    .filter((e) => e.ally === 'guild')
    .map((e) => ({ id: 100 + e.id, name: `E${e.id}`, online: true }));
  const questLog = new Map(s.quests.map((q) => [q, freshProgress(q)]));
  return {
    player,
    entities,
    playerId: 1,
    partyInfo: {
      leader: 1,
      raid: false,
      members: s.party.map((m) => ({ ...m, name: `P${m.pid}` })),
    },
    socialInfo: {
      friends,
      blocks: [],
      guild: { id: 1, name: 'G', rank: 'member', members: guildMembers },
    },
    delveRun: null,
    riftFloor: null,
    hillInfo: null,
    bgInfo: null,
    cfg: { seed: 42, playerClass: 'warrior' },
    stationPlacements: STATIONS,
    farmPatches: FARM_PATCHES,
    civicServicePlacements: civicServices(),
    questState: (q: string) =>
      GIVER && q === GIVER.id ? 'available' : questLog.has(q) ? 'active' : 'unavailable',
    inventory: [],
    gatherToolSlots: [],
    gatheringProficiency: {},
    nodeHarvestableByMe: () => true,
    raidLockouts: () => [],
    worldBossActive: () => false,
    ferryView: () => null,
    worldQuestCycle: { questIds: [], cycleId: 0 },
    worldQuestReplacements: {},
    worldQuestLog: new Map(),
    questsDone: new Set<string>(),
    questLog,
    craftingIdentity: { version: 1, synced: false, cadenceBlockedQuests: [] },
  } as unknown as IWorld;
}

type Source = { ref: string; kinds: string[]; x: number; z: number };

/** World point each candidate source sits at, keyed `<family>:<id>`. */
function candidateSources(s: Snapshot): Source[] {
  const out: Source[] = [];
  for (const e of s.entities) {
    out.push({
      ref: `entity:${e.id}`,
      kinds: ['npc', 'mob', 'object-loot', 'ally'],
      x: e.x,
      z: e.z,
    });
  }
  for (const n of GATHER_NODES) {
    out.push({ ref: `node:${n.id}`, kinds: ['gather-node'], x: n.pos.x, z: n.pos.z });
  }
  for (const st of STATIONS) {
    out.push({ ref: `station:${st.id}`, kinds: ['station'], x: st.pos.x, z: st.pos.z });
  }
  for (const f of FARM_PATCHES) {
    out.push({ ref: `farm:${f.id}`, kinds: ['farm-patch'], x: f.x, z: f.z });
  }
  for (const t of TOWN_PROJECTS) {
    out.push({ ref: `project:${t.id}`, kinds: ['town-project'], x: t.site.x, z: t.site.z });
  }
  for (const m of s.party) {
    out.push({ ref: `party:${m.pid}`, kinds: ['party-disc', 'party-arrow'], x: m.x, z: m.z });
  }
  if (s.corpse) out.push({ ref: 'corpse', kinds: ['corpse'], x: s.corpse.x, z: s.corpse.z });
  return out;
}

const EXPORTED_KINDS = new Set([
  'npc',
  'mob',
  'object-loot',
  'ally',
  'corpse',
  'gather-node',
  'station',
  'farm-patch',
  'town-project',
  'party-disc',
  'party-arrow',
  'player',
]);

/** Match a marker to its source: exact re-projection, or the bearing for rim-clamped kinds. */
function refFor(
  m: MinimapMarker,
  s: Snapshot,
  half: number,
  ppy: number,
  sources: Source[],
): { ref: string; x: number; z: number } {
  if (m.kind === 'player') return { ref: 'player', x: s.px, z: s.pz };
  let best: { ref: string; x: number; z: number } | null = null;
  let bestErr = Number.POSITIVE_INFINITY;
  for (const c of sources) {
    if (!c.kinds.includes(m.kind)) continue;
    const dx = -(c.x - s.px) * ppy;
    const dz = -(c.z - s.pz) * ppy;
    const exact = Math.hypot(half + dx - m.mx, half + dz - m.my);
    const bearing = Math.abs(Math.atan2(dz, dx) - Math.atan2(m.my - half, m.mx - half));
    const err = m.kind === 'party-arrow' || m.kind === 'corpse' ? Math.min(exact, bearing) : exact;
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
              ...(m.kind === 'ally' ? { ally: m.ally } : {}),
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
          out: {
            zoneId: model.zoneId,
            entities: snap.entities,
            party: snap.party,
            corpse: snap.corpse,
            markers,
          },
        });
      }
    }
  }
  return {
    suite: 'map_minimap_markers',
    source: 'src/ui/minimap_markers.ts createMinimapMarkers',
    note:
      'fixed snapshots (scripts/unreal/map_export.ts fixedSnapshots); mx,my rounded to 0.001 px; ' +
      'party-arrow and an off-map corpse are rim-clamped (wx,wz is the source); acceptance is ' +
      '0.5 yd per marker',
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

const pt = (m: { mx: number; my: number }) => ({ mx: r3(m.mx), my: r3(m.my) });

/** Zone map frame per zone, zoom and pan: region, player, party, quest givers, quest areas and
 *  the de-overlapped landmark layer (navigation, services, stations, farm patches). */
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
    // The quest-giver marker kinds the client's Progression fold supplies at runtime.
    const givers = questGiverNpcMarkers(
      (q) => world.questState(q),
      world.questsDone,
      undefined,
    ).map((g) => ({ x: g.pos.x, z: g.pos.z, kind: g.kind }));
    for (const zoom of [1, 2, 4]) {
      for (const center of [null, { x: snap.px + 40, z: snap.pz - 25 }]) {
        for (const ping of [null, { x: snap.px - 20, z: snap.pz + 15 }]) {
          if (ping && (zoom !== 2 || center)) continue;
          const model = buildOverworldMapModel({
            world,
            props,
            zone,
            zoom,
            center,
            canvasSize: ZONE_MAP_CANVAS,
            decorations: [],
            ping,
          });
          const spanX = model.region.maxX - model.region.minX;
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
              pinged: ping !== null,
              pingX: ping?.x ?? 0,
              pingZ: ping?.z ?? 0,
              quests: snap.quests.join(','),
              canvas: ZONE_MAP_CANVAS,
            },
            out: {
              region: model.region,
              labels: spanX < LABEL_SPAN,
              player: model.player ? pt(model.player) : null,
              ping: model.ping ? pt(model.ping) : null,
              party: model.party.map((m) => {
                const src = partyMemberAt(snap, model.region, m.mx, m.my);
                return { pid: src.pid, wx: src.x, wz: src.z, ...pt(m) };
              }),
              givers,
              npcs: model.npcs.map((n) => ({ kind: n.kind, ...pt(n) })),
              questAreas: model.questAreas.map((a) => ({
                ...pt(a),
                radius: r3(a.radius),
                numbers: a.numbers,
              })),
              navigation: model.navigation.map((n) => ({ kind: n.kind, ...pt(n) })),
              services: model.services.map((s) => ({ kind: s.kind, ...pt(s) })),
              stations: model.stations.map((s) => ({ id: s.stationId, ...pt(s) })),
              farmPatches: model.farmPatches.map((f) => ({ id: f.patchId, ...pt(f) })),
            },
          });
        }
      }
    }
  }
  return {
    suite: 'map_zone_frame',
    source:
      'src/ui/map_window_view.ts buildOverworldMapModel (region, player, ping, party, quest ' +
      'givers, quest areas, landmark de-overlap)',
    note:
      'the zoom window clamps inside the zone square; landmarks are placed in the order ' +
      'navigation, services, stations, farm patches, each clearing the quest givers and every ' +
      'earlier landmark',
    cases,
  };
}

/** Continent overview per snapshot and plate aspect: art rect, zone rects, player and party. */
function continentFrame(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const snap of fixedSnapshots()) {
    const world = worldFor(snap);
    for (const aspect of [CONTINENT_FALLBACK_ASPECT, 1, 1.5]) {
      const model = buildContinentMapModel({
        world,
        canvasSize: ZONE_MAP_CANVAS,
        contentAspect: aspect,
        hoveredZoneId: null,
      });
      cases.push({
        in: {
          snapshot: snap.name,
          px: snap.px,
          pz: snap.pz,
          aspect,
          canvas: ZONE_MAP_CANVAS,
        },
        out: {
          image: model.image,
          currentZoneId: model.currentZoneId,
          regions: model.regions.map((r) => ({
            zoneId: r.zoneId,
            mx: r3(r.rect.mx),
            my: r3(r.rect.my),
            w: r3(r.rect.w),
            h: r3(r.rect.h),
          })),
          player: model.player ? pt(model.player) : null,
          party: model.party.map(pt),
          partyIn: snap.party,
        },
      });
    }
  }
  return {
    suite: 'map_continent',
    source: 'src/ui/continent_map_view.ts buildContinentMapModel',
    note: 'world bounds fill the contain-fit art rect (independent X and Z scale)',
    cases,
  };
}

export const MAP_PARITY_SUITES: Record<string, () => ParitySuite> = {
  map_minimap_markers: minimapMarkers,
  map_zone_frame: zoneMapFrame,
  map_continent: continentFrame,
};

export function buildMapSuite(name: string): ParitySuite {
  const f = MAP_PARITY_SUITES[name];
  if (!f) throw new Error(`unknown map suite ${name}`);
  return f();
}
