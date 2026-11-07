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
import {
  combatFamilyFor,
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
import {
  createRegionAmbience,
  dayWeightForPhase,
  REGION_BED_GAINS,
  sampleRegionAmbienceInto,
} from '../../src/render/region_ambience_core';
import { GOURDLIGHT_EVE_ID } from '../../src/sim/content/gourdlight_eve';
import {
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
  RIFT_BAND_X_MIN,
  STRIP_MAX_X,
  STRIP_MIN_X,
  ZONES,
  zoneAt,
} from '../../src/sim/data';
import type { BiomeId } from '../../src/sim/types';
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

export const AUDIO_PARITY_SUITES: Record<string, () => ParitySuite> = {
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
