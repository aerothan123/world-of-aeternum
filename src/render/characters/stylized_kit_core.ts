// The stylized modular player kit (dev-only, `?stylizedchars=1`): per class and body fit, a
// WOC character manifest whose files are built on the EXACT shipped WOC rig by
// scripts/assets/stylized_chars/build_stylized_kit.mjs, so they dress through the existing WOC
// path unchanged: armor sets are WOC set files (woc_armor_core.ts names the stylized_ root),
// worn pieces resolve through the manifest's own items (woc_parts_core.ts), and every part a
// bare body draws is an appearance part cut into its base file:
//   - body_<slot>: the bare body region under each armor slot. A worn piece hides the region
//     it covers (hidesAppearance), so the body never pokes through the armor.
//   - face (required): three faces, hair (optional): three hairstyles; a helm hides the hair.
// The head is the body's own (ownHead), so the WOC head library is never asked for.
// Every class has its own starter-to-mid set; any set's piece sits on any class's body (one
// rig, one cut), which is how a kit mixes. Pure data and three-free; node names mirror
// build_stylized_kit.mjs.

import type { ArmorType, EquipSlot } from '../../sim/types';
import type { WocFit } from './woc_armor_core';
import type {
  WocAppearanceSlot,
  WocArmorItem,
  WocCharacterManifest,
} from './woc_character_manifest';
import type { WocAppearance, WocWorn } from './woc_parts_core';

/** Every stylized set (file ids are `stylized_<set>`): the two Phase A sets plus one per class. */
export const STYLIZED_SETS = [
  'plate',
  'leather',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'mage',
  'warlock',
  'shaman',
  'druid',
] as const;
export type StylizedSet = (typeof STYLIZED_SETS)[number];

/** Each WOC player class's own set. */
export const STYLIZED_CLASS_SET: Readonly<Record<string, StylizedSet>> = {
  warrior: 'plate',
  paladin: 'paladin',
  hunter: 'hunter',
  rogue: 'rogue',
  priest: 'priest',
  mage: 'mage',
  warlock: 'warlock',
  shaman: 'shaman',
  druid: 'druid',
};

/** Armor slot -> the node label the build writes, and the body region it hides. */
const SLOT_PIECES: readonly { slot: string; label: string; piece: string }[] = [
  { slot: 'chest', label: 'Chest', piece: 'chest' },
  { slot: 'arms', label: 'Shoulders', piece: 'shoulders' },
  { slot: 'hands', label: 'Gloves', piece: 'gloves' },
  { slot: 'waist', label: 'Waist', piece: 'waist' },
  { slot: 'legs', label: 'Legs', piece: 'legs' },
  { slot: 'feet', label: 'Boots', piece: 'boots' },
];

/** The faces and hairstyles each fit ships (appearance variant ids). */
export const STYLIZED_FACES = ['default', 'b', 'c'] as const;
export const STYLIZED_HAIRS = ['h1', 'h2', 'h3'] as const;

const prefix = (fit: WocFit) => (fit === 'female' ? 'Female_' : '');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The asset id of one set's piece for one armor slot. */
export function stylizedItemId(fit: WocFit, set: StylizedSet, slot: string): string {
  if (slot === 'head') return `${fit}_stylized_${set}_helm`;
  const piece = SLOT_PIECES.find((p) => p.slot === slot)?.piece ?? slot;
  return `${fit}_stylized_${set}_${piece}`;
}

/** The sets that carry a helm (only the Phase A plate set ships one). */
const HELMED: ReadonlySet<StylizedSet> = new Set<StylizedSet>(['plate']);

/** One set's items (every armor slot, plus its helm when it has one). */
export function stylizedSetItems(fit: WocFit, set: StylizedSet): Record<string, WocArmorItem> {
  const items: Record<string, WocArmorItem> = {};
  const node = (label: string) => `Armor_${prefix(fit)}Stylized_${cap(set)}_${label}`;
  if (HELMED.has(set)) {
    items[stylizedItemId(fit, set, 'head')] = {
      label: `Stylized ${set} helm`,
      slot: 'head',
      set: `stylized_${set}`,
      nodes: [node('Helm')],
      hidesAppearance: ['hair'],
    };
  }
  for (const p of SLOT_PIECES) {
    items[stylizedItemId(fit, set, p.slot)] = {
      label: `Stylized ${set} ${p.piece}`,
      slot: p.slot,
      set: `stylized_${set}`,
      nodes: [node(p.label)],
      hidesAppearance: [`body_${p.slot}`],
    };
  }
  return items;
}

