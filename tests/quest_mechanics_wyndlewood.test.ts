// The quest-credit mechanics Chapter One stands on: use an item on an object
// or a person (quests/quest_object_use.ts), area-bound gathering (the marked
// trees of one copse, quests/quest_credit.ts), quest catches
// (quests/quest_fishing_catch.ts) and quest standing (quest_standing_reward.ts).
import { describe, expect, it } from 'vitest';
import { QUESTS } from '../src/sim/data';
import { onNodeGatheredForQuests } from '../src/sim/quests/quest_credit';
import { questCatchFor, standsAtCatchSpot } from '../src/sim/quests/quest_fishing_catch';
import { questUseItemNeed } from '../src/sim/quests/quest_object_use';
import { Sim } from '../src/sim/sim';
import type { GatherNodeDef, QuestProgress } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';

function sim(): Sim {
  const s = new Sim({ seed: WORLD_SEED, playerClass: 'warrior' });
  s.player.level = 4;
  return s;
}
const meta = (s: Sim) => s.players.get(s.player.id)!;
function activate(s: Sim, questId: string): QuestProgress {
  const quest = QUESTS[questId];
  const qp: QuestProgress = { questId, counts: quest.objectives.map(() => 0), state: 'active' };
  meta(s).questLog.set(questId, qp);
  return qp;
}

describe('use an item on an object or a person', () => {
  it('lets a player pick up exactly what the pending uses still need', () => {
    const s = sim();
    const qp = activate(s, 'c1_d11_light_behind');
    expect(questUseItemNeed('c1_d11_light_behind', qp, 'c1_lantern_oil_cup')).toBe(3);
    qp.counts[0] = 2;
    expect(questUseItemNeed('c1_d11_light_behind', qp, 'c1_lantern_oil_cup')).toBe(1);
    // A kept item (the reusable cloth) is needed once however many patches remain.
    const cloth = activate(s, 'c1_16_pick_the_choir');
    expect(questUseItemNeed('c1_16_pick_the_choir', cloth, 'c1_dew_damp_cloth')).toBe(1);
  });

  it('refuses the object without the item, then spends it and yields the prize', () => {
    const s = sim();
    const qp = activate(s, 'c1_06_admiral_crabs');
    const pot = [...s.entities.values()].find((e) => e.objectItemId === 'c1_empty_crab_pot')!;
    s.player.pos.x = pot.pos.x;
    s.player.pos.z = pot.pos.z + 1;
    s.pickUpObject(pot.id);
    expect(qp.counts[0]).toBe(0);
    s.addItem('c1_bait_herring', 1);
    s.pickUpObject(pot.id);
    expect(qp.counts[0]).toBe(1);
    expect(s.countItem('c1_bait_herring')).toBe(0);
    expect(s.countItem('c1_salt_crumpled_hat')).toBe(1);
  });

  it('hands a delivery to its addressee only when the goods are carried', () => {
    const s = sim();
    const qp = activate(s, 'c1_d07_receipt_rivets');
    const brunna = [...s.entities.values()].find((e) => e.templateId === 'forgemistress_darva')!;
    s.player.pos.x = brunna.pos.x;
    s.player.pos.z = brunna.pos.z + 1;
    s.talkToNpc(brunna.id);
    expect(qp.counts[0]).toBe(0);
    // A counted delivery: two carried, two credited; the third finishes it.
    s.addItem('c1_rivet_packet', 2);
    s.talkToNpc(brunna.id);
    expect(qp.counts[0]).toBe(2);
    s.addItem('c1_rivet_packet', 1);
    s.talkToNpc(brunna.id);
    expect(qp.counts[0]).toBe(3);
    expect(s.countItem('c1_rivet_packet')).toBe(0);
  });
});

describe('area-bound gathering', () => {
  it('credits a node inside the ring and ignores one outside it', () => {
    const s = sim();
    const qp = activate(s, 'c1_d05_wood_oak');
    const node = (x: number, z: number): GatherNodeDef =>
      ({
        id: 'tree:1',
        zoneId: 'eastbrook_vale',
        type: 'wood',
        pos: { x, z },
        level: 1,
      }) as GatherNodeDef;
    onNodeGatheredForQuests(s.ctx, node(200, 200), 'wood_log', meta(s));
    expect(qp.counts[0]).toBe(0);
    onNodeGatheredForQuests(s.ctx, node(60, -100), 'wood_log', meta(s));
    expect(qp.counts[0]).toBe(1);
  });
});

