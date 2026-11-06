// Wyndlewood Chapter Five (content/chapter_five.ts): the shared chapter suite
// (tests/story_chapter_suite.ts) plus the chapter's own pins.
import { describe, expect, it } from 'vitest';
import {
  C5_CLOSING_QUEST,
  C5_ESHMARA,
  C5_RASKA,
  CHAPTER_FIVE,
} from '../src/sim/content/chapter_five';
import { C4_CLOSING_QUEST } from '../src/sim/content/chapter_four';
import { DUNGEONS, NPCS, QUESTS } from '../src/sim/data';
import { describeStoryChapter } from './story_chapter_suite';

describeStoryChapter({
  number: 5,
  bundle: CHAPTER_FIVE,
  opensAfter: C4_CLOSING_QUEST,
  closingQuest: C5_CLOSING_QUEST,
  closingDeed: 'chr_kingdom_behind_the_mist',
  dungeonId: 'dawnhold_castle',
  firstEntityId: 2_147_270_000,
  levels: [18, 19],
});

describe('Chapter Five specifics', () => {
  it('resolves Dawnhold without a duel: the posy is kept, the barrier released', () => {
    const posy = QUESTS.c5_06_the_palace_that_remembers;
    expect(posy.keepsCollectedItems).toBe(true);
    expect((DUNGEONS.dawnhold_castle.objects ?? []).some((g) => g.itemId === 'dawnhold_posy')).toBe(
      true,
    );
    for (const quest of Object.values(CHAPTER_FIVE.quests))
      for (const o of quest.objectives)
        if (o.type === 'kill') expect(o.targetMobId).not.toBe(C5_ESHMARA);
  });

  it('places Raska with the chapter that first names her, so its close posts on her', () => {
    expect(CHAPTER_FIVE.npcs[C5_RASKA]).toBeDefined();
    expect(NPCS[C5_RASKA].questIds).toContain(C5_CLOSING_QUEST);
  });
});
