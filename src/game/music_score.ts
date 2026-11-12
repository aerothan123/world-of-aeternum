// The Wyndlewood score: which generated cue (scripts/music/wyndle_music_plan.mjs) plays
// for where the player stands, the time of day and whether they fight, plus the rules
// the score layer (music_score_layer.ts) applies around it: day/night hysteresis,
// silence gaps between plays, the stinger table and the per-session discovery set.
//
// Every cue resolves to a SLOT (one stream key in the director's zone stream map) and a
// pool of cue keys the slot plays in turn. A cue missing from SCORE_TRACK_FILES is
// skipped; a slot whose pool comes out empty resolves to null, and the director then
// plays the remastered zone stream exactly as it always did (music_tracks.ts), which is
// how the procedural renders stay the fallback while the score is filled in.
//
// Pure and DOM-free: the file table and every input are injected, so it unit-tests in
// plain Node (tests/music_score.test.ts).

import { SCORE_TRACK_FILES, type ScoreTrackFile } from './music_score_tracks.generated';
import type { MusicZone } from './music_zones';

export type ScoreFiles = Readonly<Record<string, ScoreTrackFile>>;

/** The region slug of each overworld music zone (the plan's wyn_region_<slug>_<time>). */
export const SCORE_REGIONS: Readonly<Partial<Record<MusicZone, string>>> = Object.freeze({
  proving_shore: 'proving_shore',
  vale: 'eastbrook_vale',
  vale_legacy: 'eastbrook_vale',
  farshore: 'farshore_isle',
  marsh: 'mirefen_marsh',
  peaks: 'thornpeak_heights',
  dusk: 'veiled_hollow',
  ember: 'drakelands',
  frost: 'frostveil',
  amber: 'amberfall',
  fen: 'willowfen',
  night: 'nightbloom',
  haunt: 'wraithwood',
  jungle: 'palmreach',
  garden: 'evergarden',
  gale: 'galecrest',
});

/** Zone ids that score as a region of their own over their biome's music zone (the
 *  Southern Reaches ships on the world-expansion branch; its id lands here unchanged). */
export const SCORE_ZONE_REGIONS: Readonly<Record<string, string>> = Object.freeze({
  southern_reaches: 'southern_reaches',
});

/** The town slug of each town music zone (wyn_town_<slug>_<time>). */
export const SCORE_TOWNS: Readonly<Partial<Record<MusicZone, string>>> = Object.freeze({
  town_eastbrook: 'eastbrook',
  town_fenbridge: 'fenbridge',
  town_highwatch: 'highwatch',
  town_goldcrest: 'goldcrest',
});

/** Dungeon cues by instance id first (dungeons without a music zone of their own)... */
export const SCORE_INSTANCE_DUNGEONS: Readonly<Record<string, string>> = Object.freeze({
  nythraxis_crypt: 'wyn_dungeon_hollow_crypt',
  sunken_bastion: 'wyn_dungeon_sunken_bastion',
  gravewyrm_sanctum: 'wyn_dungeon_gravewyrm_sanctum',
  the_last_keep: 'wyn_dungeon_last_keep',
  dawnhold_castle: 'wyn_dungeon_dawnhold_castle',
  drowned_temple: 'wyn_dungeon_drowned_temple',
  wildheart_basin: 'wyn_dungeon_wildheart_basin',
  ignivar_forge_approach: 'wyn_dungeon_ancient_forge',
  ignivar_forge_lift: 'wyn_dungeon_ancient_forge',
  ignivar_molten_assembly: 'wyn_dungeon_ancient_forge',
});

/** ...then by music zone (a rift floor or an authored map that names a dungeon cue). */
export const SCORE_ZONE_DUNGEONS: Readonly<Partial<Record<MusicZone, string>>> = Object.freeze({
  dungeon_hollow_crypt: 'wyn_dungeon_hollow_crypt',
  dungeon_sunken_bastion: 'wyn_dungeon_sunken_bastion',
  dungeon_gravewyrm_sanctum: 'wyn_dungeon_gravewyrm_sanctum',
  ignivar_forge_approach: 'wyn_dungeon_ancient_forge',
});

export type CombatFamily =
  | 'pastoral'
  | 'marsh'
  | 'highland'
  | 'frost'
  | 'eerie'
  | 'wild'
  | 'pale_accord';

