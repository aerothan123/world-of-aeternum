import { afterEach, describe, expect, it } from 'vitest';

import { isBlocked } from '../src/sim/colliders';
import {
  BUILTIN_WORLD,
  DELVE_LIST,
  DUNGEON_LIST,
  delveOrigin,
  instanceOrigin,
  setActiveWorldContent,
} from '../src/sim/data';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import { EBV2_COLLIDER_IDS, EBV2_COLLIDERS } from '../src/sim/eastbrook_v2/layout.generated';
import { FENBRIDGE_BUILDINGS_BY_ID } from '../src/sim/fenbridge_layout';
import { type CharacterState, Sim } from '../src/sim/sim';
import { emptyZoneProps, type WorldContent } from '../src/sim/types';

const SEED = 2307;

// Eastbrook Vale v2: the centre of a design solid by its id (a sealed box: the
// design's houses and stalls have no walk-in floor).
function ebv2BoxCentre(id: string): { x: number; z: number } {
  const i = EBV2_COLLIDER_IDS.indexOf(id);
  if (i < 0) throw new Error(`Eastbrook v2: no design solid '${id}'`);
  return { x: EBV2_COLLIDERS[i][0], z: EBV2_COLLIDERS[i][1] };
}
// The counting house (the v2 bank, beside svc_bank), a sealed solid.
const EBV2_COUNTING_HOUSE = ebv2BoxCentre('col_27557');

function baseState(): CharacterState {
  const source = new Sim({ seed: SEED, playerClass: 'warrior' });
  const state = source.serializeCharacter(source.playerId);
  if (!state) throw new Error('failed to create persisted-position fixture');
  return state;
}

function stateAt(position: { x: number; z: number }): CharacterState {
  return { ...structuredClone(baseState()), pos: { ...position } };
}

function loadAt(position: { x: number; z: number }, world?: WorldContent) {
  const sim = new Sim({
    seed: SEED,
    playerClass: 'warrior',
    noPlayer: true,
    ...(world ? { world } : {}),
  });
  const pid = sim.addPlayer('warrior', 'Saved', { state: stateAt(position) });
  const player = sim.entities.get(pid);
  if (!player) throw new Error('saved player did not load');
  return { sim, player };
}

afterEach(() => setActiveWorldContent(null));

