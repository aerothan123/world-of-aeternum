// Quest Workshop merge: puts the owner's workshop quests
// (workshop_quests.generated.ts) into the live tables data.ts builds, so the
// offline client, the server and the headless env offer them identically.
//
// The same append-and-dedupe shape as the Studio overlay's npcQuestIds arm
// (src/sim/studio_content.ts setStudioOverlay), minus the on/off toggle: the
// workshop is built-in content, merged once at table assembly and never
// stripped. Pure over plain records (no rng, no SimContext); data.ts owns the
// tables and hands them in, so this module never imports data.ts.

import type { NpcDef, QuestDef } from '../types';

export interface WorkshopMergeTables {
  quests: Record<string, QuestDef>;
  questOrder: string[];
  npcs: Record<string, NpcDef>;
}

export interface WorkshopMergeSource {
  quests: Readonly<Record<string, QuestDef>>;
  questOrder: readonly string[];
  npcQuestIds: Readonly<Record<string, readonly string[]>>;
}

export interface WorkshopMergeReport {
  /** Quest ids added to the quest table (a workshop id that collides with a
   *  shipped quest is skipped: shipped content always wins). */
  questsAdded: string[];
  /** Workshop quest ids that collided with a shipped quest and were skipped. */
  questsSkipped: string[];
  /** NPC ids named in npcQuestIds that no table row carries (skipped). */
  npcsMissing: string[];
}

/** Merge a workshop set into the tables in place. Idempotent: a second call
 *  with the same source adds nothing (ids already present are skipped and NPC
 *  quest lists are deduped). */
export function applyWorkshopQuests(
  tables: WorkshopMergeTables,
  source: WorkshopMergeSource,
): WorkshopMergeReport {
  const report: WorkshopMergeReport = { questsAdded: [], questsSkipped: [], npcsMissing: [] };
  for (const [id, quest] of Object.entries(source.quests)) {
    if (id in tables.quests) {
      report.questsSkipped.push(id);
      continue;
    }
    tables.quests[id] = quest;
    report.questsAdded.push(id);
  }
  for (const id of source.questOrder) {
    if (!(id in tables.quests) || tables.questOrder.includes(id)) continue;
    tables.questOrder.push(id);
  }
  for (const [npcId, questIds] of Object.entries(source.npcQuestIds)) {
    const def = tables.npcs[npcId];
    if (!def) {
      report.npcsMissing.push(npcId);
      continue;
    }
    const extra = questIds.filter((q) => q in tables.quests && !def.questIds.includes(q));
    if (extra.length > 0) def.questIds = [...def.questIds, ...extra];
  }
  return report;
}