function appearance(fit: WocFit): Record<string, WocAppearanceSlot> {
  const P = prefix(fit);
  const slots: Record<string, WocAppearanceSlot> = {
    face: {
      label: 'Face',
      required: true,
      variants: {
        default: { label: 'Face A', nodes: [`Stylized_${P}Face_A`] },
        b: { label: 'Face B', nodes: [`Stylized_${P}Face_B`] },
        c: { label: 'Face C', nodes: [`Stylized_${P}Face_C`] },
      },
    },
    hair: {
      label: 'Hair',
      required: false,
      variants: {
        // lettered: a trailing `_<digits>` is a split-primitive suffix to wocNodeNameOf
        h1: { label: 'Swept back', nodes: [`Stylized_${P}Hair_A`] },
        h2: { label: 'Long tail', nodes: [`Stylized_${P}Hair_B`] },
        h3: { label: 'Braided crest', nodes: [`Stylized_${P}Hair_C`] },
      },
    },
  };
  for (const p of SLOT_PIECES) {
    slots[`body_${p.slot}`] = {
      label: `Bare ${p.slot}`,
      required: false,
      variants: { default: { label: 'Bare', nodes: [`Stylized_${P}Body_${p.label}`] } },
    };
  }
  return slots;
}

/** The dev review kits: the class's own set (`class`), any one set worn whole, the mixed kit
 *  (plate torso and helm over leather limbs), or bare. */
export type StylizedKit = 'class' | StylizedSet | 'mixed' | 'bare';

export function isStylizedKit(kit: string): kit is StylizedKit {
  return (
    kit === 'class' ||
    kit === 'mixed' ||
    kit === 'bare' ||
    (STYLIZED_SETS as readonly string[]).includes(kit)
  );
}

/** The sets a kit draws from on a body of a given class set. */
export function stylizedKitSets(kit: StylizedKit, classSet: StylizedSet): StylizedSet[] {
  if (kit === 'bare') return [];
  if (kit === 'class') return [classSet];
  if (kit === 'mixed') return ['plate', 'leather'];
  return [kit];
}

/**
 * One class and fit's manifest. `animationNames` and the armor slots are the class's WOC
 * manifest's (same rig, same library). The items are the class set's plus any set the dev
 * review kit borrows (`extraSets`): only the listed sets' files ever load for this body
 * (woc_parts_core.ts wocManifestSets), so a stock body pays for its own set alone.
 */
export function stylizedManifest(
  fit: WocFit,
  classWoc: WocCharacterManifest,
  classSet: StylizedSet = 'plate',
  extraSets: readonly StylizedSet[] = [],
): WocCharacterManifest {
  const items: Record<string, WocArmorItem> = {};
  for (const set of [classSet, ...extraSets]) Object.assign(items, stylizedSetItems(fit, set));
  const app = appearance(fit);
  const defaultAppearance: Record<string, string | null> = { face: 'default', hair: 'h1' };
  for (const slot of Object.keys(app)) {
    if (slot.startsWith('body_')) defaultAppearance[slot] = 'default';
  }
  return {
    schemaVersion: 1,
    rigId: classWoc.rigId,
    fit,
    baseNodes: [],
    ownHead: true,
    appearance: app,
    defaultAppearance,
    armorSlots: classWoc.armorSlots,
    items,
    defaultEquipment: stylizedKitWorn(fit, 'class', false, classSet),
    animationNames: classWoc.animationNames,
  };
}

