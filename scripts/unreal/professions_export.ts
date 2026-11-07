// Gathering and crafting exports for the native client (W9, ea-plan.md; decision D1: every C++
// port of a TS rule is pinned by vectors the TS code produced). Two kinds of file, both written
// under scripts/unreal/protocol/ and copied into the Unreal repo:
//   parity/prof_<suite>.json   { suite, source, note, cases: [{ in, out }] } (the WyndParity shape)
//   professions/<table>.json   the content the client lists and targets (recipes, nodes, trees,
//                              stations, professions, constants), read by WyndlewoodProfessions.
// Built from the player-housing sim (the realm the dev server runs), so the client's
// numbers are the live server's. Regenerate and freshness-test with
//   UNREAL_PROF_UPDATE=1 npx vitest run tests/unreal_professions_export.test.ts
// Pure: no rng, no clock, deterministic order everywhere.

import { chopHitsBy, fallPoseAt, regrowScaleAt } from '../../src/render/tree_felling_core';
import {
  CRAFT_BATCH_MAX,
  CRAFT_RING,
  GATHERING_PROFESSION_IDS,
  GATHERING_PROFESSIONS,
  PERK_THRESHOLDS,
  SECONDARY_CRAFTS,
  STATION_RADIUS,
  STATION_TYPE_BY_CRAFT,
  STATIONS,
} from '../../src/sim/content/professions';
import { ALL_RECIPES } from '../../src/sim/content/recipes';
import {
  FELLED_TREE_WIRE_RADIUS,
  TREE_CHOP_SWING_SECONDS,
  TREE_REGROW_SECONDS,
} from '../../src/sim/content/tree_chopping';
import { GATHER_NODES, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z, ZONES } from '../../src/sim/data';
import {
  type LifeSkillFatigueHolder,
  lifeSkillCraftXp,
  lifeSkillGatherXp,
} from '../../src/sim/life_skills/life_skill_xp';
import { craftCastDurationSec } from '../../src/sim/professions/craft_cast_duration';
import { clampCraftBatchCount, requiredReagentCountFor } from '../../src/sim/professions/crafting';
import {
  GATHER_CAST_BASE_SEC,
  gatherCastDurationSec,
  gatherNodeGainMultiplier,
  NODE_HARVEST_TABLE,
} from '../../src/sim/professions/gathering';
import { nodeMaterialFor } from '../../src/sim/professions/gathering_materials';
import { countAcrossGrades, MATERIAL_GRADES } from '../../src/sim/professions/material_grades';
import { craftActionXp, gatherActionXp } from '../../src/sim/professions/profession_xp';
import {
  PROFICIENCY_BAND_THRESHOLDS,
  proficiencyBandFor,
} from '../../src/sim/professions/proficiency_bands';
import { materialCostMultiplier, tierProgressMultiplier } from '../../src/sim/professions/wheel';
import {
  treeChopSeconds,
  treeChopSwings,
  treeRequiredToolTier,
} from '../../src/sim/trees/tree_chop';
import {
  type ChoppableTree,
  choppableTreesNear,
  treeAnchorId,
} from '../../src/sim/trees/tree_registry';
import {
  CRAFT_CAST_ID,
  GATHER_CAST_ID,
  INTERACT_RANGE,
  MAX_LEVEL,
  TREE_CHOP_CAST_ID,
  xpForLevel,
  zeroDiff,
} from '../../src/sim/types';
import { terrainHeight } from '../../src/sim/world';
import { WORLD_SEED } from '../../src/sim/world_seed';

export interface ParityCase {
  in: Record<string, number | string | boolean>;
  out: unknown;
}

export interface ParitySuite {
  suite: string;
  source: string;
  note: string;
  cases: ParityCase[];
}

/** Zones whose trees the client binds to world objects (the zones the Unreal world carries). */
export const TREE_EXPORT_ZONES = ['eastbrook_vale'];

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;

function gatherCast(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let tier = 1; tier <= 3; tier++) {
    for (let owned = 0; owned <= 5; owned++) {
      for (let band = 0; band <= 2; band++) {
        const b = band as 0 | 1 | 2;
        cases.push({
          in: { nodeTier: tier, toolTier: owned, band },
          out: {
            node: gatherCastDurationSec(tier, owned, b),
            treeSwings: treeChopSwings(tier, owned, b),
            tree: treeChopSeconds(tier, owned, b),
            treeTool: treeRequiredToolTier(tier),
          },
        });
      }
    }
  }
  for (let p = 0; p <= 320; p += 5) {
    cases.push({ in: { proficiency: p }, out: { band: proficiencyBandFor(p) } });
  }
  for (const p of [99.75, 100, 199.5, 200, 0.25]) {
    cases.push({ in: { proficiency: p }, out: { band: proficiencyBandFor(p) } });
  }
  return {
    suite: 'prof_gather_cast',
    source: 'gathering.ts gatherCastDurationSec, trees/tree_chop.ts, proficiency_bands.ts',
    note: 'node cast seconds, tree swings and seconds, required axe tier; band cases carry only proficiency',
    cases,
  };
}

