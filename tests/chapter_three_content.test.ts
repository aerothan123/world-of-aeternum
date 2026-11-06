// Wyndlewood Chapter Three (content/chapter_three.ts): the shared chapter suite
// (tests/story_chapter_suite.ts) plus the chapter's own pins.
import { describe, expect, it } from 'vitest';
import { C3_CLOSING_QUEST, C3_VESKA, CHAPTER_THREE } from '../src/sim/content/chapter_three';
import { MOBS } from '../src/sim/data';
import { describeStoryChapter } from './story_chapter_suite';

describeStoryChapter({
  number: 3,
  bundle: CHAPTER_THREE,
  opensAfter: 'q_mistcaller',
  closingQuest: C3_CLOSING_QUEST,
  closingDeed: 'chr_marsh_that_remembers',
  dungeonId: 'drowned_temple',
  firstEntityId: 2_147_250_000,
  levels: [13, 16],
});

describe('Chapter Three specifics', () => {
  it('fights Veska Noll on the shipped named-capstone body at the chapter level', () => {
    const veska = MOBS[C3_VESKA];
    const body = MOBS.threnos_first_voice;
    expect(veska.minLevel).toBe(16);
    expect(veska.elite).toBe(true);
    expect(veska.hpPerLevel).toBe(body.hpPerLevel);
    expect(veska.dmgPerLevel).toBe(body.dmgPerLevel);
  });
});