describe('quest catches', () => {
  it('lands the catch only at its spot while a collect objective still wants it', () => {
    const s = sim();
    const spot = { itemId: 'c1_black_wick_knot', x: 0, z: 0, radius: 5 };
    expect(standsAtCatchSpot(spot, { x: 3, z: 3 })).toBe(true);
    expect(questCatchFor(meta(s), { x: 0, z: 0 }, [spot], () => 0)).toBeNull();
    activate(s, 'c1_02_beacon_lied');
    expect(questCatchFor(meta(s), { x: 0, z: 0 }, [spot], () => 0)).toBe('c1_black_wick_knot');
    expect(questCatchFor(meta(s), { x: 40, z: 0 }, [spot], () => 0)).toBeNull();
    expect(questCatchFor(meta(s), { x: 0, z: 0 }, [spot], () => 2)).toBeNull();
  });
});

// Stand the player beside the first spawned object of an item id and use it.
function useObject(s: Sim, itemId: string, nth = 0): void {
  const obj = [...s.entities.values()].filter((e) => e.objectItemId === itemId)[nth];
  expect(obj, itemId).toBeDefined();
  s.player.pos.x = obj.pos.x;
  s.player.pos.z = obj.pos.z + 1;
  s.pickUpObject(obj.id);
}
function talkTo(s: Sim, templateId: string): void {
  const npc = [...s.entities.values()].find((e) => e.templateId === templateId)!;
  s.player.pos.x = npc.pos.x;
  s.player.pos.z = npc.pos.z + 1;
  s.talkToNpc(npc.id);
}

describe('crafting stations (quests/quest_station_craft.ts)', () => {
  it('credits every use of one furnace, spending its inputs and handing over the output', () => {
    const s = sim();
    const qp = activate(s, 'c1_09_buckles_glory');
    useObject(s, 'c1_public_furnace');
    expect(qp.counts[1]).toBe(0);
    s.addItem('copper_ore', 6);
    useObject(s, 'c1_public_furnace');
    useObject(s, 'c1_public_furnace');
    expect(qp.counts[1]).toBe(2);
    expect(s.countItem('copper_ore')).toBe(0);
    expect(s.countItem('c1_copper_ingot')).toBe(2);
    // Full: a third use spends nothing.
    s.addItem('copper_ore', 3);
    useObject(s, 'c1_public_furnace');
    expect(s.countItem('copper_ore')).toBe(3);
    talkTo(s, 'forgemistress_darva');
    expect(qp.counts[2]).toBe(2);
    expect(s.countItem('c1_copper_ingot')).toBe(0);
  });

  it('cooks a batch from every input, then each bowl goes to its own person', () => {
    const s = sim();
    const qp = activate(s, 'c1_27_supper_despite');
    s.addItem('c1_brook_trout', 2);
    useObject(s, 'c1_inn_hearth');
    expect(qp.counts[0]).toBe(0);
    expect(s.countItem('c1_brook_trout')).toBe(2);
    s.addItem('c1_garden_carrot', 3);
    useObject(s, 'c1_inn_hearth');
    expect(qp.counts[0]).toBe(1);
    expect(s.countItem('c1_brook_trout')).toBe(0);
    expect(s.countItem('c1_garden_carrot')).toBe(0);
    expect(s.countItem('c1_supper_stew_bowl')).toBe(3);
    talkTo(s, 'marshal_redbrook');
    talkTo(s, 'forgemistress_darva');
    talkTo(s, 'herbalist_olvessa');
    expect(qp.counts.slice(1)).toEqual([1, 1, 1]);
    expect(s.countItem('c1_supper_stew_bowl')).toBe(0);
  });

  it("builds Nell's chest as the real housing storage chest", () => {
    const s = sim();
    const qp = activate(s, 'c1_22_place_you_keep');
    talkTo(s, 'forgemistress_darva');
    expect(s.countItem('c1_hinge_packet')).toBe(1);
    useObject(s, 'c1_pella_workbench');
    expect(qp.counts[2]).toBe(1);
    expect(s.countItem('furn_storage_chest')).toBe(1);
  });
});