export function stylizedKitWorn(
  fit: WocFit,
  kit: StylizedKit,
  helmHidden: boolean,
  classSet: StylizedSet = 'plate',
): WocWorn {
  const worn: Record<string, string | null> = { back: null };
  const pick = (slot: string): StylizedSet | null => {
    if (kit === 'bare') return null;
    if (kit === 'class') return classSet;
    if (kit === 'mixed') {
      return slot === 'chest' || slot === 'arms' || slot === 'head' ? 'plate' : 'leather';
    }
    return kit;
  };
  for (const slot of ['head', ...SLOT_PIECES.map((p) => p.slot)]) {
    const set = pick(slot);
    worn[slot] =
      set && (slot !== 'head' || HELMED.has(set)) ? stylizedItemId(fit, set, slot) : null;
  }
  if (helmHidden) worn.head = null;
  return stylizedCloseSeams(fit, worn);
}

/**
 * The worn set a stylized body can draw now: a piece whose set file has not attached yet
 * resolves to no node (`resolved` holds the part names that do), so it is left off and the
 * bare region it would hide draws in its place, the way a shipped WOC body's suit stands in.
 * Any other body (no own head: a shipped WOC base and its suit) gets `worn` back untouched.
 */
export function stylizedDrawableWorn(
  manifest: WocCharacterManifest,
  worn: WocWorn,
  resolved: { has(name: string): boolean },
): WocWorn {
  if (!manifest.ownHead) return worn;
  let out: Record<string, string | null> | null = null;
  for (const [slot, id] of Object.entries(worn)) {
    if (!id) continue;
    const item = manifest.items[id];
    if (!item || item.nodes.every((n) => resolved.has(n))) continue;
    out ??= { ...worn };
    out[slot] = null;
  }
  return out ?? worn;
}

/** The armor type each set reads as, so a worn item shows a piece of its own weight. */
export const STYLIZED_SET_ARMOR: Readonly<Record<StylizedSet, ArmorType>> = {
  plate: 'mail',
  paladin: 'mail',
  hunter: 'mail',
  shaman: 'mail',
  leather: 'leather',
  rogue: 'leather',
  druid: 'leather',
  mage: 'cloth',
  priest: 'cloth',
  warlock: 'cloth',
};

/** The set an item of an armor type shows on a body whose class set is a different weight. */
const ARMOR_STAND_IN: Readonly<Record<ArmorType, StylizedSet>> = {
  mail: 'plate',
  leather: 'leather',
  cloth: 'mage',
};

/** Game equip slot -> stylized armor slot (the WOC table plus the legs a stylized body
 *  draws: its trousers are a piece of the kit, not part of the base). */
export const STYLIZED_SLOT_BY_EQUIP_SLOT: Readonly<Partial<Record<EquipSlot, string>>> = {
  helmet: 'head',
  shoulder: 'arms',
  gloves: 'hands',
  chest: 'chest',
  waist: 'waist',
  legs: 'legs',
  feet: 'feet',
};

/** The stylized set a WOC display row's set stands for (the warrior set is the plate one),
 *  or null for a set the kit has no counterpart for. */
export function stylizedSetOfDisplay(wocSet: string): StylizedSet | null {
  const set = wocSet === 'warrior' ? 'plate' : wocSet;
  return (STYLIZED_SETS as readonly string[]).includes(set) ? (set as StylizedSet) : null;
}

/** The set one worn item shows: its display row's set when the kit has it, else its own
 *  class's set when that is the item's weight, else the weight's stand-in set; the class
 *  set for an item with no armor type at all. */
export function stylizedSetForItem(
  classSet: StylizedSet,
  armorType: ArmorType | null,
  displaySet: string | null,
): StylizedSet {
  const shown = displaySet ? stylizedSetOfDisplay(displaySet) : null;
  if (shown) return shown;
  if (!armorType || STYLIZED_SET_ARMOR[classSet] === armorType) return classSet;
  return ARMOR_STAND_IN[armorType];
}

/** What a worn item is, for the gear mapping (the dev hook reads the item table). */
export interface StylizedItemLookup {
  armorType(itemId: string): ArmorType | null;
  displaySet(itemId: string): string | null;
}

/**
 * The worn set a stylized body's EQUIPMENT resolves to: every armor slot holding an item
 * shows that item's piece (stylizedSetForItem) in the wearer's fit, an empty slot shows the
 * bare body region under it. Only the plate set has a helm, so a head item of any other
 * set leaves the hair showing. `helmHidden` (the paperdoll eye) empties the head slot.
 */
