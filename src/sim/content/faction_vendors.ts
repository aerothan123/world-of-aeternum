// Faction Quartermasters, the World Quest Taskmaster, and the standing-gated
// vendor ladder. Deterministic simulation content leaf: pure data structures
// and gate resolution. Zero RNG, zero wall-clock, zero DOM/Three.js imports.
//
// THE LADDER (docs/design/wyndlewood-faction-ladder.md section 5, the owner's
// Wyndlewood decision): faction rewards never give raw power above what quests
// give. The ladders were authored for the provisional factions at the heroic
// and raid budgets and passed whole to their Wyndlewood successors
// (src/sim/factions.ts LEGACY_FACTION_IDS); item ids are frozen, so a row's id
// may still name its first owner, and every equipment row was re-statted DOWN
// to the quest tier: the level-20 quest reward budget for its slot
// (FACTION_GEAR_ITEM_LEVEL = 20 + the rare bump, item_budget.ts
// primaryStatBudget), its own stat ratio kept, every secondary rating, Spell
// Power and proc removed, rare quality, armor from the level-20 quest
// catalog, weapons on weaponDpsBudget. The tier lanes stay (a neck, a ring and
// a bag, the periphery and formulas, a weapon, jewels), so a quartermaster
// still fills empty slots on the day a tier opens; the value above that lives
// in titles (the Champion deeds), the toys and the mount. Furniture stays a
// crafted good (tests/vendor_floor.test.ts: crafted pieces are never also
// vendor stock), so faction furniture waits for faction-only patterns.
//   Gilt Measure          Agility (rogue, hunter); was the Rift Watch's
//   Lanternwardens        casters and healers; was the Church Order's
//   Hearthwright Compact  Strength and the stamina line; was the Automatons'
//   Bracken Circle        the allied rows only for now: its own ladder is a
//                         follow-up (docs/narrative/wyndlewood_decisions.md)
// Item ids shipped in the golden (tests/shipped_item_ids.golden.json) are
// never deleted: the first-cut ids keep their slot and were re-statted.
//
// PRICE. Every row is bought with the selling faction's marks (earned from its
// World Quests), never coin: buyValue is 0 and the gate carries the mark cost
// (the Valestrider reins included: their def lives in content/items.ts with
// buyValue 0, and they cost MOUNT_MARKS, above every other Champion row),
// one figure per standing tier (MARKS below), formulas and recipes a step
// under the gear of their tier. The allied rows (Cartographer's Ink, the
// Allied Hearthstone and the Vanguard Duffel) carry no faction: every
// quartermaster sells them for its own marks, gated on the best standing.

import type { FactionId, StandingTier } from '../factions';
import { STANDING_THRESHOLDS } from '../factions';
import { FENBRIDGE_NPC_PLACEMENTS_BY_ID } from '../fenbridge_layout';
import { QUALITY_ILVL_BONUS } from '../item_budget';
import { DRIFTHAVEN_NPC_PLACEMENTS_BY_ID } from '../painted_towns';
import type { ItemDef, NpcDef } from '../types';

/** The quest tier faction gear is capped at: the level-20 quest reward plus
 *  the rare quality bump (docs/design/wyndlewood-faction-ladder.md section 5). */
export const FACTION_GEAR_SOURCE_LEVEL = 20;
export const FACTION_GEAR_ITEM_LEVEL = FACTION_GEAR_SOURCE_LEVEL + QUALITY_ILVL_BONUS.rare;

export interface FactionVendorGate {
  /** Absent on an allied row: any quartermaster sells it, gated on the best standing. */
  readonly factionId?: FactionId;
  readonly standingTier: StandingTier;
  readonly requiredStanding: number;
  /** Marks of the selling faction the row costs. */
  readonly currencyCost: number;
}

/** Mark cost per standing tier for gear, bags and weapons. */
const MARKS: Readonly<Record<StandingTier, number>> = Object.freeze({
  unknown: 0,
  recognized: 15,
  trusted: 35,
  proven: 75,
  vanguard: 150,
  champion: 200,
});
/** Formulas, recipes, plans and schematics: a step under the gear of their tier. */
const FORMULA_MARKS = 50;
/** Trusted-tier toys (the glider, the target dummy, the battle standard). */
const TOY_MARKS = 40;
/** The Champion mount (the Viridian Valestrider): the ladder's headline reward. */
const MOUNT_MARKS = 500;

