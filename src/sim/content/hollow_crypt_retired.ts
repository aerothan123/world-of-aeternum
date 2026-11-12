// The Hollow Crypt retirement (2026-11-11): the retired-source item-level table.
//
// The owner retired the dungeon outright, so its mobs, bosses, loot tables and
// quests are gone. Item ids are forever (tests/shipped_item_ids.test.ts), and
// players still own these pieces, so every item whose ONLY level-bearing source
// was the crypt keeps the source level it shipped at here. Without the pin the
// item-level source index (item_level.ts buildSourceIndex) would find no source
// for them at all: the tooltip would drop the item level line, the budget gates
// would skip them and their derived equip gates would move. With it, each item
// reads exactly the item level, budget and gate it shipped with. Pure data, no
// imports, so item_level.ts and heroic_variants.ts can both read it.
//
// The levels are the pre-retirement source index, copied verbatim (none of
// these was a raid source). bump() in buildSourceIndex is highest-level-wins,
// so a pin only ever restores the shipped tier and never lowers a live source.

/** itemId -> the source level it shipped at, for every item whose only
 *  level-bearing source was a Hollow Crypt mob, boss or quest. */
export const HOLLOW_CRYPT_RETIRED_SOURCE_LEVELS: Readonly<Record<string, number>> = {
  // Trash and rare-spawn drops.
  greyjaw_hide_boots: 10,
  cryptbone_greaves: 10,
  cryptbone_helm: 10,
  cryptbone_pauldrons: 10,
  gravewoven_bag: 10,
  gravecaller_blade: 10,
  widowfang_dirk: 10,
  gravecaller_staff: 10,
  blessed_wax: 6,
  ghostly_essence: 7,
  restless_skull: 7,
  arcane_essence: 10,
  // The heroic boss epics (the five-man heroic source).
  bastion_sigil: 25,
  morthens_cryptforged_hauberk: 25,
  shadowpulse_handwraps: 25,
  bonechill_striders: 25,
  cryptplate_helm: 25,
  shadowpulse_slippers: 25,
  bonechill_cord: 25,
  lunarward_cinch: 25,
  sextons_burial_spade: 25,
  rimesilk_hood: 25,
  // Sexton Marrow (level 8).
  gravedirt_treads: 8,
  bellrope_girdle: 8,
  sextons_spadehaft: 8,
  spadeworn_gauntlets: 8,
  gravedirt_grips: 8,
  bellrope_mitts: 8,
  // Rimeweb and Cantor Ilvane (level 9).
  rimesilk_mantle: 9,
  bonechill_carapace_vest: 9,
  rimeweb_hunters_leggings: 9,
  rimeweb_fang: 9,
  rimewreath_coif: 9,
  rime_laced_hood: 9,
  lamenting_veil: 9,
  cantors_cassock: 9,
  choirward_leggings: 9,
  choristers_gloves: 9,
  cantors_hymnal: 9,
  choirward_pauldrons: 9,
  choristers_spaulders: 9,
  cantors_stole: 9,
  // Morthen (level 10).
  gravecallers_vestments: 10,
  unquiet_stalkers_hood: 10,
  knellbound_hauberk: 10,
  candlewatch_jerkin: 10,
  robe_of_the_unquiet_rite: 10,
  gravecallers_rod: 10,
  // The retired crypt quests' rewards (q_sexton, q_hollow and q_bones).
  gravebell_treads: 8,
  gravebell_greaves: 8,
  gravebell_moccasins: 8,
  cryptbound_tunic: 10,
  cryptbound_chainmail: 10,
  lychgate_buckler: 7,
  // The Hedgerow legs were the choose-one reward of both q_ringleader (Gorrak,
  // level 6) and the crypt's q_rite (level 7). q_rite left with the crypt, so
  // the family keeps the level-7 tier it shipped at.
  hedgerow_leggings: 7,
  hedgerow_breeches: 7,
  hedgerow_legwraps: 7,
  hedgerow_legguards: 7,
  hedgerow_chausses: 7,
  hedgerow_trousers: 7,
};

/** The crypt-only base items whose generated Heroic copies (heroic_<id>)
 *  shipped. heroic_variants.ts keeps minting them from these bases, so every
 *  owned copy resolves to the same def at the same level (item level from the
 *  heroic variant source, as shipped). */
export const HOLLOW_CRYPT_RETIRED_HEROIC_BASE_IDS = [
  'bellrope_mitts',
  'candlewatch_jerkin',
  'cantors_hymnal',
  'cantors_stole',
  'choirward_pauldrons',
  'choristers_spaulders',
  'gravecallers_rod',
  'gravedirt_grips',
  'knellbound_hauberk',
  'lamenting_veil',
  'rime_laced_hood',
  'rimeweb_fang',
  'rimewreath_coif',
  'robe_of_the_unquiet_rite',
  'sextons_spadehaft',
  'spadeworn_gauntlets',
] as const;
