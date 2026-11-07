import { describe, expect, it } from 'vitest';
import {
  craftActionXp,
  GATHER_XP_BAR_SHARE,
  gatherActionXp,
} from '../src/sim/professions/profession_xp';
import { xpForLevel, zeroDiff } from '../src/sim/types';

describe('profession_xp', () => {
  it('grants positive XP for same-level content', () => {
    expect(gatherActionXp(5, 5)).toBeGreaterThan(0);
    expect(craftActionXp(5, 5)).toBeGreaterThan(0);
  });

  it('the gather and craft curves are not identical', () => {
    expect(gatherActionXp(5, 5)).not.toBe(craftActionXp(5, 5));
  });

  it('grants zero XP once content is zeroDiff(playerLevel) or more levels below the player', () => {
    const playerLevel = 10;
    const zd = zeroDiff(playerLevel);
    expect(gatherActionXp(playerLevel - zd, playerLevel)).toBe(0);
    expect(craftActionXp(playerLevel - zd, playerLevel)).toBe(0);
  });

  it('grants reduced (but nonzero) XP just inside the gray band', () => {
    const playerLevel = 10;
    const zd = zeroDiff(playerLevel);
    const justAbove = gatherActionXp(playerLevel - (zd - 1), playerLevel);
    expect(justAbove).toBeGreaterThan(0);
    expect(justAbove).toBeLessThan(gatherActionXp(playerLevel, playerLevel));
  });

  it('scales up for content above the player level, capped at a +4-level multiplier', () => {
    const atLevel = gatherActionXp(5, 5);
    const above = gatherActionXp(9, 5); // +4 levels: the multiplier cap
    expect(above).toBeGreaterThan(atLevel);
    // The scale-UP multiplier caps at diff=4 (matches mobXpValue's
    // Math.min(diff, 4)): both a +4 and a +15 level gap use the same 1.2x
    // multiplier on their own (higher) content level's bar share.
    const baseAt9 = GATHER_XP_BAR_SHARE * xpForLevel(9);
    const baseAt19 = GATHER_XP_BAR_SHARE * xpForLevel(19);
    expect(above).toBe(Math.round(baseAt9 * 1.2));
    expect(gatherActionXp(19, 5)).toBe(Math.round(baseAt19 * 1.2)); // +14 levels
  });

  it('is formula-driven from the XP bar, with a tier bonus', () => {
    expect(gatherActionXp(10, 10)).toBe(Math.round(xpForLevel(10) / 250));
    expect(craftActionXp(10, 10)).toBe(Math.round(xpForLevel(10) / 100));
    expect(gatherActionXp(10, 10, 3)).toBe(Math.round((xpForLevel(10) / 250) * 1.2));
  });

  it('determinism: pure function, same inputs always produce the same output', () => {
    expect(gatherActionXp(7, 4)).toBe(gatherActionXp(7, 4));
    expect(craftActionXp(12, 9)).toBe(craftActionXp(12, 9));
  });
});
