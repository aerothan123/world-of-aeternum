// Wyndlewood Chapter Two's GATED bundles in one place: the Applewold
// (chapter_two.ts CHAPTER_TWO_REACHES), the Kindlemoor and the Chalkbarrow
// Coast. Each stands in a world crew zone still on feature/world-expansion and
// merges into the live tables only when its zones are in the zone table
// (chapter_two.ts applyChapterTwoBundle). data.ts calls
// applyChapterTwoGatedBundles once, after ZONES is final.

import type { QuestCatchSpot } from '../quests/quest_fishing_catch';
import {
  applyChapterTwoBundle,
  CHAPTER_TWO_REACHES,
  type ChapterTwoBundle,
  type ChapterTwoGatedTables,
} from './chapter_two';

/** Every gated bundle, in merge order (appended last, so no shipped id moves). */
export const CHAPTER_TWO_GATED_BUNDLES: readonly ChapterTwoBundle[] = Object.freeze([
  CHAPTER_TWO_REACHES,
]);

/** Merge every bundle whose zones are live. Returns the merged bundles. */
export function applyChapterTwoGatedBundles(tables: ChapterTwoGatedTables): ChapterTwoBundle[] {
  return CHAPTER_TWO_GATED_BUNDLES.filter((bundle) => applyChapterTwoBundle(bundle, tables));
}

/** Every gated quest catch. A spot is inert while its quest is absent
 *  (quests/quest_fishing_catch.ts questCatchFor reads QUESTS), so fishing.ts
 *  lists them all. */
export const CHAPTER_TWO_GATED_CATCH_SPOTS: readonly QuestCatchSpot[] = Object.freeze(
  CHAPTER_TWO_GATED_BUNDLES.flatMap((bundle) => bundle.catchSpots ?? []),
);

/** Item art debt for the gated bundles: procedural quest icons until their
 *  painted wave lands (src/ui/icons.ts keeps only the ids ITEMS carries). */
export const CHAPTER_TWO_GATED_ART_PENDING_ITEM_IDS: readonly string[] = Object.freeze(
  CHAPTER_TWO_GATED_BUNDLES.flatMap((bundle) => Object.keys(bundle.items)),
);