export function stylizedGearWorn(
  fit: WocFit,
  equipped: Readonly<Partial<Record<EquipSlot, string>>> | null | undefined,
  helmHidden: boolean,
  classSet: StylizedSet,
  items: StylizedItemLookup,
): WocWorn {
  const worn: Record<string, string | null> = { back: null };
  for (const [equipSlot, slot] of Object.entries(STYLIZED_SLOT_BY_EQUIP_SLOT) as [
    EquipSlot,
    string,
  ][]) {
    const itemId = equipped?.[equipSlot] ?? null;
    if (!itemId) {
      worn[slot] = null;
      continue;
    }
    const set = stylizedSetForItem(classSet, items.armorType(itemId), items.displaySet(itemId));
    worn[slot] = slot !== 'head' || HELMED.has(set) ? stylizedItemId(fit, set, slot) : null;
  }
  if (helmHidden) worn.head = null;
  return stylizedCloseSeams(fit, worn);
}

const catalogCache = new Map<WocFit, ReadonlyMap<string, WocArmorItem>>();

/** Every stylized piece of a fit, by asset id: how a worn piece of a set outside the body's
 *  own manifest resolves (woc_armor_catalog.ts wocItemRecord), the way a WOC body reaches
 *  its fit's whole catalog. Its file loads only once a worn piece names its set. */
export function stylizedFitCatalog(fit: WocFit): ReadonlyMap<string, WocArmorItem> {
  let hit = catalogCache.get(fit);
  if (!hit) {
    const map = new Map<string, WocArmorItem>();
    for (const set of STYLIZED_SETS) {
      for (const [id, item] of Object.entries(stylizedSetItems(fit, set))) map.set(id, item);
    }
    hit = map;
    catalogCache.set(fit, hit);
  }
  return hit;
}

/** The seams a kit closes: each set is cut to meet its OWN neighbour, so a piece of one set
 *  over a piece of another opens a gap between them (a plate chest ends above a leather
 *  belt). The second slot of each pair follows the first's set while both are worn: the belt
 *  goes with the chest, the gloves with the shoulders. */
const SEAM_FOLLOWERS: readonly (readonly [string, string])[] = [
  ['chest', 'waist'],
  ['arms', 'hands'],
];

/** `worn` with every open seam closed (SEAM_FOLLOWERS); the same object when none is open. */
export function stylizedCloseSeams(fit: WocFit, worn: WocWorn): WocWorn {
  const catalog = stylizedFitCatalog(fit);
  let out: Record<string, string | null> | null = null;
  for (const [lead, follow] of SEAM_FOLLOWERS) {
    const a = worn[lead] ? catalog.get(worn[lead] as string) : undefined;
    const b = worn[follow] ? catalog.get(worn[follow] as string) : undefined;
    if (!a || !b || a.set === b.set) continue;
    out ??= { ...worn };
    out[follow] = stylizedItemId(fit, a.set.replace(/^stylized_/, '') as StylizedSet, follow);
  }
  return out ?? worn;
}

/** The face and hair a dev review asks for, onto the manifest's defaults. */
export function stylizedAppearance(
  manifest: WocCharacterManifest,
  face: string | null,
  hair: string | null,
): WocAppearance {
  const out: Record<string, string | null> = { ...manifest.defaultAppearance };
  if (face && manifest.appearance.face?.variants[face]) out.face = face;
  if (hair === 'none') out.hair = null;
  else if (hair && manifest.appearance.hair?.variants[hair]) out.hair = hair;
  return out;
}

/** The class set a stylized manifest was built for (its default worn chest piece's set). */
export function stylizedClassSetOf(manifest: WocCharacterManifest): StylizedSet {
  const chest = manifest.defaultEquipment.chest;
  const set = chest ? manifest.items[chest]?.set.replace(/^stylized_/, '') : null;
  return set && (STYLIZED_SETS as readonly string[]).includes(set) ? (set as StylizedSet) : 'plate';
}
