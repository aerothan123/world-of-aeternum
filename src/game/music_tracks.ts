// The streamed soundtrack catalog: which Wyndlewood score cue (music_score.ts, the
// generated table music_score_tracks.generated.ts) each music zone streams when the
// score layer holds no slot of its own for it, the battle themes, and the pooled
// zones. Every URL comes from the generated table, so it always carries the
// committed file's `?v=<hash12>` content hash (first 12 hex chars of its sha256),
// which server/static_cache.ts trusts to serve these multi-MB cues with a year-long
// immutable Cache-Control. Regenerate the table with
// `node scripts/music/eleven_music.mjs build`; tests/music_tracks.test.ts pins every
// URL to a committed file.
//
// The upstream remasters that used to live in public/audio/music/ were project-only
// art and are gone (docs/launch/asset-rights-inventory.md, music crew). The procedural
// compositions in music.ts remain the authoring source for the music editor and
// scripts/render_music.mjs only. Pure data + math, DOM-free.

import type { MusicZone } from './music';
import { SCORE_TRACK_FILES } from './music_score_tracks.generated';

/** The streamed URL of a score cue, or null while it is not generated. */
export function scoreCueUrl(key: string): string | null {
  return Object.hasOwn(SCORE_TRACK_FILES, key) ? SCORE_TRACK_FILES[key].url : null;
}

/** The cue each zone streams (by day: the score layer swaps in night variants). */
export const ZONE_STREAM_CUES: Readonly<Record<MusicZone, string>> = Object.freeze({
  town_eastbrook: 'wyn_town_eastbrook_day',
  town_fenbridge: 'wyn_town_fenbridge_day',
  town_highwatch: 'wyn_town_highwatch_day',
  town_goldcrest: 'wyn_town_goldcrest_day',
  // Gourdlight Eve's lantern-festival theme (seasonal_music.ts swaps it in).
  town_gourdlight: 'wyn_town_gourdlight',
  vale: 'wyn_region_eastbrook_vale_day',
  vale_legacy: 'wyn_region_eastbrook_vale_day',
  marsh: 'wyn_region_mirefen_marsh_day',
  peaks: 'wyn_region_thornpeak_heights_day',
  dusk: 'wyn_region_veiled_hollow_day',
  ember: 'wyn_region_drakelands_day',
  frost: 'wyn_region_frostveil_day',
  amber: 'wyn_region_amberfall_day',
  fen: 'wyn_region_willowfen_day',
  night: 'wyn_region_nightbloom_day',
  haunt: 'wyn_region_wraithwood_day',
  jungle: 'wyn_region_palmreach_day',
  garden: 'wyn_region_evergarden_day',
  gale: 'wyn_region_galecrest_day',
  farshore: 'wyn_region_farshore_isle_day',
  proving_shore: 'wyn_region_proving_shore_day',
  dungeon_hollow_crypt: 'wyn_dungeon_hollow_crypt',
  dungeon_sunken_bastion: 'wyn_dungeon_sunken_bastion',
  dungeon_gravewyrm_sanctum: 'wyn_dungeon_gravewyrm_sanctum',
  ignivar_forge_approach: 'wyn_dungeon_ancient_forge',
  ignivar_raid_arena: 'wyn_crucible_heart',
  ignivar_inner_crucible: 'wyn_boss_raid_dragon',
  // Rift crawls play the dungeon cue nearest their archetype.
  rift_frost: 'wyn_dungeon_gravewyrm_sanctum',
  rift_ember: 'wyn_dungeon_ancient_forge',
  rift_venom: 'wyn_dungeon_drowned_temple',
  rift_bone: 'wyn_dungeon_hollow_crypt',
  rift_brute: 'wyn_dungeon_last_keep',
  rift_void: 'wyn_dungeon_dawnhold_castle',
  rift_storm: 'wyn_dungeon_wildheart_basin',
  rift_tide: 'wyn_dungeon_sunken_bastion',
});

/** Streamed URL for each zone cue (null while its cue is not generated). */
export const ZONE_STREAM_URLS: Record<MusicZone, string | null> = Object.fromEntries(
  Object.entries(ZONE_STREAM_CUES).map(([zone, cue]) => [zone, scoreCueUrl(cue)]),
) as Record<MusicZone, string | null>;

/** Zones that ship MORE than one cue: Goldcrest Harbor greets you with its day theme
 *  or its evening one, so the capital varies between visits. A zone absent here plays
 *  its single ZONE_STREAM_URLS entry, which stays the common case. */
export const ZONE_STREAM_POOLS: Partial<Record<MusicZone, readonly string[]>> = {
  town_goldcrest: ['wyn_town_goldcrest_day', 'wyn_town_goldcrest_night']
    .map(scoreCueUrl)
    .filter((u): u is string => u !== null),
};

/** Every cue a zone can play, in pick order: its pool when it has one, else its
 *  single stream, else empty (a streamless zone). */
export function zoneStreamUrls(zone: MusicZone): readonly string[] {
  const pool = ZONE_STREAM_POOLS[zone];
  if (pool && pool.length > 0) return pool;
  const url = ZONE_STREAM_URLS[zone];
  return url ? [url] : [];
}

/** The battle themes the director falls back to where the score has no battle layer
 *  for a place; each fight opens on one chosen at random. */
export const COMBAT_STREAM_URLS: string[] = ['wyn_combat_pastoral', 'wyn_combat_eerie']
  .map(scoreCueUrl)
  .filter((u): u is string => u !== null);

/** Pick which track opens the next fight, or which cue a multi-track zone
 *  greets you with: uniform over the pool. The two uses want identical
 *  behaviour, so `pickCombatTrackIndex` is retained as the combat-side name. */
export function pickStreamTrackIndex(trackCount: number, rand: () => number): number {
  if (trackCount <= 0) return 0;
  const idx = Math.floor(rand() * trackCount);
  return Math.min(trackCount - 1, Math.max(0, idx));
}

/** Pick which battle theme opens the next fight: uniform over the catalog.
 *  rand is injected (Math.random at the call site) so tests can drive it;
 *  the result is clamped so rand() returning exactly 1 stays in range. */
export function pickCombatTrackIndex(trackCount: number, rand: () => number): number {
  if (trackCount <= 0) return 0;
  const idx = Math.floor(rand() * trackCount);
  return Math.min(trackCount - 1, Math.max(0, idx));
}
