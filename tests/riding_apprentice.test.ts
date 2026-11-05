// Apprentice Riding (src/sim/riding_training.ts): the level 10 first mount rank,
// +40% mounted speed for 2 gold, below the unchanged level 20 Riding (+70%) and
// Advanced Riding (+110%) ranks. Server-authoritative through learnRiding.
import { describe, expect, it } from 'vitest';
import { MOUNT_KEYS } from '../src/sim/content/mounts';
import { BUILTIN_WORLD, NPCS } from '../src/sim/data';
import { moveSpeedMult } from '../src/sim/player_motion';
import {
  APPRENTICE_RIDING_FEE_COPPER,
  APPRENTICE_RIDING_TIER,
  canRide,
  nextRidingTier,
  restoreRidingTraining,
  ridingMoveSpeedPct,
  ridingRankOrder,
  ridingTierBefore,
  ridingTrainingFee,
  ridingTrainingMinLevel,
  savedRidingFields,
} from '../src/sim/riding_training';
import { Sim } from '../src/sim/sim';
import type { WorldContent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: { stablemaster_marla: NPCS.stablemaster_marla },
  groundObjects: [],
};
const makeSim = () => new Sim({ seed: 1, playerClass: 'warrior', world: WORLD });

function standAtMarla(sim: Sim): number {
  const marla = [...sim.entities.values()].find(
    (e) => e.kind === 'npc' && e.templateId === 'stablemaster_marla',
  );
  expect(marla).toBeDefined();
  const { x, z } = marla!.pos;
  sim.player.pos.x = x;
  sim.player.pos.z = z;
  sim.player.pos.y = terrainHeight(x, z, sim.cfg.seed);
  sim.player.prevPos = { ...sim.player.pos };
  return marla!.id;
}

describe('the riding ladder', () => {
  it('orders apprentice below riding below advanced, without renumbering saved tiers', () => {
    expect([0, APPRENTICE_RIDING_TIER, 1, 2].map(ridingRankOrder)).toEqual([0, 1, 2, 3]);
    expect(nextRidingTier(0)).toBe(APPRENTICE_RIDING_TIER);
    expect(nextRidingTier(APPRENTICE_RIDING_TIER)).toBe(1);
    expect(nextRidingTier(1)).toBe(2);
    expect(nextRidingTier(2)).toBeNull();
    expect(ridingTierBefore(3)).toBe(0);
    expect(ridingTierBefore(1)).toBe(3);
    expect(ridingTierBefore(2)).toBe(1);
    expect(ridingTrainingMinLevel(0)).toBe(10);
    expect(ridingTrainingMinLevel(APPRENTICE_RIDING_TIER)).toBe(20);
  });

  it('prices and speeds: 2 gold for +40%, the shipped ranks unchanged', () => {
    expect(ridingTrainingFee(0)).toBe(APPRENTICE_RIDING_FEE_COPPER);
    expect(APPRENTICE_RIDING_FEE_COPPER).toBe(20_000);
    expect(ridingTrainingFee(APPRENTICE_RIDING_TIER)).toBe(800_000);
    expect(ridingTrainingFee(1)).toBe(10_000_000);
    expect(ridingMoveSpeedPct(APPRENTICE_RIDING_TIER)).toBe(0.4);
    expect(ridingMoveSpeedPct(1)).toBe(0.7);
    expect(ridingMoveSpeedPct(2)).toBe(1.1);
  });

  it('persists apprentice sparsely and restores it; a Riding proof wins', () => {
    expect(savedRidingFields({})).toEqual({});
    expect(savedRidingFields({ ridingTier: 3 })).toEqual({ ridingTier: 3 });
    expect(savedRidingFields({ ridingTrained: true, ridingTier: 1 })).toEqual({
      ridingTrained: true,
    });
    const blank = () => ({ questLog: new Map(), questsDone: new Set<string>() });
    const a = blank() as Parameters<typeof restoreRidingTraining>[0];
    expect(restoreRidingTraining(a, { ridingTier: 3 })).toBe(APPRENTICE_RIDING_TIER);
    expect(canRide(a)).toBe(true);
    const b = blank() as Parameters<typeof restoreRidingTraining>[0];
    expect(restoreRidingTraining(b, { ridingTier: 3, ridingTrained: true })).toBe(1);
    expect(canRide({})).toBe(false);
  });
});

describe('learning Apprentice Riding at the stablemaster', () => {
  it('teaches at level 10, refuses at 9, and mounts at +40% on every mount', () => {
    const sim = makeSim();
    const meta = sim.players.get(sim.playerId)!;
    const npc = standAtMarla(sim);
    meta.copper = APPRENTICE_RIDING_FEE_COPPER;
    sim.setPlayerLevel(9);
    sim.buyItem(npc, 'riding_training', { expectedRidingTier: 0 });
    expect(sim.ridingTrainingTier()).toBe(0);
    expect(meta.copper).toBe(APPRENTICE_RIDING_FEE_COPPER);
    sim.setPlayerLevel(10);
    standAtMarla(sim);
    sim.buyItem(npc, 'riding_training', { expectedRidingTier: 0 });
    expect(sim.ridingTrainingTier()).toBe(APPRENTICE_RIDING_TIER);
    expect(sim.ridingTrained()).toBe(true);
    expect(meta.ridingTrained).toBeUndefined();
    expect(meta.copper).toBe(0);
    for (const key of MOUNT_KEYS) {
      sim.player.mountKey = key;
      expect(moveSpeedMult(sim.player)).toBeCloseTo(1.4);
    }
    // Riding itself still waits for level 20.
    meta.copper = 800_000;
    sim.buyItem(npc, 'riding_training', { expectedRidingTier: 3 });
    expect(sim.ridingTrainingTier()).toBe(APPRENTICE_RIDING_TIER);
    expect(meta.copper).toBe(800_000);
  });

  it('round-trips the apprentice rank through a save', () => {
    const sim = makeSim();
    const meta = sim.players.get(sim.playerId)!;
    const npc = standAtMarla(sim);
    sim.setPlayerLevel(10);
    standAtMarla(sim);
    meta.copper = APPRENTICE_RIDING_FEE_COPPER;
    sim.learnRiding(npc, 0);
    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.ridingTier).toBe(3);
    expect(state.ridingTrained).toBeUndefined();
    const restored = makeSim();
    const pid = restored.addPlayer('warrior', 'Apprentice', { state });
    expect(restored.entities.get(pid)!.ridingTier).toBe(APPRENTICE_RIDING_TIER);
  });

  it('lets an apprentice buy the stable horse at level 10', () => {
    const sim = makeSim();
    const meta = sim.players.get(sim.playerId)!;
    const npc = standAtMarla(sim);
    sim.setPlayerLevel(10);
    standAtMarla(sim);
    meta.copper = APPRENTICE_RIDING_FEE_COPPER + 100_000;
    sim.learnRiding(npc, 0);
    sim.buyItem(npc, 'reins_valorsteed');
    expect(sim.countItem('reins_valorsteed')).toBe(1);
  });
});