function skillGain(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let p = 0; p <= 150; p += 2.5) {
    for (let tier = 1; tier <= 4; tier++) {
      cases.push({
        in: { proficiency: p, nodeTier: tier },
        out: gatherNodeGainMultiplier(p, tier),
      });
    }
  }
  for (let cap = 0; cap <= 6; cap++) {
    for (let rt = 0; rt <= 5; rt++) {
      cases.push({
        in: { capabilityTier: cap, recipeTier: rt },
        out: tierProgressMultiplier(cap, rt),
      });
    }
  }
  return {
    suite: 'prof_skill_gain',
    source: 'gathering.ts gatherNodeGainMultiplier, wheel.ts tierProgressMultiplier',
    note: 'deterministic fractional gain per harvest or craft (never a roll); craft cases carry capabilityTier',
    cases,
  };
}

function lifeXp(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let player = 1; player <= MAX_LEVEL; player++) {
    for (let content = 1; content <= MAX_LEVEL + 4; content++) {
      for (let tier = 1; tier <= 3; tier++) {
        cases.push({
          in: { kind: 'gather', contentLevel: content, playerLevel: player, tier },
          out: gatherActionXp(content, player, tier),
        });
      }
      cases.push({
        in: { kind: 'craft', contentLevel: content, playerLevel: player },
        out: craftActionXp(content, player),
      });
    }
  }
  // Fatigue sequences: one holder, a run of tasks at fixed spacing (seconds); each case is the
  // i-th task of its run, and the C++ port replays the same run on its own holder.
  const runs = [
    { kind: 'gather', content: 4, player: 12, spacing: 3, n: 60, frac: 1 },
    { kind: 'gather', content: 10, player: 12, spacing: 3, n: 20, frac: 1 },
    { kind: 'gather', content: 2, player: 9, spacing: 30, n: 40, frac: 1 },
    { kind: 'craft', content: 5, player: 15, spacing: 4, n: 50, frac: 0.5 },
    { kind: 'craft', content: 14, player: 15, spacing: 4, n: 10, frac: 0.25 },
  ];
  runs.forEach((run, ri) => {
    const holder: LifeSkillFatigueHolder = {};
    for (let i = 0; i < run.n; i++) {
      const now = 1000 + i * run.spacing;
      const xp =
        run.kind === 'gather'
          ? lifeSkillGatherXp(holder, now, run.content, 1, run.player)
          : lifeSkillCraftXp(holder, now, run.content, run.player, run.frac);
      cases.push({
        in: {
          kind: `fatigue_${run.kind}`,
          run: ri,
          index: i,
          now,
          contentLevel: run.content,
          playerLevel: run.player,
          frac: run.frac,
        },
        out: { xp, fatigue: r6(holder.lifeSkillFatigue?.value ?? 0) },
      });
    }
  });
  return {
    suite: 'prof_life_xp',
    source: 'professions/profession_xp.ts, life_skills/life_skill_xp.ts',
    note: 'character XP per harvest or craft; fatigue_* cases replay one holder in index order (tier 1 gathers)',
    cases,
  };
}

