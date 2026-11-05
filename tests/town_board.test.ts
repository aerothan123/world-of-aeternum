// The Eastbrook town quest board (src/sim/town_board/, content/chapter_one.ts):
// a deterministic daily rotation keyed on the realm-day cycle, accepted only at
// the board, turned in at the poster, once per day, paying XP, coin and standing.
import { describe, expect, it } from 'vitest';
import {
  boardDailyXp,
  EASTBROOK_BOARD_ID,
  TOWN_BOARD_DEFS,
  TOWN_BOARD_QUESTS,
} from '../src/sim/content/chapter_one';
import { NOTICEBOARDS } from '../src/sim/content/noticeboards';
import { NPCS, QUESTS } from '../src/sim/data';
import { npcQuestMarkerKind } from '../src/sim/quests/quest_marker_kind';
import { Sim } from '../src/sim/sim';
import {
  offDayTownBoardQuestIds,
  standsAtTownBoard,
  townBoardPostings,
  townBoardPostingsForCycle,
  townBoardQuestIds,
} from '../src/sim/town_board';
import { worldQuestCycleForResetDay } from '../src/sim/world_quest_rotation';
import { WORLD_SEED } from '../src/sim/world_seed';

const board = TOWN_BOARD_DEFS[0];
const cycle = (day: string) => worldQuestCycleForResetDay(day);

describe('town board rotation', () => {
  it('posts the same notices for the same day, distinct templates, on every host', () => {
    const a = townBoardPostings(EASTBROOK_BOARD_ID, cycle('2026-11-04'));
    const b = townBoardPostingsForCycle(board, cycle('2026-11-04'));
    expect(a).toEqual(b);
    expect(a).toHaveLength(board.postingsPerDay);
    const templates = a.map((id) => board.templates.find((t) => t.variants.includes(id))?.id);
    expect(new Set(templates).size).toBe(a.length);
  });

  it('rotates across days and reaches every posting within a season', () => {
    const seen = new Set<string>();
    const days = new Set<string>();
    for (let d = 1; d <= 60; d++) {
      const day = `2026-12-${String(((d - 1) % 28) + 1).padStart(2, '0')}`;
      const month = d > 28 ? '2027-01' : '2026-12';
      const iso = `${month}-${day.slice(-2)}`;
      const posted = townBoardPostings(EASTBROOK_BOARD_ID, cycle(iso));
      days.add(posted.join(','));
      for (const id of posted) seen.add(id);
    }
    expect(days.size).toBeGreaterThan(10);
    expect([...seen].sort()).toEqual(townBoardQuestIds(board).sort());
  });

  it('blocks exactly the off-day postings, and posts nothing without a day', () => {
    const c = cycle('2026-11-04');
    const posted = new Set(townBoardPostings(EASTBROOK_BOARD_ID, c));
    const off = new Set(offDayTownBoardQuestIds(c));
    for (const id of townBoardQuestIds(board)) expect(posted.has(id)).toBe(!off.has(id));
    expect(townBoardPostings(EASTBROOK_BOARD_ID, '')).toEqual([]);
  });

  it('defines every posting as a daily board quest with a real poster', () => {
    for (const id of townBoardQuestIds(board)) {
      const quest = QUESTS[id];
      expect(quest, id).toBe(TOWN_BOARD_QUESTS[id]);
      expect(quest.townBoard).toBe(EASTBROOK_BOARD_ID);
      expect(quest.repeatable && quest.dailyReset).toBe(true);
      expect(quest.shareable).toBe(false);
      expect(quest.requiresQuest).toBe('c1_08_vouch');
      expect(NPCS[quest.giverNpcId]?.questIds, id).toContain(id);
      expect(quest.turnInNpcId).toBe(quest.giverNpcId);
      expect(quest.xpReward).toBe(boardDailyXp(quest.minLevel ?? 1));
      expect(quest.standingReward?.amount).toBe(30);
      // The poster takes the turn-in but never offers the notice itself.
      expect(npcQuestMarkerKind(quest, quest.giverNpcId, 'available', new Set())).toBe('none');
      expect(npcQuestMarkerKind(quest, quest.giverNpcId, 'ready', new Set())).toBe('ready');
    }
  });

  it('accepts only at the board itself', () => {
    const def = NOTICEBOARDS.find((b) => b.id === EASTBROOK_BOARD_ID)!;
    const quest = { townBoard: EASTBROOK_BOARD_ID };
    expect(standsAtTownBoard(quest, { x: def.x, z: def.z + 2 })).toBe(true);
    expect(standsAtTownBoard(quest, { x: def.x + 40, z: def.z })).toBe(false);
    expect(standsAtTownBoard({}, { x: def.x, z: def.z })).toBe(false);
  });
});

