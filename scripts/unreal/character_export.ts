// The humanoid-character export for the native (Unreal) client: everything the
// Unreal client needs to dress a WOC body the way the web client does, read straight
// from the renderer's own data (src/render/characters/): which visual keys are WOC
// bodies (VISUALS[key].wocCharacter), each body's files, clips, height and held
// props, each class manifest's default kit and armor items, each fit's whole armor
// catalog, the head library's slots and defaults, and every authored NPC look
// (npc_looks.ts) resolved to its head pieces and face morphs. The Unreal side ports
// only the small resolvers (worn kit from equipment, visible parts, head nodes); the
// `cases` block pins those ports: the TS answer for a spread of real inputs, which
// the C++ automation test recomputes from the tables and compares.
// tests/unreal_character_export.test.ts fails when the committed copy is stale.

import { type ClipMap, VISUALS } from '../../src/render/characters/manifest';
import { normalizeAppearance } from '../../src/render/characters/modular';
import { MOB_LOOK_IDS, npcLookFor } from '../../src/render/characters/npc_looks';
import {
  WOC_SHIPPED_SETS,
  wocFitCatalog,
  wocSetSlotAsset,
} from '../../src/render/characters/woc_armor_catalog';
import {
  type WocFit,
  wocAnimsUrl,
  wocArmorPackUrl,
  wocBaseUrl,
} from '../../src/render/characters/woc_armor_core';
import type { WocCharacterManifest } from '../../src/render/characters/woc_character_manifest';
import {
  WOC_HEAD_BALD_CROWN_MORPH,
  WOC_HEAD_HIDDEN_UNDER_HELM,
  WOC_HEAD_MORPH_RANGE,
  WOC_HEAD_MORPHS,
  WOC_HEAD_SLOTS,
  WOC_HEAD_TYPES,
  WOC_PIERCING_PRESETS,
  type WocHeadType,
  wocHeadAllUrls,
  wocHeadPieceUrl,
  wocHeadTuckMorph,
  wocHeadVisibleNodes,
} from '../../src/render/characters/woc_head_catalog';
import {
  wocHeadLookFromAppearance,
  wocWornHidesHair,
} from '../../src/render/characters/woc_head_look_core';
import { WOC_ITEM_DISPLAY } from '../../src/render/characters/woc_item_display';
import { wocKeyedAnimsUrl } from '../../src/render/characters/woc_keyed_animations';
import {
  WOC_ARMOR_SLOT_BY_EQUIP_SLOT,
  wocDefaultWorn,
  wocVisibleParts,
  wocWornFromEquipment,
} from '../../src/render/characters/woc_parts_core';
import { CLASSES, MOBS, NPCS } from '../../src/sim/data';
import type { EquipSlot } from '../../src/sim/types';

export const CHARACTER_EXPORT_FILE = 'character_visuals.json';

const FITS: readonly WocFit[] = ['male', 'female'];
const HEAD_TYPES: readonly WocHeadType[] = ['a', 'b'];

/** A public/ model url to the registry-style key (chars/players/woc/base_male). */
function modelKey(url: string): string {
  const m = /(?:^|\/)models\/(.+)\.glb$/.exec(url);
  if (!m) throw new Error(`not a model url: ${url}`);
  return m[1];
}

/** The clip names a body's base states and one-shots read (ClipMap fields, as data). */
function clipsOf(c: ClipMap): Record<string, unknown> {
  return {
    idle: c.idle,
    combatIdle: c.combatIdle ?? null,
    walk: c.walk,
    run: c.run,
    walkBack: c.walkBack ?? null,
    strafeLeft: c.strafeLeft ?? null,
    strafeRight: c.strafeRight ?? null,
    jump: c.jump ?? null,
    fall: c.fall ?? null,
    land: c.land ?? null,
    swim: c.swim ?? null,
    swimSurface: c.swimSurface ?? null,
    swimIdle: c.swimIdle ?? null,
    sitDown: c.sitDown ?? null,
    sitIdle: c.sitIdle ?? null,
    cast: c.cast ?? null,
    death: c.death,
    hit: c.hit ?? [],
    attack: c.attack,
    attackByAbility: c.attackByAbility ?? {},
    castByAbility: c.castByAbility ?? {},
    attackByHand: c.attackByHand ?? {},
    loadoutSwaps: c.loadoutSwaps ?? {},
  };
}

function manifestOf(m: WocCharacterManifest) {
  return {
    fit: m.fit,
    baseNodes: [...m.baseNodes],
    armorSlots: Object.keys(m.armorSlots),
    defaultEquipment: { ...m.defaultEquipment },
    items: Object.fromEntries(
      Object.entries(m.items).map(([id, it]) => [
        id,
        {
          slot: it.slot,
          set: it.set,
          nodes: [...it.nodes],
          hides: [...(it.hidesAppearance ?? [])],
        },
      ]),
    ),
  };
}

