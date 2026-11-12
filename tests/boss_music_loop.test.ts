import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BOSS_TRACK_URLS, bossTrackFor, DEFAULT_BOSS_TRACK_URL } from '../src/game/boss_music_loop';
import {
  InstanceMusicController,
  type InstanceMusicEntity,
  type InstanceMusicInput,
  instanceMusicDecision,
} from '../src/game/instance_music';
import { scoreCueUrl } from '../src/game/music_tracks';
import { DUNGEONS, instanceOrigin, MOBS, ZONES } from '../src/sim/data';

const VELKHAR_URL = scoreCueUrl('wyn_boss_undead') ?? '';
const DUNGEON_BOSS_IDS = [
  'knight_commander_olen',
  'gaoler_ossick',
  'vael_the_mistcaller',
  'korgath_the_bound',
  'grand_necromancer_velkhar',
  'korzul_the_gravewyrm',
  'wildheart_beastmaster',
  'the_gorgebloom',
  'wildheart_high_priest',
  'choirmother_selthe',
  'mere_hydra_head_left',
  'mere_hydra_head_center',
  'mere_hydra_head_right',
  'tideglass_colossus',
  'ysolei',
] as const;

const zoneFixture = ZONES.find((zone) => zone.id === 'eastbrook_vale');
if (!zoneFixture) throw new Error('eastbrook_vale fixture is missing');
const zone = zoneFixture;
const bastion = instanceOrigin(DUNGEONS.sunken_bastion.index, 0);

function input(overrides: Partial<InstanceMusicInput> = {}): InstanceMusicInput {
  return {
    now: 20000,
    lastCombatEventAt: 0,
    lastBossCombatEventAt: 0,
    inCombat: false,
    playerId: 7,
    playerPos: { x: bastion.x, z: bastion.z },
    zone,
    inDungeon: true,
    entities: [],
    riftFloor: null,
    ...overrides,
  };
}

const velkhar = (aggroTargetId: number | null): InstanceMusicEntity => ({
  kind: 'mob',
  dead: false,
  templateId: 'grand_necromancer_velkhar',
  aggroTargetId,
});

