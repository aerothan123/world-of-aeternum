// Quest Workshop pure core: the JSON <-> QuestDef mapping, the id slug, the
// validation rules (plain-English messages are the page's job: this module
// emits stable issue CODES the page maps to t() keys), the prerequisite cycle
// check, and the deterministic emitter for
// src/sim/content/workshop_quests.generated.ts.
//
// Deterministic, DOM-free, i18n-free, and content-free: everything it checks
// ids against arrives as a ContentIndex (content_index_core.ts), so the browser
// page and the dev-server save endpoint run the SAME rules over the same
// picture, and a Vitest can drive it over a hand-built index.

import type { GatherNodeType, PlayerClass, QuestDef, QuestObjective } from '../sim/types';
import { type ContentIndex, PLAYER_CLASSES } from './content_index_core';

/** The objective kinds the workshop authors (the rest of the QuestObjective
 *  union is scripted content a system module credits, not form data). */
export const WORKSHOP_OBJECTIVE_KINDS = ['kill', 'collect', 'interact', 'gather', 'craft'] as const;
export type WorkshopObjectiveKind = (typeof WORKSHOP_OBJECTIVE_KINDS)[number];

/** The id shape every quest id in the game follows; the workshop prefixes its
 *  suggestions with `q_ws_` so an owner-made quest can be told apart at a glance. */
export const QUEST_ID_RE = /^q_[a-z0-9_]+$/;
export const WORKSHOP_ID_PREFIX = 'q_ws_';
export const MAX_QUEST_ID_LENGTH = 64;
export const MAX_NAME_LENGTH = 80;
export const MAX_TEXT_LENGTH = 2000;
export const MAX_OBJECTIVES = 8;
export const MAX_OBJECTIVE_COUNT = 999;
export const MAX_WORKSHOP_QUESTS = 500;

export type WorkshopObjective = Extract<QuestObjective, { type: WorkshopObjectiveKind }>;

/** The fields the workshop authors. A strict subset of QuestDef: a workshop
 *  quest IS a QuestDef (`toQuestDef`), with every other field defaulted. */
export interface WorkshopQuest {
  id: string;
  name: string;
  giverNpcId: string;
  turnInNpcId: string;
  text: string;
  completionText: string;
  objectives: WorkshopObjective[];
  xpReward: number;
  copperReward: number;
  itemRewards: Partial<Record<PlayerClass, string>>;
  choiceRewards: string[];
  recipeReward: string | null;
  requiresQuest: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  requiredClass: PlayerClass[];
}

export type IssueCode =
  | 'name_missing'
  | 'name_too_long'
  | 'id_invalid'
  | 'id_too_long'
  | 'id_taken'
  | 'id_duplicate'
  | 'giver_unknown'
  | 'giver_not_quest_giver'
  | 'turn_in_unknown'
  | 'text_missing'
  | 'text_too_long'
  | 'completion_missing'
  | 'completion_too_long'
  | 'objectives_empty'
  | 'objectives_too_many'
  | 'objective_count'
  | 'objective_label_missing'
  | 'objective_kind_unknown'
  | 'mob_unknown'
  | 'item_unknown'
  | 'item_unobtainable'
  | 'interact_target_missing'
  | 'interact_npc_unknown'
  | 'interact_object_unknown'
  | 'gather_target_missing'
  | 'gather_node_unknown'
  | 'gather_item_unknown'
  | 'gather_item_no_node'
  | 'recipe_unknown'
  | 'xp_invalid'
  | 'copper_invalid'
  | 'reward_item_unknown'
  | 'reward_class_unknown'
  | 'choice_item_unknown'
  | 'recipe_reward_unknown'
  | 'prerequisite_unknown'
  | 'prerequisite_self'
  | 'prerequisite_cycle'
  | 'level_invalid'
  | 'level_range'
  | 'class_unknown';

export interface ValidationIssue {
  code: IssueCode;
  /** The objective row the issue is about, when it is about one. */
  objectiveIndex?: number;
  /** The offending id or value, for the message. */
  value?: string;
}

// ---------------------------------------------------------------------------
// Slug + id
// ---------------------------------------------------------------------------

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

