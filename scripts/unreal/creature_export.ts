// The W14 export for the native (Unreal) client: what the web renderer draws for every
// mob template, mount and ferry, which VFX entry every ability resolves to, and every
// floor telegraph's size. Read straight from the renderer's own tables (VISUALS and
// visualKeyFor in src/render/characters/manifest.ts, MOUNT_VISUAL_SPECS,
// abilityVfxFullSpec, the per-dungeon telegraph cores), so the Unreal client draws the
// same creature, plays the same clip names and lays the same telegraph footprint.
// tests/unreal_creature_export.test.ts fails when the committed copies are stale;
// UNREAL_CREATURES_UPDATE=1 rewrites them.

import { abilityVfxFullSpec } from '../../src/render/ability_vfx_registry';
import { VISUALS, visualKeyFor } from '../../src/render/characters/manifest';
import { templeTelegraphSpecs } from '../../src/render/drowned_temple/temple_fx_core';
import { sanctumTelegraphSpecs } from '../../src/render/gravewyrm_sanctum_fx/sanctum_fx_core';
import {
  coneFan,
  cryptObjectTelegraphs,
  cryptTelegraphSpecs,
} from '../../src/render/hollow_crypt/crypt_trash_fx_core';
import { MOUNT_VISUAL_SPECS } from '../../src/render/mount_visuals';
import { bastionTelegraphSpecs } from '../../src/render/sunken_bastion/bastion_fx_core';
import { basinTelegraphSpecs } from '../../src/render/wildheart_basin/basin_fx_core';
import { MOUNTS } from '../../src/sim/content/mounts';
import { TRANSPORT_ROUTES } from '../../src/sim/content/transport_ships';
import { ABILITIES, DUNGEONS, MOBS } from '../../src/sim/data';
import {
  newTransportPhaseState,
  type TransportRouteDef,
  transportCycleSeconds,
  transportShipPoseAt,
  transportShipSpeedAt,
} from '../../src/sim/transport_schedule';
import { WATER_LEVEL } from '../../src/sim/world';

/** The EA Must dungeons (ea-plan.md section 2.2). */
export const EA_DUNGEONS = [
  'hollow_crypt',
  'sunken_bastion',
  'drowned_temple',
  'gravewyrm_sanctum',
  'wildheart_basin',
] as const;

/** EA is levels 1 to 20 (ea-plan.md section 0). */
export const EA_MAX_LEVEL = 20;

/** The ClipMap fields a creature body plays (single clip or list). */
const SINGLE_CLIPS = [
  'idle',
  'combatIdle',
  'walk',
  'run',
  'walkBack',
  'jump',
  'fall',
  'land',
  'death',
  'cast',
  'sitIdle',
  'swim',
  'sleep',
] as const;
const LIST_CLIPS = ['attack', 'hit'] as const;

export interface CreatureClips {
  [field: string]: string | string[];
}

export interface CreatureVisual {
  key: string;
  /** Registry key: the model path without models/ and .glb, or null. */
  model: string | null;
  /** The extra clip files the web loads beside the model (registry keys). */
  animModels: string[];
  height: number | null;
  tint: number | null;
  tintStrength: number | null;
  walkRef: number | null;
  runRef: number | null;
  attackTimeScale: number | null;
  deathTimeScale: number | null;
  clips: CreatureClips;
  /** A humanoid body the character export already draws (WOC/modular/player rig). */
  humanoid: boolean;
}

export interface CreatureMob extends CreatureVisual {
  name: string;
  family: string;
  minLevel: number;
  maxLevel: number;
  scale: number;
  color: number;
  boss: boolean;
  /** Spawned in an EA Must dungeon, or level range inside the EA band. */
  ea: boolean;
}

export interface CreatureMount extends CreatureVisual {
  mount: string;
  rigged: boolean;
  seat: number;
  seatFwd: number;
  groundLift: number;
  bobAmp: number;
  bobHz: number;
  bobIdle: boolean;
  bobShape: string;
  jumpTips: boolean;
  ride: Record<string, unknown> | null;
}

export interface CreatureFerry {
  route: string;
  ship: string;
  model: string;
  berths: { x: number; z: number; rot: number }[];
  /** The two sea lanes (A -> B, B -> A): waypoints, rot null where unauthored. */
  lanes: { x: number; z: number; rot: number | null }[][];
  timings: { docked: number; cruise: number; accel: number; turnRate: number };
  /** World Y of the waterline the hull floats on. */
  waterY: number;
  /** transportShipPoseAt / transportPhaseAt at sample clocks: the parity vectors. */
  cases: {
    clock: number;
    x: number;
    z: number;
    rot: number;
    phase: string;
    berth: number;
    remaining: number;
    speed: number;
  }[];
}

export interface CreatureExport {
  version: 1;
  eaDungeons: readonly string[];
  eaMaxLevel: number;
  mobs: Record<string, CreatureMob>;
  mounts: Record<string, CreatureMount>;
  ferries: CreatureFerry[];
}

