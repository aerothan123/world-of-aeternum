// Chapter Two Act F (content/chapter_two_low_reaches.ts): the level 9 to 15
// road from Ferncross through Panwick, Elmhallow and Wheal Patience. The
// shared gated-bundle suite (chapter_two_content.test.ts) already holds every
// reference, XP size and coordinate; this pins what the act is FOR: the band
// it fills, the hand-offs that carry a player from hub to hub, the giver
// plots, and the zone-local creatures that make each zone's kills count only
// there.
import { describe, expect, it } from 'vitest';
import {
  CHAPTER_TWO_LOW_REACHES as ACT,
  LR_LODGE_KEEPER,
  LR_MINE_CAPTAIN,
  LR_PAN_REEVE,
} from '../src/sim/content/chapter_two_low_reaches';
import { CAMPS, MOBS, NPCS, QUESTS, zoneAt } from '../src/sim/data';
import { FRONTIER_HUB_PLOTS } from '../src/sim/frontier/hub_plots';
import { spreadPoint } from '../src/sim/frontier/spread';

const quests = Object.values(ACT.quests);
const zoneOfNpc = (id: string) => zoneAt(NPCS[id].pos.x, NPCS[id].pos.z).id;

describe('Chapter Two Act F: the Low Reaches road', () => {
  it('is merged into the live tables', () => {
    for (const q of quests) expect(QUESTS[q.id], q.id).toBe(q);
    for (const id of Object.keys(ACT.mobs)) expect(MOBS[id], id).toBeDefined();
  });

  it('fills the 9 to 15 band with at least two quests a level', () => {
    const per = new Map<number, number>();
    for (const q of quests) per.set(q.minLevel ?? 0, (per.get(q.minLevel ?? 0) ?? 0) + 1);
    for (let level = 9; level <= 15; level++) {
      expect(per.get(level) ?? 0, `level ${level}`).toBeGreaterThanOrEqual(2);
    }
    expect(quests.length).toBeGreaterThanOrEqual(25);
    expect(quests.every((q) => (q.minLevel ?? 0) >= 9 && (q.minLevel ?? 0) <= 15)).toBe(true);
  });

  it('gives work in every zone it stands in', () => {
    const zones = new Set(quests.map((q) => zoneOfNpc(q.giverNpcId)));
    expect([...zones].sort()).toEqual([...ACT.zoneIds].sort());
  });

  it('hands the player on from hub to hub with a talk quest into the next zone', () => {
    const handoffs = quests.filter((q) => zoneOfNpc(q.giverNpcId) !== zoneOfNpc(q.turnInNpcId));
    const targets = handoffs.map((q) => q.turnInNpcId).sort();
    expect(targets).toEqual([LR_LODGE_KEEPER, LR_MINE_CAPTAIN, LR_PAN_REEVE].sort());
    for (const q of handoffs) {
      expect(
        q.objectives.some((o) => o.type === 'interact' && o.targetNpcId === q.turnInNpcId),
      ).toBe(true);
      // Each hand-off comes at the end of its zone's chain.
      expect(q.requiresQuest, q.id).toBeDefined();
    }
  });

  it('mixes kill, collect, interact and escort objectives', () => {
    const types = new Set(quests.flatMap((q) => q.objectives.map((o) => o.type)));
    for (const t of ['kill', 'collect', 'interact', 'escort'])
      expect(types.has(t as never), t).toBe(true);
  });

  it('stands every giver on a frontier hub plot of its zone', () => {
    const plots = FRONTIER_HUB_PLOTS.flatMap((h) =>
      // plots are authored; the live NPCs stand where the frontier spread put them
      h.givers.map((p) => ({ ...spreadPoint(p.x, p.z), zone: h.zoneId })),
    );
    for (const npc of Object.values(ACT.npcs)) {
      const plot = plots.find((p) => p.x === npc.pos.x && p.z === npc.pos.z);
      expect(plot, npc.id).toBeDefined();
      expect(plot?.zone, npc.id).toBe(zoneAt(npc.pos.x, npc.pos.z).id);
    }
  });

  it('kills only zone-local creatures that a camp of the act spawns, at the quest level', () => {
    for (const q of quests) {
      for (const o of q.objectives) {
        if (o.type !== 'kill') continue;
        const mob = ACT.mobs[o.targetMobId];
        expect(mob, `${q.id} ${o.targetMobId}`).toBeDefined();
        const camps = CAMPS.filter((c) => c.mobId === o.targetMobId);
        expect(camps.length, o.targetMobId).toBeGreaterThan(0);
        for (const c of camps) {
          expect(zoneAt(c.center.x, c.center.z).id).toBe(zoneOfNpc(q.giverNpcId));
        }
        expect(Math.abs(mob.maxLevel - (q.minLevel ?? 0)), q.id).toBeLessThanOrEqual(1);
      }
    }
  });
});