/** `q_ws_<slug of name>`, numbered past any taken id (`_2`, `_3`, ...). */
export function suggestQuestId(name: string, taken: ReadonlySet<string>): string {
  const base = `${WORKSHOP_ID_PREFIX}${slugify(name) || 'quest'}`.slice(0, MAX_QUEST_ID_LENGTH);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, MAX_QUEST_ID_LENGTH - `_${n}`.length)}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// JSON <-> record mapping
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const optNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const optStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function objectiveFromJson(raw: unknown): WorkshopObjective {
  const o = isRecord(raw) ? raw : {};
  const count = num(o.count, 1);
  const label = str(o.label);
  const type = str(o.type) as WorkshopObjectiveKind;
  switch (type) {
    case 'collect':
      return { type, count, label, itemId: str(o.itemId) };
    case 'interact': {
      const out: WorkshopObjective = { type, count, label };
      const npc = optStr(o.targetNpcId);
      const object = optStr(o.targetObjectItemId);
      if (npc !== null) out.targetNpcId = npc;
      if (object !== null) out.targetObjectItemId = object;
      return out;
    }
    case 'gather': {
      const nodeType = optStr(o.nodeType);
      const itemId = optStr(o.itemId);
      if (nodeType !== null) {
        const out: WorkshopObjective = { type, count, label, nodeType: nodeType as GatherNodeType };
        if (itemId !== null) out.itemId = itemId;
        return out;
      }
      return { type, count, label, itemId: itemId ?? '' };
    }
    case 'craft':
      return { type, count, label, recipeId: str(o.recipeId) };
    default:
      // An unknown kind maps to a kill row with the raw kind preserved for the
      // validator to report (objective_kind_unknown); never silently dropped.
      return { type: 'kill', count, label, targetMobId: str(o.targetMobId) };
  }
}

/** Tolerant decode of ONE quest's JSON (an unknown value) into the workshop
 *  shape. Never throws: a missing or mistyped field reads as its empty value
 *  and the validator reports it. The raw objective kinds are returned beside
 *  the quest so an unknown kind is reported rather than silently coerced. */
export function workshopQuestFromJson(raw: unknown): {
  quest: WorkshopQuest;
  rawObjectiveKinds: string[];
} {
  const r = isRecord(raw) ? raw : {};
  const rawObjectives = Array.isArray(r.objectives) ? r.objectives : [];
  const itemRewards: Partial<Record<PlayerClass, string>> = {};
  if (isRecord(r.itemRewards)) {
    for (const [cls, itemId] of Object.entries(r.itemRewards)) {
      if (typeof itemId === 'string' && itemId !== '') {
        itemRewards[cls as PlayerClass] = itemId;
      }
    }
  }
  const quest: WorkshopQuest = {
    id: str(r.id),
    name: str(r.name),
    giverNpcId: str(r.giverNpcId),
    turnInNpcId: str(r.turnInNpcId) || str(r.giverNpcId),
    text: str(r.text),
    completionText: str(r.completionText),
    objectives: rawObjectives.map(objectiveFromJson),
    xpReward: num(r.xpReward, 0),
    copperReward: num(r.copperReward, 0),
    itemRewards,
    choiceRewards: strList(r.choiceRewards),
    recipeReward: optStr(r.recipeReward),
    requiresQuest: optStr(r.requiresQuest),
    minLevel: optNum(r.minLevel),
    maxLevel: optNum(r.maxLevel),
    requiredClass: strList(r.requiredClass) as PlayerClass[],
  };
  return {
    quest,
    rawObjectiveKinds: rawObjectives.map((o) => (isRecord(o) ? str(o.type) : '')),
  };
}

/** The workshop quest as the QuestDef the game reads. Optional fields are
 *  emitted only when set, so the generated record reads like a hand-authored
 *  one. */
export function toQuestDef(quest: WorkshopQuest): QuestDef {
  const def: QuestDef = {
    id: quest.id,
    name: quest.name,
    giverNpcId: quest.giverNpcId,
    turnInNpcId: quest.turnInNpcId,
    text: quest.text,
    completionText: quest.completionText,
    objectives: quest.objectives.map((o) => ({ ...o })),
    xpReward: quest.xpReward,
    copperReward: quest.copperReward,
    itemRewards: { ...quest.itemRewards },
  };
  if (quest.choiceRewards.length > 0) def.choiceRewards = [...quest.choiceRewards];
  if (quest.recipeReward !== null) def.recipeReward = quest.recipeReward;
  if (quest.requiresQuest !== null) def.requiresQuest = quest.requiresQuest;
  if (quest.minLevel !== null) def.minLevel = quest.minLevel;
  if (quest.maxLevel !== null) def.maxLevel = quest.maxLevel;
  if (quest.requiredClass.length > 0) def.requiredClass = [...quest.requiredClass];
  return def;
}

