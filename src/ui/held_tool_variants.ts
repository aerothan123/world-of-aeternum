// Gathering tool item id -> held model key. The tool belt (src/sim/professions/
// gather_tool_*) equips these in their own slots, never the weapon mainhand, so they
// stay out of ITEM_WEAPON_VARIANTS: that map is the weapon registry the weapon-art and
// item-icon gates hold to the weapon contract, and a tool keeps ordinary item art.
// The renderer draws the tool in the hand only while its gather swing plays
// (src/render/gather_pose_core.ts heldGatherMainhand), resolving the GLB through the
// same models/weapons/<key>.glb path and KAYKIT_WEAPON_ACCESSORY grip as a weapon.
//
// Pure data, no imports, no DOM (the ui icon layer and the render layer both read it).
export const HELD_TOOL_VARIANTS: Readonly<Record<string, string>> = {
  // Mining picks
  arcanite_mining_pick: 'arcanite_mining_pick',
  copper_mining_pick: 'copper_mining_pick',
  iron_mining_pick: 'iron_mining_pick',
  mithril_mining_pick: 'mithril_mining_pick',
  thorium_mining_pick: 'thorium_mining_pick',
  // Logging axes
  ashwood_axe: 'ashwood_axe',
  elderwood_axe: 'elderwood_axe',
  felling_axe: 'felling_axe',
  handaxe: 'handaxe',
  ironbark_axe: 'ironbark_axe',
  // Herbalism sickles
  bronze_sickle: 'bronze_sickle',
  gathering_sickle: 'gathering_sickle',
  goldleaf_sickle: 'goldleaf_sickle',
  silverleaf_sickle: 'silverleaf_sickle',
  sunpetal_sickle: 'sunpetal_sickle',
  // Farming hoes
  bronze_hoe: 'bronze_hoe',
  evergarden_hoe: 'evergarden_hoe',
  garden_hoe: 'garden_hoe',
  osmium_hoe: 'osmium_hoe',
  skysilver_hoe: 'skysilver_hoe',
  // Fishing rods
  clockreel_fishing_rod: 'clockreel_fishing_rod',
  ironreel_fishing_rod: 'ironreel_fishing_rod',
  silverstream_fishing_rod: 'silverstream_fishing_rod',
  stormreel_fishing_rod: 'stormreel_fishing_rod',
  tidewrought_fishing_rod: 'tidewrought_fishing_rod',
};