/** The battle layer each place fights to (wyn_combat_<family>). */
const COMBAT_FAMILY: Readonly<Partial<Record<MusicZone, CombatFamily>>> = Object.freeze({
  proving_shore: 'pastoral',
  vale: 'pastoral',
  vale_legacy: 'pastoral',
  town_eastbrook: 'pastoral',
  farshore: 'pastoral',
  amber: 'pastoral',
  garden: 'pastoral',
  marsh: 'marsh',
  fen: 'marsh',
  town_fenbridge: 'marsh',
  dungeon_sunken_bastion: 'marsh',
  peaks: 'highland',
  ember: 'highland',
  gale: 'highland',
  town_highwatch: 'highland',
  ignivar_forge_approach: 'highland',
  frost: 'frost',
  rift_frost: 'frost',
  dusk: 'eerie',
  haunt: 'eerie',
  night: 'eerie',
  dungeon_hollow_crypt: 'eerie',
  dungeon_gravewyrm_sanctum: 'eerie',
  rift_bone: 'eerie',
  rift_void: 'eerie',
  jungle: 'wild',
  town_goldcrest: 'wild',
  rift_venom: 'wild',
});

/** The Pale Accord's people fight to their own layer and boss cue: a mob template id
 *  that starts with this prefix (the faction's content convention, docs/design/
 *  music-direction.md) or one listed below. */
export const PALE_ACCORD_TEMPLATE_PREFIX = 'pale_accord_';
export const PALE_ACCORD_TEMPLATES: ReadonlySet<string> = new Set<string>([]);

export function isPaleAccordTemplate(templateId: string): boolean {
  return (
    templateId.startsWith(PALE_ACCORD_TEMPLATE_PREFIX) || PALE_ACCORD_TEMPLATES.has(templateId)
  );
}

/** Boss cues: the raid's dragon and the Pale Accord's leader by template id; every other
 *  boss without a track of its own fights to the shared dungeon boss cue. */
export const SCORE_BOSS_TEMPLATES: Readonly<Record<string, string>> = Object.freeze({
  nythraxis_scourge_of_thornpeak: 'wyn_boss_raid_dragon',
  korzul_the_gravewyrm: 'wyn_boss_raid_dragon',
});
export const SCORE_RAID_INSTANCES: ReadonlySet<string> = new Set(['nythraxis_boss_arena']);
export const SCORE_DEFAULT_BOSS = 'wyn_boss_dungeon';

/** Walk-in venues where the in-world songs are sung: a world-space rectangle (the hall
 *  inside the walls) and its repertoire by day and by night. */
export interface ScoreVenue {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly day: readonly string[];
  readonly night: readonly string[];
}

/** The Mirefen tavern's common room (src/sim/content/mirefen_tavern.ts TAVERN_ORIGIN
 *  (-17, 408), hall local x -16..16 and z -14..14, door facing world +x: world x is
 *  origin.x + local z and world z is origin.z - local x). Kept as numbers here so the
 *  score never imports content geometry; tests/music_score.test.ts pins them to it. */
export const SCORE_VENUES: readonly ScoreVenue[] = Object.freeze([
  {
    id: 'mirefen_tavern',
    minX: -17 - 14,
    maxX: -17 + 14,
    minZ: 408 - 16,
    maxZ: 408 + 16,
    day: ['wyn_song_usually_is', 'wyn_song_kettle_before_the_candle', 'wyn_song_keep_to_the_road'],
    night: [
      'wyn_song_keep_to_the_road',
      'wyn_song_usually_is',
      'wyn_song_muddlecap_lullaby',
      'wyn_song_kettle_before_the_candle',
    ],
  },
]);

export function venueAt(x: number, z: number, venues = SCORE_VENUES): ScoreVenue | null {
  for (const v of venues) {
    if (x >= v.minX && x <= v.maxX && z >= v.minZ && z <= v.maxZ) return v;
  }
  return null;
}

/** Where and how the player is, as the score reads it. */
export interface ScoreContext {
  /** The director's music zone (instance_music.ts decision.zone). */
  zone: MusicZone;
  /** The overworld zone id the player stands in (for zone-specific regions). */
  zoneId: string | null;
  /** The decision's combat flag (the battle layer replaces exploration). */
  combat: boolean;
  /** A Pale Accord foe has the player in its sights (decision.paleAccordFoe). */
  paleAccord: boolean;
  /** Night by the hysteresis below. */
  night: boolean;
  /** The instance the player is inside (decision.instanceId), or null. */
  instanceId: string | null;
  /** Inside a house lot's walk-in interior. */
  home: boolean;
  /** The walk-in venue the player stands in, or null. */
  venue: ScoreVenue | null;
}

