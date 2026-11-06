// Wyndlewood Chapter Seven (content/chapter_seven.ts): the shared chapter suite
// (tests/story_chapter_suite.ts) plus the chapter's own pins.
import { describe, expect, it } from 'vitest';
import { C7_CLOSING_QUEST, CHAPTER_SEVEN } from '../src/sim/content/chapter_seven';
import { C6_CLOSING_QUEST } from '../src/sim/content/chapter_six';
import { QUESTS } from '../src/sim/data';
import { FACTION_IDS } from '../src/sim/factions';
import { describeStoryChapter } from './story_chapter_suite';

describeStoryChapter({
  number: 7,
  bundle: CHAPTER_SEVEN,
  opensAfter: C6_CLOSING_QUEST,
  closingQuest: C7_CLOSING_QUEST,
  closingDeed: 'chr_last_hearthlight',
  dungeonId: 'wildheart_basin',
  firstEntityId: 2_147_290_000,
  levels: [20, 20],
});

describe('Chapter Seven specifics', () => {
  it('carries word to every allied faction before the rite', () => {
    const banners = QUESTS.c7_04_five_banners;
    expect(banners.objectives).toHaveLength(FACTION_IDS.length);
  });

  it('ends the campaign at home, at the Eastbrook inn', () => {
    expect(QUESTS[C7_CLOSING_QUEST].turnInNpcId).toBe('innkeeper_jorren');
    expect(QUESTS[C7_CLOSING_QUEST].completionText).toMatch(/Make something of it\.$/);
  });
});