function gate(
  factionId: FactionId | undefined,
  standingTier: StandingTier,
  currencyCost: number = MARKS[standingTier],
): FactionVendorGate {
  return Object.freeze({
    ...(factionId ? { factionId } : {}),
    standingTier,
    requiredStanding: STANDING_THRESHOLDS[standingTier],
    currencyCost,
  });
}

/** Gate requirements for every faction-stocked row, by item id. */
export const FACTION_VENDOR_GATES: Readonly<Record<string, FactionVendorGate>> = Object.freeze({
  // Rift Watch
  tidewatchers_locket: gate('gilt_measure', 'recognized'),
  rift_watchers_band: gate('gilt_measure', 'trusted'),
  rift_surveyors_satchel: gate('gilt_measure', 'trusted'),
  rift_feather_glider: gate('gilt_measure', 'trusted', TOY_MARKS),
  riftwalkers_tunic: gate('gilt_measure', 'proven'),
  riftwalkers_cord: gate('gilt_measure', 'proven'),
  riftwalkers_treads: gate('gilt_measure', 'proven'),
  formula_riftwalkers_grace: gate('gilt_measure', 'proven', FORMULA_MARKS),
  formula_enchant_feet_shadowstride: gate('gilt_measure', 'proven', FORMULA_MARKS),
  recipe_potion_of_invisibility: gate('gilt_measure', 'proven', FORMULA_MARKS),
  pattern_reinforced_armor_kit: gate('gilt_measure', 'proven', FORMULA_MARKS),
  riftwarden_voidblade: gate('gilt_measure', 'vanguard'),
  champion_rift_band: gate('gilt_measure', 'champion'),
  riftwardens_pendant: gate('gilt_measure', 'champion'),
  // The mount is bought with marks like every other row, at its own figure.
  reins_avian_strider: gate('gilt_measure', 'champion', MOUNT_MARKS),

  // Church Order
  order_prayer_beads: gate('lanternwardens', 'recognized'),
  acolytes_signet: gate('lanternwardens', 'trusted'),
  dawn_battle_standard: gate('lanternwardens', 'trusted', TOY_MARKS),
  vestments_of_the_acolyte: gate('lanternwardens', 'proven'),
  cord_of_the_dawn: gate('lanternwardens', 'proven'),
  dawnlit_slippers: gate('lanternwardens', 'proven'),
  formula_dawnfire_etching: gate('lanternwardens', 'proven', FORMULA_MARKS),
  formula_dawns_benediction: gate('lanternwardens', 'proven', FORMULA_MARKS),
  formula_enchant_offhand_spirit: gate('lanternwardens', 'proven', FORMULA_MARKS),
  recipe_elixir_of_mana_regeneration: gate('lanternwardens', 'proven', FORMULA_MARKS),
  dawnkeeper_consecrated_mace: gate('lanternwardens', 'vanguard'),
  templar_dawn_shield: gate('lanternwardens', 'vanguard'),
  champion_dawn_medallion: gate('lanternwardens', 'champion'),
  champions_dawn_loop: gate('lanternwardens', 'champion'),
  dawnkeepers_circle: gate('lanternwardens', 'champion'),

  // Automatons
  cogwork_choker: gate('hearthwright_compact', 'recognized'),
  automaton_cog_ring: gate('hearthwright_compact', 'trusted'),
  clockwork_tinkers_pack: gate('hearthwright_compact', 'trusted'),
  clockwork_target_dummy: gate('hearthwright_compact', 'trusted', TOY_MARKS),
  artificers_welding_cowl: gate('hearthwright_compact', 'proven'),
  forgemasters_girdle: gate('hearthwright_compact', 'proven'),
  forgemasters_sabatons: gate('hearthwright_compact', 'proven'),
  formula_piston_drive: gate('hearthwright_compact', 'proven', FORMULA_MARKS),
  formula_enchant_gloves_forged_might: gate('hearthwright_compact', 'proven', FORMULA_MARKS),
  schematic_clockwork_shock_bomb: gate('hearthwright_compact', 'proven', FORMULA_MARKS),
  plans_dense_sharpening_stone: gate('hearthwright_compact', 'proven', FORMULA_MARKS),
  forgemaster_crag_cleaver: gate('hearthwright_compact', 'vanguard'),
  champion_forged_loop: gate('hearthwright_compact', 'champion'),
  forgewall_gorget: gate('hearthwright_compact', 'champion'),

  // Allied rows: every quartermaster, its own marks, the best standing.
  cartographers_ink: gate(undefined, 'recognized', 60),
  allied_hearthstone: gate(undefined, 'vanguard', 100),
  allied_vanguard_duffel: gate(undefined, 'vanguard', 120),
});

