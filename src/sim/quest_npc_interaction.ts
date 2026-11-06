import { QUESTS } from './data';
import { regrantMissingQuestItems } from './quests/quest_commands';
import {
  applyQuestObjectUse,
  questDeliveryUnits,
  questObjectUseReady,
} from './quests/quest_object_use';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { type Entity, questObjectiveRequired } from './types';

/** Ordinary quest-talk credit, shared by the Sim's scripted NPC dispatch. */
export function interactNpcForQuests(ctx: SimContext, npc: Entity, meta: PlayerMeta): boolean {
  let progressed = false;
  regrantMissingQuestItems(ctx, meta, npc.templateId);
  for (const qp of meta.questLog.values()) {
    if (qp.state !== 'active') continue;
    const quest = QUESTS[qp.questId];
    quest.objectives.forEach((objective, objectiveIndex) => {
      if (objective.type !== 'interact' || objective.targetNpcId !== npc.templateId) return;
      const required = questObjectiveRequired(quest, qp, objectiveIndex);
      if (qp.counts[objectiveIndex] >= required) return;
      // A delivery (quests/quest_object_use.ts): the talk credits only with the
      // goods in the bags, and hands them over.
      if (!questObjectUseReady(ctx, meta, objective)) return;
      // A counted delivery (3 Bread Bundles to Neris) hands over every unit
      // carried, up to what the objective still needs, in one talk.
      const units = questDeliveryUnits(ctx, meta, objective, required - qp.counts[objectiveIndex]);
      for (let unit = 0; unit < units; unit++) applyQuestObjectUse(ctx, meta, objective);
      qp.counts[objectiveIndex] += units;
      progressed = true;
      meta.counters.questProgress++;
      ctx.emit({
        type: 'questProgress',
        questId: qp.questId,
        objectiveIndex,
        current: qp.counts[objectiveIndex],
        required,
        text: `${objective.label}: ${qp.counts[objectiveIndex]}/${required}`,
        pid: meta.entityId,
      });
      ctx.checkQuestReady(qp, meta);
    });
  }
  return progressed;
}
