// The faction quartermaster ladder (content/faction_vendors.ts,
// docs/design/wyndlewood-faction-ladder.md section 5): one ladder per faction
// covering every standing tier, every row gated on the exact tier threshold,
// and every equipment row capped at the QUEST tier (the level-20 quest reward
// budget for its slot), never above what quests give. Faction stock is
// untiered in item_level.ts, so the formula pins here are its budget guard.

import { describe, expect, it } from 'vitest';
import { ENCHANTS } from '../src/sim/content/enchants';
import {
  FACTION_GEAR_ITEM_LEVEL,
  FACTION_VENDOR_GATES,
  FACTION_VENDOR_ITEMS,
  FACTION_VENDOR_NPCS,
  FACTION_VENDOR_STOCK,
  resolveFactionVendorRowGate,
} from '../src/sim/content/faction_vendors';
import { ITEMS, NPCS } from '../src/sim/data';
import {
  FACTION_IDS,
  freshFactionReputation,
  STANDING_THRESHOLDS,
  STANDING_TIERS,
} from '../src/sim/factions';
import {
  normalizePrimaryStats,
  primaryStatBudget,
  TWOHAND_DPS_MULT,
  TWOHAND_STAT_MULT,
  weaponDpsBudget,
} from '../src/sim/item_budget';
import { meetsLevelRequirement, requiredLevelFor } from '../src/sim/item_level_req';
import { Sim } from '../src/sim/sim';
import { buildVendorView } from '../src/ui/hud/vendor/vendor_view';

const LADDER_TIERS = ['recognized', 'trusted', 'proven', 'vanguard', 'champion'] as const;
const FORMULA_IDS = [
  'formula_riftwalkers_grace',
  'formula_dawnfire_etching',
  'formula_dawns_benediction',
  'formula_piston_drive',
] as const;

// The Bracken Circle quartermaster (Wyndlewood, content/faction_vendors.ts)
// sells only the allied rows for now: no faction-owned ladder yet, so the
// ladder-shape pins below cover the three factions that have one.
const FULL_LADDER_FACTIONS = FACTION_IDS.filter((f) => f !== 'bracken_circle');
// House furniture rows (content/furniture.ts pieces) ride the ladders as the
// cosmetic value above the quest-tier gear.
const isFurniture = (id: string) => id.startsWith('furn_');