export interface FactionVendorRowGateState {
  readonly locked: boolean;
  readonly requirement?: FactionVendorGate;
  readonly currentStanding?: number;
}

/** Check if an item has a faction standing requirement and whether the player meets it. */
export function resolveFactionVendorRowGate(
  itemId: string,
  factions: Readonly<Record<FactionId, number>> | undefined,
): FactionVendorRowGateState {
  if (!Object.hasOwn(FACTION_VENDOR_GATES, itemId)) {
    return { locked: false };
  }
  const requirement = FACTION_VENDOR_GATES[itemId];
  const currentStanding = requirement.factionId
    ? (factions?.[requirement.factionId] ?? 0)
    : Math.max(0, ...(Object.values(factions ?? {}) as number[]));
  const locked = currentStanding < requirement.requiredStanding;
  return { locked, requirement, currentStanding };
}

// Coin value per standing tier, in copper (50s, 1g50, 3g50, 8g, 15g). Rows are
// bought with marks (buyValue 0); a vendor buys one back at a quarter of this.
const PRICE: Readonly<Record<StandingTier, number>> = Object.freeze({
  unknown: 0,
  recognized: 5_000,
  trusted: 15_000,
  proven: 35_000,
  vanguard: 80_000,
  champion: 150_000,
});
const sell = (tier: StandingTier) => PRICE[tier] / 4;

/** The faction vendor stock authored HERE (32 rows: 28 equipment and bag rows + 4
 *  formulas); the Rift Watch ladder also sells the Valestrider reins from
 *  content/items.ts. */
