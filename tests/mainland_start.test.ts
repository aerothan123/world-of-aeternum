// The mainland start (owner, 2026-11): the Proving Shore tutorial is retired,
// new characters start on the Eastbrook Vale mainland at the v2 design's player
// start, an easy level 1 to 2 wolf meadow lies a short walk east, Corren's
// first quest sends the player there and on into the chapter, and the live
// hosts (SimConfig.valeOnly) keep every character inside the vale the Unreal
// client draws (src/sim/vale_bounds.ts).

import { beforeAll, describe, expect, it } from 'vitest';
import { canObserveEntity } from '../server/entity_observation';
import { characterCreationTestSeam } from '../server/main';
import { campSpawnOffset } from '../src/sim/camp_scatter';
import { isBlocked } from '../src/sim/colliders';
import { CHAPTER_ONE_CAMPS, CHAPTER_ONE_QUESTS } from '../src/sim/content/chapter_one';
import { isOnProvingShore, PROVING_SHORE_ARRIVAL } from '../src/sim/content/proving_shore';
import { NPCS, PLAYER_START, QUESTS, zoneAt } from '../src/sim/data';
import { onMobKilledForQuests } from '../src/sim/quests/quest_credit';
import { resolveSavedPosExit, savedZoneId } from '../src/sim/saved_pos_exit';
import { Sim } from '../src/sim/sim';
import {
  distanceOutsideVale,
  isInValePlayArea,
  MAINLAND_START,
  questLeavesVale,
  VALE_PLAY_AREA,
  valeBlockedQuestIds,
  valeDungeonOpen,
} from '../src/sim/vale_bounds';
import { groundHeight, waterLevel, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const INTRO = 'c1_00_meadow_wolves';
const STARTER_CAMP = CHAPTER_ONE_CAMPS.find(
  (c) => c.mobId === 'forest_wolf' && c.center.x === -118 && c.center.z === -148,
);
const corren = NPCS.marshal_redbrook;

function dry(x: number, z: number): boolean {
  const h = groundHeight(x, z, WORLD_SEED);
  const lake = waterLevelAt(x, z, WORLD_SEED);
  return h >= waterLevel() + 0.4 && (lake === -Infinity || h >= lake + 0.4);
}

describe('mainland spawn', () => {
  it('rolls every created character at the mainland start, facing north up the lane', () => {
    for (const cls of ['warrior', 'mage', 'rogue', 'priest', 'paladin'] as const) {
      const state = characterCreationTestSeam.initialCharacterState(cls, 'Newborn', 0);
      expect(state.pos).toEqual({ x: MAINLAND_START.x, z: MAINLAND_START.z });
      expect(state.facing).toBe(0);
    }
    expect(MAINLAND_START).toMatchObject({ x: PLAYER_START.x, z: PLAYER_START.z });
  });

  it('stands on open, dry, flat vale ground, a short walk from the first quest giver', () => {
    const { x, z } = MAINLAND_START;
    expect(zoneAt(x, z)?.id).toBe('eastbrook_vale');
    expect(isInValePlayArea(x, z)).toBe(true);
    expect(isOnProvingShore(x, z)).toBe(false);
    expect(dry(x, z)).toBe(true);
    for (const [dx, dz] of [
      [0, 0],
      [1.5, 0],
      [-1.5, 0],
      [0, 1.5],
      [0, -1.5],
    ]) {
      expect(isBlocked(WORLD_SEED, x + dx, z + dz, 0.5), `blocked at ${dx},${dz}`).toBe(false);
    }
    const slope = Math.abs(groundHeight(x + 2, z, WORLD_SEED) - groundHeight(x - 2, z, WORLD_SEED));
    expect(slope).toBeLessThan(1);
    expect(Math.hypot(corren.pos.x - x, corren.pos.z - z)).toBeLessThan(60);
  });
});

describe('save relocation under the vale gate', () => {
  it('sends Proving Shore, Farshore, frontier and outside-door saves to the mainland start', () => {
    const shore = { x: PROVING_SHORE_ARRIVAL.x, z: PROVING_SHORE_ARRIVAL.z };
    const farshore = { x: 290, z: 86 };
    const frontier = { x: 500, z: -400 };
    const mirefen = { x: 0, z: 300 };
    for (const pos of [shore, farshore, frontier, mirefen]) {
      expect(resolveSavedPosExit(pos, 9999, true).pos, JSON.stringify(pos)).toBeNull();
      expect(resolveSavedPosExit(pos, 9999, false).pos).not.toBeNull();
    }
    expect(resolveSavedPosExit({ x: -10, z: -100 }, 9999, true).pos).toEqual({ x: -10, z: -100 });
    expect(savedZoneId(shore, 9999, true)).toBe('eastbrook_vale');
    expect(savedZoneId(shore, 9999, false)).toBe('proving_shore');
  });
});

describe('vale-only world', () => {
  let gated: Sim;
  beforeAll(() => {
    gated = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', valeOnly: true });
  });

  it('relocates an existing character saved on the Proving Shore to the mainland start on login', () => {
    const saved = gated.serializeCharacter(gated.playerId);
    if (!saved) throw new Error('no save');
    saved.pos = { x: PROVING_SHORE_ARRIVAL.x, z: PROVING_SHORE_ARRIVAL.z };
    const pid = gated.addPlayer('warrior', 'Islander', { state: saved });
    const body = gated.entities.get(pid);
    expect(body).toBeDefined();
    expect(Math.hypot(body!.pos.x - MAINLAND_START.x, body!.pos.z - MAINLAND_START.z)).toBeLessThan(
      2,
    );
  });

  it('spawns a new offline character on the mainland, never on the island', () => {
    const p = gated.player;
    expect(isOnProvingShore(p.pos.x, p.pos.z)).toBe(false);
    expect(Math.hypot(p.pos.x - MAINLAND_START.x, p.pos.z - MAINLAND_START.z)).toBeLessThan(2);
  });

  it('drops the old map cast outside the vale and the ferry bell twin inside it', () => {
    for (const e of gated.entities.values()) {
      if (e.kind === 'player' || e.pos.x > 50_000) continue;
      expect(distanceOutsideVale(e.pos.x, e.pos.z), `${e.kind} ${e.name}`).toBe(0);
      expect(e.objectItemId).not.toBe('ps_ferry_bell');
    }
    const npcIds = new Set([...gated.entities.values()].map((e) => e.templateId));
    expect(npcIds.has('ferryman_odo')).toBe(false);
    expect(npcIds.has('marshal_redbrook')).toBe(true);
  });

  it('keeps anything raised off the vale out of a vale-only snapshot', () => {
    const wolf = [...gated.entities.values()].find((e) => e.templateId === 'forest_wolf');
    if (!wolf) throw new Error('no wolf');
    const viewer = gated.player;
    expect(canObserveEntity(gated, viewer, wolf, 0)).toBe(true);
    const offVale = { ...wolf, pos: { ...wolf.pos, x: 120, z: 230 } };
    expect(canObserveEntity(gated, viewer, offVale, 0)).toBe(false);
    const open = new Sim({ seed: 7, playerClass: 'warrior', noPlayer: true });
    expect(canObserveEntity(open, viewer, offVale, 0)).toBe(true);
  });

  it('raises spirits only at the vale graveyards', () => {
    const yards = gated.ctx.graveyards;
    expect(yards.length).toBeGreaterThan(0);
    for (const g of yards) expect(isInValePlayArea(g.x, g.z)).toBe(true);
  });

  it('holds a stray at the vale edge and returns a far teleport to the mainland start', () => {
    const p = gated.player;
    p.pos = { ...p.pos, x: VALE_PLAY_AREA.xMin - 2, z: -20 };
    p.prevPos = { ...p.pos };
    gated.tick();
    expect(p.pos.x).toBeGreaterThanOrEqual(VALE_PLAY_AREA.xMin);
    p.pos = { ...p.pos, x: 300, z: 80 };
    p.prevPos = { ...p.pos };
    gated.tick();
    expect(Math.hypot(p.pos.x - MAINLAND_START.x, p.pos.z - MAINLAND_START.z)).toBeLessThan(2);
  });

  it('refuses the old dungeon slots and keeps the vale house lots open', () => {
    for (const id of [
      'sunken_bastion',
      'drowned_temple',
      'gravewyrm_sanctum',
      'nythraxis_crypt',
      'wildheart_basin',
      'nythraxis_boss_arena',
    ]) {
      expect(valeDungeonOpen({ valeOnly: true }, undefined, id), id).toBe(false);
      expect(valeDungeonOpen({ valeOnly: false }, undefined, id), id).toBe(true);
    }
    expect(valeDungeonOpen({ valeOnly: true }, undefined, 'house_eastbrook_quay_cottage')).toBe(
      true,
    );
    expect(gated.enterDungeon('sunken_bastion', gated.playerId)).toBe(false);
  });

  it('spawns the starter wolf meadow: five level 1 to 2 wolves on the ground', () => {
    expect(STARTER_CAMP).toBeDefined();
    const camp = STARTER_CAMP!;
    const wolves = [...gated.entities.values()].filter(
      (e) =>
        e.kind === 'mob' &&
        e.templateId === 'forest_wolf' &&
        Math.hypot(e.pos.x - camp.center.x, e.pos.z - camp.center.z) <= camp.radius + 1,
    );
    expect(wolves.length).toBe(5);
    for (const w of wolves) {
      expect(w.level).toBeGreaterThanOrEqual(1);
      expect(w.level).toBeLessThanOrEqual(2);
      expect(Math.abs(w.pos.y - groundHeight(w.pos.x, w.pos.z, WORLD_SEED))).toBeLessThan(1.5);
    }
  });
});

describe('starter wolf meadow placement', () => {
  it('sits a short walk from the start, on dry, clear vale ground', () => {
    const camp = STARTER_CAMP!;
    expect(camp.levelMin).toBe(1);
    expect(camp.levelMax).toBe(2);
    expect(camp.offStream).toBe(true);
    const walk = Math.hypot(camp.center.x - MAINLAND_START.x, camp.center.z - MAINLAND_START.z);
    expect(walk).toBeLessThan(120);
    for (let i = 0; i < camp.count; i++) {
      const o = campSpawnOffset(i, camp.count, camp.radius, 0, 0);
      const x = camp.center.x + o.x;
      const z = camp.center.z + o.z;
      expect(zoneAt(x, z)?.id).toBe('eastbrook_vale');
      expect(dry(x, z), `slot ${i} wet`).toBe(true);
      expect(isBlocked(WORLD_SEED, x, z, 0.5), `slot ${i} blocked`).toBe(false);
    }
  });
});

describe('intro quest', () => {
  it('is offered by Corren at level 1 and hands off into the chapter', () => {
    const q = QUESTS[INTRO];
    expect(q).toBe(CHAPTER_ONE_QUESTS[INTRO]);
    expect(q.giverNpcId).toBe('marshal_redbrook');
    expect(q.turnInNpcId).toBe('marshal_redbrook');
    expect(q.minLevel).toBeUndefined();
    expect(q.requiresQuest).toBeUndefined();
    expect(q.objectives).toEqual([
      { type: 'kill', targetMobId: 'forest_wolf', count: 5, label: 'Forest Wolf slain' },
    ]);
    expect(QUESTS.c1_08_vouch.requiresQuest).toBe(INTRO);
    expect(NPCS.marshal_redbrook.questIds).toContain(INTRO);
  });

  it('runs accept, five kills, turn-in, then opens Brother Aldric', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior' });
    const marshal = [...sim.entities.values()].find(
      (e) => e.kind === 'npc' && e.templateId === 'marshal_redbrook',
    );
    if (!marshal) throw new Error('no Corren');
    sim.player.pos = { ...marshal.pos };
    sim.player.prevPos = { ...sim.player.pos };
    expect(sim.player.level).toBe(1);
    expect(sim.questState(INTRO)).toBe('available');
    expect(sim.questState('c1_08_vouch')).toBe('unavailable');
    sim.acceptQuest(INTRO);
    const wolf = [...sim.entities.values()].find(
      (e) => e.kind === 'mob' && e.templateId === 'forest_wolf',
    );
    const meta = sim.players.get(sim.playerId);
    if (!wolf || !meta) throw new Error('no wolf');
    for (let i = 0; i < 4; i++) onMobKilledForQuests(sim.ctx, wolf, meta);
    expect(sim.questLog.get(INTRO)?.counts).toEqual([4]);
    onMobKilledForQuests(sim.ctx, wolf, meta);
    expect(sim.questLog.get(INTRO)?.state).toBe('ready');
    sim.turnInQuest(INTRO);
    expect(sim.questsDone.has(INTRO)).toBe(true);
    expect(sim.questState('c1_08_vouch')).toBe('available');
  });
});

describe('quests on the vale-only world', () => {
  it('keeps the whole mainland chapter on the vale and blocks the breadcrumbs that leave it', () => {
    const island = new Set([
      'c1_01_arrival',
      'c1_02_beacon_lied',
      'c1_03_fish_consulted',
      'c1_04_every_board',
      'c1_05_solid_underfoot',
      'c1_06_admiral_crabs',
      'c1_07_across',
    ]);
    for (const id of Object.keys(CHAPTER_ONE_QUESTS)) {
      expect(questLeavesVale(id), id).toBe(island.has(id));
    }
    const blocked = valeBlockedQuestIds({ valeOnly: true });
    expect(blocked).toContain('q_fenbridge_muster');
    expect(blocked.some((id) => id.startsWith('c1_'))).toBe(false);
    expect(valeBlockedQuestIds({ valeOnly: false })).toEqual([]);
  });
});