describe('loaned tools', () => {
  it('fells the marked pines with the loan axe (kept) and racks the logs (spent)', () => {
    const s = sim();
    const qp = activate(s, 'c1_04_every_board');
    useObject(s, 'c1_loan_woodcutting_axe');
    expect(s.countItem('c1_loan_woodcutting_axe')).toBe(1);
    for (let i = 0; i < 4; i++) useObject(s, 'c1_marked_shore_pine', i);
    expect(qp.counts[1]).toBe(4);
    expect(s.countItem('c1_loan_woodcutting_axe')).toBe(1);
    expect(s.countItem('c1_shore_pine_log')).toBe(4);
    useObject(s, 'c1_timber_rack');
    expect(qp.counts[2]).toBe(1);
    expect(s.countItem('c1_shore_pine_log')).toBe(0);
  });
});

describe('quest catches on open sea', () => {
  it('opens a cast at the jetty only while the quest wants the catch, and lands it', async () => {
    const { QUEST_CATCH_SPOTS } = await import('../src/sim/content/chapter_one');
    const { questCatchWaterAhead, landQuestCatch } = await import(
      '../src/sim/quests/quest_fishing_catch'
    );
    const s = sim();
    const spot = QUEST_CATCH_SPOTS.find((c) => c.itemId === 'c1_shore_minnow')!;
    s.player.pos.x = spot.x;
    s.player.pos.z = spot.z;
    const facings = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);
    const anyWater = () =>
      facings.some((f) => {
        s.player.facing = f;
        return questCatchWaterAhead(s.ctx, s.player, meta(s), QUEST_CATCH_SPOTS) !== null;
      });
    // No quest: the sea stays unfishable.
    expect(anyWater()).toBe(false);
    const qp = activate(s, 'c1_03_fish_consulted');
    expect(anyWater()).toBe(true);
    for (let i = 0; i < 4; i++)
      expect(landQuestCatch(s.ctx, s.player, meta(s), QUEST_CATCH_SPOTS)).toBe(true);
    expect(s.countItem('c1_shore_minnow')).toBe(4);
    // Enough carried: the spot closes again.
    expect(landQuestCatch(s.ctx, s.player, meta(s), QUEST_CATCH_SPOTS)).toBe(false);
    expect(anyWater()).toBe(false);
    // The keep-net shows the catch (kept, for the turn-in).
    useObject(s, 'c1_keep_net');
    expect(qp.counts[2]).toBe(1);
    expect(s.countItem('c1_shore_minnow')).toBe(4);
  });
});

describe('Chapter One escorts (src/sim/escort.ts)', () => {
  for (const [escortId, questId] of [
    ['esc_c1_neris', 'c1_21_watch_cannot_see'],
    ['esc_c1_della', 'c1_17_della_long_way'],
  ] as const) {
    it(`${escortId} walks to its destination, fights through its ambush and credits ${questId}`, async () => {
      const { ESCORTS } = await import('../src/sim/data');
      const s = sim();
      const def = ESCORTS[escortId];
      const qp = activate(s, questId);
      const escortIndex = QUESTS[questId].objectives.findIndex((o) => o.type === 'escort');
      // Any talk objectives before the walk are not this test's business.
      QUESTS[questId].objectives.forEach((o, i) => {
        if (o.type === 'interact' && o.targetNpcId) qp.counts[i] = o.count;
      });
      const place = (x: number, z: number) => {
        const pos = s.groundPos(x, z);
        s.player.pos = { ...pos };
        s.player.prevPos = { ...pos };
      };
      place(def.start.x, def.start.z);
      s.interact();
      const escortee = () =>
        [...s.entities.values()].find(
          (e) => e.kind === 'mob' && e.templateId === def.npcMobId && !e.dead,
        );
      const walker = escortee();
      expect(walker, 'the escortee stands at the start').toBeTruthy();
      let ambushSeen = def.ambushes.length === 0;
      for (let i = 0; i < 240 * 20 && qp.counts[escortIndex] < 1; i++) {
        const ids = s.escortRuns.get(escortId)?.run?.ambushIds ?? [];
        for (const id of ids) {
          const mob = s.entities.get(id);
          if (!mob || mob.dead) continue;
          ambushSeen = true;
          mob.hp = 0;
          mob.dead = true;
          mob.respawnTimer = 99999;
        }
        const w = escortee();
        if (w) place(w.pos.x + 2, w.pos.z + 2);
        s.tick();
      }
      expect(ambushSeen, 'the ambush wave fired').toBe(true);
      expect(qp.counts[escortIndex]).toBe(1);
    }, 60_000);
  }
});
