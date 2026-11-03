// The gathering pose (src/render/gather_pose_core.ts): which profession a
// body's cast is working (from the cast id plus the static node table, so a
// peer needs no wire field), the swing it loops, and the tool its main hand
// shows, with the real weapon back the moment the cast ends.

import { describe, expect, it } from 'vitest';
import { itemWeaponModelUrl } from '../src/render/characters/manifest';
import {
  GATHER_HERB_CAST_CLIP,
  GATHER_MINE_CAST_CLIP,
  gatherCastClipFor,
  gatherProfessionForCast,
  gatherSwingClip,
  HELD_TOOL_STAND_INS,
  heldGatherMainhand,
} from '../src/render/gather_pose_core';
import { TREE_CHOP_CAST_CLIP } from '../src/render/tree_felling_core';
import { GATHER_NODES, ITEMS } from '../src/sim/data';
import { FISHING_CAST_ID, GATHER_CAST_ID, TREE_CHOP_CAST_ID } from '../src/sim/types';

const ore = GATHER_NODES.find((n) => n.type === 'ore');
const herb = GATHER_NODES.find((n) => n.type === 'herb');

describe('gatherProfessionForCast', () => {
  it('reads a chop as logging, fishing as fishing, and nothing else as gathering', () => {
    expect(gatherProfessionForCast(TREE_CHOP_CAST_ID, { x: 0, z: 0 }, [])).toBe('logging');
    expect(gatherProfessionForCast(FISHING_CAST_ID, { x: 0, z: 0 }, [])).toBe('fishing');
    expect(gatherProfessionForCast('fireball', { x: 0, z: 0 }, GATHER_NODES)).toBeNull();
    expect(gatherProfessionForCast(null, { x: 0, z: 0 }, GATHER_NODES)).toBeNull();
  });

  it('reads a node cast from the nearest node in reach', () => {
    if (!ore || !herb) throw new Error('fixture nodes missing');
    const nearOre = { x: ore.pos.x + 1, z: ore.pos.z };
    expect(gatherProfessionForCast(GATHER_CAST_ID, nearOre, GATHER_NODES)).toBe('mining');
    const nearHerb = { x: herb.pos.x, z: herb.pos.z - 1 };
    expect(gatherProfessionForCast(GATHER_CAST_ID, nearHerb, GATHER_NODES)).toBe('herbalism');
    // Out of reach of every node: no pose rather than a guess.
    expect(gatherProfessionForCast(GATHER_CAST_ID, { x: 1e6, z: 1e6 }, GATHER_NODES)).toBeNull();
  });
});

describe('clips', () => {
  it('maps each land profession to its cast key', () => {
    expect(gatherCastClipFor('logging')).toBe(TREE_CHOP_CAST_CLIP);
    expect(gatherCastClipFor('mining')).toBe(GATHER_MINE_CAST_CLIP);
    expect(gatherCastClipFor('herbalism')).toBe(GATHER_HERB_CAST_CLIP);
    expect(gatherCastClipFor('fishing')).toBeNull();
    expect(gatherCastClipFor(null)).toBeNull();
  });

  it('plays the rig gather swing, falling back to the one-hand swing or the cast loop', () => {
    const swings = { chop: '1H_Chop', mine: '2H_Chop', herb: 'Kneel' };
    expect(gatherSwingClip(TREE_CHOP_CAST_CLIP, swings, 'Swing', 'Cast')).toBe('1H_Chop');
    expect(gatherSwingClip(GATHER_MINE_CAST_CLIP, swings, 'Swing', 'Cast')).toBe('2H_Chop');
    expect(gatherSwingClip(GATHER_HERB_CAST_CLIP, swings, 'Swing', 'Cast')).toBe('Kneel');
    expect(gatherSwingClip(TREE_CHOP_CAST_CLIP, undefined, 'Swing', 'Cast')).toBe('Swing');
    expect(gatherSwingClip(GATHER_MINE_CAST_CLIP, undefined, 'Swing', 'Cast')).toBe('Swing');
    expect(gatherSwingClip(GATHER_HERB_CAST_CLIP, undefined, 'Swing', 'Cast')).toBe('Cast');
    expect(gatherSwingClip('fireball', swings, 'Swing', 'Cast')).toBeUndefined();
  });
});

describe('heldGatherMainhand', () => {
  const none = () => false;
  it('shows the real weapon when not gathering', () => {
    expect(heldGatherMainhand(null, 'worn_sword', 'handaxe', none)).toBe('worn_sword');
  });

  it('shows the family stand-in while gathering, and the tool itself once it has a model', () => {
    expect(heldGatherMainhand('logging', 'worn_sword', 'handaxe', none)).toBe('rusty_hatchet');
    expect(heldGatherMainhand('mining', null, null, none)).toBe('training_mace');
    expect(heldGatherMainhand('logging', 'worn_sword', 'handaxe', (id) => id === 'handaxe')).toBe(
      'handaxe',
    );
    // Fishing keeps its own visuals: no swap.
    expect(heldGatherMainhand('fishing', 'worn_sword', null, none)).toBe('worn_sword');
  });

  it('every stand-in is a real item with a held model', () => {
    for (const id of Object.values(HELD_TOOL_STAND_INS)) {
      expect(ITEMS[id as string]).toBeDefined();
      expect(itemWeaponModelUrl(id)).not.toBeNull();
    }
  });
});