/** Every WOC body def, by visual key (player_<class> and player_<class>_female). */
function bodyDefs() {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(VISUALS).sort()) {
    const def = VISUALS[key];
    const m = def.wocCharacter;
    if (!m || !key.startsWith('player_')) continue;
    out[key] = {
      fit: m.fit,
      base: modelKey(def.url),
      anims: (def.animUrls ?? []).map(modelKey),
      height: def.height ?? null,
      attackTimeScale: def.attackTimeScale ?? null,
      walkBackRef: def.walkBackRef ?? null,
      clips: clipsOf(def.clips),
      attach: (def.attach ?? []).map((a) => ({ model: modelKey(a.url), bone: a.bone })),
      manifest: manifestOf(m),
    };
  }
  return out;
}

function catalogOf(fit: WocFit) {
  const items: Record<string, unknown> = {};
  for (const [id, it] of [...wocFitCatalog(fit).entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    items[id] = {
      slot: it.slot,
      set: it.set,
      nodes: [...it.nodes],
      hides: [...(it.hidesAppearance ?? [])],
    };
  }
  const setSlot: Record<string, Record<string, string | null>> = {};
  for (const set of WOC_SHIPPED_SETS) {
    setSlot[set] = {};
    for (const slot of Object.values(WOC_ARMOR_SLOT_BY_EQUIP_SLOT)) {
      if (slot) setSlot[set][slot] = wocSetSlotAsset(fit, set, slot);
    }
  }
  return { items, setSlot };
}

function headTypeOf(type: WocHeadType) {
  const def = WOC_HEAD_TYPES[type];
  return {
    fit: def.fit,
    defaults: { ...def.defaults },
    slots: Object.fromEntries(WOC_HEAD_SLOTS.map((s) => [s, def.slots[s].map((v) => v.id)])),
    files: wocHeadAllUrls(type).map(modelKey),
  };
}

/** The head an appearance draws on its body: type, the nodes for both helm states, morphs. */
function headFor(app: Record<string, unknown> | null) {
  const state = wocHeadLookFromAppearance(app);
  const files = new Set<string>();
  for (const slot of WOC_HEAD_SLOTS) {
    const url = wocHeadPieceUrl(state.type, slot, state.look[slot]);
    if (url) files.add(modelKey(url));
  }
  return {
    type: state.type,
    look: { ...state.look },
    nodes: wocHeadVisibleNodes(state.type, state.look, { helm: false }),
    nodesUnderHelm: wocHeadVisibleNodes(state.type, state.look, { helm: true }),
    morphs: Object.fromEntries(Object.entries(state.morphs).sort(([a], [b]) => (a < b ? -1 : 1))),
    files: [...files].sort(),
  };
}

/** Every authored NPC (and named humanoid mob) look: its body key, class, head and size. */
function npcLooks() {
  const out: Record<string, unknown> = {};
  const ids: [string, 'npc' | 'mob'][] = [
    ...Object.keys(NPCS).map((id) => [id, 'npc'] as [string, 'npc']),
    ...Object.keys(MOBS)
      .filter((id) => MOB_LOOK_IDS.has(id))
      .map((id) => [id, 'mob'] as [string, 'mob']),
  ];
  for (const [id, kind] of ids.sort(([a], [b]) => (a < b ? -1 : 1))) {
    const look = npcLookFor(id, kind);
    if (!look) continue;
    const app = look.app as unknown as Record<string, unknown>;
    out[`${kind}:${id}`] = {
      cls: look.cls,
      gender: look.app.gender,
      bodyScale: look.app.bodyScale ?? 1,
      props: look.props,
      head: headFor(app),
    };
  }
  return out;
}

/** The files the Unreal import converts: both bases, every animation library, every
 *  armor pack at the medium tier, and both head libraries. */
function importFiles() {
  const anims = new Set<string>();
  for (const fit of FITS) {
    anims.add(modelKey(wocAnimsUrl(fit)));
    anims.add(modelKey(wocKeyedAnimsUrl(fit)));
  }
  const armor: string[] = [];
  for (const fit of FITS)
    for (const set of WOC_SHIPPED_SETS) armor.push(modelKey(wocArmorPackUrl(fit, set, 'medium')));
  return {
    bases: Object.fromEntries(FITS.map((fit) => [fit, modelKey(wocBaseUrl(fit))])),
    anims: Object.fromEntries(
      FITS.map((fit) => [fit, [modelKey(wocAnimsUrl(fit)), modelKey(wocKeyedAnimsUrl(fit))]]),
    ),
    armor: armor.sort(),
    heads: Object.fromEntries(HEAD_TYPES.map((t) => [t, wocHeadAllUrls(t).map(modelKey)])),
  };
}

/** Real inputs and the renderer's answer, for the C++ resolver ports to recompute. */
function cases() {
  const kits: { label: string; eq: Partial<Record<EquipSlot, string>>; helmHidden: boolean }[] = [
    { label: 'starter', eq: { chest: 'recruit_tunic' }, helmHidden: false },
    { label: 'none', eq: {}, helmHidden: false },
    {
      label: 'full',
      eq: { helmet: 'a', shoulder: 'b', gloves: 'c', chest: 'd', waist: 'e', feet: 'f' },
      helmHidden: false,
    },
    { label: 'full_helm_hidden', eq: { helmet: 'a', chest: 'd', feet: 'f' }, helmHidden: true },
  ];
  const worn: unknown[] = [];
  for (const key of Object.keys(VISUALS).sort()) {
    const m = VISUALS[key].wocCharacter;
    if (!m || !key.startsWith('player_')) continue;
    for (const kit of kits) {
      const w = wocWornFromEquipment(m, kit.eq, kit.helmHidden);
      worn.push({
        key,
        kit: kit.label,
        eq: kit.eq,
        helmHidden: kit.helmHidden,
        worn: w,
        parts: [...wocVisibleParts(m, {}, w)].sort(),
        hidesHair: wocWornHidesHair(m, w),
      });
    }
    const d = wocDefaultWorn(m);
    worn.push({
      key,
      kit: 'default',
      worn: d,
      parts: [...wocVisibleParts(m, {}, d)].sort(),
      hidesHair: wocWornHidesHair(m, d),
    });
  }
  const apps: Record<string, unknown>[] = [
    {},
    { gender: 'female' },
    { gender: 'male', headHair: 'mohawk', headBeard: 'goatee', headPiercing: 'full' },
    { gender: 'female', headHair: 'bald', headEars: 'pointed', headBrows: 'straight' },
    { gender: 'female', headHair: 'swept', headNose: 'broad' },
    {
      gender: 'male',
      headHair: 'nonsense',
      headEyes: 'hooded',
      headShape: { eyeSize: 0.5, chinWidth: 0.2 },
    },
  ];
  const heads = apps.map((app) => ({ app, ...headFor(app) }));
  const keys = [
    ...Object.keys(CLASSES).flatMap((cls) => [
      { kind: 'player', cls, gender: 'male' },
      { kind: 'player', cls, gender: 'female' },
    ]),
  ].map((c) => ({ ...c, key: playerKeyOf(c.cls, c.gender) }));
  return { worn, heads, keys };
}

function playerKeyOf(cls: string, gender: string): string {
  const base = `player_${cls}`;
  if (!VISUALS[base]) return 'player_warrior';
  if (gender === 'female' && VISUALS[`${base}_female`]?.wocCharacter) return `${base}_female`;
  return base;
}

export function buildCharacterExport() {
  return {
    files: importFiles(),
    bodies: bodyDefs(),
    catalogs: Object.fromEntries(FITS.map((fit) => [fit, catalogOf(fit)])),
    equipToArmorSlot: { ...WOC_ARMOR_SLOT_BY_EQUIP_SLOT },
    itemDisplay: Object.fromEntries(
      Object.entries(WOC_ITEM_DISPLAY).map(([id, row]) => [id, row.set]),
    ),
    heads: {
      types: Object.fromEntries(HEAD_TYPES.map((t) => [t, headTypeOf(t)])),
      hiddenUnderHelm: [...WOC_HEAD_HIDDEN_UNDER_HELM],
      piercingPresets: Object.fromEntries(
        Object.entries(WOC_PIERCING_PRESETS).map(([id, sites]) => [id, [...sites]]),
      ),
      defaultMorphs: headFor(normalizeAppearance(null) as unknown as Record<string, unknown>)
        .morphs,
      // the face controls (appearance headShape key -> morph target, clamp, default)
      morphControls: Object.entries(WOC_HEAD_MORPHS).map(([key, morph]) => ({
        key,
        morph,
        ...WOC_HEAD_MORPH_RANGE[key as keyof typeof WOC_HEAD_MORPHS],
      })),
      baldCrownMorph: WOC_HEAD_BALD_CROWN_MORPH,
      tuckMorphPrefix: wocHeadTuckMorph(''),
    },
    npcs: npcLooks(),
    cases: cases(),
  };
}
