import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MusicZone } from '../src/game/music';
import {
  COMBAT_STREAM_URLS,
  pickStreamTrackIndex,
  scoreCueUrl,
  ZONE_STREAM_CUES,
  ZONE_STREAM_POOLS,
  ZONE_STREAM_URLS,
  zoneStreamUrls,
} from '../src/game/music_tracks';

const publicDir = path.join(__dirname, '..', 'public');

function assetPath(url: string): string {
  return path.join(publicDir, ...url.split('?')[0].split('/').filter(Boolean));
}

/** The `?v=<hash12>` query every URL below carries: first 12 hex chars of the
 * file's sha256, same convention as the sampled SFX manifest
 * (scripts/sfx/manifest.mjs). server/static_cache.ts trusts an exact regex
 * match to cache the file immutably, so this suite is the guard rail that
 * catches a swapped-in cue whose URL hash was not updated to match
 * (rebuild with `node scripts/music/eleven_music.mjs build`). */
function assetHash(url: string): string {
  return createHash('sha256')
    .update(readFileSync(assetPath(url)))
    .digest('hex')
    .slice(0, 12);
}

const VERSIONED = /^\/audio\/music\/wyn\/[a-z0-9_]+\.mp3\?v=[a-f0-9]{12}$/;

function expectShipped(url: string | null | undefined, label: string): void {
  expect(url, label).toMatch(VERSIONED);
  if (!url) return;
  expect(existsSync(assetPath(url)), `missing asset for ${label}: ${url}`).toBe(true);
  const [, requestedHash] = url.split('?v=');
  expect(requestedHash, `stale cache-bust hash for ${label}: ${url}`).toBe(assetHash(url));
}

describe('streamed soundtrack catalog', () => {
  it('streams a committed, content-hash-versioned Wyndlewood score cue for every zone', () => {
    for (const [zone, url] of Object.entries(ZONE_STREAM_URLS)) {
      expectShipped(url, `zone '${zone}'`);
    }
  });

  it('routes each zone to its named score cue', () => {
    for (const [zone, cue] of Object.entries(ZONE_STREAM_CUES)) {
      expect(ZONE_STREAM_URLS[zone as MusicZone], zone).toBe(scoreCueUrl(cue));
    }
    expect(ZONE_STREAM_URLS.vale).toBe(scoreCueUrl('wyn_region_eastbrook_vale_day'));
    expect(ZONE_STREAM_URLS.town_gourdlight).toBe(scoreCueUrl('wyn_town_gourdlight'));
  });

  it('references no upstream remaster (every inherited track was removed)', () => {
    const all = [
      ...Object.values(ZONE_STREAM_URLS),
      ...COMBAT_STREAM_URLS,
      ...Object.values(ZONE_STREAM_POOLS).flat(),
    ];
    for (const url of all) expect(url ?? '').toMatch(/^\/audio\/music\/wyn\//);
  });

  it('ships two battle themes on disk', () => {
    expect(COMBAT_STREAM_URLS).toHaveLength(2);
    for (const url of COMBAT_STREAM_URLS) expectShipped(url, 'battle theme');
  });

  it('covers every MusicZone key exactly once', () => {
    const zones: MusicZone[] = [
      'town_eastbrook',
      'town_fenbridge',
      'town_highwatch',
      'town_goldcrest',
      'town_gourdlight',
      'vale',
      'vale_legacy',
      'marsh',
      'peaks',
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
      'farshore',
      'proving_shore',
      'dungeon_hollow_crypt',
      'dungeon_sunken_bastion',
      'dungeon_gravewyrm_sanctum',
      'ignivar_forge_approach',
      'ignivar_raid_arena',
      'ignivar_inner_crucible',
      'rift_frost',
      'rift_ember',
      'rift_venom',
      'rift_bone',
      'rift_brute',
      'rift_void',
      'rift_storm',
      'rift_tide',
    ];
    expect(Object.keys(ZONE_STREAM_URLS).sort()).toEqual([...zones].sort());
  });

  // Goldcrest Harbor is the one zone shipping a pair of cues; every other zone
  // resolves to the single stream so the common path stays untouched.
  it('resolves the capital to both harbor cues and everyone else to one', () => {
    expect(zoneStreamUrls('town_goldcrest')).toEqual([
      scoreCueUrl('wyn_town_goldcrest_day'),
      scoreCueUrl('wyn_town_goldcrest_night'),
    ]);
    expect(zoneStreamUrls('town_highwatch')).toEqual([scoreCueUrl('wyn_town_highwatch_day')]);
    for (const urls of Object.values(ZONE_STREAM_POOLS)) {
      for (const url of urls ?? []) expectShipped(url, 'pooled cue');
    }
  });
});

describe('pickStreamTrackIndex', () => {
  it('spreads uniformly over the catalog', () => {
    expect(pickStreamTrackIndex(2, () => 0)).toBe(0);
    expect(pickStreamTrackIndex(2, () => 0.49)).toBe(0);
    expect(pickStreamTrackIndex(2, () => 0.5)).toBe(1);
    expect(pickStreamTrackIndex(2, () => 0.99)).toBe(1);
  });

  it('clamps degenerate rand values into range', () => {
    expect(pickStreamTrackIndex(2, () => 1)).toBe(1);
    expect(pickStreamTrackIndex(2, () => -0.5)).toBe(0);
    expect(pickStreamTrackIndex(0, () => 0.5)).toBe(0);
  });
});