describe('Faction Vendors & Reroll NPC content', () => {
  it('registers all three faction quartermasters and the taskmaster in NPCS', () => {
    const qmRift = NPCS.npc_rift_watch_quartermaster;
    expect(qmRift).toBeDefined();
    expect(qmRift.name).toBe('Quartermaster Vaelen');
    expect(qmRift.title).toBe('Gilt Measure Factor');
    expect(qmRift.vendorItems).toEqual([...FACTION_VENDOR_STOCK.gilt_measure]);

    const qmChurch = NPCS.npc_church_order_quartermaster;
    expect(qmChurch).toBeDefined();
    expect(qmChurch.name).toBe('Captain Althea');
    expect(qmChurch.title).toBe('Lanternwarden Quartermaster');
    expect(qmChurch.vendorItems).toEqual([...FACTION_VENDOR_STOCK.lanternwardens]);

    const qmAuto = NPCS.npc_automaton_quartermaster;
    expect(qmAuto).toBeDefined();
    expect(qmAuto.name).toBe('Artificer Tobrin');
    expect(qmAuto.title).toBe('Hearthwright Requisitioner');
    expect(qmAuto.vendorItems).toEqual([...FACTION_VENDOR_STOCK.hearthwright_compact]);

    const taskmaster = NPCS.npc_wq_taskmaster;
    expect(taskmaster).toBeDefined();
    expect(taskmaster.name).toBe('Taskmaster Kaelen');
    expect(taskmaster.title).toBe('World Quest Taskmaster');
    expect(taskmaster.greeting).toContain('assignments');
    expect(Object.keys(FACTION_VENDOR_NPCS)).toHaveLength(4);
  });

  it('the stock lists and the gate table name the same 60 rows, all priced in marks but the reins', () => {
    const stockIds = FACTION_IDS.flatMap((f) => [...FACTION_VENDOR_STOCK[f]]);
    const unique = new Set(stockIds);
    // The three allied rows stand on every ladder; every other row on one.
    // The Bracken Circle (Wyndlewood) sells the three allied rows and five
    // furniture pieces until its gear ladder is authored; the other three
    // ladders add eight furniture pieces between them.
    expect(stockIds).toHaveLength(69);
    expect(unique.size).toBe(60);
    expect([...unique].sort()).toEqual(Object.keys(FACTION_VENDOR_GATES).sort());
    // The Valestrider reins sit with the other reins and the Ink with the quest
    // items (content/items.ts); the item table also authors what the sold
    // recipes craft, which no vendor stocks.
    const CRAFTED = [
      'potion_of_invisibility',
      'reinforced_armor_kit',
      'elixir_of_mana_regeneration',
      'clockwork_shock_bomb',
      'dense_sharpening_stone',
    ];
    expect(
      [...unique]
        .filter(
          (id) => id !== 'reins_avian_strider' && id !== 'cartographers_ink' && !isFurniture(id),
        )
        .concat(CRAFTED)
        .sort(),
    ).toEqual(Object.keys(FACTION_VENDOR_ITEMS).sort());
    for (const factionId of FACTION_IDS) {
      for (const id of FACTION_VENDOR_STOCK[factionId]) {
        const gate = FACTION_VENDOR_GATES[id];
        // An allied row carries no faction: every quartermaster sells it.
        if (gate.factionId !== undefined) expect(gate.factionId, id).toBe(factionId);
        expect(ITEMS[id], id).toBeDefined();
        // Every row, the mount included, costs marks and never coin.
        expect(ITEMS[id].buyValue ?? 0, id).toBe(0);
        expect(gate.currencyCost, id).toBeGreaterThan(0);
        // Formulas are bind-on-pickup knowledge and mount reins never vendor
        // back (the mount contract in tests/mounts.test.ts); every other row sells.
        if (ITEMS[id].kind === 'recipe' || ITEMS[id].kind === 'mount') {
          expect(ITEMS[id].sellValue, id).toBe(0);
        } else expect(ITEMS[id].sellValue, id).toBeGreaterThan(0);
      }
    }
  });

  it('every gear and bag row binds, and every equipment row gates at level 20 like the rows it mirrors', () => {
    // Standing sits on the BUYER (resolveFactionVendorRowGate), so an unbound
    // row would let a Champion hand the whole ladder to an alt with no
    // standing at all. And faction stock is untiered (no source registers it),
    // so without an explicit requiredLevel the gate falls to the quality floor
    // (rare 12, epic 18) while every mirrored raid and heroic row requires 20.
    // Two rows stay transferable by contract: the reins (the mount contract
    // in tests/mounts.test.ts) and the formulas (patterns are
    // bind-by-consumption and deliberately listable,
    // tests/recipe_pattern_items.test.ts: learning spends the copy).
    for (const [id, def] of Object.entries(FACTION_VENDOR_ITEMS)) {
      if (def.kind === 'recipe') expect(def.soulbound, `${id} is a pattern`).toBeFalsy();
      else if (def.kind === 'armor' || def.kind === 'weapon' || def.kind === 'bag')
        expect(def.soulbound, `${id} binds`).toBe(true);
      if (def.kind === 'armor' || def.kind === 'weapon') {
        expect(def.requiredLevel, `${id} pins its level`).toBe(20);
        expect(requiredLevelFor(def), `${id} gates at 20`).toBe(20);
        expect(meetsLevelRequirement(19, def), `${id} refuses a 19`).toBe(false);
        expect(meetsLevelRequirement(20, def), `${id} admits a 20`).toBe(true);
      } else {
        expect(def.requiredLevel, `${id} (a ${def.kind}) carries no level pin`).toBeUndefined();
      }
    }
    expect(ITEMS.reins_avian_strider.soulbound).toBeFalsy();
  });

  it('every faction ladder covers all five standing tiers, in ladder order', () => {
    for (const factionId of FULL_LADDER_FACTIONS) {
      const tiers = FACTION_VENDOR_STOCK[factionId].map(
        (id) => FACTION_VENDOR_GATES[id].standingTier,
      );
      expect(new Set(tiers), factionId).toEqual(new Set(LADDER_TIERS));
      // Monotone: a row never sits below the tier of the row before it.
      const ranks = tiers.map((t) => STANDING_TIERS.indexOf(t));
      for (let i = 1; i < ranks.length; i++)
        expect(ranks[i], factionId).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it('every tier sells the lane the design names: neck, ring + bag, periphery + formula, weapon, jewels', () => {
    const slotsAt = (factionId: (typeof FACTION_IDS)[number], tier: string) =>
      FACTION_VENDOR_STOCK[factionId]
        .filter((id) => !isFurniture(id) && FACTION_VENDOR_GATES[id].standingTier === tier)
        .map((id) => (ITEMS[id].kind === 'recipe' ? 'formula' : (ITEMS[id].slot ?? ITEMS[id].kind)))
        .sort();
    for (const factionId of FULL_LADDER_FACTIONS) {
      // The allied Cartographer's Ink (a quest item) joins every Recognized neck.
      expect(slotsAt(factionId, 'recognized'), factionId).toEqual(['neck', 'quest']);
      expect(slotsAt(factionId, 'trusted'), factionId).toContain('ring');
      expect(slotsAt(factionId, 'proven'), factionId).toEqual(
        expect.arrayContaining(['waist', 'feet', 'formula']),
      );
      expect(slotsAt(factionId, 'vanguard'), factionId).toContain('mainhand');
      expect(slotsAt(factionId, 'champion'), factionId).toEqual(
        expect.arrayContaining(['neck', 'ring']),
      );
    }
    // The one mount a faction sells: the Gilt Measure's Champion reward.
    expect(slotsAt('gilt_measure', 'champion')).toEqual(['mount', 'neck', 'ring']);
    // Trusted adds a toy (the glider, the target dummy, the battle standard).
    expect(slotsAt('gilt_measure', 'trusted')).toEqual(['bag', 'ring', 'tool']);
    expect(slotsAt('hearthwright_compact', 'trusted')).toEqual(['bag', 'ring', 'tool']);
  });

  it('correctly maps FACTION_VENDOR_GATES to the exact standing thresholds', () => {
    for (const [_itemId, gate] of Object.entries(FACTION_VENDOR_GATES)) {
      expect(gate.requiredStanding).toBe(STANDING_THRESHOLDS[gate.standingTier]);
      if (gate.factionId) {
        expect(FACTION_IDS).toContain(gate.factionId);
      }
      expect(STANDING_TIERS).toContain(gate.standingTier);
    }
  });

  it('prices every row in marks on the tier scale, the reins included; gear sells back for coin', () => {
    const MARKS = { recognized: 15, trusted: 35, proven: 75, vanguard: 150, champion: 200 };
    const SELL = {
      recognized: 1_250,
      trusted: 3_750,
      proven: 8_750,
      vanguard: 20_000,
      champion: 37_500,
    };
    for (const [id, gate] of Object.entries(FACTION_VENDOR_GATES)) {
      const def = ITEMS[id];
      const tier = gate.standingTier as keyof typeof MARKS;
      expect(def.buyValue ?? 0, id).toBe(0);
      if (gate.factionId === undefined) continue; // the allied rows, pinned below
      if (def.kind === 'recipe') expect(gate.currencyCost, id).toBe(50);
      else if (def.kind === 'tool') expect(gate.currencyCost, id).toBe(40);
      else if (def.kind === 'mount') expect(gate.currencyCost, id).toBe(500);
      else expect(gate.currencyCost, id).toBe(MARKS[tier]);
      if (def.kind === 'armor' || def.kind === 'weapon' || def.kind === 'bag')
        expect(def.sellValue, id).toBe(SELL[tier]);
    }
    expect(FACTION_VENDOR_GATES.cartographers_ink.currencyCost).toBe(60);
    expect(FACTION_VENDOR_GATES.allied_hearthstone.currencyCost).toBe(100);
    expect(FACTION_VENDOR_GATES.allied_vanguard_duffel.currencyCost).toBe(120);
    // The mount: 500 Gilt Measure marks, no coin, an ordinary player reins
    // that never vendor-sells back.
    const reins = ITEMS.reins_avian_strider;
    expect(FACTION_VENDOR_GATES.reins_avian_strider).toMatchObject({
      factionId: 'gilt_measure',
      standingTier: 'champion',
      currencyCost: 500,
    });
    expect(reins.buyValue).toBe(0);
    expect(reins.sellValue).toBe(0);
    expect(reins.noVendorSell).toBe(true);
    expect(reins.soulbound).toBeFalsy();
  });

  it('evaluates resolveFactionVendorRowGate accurately', () => {
    const factions = freshFactionReputation();
    factions.gilt_measure = 2_500; // Above Recognized (1,000), below Trusted (3,000)

    const t1 = resolveFactionVendorRowGate('tidewatchers_locket', factions);
    expect(t1.locked).toBe(false);
    expect(t1.currentStanding).toBe(2_500);

    const t2 = resolveFactionVendorRowGate('rift_surveyors_satchel', factions);
    expect(t2.locked).toBe(true);
    expect(t2.requirement?.standingTier).toBe('trusted');

    // Lanternwardens items (standing is 0) -> Locked
    const churchT1 = resolveFactionVendorRowGate('order_prayer_beads', factions);
    expect(churchT1.locked).toBe(true);

    // Non-faction item -> Unlocked (no requirement)
    const nonFaction = resolveFactionVendorRowGate('linen_cloth', factions);
    expect(nonFaction.locked).toBe(false);
    expect(nonFaction.requirement).toBeUndefined();
  });
});

// Every equipment row sits on the quest tier: the level-20 quest reward plus
// the rare bump (FACTION_GEAR_ITEM_LEVEL), priced by the shared budget
// functions with the row's own stat ratio, so a retune of the budget curve is
// a red here rather than silent drift above what quests give.
describe('faction ladder gear stays at quest strength', () => {
  const gear = Object.values(FACTION_VENDOR_ITEMS).filter(
    (def) => (def.kind === 'armor' || def.kind === 'weapon') && def.slot !== undefined,
  );
  const POWER_FIELDS = [
    'critRating',
    'hitRating',
    'hasteRating',
    'expertiseRating',
    'spellPower',
    'healPower',
    'blockValue',
  ];

  it('reprices every gear row to the quest-tier budget for its slot, its ratio kept', () => {
    expect(FACTION_GEAR_ITEM_LEVEL).toBe(23);
    expect(gear).toHaveLength(26);
    for (const def of gear) {
      const two = def.kind === 'weapon' && def.hand === 'twohand';
      const base = primaryStatBudget(FACTION_GEAR_ITEM_LEVEL, 'rare', def.slot);
      const budget = two ? Math.round(base * TWOHAND_STAT_MULT) : base;
      const { armor: _armor, ...line } = def.stats ?? {};
      const total = Object.values(line).reduce((a, b) => a + (b ?? 0), 0);
      expect(total, def.id).toBe(budget);
      expect(normalizePrimaryStats(line, budget), def.id).toEqual(line);
      expect(def.quality, def.id).toBe('rare');
    }
  });

  it('carries no rating, power line or proc: that value moved to cosmetics', () => {
    for (const def of gear) {
      const fields = def as unknown as Record<string, unknown>;
      for (const key of POWER_FIELDS) expect(fields[key], `${def.id} ${key}`).toBeUndefined();
      if (def.kind === 'weapon') expect(def.weaponProcs, def.id).toBeUndefined();
    }
  });

  it('puts the weapons on the quest-tier dps line', () => {
    for (const def of gear) {
      if (def.kind !== 'weapon') continue;
      const w = def.weapon;
      const dps = (w.min + w.max) / 2 / w.speed;
      const line =
        weaponDpsBudget(FACTION_GEAR_ITEM_LEVEL) * (def.hand === 'twohand' ? TWOHAND_DPS_MULT : 1);
      expect(Math.abs(dps - line), def.id).toBeLessThan(0.4);
    }
  });

  it('never out-stats the best level-20 quest reward for the same slot', () => {
    // The quest catalog's best rare for each slot (any source a quest offers).
    const questRares = Object.values(ITEMS).filter(
      (def) =>
        def.quality === 'rare' &&
        (def.kind === 'armor' || def.kind === 'weapon') &&
        !Object.hasOwn(FACTION_VENDOR_ITEMS, def.id) &&
        (def.requiredLevel ?? 20) <= 20,
    );
    const line = (def: (typeof gear)[number]) => {
      const { armor: _armor, ...rest } = def.stats ?? {};
      return Object.values(rest).reduce((a, b) => a + (b ?? 0), 0);
    };
    for (const def of gear) {
      const peers = questRares.filter((q) => q.slot === def.slot);
      if (peers.length === 0) continue;
      const best = Math.max(...peers.map((q) => line(q)));
      expect(line(def), def.id).toBeLessThanOrEqual(Math.round(best * TWOHAND_STAT_MULT));
    }
  });

  it('the four formulas teach the four learned faction enchants, at Proven', () => {
    const taught = FORMULA_IDS.map((id) => {
      const def = ITEMS[id];
      expect(def.kind, id).toBe('recipe');
      expect(FACTION_VENDOR_GATES[id].standingTier, id).toBe('proven');
      if (def.kind !== 'recipe') throw new Error('narrowed above');
      expect(def.teachesEnchantId, id).toBe(def.teachesRecipeId);
      expect(ENCHANTS[def.teachesEnchantId ?? ''].acquisition, id).toBe('drop');
      return def.teachesEnchantId;
    });
    expect(taught).toEqual([
      'enchant_weapon_riftwalkers_grace',
      'enchant_weapon_dawnfire_etching',
      'enchant_weapon_dawns_benediction',
      'enchant_weapon_piston_drive',
    ]);
  });

  it('the bags are 14 slots, one step over the 12-slot uncommon line', () => {
    // Kept at 14: shrinking a bag a player already carries would strand items.
    for (const id of ['rift_surveyors_satchel', 'clockwork_tinkers_pack']) {
      expect(ITEMS[id].kind, id).toBe('bag');
      expect(ITEMS[id].bagSlots, id).toBe(14);
    }
  });

  it('every faction ladder sells house furniture, one faction per piece', () => {
    for (const factionId of FACTION_IDS) {
      const pieces = FACTION_VENDOR_STOCK[factionId].filter(isFurniture);
      expect(pieces.length, factionId).toBeGreaterThanOrEqual(2);
      for (const id of pieces) {
        expect(FACTION_VENDOR_GATES[id].factionId, id).toBe(factionId);
        expect(ITEMS[id], id).toBeDefined();
      }
    }
  });
});

describe('Faction vendor purchase authoritative simulation & UI', () => {
  it('enforces standing gates and currency costs during sim.buyItem authoritative purchase', () => {
    const sim = new Sim({ seed: 777, playerClass: 'warrior', autoEquip: false });
    const meta = sim.meta(sim.playerId);
    expect(meta).toBeDefined();
    if (!meta) return;
    meta.copper = 100_000;
    meta.factions.lanternwardens = 500; // Not yet Recognized (requires 1,000)
    meta.factionCurrencies.lanternwardens = 100; // Plenty of faction marks

    // Find the Church Quartermaster in Eastbrook Vale and move player into range
    const qm = [...sim.entities.values()].find(
      (e) => e.templateId === 'npc_church_order_quartermaster',
    );
    expect(qm).toBeDefined();
    if (!qm) return;
    sim.player.pos.x = qm.pos.x;
    sim.player.pos.z = qm.pos.z;

    // Purchase should be refused due to standing
    sim.drainEvents();
    sim.buyItem(qm.id, 'order_prayer_beads');
    const deniedEvents = sim.drainEvents();
    expect(
      deniedEvents.some((e) => e.type === 'error' && e.text.includes('Requires Recognized')),
    ).toBe(true);
    expect(sim.countItem('order_prayer_beads')).toBe(0);
    expect(meta.copper).toBe(100_000);
    expect(meta.factionCurrencies.lanternwardens).toBe(100);

    // Increase standing to Recognized (1,000)
    meta.factions.lanternwardens = 1_000;
    sim.buyItem(qm.id, 'order_prayer_beads');
    expect(sim.countItem('order_prayer_beads')).toBe(1);
    // Tier 1 costs 15 Lantern Crests, 0 copper
    expect(meta.factionCurrencies.lanternwardens).toBe(85);
    expect(meta.copper).toBe(100_000);

    // Attempting to buy Trusted (3,000) still fails
    sim.buyItem(qm.id, 'acolytes_signet');
    expect(sim.countItem('acolytes_signet')).toBe(0);

    // Elevate standing to Trusted (3,000), but hold fewer crests than the ring (35)
    meta.factions.lanternwardens = 3_000;
    meta.factionCurrencies.lanternwardens = 10;
    sim.drainEvents();
    sim.buyItem(qm.id, 'acolytes_signet');
    expect(
      sim.drainEvents().some((e) => e.type === 'error' && e.text.includes('Lantern Crest')),
    ).toBe(true);
    expect(sim.countItem('acolytes_signet')).toBe(0);
    meta.factionCurrencies.lanternwardens = 50;
    sim.buyItem(qm.id, 'acolytes_signet');
    expect(sim.countItem('acolytes_signet')).toBe(1);
    expect(meta.factionCurrencies.lanternwardens).toBe(15); // 50 - 35
    expect(meta.copper).toBe(100_000);

    // A Proven formula is refused at Trusted and sold at Proven for 50 crests.
    sim.buyItem(qm.id, 'formula_dawnfire_etching');
    expect(sim.countItem('formula_dawnfire_etching')).toBe(0);
    meta.factions.lanternwardens = 7_000;
    meta.factionCurrencies.lanternwardens = 60;
    sim.buyItem(qm.id, 'formula_dawnfire_etching');
    expect(sim.countItem('formula_dawnfire_etching')).toBe(1);
    expect(meta.factionCurrencies.lanternwardens).toBe(10); // 60 - 50
    expect(meta.copper).toBe(100_000);
  });

  it('sells the Valestrider reins for marks at Champion behind the riding and one-per-account gates', () => {
    const sim = new Sim({ seed: 779, playerClass: 'rogue', autoEquip: false });
    sim.setPlayerLevel(20);
    const pid = sim.playerId;
    const meta = sim.meta(pid);
    if (!meta) throw new Error('fixture player missing');
    meta.copper = 2_500_000;
    meta.factionCurrencies.gilt_measure = 499;
    meta.ridingTrained = true;
    const qm = [...sim.entities.values()].find(
      (e) => e.templateId === 'npc_rift_watch_quartermaster',
    );
    if (!qm) throw new Error('quartermaster missing');
    sim.player.pos.x = qm.pos.x;
    sim.player.pos.z = qm.pos.z;
    // Vanguard is not enough.
    meta.factions.gilt_measure = 13_000;
    sim.drainEvents();
    sim.buyItem(qm.id, 'reins_avian_strider');
    expect(
      sim.drainEvents().some((e) => e.type === 'error' && e.text.includes('Requires Champion')),
    ).toBe(true);
    expect(sim.countItem('reins_avian_strider', pid)).toBe(0);
    // Champion, but the riding skill gate comes first.
    meta.factions.gilt_measure = 20_000;
    meta.ridingTrained = false;
    sim.buyItem(qm.id, 'reins_avian_strider');
    expect(sim.countItem('reins_avian_strider', pid)).toBe(0);
    meta.ridingTrained = true;
    // One mark short of the 500-mark price: refused, and coin cannot cover it.
    sim.drainEvents();
    sim.buyItem(qm.id, 'reins_avian_strider');
    expect(
      sim.drainEvents().some((e) => e.type === 'error' && e.text.startsWith('You need 500 ')),
    ).toBe(true);
    expect(sim.countItem('reins_avian_strider', pid)).toBe(0);
    expect(meta.factionCurrencies.gilt_measure).toBe(499);
    expect(meta.copper).toBe(2_500_000);
    // Enough marks: the purchase spends exactly 500 of them and no coin.
    meta.factionCurrencies.gilt_measure = 550;
    sim.buyItem(qm.id, 'reins_avian_strider');
    expect(sim.countItem('reins_avian_strider', pid)).toBe(1);
    expect(meta.factionCurrencies.gilt_measure).toBe(50);
    expect(meta.copper).toBe(2_500_000);
    // One per account: owning the reins IS owning the mount.
    sim.drainEvents();
    sim.buyItem(qm.id, 'reins_avian_strider');
    expect(
      sim.drainEvents().some((e) => e.type === 'error' && e.text.includes('already own')),
    ).toBe(true);
    expect(sim.countItem('reins_avian_strider', pid)).toBe(1);
    expect(meta.factionCurrencies.gilt_measure).toBe(50);
    expect(meta.copper).toBe(2_500_000);
  });

  it('a bought formula teaches its enchant once the buyer holds Enchanting 100', () => {
    const sim = new Sim({ seed: 778, playerClass: 'warrior', autoEquip: false });
    const pid = sim.playerId;
    const meta = sim.meta(pid);
    if (!meta) throw new Error('fixture player missing');
    sim.addItem('formula_piston_drive', 1, pid);
    meta.craftSkills.enchanting = 99;
    sim.useItem('formula_piston_drive');
    expect(meta.knownRecipes.has('enchant_weapon_piston_drive')).toBe(false);
    expect(sim.countItem('formula_piston_drive', pid)).toBe(1);
    meta.craftSkills.enchanting = 100;
    sim.useItem('formula_piston_drive');
    expect(meta.knownRecipes.has('enchant_weapon_piston_drive')).toBe(true);
    expect(sim.countItem('formula_piston_drive', pid)).toBe(0);
  });

  it('marks locked rows and supplies requirement metadata in buildVendorView', () => {
    const balances = {
      copper: 50_000,
      honor: 0,
      gatheringProficiency: { mining: 0, logging: 0, herbalism: 0 },
      factions: {
        gilt_measure: 1_200, // Recognized
        lanternwardens: 0,
        hearthwright_compact: 8_000, // Proven,
        bracken_circle: 0,
      },
    };

    const vendorStock = [
      'tidewatchers_locket', // Recognized (1,000) -> Unlocked
      'rift_surveyors_satchel', // Trusted (3,000) -> Locked
      'cogwork_choker', // Recognized (1,000) -> Unlocked
      'formula_piston_drive', // Proven (7,000) -> Unlocked
      'forgemaster_crag_cleaver', // Vanguard (13,000) -> Locked
    ];

    const view = buildVendorView(vendorStock, [], ITEMS, balances);
    expect(view.goods.length).toBe(5);

    const r1 = view.goods.find((g) => g.itemId === 'tidewatchers_locket');
    expect(r1).toBeDefined();
    expect(r1?.requirementUnmet).toBe(false);

    const r2 = view.goods.find((g) => g.itemId === 'rift_surveyors_satchel');
    expect(r2).toBeDefined();
    expect(r2?.requirementUnmet).toBe(true);
    expect(r2?.factionRequirement?.standingTier).toBe('trusted');

    const a1 = view.goods.find((g) => g.itemId === 'cogwork_choker');
    expect(a1).toBeDefined();
    expect(a1?.requirementUnmet).toBe(false);

    const a3 = view.goods.find((g) => g.itemId === 'formula_piston_drive');
    expect(a3).toBeDefined();
    expect(a3?.requirementUnmet).toBe(false);

    const a4 = view.goods.find((g) => g.itemId === 'forgemaster_crag_cleaver');
    expect(a4).toBeDefined();
    expect(a4?.requirementUnmet).toBe(true);
    expect(a4?.factionRequirement?.standingTier).toBe('vanguard');
  });

  it('every item in FACTION_VENDOR_STOCK is listed in buildVendorView, including allied conveniences', () => {
    for (const factionId of FACTION_IDS) {
      const stock = FACTION_VENDOR_STOCK[factionId];
      const balances = {
        copper: 100_000,
        honor: 0,
        gatheringProficiency: { mining: 0, logging: 0, herbalism: 0 },
        factions: {
          gilt_measure: 0,
          lanternwardens: 0,
          hearthwright_compact: 0,
          bracken_circle: 0,
        },
        factionCurrencies: {
          gilt_measure: 0,
          lanternwardens: 0,
          hearthwright_compact: 0,
          bracken_circle: 0,
        },
        vendorFactionId: factionId,
      };
      const view = buildVendorView(stock, [], ITEMS, balances);
      expect(view.goods.map((g) => g.itemId)).toEqual([...stock]);
      expect(view.goods.some((g) => g.itemId === 'cartographers_ink')).toBe(true);
      expect(view.goods.some((g) => g.itemId === 'allied_hearthstone')).toBe(true);
      expect(view.goods.some((g) => g.itemId === 'allied_vanguard_duffel')).toBe(true);
    }
  });
});