/** How a slot repeats: 'gap' rests in silence between plays (exploration, towns, homes,
 *  dungeons, songs); 'loop' plays straight through again (battle layers). */
export type ScoreRepeat = 'gap' | 'loop';

export interface ScoreSlot {
  /** The stream key (one entry in the director's zone stream map). */
  readonly key: string;
  /** The cue keys the slot plays in turn, every one present in the file table. */
  readonly cues: readonly string[];
  readonly repeat: ScoreRepeat;
  /** The plan group of the slot (for the gap length). */
  readonly group: 'region' | 'town' | 'home' | 'dungeon' | 'song' | 'combat';
}

function present(files: ScoreFiles, keys: readonly string[]): string[] {
  return keys.filter((k) => Object.hasOwn(files, k));
}

/** A day/night pair: the time-of-day cue, else the other one (a region whose night
 *  variant is not generated yet keeps its day theme after dark). */
function timed(files: ScoreFiles, stem: string, night: boolean): string[] {
  const first = `${stem}_${night ? 'night' : 'day'}`;
  const second = `${stem}_${night ? 'day' : 'night'}`;
  const got = present(files, [first]);
  return got.length > 0 ? got : present(files, [second]);
}

function slot(
  key: string,
  cues: string[],
  group: ScoreSlot['group'],
  repeat: ScoreRepeat = 'gap',
): ScoreSlot | null {
  return cues.length > 0 ? { key, cues, group, repeat } : null;
}

export function combatFamilyFor(zone: MusicZone, paleAccord: boolean): CombatFamily | null {
  if (paleAccord) return 'pale_accord';
  return COMBAT_FAMILY[zone] ?? null;
}

/** The slot for `ctx`, or null to keep the remastered zone stream. */
export function scoreSlotFor(
  ctx: ScoreContext,
  files: ScoreFiles = SCORE_TRACK_FILES,
): ScoreSlot | null {
  if (ctx.combat) {
    const family = combatFamilyFor(ctx.zone, ctx.paleAccord);
    if (family === null) return null;
    return slot(
      `score:combat:${family}`,
      present(files, [`wyn_combat_${family}`]),
      'combat',
      'loop',
    );
  }
  if (ctx.home) {
    const pool = ctx.night
      ? ['wyn_home_night', 'wyn_song_muddlecap_lullaby']
      : ['wyn_home_day', 'wyn_song_raise_the_beam'];
    return slot(`score:home:${ctx.night ? 'night' : 'day'}`, present(files, pool), 'home');
  }
  if (ctx.venue) {
    const v = ctx.venue;
    return slot(
      `score:venue:${v.id}:${ctx.night ? 'night' : 'day'}`,
      present(files, ctx.night ? v.night : v.day),
      'song',
    );
  }
  if (ctx.instanceId !== null) {
    const cue = SCORE_INSTANCE_DUNGEONS[ctx.instanceId];
    if (cue) return slot(`score:${cue}`, present(files, [cue]), 'dungeon');
  }
  const dungeonCue = SCORE_ZONE_DUNGEONS[ctx.zone];
  if (dungeonCue) return slot(`score:${dungeonCue}`, present(files, [dungeonCue]), 'dungeon');
  const town = SCORE_TOWNS[ctx.zone];
  if (town) {
    const cues = timed(files, `wyn_town_${town}`, ctx.night);
    return slot(`score:${cues[0] ?? town}`, cues, 'town');
  }
  const region =
    (ctx.zoneId !== null ? SCORE_ZONE_REGIONS[ctx.zoneId] : undefined) ?? SCORE_REGIONS[ctx.zone];
  if (region) {
    const cues = timed(files, `wyn_region_${region}`, ctx.night);
    return slot(`score:${cues[0] ?? region}`, cues, 'region');
  }
  return null;
}

/** The boss track URL for a fight: a boss with a bespoke track keeps it; the raid's dragon
 *  and the shared default loop take the score's boss cues when they are generated. */
