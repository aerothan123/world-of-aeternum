// The WYNDLEWOOD held-model set: one generated base model per weapon type, repainted into
// three tier looks (starter, mid, fine) by scripts/assets/wynd_weapons (same mesh and UVs,
// the atlas recoloured by what each texel shows and where it sits on the weapon, plus small
// gilt and gem add-ons on the fine tier drawn from that same atlas). Gear progression reads
// on the model without a generation per item: one base per weapon type, three looks each.
//
// Pure data, no three.js: the grip-family table (KAYKIT_WEAPON_ACCESSORY in assets.ts), the
// shield seats (held_item_grips.ts), the authored-surface and rimless sets (manifest.ts) and
// the preload set all spread from here, so a new tier or type is one row in this file.

/** The tiers, lowest first. Mirrors WYND_TIERS in scripts/assets/wynd_weapons/tier_core.mjs. */
export const WYND_WEAPON_TIERS = ['starter', 'mid', 'fine'] as const;
export type WyndWeaponTier = (typeof WYND_WEAPON_TIERS)[number];

/** Each base: its held-model key stem and the grip family every tier of it rides. A shield
 *  seats through the shield table instead (`shield: true`). */
export const WYND_WEAPON_BASES = {
  sword: { stem: 'sword_wynd', family: 'VAR_SWORD' },
  axe2h: { stem: 'axe_wynd_2h', family: 'VAR_AXE' },
  mace: { stem: 'mace_wynd', family: 'VAR_MACE' },
  staff: { stem: 'staff_wynd', family: 'VAR_STAFF' },
  bow: { stem: 'bow_wynd', family: 'VAR_BOW' },
  shield: { stem: 'shield_wynd', family: 'Heater_Shield', shield: true },
  tome: { stem: 'tome_wynd', family: 'VAR_BOOK' },
  dagger: { stem: 'dagger_wynd', family: 'VAR_DAGGER' },
  wand: { stem: 'wand_wynd', family: 'VAR_WAND' },
  spear: { stem: 'spear_wynd', family: 'VAR_POLEARM' },
  axe1h: { stem: 'axe_wynd', family: 'VAR_AXE' },
  greatsword: { stem: 'sword_wynd_2h', family: 'VAR_SWORD' },
  maul: { stem: 'hammer_wynd_2h', family: 'VAR_HAMMER' },
} as const satisfies Record<string, { stem: string; family: string; shield?: true }>;
export type WyndWeaponType = keyof typeof WYND_WEAPON_BASES;

/** The held-model key of one type's tier (`<stem>_<tier>`, the GLB basename). */
export function wyndModelKey(type: WyndWeaponType, tier: WyndWeaponTier): string {
  return `${WYND_WEAPON_BASES[type].stem}_${tier}`;
}

function rows(shields: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [type, base] of Object.entries(WYND_WEAPON_BASES)) {
    if (('shield' in base && base.shield === true) !== shields) continue;
    for (const tier of WYND_WEAPON_TIERS) {
      out[wyndModelKey(type as WyndWeaponType, tier)] = base.family;
    }
  }
  return out;
}

/** Every non-shield tier model and the VAR_* grip family it rides in the hand and on the
 *  back (spread into KAYKIT_WEAPON_ACCESSORY). */
export const WYND_WEAPON_ACCESSORY: Readonly<Record<string, string>> = rows(false);

/** Every shield tier model and its seat (spread into KAYKIT_SHIELD_ACCESSORIES). The board's
 *  origin is its middle, like the pack heaters, so it takes their seat. */
export const WYND_SHIELD_ACCESSORIES: Readonly<Record<string, string>> = rows(true);

/** Every tier model key. All are painted atlases of their own (AUTHORED_HELD_MODELS). */
export const WYND_MODEL_KEYS: readonly string[] = [
  ...Object.keys(WYND_WEAPON_ACCESSORY),
  ...Object.keys(WYND_SHIELD_ACCESSORIES),
];

/** The broad flat plates among them, drawn without the character rim (RIMLESS_HELD_MODELS):
 *  the shield's face and the tome's covers. */
export const WYND_RIMLESS_MODEL_KEYS: readonly string[] = WYND_WEAPON_TIERS.flatMap((tier) => [
  wyndModelKey('shield', tier),
  wyndModelKey('tome', tier),
]);
