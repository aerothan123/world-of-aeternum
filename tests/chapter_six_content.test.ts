// Wyndlewood Chapter Six (content/chapter_six.ts): the shared chapter suite
// (tests/story_chapter_suite.ts) plus the chapter's own pins.
import { describe, expect, it } from 'vitest';
import { C5_CLOSING_QUEST } from '../src/sim/content/chapter_five';
import { C6_CLOSING_QUEST, C6_SKARVETH, CHAPTER_SIX } from '../src/sim/content/chapter_six';
import { MOBS } from '../src/sim/data';
import { RARE_SLAIN_TEMPLATES } from '../src/sim/deeds';
import { describeStoryChapter } from './story_chapter_suite';

describeStoryChapter({
  number: 6,
  bundle: CHAPTER_SIX,
  opensAfter: C5_CLOSING_QUEST,
  closingQuest: C6_CLOSING_QUEST,
  closingDeed: 'chr_ash_ice_sleeping_crown',
  dungeonId: 'gravewyrm_sanctum',
  firstEntityId: 2_147_280_000,
  levels: [19, 20],
});

describe('Chapter Six specifics', () => {
  it("fights Skarveth on the broodlord's body without its rare window or nest roar", () => {
    const skarveth = MOBS[C6_SKARVETH];
    const body = MOBS.drakemaw_broodlord;
    expect(skarveth.minLevel).toBe(body.minLevel);
    expect(skarveth.hpPerLevel).toBe(body.hpPerLevel);
    expect(skarveth.rare).toBe(false);
    expect(skarveth.engageShout).toBeUndefined();
    expect(skarveth.loot.some((l) => l.itemId)).toBe(false);
    expect([...RARE_SLAIN_TEMPLATES]).not.toContain(C6_SKARVETH);
  });
});
