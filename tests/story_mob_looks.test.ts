// WYNDLEWOOD's Chapter One humanoid bodies (src/render/characters/story_mob_looks.ts):
// each file ships on the WOC rig the class library drives, each look keeps its class
// def's library and clips but none of the WOC composition or held weapons, and a row
// maps only once the story branch's template exists.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mobVisualKey, VISUALS } from '../src/render/characters/manifest';
import {
  STORY_MOB_KEYS,
  STORY_MOB_MODELS,
  storyMobVisualKey,
} from '../src/render/characters/story_mob_looks';
import { MOBS } from '../src/sim/data';

const PUBLIC = resolve(__dirname, '../public');

function joints(path: string): string[] {
  const buf = readFileSync(path);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const nodes: { name?: string }[] = json.nodes ?? [];
  return (json.skins?.[0]?.joints ?? []).map((i: number) => nodes[i]?.name ?? '');
}

describe('story mob looks', () => {
  it('ships every body on the WOC rig', () => {
    for (const [id, model] of Object.entries(STORY_MOB_MODELS)) {
      const path = resolve(PUBLIC, 'models/creatures/story', model.file);
      expect(existsSync(path), id).toBe(true);
      const names = joints(path);
      for (const bone of ['hips', 'head', 'upperarm.l', 'hand.r', 'upperleg.l', 'foot.r']) {
        expect(names, `${id} joint ${bone}`).toContain(bone);
      }
    }
  });

  it('derives each look from its class def, without the WOC composition or weapons', () => {
    for (const [id, model] of Object.entries(STORY_MOB_MODELS)) {
      const look = VISUALS[storyMobVisualKey(id)];
      const base = VISUALS[model.base];
      expect(look, id).toBeDefined();
      expect(look.url).toBe(`models/creatures/story/${model.file}`);
      expect(look.animUrls).toEqual(base.animUrls);
      expect(look.clips).toBe(base.clips);
      expect(look.wocCharacter).toBeUndefined();
      expect(look.weaponSlots).toEqual([]);
      expect(look.attach).toEqual([]);
      expect(look.lazyPreload).toBe(true);
    }
  });

  it('maps a template only once it exists', () => {
    for (const id of Object.keys(STORY_MOB_MODELS)) {
      if (MOBS[id]) {
        expect(STORY_MOB_KEYS[id]).toBe(storyMobVisualKey(id));
        expect(mobVisualKey(id)).toBe(storyMobVisualKey(id));
      } else {
        expect(STORY_MOB_KEYS[id]).toBeUndefined();
      }
    }
  });
});
