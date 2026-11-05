/** Which WYNDLEWOOD tier look (wynd_weapon_models.ts) an equipped item draws in the hand.
 *
 * The tier set supersedes the classic PACK models (the `_starter`, `_field_` and `_rare_`
 * looks, and the inscription tomes) for every weapon type it has a base for; anything with a
 * model made for it alone (a legendary's epic design, a forge legendary, a world-boss drop,
 * a quest tool) keeps that model, and so does every item whose type has no base yet. The
 * classic tables (src/ui/weapon_variants.ts, manifest.ts ITEM_OFFHAND_MODELS) are left as
 * they are: they still answer for those items, for NPC props and for the bag-art pins.
 *
 * The tier follows the item, never its stats: a class's starting gear and poor or common
 * items draw the starter look, uncommon and rare the mid look, epic the fine look;
 * legendary items keep their own models. Presentation only, cosmetic, and the same for
 * every viewer of a body (it reads only the item id).
 *
 * Node-only (RENDER_PURE_CORES): no three.js, no DOM.
 */
import { weaponTypeForItem } from '../../sim/content/weapon_skin_rules';
import { CLASSES, ITEMS } from '../../sim/data';
import { isShieldItem, weaponHand } from '../../sim/equipment_rules';
import type { ItemDef } from '../../sim/types';
import {
  WYND_WEAPON_BASES,
  type WyndWeaponTier,
  type WyndWeaponType,
  wyndModelKey,
} from './wynd_weapon_models';

/** A classic key the tier set supersedes: the plain packs and the inscription tomes. A key
 *  outside this pattern is a model made for its item and is never replaced. */
const PACK_KEY =
  /^((sword|dagger|hammer|axe|staff|spear|wand|shield)_(starter|field(_2h)?_[a-z]+|rare_[ab]_[a-z]+)|tome_(silverleaf|goldleaf|sunpetal|voidbound))$/;

export function isSupersededPackKey(key: string | null | undefined): boolean {
  return !!key && PACK_KEY.test(key);
}

let startingItems: ReadonlySet<string> | null = null;
function startingItemIds(): ReadonlySet<string> {
  if (!startingItems) {
    const ids = new Set<string>();
    for (const def of Object.values(CLASSES)) {
      ids.add(def.startWeapon);
      if (def.startOffhand) ids.add(def.startOffhand);
    }
    startingItems = ids;
  }
  return startingItems;
}

/** The tier an item's quality reads as, or null for a legendary (it keeps its own model). */
export function wyndTierForItem(
  itemId: string,
  item: Pick<ItemDef, 'quality'>,
): WyndWeaponTier | null {
  if (startingItemIds().has(itemId)) return 'starter';
  switch (item.quality) {
    case 'legendary':
      return null;
    case 'epic':
      return 'fine';
    case 'uncommon':
    case 'rare':
      return 'mid';
    default:
      return 'starter';
  }
}

/** The base type an item is drawn as, from its gameplay type and hand (never its name). */
export function wyndTypeForItem(itemId: string, classicKey: string | null): WyndWeaponType | null {
  const item = ITEMS[itemId];
  if (!item) return null;
  if (isShieldItem(item)) return 'shield';
  if (classicKey?.startsWith('tome_')) return 'tome';
  if (item.kind !== 'weapon') return null;
  const twoHand = weaponHand(item) === 'twohand';
  let type: string | null = null;
  switch (weaponTypeForItem(itemId)) {
    case 'sword':
      type = twoHand ? 'greatsword' : 'sword';
      break;
    case 'axe':
      type = twoHand ? 'axe2h' : 'axe1h';
      break;
    case 'mace':
      type = twoHand ? 'maul' : 'mace';
      break;
    case 'staff':
      type = 'staff';
      break;
    case 'dagger':
      type = 'dagger';
      break;
    case 'wand':
      type = 'wand';
      break;
    case 'polearm':
      type = 'spear';
      break;
    default:
      type = null;
  }
  return type && Object.hasOwn(WYND_WEAPON_BASES, type) ? (type as WyndWeaponType) : null;
}

/** The tier model key an item draws in the hand, or null to keep its classic model.
 *  `classicKey` is the key the classic tables give it (null when they give none): only a
 *  pack key is ever superseded. A Heroic copy resolves through its base item's id, so it
 *  draws its base's look, like its classic model and its bag art. */
export function wyndHeldModelKey(
  itemId: string | null | undefined,
  classicKey: string | null,
): string | null {
  if (!itemId || !isSupersededPackKey(classicKey)) return null;
  const own = Object.hasOwn(ITEMS, itemId) ? ITEMS[itemId] : undefined;
  if (!own) return null;
  const baseId = own.heroicOf && Object.hasOwn(ITEMS, own.heroicOf) ? own.heroicOf : itemId;
  const item = ITEMS[baseId];
  const type = wyndTypeForItem(baseId, classicKey);
  if (!type) return null;
  const tier = wyndTierForItem(baseId, item);
  return tier ? wyndModelKey(type, tier) : null;
}