function recipeMath(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const count of [1, 2, 3, 4, 5, 7, 10, 12, 20]) {
    for (const selfSigned of [false, true]) {
      for (const skill of [0, 74, 75, 125]) {
        for (const jack of [false, true]) {
          for (const noDiscount of [false, true]) {
            const r = requiredReagentCountFor(
              selfSigned,
              { itemId: 'copper_ore', count, ...(noDiscount ? { noDiscount: true as const } : {}) },
              { weaponcrafting: skill },
              'weaponcrafting',
              jack,
            );
            cases.push({
              in: { kind: 'required', count, selfSigned, skill, jack, noDiscount },
              out: {
                count: r.count,
                multiplier: materialCostMultiplier({ weaponcrafting: skill }, 'weaponcrafting'),
              },
            });
          }
        }
      }
    }
  }
  for (const requested of [-3, 0, 0.5, 1, 2, 7.9, 49, 50, 51, 400]) {
    for (const maxByMats of [-1, 0, 1, 3, 50, 80]) {
      cases.push({
        in: { kind: 'clamp', requested, maxByMats },
        out: clampCraftBatchCount(requested, maxByMats),
      });
    }
  }
  // Craftable count over a bag: min over reagents of floor(have across grades / required), capped.
  const bags: Record<string, number>[] = [
    {},
    { copper_ore: 4 },
    { copper_ore: 3, fine_copper_ore: 2 },
    { copper_ore: 200, ironbark_log: 9 },
    { copper_ore: 11, ironbark_log: 2, linen_scrap: 40 },
  ];
  const sample = ALL_RECIPES.filter((r) => r.reagents.length > 0).slice(0, 40);
  for (const recipe of sample) {
    bags.forEach((bag, bi) => {
      let max = CRAFT_BATCH_MAX;
      for (const reagent of recipe.reagents) {
        const required = requiredReagentCountFor(false, reagent, {}, recipe.professionId).count;
        const have = countAcrossGrades(reagent.itemId, (id) => bag[id] ?? 0);
        max = Math.min(max, Math.floor(have / required));
      }
      cases.push({
        in: { kind: 'craftable', recipe: recipe.id, bag: bi, bagJson: JSON.stringify(bag) },
        out: Math.max(0, max),
      });
    });
  }
  for (const recipe of ALL_RECIPES) {
    cases.push({
      in: { kind: 'castSeconds', recipe: recipe.id },
      out: craftCastDurationSec(recipe),
    });
  }
  return {
    suite: 'prof_recipe_math',
    source:
      'professions/crafting.ts requiredReagentCountFor, clampCraftBatchCount, maxCraftCountForRecipe (bags arm), craft_cast_duration.ts',
    note: 'required: weaponcrafting skill drives the specialization multiplier; craftable: no self-signed copies, no vault',
    cases,
  };
}

function treeIds(): ParitySuite {
  const cases: ParityCase[] = [];
  for (const t of exportTrees().slice(0, 400)) {
    cases.push({ in: { x: t.x, z: t.z }, out: { id: t.id } });
  }
  // Off-lattice probes: any point maps to its nearest anchor.
  for (let i = 0; i < 60; i++) {
    const x = -300 + i * 13.37;
    const z = 120 + ((i * 7.91) % 180);
    cases.push({ in: { x, z }, out: { id: treeAnchorId(x, z) } });
  }
  return {
    suite: 'prof_tree_ids',
    source: 'trees/tree_registry.ts treeAnchorId',
    note: `world seed ${WORLD_SEED}; the first 400 choppable trees of the exported zones plus off-lattice probes`,
    cases,
  };
}

function treeFall(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let t = -0.5; t <= 7.5; t += 0.125) {
    const p = fallPoseAt(t);
    cases.push({
      in: { kind: 'fall', t },
      out: {
        angle: r6(p.angle),
        scale: r6(p.scale),
        sink: r6(p.sink),
        landed: p.landed,
        done: p.done,
      },
    });
    cases.push({ in: { kind: 'regrow', t }, out: r6(regrowScaleAt(t)) });
    cases.push({ in: { kind: 'hits', t }, out: chopHitsBy(t) });
  }
  return {
    suite: 'prof_tree_fall',
    source: 'src/render/tree_felling_core.ts fallPoseAt, regrowScaleAt, chopHitsBy',
    note: 'presentation curves (6 decimals); the client never decides a fall, it plays the server treeFelled',
    cases,
  };
}

export const PROF_PARITY_SUITES: Record<string, () => ParitySuite> = {
  prof_gather_cast: gatherCast,
  prof_skill_gain: skillGain,
  prof_life_xp: lifeXp,
  prof_recipe_math: recipeMath,
  prof_tree_ids: treeIds,
  prof_tree_fall: treeFall,
};

/** The sim terrain height (the ground the export's terrain mesh is built from), 3 decimals. */
const groundY = (x: number, z: number): number =>
  Math.round(terrainHeight(x, z, WORLD_SEED) * 1000) / 1000;

let treeCache: ChoppableTree[] | null = null;

/** Every choppable tree of TREE_EXPORT_ZONES, ascending id. */
export function exportTrees(): ChoppableTree[] {
  if (treeCache) return treeCache;
  const byId = new Map<number, ChoppableTree>();
  for (const zoneId of TREE_EXPORT_ZONES) {
    const zone = ZONES.find((z) => z.id === zoneId);
    if (!zone) continue;
    const minX = zone.xMin ?? -WORLD_MAX_X;
    const maxX = zone.xMax ?? WORLD_MAX_X;
    const step = 40;
    const z0 = Math.max(zone.zMin, WORLD_MIN_Z);
    const z1 = Math.min(zone.zMax, WORLD_MAX_Z);
    for (let x = minX; x <= maxX + step; x += step) {
      for (let z = z0; z <= z1 + step; z += step) {
        for (const t of choppableTreesNear(WORLD_SEED, x, z, step * 0.75)) {
          if (t.zoneId === zoneId) byId.set(t.id, t);
        }
      }
    }
  }
  treeCache = [...byId.values()].sort((a, b) => a.id - b.id);
  return treeCache;
}