describe('per-boss fight tracks', () => {
  it('gives every dungeon boss a versioned Wyndlewood score cue, the Hydra heads one', () => {
    expect(Object.keys(BOSS_TRACK_URLS).sort()).toEqual([...DUNGEON_BOSS_IDS].sort());
    expect(BOSS_TRACK_URLS.grand_necromancer_velkhar).toBe(VELKHAR_URL);
    expect(BOSS_TRACK_URLS.korzul_the_gravewyrm).toBe(scoreCueUrl('wyn_boss_raid_dragon'));
    expect(BOSS_TRACK_URLS.wildheart_beastmaster).toBe(scoreCueUrl('wyn_boss_wild'));
    for (const id of [
      'mere_hydra_head_center',
      'vael_the_mistcaller',
      'ysolei',
      'tideglass_colossus',
    ]) {
      expect(BOSS_TRACK_URLS[id], id).toBe(scoreCueUrl('wyn_boss_tide'));
    }
    expect(BOSS_TRACK_URLS.mere_hydra_head_left).toBe(BOSS_TRACK_URLS.mere_hydra_head_center);
    expect(BOSS_TRACK_URLS.mere_hydra_head_right).toBe(BOSS_TRACK_URLS.mere_hydra_head_center);
    for (const id of DUNGEON_BOSS_IDS) {
      expect(MOBS[id], id).toBeDefined();
      expect(BOSS_TRACK_URLS[id], id).toMatch(
        /^\/audio\/music\/wyn\/[a-z0-9_]+\.mp3\?v=[a-f0-9]{12}$/,
      );
      const [asset, hash] = BOSS_TRACK_URLS[id].split('?v=');
      const bytes = readFileSync(path.join(__dirname, '..', 'public', asset));
      expect(createHash('sha256').update(bytes).digest('hex').slice(0, 12), id).toBe(hash);
    }
  });

  it('resolves a track only for a boss that has one', () => {
    expect(bossTrackFor('grand_necromancer_velkhar')).toBe(VELKHAR_URL);
    expect(bossTrackFor('korgath_the_bound')).toBe(BOSS_TRACK_URLS.korgath_the_bound);
    // The retired Hollow Crypt's bosses kept no cue.
    expect(bossTrackFor('morthen')).toBeNull();
    expect(bossTrackFor('wildheart_stalker')).toBeNull();
    expect(bossTrackFor('toString')).toBeNull();
  });

  it('engages each dedicated boss loop only while a living boss holds a target', () => {
    const idle = instanceMusicDecision(input({ entities: [velkhar(null)] }));
    expect(idle.bossEngaged).toBe(false);
    expect(idle.bossTrackUrl).toBeNull();

    const fighting = instanceMusicDecision(input({ entities: [velkhar(7)] }));
    expect(fighting.bossEngaged).toBe(true);
    expect(fighting.bossTrackUrl).toBe(VELKHAR_URL);

    const dead = instanceMusicDecision(input({ entities: [{ ...velkhar(7), dead: true }] }));
    expect(dead.bossEngaged).toBe(false);
    expect(dead.bossTrackUrl).toBeNull();

    for (const id of DUNGEON_BOSS_IDS) {
      const fightingBoss = { ...velkhar(9), templateId: id };
      expect(instanceMusicDecision(input({ entities: [fightingBoss] })).bossTrackUrl, id).toBe(
        BOSS_TRACK_URLS[id],
      );
    }
  });

  it('keeps his track through a short aggro gap, then hands the mix back', () => {
    const port = {
      resetForDungeonEntry: vi.fn(),
      update: vi.fn(),
      setBossCombat: vi.fn(),
    };
    const controller = new InstanceMusicController(port);

    controller.update(input({ now: 20000, entities: [velkhar(7)] }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(true, VELKHAR_URL);

    // An immune hover drops his target for a few seconds: the track holds.
    controller.update(input({ now: 25000, entities: [velkhar(null)] }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(true, VELKHAR_URL);

    // Ten seconds without a target (a wipe, a reset): back to the zone score.
    controller.update(input({ now: 30000, entities: [velkhar(null)] }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(false);
  });

  it('switches cues when the next boss engages without replaying the previous cue', () => {
    const port = {
      resetForDungeonEntry: vi.fn(),
      update: vi.fn(),
      setBossCombat: vi.fn(),
    };
    const controller = new InstanceMusicController(port);
    controller.update(
      input({ entities: [{ ...velkhar(7), templateId: 'grand_necromancer_velkhar' }] }),
    );
    expect(port.setBossCombat).toHaveBeenLastCalledWith(
      true,
      BOSS_TRACK_URLS.grand_necromancer_velkhar,
    );
    controller.update(
      input({ now: 21000, entities: [{ ...velkhar(7), templateId: 'korgath_the_bound' }] }),
    );
    expect(port.setBossCombat).toHaveBeenLastCalledWith(true, BOSS_TRACK_URLS.korgath_the_bound);
    controller.update(input({ now: 31000 }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(false);
  });

  it('gives the boss cue ownership before updating the normal combat score', () => {
    const port = {
      resetForDungeonEntry: vi.fn(),
      update: vi.fn(),
      setBossCombat: vi.fn(),
    };
    const controller = new InstanceMusicController(port);
    controller.update(
      input({ entities: [{ ...velkhar(7), templateId: 'grand_necromancer_velkhar' }] }),
    );
    expect(port.setBossCombat).toHaveBeenCalledWith(
      true,
      BOSS_TRACK_URLS.grand_necromancer_velkhar,
    );
    expect(port.setBossCombat.mock.invocationCallOrder[0]).toBeLessThan(
      port.update.mock.invocationCallOrder[0],
    );
  });

  it('keeps the shared default loop for fights without a dedicated cue', () => {
    const port = {
      resetForDungeonEntry: vi.fn(),
      update: vi.fn(),
      setBossCombat: vi.fn(),
    };
    const controller = new InstanceMusicController(port);
    controller.update(input({ lastBossCombatEventAt: 19000 }));
    expect(port.setBossCombat).toHaveBeenLastCalledWith(true);
    expect(DEFAULT_BOSS_TRACK_URL).toBe('/audio/dungeon-boss-fight.mp3');
  });
});