function modelKey(url: string | undefined): string | null {
  if (!url) return null;
  const m = /(?:^|\/)models\/(.+)\.glb$/.exec(url);
  return m ? m[1] : null;
}

type AnyDef = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function clipsOf(def: AnyDef | undefined): CreatureClips {
  const out: CreatureClips = {};
  const c = (def?.clips ?? {}) as AnyDef;
  for (const f of SINGLE_CLIPS) {
    const v = c[f];
    if (typeof v === 'string' && v) out[f] = v;
  }
  for (const f of LIST_CLIPS) {
    const v = c[f];
    if (Array.isArray(v)) out[f] = v.filter((x): x is string => typeof x === 'string' && !!x);
    else if (typeof v === 'string' && v) out[f] = [v];
  }
  return out;
}

function visualOf(key: string): CreatureVisual {
  const def = VISUALS[key] as unknown as AnyDef | undefined;
  const model = modelKey(def?.url as string | undefined);
  const anim = Array.isArray(def?.animUrls) ? (def?.animUrls as string[]) : [];
  return {
    key,
    model,
    animModels: anim.map((u) => modelKey(u)).filter((x): x is string => !!x),
    height: num(def?.height),
    tint: num(def?.tint),
    tintStrength: num(def?.tintStrength),
    walkRef: num(def?.walkRef),
    runRef: num(def?.runRef),
    attackTimeScale: num(def?.attackTimeScale),
    deathTimeScale: num(def?.deathTimeScale),
    clips: clipsOf(def),
    humanoid: !!def?.wocCharacter || !!def?.modular || (model ?? '').startsWith('chars/players/'),
  };
}

function eaDungeonMobs(): Set<string> {
  const out = new Set<string>();
  for (const id of EA_DUNGEONS) {
    const d = (DUNGEONS as Record<string, { spawns?: { mobId?: string }[] }>)[id];
    for (const s of d?.spawns ?? []) if (s.mobId) out.add(s.mobId);
  }
  return out;
}

function sorted<T>(ids: string[], f: (id: string) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of [...ids].sort()) out[id] = f(id);
  return out;
}

/** Sample clocks over one and a half cycles (and a negative one): pose, phase, speed. */
function ferryCases(r: TransportRouteDef): CreatureFerry['cases'] {
  const cycle = transportCycleSeconds(r);
  const out: CreatureFerry['cases'] = [];
  const pose = { x: 0, z: 0, rot: 0 };
  const phase = newTransportPhaseState();
  for (let k = -2; k <= 60; k++) {
    const clock = (cycle * 1.5 * k) / 60 + 0.37;
    transportShipPoseAt(r, clock, pose, phase);
    out.push({
      clock,
      x: pose.x,
      z: pose.z,
      rot: pose.rot,
      phase: phase.phase,
      berth: phase.berth,
      remaining: phase.remaining,
      speed: transportShipSpeedAt(r, clock),
    });
  }
  return out;
}

export function buildCreatureExport(): CreatureExport {
  const inDungeon = eaDungeonMobs();
  const mobs = sorted(Object.keys(MOBS), (id) => {
    const t = MOBS[id];
    const key = visualKeyFor({ kind: 'mob', templateId: id, modularAppearance: null } as never);
    return {
      name: t.name,
      family: t.family,
      minLevel: t.minLevel,
      maxLevel: t.maxLevel,
      scale: t.scale,
      color: t.color,
      boss: !!t.boss,
      ea: inDungeon.has(id) || t.minLevel <= EA_MAX_LEVEL,
      ...visualOf(key),
    };
  });
  const mounts = sorted(Object.keys(MOUNTS), (id) => {
    const s = (MOUNT_VISUAL_SPECS as unknown as Record<string, AnyDef>)[id];
    return {
      mount: id,
      rigged: !!s?.rigged,
      seat: num(s?.seat) ?? 0,
      seatFwd: num(s?.seatFwd) ?? 0,
      groundLift: num(s?.groundLift) ?? 0,
      bobAmp: num(s?.bobAmp) ?? 0,
      bobHz: num(s?.bobHz) ?? 0,
      bobIdle: !!s?.bobIdle,
      bobShape: String(s?.bobShape ?? 'hover'),
      jumpTips: !!s?.jumpTips,
      // the straddle (characters/ride_pose.ts angles, radians); null keeps the plain seat
      ride: (s?.ride as Record<string, unknown> | null | undefined) ?? null,
      ...visualOf(String(s?.visualKey ?? '')),
    };
  });
  const ferries = TRANSPORT_ROUTES.map((r) => ({
    route: r.id,
    ship: r.ship,
    // transport_ship.ts TRANSPORT_SHIP_MODELS (module-private): every route sails the ferry.
    model: r.ship === 'eastbrookFerry' ? 'props/eastbrook_ferry' : r.ship,
    berths: r.berths.map((b) => ({ x: b.x, z: b.z, rot: b.rot })),
    lanes: r.lanes.map((l) => l.map((w) => ({ x: w.x, z: w.z, rot: w.rot ?? null }))),
    timings: { ...r.timings },
    waterY: WATER_LEVEL,
    cases: ferryCases(r),
  }));
  return {
    version: 1,
    eaDungeons: EA_DUNGEONS,
    eaMaxLevel: EA_MAX_LEVEL,
    mobs,
    mounts,
    ferries,
  };
}