export const FACTION_VENDOR_ITEMS: Record<string, ItemDef> = {
  // Every equipment row sits on the quest tier (FACTION_GEAR_ITEM_LEVEL, the
  // level-20 quest reward plus the rare bump): primaryStatBudget for its slot
  // with the row's own stat ratio, no secondary ratings, no Spell Power, no
  // proc, rare quality, quest-catalog armor, weapons on weaponDpsBudget.
  // tests/faction_vendors.test.ts pins every row to that formula.
  // ------------------------------------------------------------------ Rift Watch
  tidewatchers_locket: {
    id: 'tidewatchers_locket',
    name: "Tidewatcher's Locket",
    kind: 'armor',
    slot: 'neck',
    quality: 'rare',
    stats: { agi: 5, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('recognized'),
    buyValue: 0,
  },
  rift_watchers_band: {
    id: 'rift_watchers_band',
    name: "Rift Watcher's Band",
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    stats: { agi: 5, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('trusted'),
    buyValue: 0,
  },
  rift_surveyors_satchel: {
    id: 'rift_surveyors_satchel',
    name: "Rift Surveyor's Satchel",
    kind: 'bag',
    bagSlots: 14,
    quality: 'uncommon',
    soulbound: true,
    sellValue: sell('trusted'),
    buyValue: 0,
  },
  riftwalkers_tunic: {
    id: 'riftwalkers_tunic',
    name: "Riftwalker's Tunic",
    kind: 'armor',
    slot: 'chest',
    armorType: 'leather',
    quality: 'rare',
    stats: { armor: 130, agi: 8, sta: 5 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  riftwalkers_cord: {
    id: 'riftwalkers_cord',
    name: "Riftwalker's Cord",
    kind: 'armor',
    slot: 'waist',
    armorType: 'leather',
    quality: 'rare',
    stats: { armor: 83, agi: 6, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  riftwalkers_treads: {
    id: 'riftwalkers_treads',
    name: "Riftwalker's Treads",
    kind: 'armor',
    slot: 'feet',
    armorType: 'leather',
    quality: 'rare',
    stats: { armor: 73, agi: 5, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  formula_riftwalkers_grace: {
    id: 'formula_riftwalkers_grace',
    name: "Formula: Riftwalker's Grace",
    kind: 'recipe',
    teachesRecipeId: 'enchant_weapon_riftwalkers_grace',
    teachesEnchantId: 'enchant_weapon_riftwalkers_grace',
    quality: 'epic',
    sellValue: 0,
    buyValue: 0,
    noVendorSell: true,
  },
  riftwarden_voidblade: {
    id: 'riftwarden_voidblade',
    name: "Riftwarden's Voidblade",
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'rare',
    weapon: { min: 17, max: 26, speed: 1.6 },
    stats: { agi: 8, sta: 5 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('vanguard'),
    buyValue: 0,
    requiredClass: ['warrior', 'rogue', 'hunter', 'shaman'],
  },
  champion_rift_band: {
    id: 'champion_rift_band',
    name: "Champion's Rift Band",
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    stats: { agi: 4, sta: 4 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('champion'),
    buyValue: 0,
  },
  riftwardens_pendant: {
    id: 'riftwardens_pendant',
    name: "Riftwarden's Pendant",
    kind: 'armor',
    slot: 'neck',
    quality: 'rare',
    stats: { agi: 4, sta: 4 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('champion'),
    buyValue: 0,
  },

  // ---------------------------------------------------------------- Church Order
  order_prayer_beads: {
    id: 'order_prayer_beads',
    name: 'Order Prayer Beads',
    kind: 'armor',
    slot: 'neck',
    quality: 'rare',
    stats: { sta: 2, int: 3, spi: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('recognized'),
    buyValue: 0,
  },
  acolytes_signet: {
    id: 'acolytes_signet',
    name: "Acolyte's Signet",
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    stats: { sta: 2, int: 4, spi: 2 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('trusted'),
    buyValue: 0,
  },
  vestments_of_the_acolyte: {
    id: 'vestments_of_the_acolyte',
    name: 'Vestments of the Acolyte',
    kind: 'armor',
    slot: 'chest',
    armorType: 'cloth',
    quality: 'rare',
    stats: { armor: 68, sta: 3, int: 5, spi: 5 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  cord_of_the_dawn: {
    id: 'cord_of_the_dawn',
    name: 'Cord of the Dawn',
    kind: 'armor',
    slot: 'waist',
    armorType: 'cloth',
    quality: 'rare',
    stats: { armor: 48, sta: 3, int: 4, spi: 2 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  dawnlit_slippers: {
    id: 'dawnlit_slippers',
    name: 'Dawnlit Slippers',
    kind: 'armor',
    slot: 'feet',
    armorType: 'cloth',
    quality: 'rare',
    stats: { armor: 45, sta: 2, int: 3, spi: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  formula_dawnfire_etching: {
    id: 'formula_dawnfire_etching',
    name: 'Formula: Dawnfire Etching',
    kind: 'recipe',
    teachesRecipeId: 'enchant_weapon_dawnfire_etching',
    teachesEnchantId: 'enchant_weapon_dawnfire_etching',
    quality: 'epic',
    sellValue: 0,
    buyValue: 0,
    noVendorSell: true,
  },
  formula_dawns_benediction: {
    id: 'formula_dawns_benediction',
    name: "Formula: Dawn's Benediction",
    kind: 'recipe',
    teachesRecipeId: 'enchant_weapon_dawns_benediction',
    teachesEnchantId: 'enchant_weapon_dawns_benediction',
    quality: 'epic',
    sellValue: 0,
    buyValue: 0,
    noVendorSell: true,
  },
  dawnkeeper_consecrated_mace: {
    id: 'dawnkeeper_consecrated_mace',
    name: "Dawnkeeper's Consecrated Mace",
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'rare',
    weapon: { min: 26, max: 39, speed: 2.4 },
    stats: { sta: 4, int: 5, spi: 4 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('vanguard'),
    buyValue: 0,
    requiredClass: ['priest', 'paladin', 'shaman', 'druid'],
  },
  templar_dawn_shield: {
    id: 'templar_dawn_shield',
    name: "Templar's Dawn Shield",
    kind: 'armor',
    slot: 'offhand',
    armorType: 'mail',
    shield: true,
    blockValue: 22,
    quality: 'rare',
    stats: { armor: 380, sta: 3, int: 4, spi: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('vanguard'),
    buyValue: 0,
    requiredClass: ['paladin', 'shaman'],
  },
  champion_dawn_medallion: {
    id: 'champion_dawn_medallion',
    name: "Champion's Dawn Medallion",
    kind: 'armor',
    slot: 'neck',
    quality: 'rare',
    stats: { sta: 2, int: 4, spi: 2 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('champion'),
    buyValue: 0,
  },
  champions_dawn_loop: {
    id: 'champions_dawn_loop',
    name: "Champion's Dawn Loop",
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    stats: { sta: 2, int: 4, spi: 2 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('champion'),
    buyValue: 0,
  },
  dawnkeepers_circle: {
    id: 'dawnkeepers_circle',
    name: "Dawnkeeper's Circle",
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    stats: { sta: 2, int: 3, spi: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('champion'),
    buyValue: 0,
  },

  // ------------------------------------------------------------------ Automatons
  cogwork_choker: {
    id: 'cogwork_choker',
    name: 'Cogwork Choker',
    kind: 'armor',
    slot: 'neck',
    quality: 'rare',
    stats: { str: 5, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('recognized'),
    buyValue: 0,
  },
  automaton_cog_ring: {
    id: 'automaton_cog_ring',
    name: 'Automaton Cog Ring',
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    stats: { str: 5, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('trusted'),
    buyValue: 0,
  },
  clockwork_tinkers_pack: {
    id: 'clockwork_tinkers_pack',
    name: "Clockwork Tinker's Pack",
    kind: 'bag',
    bagSlots: 14,
    quality: 'uncommon',
    soulbound: true,
    sellValue: sell('trusted'),
    buyValue: 0,
  },
  artificers_welding_cowl: {
    id: 'artificers_welding_cowl',
    name: "Artificer's Welding Cowl",
    kind: 'armor',
    slot: 'helmet',
    armorType: 'mail',
    quality: 'rare',
    stats: { armor: 151, str: 6, sta: 5 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  forgemasters_girdle: {
    id: 'forgemasters_girdle',
    name: "Forgemaster's Girdle",
    kind: 'armor',
    slot: 'waist',
    armorType: 'mail',
    quality: 'rare',
    stats: { armor: 124, str: 6, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  forgemasters_sabatons: {
    id: 'forgemasters_sabatons',
    name: "Forgemaster's Sabatons",
    kind: 'armor',
    slot: 'feet',
    armorType: 'mail',
    quality: 'rare',
    stats: { armor: 110, str: 5, sta: 3 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('proven'),
    buyValue: 0,
  },
  formula_piston_drive: {
    id: 'formula_piston_drive',
    name: 'Formula: Piston Drive',
    kind: 'recipe',
    teachesRecipeId: 'enchant_weapon_piston_drive',
    teachesEnchantId: 'enchant_weapon_piston_drive',
    quality: 'epic',
    sellValue: 0,
    buyValue: 0,
    noVendorSell: true,
  },
  forgemaster_crag_cleaver: {
    id: 'forgemaster_crag_cleaver',
    name: "Forgemaster's Crag Cleaver",
    kind: 'weapon',
    slot: 'mainhand',
    hand: 'twohand',
    quality: 'rare',
    weapon: { min: 42, max: 64, speed: 3.4 },
    stats: { str: 10, sta: 7 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('vanguard'),
    buyValue: 0,
    requiredClass: ['warrior', 'paladin', 'shaman', 'hunter'],
  },
  champion_forged_loop: {
    id: 'champion_forged_loop',
    name: "Champion's Forged Loop",
    kind: 'armor',
    slot: 'ring',
    quality: 'rare',
    stats: { str: 2, sta: 6 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('champion'),
    buyValue: 0,
  },
  forgewall_gorget: {
    id: 'forgewall_gorget',
    name: 'Forgewall Gorget',
    kind: 'armor',
    slot: 'neck',
    quality: 'rare',
    stats: { str: 2, sta: 6 },
    requiredLevel: 20,
    soulbound: true,
    sellValue: sell('champion'),
    buyValue: 0,
  },
  // Blaine's quartermaster extras: toys, recipes, formulas, plans, their
  // crafted outputs, and the allied rows.
  rift_feather_glider: {
    id: 'rift_feather_glider',
    name: 'Rift Feather Glider',
    kind: 'tool',
    quality: 'rare',
    unique: true,
    use: { type: 'riftGlider' },
    sellValue: 6250,
    buyValue: 0,
  },
  formula_enchant_feet_shadowstride: {
    id: 'formula_enchant_feet_shadowstride',
    name: 'Formula: Enchant Boots - Shadowstride',
    kind: 'recipe',
    quality: 'uncommon',
    teachesRecipeId: 'enchant_feet_shadowstride',
    teachesEnchantId: 'enchant_feet_shadowstride',
    sellValue: 0,
    buyValue: 0,
  },
  recipe_potion_of_invisibility: {
    id: 'recipe_potion_of_invisibility',
    name: 'Recipe: Potion of Invisibility',
    kind: 'recipe',
    quality: 'rare',
    teachesRecipeId: 'recipe_potion_of_invisibility',
    sellValue: 0,
    buyValue: 0,
  },
  potion_of_invisibility: {
    id: 'potion_of_invisibility',
    name: 'Potion of Invisibility',
    kind: 'potion',
    quality: 'rare',
    use: { type: 'invisibility' },
    stackSize: 20,
    sellValue: 35,
    buyValue: 150,
  },
  pattern_reinforced_armor_kit: {
    id: 'pattern_reinforced_armor_kit',
    name: 'Pattern: Reinforced Armor Kit',
    kind: 'recipe',
    quality: 'uncommon',
    teachesRecipeId: 'pattern_reinforced_armor_kit',
    sellValue: 0,
    buyValue: 0,
  },
  reinforced_armor_kit: {
    id: 'reinforced_armor_kit',
    name: 'Reinforced Armor Kit',
    kind: 'tool',
    quality: 'uncommon',
    use: { type: 'armorKit' },
    stackSize: 20,
    sellValue: 30,
    buyValue: 120,
  },
  dawn_battle_standard: {
    id: 'dawn_battle_standard',
    name: 'Dawn Battle Standard',
    kind: 'tool',
    quality: 'rare',
    unique: true,
    use: { type: 'dawnStandard' },
    sellValue: 6250,
    buyValue: 0,
  },
  formula_enchant_offhand_spirit: {
    id: 'formula_enchant_offhand_spirit',
    name: 'Formula: Enchant Off-Hand - Spirit',
    kind: 'recipe',
    quality: 'uncommon',
    teachesRecipeId: 'enchant_offhand_spirit',
    teachesEnchantId: 'enchant_offhand_spirit',
    sellValue: 0,
    buyValue: 0,
  },
  recipe_elixir_of_mana_regeneration: {
    id: 'recipe_elixir_of_mana_regeneration',
    name: 'Recipe: Elixir of Mana Regeneration',
    kind: 'recipe',
    quality: 'uncommon',
    teachesRecipeId: 'recipe_elixir_of_mana_regeneration',
    sellValue: 0,
    buyValue: 0,
  },
  elixir_of_mana_regeneration: {
    id: 'elixir_of_mana_regeneration',
    name: 'Elixir of Mana Regeneration',
    kind: 'potion',
    quality: 'uncommon',
    use: { type: 'manaElixir' },
    stackSize: 20,
    sellValue: 20,
    buyValue: 100,
  },
  clockwork_target_dummy: {
    id: 'clockwork_target_dummy',
    name: 'Clockwork Target Dummy',
    kind: 'tool',
    quality: 'rare',
    unique: true,
    use: { type: 'targetDummy' },
    sellValue: 6250,
    buyValue: 0,
  },
  schematic_clockwork_shock_bomb: {
    id: 'schematic_clockwork_shock_bomb',
    name: 'Schematic: Clockwork Shock Bomb',
    kind: 'recipe',
    quality: 'rare',
    teachesRecipeId: 'schematic_clockwork_shock_bomb',
    sellValue: 0,
    buyValue: 0,
  },
  clockwork_shock_bomb: {
    id: 'clockwork_shock_bomb',
    name: 'Clockwork Shock Bomb',
    kind: 'tool',
    quality: 'rare',
    use: { type: 'shockBomb' },
    stackSize: 10,
    sellValue: 25,
    buyValue: 100,
  },
  plans_dense_sharpening_stone: {
    id: 'plans_dense_sharpening_stone',
    name: 'Plans: Dense Sharpening Stone',
    kind: 'recipe',
    quality: 'uncommon',
    teachesRecipeId: 'plans_dense_sharpening_stone',
    sellValue: 0,
    buyValue: 0,
  },
  dense_sharpening_stone: {
    id: 'dense_sharpening_stone',
    name: 'Dense Sharpening Stone',
    kind: 'tool',
    quality: 'common',
    use: { type: 'sharpeningStone' },
    stackSize: 20,
    sellValue: 20,
    buyValue: 80,
  },
  formula_enchant_gloves_forged_might: {
    id: 'formula_enchant_gloves_forged_might',
    name: 'Formula: Enchant Gloves - Forged Might',
    kind: 'recipe',
    quality: 'uncommon',
    teachesRecipeId: 'enchant_gloves_forged_might',
    teachesEnchantId: 'enchant_gloves_forged_might',
    sellValue: 0,
    buyValue: 0,
  },
  allied_hearthstone: {
    id: 'allied_hearthstone',
    name: 'Allied Hearthstone',
    kind: 'tool',
    quality: 'rare',
    unique: true,
    use: { type: 'alliedHearthstone' },
    sellValue: 20000,
    buyValue: 0,
  },
  allied_vanguard_duffel: {
    id: 'allied_vanguard_duffel',
    name: 'Allied Vanguard Duffel',
    kind: 'bag',
    bagSlots: 16,
    quality: 'epic',
    unique: true,
    soulbound: true,
    sellValue: 20000,
    buyValue: 0,
  },
};

/** Every row a faction sells, in ladder order (the vendor window lists them so). */
export const FACTION_VENDOR_STOCK: Readonly<Record<FactionId, readonly string[]>> = Object.freeze({
  gilt_measure: Object.freeze([
    'tidewatchers_locket',
    'cartographers_ink',
    'rift_watchers_band',
    'rift_surveyors_satchel',
    'rift_feather_glider',
    'riftwalkers_tunic',
    'riftwalkers_cord',
    'riftwalkers_treads',
    'formula_riftwalkers_grace',
    'formula_enchant_feet_shadowstride',
    'recipe_potion_of_invisibility',
    'pattern_reinforced_armor_kit',
    'riftwarden_voidblade',
    'allied_hearthstone',
    'allied_vanguard_duffel',
    'champion_rift_band',
    'riftwardens_pendant',
    // The Viridian Valestrider (content/items.ts, PR 4175): the ladder's
    // headline reward, the only mount a faction sells.
    'reins_avian_strider',
  ]),
  lanternwardens: Object.freeze([
    'order_prayer_beads',
    'cartographers_ink',
    'acolytes_signet',
    'dawn_battle_standard',
    'vestments_of_the_acolyte',
    'cord_of_the_dawn',
    'dawnlit_slippers',
    'formula_dawnfire_etching',
    'formula_dawns_benediction',
    'formula_enchant_offhand_spirit',
    'recipe_elixir_of_mana_regeneration',
    'dawnkeeper_consecrated_mace',
    'templar_dawn_shield',
    'allied_hearthstone',
    'allied_vanguard_duffel',
    'champion_dawn_medallion',
    'champions_dawn_loop',
    'dawnkeepers_circle',
  ]),
  hearthwright_compact: Object.freeze([
    'cogwork_choker',
    'cartographers_ink',
    'automaton_cog_ring',
    'clockwork_tinkers_pack',
    'clockwork_target_dummy',
    'artificers_welding_cowl',
    'forgemasters_girdle',
    'forgemasters_sabatons',
    'formula_piston_drive',
    'formula_enchant_gloves_forged_might',
    'schematic_clockwork_shock_bomb',
    'plans_dense_sharpening_stone',
    'forgemaster_crag_cleaver',
    'allied_hearthstone',
    'allied_vanguard_duffel',
    'champion_forged_loop',
    'forgewall_gorget',
  ]),
  // The allied rows only, bought with Bracken Acorns (its own ladder is a
  // follow-up; see the header).
  bracken_circle: Object.freeze([
    'cartographers_ink',
    'allied_hearthstone',
    'allied_vanguard_duffel',
  ]),
});

/** The Bracken Circle's quartermaster is Fenbridge's herbalist (template id
 *  herbalist_yara; content/zone2.ts takes this stock). */
export const BRACKEN_CIRCLE_QUARTERMASTER_ID = 'herbalist_yara';

/** Three of the four Faction Quartermasters (the Bracken Circle's is
 *  Fenbridge's herbalist, content/zone2.ts) and the World Quest Taskmaster. */
export const FACTION_VENDOR_NPCS: Record<string, NpcDef> = {
  // Gilt Measure Quartermaster (id frozen from the Rift Watch): Drifthaven (palmreach). He keeps the counter of
  // the provisioner's shop on the square's east side, looking out at the
  // square (sim/painted_towns/drifthaven.ts).
  npc_rift_watch_quartermaster: {
    id: 'npc_rift_watch_quartermaster',
    name: 'Quartermaster Vaelen',
    title: 'Gilt Measure Factor',
    pos: { ...DRIFTHAVEN_NPC_PLACEMENTS_BY_ID.npc_rift_watch_quartermaster.position },
    facing: DRIFTHAVEN_NPC_PLACEMENTS_BY_ID.npc_rift_watch_quartermaster.facing,
    color: 0x4a7a9a,
    questIds: [],
    greeting:
      'The Gilt Measure trades on what the coast gives up, and pays for what it learns. Our stores are open to those of recognized standing.',
    vendorItems: [...FACTION_VENDOR_STOCK.gilt_measure],
  },

  // Lanternwarden Quartermaster (id frozen from the Church Order): Eastbrook Vale chapel (eastbrook_vale). She
  // follows the chapel (to the rise west of the square in the Tidehold
  // rebuild) and stands at the foot of its steps three strides from Brother
  // Aldric, toward the bell tower, looking out of its door.
  npc_church_order_quartermaster: {
    id: 'npc_church_order_quartermaster',
    name: 'Captain Althea',
    title: 'Lanternwarden Quartermaster',
    pos: { x: 13.29, z: -112.84 },
    facing: -0.96,
    color: 0xecd57a,
    questIds: [],
    greeting:
      'Keep a lamp lit and a road open. The Lanternwardens supply those who stand the watch with us.',
    vendorItems: [...FACTION_VENDOR_STOCK.lanternwardens],
  },

  // Hearthwright Compact Quartermaster (id frozen from the Automatons): Wyrmwatch (drakelands)
  npc_automaton_quartermaster: {
    id: 'npc_automaton_quartermaster',
    name: 'Artificer Tobrin',
    title: 'Hearthwright Requisitioner',
    pos: { x: 402, z: 1912 },
    facing: -0.4,
    color: 0xb87333,
    questIds: [],
    greeting:
      'Sound timber, true steel, and honest work. Members of the Compact may draw from our stores.',
    vendorItems: [...FACTION_VENDOR_STOCK.hearthwright_compact],
  },

  // World Quest Taskmaster: Eastbrook Vale central hub, on the square's west
  // side by the civic link road
  npc_wq_taskmaster: {
    id: 'npc_wq_taskmaster',
    name: 'Taskmaster Kaelen',
    title: 'World Quest Taskmaster',
    pos: { x: -2.8, z: -96 },
    facing: -2.1,
    color: 0x8a6a50,
    questIds: [],
    worldQuestBoard: true,
    greeting:
      'The four allied factions post assignments across the realm every day. If an assignment does not suit your skills, you may request one daily reassignment.',
  },
};

/** Teleport arrival destinations for the Allied Hearthstone. */
export const FACTION_HUB_LANDINGS: Readonly<
  Record<
    FactionId,
    {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly facing: number;
      readonly name: string;
    }
  >
> = Object.freeze({
  // before the Eastbrook chapel's door, looking out of it toward the square
  lanternwardens: Object.freeze({
    x: 12.55,
    y: 0,
    z: -108.66,
    facing: -0.96,
    name: 'Eastbrook Vale',
  }),
  gilt_measure: Object.freeze({ x: -302, y: 0, z: 812, facing: 0.8, name: 'Drifthaven' }),
  hearthwright_compact: Object.freeze({ x: 402, y: 0, z: 1912, facing: -0.4, name: 'Wyrmwatch' }),
  // At Mother Olvessa's apothecary door in Fenbridge, where she stands.
  bracken_circle: Object.freeze({
    x: FENBRIDGE_NPC_PLACEMENTS_BY_ID.herbalist_yara.position.x,
    y: 0,
    z: FENBRIDGE_NPC_PLACEMENTS_BY_ID.herbalist_yara.position.z,
    facing: FENBRIDGE_NPC_PLACEMENTS_BY_ID.herbalist_yara.facing,
    name: 'Fenbridge',
  }),
});

/** Return the faction associated with a quartermaster NPC template, if any. */
export function vendorFactionForNpc(templateId?: string): FactionId | undefined {
  if (templateId === 'npc_rift_watch_quartermaster') return 'gilt_measure';
  if (templateId === 'npc_church_order_quartermaster') return 'lanternwardens';
  if (templateId === 'npc_automaton_quartermaster') return 'hearthwright_compact';
  if (templateId === BRACKEN_CIRCLE_QUARTERMASTER_ID) return 'bracken_circle';
  return undefined;
}
