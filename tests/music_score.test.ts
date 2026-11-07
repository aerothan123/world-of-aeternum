import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MUSIC_PLAN } from '../scripts/music/wyndle_music_plan.mjs';
import {
  combatFamilyFor,
  DAY_ABOVE,
  isPaleAccordTemplate,
  NIGHT_BELOW,
  regionOfSlot,
  SCORE_INSTANCE_DUNGEONS,
  SCORE_REGIONS,
  SCORE_STINGERS,
  SCORE_TOWNS,
  SCORE_VENUES,
  SCORE_ZONE_REGIONS,
  type ScoreContext,
  type ScoreFiles,
  type ScoreSignals,
  SILENCE_GAP_SECONDS,
  scoreBossUrl,
  scoreNight,
  scoreSlotFor,
  silenceGapSeconds,
  stingersFor,
  venueAt,
} from '../src/game/music_score';
import { SCORE_TRACK_FILES } from '../src/game/music_score_tracks.generated';
import { ALL_MUSIC_ZONES } from '../src/game/music_zones';
import { TAVERN_HALL, tavernToWorld } from '../src/sim/content/mirefen_tavern';

// The Wyndlewood score's pure routing (src/game/music_score.ts): which generated cue
// plays where, by day and night, in a fight, at home and in the tavern, and the rules
// around it (hysteresis, silence gaps, stingers). Files are injected so each case states
// exactly which cues exist.

const PLAN_KEYS = new Set(MUSIC_PLAN.map((c) => c.key));

function files(...keys: string[]): ScoreFiles {
  const out: Record<string, { url: string; seconds: number }> = {};
  for (const k of keys) out[k] = { url: `/audio/music/wyn/${k}.mp3?v=test`, seconds: 60 };
  return out;
}

function ctx(over: Partial<ScoreContext>): ScoreContext {
  return {
    zone: 'vale',
    zoneId: 'eastbrook_vale',
    combat: false,
    paleAccord: false,
    night: false,
    instanceId: null,
    home: false,
    venue: null,
    ...over,
  };
}

const sig = (over: Partial<ScoreSignals> = {}): ScoreSignals => ({
  level: 5,
  dead: false,
  questsDone: 10,
  deeds: 3,
  hasHouse: false,
  ...over,
});

