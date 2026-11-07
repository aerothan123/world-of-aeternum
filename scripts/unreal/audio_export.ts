// W15 (audio) exports for the native Unreal client, beside the W0 parity exporter
// (scripts/unreal/parity_export.ts) and in its file shape. Two kinds of output:
//   - the audio catalog (scripts/unreal/protocol/audio/audio_catalog.json): every SFX key of the
//     manifest (after the runtime pack, exactly as sfx.ts resolves it) with its files, loop,
//     category, mix bus, spatial flag, gain and rate; every NPC voice line; every score cue and
//     boss or Crucible production; the music selection tables; and the files the TS code names
//     that are not committed (the gap list);
//   - parity suites (scripts/unreal/protocol/parity/audio_*.json): the TS music selection rules
//     (zone, instance, combat, score slot, boss cue, night hysteresis) and the SFX bus split over
//     a fixed grid; the Unreal tests `Wyndlewood.Audio.Parity.*` replay them.
// Every file path is relative to public/ (the `?v=` cache hash dropped), and every entry carries
// the Unreal asset name the importer gives that file, so the two never disagree.
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_audio_export.test.ts`.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BOSS_TRACK_URLS, DEFAULT_BOSS_TRACK_URL } from '../../src/game/boss_music_loop';
import { CRUCIBLE_STREAM_URLS, crucibleFloorForDungeon } from '../../src/game/crucible_music';
import { dungeonMusicZoneForDungeon } from '../../src/game/dungeon_music_zones';
import { mountAudioKey } from '../../src/game/mount_audio_key';
import {
  advanceInterruptibleMountEngine,
  advanceMountEngine,
  type MountEngineEntry,
  mountEngineBendRate,
  mountEngineIdleAudible,
  mountEngineLoopActive,
} from '../../src/game/mount_engine_state';
import {
  combatFamilyFor,
  regionOfSlot,
  SCORE_BOSS_TEMPLATES,
  SCORE_DEFAULT_BOSS,
  SCORE_INSTANCE_DUNGEONS,
  SCORE_RAID_INSTANCES,
  SCORE_REGIONS,
  SCORE_STINGERS,
  SCORE_TOWNS,
  SCORE_VENUES,
  SCORE_ZONE_DUNGEONS,
  SCORE_ZONE_REGIONS,
  type ScoreContext,
  SILENCE_GAP_SECONDS,
  scoreBossUrl,
  scoreNight,
  scoreSlotFor,
  stingersFor,
} from '../../src/game/music_score';
import { SCORE_TRACK_FILES } from '../../src/game/music_score_tracks.generated';
import { COMBAT_STREAM_URLS, ZONE_STREAM_CUES, zoneStreamUrls } from '../../src/game/music_tracks';
import {
  ALL_MUSIC_ZONES,
  type MusicZone,
  musicZoneForLocation,
  riftMusicZoneForTheme,
} from '../../src/game/music_zones';
import { seasonalMusicZone } from '../../src/game/seasonal_music';
import {
  SFX_CATALOG_HASH,
  SFX_CLIPS,
  SFX_FIXED_CATALOG_KEYS,
  type SfxEntry,
} from '../../src/game/sfx_manifest.generated';
import { sfxMixBus } from '../../src/game/sfx_mix_bus';
import { parseRuntimeSfxPack } from '../../src/game/sfx_runtime_pack';
import { VOICE_LINES } from '../../src/game/voice_manifest.generated';
import { NEAR_WATER_MARGIN } from '../../src/render/ambience_state_core';
import { DAY_ONLY } from '../../src/render/day_night_core';
import {
  FOREST_CELL_YARDS,
  FOREST_REACH_YARDS,
  FOREST_TREES_CLOSED,
  FOREST_TREES_OPEN,
  ForestDensitySampler,
} from '../../src/render/forest_density_core';
import {
  createRegionAmbience,
  dayWeightForPhase,
  REGION_BED_GAINS,
  sampleRegionAmbienceInto,
} from '../../src/render/region_ambience_core';
import { DEBUFF_AURA_KINDS } from '../../src/sim/aura_classify';
import { GOURDLIGHT_EVE_ID } from '../../src/sim/content/gourdlight_eve';
import { MOUNTS } from '../../src/sim/content/mounts';
import {
  ABILITIES,
  ALL_RECIPES,
  ARENA_X_MAX,
  ARENA_X_MIN,
  DELVE_BAND_X_MIN,
  DUNGEON_OVERFLOW_INDEX,
  DUNGEON_OVERFLOW_X_BASE,
  DUNGEON_X_THRESHOLD,
  DUNGEONS,
  dungeonAt,
  INSTANCE_X_BASE,
  instanceOrigin,
  MOBS,
  RIFT_BAND_X_MIN,
  STRIP_MAX_X,
  STRIP_MIN_X,
  ZONES,
  zoneAt,
} from '../../src/sim/data';
import { DAY_NIGHT_CYCLE_MS, NOON_PHASE } from '../../src/sim/day_night';
import type { BiomeId, SimEvent } from '../../src/sim/types';
import {
  CORPSE_HARVEST_CAST_ID,
  CRAFT_CAST_ID,
  DISENCHANT_CAST_ID,
  ENCHANT_CAST_ID,
  FISHING_CAST_ID,
  GATHER_CAST_ID,
  SALVAGE_CAST_ID,
  SUNDER_CAST_ID,
  TOOL_RECHARGE_CAST_ID,
} from '../../src/sim/types';
import { generateDecorationsInBounds, groundHeight, waterLevelAt } from '../../src/sim/world';
import { WORLD_SEED } from '../../src/sim/world_seed';
import { castCueForAbility, mobVoiceFamily } from '../../src/ui/combat_sfx';
import { isTalentRowUnlockLevel } from '../../src/ui/row_unlock_toast';
import { type RefEntity, refRoute } from './audio_sfx_router_ref';
import type { ParityCase, ParitySuite } from './parity_export';

export const AUDIO_EXPORT_SUBDIR = 'audio';
export const AUDIO_CATALOG_FILE = 'audio_catalog.json';

const REPO = resolve(import.meta.dirname, '..', '..');
const PUBLIC = join(REPO, 'public');

const BIOMES: readonly BiomeId[] = [
  'vale',
  'marsh',
  'peaks',
  'beach',
  'desert',
  'volcano',
  'cave',
  'dusk',
  'ember',
  'frost',
  'amber',
  'fen',
  'night',
  'haunt',
  'jungle',
  'garden',
  'gale',
];

const RIFT_THEME_NAMES: readonly string[] = [
  'Frostbound',
  'Emberforge',
  'Venomweald',
  'Boneyard',
  'Warcamp',
  'Voidscar',
  'Stormspire',
  'Sunken',
  'Infernal Citadel',
  'Spore Hollow',
  'Deep Burrow',
  'Bat Roost',
  'False Vault',
  'Unknown Theme',
];

/** "/audio/sfx/x.mp3?v=abc" to "audio/sfx/x.mp3". */
export function publicPath(url: string): string {
  return url
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/\?.*$/, '')
    .replace(/^\//, '');
}

/** The Unreal asset (package path) the importer writes for a public audio file. */
export function assetFor(path: string): string {
  const parts = path.split('/');
  const file = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, '');
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');
  if (path.startsWith('audio/sfx/blobs/'))
    return `/Game/Wyndlewood/Audio/SFX/Blobs/B_${file.slice(0, 16)}`;
  if (path.startsWith('audio/sfx/')) return `/Game/Wyndlewood/Audio/SFX/${safe(file)}`;
  if (path.startsWith('audio/voice/')) {
    // greeting__npc_id and quest__<id>__offer keep their key; very long yell keys are cut
    // to stay inside the engine's path limit, with a hash of the full name kept unique.
    const dir = safe(parts[2] ?? 'misc');
    let name = safe(file);
    if (name.length > 60) name = `${name.slice(0, 48)}_${shortHash(name)}`;
    return `/Game/Wyndlewood/Audio/Voice/${dir}/${name}`;
  }
  if (path.startsWith('audio/music/wyn/')) return `/Game/Wyndlewood/Audio/Music/${safe(file)}`;
  if (path.startsWith('audio/music/')) return `/Game/Wyndlewood/Audio/Music/Prod/${safe(file)}`;
  return `/Game/Wyndlewood/Audio/Misc/${safe(file)}`;
}

function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function fileRef(url: string) {
  const path = publicPath(url);
  return { path, asset: assetFor(path), present: existsSync(join(PUBLIC, path)) };
}

/** The clips sfx.ts plays: the runtime pack when it validates against this catalog, else the
 *  compiled manifest (loadRuntimeSfxPack's own fallback rule). */
export async function resolvedSfxClips(): Promise<{
  clips: Record<string, SfxEntry>;
  runtimePackApplied: boolean;
}> {
  const packPath = join(PUBLIC, 'audio', 'sfx', 'runtime-pack.json');
  const fallback = SFX_CLIPS as unknown as Record<string, SfxEntry>;
  if (!existsSync(packPath)) return { clips: fallback, runtimePackApplied: false };
  const { readFileSync } = await import('node:fs');
  const raw = JSON.parse(readFileSync(packPath, 'utf8'));
  const parsed = await parseRuntimeSfxPack(raw, SFX_CATALOG_HASH, fallback);
  return parsed
    ? { clips: parsed, runtimePackApplied: true }
    : { clips: fallback, runtimePackApplied: false };
}

function zoneOf(m: MusicZone) {
  const urls = zoneStreamUrls(m);
  return {
    zone: m,
    streamCue: ZONE_STREAM_CUES[m],
    pool: urls.map((u) => cueOfUrl(u)),
    combatFamily: combatFamilyFor(m, false),
  };
}

const URL_TO_CUE = new Map(
  Object.entries(SCORE_TRACK_FILES).map(([k, f]) => [publicPath(f.url), k] as const),
);
function cueOfUrl(url: string): string {
  return URL_TO_CUE.get(publicPath(url)) ?? publicPath(url);
}

export async function buildAudioCatalog() {
  const { clips, runtimePackApplied } = await resolvedSfxClips();
  const sfx = Object.keys(clips)
    .sort()
    .map((key) => {
      const e = clips[key];
      return {
        key,
        fixed: (SFX_FIXED_CATALOG_KEYS as readonly string[]).includes(key),
        loop: e.loop,
        category: e.category,
        bus: sfxMixBus(key, e.category),
        spatial: e.spatial,
        preload: e.preload,
        gain: e.gain,
        rate: e.playbackRate,
        files: e.variants.map((v) => fileRef(v.url)),
      };
    });
  const voice = Object.keys(VOICE_LINES)
    .sort()
    .map((key) => ({ key, ...fileRef(VOICE_LINES[key]) }));
  const cues = Object.keys(SCORE_TRACK_FILES)
    .sort()
    .map((key) => ({
      key,
      seconds: SCORE_TRACK_FILES[key].seconds,
      ...fileRef(SCORE_TRACK_FILES[key].url),
    }));
  const bossTracks = Object.keys(BOSS_TRACK_URLS)
    .sort()
    .map((templateId) => ({ templateId, ...fileRef(BOSS_TRACK_URLS[templateId]) }));
  const crucible = Object.entries(CRUCIBLE_STREAM_URLS).map(([floor, url]) => ({
    floor: Number(floor),
    ...fileRef(url),
  }));
  const defaultBoss = fileRef(DEFAULT_BOSS_TRACK_URL);
  const missing = [
    ...sfx.flatMap((s) =>
      s.files.filter((f) => !f.present).map((f) => ({ kind: 'sfx', key: s.key, path: f.path })),
    ),
    ...voice.filter((v) => !v.present).map((v) => ({ kind: 'voice', key: v.key, path: v.path })),
    ...cues.filter((c) => !c.present).map((c) => ({ kind: 'cue', key: c.key, path: c.path })),
    ...bossTracks
      .filter((b) => !b.present)
      .map((b) => ({ kind: 'boss', key: b.templateId, path: b.path })),
    ...crucible
      .filter((c) => !c.present)
      .map((c) => ({ kind: 'crucible', key: String(c.floor), path: c.path })),
    ...(defaultBoss.present ? [] : [{ kind: 'boss', key: 'default', path: defaultBoss.path }]),
  ];
  // Every MusicZone the selection can name must resolve to a cue that exists.
  const unscored = ALL_MUSIC_ZONES.filter((z) => zoneStreamUrls(z).length === 0);
  return {
    format: 'wynd-audio-catalog',
    version: 1,
    sfxCatalogHash: SFX_CATALOG_HASH,
    runtimePackApplied,
    sfx,
    voice,
    cues,
    bossTracks,
    crucible,
    defaultBoss,
    tables: musicTables(),
    world: worldTables(),
    environment: environmentTables(),
    sfxRouter: sfxRouterTables(),
    gaps: { missing, unscoredZones: unscored },
  };
}

/** The selection tables the C++ port reads (the rules themselves are ported and pinned by
 *  the parity suites below). Private TS tables are recovered through their public functions. */
export function musicTables() {
  const biomeMusic = Object.fromEntries(
    BIOMES.map((b) => [b, musicZoneForLocation('__none__', b, false, false)]),
  );
  const zoneMusic: Record<string, string> = {};
  const townMusic: Record<string, string> = {};
  for (const z of ZONES) {
    const out = musicZoneForLocation(z.id, z.biome, false, false);
    if (out !== biomeMusic[z.biome]) zoneMusic[z.id] = out;
    const hub = musicZoneForLocation(z.id, z.biome, true, false);
    if (hub !== out) townMusic[z.id] = hub;
  }
  for (const id of ['farshore_isle', 'proving_shore']) {
    const out = musicZoneForLocation(id, 'vale', false, false);
    if (out !== biomeMusic.vale) zoneMusic[id] = out;
  }
  const dungeonIds = [...new Set([...Object.keys(DUNGEONS), ...EXTRA_INSTANCES])].sort();
  const dungeonMusic = Object.fromEntries(
    dungeonIds.map((d) => [d, dungeonMusicZoneForDungeon(d)]),
  );
  const riftMusic = Object.fromEntries(RIFT_THEME_NAMES.map((t) => [t, riftMusicZoneForTheme(t)]));
  const combatFamily = Object.fromEntries(
    ALL_MUSIC_ZONES.map((m) => [m, combatFamilyFor(m, false)]),
  );
  return {
    musicZones: ALL_MUSIC_ZONES.map(zoneOf),
    biomeMusic,
    zoneMusic,
    townMusic,
    dungeonMusic,
    dungeonFallback: dungeonMusicZoneForDungeon('__none__'),
    riftMusic,
    riftFallback: riftMusicZoneForTheme('__none__'),
    combatFamily,
    combatFallbackCues: COMBAT_STREAM_URLS.map(cueOfUrl),
    scoreRegions: SCORE_REGIONS,
    scoreZoneRegions: SCORE_ZONE_REGIONS,
    scoreTowns: SCORE_TOWNS,
    scoreInstanceDungeons: SCORE_INSTANCE_DUNGEONS,
    scoreZoneDungeons: SCORE_ZONE_DUNGEONS,
    scoreBossTemplates: SCORE_BOSS_TEMPLATES,
    scoreRaidInstances: [...SCORE_RAID_INSTANCES],
    scoreDefaultBoss: SCORE_DEFAULT_BOSS,
    scoreVenues: SCORE_VENUES,
    stingers: SCORE_STINGERS,
    silenceGapSeconds: SILENCE_GAP_SECONDS,
    seasonalTowns: {
      [GOURDLIGHT_EVE_ID]: {
        towns: ALL_MUSIC_ZONES.filter((m) => seasonalMusicZone(m, GOURDLIGHT_EVE_ID) !== m),
        theme: seasonalMusicZone('town_eastbrook', GOURDLIGHT_EVE_ID),
      },
    },
    crucibleFloors: Object.fromEntries(
      dungeonIds.map((d) => [d, crucibleFloorForDungeon(d)]).filter(([, f]) => f !== null),
    ),
  };
}

/** Instance ids the score names that are not DUNGEONS rows (delves, the raid room, lifts). */
const EXTRA_INSTANCES = [
  ...Object.keys(SCORE_INSTANCE_DUNGEONS),
  'nythraxis_boss_arena',
  'ignivar_forge_approach',
  'ignivar_raid_arena',
  'ignivar_molten_assembly',
  'ignivar_inner_crucible',
  'ignivar_forge_lift',
];

// ---- parity suites ----

function musicZoneSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  const instances = [
    '',
    ...Object.keys(DUNGEONS).sort(),
    'ignivar_raid_arena',
    'ignivar_inner_crucible',
    'nythraxis_boss_arena',
    'not_a_dungeon',
  ];
  const zones = [
    ...ZONES.map((z) => ({ id: z.id, biomes: [z.biome] })),
    { id: '__none__', biomes: BIOMES },
  ];
  for (const z of zones) {
    for (const biome of z.biomes) {
      for (const seasonal of ['', GOURDLIGHT_EVE_ID]) {
        for (const inHub of [false, true]) {
          cases.push({
            in: { zoneId: z.id, biome, inHub, inDungeon: false, dungeonId: '', seasonal },
            out: seasonalMusicZone(
              musicZoneForLocation(z.id, biome, inHub, false, null),
              seasonal || null,
            ),
          });
        }
      }
    }
  }
  for (const d of instances) {
    cases.push({
      in: {
        zoneId: 'eastbrook_vale',
        biome: 'vale',
        inHub: false,
        inDungeon: true,
        dungeonId: d,
        seasonal: '',
      },
      out: musicZoneForLocation('eastbrook_vale', 'vale', false, true, d || null),
    });
  }
  for (const t of RIFT_THEME_NAMES) {
    cases.push({
      in: {
        zoneId: '',
        biome: '',
        inHub: false,
        inDungeon: true,
        dungeonId: '',
        seasonal: '',
        riftTheme: t,
      },
      out: riftMusicZoneForTheme(t),
    });
  }
  return {
    suite: 'audio_music_zone',
    source:
      'src/game/music_zones.ts musicZoneForLocation, riftMusicZoneForTheme; seasonal_music.ts',
    note: 'riftTheme present: the rift rule alone; dungeonId "" means null',
    cases,
  };
}

function scoreSlotSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  const venue = SCORE_VENUES[0];
  const situations: Array<{
    name: string;
    home: boolean;
    venue: string;
    instanceId: string;
    zoneId: string;
  }> = [
    { name: 'open', home: false, venue: '', instanceId: '', zoneId: '' },
    { name: 'home', home: true, venue: '', instanceId: '', zoneId: '' },
    { name: 'venue', home: false, venue: venue.id, instanceId: '', zoneId: '' },
    { name: 'reaches', home: false, venue: '', instanceId: '', zoneId: 'southern_reaches' },
    ...[...Object.keys(SCORE_INSTANCE_DUNGEONS), 'nythraxis_boss_arena', 'not_a_dungeon'].map(
      (i) => ({
        name: 'instance',
        home: false,
        venue: '',
        instanceId: i,
        zoneId: '',
      }),
    ),
  ];
  for (const zone of ALL_MUSIC_ZONES) {
    for (const s of situations) {
      for (const combat of [false, true]) {
        for (const paleAccord of [false, true]) {
          for (const night of [false, true]) {
            const ctx: ScoreContext = {
              zone,
              zoneId: s.zoneId || null,
              combat,
              paleAccord,
              night,
              instanceId: s.instanceId || null,
              home: s.home,
              venue: s.venue ? venue : null,
            };
            const slot = scoreSlotFor(ctx);
            cases.push({
              in: {
                zone,
                zoneId: s.zoneId,
                combat,
                paleAccord,
                night,
                instanceId: s.instanceId,
                home: s.home,
                venue: s.venue,
              },
              out: slot
                ? { key: slot.key, cues: [...slot.cues], repeat: slot.repeat, group: slot.group }
                : null,
            });
          }
        }
      }
    }
  }
  return {
    suite: 'audio_score_slot',
    source: 'src/game/music_score.ts scoreSlotFor (over the committed SCORE_TRACK_FILES)',
    note: 'null out: the director keeps the zone stream (or the fallback battle pool in combat)',
    cases,
  };
}

const RECENT_COMBAT_MS = 5000;
const RECENT_BOSS_COMBAT_MS = 10000;

/** The combat arms of instance_music.ts instanceMusicDecision, recomputed from its inputs. */
function musicCombatSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const inCombatFlag of [false, true])
    for (const aggroed of [false, true])
      for (const msSinceCombat of [0, 4999, 5000, 60000])
        for (const msSinceBoss of [0, 9999, 10000])
          for (const bossAggro of [false, true])
            for (const inRaidArena of [false, true])
              for (const inBattleground of [false, true])
                for (const crucible of [false, true]) {
                  const inCombat = inCombatFlag || aggroed || msSinceCombat < RECENT_COMBAT_MS;
                  const boss = bossAggro || inRaidArena || msSinceBoss < RECENT_BOSS_COMBAT_MS;
                  cases.push({
                    in: {
                      inCombatFlag,
                      aggroed,
                      msSinceCombat,
                      msSinceBoss,
                      bossAggro,
                      inRaidArena,
                      inBattleground,
                      crucible,
                    },
                    out: {
                      inCombat,
                      musicCombat: !crucible && (inCombat || inRaidArena || inBattleground),
                      bossEngaged: !crucible && boss,
                    },
                  });
                }
  return {
    suite: 'audio_music_combat',
    source:
      'src/game/instance_music.ts instanceMusicDecision (RECENT_COMBAT_MS 5000, RECENT_BOSS_COMBAT_MS 10000)',
    note: 'pinned against the live function in tests/unreal_audio_export.test.ts',
    cases,
  };
}

function bossCueSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  const templates = [
    '',
    ...Object.keys(BOSS_TRACK_URLS),
    ...Object.keys(SCORE_BOSS_TEMPLATES),
    'some_boss',
    'pale_accord_warden',
  ];
  for (const templateId of [...new Set(templates)])
    for (const instanceId of ['', 'nythraxis_boss_arena', 'hollow_crypt'])
      for (const paleAccord of [false, true]) {
        const track =
          templateId && Object.hasOwn(BOSS_TRACK_URLS, templateId)
            ? BOSS_TRACK_URLS[templateId]
            : null;
        const url = scoreBossUrl(track, templateId || null, instanceId || null, paleAccord);
        cases.push({
          in: { templateId, instanceId, paleAccord },
          out: url ? publicPath(url) : null,
        });
      }
  return {
    suite: 'audio_boss_cue',
    source: 'src/game/music_score.ts scoreBossUrl over boss_music_loop.ts BOSS_TRACK_URLS',
    note: 'out is the public path of the chosen file (no cache hash)',
    cases,
  };
}

function scoreNightSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const wasNight of [false, true])
    for (let i = 0; i <= 20; i++) {
      const dayWeight = i / 20;
      cases.push({ in: { wasNight, dayWeight }, out: scoreNight(wasNight, dayWeight) });
    }
  return {
    suite: 'audio_score_night',
    source: 'src/game/music_score.ts scoreNight',
    note: '',
    cases,
  };
}

/** Where the listener is, as the audio reads it: zoneAt and dungeonAt over the shipped world. */
function locationSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const z of ZONES) {
    const x0 = z.xMin ?? STRIP_MIN_X;
    const x1 = z.xMax ?? STRIP_MAX_X;
    for (const fx of [0.02, 0.5, 0.98])
      for (const fz of [0.02, 0.5, 0.98]) {
        const x = Math.round((x0 + (x1 - x0) * fx) * 100) / 100;
        const zz = Math.round((z.zMin + (z.zMax - z.zMin) * fz) * 100) / 100;
        cases.push({
          in: { x, z: zz },
          out: { zoneId: zoneAt(x, zz).id, dungeonId: dungeonAt(x)?.id ?? null },
        });
      }
  }
  for (const d of Object.values(DUNGEONS)) {
    for (const dx of [-310, -250, 0, 250, 310]) {
      const o = instanceOrigin(d.index, 0);
      const x = o.x + dx;
      cases.push({
        in: { x, z: o.z },
        out: { zoneId: zoneAt(x, o.z).id, dungeonId: dungeonAt(x)?.id ?? null },
      });
    }
  }
  return { suite: 'audio_location', source: 'src/sim/data.ts zoneAt, dungeonAt', note: '', cases };
}

function regionAmbienceSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  const out = createRegionAmbience();
  const byId = (id: string) => ZONES.find((z) => z.id === id);
  const sample = (
    x: number,
    z: number,
    inDungeon: boolean,
    interior: string,
    day: number,
    forest: number,
  ) => {
    sampleRegionAmbienceInto(
      out,
      { x, z, inDungeon, dungeonInterior: interior || null, dayWeight: day, forestDensity: forest },
      zoneAt,
      byId,
    );
    const beds: Record<string, number> = {};
    out.keys.forEach((k, i) => {
      if (out.gains[i] > 0) beds[k] = out.gains[i];
    });
    cases.push({
      in: { x, z, inDungeon, interior, dayWeight: day, forest },
      out: { gains: beds, legacyScale: out.legacyScale, reverbForest: out.reverbEnv === 'forest' },
    });
  };
  for (const zn of ZONES) {
    const x0 = zn.xMin ?? STRIP_MIN_X;
    const x1 = zn.xMax ?? STRIP_MAX_X;
    const pts: Array<[number, number]> = [
      [(x0 + x1) / 2, (zn.zMin + zn.zMax) / 2],
      [(x0 + x1) / 2, zn.zMax - 5],
      [x0 + 10, zn.zMin + 10],
    ];
    if (zn.hub) pts.push([zn.hub.x, zn.hub.z], [zn.hub.x + zn.hub.radius + 20, zn.hub.z]);
    for (const [x, z] of pts)
      for (const day of [1, 0.4, 0])
        for (const forest of [0, 0.7])
          sample(Math.round(x * 100) / 100, Math.round(z * 100) / 100, false, '', day, forest);
  }
  const interiors = [
    ...new Set(Object.values(DUNGEONS).map((d) => (d as { interior?: string }).interior ?? '')),
  ];
  for (const i of [...interiors, 'house', 'unknown']) sample(0, 0, true, i, 1, 0);
  return {
    suite: 'audio_region_ambience',
    source: 'src/render/region_ambience_core.ts sampleRegionAmbienceInto over zoneAt',
    note: 'gains are Float32 in TS: compare within 1e-5; beds absent from out are silent',
    cases,
  };
}

function dayWeightSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let i = 0; i <= 48; i++)
    cases.push({ in: { phase: i / 48 }, out: dayWeightForPhase(i / 48) });
  return {
    suite: 'audio_day_weight',
    source: 'src/render/region_ambience_core.ts dayWeightForPhase',
    note: '',
    cases,
  };
}

/** The zone rectangles, hubs and instance bands the location port reads. */
export function worldTables() {
  return {
    stripMinX: STRIP_MIN_X,
    stripMaxX: STRIP_MAX_X,
    zones: ZONES.map((z) => ({
      id: z.id,
      biome: z.biome,
      xMin: z.xMin ?? null,
      xMax: z.xMax ?? null,
      zMin: z.zMin,
      zMax: z.zMax,
      hub: z.hub ? { x: z.hub.x, z: z.hub.z, radius: z.hub.radius } : null,
    })),
    dungeons: Object.values(DUNGEONS)
      .map((d) => ({
        id: d.id,
        index: d.index,
        interior: (d as { interior?: string }).interior ?? null,
      }))
      .sort((a, b) => a.index - b.index),
    instanceXBase: INSTANCE_X_BASE,
    dungeonXThreshold: DUNGEON_X_THRESHOLD,
    delveBandXMin: DELVE_BAND_X_MIN,
    riftBandXMin: RIFT_BAND_X_MIN,
    arenaXMin: ARENA_X_MIN,
    arenaXMax: ARENA_X_MAX,
    overflowIndex: DUNGEON_OVERFLOW_INDEX,
    overflowXBase: DUNGEON_OVERFLOW_X_BASE,
    regionBedGains: REGION_BED_GAINS,
  };
}

// ---- the SimEvent to SFX router, stingers and the environment inputs (W15 round 2) ----

const REF_PLAYER = 1;
const NYTHRAXIS_CALLS = [
  'impaled',
  'youAreImpaled',
  'spikeBroken',
  'dreadCurseSwap',
  'sigilAppears',
  'sigilBound',
  'sigilUnbound',
  'gravefireTarget',
  'kingsWrath',
  'boneStormBegins',
  'boneStormCharge',
  'boneStormEnds',
  'crownEndures60',
  'crownEndures30',
  'crownEndures10',
  'crownEndures',
];
const VARKHUL_CALLS = [
  'leftPillarCharging',
  'rightPillarCharging',
  'bothPillarsCharging',
  'leftPillar',
  'rightPillar',
  'bothPillars',
  'portalsOpening',
  'artificerApproaches',
  'heat75',
  'heat90',
  'addsDefeated',
  'worldfireBegins',
  'worldfireClosing',
  'worldfireConsumed',
];

/** One mob template per voice family, plus the special cases the cores name. */
function refMobTemplates(): string[] {
  const out = new Set<string>([
    'forest_wolf',
    'wild_boar',
    'water_elemental',
    'nythraxis_scourge_of_thornpeak',
    'nythraxis_skeleton_warrior',
    'ignivar_herald_of_the_last_flame',
  ]);
  const seen = new Set<string>();
  for (const [id, m] of Object.entries(MOBS)) {
    const fam = (m as { family?: string }).family ?? '';
    if (!seen.has(fam)) {
      seen.add(fam);
      out.add(id);
    }
    if ((m as { boss?: boolean }).boss && out.size < 40) out.add(id);
    if ((m as { dummy?: boolean }).dummy) out.add(id);
  }
  return [...out].filter((id) => Object.hasOwn(MOBS, id) || id === 'water_elemental');
}

function refEntities(): RefEntity[] {
  const ents: RefEntity[] = [
    {
      id: 1,
      kind: 'player',
      templateId: 'warrior',
      auras: [
        { id: 'ice_block', kind: 'buff_dr', name: 'Cold Coffin' },
        { id: 'corruption', kind: 'dot', name: 'Corruption' },
        { id: 'withering_wail', kind: 'buff_ap', name: 'Withering Wail', value: -20 },
        { id: 'divine_ascension', kind: 'buff_dr', name: 'Ascension' },
        { id: 'furious_mending', kind: 'buff_dr', name: 'Mending' },
        { id: 'battle_shout', kind: 'buff_ap', name: 'Battle Shout', value: 20 },
        { id: 'shaman_stormsurge_ready', kind: 'internal_cd', name: 'Stormsurge' },
        { id: 'polymorph', kind: 'polymorph', name: 'Polymorph' },
        { id: 'vanish', kind: 'stealth', name: 'Smokefade' },
      ],
    },
    { id: 2, kind: 'player', templateId: 'mage', female: true },
    { id: 3, kind: 'player', templateId: 'druid', form: 'form_bear' },
    { id: 4, kind: 'player', templateId: 'hunter' },
    { id: 5, kind: 'player', templateId: 'rogue', dead: true, hp: 0 },
  ];
  refMobTemplates().forEach((t, i) => {
    ents.push({ id: 100 + i, kind: 'mob', templateId: t });
  });
  ents.push({ id: 99, kind: 'mob', templateId: 'forest_wolf', dead: true, hp: 0 });
  return ents;
}

function sfxRouterSuite(): ParitySuite {
  const ents = refEntities();
  const cases: ParityCase[] = [];
  const add = (ev: Record<string, unknown>, engaged: number[] = []) => {
    const plays = refRoute(ev as unknown as SimEvent, ents, { playerId: REF_PLAYER, engaged });
    cases.push({ in: { event: JSON.stringify(ev), engaged: engaged.join(',') }, out: plays });
  };
  const mobIds = ents.filter((e) => e.kind === 'mob').map((e) => e.id);
  // The damage grid crosses every player with a spread of mobs (the voice families, the
  // muted Nythraxis pair, a boss, the dummy, a corpse); every mob still dies below.
  const gridMobs = [99, 100, 101, 102, 103, 104, 105, ...mobIds.filter((id) => id % 5 === 1)];
  const sources = [1, 2, 3, 4, ...gridMobs];
  const targets = [1, 2, 5, ...gridMobs];
  const kinds = [undefined, 'hit', 'miss', 'dodge', 'parry', 'block', 'resist', 'evade'];
  const schools = ['physical', 'fire', 'frost', 'holy', 'shadow', undefined];
  const abilityIds = [undefined, 'mortal_strike', 'scorch', 'rift_hazard_molten', 'backstab'];
  let n = 0;
  for (const s of sources)
    for (const t of targets) {
      if (s === t) continue;
      for (const kind of kinds)
        for (const crit of [false, true]) {
          n++;
          add(
            {
              type: 'damage',
              sourceId: s,
              targetId: t,
              amount: 10,
              kind,
              crit,
              school: schools[n % schools.length],
              abilityId: abilityIds[n % abilityIds.length],
              ability: n % 7 === 0 ? 'Auto Shot' : 'Strike',
              absorbed: n % 5 === 0 ? 4 : 0,
            },
            n % 2 === 0 ? gridMobs : [],
          );
        }
    }
  for (const ability of ['chain_heal', ...Object.keys(ABILITIES)])
    add({ type: 'castStart', entityId: 1, ability, time: 1 });
  add({ type: 'castStart', entityId: 4242, ability: 'fireball', time: 1 });
  for (const ability of [
    GATHER_CAST_ID,
    CORPSE_HARVEST_CAST_ID,
    FISHING_CAST_ID,
    CRAFT_CAST_ID,
    SUNDER_CAST_ID,
  ])
    for (const entityId of [1, 2])
      for (const gatherNodeType of [undefined, 'ore'])
        add({ type: 'castStart', entityId, ability, time: 1, gatherNodeType });
  add({ type: 'castStop', entityId: 1, success: true });
  const fxAbilities = [
    undefined,
    'psychic_scream',
    'intimidating_shout',
    'piercing_howl',
    'frost_nova',
    'flamestrike',
    'hammer_of_justice',
    'kidney_shot',
    'blink',
    'shadowstep',
    'rupture',
    'battle_shout',
    'rallying_cry',
    'fireball',
  ];
  const fxs = [
    'projectile',
    'nova',
    'fearImpact',
    'ccImpact',
    'blinkStep',
    'dotApply',
    'shout',
    'temporalClock',
    'burst',
  ];
  for (const fx of fxs)
    for (const ability of fxAbilities)
      for (const school of ['physical', 'arcane', 'holy', 'shadow', 'fire'])
        for (const wand of [false, true])
          add({ type: 'spellfx', fx, ability, school, wand, sourceId: 2, targetId: 101 });
  for (const impact of ['area', 'defensive', 'healing', 'strike'])
    add({
      type: 'spellfx',
      fx: 'paladinAscensionImpact',
      impact,
      sourceId: 1,
      targetId: 2,
      school: 'holy',
    });
  for (const fx of ['tick', 'nova', 'meteorFall', 'burst'])
    for (const ability of [undefined, 'meteor', 'frost_nova', 'blizzard'])
      for (const sfxKey of [undefined, 'rift_lava_tick'])
        add({ type: 'spellfxAt', fx, ability, sfxKey, school: 'frost', x: 10, z: 20 });
  for (const source of [undefined, 'potion', 'food', 'drink'])
    for (const sfxTick of [false, true])
      add({ type: 'heal', targetId: 1, amount: 20, source, sfxTick });
  for (const hot of [false, true])
    for (const abilityId of [undefined, 'frenzied_regeneration', 'bloodthirst', 'renew'])
      for (const amount of [0, 50])
        for (const sourceId of [1, 2])
          for (const absorbed of [0, 5])
            add({
              type: 'heal2',
              targetId: 1,
              sourceId,
              amount,
              hot,
              abilityId,
              absorbed,
              ability: 'Heal',
            });
  add({ type: 'heal', targetId: 4242, amount: 5 });
  const names = [
    'Cold Coffin',
    'Corruption',
    'Withering Wail',
    'Ascension',
    'Mending',
    'Battle Shout',
    'Stormsurge',
    'Polymorph',
    'Smokefade',
    'Unknown',
  ];
  for (const name of names)
    for (const gained of [true, false])
      for (const targetId of [1, 2]) add({ type: 'aura', targetId, sourceId: 2, name, gained });
  for (const e of ents) add({ type: 'death', entityId: e.id });
  for (const call of NYTHRAXIS_CALLS) add({ type: 'nythraxisCallout', call, sourceId: 101 });
  for (const call of VARKHUL_CALLS) add({ type: 'varkhulCallout', call, sourceId: 101 });
  // The wire always carries rareEvent (null when none): gatherRareTierFor tests !== null.
  for (const nodeType of ['ore', 'wood', 'herb'])
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary'])
      for (const rareEvent of [null, 'glint'])
        add({ type: 'gatherResult', nodeType, rarity, rareEvent, itemId: 'x', qty: 1 });
  return {
    suite: 'audio_sfx_router',
    source:
      'scripts/unreal/audio_sfx_router_ref.ts over src/ui/combat_sfx.ts (hud.ts playEventSfx)',
    note: 'in.event is the SimEvent JSON; entities come from audio_catalog.json sfxRouter.refEntities; engaged lists engaged mob ids',
    cases,
  };
}

function stingerSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  const base = { level: 5, dead: false, questsDone: 10, deeds: 3, hasHouse: false };
  const nexts: Array<Partial<typeof base>> = [
    {},
    { level: 6 },
    { level: 9 },
    { level: 8 },
    { dead: true },
    { hasHouse: true },
    { questsDone: 11 },
    { questsDone: 14 },
    { deeds: 4 },
    { level: 6, questsDone: 11, deeds: 4 },
    { dead: true, level: 6 },
    { level: 4 },
    { hasHouse: true, questsDone: 12 },
  ];
  cases.push({ in: { prev: 'null', next: JSON.stringify(base) }, out: stingersFor(null, base) });
  for (const d of nexts) {
    const next = { ...base, ...d };
    cases.push({
      in: { prev: JSON.stringify(base), next: JSON.stringify(next) },
      out: stingersFor(base, next),
    });
  }
  for (const key of [
    'score:wyn_region_eastbrook_vale_day',
    'score:wyn_region_proving_shore_night',
    'score:wyn_town_eastbrook_day',
    'score:combat:marsh',
    'vale',
  ])
    cases.push({ in: { slotKey: key }, out: regionOfSlot(key) });
  return {
    suite: 'audio_stingers',
    source: 'src/game/music_score.ts stingersFor, regionOfSlot',
    note: '',
    cases,
  };
}

function forestSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const z of ZONES) {
    const x0 = z.xMin ?? STRIP_MIN_X;
    const x1 = z.xMax ?? STRIP_MAX_X;
    for (const fx of [0.13, 0.5, 0.81])
      for (const fz of [0.27, 0.66]) {
        const x = Math.round((x0 + (x1 - x0) * fx) * 10) / 10;
        const zz = Math.round((z.zMin + (z.zMax - z.zMin) * fz) * 10) / 10;
        const s = new ForestDensitySampler(treeCounter);
        s.sample(x, zz);
        s.sample(x, zz);
        cases.push({ in: { x, z: zz }, out: s.sample(x, zz) });
      }
  }
  return {
    suite: 'audio_forest_density',
    source: 'src/render/forest_density_core.ts over the world tree scatter',
    note: 'compare within 1e-6',
    cases,
  };
}

const treeCounter = (minX: number, maxX: number, minZ: number, maxZ: number) => {
  let n = 0;
  for (const d of generateDecorationsInBounds(WORLD_SEED, { minX, maxX, minZ, maxZ }))
    if (d.kind !== 'rock') n++;
  return n;
};

/** The environment grids the native client cannot compute (it has no terrain function or
 *  tree scatter): the forest cell densities and the near-water mask, over the zone extent. */
let envMemo: ReturnType<typeof buildEnvironmentTables> | null = null;
export function environmentTables() {
  envMemo ??= buildEnvironmentTables();
  return envMemo;
}

/** Near-water mask cell (yards): fine enough for a shore, coarse enough to stay small. */
const NEAR_WATER_CELL = 4;

function buildEnvironmentTables() {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const z of ZONES) {
    minX = Math.min(minX, z.xMin ?? STRIP_MIN_X);
    maxX = Math.max(maxX, z.xMax ?? STRIP_MAX_X);
    minZ = Math.min(minZ, z.zMin);
    maxZ = Math.max(maxZ, z.zMax);
  }
  const C = FOREST_CELL_YARDS;
  const cx0 = Math.floor(minX / C) - 1,
    cx1 = Math.ceil(maxX / C) + 1;
  const cz0 = Math.floor(minZ / C) - 1,
    cz1 = Math.ceil(maxZ / C) + 1;
  const cells: number[] = [];
  const h = FOREST_REACH_YARDS / 2;
  const smooth = (v: number) => {
    const t = Math.min(
      1,
      Math.max(0, (v - FOREST_TREES_OPEN) / (FOREST_TREES_CLOSED - FOREST_TREES_OPEN)),
    );
    return t * t * (3 - 2 * t);
  };
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const mx = (cx + 0.5) * C,
        mz = (cz + 0.5) * C;
      cells.push(Math.round(smooth(treeCounter(mx - h, mx + h, mz - h, mz + h)) * 1e6) / 1e6);
    }
  const W = NEAR_WATER_CELL;
  const wx0 = Math.floor(minX / W),
    wz0 = Math.floor(minZ / W);
  const wnx = Math.ceil(maxX / W) - wx0,
    wnz = Math.ceil(maxZ / W) - wz0;
  const bits = new Uint8Array(Math.ceil((wnx * wnz) / 8));
  for (let j = 0; j < wnz; j++)
    for (let i = 0; i < wnx; i++) {
      const x = (wx0 + i + 0.5) * W,
        z = (wz0 + j + 0.5) * W;
      if (groundHeight(x, z, WORLD_SEED) < waterLevelAt(x, z, WORLD_SEED) + NEAR_WATER_MARGIN) {
        const k = j * wnx + i;
        bits[k >> 3] |= 1 << (k & 7);
      }
    }
  return {
    forest: { cellYards: C, cx0, cz0, nx: cx1 - cx0 + 1, nz: cz1 - cz0 + 1, cells },
    nearWater: {
      cellYards: W,
      x0: wx0,
      z0: wz0,
      nx: wnx,
      nz: wnz,
      bits: Buffer.from(bits).toString('base64'),
    },
    dayNight: { dayOnly: DAY_ONLY, noonPhase: NOON_PHASE, cycleMs: DAY_NIGHT_CYCLE_MS },
    debuffKinds: [...DEBUFF_AURA_KINDS].sort(),
    debuffDisplayIds: ['shaman_stormsurge_ready'],
    talentRowLevels: Array.from({ length: 60 }, (_, i) => i + 1).filter((l) =>
      isTalentRowUnlockLevel(l),
    ),
    castIds: {
      gather: GATHER_CAST_ID,
      corpseHarvest: CORPSE_HARVEST_CAST_ID,
      fishing: FISHING_CAST_ID,
      craftFamily: [
        CRAFT_CAST_ID,
        DISENCHANT_CAST_ID,
        ENCHANT_CAST_ID,
        SALVAGE_CAST_ID,
        SUNDER_CAST_ID,
        TOOL_RECHARGE_CAST_ID,
      ],
    },
  };
}

/** A sample of the near-water mask, to pin the C++ bit lookup to the TS terrain. */
function nearWaterSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  const env = environmentTables().nearWater;
  for (let k = 0; k < 400; k++) {
    const i = (k * 7919) % env.nx,
      j = (k * 104729) % env.nz;
    const x = (env.x0 + i + 0.5) * env.cellYards,
      z = (env.z0 + j + 0.5) * env.cellYards;
    cases.push({
      in: { x, z },
      out: groundHeight(x, z, WORLD_SEED) < waterLevelAt(x, z, WORLD_SEED) + NEAR_WATER_MARGIN,
    });
  }
  return {
    suite: 'audio_near_water',
    source: 'src/render/ambience_state_core.ts nearWater at cell centres',
    note: '',
    cases,
  };
}

export function sfxRouterTables() {
  const mobs: Record<
    string,
    { voice: string | null; boss: boolean; dummy: boolean; undead: boolean }
  > = {};
  for (const id of [...Object.keys(MOBS), 'water_elemental']) {
    const m = MOBS[id] as { family?: string; boss?: boolean; dummy?: boolean } | undefined;
    mobs[id] = {
      voice: mobVoiceFamily(id),
      boss: !!m?.boss,
      dummy: !!m?.dummy,
      undead: m?.family === 'undead',
    };
  }
  const castCues: Record<string, string> = {};
  for (const id of Object.keys(ABILITIES)) {
    const k = castCueForAbility(id);
    if (k) castCues[id] = k;
  }
  // craftResult plays its recipe's profession cue (audio.ts craftByFamily).
  const recipeProfession: Record<string, string> = {};
  for (const r of ALL_RECIPES) recipeProfession[r.id] = r.professionId;
  return { mobs, castCues, recipeProfession, refEntities: refEntities() };
}

// ---- mounts (W15 round 4): the engine state machines and each mount's resolved takes ----

/** advanceMountEngine and advanceInterruptibleMountEngine over scripted input runs. */
function mountEngineSuite(): ParitySuite {
  const cases: ParityCase[] = [];
  const scripts: Array<{ name: string; dt: number; moving: string }> = [
    { name: 'tap', dt: 0.1, moving: '1100000000' },
    { name: 'hold', dt: 0.1, moving: '1111111111110000000' },
    { name: 'stutter', dt: 0.05, moving: '1010101011110011' },
    { name: 'retap', dt: 0.2, moving: '11111000110000' },
    { name: 'idle', dt: 0.1, moving: '00000' },
  ];
  for (const policy of ['tank', 'interruptible'] as const)
    for (const startDuration of [0.25, 0.9])
      for (const s of scripts) {
        let entry: MountEngineEntry | undefined;
        const steps: Array<{ state: string; action: string | null; loop: boolean; idle: boolean }> =
          [];
        [...s.moving].forEach((c, i) => {
          const now = 1 + i * s.dt;
          const d = (policy === 'tank' ? advanceMountEngine : advanceInterruptibleMountEngine)(
            entry,
            c === '1',
            now,
            startDuration,
          );
          entry = d.next;
          steps.push({
            state: d.next.state,
            action: d.action,
            loop: mountEngineLoopActive(d.next.state),
            idle: mountEngineIdleAudible(d.next.state),
          });
        });
        cases.push({ in: { policy, startDuration, dt: s.dt, moving: s.moving }, out: steps });
      }
  for (const reversing of [false, true])
    for (const airborne of [false, true])
      for (const hasIdle of [false, true])
        for (const pivoting of [false, true])
          cases.push({
            in: { bend: true, reversing, airborne, hasIdle, pivoting },
            out: mountEngineBendRate(reversing, airborne, hasIdle, pivoting),
          });
  return {
    suite: 'audio_mount_engine',
    source: 'src/game/mount_engine_state.ts (both policies, loop and idle audibility, bend rates)',
    note: 'moving is one char per frame at 1 + i * dt seconds; bend cases carry bend: true',
    cases,
  };
}

/** Each mount's audio donor and the takes sfx.ts resolves for it (by key existence). */
function mountTakesSuite(): ParitySuite {
  const has = (k: string) => Object.hasOwn(SFX_CLIPS, k);
  const cases: ParityCase[] = [];
  for (const id of [
    ...Object.keys(MOUNTS),
    'referral_raptor',
    'referral_tank',
    'lantern_hall_destrier',
    'no_such_mount',
  ]) {
    const a = mountAudioKey(id);
    const opt = (k: string) => (has(k) ? k : null);
    cases.push({
      in: { mountKey: id },
      out: {
        audioKey: a,
        run: opt(`mount_run_${a}`),
        loop: opt(`mount_loop_${a}`),
        idle: opt(`mount_idle_${a}`),
        engineStart: opt(`mount_run_${a}_start`),
        engineIdle: opt(`mount_run_${a}_idle`),
        jump: opt(`mount_jump_${a}`) ?? 'move_jump',
        land: opt(`mount_land_${a}`) ?? 'move_land',
        summon: opt(`mount_summon_${a}`),
        neigh: opt(`mount_neigh_${id}`),
        apex: ['squawk', 'flap'].map((k) => `mount_${k}_${a}`).filter(has),
      },
    });
  }
  return {
    suite: 'audio_mount_takes',
    source: 'src/game/sfx.ts mount key resolution over mount_audio_key.ts',
    note: '',
    cases,
  };
}

export const AUDIO_PARITY_SUITES: Record<string, () => ParitySuite> = {
  audio_mount_engine: mountEngineSuite,
  audio_mount_takes: mountTakesSuite,
  audio_sfx_router: sfxRouterSuite,
  audio_stingers: stingerSuite,
  audio_forest_density: forestSuite,
  audio_near_water: nearWaterSuite,
  audio_location: locationSuite,
  audio_region_ambience: regionAmbienceSuite,
  audio_day_weight: dayWeightSuite,
  audio_music_zone: musicZoneSuite,
  audio_score_slot: scoreSlotSuite,
  audio_music_combat: musicCombatSuite,
  audio_boss_cue: bossCueSuite,
  audio_score_night: scoreNightSuite,
};

export function buildAudioSuite(name: string): ParitySuite {
  const b = AUDIO_PARITY_SUITES[name];
  if (!b) throw new Error(`unknown audio parity suite ${name}`);
  return b();
}
