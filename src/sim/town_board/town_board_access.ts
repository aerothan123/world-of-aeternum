// The town boards' access rules, shared by every host: which boards exist,
// which postings are off today, and whether a player stands at the board a
// posting is taken from. No rng, no clock: the day comes in as the character's
// realm-day cycle (PlayerMeta.worldQuestCycle; IWorld.worldQuestCycle on both
// worlds, mirrored online as `wqday`).

import { NOTICEBOARDS } from '../content/noticeboards';
import { TOWN_BOARD_DEFS } from '../content/town_board_dailies';
import type { QuestDef } from '../types';
import {
  type TownBoardDef,
  townBoardOffDayQuestIds,
  townBoardPostingsForCycle,
} from './town_board_rotation';

/** The extra standing-room past a board's own interaction radius, the same
 *  slack the NPC giver check allows (quest_commands.ts INTERACT_RANGE + 2). */
export const TOWN_BOARD_ACCEPT_SLACK = 2;

export function townBoardDef(
  boardId: string,
  boards: readonly TownBoardDef[] = TOWN_BOARD_DEFS,
): TownBoardDef | undefined {
  return boards.find((board) => board.boardId === boardId);
}

/** Every board's postings for the day, in board order. */
export function townBoardPostings(
  boardId: string,
  cycle: unknown,
  boards: readonly TownBoardDef[] = TOWN_BOARD_DEFS,
): string[] {
  const board = townBoardDef(boardId, boards);
  return board ? townBoardPostingsForCycle(board, cycle) : [];
}

/** The day's off-day postings across every board (folded into the repeat-blocked set). */
export function offDayTownBoardQuestIds(
  cycle: unknown,
  boards: readonly TownBoardDef[] = TOWN_BOARD_DEFS,
): string[] {
  return boards.flatMap((board) => townBoardOffDayQuestIds(board, cycle));
}

/** Whether `pos` stands close enough to the board a posting is taken from. A
 *  board missing from the active noticeboard list fails closed. */
export function standsAtTownBoard(
  quest: Pick<QuestDef, 'townBoard'>,
  pos: { x: number; z: number },
): boolean {
  if (quest.townBoard === undefined) return false;
  const board = NOTICEBOARDS.find((def) => def.id === quest.townBoard);
  if (!board) return false;
  const reach = board.interactionRadius + TOWN_BOARD_ACCEPT_SLACK;
  const dx = pos.x - board.x;
  const dz = pos.z - board.z;
  return dx * dx + dz * dz <= reach * reach;
}