describe('persisted overworld position escape', () => {
  it('preserves an already-clear saved position exactly', () => {
    const position = { x: 2, z: -2 };
    const { player } = loadAt(position);
    expect({ x: player.pos.x, z: player.pos.z }).toEqual(position);
  });

  it('preserves a collision-free swimming save below the NPC dry-ground threshold', () => {
    const position = { x: -77, z: 88 };
    expect(isBlocked(SEED, position.x, position.z, 0.5)).toBe(false);

    const { player } = loadAt(position);

    expect({ x: player.pos.x, z: player.pos.z }).toEqual(position);
  });

  // Wall-wing row removed 2026-08 for the Eastbrook harbor move (d19aa33f76,
  // docs/design/eastbrook-revamp/site-plan.md): the ring wall is demolished
  // (EASTBROOK_LAYOUT.wall.segments is empty by design), so no wall geometry
  // is left to trap a save in; the remaining rows still exercise the escape
  // path against the moved buildings and stalls.
  // The barracks garrison lot row became the Weekly Vault (still sealed, no
  // walk-in) when the genshin artstyle merge (8bff2cec638) cleared the Wolf
  // Run barracks, leaving that lot open ground.
  it.each([
    [
      'Weekly Vault',
      { x: EASTBROOK_LAYOUT.weeklyVault.x, z: EASTBROOK_LAYOUT.weeklyVault.z } as {
        x: number;
        z: number;
      },
    ],
    // Re-sited for Eastbrook Vale v2: the quay cottage and the market stall
    // rows named old-town solids that stand down on v2 design ground. Their
    // v2 equivalents: a design house west of the bank, and the solid that
    // stands in the market row beside the v2 stalls (svc_vendors).
    ['v2 house', ebv2BoxCentre('col_27657')],
    ['v2 market row solid', ebv2BoxCentre('col_27772')],
    ['v2 counting house', EBV2_COUNTING_HOUSE],
    // The trading post, storage shed and stable rows (and the row terrace
    // before them) retired with the old town kit in the Eastbrook Vale v2
    // port (owner direction: bring nothing over from the old map). The kit
    // pieces no longer stand or collide, so no save can be trapped in one;
    // the rows above still exercise the escape against sealed solids.
  ])('moves a save trapped inside the %s to deterministic clear ground', (_label, position) => {
    expect(isBlocked(SEED, position.x, position.z, 0.5)).toBe(true);
    const first = loadAt(position).player;
    const second = loadAt(position).player;
    const resolved = { x: first.pos.x, z: first.pos.z };

    expect(resolved).not.toEqual(position);
    expect({ x: second.pos.x, z: second.pos.z }).toEqual(resolved);
    expect(isBlocked(SEED, resolved.x, resolved.z, 0.5)).toBe(false);
  });

  it('keeps a save standing inside a walk-in building, which its door lets out', () => {
    // the inn's centre is its own floor (sim/town_walk_in.ts): the save
    // probes as a body standing there (sim/spawn_footing.ts), so its upper
    // storey overhead does not shove the player into the street
    // Re-sited for Eastbrook Vale v2: the Eastbrook bank was the walk-in case,
    // and walk-in floors stand down on v2 design ground (town_walk_in.ts), so
    // this uses Fenbridge's walk-in inn.
    const inn = FENBRIDGE_BUILDINGS_BY_ID.fenbridge_crooked_reed_inn;
    expect(inn.walkIn).toBe(true);
    const position = inn.position;
    const { player } = loadAt(position);
    expect({ x: player.pos.x, z: player.pos.z }).toEqual(position);
  });

  it('does not apply built-in Eastbrook colliders to a custom world', () => {
    const world: WorldContent = { ...BUILTIN_WORLD, props: emptyZoneProps() };
    // Re-sited for Eastbrook Vale v2: was the old bank, now the v2 counting
    // house, which blocks on the built-in world.
    const position = EBV2_COUNTING_HOUSE;
    expect(isBlocked(SEED, position.x, position.z, 0.5)).toBe(true);
    setActiveWorldContent(world);
    const { player } = loadAt(position, world);

    expect({ x: player.pos.x, z: player.pos.z }).toEqual(position);
  });

  it('does not draw RNG while resolving blocked persisted positions', () => {
    const clear = loadAt({ x: 2, z: -2 }).sim;
    // Re-sited for Eastbrook Vale v2: was the old bank, now the v2 counting house.
    const blocked = loadAt(EBV2_COUNTING_HOUSE).sim;

    expect(blocked.rng.next()).toBe(clear.rng.next());
  });

  it('keeps fresh starts and dungeon/delve ejection semantics unchanged', () => {
    const fresh = new Sim({ seed: SEED, playerClass: 'warrior' });
    expect({ x: fresh.player.pos.x, z: fresh.player.pos.z }).toEqual(BUILTIN_WORLD.playerStart);

    const dungeon = DUNGEON_LIST[0];
    const dungeonSaved = instanceOrigin(dungeon.index, 0);
    const dungeonPlayer = loadAt(dungeonSaved).player;
    expect({ x: dungeonPlayer.pos.x, z: dungeonPlayer.pos.z }).toEqual({
      x: dungeon.doorPos.x,
      z: dungeon.doorPos.z - 4,
    });

    const delve = DELVE_LIST[0];
    const delveSaved = delveOrigin(delve.index, 0);
    const delvePlayer = loadAt(delveSaved).player;
    expect({ x: delvePlayer.pos.x, z: delvePlayer.pos.z }).toEqual({
      x: delve.doorPos.x,
      z: delve.doorPos.z - 4,
    });
  });
});
