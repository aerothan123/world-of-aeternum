// Wyndlewood Chapter Four (content/chapter_four.ts): the shared chapter suite
// (tests/story_chapter_suite.ts) plus the chapter's own pins.
import { describe, expect, it } from 'vitest';
import {
  C4_CLOSING_QUEST,
  C4_HAMLIN,
  C4_ODRIK,
  CHAPTER_FOUR,
} from '../src/sim/content/chapter_four';
import { C3_CLOSING_QUEST } from '../src/sim/content/chapter_three';
import { DUNGEONS, MOBS, NPCS, QUESTS } from '../src/sim/data';
import { describeStoryChapter } from './story_chapter_suite';

describeStoryChapter({
  number: 4,
  bundle: CHAPTER_FOUR,
  opensAfter: C3_CLOSING_QUEST,
  closingQuest: C4_CLOSING_QUEST,
  closingDeed: 'chr_iron_hearts_empty_crowns',
  dungeonId: 'the_last_keep',
  firstEntityId: 2_147_260_000,
  levels: [16, 18],
});

describe('Chapter Four specifics', () => {
  it('lets the player keep the Last Keep signet the closing quest asks for', () => {
    const close = QUESTS[C4_CLOSING_QUEST];
    expect(close.keepsCollectedItems).toBe(true);
    expect(close.objectives).toEqual([
      expect.objectContaining({ type: 'collect', itemId: 'last_keep_signet', count: 1 }),
    ]);
    expect(
      (DUNGEONS.the_last_keep.objects ?? []).some((g) => g.itemId === 'last_keep_signet'),
    ).toBe(true);
  });

  it('never lets the forgemaster read as the shipped Garrick Holt', () => {
    expect(MOBS[C4_HAMLIN].name).not.toMatch(/Garrick/);
    expect(NPCS.guild_quartermaster_garrick_holt.name).toBe('Garrick Holt');
    expect(NPCS[C4_ODRIK].name).toBe('Odrik Caskwell');
  });
});
