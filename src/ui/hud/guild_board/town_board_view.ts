// The town quest board's notices tab, the pure DOM-free view core: which
// postings are up today (src/sim/town_board/, keyed on the character's
// realm-day cycle that both worlds expose as IWorld.worldQuestCycle) and what
// each one offers the viewer right now. The painter (town_board_panel.ts)
// only turns these rows into markup.

import { QUESTS } from '../../../sim/data';
import { townBoardDef, townBoardPostings } from '../../../sim/town_board';
import type { QuestDef, QuestProgress, QuestState } from '../../../sim/types';

export type TownBoardRowState = 'available' | 'active' | 'ready' | 'done' | 'locked';

export interface TownBoardRow {
  readonly questId: string;
  readonly state: TownBoardRowState;
  /** The NPC who posted the notice and takes the turn-in. */
  readonly posterNpcId: string;
  readonly xp: number;
  readonly copper: number;
  readonly standing: QuestDef['standingReward'] | null;
  /** Set on a 'locked' row whose only gate is the character's level. */
  readonly minLevel: number | null;
}

export interface TownBoardViewWorld {
  readonly worldQuestCycle: string;
  readonly questLog: ReadonlyMap<string, QuestProgress>;
  readonly questsDone: ReadonlySet<string>;
  readonly player: { readonly level: number };
  questState(questId: string): QuestState;
}

/** Whether a board id hosts a quest board (and so opens on the notices tab). */
export function hasTownBoard(boardId: string | undefined): boolean {
  return boardId !== undefined && townBoardDef(boardId) !== undefined;
}

function rowState(quest: QuestDef, world: TownBoardViewWorld): TownBoardRowState {
  const progress = world.questLog.get(quest.id);
  if (progress) return progress.state === 'ready' ? 'ready' : 'active';
  const state = world.questState(quest.id);
  if (state === 'available') return 'available';
  // Posted today and not available: either it is already done for the day
  // (the daily lock) or the viewer has not met its level or story gate.
  if (quest.minLevel !== undefined && world.player.level < quest.minLevel) return 'locked';
  if (quest.requiresQuest && !world.questsDone.has(quest.requiresQuest)) return 'locked';
  return world.questsDone.has(quest.id) ? 'done' : 'locked';
}

/** The board's notices for the viewer's day, in posting order. */
export function buildTownBoardRows(boardId: string, world: TownBoardViewWorld): TownBoardRow[] {
  const rows: TownBoardRow[] = [];
  for (const questId of townBoardPostings(boardId, world.worldQuestCycle)) {
    const quest = QUESTS[questId];
    if (!quest) continue;
    const state = rowState(quest, world);
    rows.push({
      questId,
      state,
      posterNpcId: quest.giverNpcId,
      xp: quest.xpReward,
      copper: quest.copperReward,
      standing: quest.standingReward ?? null,
      minLevel:
        state === 'locked' && quest.minLevel !== undefined && world.player.level < quest.minLevel
          ? quest.minLevel
          : null,
    });
  }
  return rows;
}
