// The town quest board's daily rotation, pure: which of a board's postings are
// up on a given realm day. Deterministic from the board id and the realm-day
// cycle alone (world_quest_rotation.ts worldQuestCycleNumber, the day the
// server's calendar feeds; the sim never reads a clock), drawn through the
// seeded Rng so every host on one realm day posts the same notices.
//
// A board owns TEMPLATES (one per kind of notice: a bounty, an ore order, a
// delivery run) and each template owns one or more VARIANTS (one QuestDef per
// target and location pair, the owner's "{TARGET} at {LOCATION}" pairs). Each
// day the board posts `postingsPerDay` distinct templates, and for each one
// exactly one variant. The other variants and the unposted templates are the
// day's off-day set, which quest_commands.ts folds into the repeat-blocked set
// every host already shares, so an off-day notice is unavailable everywhere
// (a posting already in the log stays finishable after the day rolls).

import { Rng } from '../rng';
import { worldQuestCycleNumber } from '../world_quest_rotation';

export interface TownBoardTemplate {
  /** Stable template id (the owner's D01 to D12 rows). */
  readonly id: string;
  /** One quest id per target and location pair; never empty. */
  readonly variants: readonly string[];
}

export interface TownBoardDef {
  /** The noticeboard service id that hosts the board (content/noticeboards.ts). */
  readonly boardId: string;
  readonly templates: readonly TownBoardTemplate[];
  readonly postingsPerDay: number;
}

/** A stable 32-bit seed for a board id (FNV-1a), so two boards never share a draw. */
export function townBoardSeed(boardId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < boardId.length; i++) {
    h = Math.imul(h ^ boardId.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** The quest ids a board posts on the realm-day `cycle` ('' or malformed: none). */
export function townBoardPostingsForCycle(board: TownBoardDef, cycle: unknown): string[] {
  const day = worldQuestCycleNumber(cycle);
  if (day === null || board.templates.length === 0) return [];
  const rng = new Rng((townBoardSeed(board.boardId) ^ Math.imul(day, 0x9e3779b1)) >>> 0);
  const order = board.templates.map((_, index) => index);
  const count = Math.max(0, Math.min(board.postingsPerDay, order.length));
  const posted: string[] = [];
  for (let i = 0; i < count; i++) {
    // Partial Fisher-Yates: the first `count` slots become the day's templates.
    const j = rng.int(i, order.length - 1);
    [order[i], order[j]] = [order[j], order[i]];
    const template = board.templates[order[i]];
    posted.push(template.variants[rng.int(0, template.variants.length - 1)]);
  }
  return posted;
}

/** Every quest id a board can ever post, in authored order. */
export function townBoardQuestIds(board: TownBoardDef): string[] {
  return board.templates.flatMap((template) => template.variants);
}

/** A board's quest ids NOT posted on `cycle`: the day's off-day set. */
export function townBoardOffDayQuestIds(board: TownBoardDef, cycle: unknown): string[] {
  const posted = new Set(townBoardPostingsForCycle(board, cycle));
  return townBoardQuestIds(board).filter((id) => !posted.has(id));
}