export function scoreBossUrl(
  trackUrl: string | null,
  templateId: string | null,
  instanceId: string | null,
  paleAccord: boolean,
  files: ScoreFiles = SCORE_TRACK_FILES,
): string | null {
  const cue =
    (templateId !== null ? SCORE_BOSS_TEMPLATES[templateId] : undefined) ??
    (paleAccord ? 'wyn_boss_pale_accord' : undefined) ??
    (instanceId !== null && SCORE_RAID_INSTANCES.has(instanceId)
      ? 'wyn_boss_raid_dragon'
      : undefined);
  if (cue && Object.hasOwn(files, cue)) return files[cue].url;
  if (trackUrl !== null) return trackUrl;
  return Object.hasOwn(files, SCORE_DEFAULT_BOSS) ? files[SCORE_DEFAULT_BOSS].url : null;
}

/** dayWeight (region_ambience_core.ts dayWeightForPhase: 1 day, 0 night) below which the
 *  score turns to its night cues, and above which it turns back, so a dusk that wobbles
 *  across one threshold never flips the theme twice. */
export const NIGHT_BELOW = 0.35;
export const DAY_ABOVE = 0.65;

export function scoreNight(wasNight: boolean, dayWeight: number): boolean {
  if (wasNight) return dayWeight < DAY_ABOVE;
  return dayWeight < NIGHT_BELOW;
}

/** Seconds of silence after a cue plays through, before the slot plays again: open
 *  country rests longest, towns and homes a little, songs like a bard catching breath,
 *  dungeons briefly (their beds are the room tone). rand is injected (Math.random at the
 *  call site). */
export const SILENCE_GAP_SECONDS: Readonly<Record<ScoreSlot['group'], readonly [number, number]>> =
  Object.freeze({
    region: [45, 110],
    town: [25, 60],
    home: [30, 75],
    dungeon: [15, 35],
    song: [12, 30],
    combat: [0, 0],
  });

export function silenceGapSeconds(group: ScoreSlot['group'], rand: () => number): number {
  const [lo, hi] = SILENCE_GAP_SECONDS[group];
  const r = Math.min(1, Math.max(0, rand()));
  return lo + (hi - lo) * r;
}

/** Arriving in a new slot plays its first cue straight away; a slot that rests waits
 *  for its gap. A region the player has not heard this session gets a discovery sting. */
export type ScoreStinger =
  | 'quest_complete'
  | 'level_up'
  | 'discovery'
  | 'death'
  | 'deed'
  | 'home_key';

export const SCORE_STINGERS: Readonly<Record<ScoreStinger, string>> = Object.freeze({
  quest_complete: 'wyn_sting_quest_complete',
  level_up: 'wyn_sting_level_up',
  discovery: 'wyn_sting_discovery',
  death: 'wyn_sting_death',
  deed: 'wyn_sting_deed',
  home_key: 'wyn_sting_home_key',
});

/** The world readings the stingers diff, frame to frame. */
export interface ScoreSignals {
  level: number;
  dead: boolean;
  questsDone: number;
  deeds: number;
  hasHouse: boolean;
}

/** A first reading (and any reading that jumps by more than this, the login snapshot
 *  filling the mirror) only re-baselines: it never plays a sting. */
export const SIGNAL_JUMP_LIMIT = 3;

/** The stingers that a change from `prev` to `next` earns, most important first (only
 *  the first plays; the score never stacks fanfares). */
export function stingersFor(prev: ScoreSignals | null, next: ScoreSignals): ScoreStinger[] {
  if (prev === null) return [];
  const out: ScoreStinger[] = [];
  const up = (a: number, b: number) => b > a && b - a <= SIGNAL_JUMP_LIMIT;
  if (!prev.dead && next.dead) out.push('death');
  if (up(prev.level, next.level)) out.push('level_up');
  if (!prev.hasHouse && next.hasHouse) out.push('home_key');
  if (up(prev.questsDone, next.questsDone)) out.push('quest_complete');
  if (up(prev.deeds, next.deeds)) out.push('deed');
  return out;
}

/** The region slug a slot key names (score:wyn_region_<slug>_<time>), or null. */
export function regionOfSlot(key: string): string | null {
  const m = /^score:wyn_region_(.+)_(?:day|night)$/.exec(key);
  return m ? m[1] : null;
}