describe('town board in the sim', () => {
  function ready(day: string): { sim: Sim; posted: string[] } {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
    sim.resetDay = day;
    sim.player.level = 4;
    sim.tick();
    const meta = sim.players.get(sim.player.id)!;
    meta.questsDone.add('c1_08_vouch');
    return { sim, posted: townBoardPostings(EASTBROOK_BOARD_ID, meta.worldQuestCycle) };
  }

  it('rolls the realm-day cycle below world-quest level, so the board has a day', () => {
    const { sim, posted } = ready('2026-11-04');
    const meta = sim.players.get(sim.player.id)!;
    expect(meta.worldQuestCycle).toBe(cycle('2026-11-04'));
    expect(posted.length).toBe(board.postingsPerDay);
  });

  it('offers today posting only at the board, and never an off-day one', () => {
    const { sim, posted } = ready('2026-11-04');
    const today = posted.find((id) => (QUESTS[id].minLevel ?? 1) <= 4)!;
    const off = offDayTownBoardQuestIds(cycle('2026-11-04'));
    expect(sim.questState(today)).toBe('available');
    for (const id of off) expect(sim.questState(id)).toBe('unavailable');
    const def = NOTICEBOARDS.find((b) => b.id === EASTBROOK_BOARD_ID)!;
    // Away from the board the posting is refused.
    sim.player.pos.x = def.x + 60;
    sim.player.pos.z = def.z;
    sim.acceptQuest(today);
    expect(sim.questState(today)).toBe('available');
    // At the board it is taken.
    sim.player.pos.x = def.x;
    sim.player.pos.z = def.z + 2;
    sim.acceptQuest(today);
    expect(sim.questState(today)).toBe('active');
  });

  it('locks a turned-in posting until the next daily reset, and pays standing', () => {
    const { sim, posted } = ready('2026-11-04');
    const meta = sim.players.get(sim.player.id)!;
    const id = posted.find((q) => (QUESTS[q].minLevel ?? 1) <= 4)!;
    const quest = QUESTS[id];
    meta.questLog.set(id, {
      questId: id,
      counts: quest.objectives.map((o) => o.count),
      state: 'ready',
    });
    const poster = [...sim.entities.values()].find((e) => e.templateId === quest.giverNpcId)!;
    sim.player.pos.x = poster.pos.x;
    sim.player.pos.z = poster.pos.z + 1;
    const before = meta.factions[quest.standingReward!.factionId];
    sim.turnInQuest(id);
    expect(meta.questsDone.has(id)).toBe(true);
    expect(meta.factions[quest.standingReward!.factionId]).toBe(before + 30);
    expect(sim.questState(id)).toBe('unavailable');
  });
});

describe('posting text matches its objective', () => {
  it('every posting over a run of days states the same count its objectives ask for', () => {
    const seen = new Set<string>();
    for (let day = 0; day < 60; day++) {
      for (const questId of townBoardPostings(EASTBROOK_BOARD_ID, `wq1_${day}`)) seen.add(questId);
    }
    // Every variant rolls within two months of days.
    for (const id of Object.keys(TOWN_BOARD_QUESTS)) expect(seen.has(id), id).toBe(true);
    for (const id of seen) {
      const quest = QUESTS[id];
      const stated = [...quest.text.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
      expect(stated.length, `${id} names a count`).toBeGreaterThan(0);
      for (const objective of quest.objectives) {
        for (const n of stated) expect(objective.count, `${id}: "${quest.text}"`).toBe(n);
      }
    }
  });
});