/** The inverse of toQuestDef over a generated record (the page loads the
 *  committed set through this; a non-workshop objective kind cannot appear in
 *  a generated record, so it is filtered defensively rather than modeled). */
export function fromQuestDef(def: QuestDef): WorkshopQuest {
  return {
    id: def.id,
    name: def.name,
    giverNpcId: def.giverNpcId,
    turnInNpcId: def.turnInNpcId,
    text: def.text,
    completionText: def.completionText,
    objectives: def.objectives.filter(isWorkshopObjective).map((o) => ({ ...o })),
    xpReward: def.xpReward,
    copperReward: def.copperReward,
    itemRewards: { ...def.itemRewards },
    choiceRewards: [...(def.choiceRewards ?? [])],
    recipeReward: def.recipeReward ?? null,
    requiresQuest: def.requiresQuest ?? null,
    minLevel: def.minLevel ?? null,
    maxLevel: def.maxLevel ?? null,
    requiredClass: [...(def.requiredClass ?? [])],
  };
}

function isWorkshopObjective(o: QuestObjective): o is WorkshopObjective {
  return (WORKSHOP_OBJECTIVE_KINDS as readonly string[]).includes(o.type);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isCount = (v: number): boolean => Number.isInteger(v) && v >= 1 && v <= MAX_OBJECTIVE_COUNT;
const isMoney = (v: number): boolean => Number.isInteger(v) && v >= 0;

/** Validate one quest against the content index and the other workshop
 *  quests (`siblings`: every workshop quest INCLUDING this one, by id, for the
 *  duplicate-id and prerequisite checks). `rawObjectiveKinds` (from
 *  workshopQuestFromJson) lets an unknown kind be reported. */
export function validateWorkshopQuest(
  quest: WorkshopQuest,
  index: ContentIndex,
  siblings: readonly WorkshopQuest[],
  rawObjectiveKinds?: readonly string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (code: IssueCode, extra: Omit<ValidationIssue, 'code'> = {}) =>
    issues.push({ code, ...extra });

  if (quest.name.trim() === '') push('name_missing');
  else if (quest.name.length > MAX_NAME_LENGTH) push('name_too_long');

  if (!QUEST_ID_RE.test(quest.id)) push('id_invalid', { value: quest.id });
  else if (quest.id.length > MAX_QUEST_ID_LENGTH) push('id_too_long', { value: quest.id });
  else if (quest.id in index.quests) push('id_taken', { value: quest.id });
  else if (siblings.filter((s) => s.id === quest.id).length > 1) {
    push('id_duplicate', { value: quest.id });
  }

  const giver = index.npcs[quest.giverNpcId];
  if (!giver) push('giver_unknown', { value: quest.giverNpcId });
  else if (giver.questIds.length === 0) push('giver_not_quest_giver', { value: giver.id });
  if (!index.npcs[quest.turnInNpcId]) push('turn_in_unknown', { value: quest.turnInNpcId });

  if (quest.text.trim() === '') push('text_missing');
  else if (quest.text.length > MAX_TEXT_LENGTH) push('text_too_long');
  if (quest.completionText.trim() === '') push('completion_missing');
  else if (quest.completionText.length > MAX_TEXT_LENGTH) push('completion_too_long');

  if (quest.objectives.length === 0) push('objectives_empty');
  else if (quest.objectives.length > MAX_OBJECTIVES) push('objectives_too_many');
  quest.objectives.forEach((o, objectiveIndex) => {
    const at = { objectiveIndex };
    const rawKind = rawObjectiveKinds?.[objectiveIndex];
    if (
      rawKind !== undefined &&
      !(WORKSHOP_OBJECTIVE_KINDS as readonly string[]).includes(rawKind)
    ) {
      push('objective_kind_unknown', { ...at, value: rawKind });
      return;
    }
    if (!isCount(o.count)) push('objective_count', { ...at, value: String(o.count) });
    if (o.label.trim() === '') push('objective_label_missing', at);
    switch (o.type) {
      case 'kill':
        if (!index.mobs[o.targetMobId]) push('mob_unknown', { ...at, value: o.targetMobId });
        break;
      case 'collect':
        if (!index.items[o.itemId]) push('item_unknown', { ...at, value: o.itemId });
        else if (!index.acquirableItemIds.has(o.itemId)) {
          push('item_unobtainable', { ...at, value: o.itemId });
        }
        break;
      case 'interact':
        if (o.targetNpcId === undefined && o.targetObjectItemId === undefined) {
          push('interact_target_missing', at);
        }
        if (o.targetNpcId !== undefined && !index.npcs[o.targetNpcId]) {
          push('interact_npc_unknown', { ...at, value: o.targetNpcId });
        }
        if (
          o.targetObjectItemId !== undefined &&
          !index.groundObjectItemIds.has(o.targetObjectItemId)
        ) {
          push('interact_object_unknown', { ...at, value: o.targetObjectItemId });
        }
        break;
      case 'gather':
        if (o.nodeType === undefined && !o.itemId) push('gather_target_missing', at);
        if (o.nodeType !== undefined && !index.nodeTypes.includes(o.nodeType)) {
          push('gather_node_unknown', { ...at, value: o.nodeType });
        }
        if (o.itemId) {
          if (!index.items[o.itemId]) push('gather_item_unknown', { ...at, value: o.itemId });
          else if (!index.nodeItemIds.has(o.itemId)) {
            push('gather_item_no_node', { ...at, value: o.itemId });
          }
        }
        break;
      case 'craft':
        if (!index.recipes[o.recipeId]) push('recipe_unknown', { ...at, value: o.recipeId });
        break;
    }
  });

  if (!isMoney(quest.xpReward)) push('xp_invalid', { value: String(quest.xpReward) });
  if (!isMoney(quest.copperReward)) push('copper_invalid', { value: String(quest.copperReward) });
  for (const [cls, itemId] of Object.entries(quest.itemRewards)) {
    if (!PLAYER_CLASSES.includes(cls as PlayerClass)) push('reward_class_unknown', { value: cls });
    if (itemId !== undefined && !index.items[itemId]) {
      push('reward_item_unknown', { value: itemId });
    }
  }
  for (const itemId of quest.choiceRewards) {
    if (!index.items[itemId]) push('choice_item_unknown', { value: itemId });
  }
  if (quest.recipeReward !== null && !index.recipes[quest.recipeReward]) {
    push('recipe_reward_unknown', { value: quest.recipeReward });
  }

  if (quest.requiresQuest !== null) {
    const siblingIds = new Set(siblings.map((s) => s.id));
    if (quest.requiresQuest === quest.id) push('prerequisite_self');
    else if (!(quest.requiresQuest in index.quests) && !siblingIds.has(quest.requiresQuest)) {
      push('prerequisite_unknown', { value: quest.requiresQuest });
    } else if (prerequisiteCycle(quest, index, siblings)) {
      push('prerequisite_cycle', { value: quest.requiresQuest });
    }
  }

  if (quest.minLevel !== null && !(Number.isInteger(quest.minLevel) && quest.minLevel >= 1)) {
    push('level_invalid', { value: String(quest.minLevel) });
  }
  if (quest.maxLevel !== null && !(Number.isInteger(quest.maxLevel) && quest.maxLevel >= 1)) {
    push('level_invalid', { value: String(quest.maxLevel) });
  }
  if (quest.minLevel !== null && quest.maxLevel !== null && quest.minLevel > quest.maxLevel) {
    push('level_range');
  }
  for (const cls of quest.requiredClass) {
    if (!PLAYER_CLASSES.includes(cls)) push('class_unknown', { value: cls });
  }
  return issues;
}

/** True when following `requiresQuest` links from this quest (through the
 *  workshop siblings and the shipped quests) ever returns to it. */
export function prerequisiteCycle(
  quest: WorkshopQuest,
  index: ContentIndex,
  siblings: readonly WorkshopQuest[],
): boolean {
  const next = (id: string): string | null => {
    const sibling = siblings.find((s) => s.id === id);
    if (sibling) return sibling.requiresQuest;
    return index.quests[id]?.requiresQuest ?? null;
  };
  const seen = new Set<string>([quest.id]);
  let cursor = quest.requiresQuest;
  while (cursor !== null) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = next(cursor);
  }
  return false;
}

