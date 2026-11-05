import { describe, expect, it } from 'vitest';
import { ZONE1_PROPS } from '../src/sim/content/zone1';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import { townKitMapMarks } from '../src/ui/town_kit_map_marks';

describe('town kit map marks', () => {
  it('draws every kit house and civic block, the well and the square stalls from the decor rows', () => {
    const marks = townKitMapMarks(ZONE1_PROPS);
    const kit = EASTBROOK_LAYOUT.townKit;
    const blocks = kit.filter(
      (k) =>
        (k.asset.startsWith('house_') || k.asset.startsWith('civic_')) &&
        k.asset !== 'civic_well' &&
        !k.asset.startsWith('civic_market_stall'),
    );
    expect(marks.buildings).toHaveLength(blocks.length);
    expect(blocks.length).toBeGreaterThanOrEqual(10);
    for (const block of blocks) {
      const mark = marks.buildings.find(
        (b) => b.x === block.position.x && b.z === block.position.z,
      );
      expect(mark, block.id).toBeDefined();
      expect(mark?.w).toBeCloseTo(block.collider.halfWidth * 2, 6);
      expect(mark?.d).toBeCloseTo(block.collider.halfDepth * 2, 6);
      expect(mark?.rot).toBeCloseTo(block.rotation, 6);
    }
    expect(marks.wells).toHaveLength(kit.filter((k) => k.asset === 'civic_well').length);
    expect(marks.stalls).toHaveLength(2);
  });

  it('draws nothing for a world without the kit', () => {
    expect(townKitMapMarks({ decorProps: [] })).toEqual({ buildings: [], wells: [], stalls: [] });
    expect(townKitMapMarks({})).toEqual({ buildings: [], wells: [], stalls: [] });
  });
});
