// Gourdlight Eve's rotating dailies (data only; the rules live in
// src/sim/seasonal/gourdlight_dailies.ts). Each reset day while the event runs, Hester
// Gourdwick offers ONE of these: which one is decided by the realm's reset day (the
// server's calendar feeds `resetDay`; the sim never reads a clock), walking the pool in
// its authored order, so two days running never repeat and every errand comes round
// once in four days. (The owner removed trick-or-treat from the new world: the knock
// errand "A Door in Every Town" and the Boo! fright errand are gone with it.)
//
// Every errand pays one Gourdlight Treat Pouch (six sweets), never power. Their world pieces (the stray pumpkins round Old Thatchgrin's patch and the
// cursed candles in the towns) stand only while the event runs, are resolved against
// the live world (src/sim/seasonal_daily_sites.ts, never a coordinate here), and only a
// player on the errand sees or takes them (quest_gated_entity.ts: a collect objective's
// ground item is hidden off-quest).
import type { ItemDef, QuestDef, QuestObjective } from '../types';
import {
  GOURDLIGHT_DAILY_BASKETS_QUEST_ID,
  GOURDLIGHT_DAILY_FEATHERS_QUEST_ID,
  GOURDLIGHT_DAILY_PATCH_QUEST_ID,
  GOURDLIGHT_DAILY_POOL,
  GOURDLIGHT_DAILY_WICKS_QUEST_ID,
  GOURDLIGHT_EVE_ID,
  GOURDLIGHT_KEEPER_NPC_ID,
  GOURDLIGHT_TREAT_POUCH_ID,
} from './gourdlight_eve';

export {
  GOURDLIGHT_DAILY_BASKETS_QUEST_ID,
  GOURDLIGHT_DAILY_FEATHERS_QUEST_ID,
  GOURDLIGHT_DAILY_PATCH_QUEST_ID,
  GOURDLIGHT_DAILY_POOL,
  GOURDLIGHT_DAILY_WICKS_QUEST_ID,
};

/** The stray pumpkins round Old Thatchgrin's patch (the patch errand's ground items). */
export const PATCH_PUMPKIN_ID = 'thatchgrin_patch_pumpkin';
export const PATCH_PUMPKINS_WANTED = 5;
/** How many lie out round the patch, and on what ring from the field's centre (yards):
 *  past his dressed ring and past the farthest he ever notices a passer-by (the 20 yd
 *  aggro ceiling), so a low-level gatherer is never pulled into his fight. */
export const PATCH_PUMPKIN_SITES = Object.freeze({ count: 10, ring: [23, 31] as const });

/** The cursed candles: a green-flamed stub set at the foot of the towns' lamp posts. */
export const CURSED_CANDLE_ID = 'cursed_candle_stub';
export const CURSED_CANDLES_WANTED = 6;
/** Candles set out per event town (Eastbrook, Fenbridge, Highwatch). */
export const CURSED_CANDLES_PER_TOWN = 5;

/** The crows' feathers (Old Thatchgrin's Crowcall adds drop one each, on the errand). */
export const CROW_FEATHER_ID = 'gourdlight_crow_feather';
/** Three of the six crows his two Crowcalls bring each pull (at 80% and 40% health), so
 *  one full fight is always enough even when others kill some of the crows. */
export const CROW_FEATHERS_WANTED = 3;

/** The baskets errand: one townsperson in each event town (template ids; pinned to
 *  exist and stand in their town by tests/gourdlight_dailies.test.ts). */
export const GOURDLIGHT_BASKET_NPCS: readonly string[] = Object.freeze([
  'cook_marlow',
  'herbalist_yara',
  'loremaster_caddis',
]);

const POUCH_FOR_ALL: QuestDef['itemRewards'] = {
  warrior: GOURDLIGHT_TREAT_POUCH_ID,
  paladin: GOURDLIGHT_TREAT_POUCH_ID,
  hunter: GOURDLIGHT_TREAT_POUCH_ID,
  rogue: GOURDLIGHT_TREAT_POUCH_ID,
  priest: GOURDLIGHT_TREAT_POUCH_ID,
  shaman: GOURDLIGHT_TREAT_POUCH_ID,
  mage: GOURDLIGHT_TREAT_POUCH_ID,
  warlock: GOURDLIGHT_TREAT_POUCH_ID,
  druid: GOURDLIGHT_TREAT_POUCH_ID,
};

function daily(
  id: string,
  name: string,
  text: string,
  completionText: string,
  objectives: QuestObjective[],
): QuestDef {
  return {
    id,
    name,
    giverNpcId: GOURDLIGHT_KEEPER_NPC_ID,
    turnInNpcId: GOURDLIGHT_KEEPER_NPC_ID,
    text,
    completionText,
    objectives,
    xpReward: 0,
    copperReward: 0,
    itemRewards: POUCH_FOR_ALL,
    repeatable: true,
    dailyReset: true,
    seasonalEvent: GOURDLIGHT_EVE_ID,
    shareable: false,
  };
}