/** The content tables, one JSON file each under protocol/professions/. */
export function professionTables(): Record<string, unknown> {
  const recipes = ALL_RECIPES.map((r) => ({
    id: r.id,
    professionId: r.professionId,
    resultItemId: r.resultItemId,
    resultCount: r.resultCount,
    reagents: r.reagents.map((g) => ({
      itemId: g.itemId,
      count: g.count,
      ...(g.noDiscount ? { noDiscount: true } : {}),
    })),
    skillReq: r.skillReq,
    level: r.level,
    stationType: r.stationType ?? null,
    knownByDefault: !r.acquisition || r.acquisition.length === 0,
    acquisition: r.acquisition ?? [],
    consumeOnCraft: r.consumeOnCraft === true,
    oncePerDay: r.oncePerDay === true,
    combo: r.comboRequirement ?? null,
    castSeconds: craftCastDurationSec(r),
  }));
  const nodes = GATHER_NODES.map((n) => ({
    id: n.id,
    zoneId: n.zoneId,
    type: n.type,
    x: n.pos.x,
    y: groundY(n.pos.x, n.pos.z),
    z: n.pos.z,
    level: n.level,
    tier: n.tier,
    professionId: NODE_HARVEST_TABLE[n.type].professionId,
    itemId: nodeMaterialFor(n.type, n.zoneId).itemId,
  }));
  const trees = exportTrees().map((t) => ({
    id: t.id,
    x: t.x,
    y: groundY(t.x, t.z),
    z: t.z,
    kind: t.kind,
    scale: t.scale,
    zoneId: t.zoneId,
    tier: t.tier,
    level: t.level,
    itemId: nodeMaterialFor('wood', t.zoneId).itemId,
  }));
  const stations = STATIONS.map((s) => ({
    id: s.id,
    type: s.type,
    zoneId: s.zoneId,
    x: s.pos.x,
    z: s.pos.z,
  }));
  const professions = {
    gathering: GATHERING_PROFESSION_IDS.map((id) => ({
      id,
      maxSkill: GATHERING_PROFESSIONS[id].maxSkill,
    })),
    crafting: [...CRAFT_RING, ...SECONDARY_CRAFTS].map((c) => ({
      id: c.id,
      maxSkill: c.maxSkill,
      stationType: STATION_TYPE_BY_CRAFT[c.id] ?? null,
      specializedAt: PERK_THRESHOLDS[c.id]?.specializedSkillThreshold ?? null,
      materialDiscountPct: PERK_THRESHOLDS[c.id]?.materialDiscountPct ?? 0,
    })),
  };
  const xpTable: number[] = [];
  const zeroDiffs: number[] = [];
  for (let l = 1; l <= MAX_LEVEL; l++) {
    xpTable.push(xpForLevel(l));
    zeroDiffs.push(zeroDiff(l));
  }
  const zStart = WORLD_MIN_Z + 14;
  const constants = {
    worldSeed: WORLD_SEED,
    lattice: {
      step: 10,
      xStart: -(WORLD_MAX_X - 14),
      zStart,
      zCount: Math.max(0, Math.ceil((WORLD_MAX_Z - 14 - zStart) / 10)),
    },
    interactRange: INTERACT_RANGE,
    stationRadius: STATION_RADIUS,
    craftBatchMax: CRAFT_BATCH_MAX,
    treeRegrowSeconds: TREE_REGROW_SECONDS,
    treeChopSwingSeconds: TREE_CHOP_SWING_SECONDS,
    felledTreeWireRadius: FELLED_TREE_WIRE_RADIUS,
    gatherCastBaseSeconds: GATHER_CAST_BASE_SEC,
    proficiencyBands: [...PROFICIENCY_BAND_THRESHOLDS],
    castIds: { gather: GATHER_CAST_ID, chop: TREE_CHOP_CAST_ID, craft: CRAFT_CAST_ID },
    nodeRespawnSeconds: Object.fromEntries(
      Object.entries(NODE_HARVEST_TABLE).map(([k, v]) => [k, v.respawnSeconds]),
    ),
    maxLevel: MAX_LEVEL,
    xpForLevel: xpTable,
    zeroDiff: zeroDiffs,
    materialGrades: Object.fromEntries(
      Object.entries(MATERIAL_GRADES).map(([k, v]) => [k, v.fineItemId]),
    ),
  };
  return { recipes, nodes, trees, stations, professions, constants };
}
