// Wyndlewood Chapters Three to Seven in one place: the rest of the
// "Unravelling" campaign (docs/narrative/chapters_3_to_7_plan.md). Each chapter
// is one bundle on the Chapter Two seam (chapter_two.ts applyChapterTwoBundle):
// merged into the live tables, appended after every shipped record, only when
// every zone it stands in is live. data.ts calls applyStoryChapters once,
// after the Chapter Two gated bundles.

import { CHAPTER_FIVE } from './chapter_five';
import { CHAPTER_FOUR } from './chapter_four';
import { CHAPTER_THREE } from './chapter_three';
import {
  applyChapterTwoBundle,
  type ChapterTwoBundle,
  type ChapterTwoGatedTables,
} from './chapter_two';

/** Chapters Three to Seven, in campaign (and merge) order. */
export const STORY_CHAPTER_BUNDLES: readonly ChapterTwoBundle[] = Object.freeze([
  CHAPTER_THREE,
  CHAPTER_FOUR,
  CHAPTER_FIVE,
]);

/** Merge every chapter whose zones are live. Returns the merged chapters. */
export function applyStoryChapters(tables: ChapterTwoGatedTables): ChapterTwoBundle[] {
  return STORY_CHAPTER_BUNDLES.filter((bundle) => applyChapterTwoBundle(bundle, tables));
}

/** Item art debt: every chapter quest item and object draws its procedural
 *  quest icon until a painted wave is commissioned (src/ui/icons.ts keeps only
 *  the ids ITEMS carries). */
export const STORY_CHAPTERS_ART_PENDING_ITEM_IDS: readonly string[] = Object.freeze(
  STORY_CHAPTER_BUNDLES.flatMap((bundle) => Object.keys(bundle.items)),
);