export const GOURDLIGHT_DAILY_QUESTS: Record<string, QuestDef> = {
  [GOURDLIGHT_DAILY_PATCH_QUEST_ID]: daily(
    GOURDLIGHT_DAILY_PATCH_QUEST_ID,
    'Pumpkins from the Patch',
    "Old Thatchgrin's patch past Boar Meadow is fat with pumpkins, and half of them have rolled out past his straw where a careful soul can reach them. Bring me five, $N. Stay wide of the old scarecrow himself. He counts every one.",
    'Five round ones, and not a bite out of any. That is pie for the whole Vale. Here, for your trouble.',
    [
      {
        type: 'collect',
        itemId: PATCH_PUMPKIN_ID,
        count: PATCH_PUMPKINS_WANTED,
        label: 'Patch Pumpkins',
      },
    ],
  ),
  [GOURDLIGHT_DAILY_WICKS_QUEST_ID]: daily(
    GOURDLIGHT_DAILY_WICKS_QUEST_ID,
    'Wicked Wicks',
    'Someone has been setting candles with green flames at the feet of our lamp posts. They burn without melting and they whisper when you turn your back. Snuff six of them for me, $N, in any of the three towns, and bring me the stubs.',
    'Six stubs, cold as frost. Whoever lit them will have to try harder than that. Take this, and wash your hands.',
    [
      {
        type: 'collect',
        itemId: CURSED_CANDLE_ID,
        count: CURSED_CANDLES_WANTED,
        label: 'Cursed candles snuffed',
      },
    ],
  ),
  [GOURDLIGHT_DAILY_FEATHERS_QUEST_ID]: daily(
    GOURDLIGHT_DAILY_FEATHERS_QUEST_ID,
    'Feathers for the Fire',
    "When Old Thatchgrin is pressed, he calls his crows down on whoever is beating at his straw. Their feathers burn green in a hearth, and I need three for tonight's bonfire. Find a fight at his patch, $N, and pluck them from his crows.",
    'Black as a moonless field, and they smell of smoke already. The bonfire will be a sight. Thank you.',
    [
      {
        type: 'collect',
        itemId: CROW_FEATHER_ID,
        count: CROW_FEATHERS_WANTED,
        label: 'Crow feathers',
      },
    ],
  ),
  [GOURDLIGHT_DAILY_BASKETS_QUEST_ID]: daily(
    GOURDLIGHT_DAILY_BASKETS_QUEST_ID,
    'Baskets for the Neighbours',
    'I fill a basket of sweets for an old friend in each town every Gourdlight Eve, and my knees are not what they were. Take them round for me, $N: Cook Marlow in Eastbrook, Yara the herbalist in Fenbridge, and Loremaster Caddis up in Highwatch.',
    'All three delivered, and I hear Marlow cried. He always cries. Here is a basket of your own.',
    [
      {
        type: 'interact',
        targetNpcId: 'cook_marlow',
        count: 1,
        label: 'Basket left with Cook Marlow',
      },
      {
        type: 'interact',
        targetNpcId: 'herbalist_yara',
        count: 1,
        label: 'Basket left with Yara the herbalist',
      },
      {
        type: 'interact',
        targetNpcId: 'loremaster_caddis',
        count: 1,
        label: 'Basket left with Loremaster Caddis',
      },
    ],
  ),
};

export const GOURDLIGHT_DAILY_ITEMS: Record<string, ItemDef> = {
  [PATCH_PUMPKIN_ID]: {
    id: PATCH_PUMPKIN_ID,
    name: 'Patch Pumpkin',
    kind: 'quest',
    seasonalEvent: GOURDLIGHT_EVE_ID,
    sellValue: 0,
    questId: GOURDLIGHT_DAILY_PATCH_QUEST_ID,
    noVendorSell: true,
  },
  [CURSED_CANDLE_ID]: {
    id: CURSED_CANDLE_ID,
    name: 'Cursed Candle Stub',
    kind: 'quest',
    seasonalEvent: GOURDLIGHT_EVE_ID,
    sellValue: 0,
    questId: GOURDLIGHT_DAILY_WICKS_QUEST_ID,
    noVendorSell: true,
  },
  [CROW_FEATHER_ID]: {
    id: CROW_FEATHER_ID,
    name: 'Gourdlight Crow Feather',
    kind: 'quest',
    seasonalEvent: GOURDLIGHT_EVE_ID,
    sellValue: 0,
    questId: GOURDLIGHT_DAILY_FEATHERS_QUEST_ID,
    noVendorSell: true,
  },
};