/** Validate the whole set (what the save endpoint runs): per-quest issues keyed
 *  by quest id plus the set-level checks. */
export function validateWorkshopSet(
  quests: readonly WorkshopQuest[],
  index: ContentIndex,
  rawKinds?: readonly (readonly string[])[],
): { ok: boolean; issues: Record<string, ValidationIssue[]>; setIssue: string | null } {
  if (quests.length > MAX_WORKSHOP_QUESTS) {
    return { ok: false, issues: {}, setIssue: 'too_many_quests' };
  }
  const issues: Record<string, ValidationIssue[]> = {};
  let ok = true;
  quests.forEach((quest, i) => {
    const found = validateWorkshopQuest(quest, index, quests, rawKinds?.[i]);
    if (found.length > 0) {
      ok = false;
      // A duplicate id folds both rows under one key; the page shows the row's own list.
      issues[quest.id || `#${i}`] = [...(issues[quest.id || `#${i}`] ?? []), ...found];
    }
  });
  return { ok, issues, setIssue: null };
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

/** The quest ids every named NPC additionally offers: the giver and the turn-in
 *  of every workshop quest (tests/progression.test.ts holds both to list the
 *  quest). Keys and lists sorted. */
export function workshopNpcQuestIds(quests: readonly WorkshopQuest[]): Record<string, string[]> {
  const byNpc = new Map<string, Set<string>>();
  for (const quest of quests) {
    for (const npcId of new Set([quest.giverNpcId, quest.turnInNpcId])) {
      if (!byNpc.has(npcId)) byNpc.set(npcId, new Set());
      byNpc.get(npcId)?.add(quest.id);
    }
  }
  const out: Record<string, string[]> = {};
  for (const npcId of [...byNpc.keys()].sort()) {
    out[npcId] = [...(byNpc.get(npcId) ?? [])].sort();
  }
  return out;
}

// A string literal the way biome formats it (single quotes preferred; double
// quotes when that needs fewer escapes, the Prettier rule biome follows).
function tsString(value: string): string {
  const singles = (value.match(/'/g) ?? []).length;
  const doubles = (value.match(/"/g) ?? []).length;
  const quote = singles > doubles ? '"' : "'";
  const body = value
    .replace(/\\/g, '\\\\')
    .replace(quote === "'" ? /'/g : /"/g, `\\${quote}`)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `${quote}${body}${quote}`;
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const tsKey = (key: string): string => (IDENT_RE.test(key) ? key : tsString(key));

// An array of string literals, on one line when it fits biome's 100-column
// width at this indent, else one element per line (how biome prints it).
function tsStringArray(
  values: readonly string[],
  indent: string,
  prefix: string,
  end = ',',
): string[] {
  if (values.length === 0) return [`${prefix}[]${end}`];
  const inline = `${prefix}[${values.map(tsString).join(', ')}]${end}`;
  if (inline.length <= 100) return [inline];
  return [`${prefix}[`, ...values.map((v) => `${indent}  ${tsString(v)},`), `${indent}]${end}`];
}

const OBJECTIVE_KEY_ORDER = [
  'type',
  'targetMobId',
  'itemId',
  'targetNpcId',
  'targetObjectItemId',
  'nodeType',
  'recipeId',
  'count',
  'label',
] as const;

function objectiveLines(o: WorkshopObjective, indent: string): string[] {
  const props: string[] = [];
  const row = o as unknown as Record<string, string | number | undefined>;
  for (const key of OBJECTIVE_KEY_ORDER) {
    const v = row[key];
    if (v === undefined) continue;
    props.push(`${key}: ${typeof v === 'number' ? String(v) : tsString(v)}`);
  }
  const inline = `${indent}{ ${props.join(', ')} },`;
  if (inline.length <= 100) return [inline];
  return [`${indent}{`, ...props.map((p) => `${indent}  ${p},`), `${indent}},`];
}

function questLines(quest: WorkshopQuest): string[] {
  const def = toQuestDef(quest);
  const i = '    ';
  const lines: string[] = [`  ${tsKey(def.id)}: {`];
  lines.push(`${i}id: ${tsString(def.id)},`);
  lines.push(`${i}name: ${tsString(def.name)},`);
  lines.push(`${i}giverNpcId: ${tsString(def.giverNpcId)},`);
  lines.push(`${i}turnInNpcId: ${tsString(def.turnInNpcId)},`);
  lines.push(`${i}text: ${tsString(def.text)},`);
  lines.push(`${i}completionText: ${tsString(def.completionText)},`);
  lines.push(`${i}objectives: [`);
  for (const o of quest.objectives) lines.push(...objectiveLines(o, `${i}  `));
  lines.push(`${i}],`);
  lines.push(`${i}xpReward: ${def.xpReward},`);
  lines.push(`${i}copperReward: ${def.copperReward},`);
  const rewardClasses = PLAYER_CLASSES.filter((cls) => def.itemRewards[cls] !== undefined);
  if (rewardClasses.length === 0) lines.push(`${i}itemRewards: {},`);
  else {
    const props = rewardClasses.map((cls) => `${cls}: ${tsString(def.itemRewards[cls] ?? '')}`);
    const inline = `${i}itemRewards: { ${props.join(', ')} },`;
    if (inline.length <= 100) lines.push(inline);
    else lines.push(`${i}itemRewards: {`, ...props.map((p) => `${i}  ${p},`), `${i}},`);
  }
  if (def.choiceRewards) lines.push(...tsStringArray(def.choiceRewards, i, `${i}choiceRewards: `));
  if (def.recipeReward !== undefined)
    lines.push(`${i}recipeReward: ${tsString(def.recipeReward)},`);
  if (def.requiresQuest !== undefined) {
    lines.push(`${i}requiresQuest: ${tsString(def.requiresQuest)},`);
  }
  if (def.minLevel !== undefined) lines.push(`${i}minLevel: ${def.minLevel},`);
  if (def.maxLevel !== undefined) lines.push(`${i}maxLevel: ${def.maxLevel},`);
  if (def.requiredClass) lines.push(...tsStringArray(def.requiredClass, i, `${i}requiredClass: `));
  lines.push('  },');
  return lines;
}

export const WORKSHOP_MODULE_HEADER = [
  '// Generated by the Quest Workshop (quest_editor.html, a dev-only tool): the',
  "// owner's own quests, saved from the browser form through the dev server's",
  '// /__quest_editor/save endpoint. Do not hand-edit: run npm run dev, open',
  '// the page, edit, and press Save. Regenerated deterministically (sorted by id)',
  '// by src/quest_editor/quest_editor_core.ts emitWorkshopModule, pinned by',
  '// tests/quest_editor_core.test.ts.',
  '//',
  '// Merged into the live tables by src/sim/content/workshop_merge.ts (data.ts',
  '// calls it): each quest joins QUESTS and QUEST_ORDER, and every giver and',
  '// turn-in NPC gains the quest id, so the offline client, the server and the',
  '// headless env all offer these quests identically.',
  '//',
  '// i18n: quest text here is player-visible English, resolved through tEntity',
  '// like every shipped quest (src/ui/world_entity_i18n.ts lists',
  "// WORKSHOP_QUEST_IDS). It is the owner's own content and ships AS WRITTEN:",
  '// the i18n registry marks its locale rows blocked rather than pending',
  '// (scripts/lib/workshop_quest_keys.mjs; the exemption is keyed on exactly the',
  '// ids in this file, so no shipped content rides it). See',
  '// docs/quest-workshop.md.',
  '',
  "import type { QuestDef } from '../types';",
  '',
] as const;

/** The whole generated module for a workshop set. Byte-stable: the same set
 *  in any order emits the same text (sorted by quest id everywhere). */
export function emitWorkshopModule(quests: readonly WorkshopQuest[]): string {
  const sorted = [...quests].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = sorted.map((q) => q.id);
  const lines: string[] = [...WORKSHOP_MODULE_HEADER];
  if (sorted.length === 0) {
    lines.push('export const WORKSHOP_QUESTS: Record<string, QuestDef> = {};');
  } else {
    lines.push('export const WORKSHOP_QUESTS: Record<string, QuestDef> = {');
    for (const quest of sorted) lines.push(...questLines(quest));
    lines.push('};');
  }
  lines.push('');
  lines.push(
    ...tsStringArray(ids, '', 'export const WORKSHOP_QUEST_ORDER: readonly string[] = ', ';'),
  );
  lines.push('');
  const npcQuestIds = workshopNpcQuestIds(sorted);
  const npcIds = Object.keys(npcQuestIds);
  if (npcIds.length === 0) {
    lines.push('export const WORKSHOP_NPC_QUEST_IDS: Record<string, readonly string[]> = {};');
  } else {
    lines.push('export const WORKSHOP_NPC_QUEST_IDS: Record<string, readonly string[]> = {');
    for (const npcId of npcIds) {
      lines.push(...tsStringArray(npcQuestIds[npcId], '  ', `  ${tsKey(npcId)}: `));
    }
    lines.push('};');
  }
  lines.push('');
  lines.push(
    ...tsStringArray(ids, '', 'export const WORKSHOP_QUEST_IDS: readonly string[] = ', ';'),
  );
  lines.push('');
  return lines.join('\n');
}
