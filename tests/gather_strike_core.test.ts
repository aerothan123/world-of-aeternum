// Gathering strike timing (src/render/gather_strike_core.ts): a strike lands on
// the swing clip's tool contact, once per swing, for the first swing of a cast
// too, never off a hand-off, and a body whose rig is frozen (behind the camera)
// keeps its rhythm on the coast.
import { describe, expect, it } from 'vitest';
import { WOC_CONTACTS } from '../src/render/characters/manifest';
import { GATHER_HERB_CAST_CLIP, GATHER_MINE_CAST_CLIP } from '../src/render/gather_pose_core';
import {
  coastGatherSwing,
  contactPhase,
  DEFAULT_STRIKE_PHASE,
  DEFAULT_SWING_PERIOD,
  type GatherSwingCycle,
  gatherSwingKindFor,
  newGatherStrikeTrack,
  observeGatherSwing,
} from '../src/render/gather_strike_core';
import { TREE_CHOP_CAST_CLIP } from '../src/render/tree_felling_core';

const cycle = (
  phase: number,
  kind: GatherSwingCycle['kind'] = 'mine',
  contact: number | null = 0.45,
  period = 1.2,
): GatherSwingCycle => ({ kind, phase, contact, period });

/** Drive a looping swing through `seconds` at `fps` and count the strikes. */
function strikesOver(seconds: number, period: number, contact: number | null, fps = 60): number[] {
  const track = newGatherStrikeTrack();
  const at: number[] = [];
  for (let f = 0; f <= seconds * fps; f++) {
    const t = f / fps;
    const phase = (t / period) % 1;
    if (observeGatherSwing(track, cycle(phase, 'mine', contact, period)) > 0) at.push(t);
  }
  return at;
}

describe('gather swing kinds', () => {
  it('maps the mine and chop cast clips, and nothing else, to a striking swing', () => {
    expect(gatherSwingKindFor(GATHER_MINE_CAST_CLIP)).toBe('mine');
    expect(gatherSwingKindFor(TREE_CHOP_CAST_CLIP)).toBe('chop');
    expect(gatherSwingKindFor(GATHER_HERB_CAST_CLIP)).toBeNull();
    expect(gatherSwingKindFor('fireball')).toBeNull();
    expect(gatherSwingKindFor(null)).toBeNull();
  });

  it('reads the contact phase off the measured clip contacts', () => {
    expect(contactPhase(0.5, 1)).toBeCloseTo(0.5, 9);
    expect(contactPhase(WOC_CONTACTS['2H_Chop']?.[0], 1.3)).toBeCloseTo(0.642 / 1.3, 9);
    expect(contactPhase(undefined, 1)).toBeNull();
    expect(contactPhase(0.4, 0)).toBeNull();
    // the gather swings the WOC rig loops all list a contact
    for (const clip of ['1H_Chop', '1H_Chop_Single', '2H_Chop']) {
      expect(WOC_CONTACTS[clip]?.[0], clip).toBeGreaterThan(0);
    }
  });
});

describe('observeGatherSwing', () => {
  it('strikes once per swing exactly on the contact, the first swing included', () => {
    const period = 1.2;
    const contact = 0.45;
    const at = strikesOver(6, period, contact);
    expect(at.length).toBe(5);
    at.forEach((t, k) => {
      expect(t).toBeGreaterThanOrEqual((k + contact) * period - 1e-9);
      expect(t).toBeLessThan((k + contact) * period + 1 / 60 + 1e-9);
    });
  });

  it('falls back to the default contact for a clip that lists none', () => {
    const at = strikesOver(1, 1, null);
    expect(at.length).toBe(1);
    expect(at[0]).toBeCloseTo(DEFAULT_STRIKE_PHASE, 1);
  });

  it('never fires off a hand-off: the first observed frame only anchors', () => {
    const track = newGatherStrikeTrack();
    // first sight of a body already mid-swing just past its contact
    expect(observeGatherSwing(track, cycle(0.46))).toBe(0);
    expect(observeGatherSwing(track, cycle(0.5))).toBe(0);
    // switching from mining to chopping re-anchors too
    expect(observeGatherSwing(track, cycle(0.3, 'chop'))).toBe(0);
    expect(observeGatherSwing(track, cycle(0.5, 'chop'))).toBe(1);
  });

  it('counts across the loop wrap and ignores a restarted clip', () => {
    const track = newGatherStrikeTrack();
    observeGatherSwing(track, cycle(0.9, 'mine', 0.05));
    expect(observeGatherSwing(track, cycle(0.1, 'mine', 0.05))).toBe(1);
    // a phase that went back (the clip restarted) is never a strike
    observeGatherSwing(track, cycle(0.6));
    expect(observeGatherSwing(track, cycle(0.2))).toBe(0);
  });

  it('reads a hitch frame as at most one strike', () => {
    const track = newGatherStrikeTrack();
    observeGatherSwing(track, cycle(0.1));
    expect(observeGatherSwing(track, cycle(0.95))).toBe(1);
  });

  it('resets when the swing stops', () => {
    const track = newGatherStrikeTrack();
    observeGatherSwing(track, cycle(0.1));
    expect(observeGatherSwing(track, { kind: null, phase: 0, contact: null, period: 1 })).toBe(0);
    expect(track.kind).toBeNull();
  });
});

describe('coastGatherSwing (a rig that is not advancing)', () => {
  it('keeps the rig rhythm it last saw: same contact, same period', () => {
    const track = newGatherStrikeTrack();
    observeGatherSwing(track, cycle(0.2, 'mine', 0.45, 1.2));
    const at: number[] = [];
    for (let f = 1; f <= 6 * 60; f++)
      if (coastGatherSwing(track, 'mine', 1 / 60) > 0) at.push(f / 60);
    expect(at.length).toBe(5);
    // first contact: from phase 0.2 to 0.45 at 1.2 s per swing
    expect(at[0]).toBeCloseTo(0.25 * 1.2, 1);
    expect(at[1] - at[0]).toBeCloseTo(1.2, 1);
  });

  it('starts a body first seen coasting at the top of a default swing', () => {
    const track = newGatherStrikeTrack();
    expect(coastGatherSwing(track, 'chop', 1 / 60)).toBe(0);
    let first = -1;
    for (let f = 1; f <= 120 && first < 0; f++)
      if (coastGatherSwing(track, 'chop', 1 / 60)) first = f / 60;
    expect(first).toBeCloseTo(DEFAULT_STRIKE_PHASE * DEFAULT_SWING_PERIOD, 1);
  });

  it('re-anchors without a strike when the rig takes back over', () => {
    const track = newGatherStrikeTrack();
    observeGatherSwing(track, cycle(0.1));
    coastGatherSwing(track, 'mine', 0.2);
    // the rig resumes at an unrelated phase past the contact: no phantom strike
    expect(observeGatherSwing(track, cycle(0.8))).toBe(0);
    expect(observeGatherSwing(track, cycle(0.95))).toBe(0);
  });
});
