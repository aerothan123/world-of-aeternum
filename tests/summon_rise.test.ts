// The summoned dead rise as they land (sim/mob/summon_rise.ts + render/summon_rise_fx.ts):
// a boss's undead add wave tags each add with a visual-only rise cue, the renderer keeps
// offering the rise gesture until the add's body exists, and the skeleton minion answers
// it with its Awaken (the heap of bones pulling itself up). Nothing else is cued: a
// summoned beast just arrives.

import { describe, expect, it, vi } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { SUMMON_RISE_WINDOW_SECONDS, SummonRiseFx } from '../src/render/summon_rise_fx';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { spawnBossAdds } from '../src/sim/mob/boss_mechanics';
import { emitSummonRise, risesWhenSummoned, SUMMON_RISE_CUE } from '../src/sim/mob/summon_rise';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

const riseCues = (events: SimEvent[]) =>
  events.filter(
    (e) => e.type === 'spellfx' && e.fx === 'flourish' && e.ability === SUMMON_RISE_CUE,
  ) as (SimEvent & { type: 'spellfx' })[];

const makeSim = () => {
  const sim = new Sim({ seed: 88, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(12);
  return sim;
};
const spawn = (sim: Sim, key: string, x: number, z: number): Entity => {
  const internals = sim as unknown as { nextId: number; addEntity(e: Entity): void };
  const mob = createMob(internals.nextId++, MOBS[key], 8, { x, y: 0, z });
  internals.addEntity(mob);
  return mob;
};

describe('the summoned dead rise (sim)', () => {
  it('rises only the undead', () => {
    expect(MOBS.restless_bones.family).toBe('undead');
    expect(risesWhenSummoned('restless_bones')).toBe(true);
    expect(risesWhenSummoned('forest_wolf')).toBe(false);
    expect(risesWhenSummoned('no_such_mob')).toBe(false);
    const emit = vi.fn();
    emitSummonRise({ emit }, { id: 7, templateId: 'forest_wolf' } as Entity);
    expect(emit).not.toHaveBeenCalled();
    emitSummonRise({ emit }, { id: 9, templateId: 'restless_bones' } as Entity);
    expect(emit).toHaveBeenCalledWith({
      type: 'spellfx',
      sourceId: 9,
      targetId: 9,
      school: 'shadow',
      fx: 'flourish',
      ability: SUMMON_RISE_CUE,
    });
  });

  it("cues every undead add a boss's wave erupts, on the add itself", () => {
    const sim = makeSim();
    const p = sim.player as Entity;
    // Gorrak's own wave: Restless Bones
    const boss = spawn(sim, 'gorrak', p.pos.x + 3, p.pos.z);
    sim.drainEvents();
    spawnBossAdds((sim as unknown as { ctx: never }).ctx, boss, 'restless_bones', 2);
    const cues = riseCues(sim.drainEvents());
    expect(cues.map((c) => c.sourceId).sort()).toEqual([...boss.summonedIds].sort());
    for (const c of cues) expect(c.targetId).toBe(c.sourceId);
  });

  it('cues nothing for a wave of the living', () => {
    const sim = makeSim();
    const p = sim.player as Entity;
    const boss = spawn(sim, 'forest_wolf', p.pos.x + 3, p.pos.z);
    sim.drainEvents();
    spawnBossAdds((sim as unknown as { ctx: never }).ctx, boss, 'forest_wolf', 2);
    expect(boss.summonedIds).toHaveLength(2);
    expect(riseCues(sim.drainEvents())).toEqual([]);
  });
});

describe('the summoned dead rise (render)', () => {
  const cue = (sourceId: number): SimEvent => ({
    type: 'spellfx',
    sourceId,
    targetId: sourceId,
    school: 'shadow',
    fx: 'flourish',
    ability: SUMMON_RISE_CUE,
  });

  it('offers the rise at once and every frame until its window closes', () => {
    const play = vi.fn();
    const fx = new SummonRiseFx(play);
    fx.handleEvent(cue(5));
    expect(play).toHaveBeenLastCalledWith(5, SUMMON_RISE_CUE);
    play.mockClear();
    fx.update(0.5);
    fx.update(0.5);
    expect(play).toHaveBeenCalledTimes(2);
    expect(fx.pending()).toEqual([5]);
    play.mockClear();
    fx.update(SUMMON_RISE_WINDOW_SECONDS);
    expect(play).not.toHaveBeenCalled();
    expect(fx.pending()).toEqual([]);
  });

  it('ignores every other spellfx, including an untagged flourish', () => {
    const play = vi.fn();
    const fx = new SummonRiseFx(play);
    fx.handleEvent({ type: 'spellfx', sourceId: 3, targetId: 3, school: 'fire', fx: 'flourish' });
    fx.handleEvent({ ...cue(4), fx: 'nova' } as SimEvent);
    fx.update(0.1);
    expect(play).not.toHaveBeenCalled();
    expect(fx.pending()).toEqual([]);
  });
});

describe('the skeleton minion on the cue', () => {
  const minionKey = (id: string) =>
    visualKeyFor({ kind: 'mob', templateId: id, family: MOBS[id].family } as never);

  it('draws the summoned minions on the rebuilt skeleton, which just arrives', () => {
    // the rebuilt body plays the warrior library (refit_enemy_looks.ts): it has no
    // Awaken, so the rise cue finds no entrance gesture and the add simply appears
    for (const id of ['restless_bones', 'varkas_boneguard', 'drowned_thrall', 'rift_bonewalker']) {
      const def = VISUALS[minionKey(id)];
      expect(def.url, id).toBe('models/creatures/woc_skeleton_minion.glb');
      expect(def.clips, id).toBe(VISUALS.player_warrior.clips);
      expect(def.entranceGesture, id).toBeUndefined();
    }
  });
});