// --- ability VFX ---------------------------------------------------------------------

export interface AbilityVfxEntry {
  /** 'spec': an authored gallery or bespoke spec; 'school': the renderer's generic
   *  school-coloured arm (handleSpellfx returning false). */
  source: 'spec' | 'school';
  school: string;
  castTime: number;
  archetype: string;
  palette: string;
  /** The full spec as authored (spec entries only). */
  spec: unknown;
}

export interface AbilityVfxExport {
  version: 1;
  abilities: Record<string, AbilityVfxEntry>;
}

export function buildAbilityVfxExport(): AbilityVfxExport {
  const abilities = sorted(Object.keys(ABILITIES), (id) => {
    const a = ABILITIES[id] as unknown as AnyDef;
    const school = String(a.school ?? 'physical');
    const spec = abilityVfxFullSpec(id) as AnyDef | undefined;
    if (spec) {
      return {
        source: 'spec' as const,
        school,
        castTime: num(a.castTime) ?? 0,
        archetype: String(spec.archetype),
        palette: String(spec.palette),
        spec,
      };
    }
    return {
      source: 'school' as const,
      school,
      castTime: num(a.castTime) ?? 0,
      archetype: `school_${school}`,
      palette: school,
      spec: null,
    };
  });
  return { version: 1, abilities };
}

// --- telegraphs ----------------------------------------------------------------------

export interface TelegraphEntry {
  dungeon: string;
  shape: string;
  range: number;
  arcDeg: number;
  halfWidth: number;
  ahead: number;
  color: number;
  accent: number | null;
}

export interface TelegraphExport {
  version: 1;
  casts: Record<string, TelegraphEntry>;
  /** Hollow Crypt floor objects: ring or cone, sized by the object's scale. */
  objects: Record<
    string,
    {
      shape: string;
      arcDeg: number;
      color: number;
      accent: number;
      drive: string;
      castId: string | null;
    }
  >;
  /** coneFan(range, arcDeg, 8) of every cone cast, the vertex ring the C++ port reproduces. */
  fans: Record<string, number[][]>;
  /** Casts whose source table gives no size (the web paints nothing for them either). */
  zeroSized: string[];
}

function telegraphRow(dungeon: string, s: AnyDef): TelegraphEntry {
  return {
    dungeon,
    shape: String(s.shape),
    range: num(s.range) ?? 0,
    arcDeg: num(s.arcDeg) ?? 0,
    halfWidth: num(s.halfWidth) ?? 0,
    ahead: num(s.ahead) ?? 0,
    color: num(s.color) ?? 0,
    accent: num(s.accent),
  };
}

export function buildTelegraphExport(): TelegraphExport {
  const tables: [string, Readonly<Record<string, unknown>>][] = [
    ['hollow_crypt', cryptTelegraphSpecs()],
    ['sunken_bastion', bastionTelegraphSpecs()],
    ['drowned_temple', templeTelegraphSpecs()],
    ['gravewyrm_sanctum', sanctumTelegraphSpecs()],
    ['wildheart_basin', basinTelegraphSpecs()],
  ];
  const all: Record<string, TelegraphEntry> = {};
  for (const [dungeon, t] of tables) {
    for (const [id, s] of Object.entries(t)) all[id] = telegraphRow(dungeon, s as AnyDef);
  }
  const casts = sorted(Object.keys(all), (id) => all[id]);
  const objRaw = cryptObjectTelegraphs() as unknown as Record<string, AnyDef>;
  const objects = sorted(Object.keys(objRaw), (id) => {
    const o = objRaw[id];
    return {
      shape: String(o.shape),
      arcDeg: num(o.arcDeg) ?? 360,
      color: num(o.color) ?? 0,
      accent: num(o.accent) ?? 0,
      drive: String(o.drive),
      castId: typeof o.castId === 'string' ? o.castId : null,
    };
  });
  const fans: Record<string, number[][]> = {};
  for (const id of Object.keys(casts)) {
    const c = casts[id];
    if (c.shape === 'cone' || c.shape === 'rearCone') {
      fans[id] = coneFan(c.range, c.arcDeg, 8).map(([x, z]) => [x, z]);
    }
  }
  const zeroSized = Object.keys(casts).filter((id) => casts[id].range <= 0);
  return { version: 1, casts, objects, fans, zeroSized };
}

export const CREATURE_EXPORT_FILE = 'creatures/creature_visuals.json';
export const ABILITY_VFX_EXPORT_FILE = 'creatures/ability_vfx.json';
export const TELEGRAPH_EXPORT_FILE = 'creatures/telegraphs.json';