describe('music_score routing', () => {
  it('maps every planned region, town and dungeon cue to a place the world reaches', () => {
    const regions = new Set([
      ...Object.values(SCORE_REGIONS),
      ...Object.values(SCORE_ZONE_REGIONS),
    ]);
    const towns = new Set(Object.values(SCORE_TOWNS));
    const dungeons = new Set(Object.values(SCORE_INSTANCE_DUNGEONS));
    for (const key of PLAN_KEYS) {
      const region = /^wyn_region_(.+)_(day|night)$/.exec(key);
      if (region) expect(regions, key).toContain(region[1]);
      const town = /^wyn_town_(.+)_(day|night)$/.exec(key);
      if (town) expect(towns, key).toContain(town[1]);
      if (key.startsWith('wyn_dungeon_')) expect(dungeons, key).toContain(key);
    }
    // the fifteen regions plus the Southern Reaches
    expect(regions.size).toBe(16);
    for (const zone of Object.keys(SCORE_REGIONS)) expect(ALL_MUSIC_ZONES).toContain(zone);
  });

  it('plays the region theme by day and its night variant after dark', () => {
    const f = files('wyn_region_eastbrook_vale_day', 'wyn_region_eastbrook_vale_night');
    expect(scoreSlotFor(ctx({}), f)?.cues).toEqual(['wyn_region_eastbrook_vale_day']);
    const night = scoreSlotFor(ctx({ night: true }), f);
    expect(night?.cues).toEqual(['wyn_region_eastbrook_vale_night']);
    expect(night?.key).toBe('score:wyn_region_eastbrook_vale_night');
    expect(night?.repeat).toBe('gap');
    expect(regionOfSlot(night?.key ?? '')).toBe('eastbrook_vale');
  });

  it('keeps the day theme at night when the night variant is not generated', () => {
    const slot = scoreSlotFor(ctx({ night: true }), files('wyn_region_eastbrook_vale_day'));
    expect(slot?.cues).toEqual(['wyn_region_eastbrook_vale_day']);
  });

  it('falls back to the remastered stream (null) where no cue exists', () => {
    expect(scoreSlotFor(ctx({}), files())).toBeNull();
    expect(
      scoreSlotFor(ctx({ zone: 'rift_storm', zoneId: null }), files('wyn_combat_pastoral')),
    ).toBeNull();
  });

  it('scores a zone id of its own over its biome (the Southern Reaches)', () => {
    const f = files('wyn_region_southern_reaches_day', 'wyn_region_drakelands_day');
    const slot = scoreSlotFor(ctx({ zone: 'ember', zoneId: 'southern_reaches' }), f);
    expect(slot?.cues).toEqual(['wyn_region_southern_reaches_day']);
    expect(scoreSlotFor(ctx({ zone: 'ember', zoneId: 'drakelands' }), f)?.cues).toEqual([
      'wyn_region_drakelands_day',
    ]);
  });

  it('plays the town theme inside a hub', () => {
    const f = files('wyn_town_fenbridge_day', 'wyn_town_fenbridge_night');
    expect(scoreSlotFor(ctx({ zone: 'town_fenbridge' }), f)?.cues).toEqual([
      'wyn_town_fenbridge_day',
    ]);
    expect(scoreSlotFor(ctx({ zone: 'town_fenbridge', night: true }), f)?.group).toBe('town');
  });

  it('fights to the battle layer of the region family, looping without gaps', () => {
    const f = files('wyn_combat_marsh', 'wyn_combat_pale_accord', 'wyn_region_mirefen_marsh_day');
    const slot = scoreSlotFor(ctx({ zone: 'marsh', combat: true }), f);
    expect(slot).toEqual({
      key: 'score:combat:marsh',
      cues: ['wyn_combat_marsh'],
      group: 'combat',
      repeat: 'loop',
    });
    expect(scoreSlotFor(ctx({ zone: 'marsh', combat: true, paleAccord: true }), f)?.cues).toEqual([
      'wyn_combat_pale_accord',
    ]);
    // a family whose layer is not generated keeps the remastered battle themes
    expect(scoreSlotFor(ctx({ zone: 'frost', combat: true }), f)).toBeNull();
    expect(combatFamilyFor('jungle', false)).toBe('wild');
    expect(combatFamilyFor('haunt', false)).toBe('eerie');
  });

  it('plays the home pool inside a house and the songs in the tavern', () => {
    const f = files(
      'wyn_home_day',
      'wyn_home_night',
      'wyn_song_raise_the_beam',
      'wyn_song_muddlecap_lullaby',
      'wyn_song_usually_is',
      'wyn_song_keep_to_the_road',
    );
    const home = { home: true, instanceId: 'house_eastbrook_quay_cottage' };
    expect(scoreSlotFor(ctx(home), f)?.cues).toEqual(['wyn_home_day', 'wyn_song_raise_the_beam']);
    expect(scoreSlotFor(ctx({ ...home, night: true }), f)?.cues).toEqual([
      'wyn_home_night',
      'wyn_song_muddlecap_lullaby',
    ]);
    const tavern = SCORE_VENUES[0];
    const song = scoreSlotFor(ctx({ zone: 'marsh', venue: tavern }), f);
    expect(song?.group).toBe('song');
    expect(song?.cues).toEqual(['wyn_song_usually_is', 'wyn_song_keep_to_the_road']);
  });

  it('pins the tavern venue to the Mirefen tavern common room', () => {
    const v = SCORE_VENUES.find((x) => x.id === 'mirefen_tavern');
    expect(v).toBeDefined();
    const a = tavernToWorld(TAVERN_HALL.x0, TAVERN_HALL.z0);
    const b = tavernToWorld(TAVERN_HALL.x1, TAVERN_HALL.z1);
    expect(v?.minX).toBe(Math.min(a.x, b.x));
    expect(v?.maxX).toBe(Math.max(a.x, b.x));
    expect(v?.minZ).toBe(Math.min(a.z, b.z));
    expect(v?.maxZ).toBe(Math.max(a.z, b.z));
    const mid = tavernToWorld(0, 0);
    expect(venueAt(mid.x, mid.z)?.id).toBe('mirefen_tavern');
    expect(venueAt(mid.x + 40, mid.z)).toBeNull();
  });

  it('plays an instance dungeon by its id before the shared crypt cue', () => {
    const f = files('wyn_dungeon_last_keep', 'wyn_dungeon_hollow_crypt');
    const keep = scoreSlotFor(
      ctx({ zone: 'dungeon_hollow_crypt', instanceId: 'the_last_keep' }),
      f,
    );
    expect(keep?.cues).toEqual(['wyn_dungeon_last_keep']);
    const crypt = scoreSlotFor(
      ctx({ zone: 'dungeon_hollow_crypt', instanceId: 'hollow_crypt' }),
      f,
    );
    expect(crypt?.cues).toEqual(['wyn_dungeon_hollow_crypt']);
  });

  it('turns day and night with hysteresis', () => {
    expect(scoreNight(false, NIGHT_BELOW + 0.01)).toBe(false);
    expect(scoreNight(false, NIGHT_BELOW - 0.01)).toBe(true);
    expect(scoreNight(true, DAY_ABOVE - 0.01)).toBe(true);
    expect(scoreNight(true, DAY_ABOVE + 0.01)).toBe(false);
  });

  it('rests for a gap inside the group range (none for the battle layer)', () => {
    for (const [group, [lo, hi]] of Object.entries(SILENCE_GAP_SECONDS)) {
      const g = group as keyof typeof SILENCE_GAP_SECONDS;
      expect(silenceGapSeconds(g, () => 0)).toBe(lo);
      expect(silenceGapSeconds(g, () => 1)).toBe(hi);
    }
    expect(silenceGapSeconds('combat', () => 0.5)).toBe(0);
  });

  it('rings a sting for a genuine change and never for the first reading or a sync jump', () => {
    expect(stingersFor(null, sig())).toEqual([]);
    expect(stingersFor(sig(), sig({ level: 6 }))).toEqual(['level_up']);
    expect(stingersFor(sig(), sig({ questsDone: 11 }))).toEqual(['quest_complete']);
    expect(stingersFor(sig(), sig({ deeds: 4 }))).toEqual(['deed']);
    expect(stingersFor(sig(), sig({ hasHouse: true }))).toEqual(['home_key']);
    expect(stingersFor(sig(), sig({ dead: true }))).toEqual(['death']);
    expect(stingersFor(sig({ questsDone: 0 }), sig({ questsDone: 40 }))).toEqual([]);
    // most important first: a level earned by the turn-in rings the level fanfare
    expect(stingersFor(sig(), sig({ level: 6, questsDone: 11 }))[0]).toBe('level_up');
  });

  it('gives bosses without a bespoke track the score cues', () => {
    const f = files('wyn_boss_dungeon', 'wyn_boss_raid_dragon', 'wyn_boss_pale_accord');
    expect(scoreBossUrl(null, null, 'hollow_crypt', false, f)).toBe(f.wyn_boss_dungeon.url);
    expect(scoreBossUrl('/audio/music/boss_morthen.mp3', 'morthen', 'hollow_crypt', false, f)).toBe(
      '/audio/music/boss_morthen.mp3',
    );
    expect(scoreBossUrl(null, null, 'nythraxis_boss_arena', false, f)).toBe(
      f.wyn_boss_raid_dragon.url,
    );
    expect(scoreBossUrl(null, null, 'the_last_keep', true, f)).toBe(f.wyn_boss_pale_accord.url);
    expect(scoreBossUrl(null, null, 'hollow_crypt', false, files())).toBeNull();
    expect(isPaleAccordTemplate('pale_accord_adept')).toBe(true);
    expect(isPaleAccordTemplate('crypt_shambler')).toBe(false);
  });

  it('ships every stinger the score rings', () => {
    for (const cue of Object.values(SCORE_STINGERS)) expect(PLAN_KEYS).toContain(cue);
  });
});

describe('music_score_tracks.generated', () => {
  const root = join(__dirname, '..');
  it('lists only planned cues, each a committed file whose hash the URL carries', () => {
    for (const [key, file] of Object.entries(SCORE_TRACK_FILES)) {
      expect(PLAN_KEYS, key).toContain(key);
      const m = /^\/audio\/music\/wyn\/([a-z0-9_]+)\.mp3\?v=([0-9a-f]{12})$/.exec(file.url);
      expect(m, file.url).not.toBeNull();
      expect(m?.[1]).toBe(key);
      const path = join(root, 'public/audio/music/wyn', `${key}.mp3`);
      expect(existsSync(path), path).toBe(true);
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
      expect(m?.[2], key).toBe(hash);
      expect(file.seconds).toBeGreaterThan(2);
    }
  });
});
