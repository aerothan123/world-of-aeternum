// W4 (quests and progression) exports for the native Unreal client, beside the W0 parity
// exporter (scripts/unreal/parity_export.ts) and in its file shape. Two kinds of output:
//   - parity suites (scripts/unreal/protocol/parity/<suite>.json): the authoritative TS rule run
//     over a fixed input grid; the Unreal tests `Wyndlewood.Progression.Parity.*` replay them;
//   - the progression content (scripts/unreal/protocol/progression/progression_content.json):
//     the quest, NPC, faction, talent and zone records the client presents (titles, objectives,
//     givers, levels, rewards), with English text resolved exactly as the web client's English
//     build resolves it (tEntity, tTalent), so the native client shows the same words.
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_progression_export.test.ts`,
// then copy into the Unreal worktree (Data/Parity/, Data/Progression/).

import { rowTreeFor } from '../../src/sim/content/talent_rows';
import { ROW_LEVELS, talentPointsAtLevel, talentsFor } from '../../src/sim/content/talents';
import { ITEMS, NPCS, PROPS, QUESTS, ZONES, zoneAt } from '../../src/sim/data';
import {
  FACTION_IDS,
  FACTION_TIER_TITLES,
  FACTIONS,
  factionCurrencyName,
  maxStandingForLevel,
  STANDING_THRESHOLDS,
  STANDING_TIERS,
  standingProgress,
} from '../../src/sim/factions';
import { computeQuestState } from '../../src/sim/quests/quest_commands';
import { npcQuestMarkerKind } from '../../src/sim/quests/quest_marker_kind';
import { questFixedReward, questRewardChoices } from '../../src/sim/quests/quest_reward_choice';
import {
  outLevelXpFactor,
  questBaseXp,
  questIsRepeatable,
  questLevelOf,
  questRewardXp,
} from '../../src/sim/quests/quest_xp';
import { Sim } from '../../src/sim/sim';
import {
  ALL_CLASSES,
  MAX_LEVEL,
  type PlayerClass,
  type QuestDef,
  type QuestProgress,
  questTurnInNpcIds,
  XP_TABLE,
  xpForLevel,
} from '../../src/sim/types';
import { terrainHeight } from '../../src/sim/world';
import { classDisplayName, tEntity } from '../../src/ui/entity_i18n';
import { tTalent } from '../../src/ui/talent_i18n';
import { xpBarView } from '../../src/ui/xp_bar';
import type { ParityCase, ParitySuite } from './parity_export';

export const PROGRESSION_EXPORT_SUBDIR = 'progression';
export const PROGRESSION_CONTENT_FILE = 'progression_content.json';

/** The quest families the EA client presents first: the Proving Shore, chapters one and two. */
export function isStoryQuest(id: string): boolean {
  return id.startsWith('q_ps_') || id.startsWith('c1_') || id.startsWith('c2_');
}

function storyQuests(): QuestDef[] {
  return Object.values(QUESTS).filter((q) => isStoryQuest(q.id));
}

// ---------------------------------------------------------------------------
// Parity suites

/** The XP bar per level (XP_TABLE) and its cap. */
function xpCurve(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let level = 1; level <= MAX_LEVEL + 2; level++) {
    cases.push({ in: { level }, out: { xpForLevel: xpForLevel(level), maxLevel: MAX_LEVEL } });
  }
  return {
    suite: 'progression_xp_curve',
    source: 'src/sim/types.ts XP_TABLE, xpForLevel, MAX_LEVEL',
    note: 'levels past the cap read the last bar',
    cases,
  };
}

/** The XP bar view (fill, rested overlay, whole percent) at and below the cap. */
function xpBar(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const need = xpForLevel(level);
    for (const share of [0, 0.25, 0.5, 0.999]) {
      for (const rested of [0, 0.3, 1.6]) {
        const xp = Math.floor(need * share);
        const restedXp = Math.round(need * rested);
        const v = xpBarView({ level, xp, lifetimeXp: 0, restedXp, showOverflow: false });
        cases.push({
          in: { level, xp, restedXp },
          out: {
            fillFrac: v.fillFrac,
            restedFrac: v.restedFrac,
            percent: Math.floor(v.fillFrac * 100),
          },
        });
      }
    }
  }
  return {
    suite: 'progression_xp_bar',
    source: 'src/ui/xp_bar.ts xpBarView (showOverflow false)',
    note: 'percent is the floored whole percent the bar prints',
    cases,
  };
}

function freshSim(): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
}

/** Rested XP: the kill bonus (min(floor(pool), award)), level-ups through the bar, the cap, and
 *  the accrual per tick inside an inn, all answered by a live Sim. */
function xpRested(): ParitySuite {
  const cases: ParityCase[] = [];
  const grants: [number, number, number, number, boolean][] = [];
  for (const level of [1, 2, 5, 9, 14, 19, 20]) {
    const need = xpForLevel(level);
    for (const [xpShare, rested, amount, kill] of [
      [0, 0, 120, true],
      [0.5, 1000, 100, true],
      [0.1, 30.75, 100, true],
      [0.9, 500, Math.ceil(need * 0.3), true],
      [0.9, 500, Math.ceil(need * 0.3), false],
      [0.2, 0, need * 3, false],
    ] as [number, number, number, boolean][]) {
      grants.push([level, Math.floor(need * xpShare), rested, amount, kill]);
    }
  }
  for (const [level, xp, rested, amount, kill] of grants) {
    const sim = freshSim();
    const meta = sim.meta(sim.playerId)!;
    sim.player.level = level;
    meta.xp = xp;
    meta.restedXp = rested;
    sim.tick();
    meta.restedXp = rested;
    sim.grantXp(amount, meta, kill ? { fromKill: true } : undefined);
    const events = sim.tick();
    const xpEv = events.find((e) => e.type === 'xp') as
      | { amount: number; rested?: number }
      | undefined;
    cases.push({
      in: { kind: 'grant', level, xp, rested, amount, kill },
      out: {
        level: sim.player.level,
        xp: meta.xp,
        rested: meta.restedXp,
        bonus: xpEv?.rested ?? 0,
        awarded: xpEv?.amount ?? 0,
      },
    });
  }
  const inn = PROPS.buildings.find((b) => b.kind === 'inn');
  if (inn) {
    for (const level of [1, 4, 10, 19, 20]) {
      for (const [start, ticks] of [
        [0, 40],
        [1.5 * xpForLevel(level) - 1, 40],
      ] as [number, number][]) {
        const sim = freshSim();
        const meta = sim.meta(sim.playerId)!;
        const p = sim.player;
        p.pos.x = inn.x;
        p.pos.z = inn.z;
        p.pos.y = terrainHeight(inn.x, inn.z, sim.cfg.seed);
        p.prevPos = { ...p.pos };
        p.level = level;
        meta.restedXp = start;
        for (let i = 0; i < ticks; i++) sim.tick();
        cases.push({
          in: { kind: 'accrue', level, rested: start, ticks },
          out: { rested: meta.restedXp, cap: 1.5 * xpForLevel(level) },
        });
      }
    }
  }
  return {
    suite: 'progression_xp_rested',
    source: 'src/sim/combat/damage.ts grantXp, src/sim/progression/xp.ts updateRested',
    note: 'accrual cases stand inside the first authored inn; rested values are doubles',
    cases,
  };
}

/** Quest XP: the base per quest and the classic out-level reduction per player level. */
function questXp(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let above = -3; above <= 12; above++) {
    cases.push({
      in: { kind: 'factor', levelsAbove: above },
      out: { factor: outLevelXpFactor(above) },
    });
  }
  for (const q of storyQuests()) {
    for (const playerLevel of [1, 3, 5, 8, 10, 12, 15, 20]) {
      cases.push({
        in: {
          kind: 'quest',
          questId: q.id,
          playerLevel,
          questLevel: questLevelOf(q),
          baseXp: questBaseXp(q),
          repeatable: questIsRepeatable(q),
        },
        out: { xp: questRewardXp(q, playerLevel) },
      });
    }
  }
  return {
    suite: 'progression_quest_xp',
    source: 'src/sim/quests/quest_xp.ts questRewardXp, outLevelXpFactor',
    note: 'inputs carry the content base and level so the port is checked on the arithmetic alone',
    cases,
  };
}

/** Quest availability and the NPC marker for the story chains over levels and done sets. */
function questState(): ParitySuite {
  const cases: ParityCase[] = [];
  const quests = storyQuests();
  const chainDone: string[] = [];
  for (const q of quests) if (q.id.startsWith('q_ps_')) chainDone.push(q.id);
  const doneSets: { name: string; done: string[] }[] = [
    { name: 'fresh', done: [] },
    { name: 'shore', done: chainDone },
    {
      name: 'vouched',
      done: [...chainDone, 'c1_01_arrival', 'c1_02_beacon_lied', 'c1_07_across', 'c1_08_vouch'],
    },
  ];
  for (const set of doneSets) {
    const done = new Set(set.done);
    for (const level of [1, 2, 3, 4, 6, 10]) {
      for (const cls of ['warrior', 'mage'] as PlayerClass[]) {
        for (const q of quests) {
          const log = new Map<string, QuestProgress>();
          const state = computeQuestState(q.id, log, done, level, undefined, undefined, cls);
          const giver = npcQuestMarkerKind(q, q.giverNpcId, state, done);
          cases.push({
            in: {
              questId: q.id,
              set: set.name,
              done: set.done.join(','),
              level,
              cls,
              logState: '',
            },
            out: { state, giverMarker: giver },
          });
        }
      }
    }
  }
  // In the log: active and ready at the giver and at the turn-in.
  for (const q of quests.slice(0, 30)) {
    for (const logState of ['active', 'ready'] as const) {
      const log = new Map<string, QuestProgress>([
        [q.id, { questId: q.id, counts: q.objectives.map(() => 0), state: logState }],
      ]);
      const state = computeQuestState(q.id, log, new Set(), 1, undefined, undefined, 'warrior');
      const turnIn = questTurnInNpcIds(q)[0];
      cases.push({
        in: { questId: q.id, set: 'log', done: '', level: 1, cls: 'warrior', logState },
        out: {
          state,
          giverMarker: npcQuestMarkerKind(q, q.giverNpcId, state, new Set()),
          turnInMarker: npcQuestMarkerKind(q, turnIn, state, new Set()),
        },
      });
    }
  }
  return {
    suite: 'progression_quest_state',
    source:
      'src/sim/quests/quest_commands.ts computeQuestState, quest_marker_kind.ts npcQuestMarkerKind',
    note: 'no profession state and no cadence set (the story chains use neither)',
    cases,
  };
}

/** Standing tiers, progress inside a tier and the level cap. */
function standing(): ParitySuite {
  const cases: ParityCase[] = [];
  const points = new Set<number>([
    -50, 0, 1, 999, 1000, 1001, 2999, 3000, 3500, 6999, 7000, 12_999, 13_000, 19_999, 20_000,
    25_000,
  ]);
  for (const t of STANDING_TIERS) points.add(STANDING_THRESHOLDS[t] + 250);
  for (const rep of [...points].sort((a, b) => a - b)) {
    for (const level of [1, 4, 5, 15, 16, 20]) {
      const p = standingProgress(rep);
      const cap = maxStandingForLevel(level);
      cases.push({
        in: { reputation: rep, level },
        out: {
          tier: p.tier,
          tierIndex: STANDING_TIERS.indexOf(p.tier),
          current: p.current,
          tierProgress: p.tierProgress,
          tierRequired: p.tierRequired,
          percent: p.percent,
          levelCap: cap,
          cappedByLevel: p.tierNext !== null && p.tierNext > cap,
        },
      });
    }
  }
  return {
    suite: 'progression_standing',
    source: 'src/sim/factions.ts standingProgress, maxStandingForLevel',
    note: 'cappedByLevel follows src/ui/hud/reputation/reputation_view.ts buildReputationRow',
    cases,
  };
}

/** Talent points per level and the row levels. */
function talentPoints(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let level = 0; level <= MAX_LEVEL + 3; level++) {
    cases.push({
      in: { level },
      out: { points: talentPointsAtLevel(level), rowLevels: ROW_LEVELS.join(',') },
    });
  }
  return {
    suite: 'progression_talent_points',
    source: 'src/sim/content/talents.ts talentPointsAtLevel, talent_rows.ts ROW_LEVELS',
    note: 'one point (one choice row) per row level reached',
    cases,
  };
}

export const PROGRESSION_PARITY_SUITES: Record<string, () => ParitySuite> = {
  progression_xp_curve: xpCurve,
  progression_xp_bar: xpBar,
  progression_xp_rested: xpRested,
  progression_quest_xp: questXp,
  progression_quest_state: questState,
  progression_standing: standing,
  progression_talent_points: talentPoints,
};

export function buildProgressionSuite(name: string): ParitySuite {
  const build = PROGRESSION_PARITY_SUITES[name];
  if (!build) throw new Error(`unknown progression parity suite ${name}`);
  return build();
}

// ---------------------------------------------------------------------------
// Content

function itemName(id: string): string {
  return ITEMS[id] ? tEntity({ kind: 'item', id, field: 'name' }) : id;
}

function questChapter(id: string): string {
  if (id.startsWith('q_ps_')) return 'proving_shore';
  if (id.startsWith('c1_')) return 'chapter1';
  if (id.startsWith('c2_')) return 'chapter2';
  return 'world';
}

function questZone(q: QuestDef): string {
  const npc = NPCS[q.giverNpcId] as { pos?: { x: number; z: number } } | undefined;
  return npc?.pos ? zoneAt(npc.pos.x, npc.pos.z).id : '';
}

function questRecord(q: QuestDef) {
  const rewardsByClass: Record<string, { fixed: string | null; choices: string[] }> = {};
  for (const cls of ALL_CLASSES) {
    const fixed = questFixedReward(q, cls) ?? null;
    const choices = [...questRewardChoices(q, cls)];
    if (fixed || choices.length > 0) rewardsByClass[cls] = { fixed, choices };
  }
  return {
    id: q.id,
    chapter: questChapter(q.id),
    zoneId: questZone(q),
    title: tEntity({ kind: 'quest', id: q.id, field: 'title' }),
    text: tEntity({
      kind: 'quest',
      id: q.id,
      field: 'text',
      values: { playerName: '{playerName}' },
    }),
    completion: tEntity({
      kind: 'quest',
      id: q.id,
      field: 'completion',
      values: { playerName: '{playerName}' },
    }),
    level: questLevelOf(q),
    minLevel: q.minLevel ?? 0,
    maxLevel: q.maxLevel ?? 0,
    requiresQuest: q.requiresQuest ?? '',
    requiredClass: q.requiredClass ?? [],
    repeatable: !!q.repeatable,
    retired: !!q.retired,
    giver: q.townBoard === undefined ? q.giverNpcId : '',
    turnIns: [...questTurnInNpcIds(q)],
    baseXp: questBaseXp(q),
    copper: q.copperReward,
    suggestedPlayers: q.suggestedPlayers ?? 0,
    shareable: q.shareable !== false,
    standing: q.standingReward ?? null,
    rewardsByClass,
    objectives: q.objectives.map((o, i) => ({
      type: o.type,
      count: o.count,
      label: tEntity({ kind: 'questObjective', questId: q.id, objectiveIndex: i, field: 'label' }),
      targetNpc: o.type === 'interact' && o.targetNpcId ? o.targetNpcId : '',
    })),
  };
}

export function buildProgressionContent() {
  const quests = Object.values(QUESTS)
    .filter((q) => !q.retired || isStoryQuest(q.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(questRecord);
  const items: Record<string, string> = {};
  for (const q of quests) {
    for (const r of Object.values(q.rewardsByClass)) {
      for (const id of [r.fixed, ...r.choices]) if (id) items[id] = itemName(id);
    }
  }
  const npcs = Object.values(NPCS)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((n) => ({
      id: n.id,
      name: tEntity({ kind: 'npc', id: n.id, field: 'name' }),
      title: tEntity({ kind: 'npc', id: n.id, field: 'title' }),
      greeting: tEntity({
        kind: 'npc',
        id: n.id,
        field: 'greeting',
        values: {
          className: '{className}',
          classNameLower: '{classNameLower}',
          playerName: '{playerName}',
        },
      }),
      questIds: [...n.questIds],
    }));
  const factions = FACTION_IDS.map((id) => ({
    id,
    name: FACTIONS[id].name,
    hub: FACTIONS[id].hub.name,
    hubZoneId: FACTIONS[id].hub.zoneId,
    currency: factionCurrencyName(id),
    titles: STANDING_TIERS.map((t) => FACTION_TIER_TITLES[id][t]),
  }));
  const talents: Record<string, unknown> = {};
  for (const cls of ALL_CLASSES) {
    const tree = rowTreeFor(cls);
    const ct = talentsFor(cls);
    talents[cls] = {
      name: classDisplayName(cls),
      specs: (ct?.specs ?? []).map((s) => ({
        id: s.id,
        role: s.role,
        name: tTalent({ kind: 'talentSpec', spec: s, field: 'name' }),
        description: tTalent({ kind: 'talentSpec', spec: s, field: 'description' }),
      })),
      rows: (tree ?? []).map((row) => ({
        level: row.level,
        options: row.options.map((o) => ({
          id: o.id,
          name: tTalent({ kind: 'talentChoice', choice: o, field: 'name' }),
          description: tTalent({ kind: 'talentChoice', choice: o, field: 'description' }),
        })),
      })),
    };
  }
  const zones: Record<string, string> = {};
  for (const z of ZONES) zones[z.id] = tEntity({ kind: 'zone', id: z.id, field: 'name' });
  return {
    source: 'scripts/unreal/progression_export.ts',
    maxLevel: MAX_LEVEL,
    xpTable: [...XP_TABLE],
    standingThresholds: STANDING_TIERS.map((t) => STANDING_THRESHOLDS[t]),
    standingTiers: [...STANDING_TIERS],
    rowLevels: [...ROW_LEVELS],
    quests,
    npcs,
    factions,
    talents,
    zones,
    items,
  };
}
