// @vitest-environment happy-dom
// The tree Chop chip's DOM half: the painter
// (src/ui/hud/professions/chop_prompt_painter.ts) over the REAL write-elision
// facet, and the composition Hud drives
// (src/ui/hud/professions/interact_affordances_controller.ts): the chip reuses
// the coach bubble chrome, anchors in #ui author space divided by the UI
// Scale, elides every write on an unchanged frame, and hides on the frame a
// chop starts without waiting for the next poll.

import { beforeEach, describe, expect, it } from 'vitest';
import { CHOP_PROMPT_LIFT, type ChopPromptTarget } from '../src/game/chop_prompt_core';
import { choppableTreesNear } from '../src/sim/trees/tree_registry';
import { type Entity, TREE_CHOP_CAST_ID } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { ChopPromptPainter } from '../src/ui/hud/professions/chop_prompt_painter';
import { InteractAffordancesController } from '../src/ui/hud/professions/interact_affordances_controller';
import { makeWriterFacet } from '../src/ui/painter_host';
import type { IWorld } from '../src/world_api';

function facet() {
  const counts = { writes: 0 };
  const writers = makeWriterFacet(
    new Map(),
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
    () => {
      counts.writes++;
    },
    () => {},
  );
  return { writers, counts };
}

const VIEWPORT = { width: 1600, height: 900 };
const TARGET: ChopPromptTarget = { nodeId: 'tree:1', x: 10, y: 3, z: 20 };

beforeEach(() => {
  document.body.className = '';
  document.body.innerHTML = '<div id="ui"></div><div id="interact-affordance"></div>';
});

describe('ChopPromptPainter', () => {
  function rig(scale = 1, behind = false) {
    const { writers, counts } = facet();
    const ui = document.getElementById('ui') as HTMLElement;
    const painter = new ChopPromptPainter({
      writers,
      host: ui,
      worldToScreen: () => ({ x: 800, y: 400, behind }),
      uiScale: () => scale,
    });
    return { painter, counts, el: painter.element as HTMLElement };
  }

  it('mounts the coach bubble chrome into #ui, hidden', () => {
    const { el } = rig();
    expect(el.parentElement?.id).toBe('ui');
    expect(el.classList.contains('tut-prompt')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.display).toBe('none');
  });

  it('shows the interact keycap and the verb, anchored over the UI scale', () => {
    const { painter, el } = rig(1.25);
    painter.paint(TARGET, { cap: 'F' }, 'Chop', VIEWPORT);
    expect(el.style.display).toBe('flex');
    expect(el.querySelector('.tut-keycap')?.textContent).toBe('F');
    expect(el.querySelector('.tut-prompt-verb')?.textContent).toBe('Chop');
    expect(el.style.left).toBe(`${800 / 1.25}px`);
    expect(el.style.top).toBe(`${400 / 1.25}px`);
    const glyph = el.querySelector<HTMLElement>('.tut-keycap-button');
    expect(glyph?.style.display).toBe('none');
  });

  it('writes nothing on a repeated identical frame', () => {
    const { painter, counts } = rig();
    painter.paint(TARGET, { cap: 'F' }, 'Chop', VIEWPORT);
    const established = counts.writes;
    expect(established).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) painter.paint(TARGET, { cap: 'F' }, 'Chop', VIEWPORT);
    expect(counts.writes).toBe(established);
  });

  it('touch shows the Interact button glyph instead of a keycap', () => {
    const { painter, el } = rig();
    painter.paint(TARGET, { button: true }, 'Chop', VIEWPORT);
    expect(el.querySelector<HTMLElement>('.tut-keycap-button')?.style.display).toBe('');
    expect(el.querySelector('.tut-keycap-button svg')).not.toBeNull();
    expect(el.querySelector<HTMLElement>('.tut-keycap')?.parentElement?.style.display).toBe('none');
  });

  it('hides with no target, and when the trunk is behind the camera', () => {
    const shown = rig();
    shown.painter.paint(TARGET, { cap: 'F' }, 'Chop', VIEWPORT);
    shown.painter.paint(null, { cap: 'F' }, 'Chop', VIEWPORT);
    expect(shown.el.style.display).toBe('none');
    const behind = rig(1, true);
    behind.painter.paint(TARGET, { cap: 'F' }, 'Chop', VIEWPORT);
    expect(behind.el.style.display).toBe('none');
  });

  it('mounts nothing and paints nothing without a host', () => {
    const { writers } = facet();
    const painter = new ChopPromptPainter({
      writers,
      host: null,
      worldToScreen: () => ({ x: 0, y: 0, behind: false }),
      uiScale: () => 1,
    });
    expect(painter.element).toBeNull();
    expect(() => painter.paint(TARGET, null, 'Chop', VIEWPORT)).not.toThrow();
  });
});

describe('InteractAffordancesController', () => {
  const TREE = choppableTreesNear(42, -62, 8, 40)[0];

  function world(): { world: IWorld; player: Entity } {
    const x = TREE.x;
    const z = TREE.z - 1.5;
    const player = {
      id: 1,
      kind: 'player',
      pos: { x, y: groundHeight(x, z, 42), z },
      dead: false,
      ghost: false,
      inCombat: false,
      castingAbility: null,
      eating: null,
      drinking: null,
      auras: [],
    } as unknown as Entity;
    const w = {
      player,
      playerId: 1,
      cfg: { seed: 42 },
      entities: new Map([[1, player]]),
      questLog: new Map(),
      farmPatches: [],
      felledTrees: () => ({ rev: 0, trees: new Map() }),
      nodeHarvestableByMe: () => true,
    } as unknown as IWorld;
    return { world: w, player };
  }

  function rig() {
    const { writers } = facet();
    const projected: Array<[number, number, number]> = [];
    const controller = new InteractAffordancesController({
      writers,
      ui: document.getElementById('ui'),
      notice: document.getElementById('interact-affordance'),
      worldToScreen: (x, y, z) => {
        projected.push([x, y, z]);
        return { x: 700, y: 450, behind: false };
      },
      uiScale: () => 1,
      interactKeyLabel: () => 'F',
    });
    return { controller, el: controller.chopElement as HTMLElement, projected };
  }

  it('shows "F Chop" over the trunk the press would chop', () => {
    const { controller, el, projected } = rig();
    const { world: w } = world();
    controller.update(w, true);
    expect(el.style.display).toBe('flex');
    expect(el.querySelector('.tut-keycap')?.textContent).toBe('F');
    expect(el.querySelector('.tut-prompt-verb')?.textContent).toBe('Chop');
    const [x, y, z] = projected[projected.length - 1];
    expect([x, z]).toEqual([TREE.x, TREE.z]);
    expect(y).toBeCloseTo(groundHeight(TREE.x, TREE.z, 42) + CHOP_PROMPT_LIFT);
    // Keeps tracking the camera between polls.
    controller.update(w, false);
    expect(projected.length).toBe(2);
  });

  it('hides on the frame the chop starts, before the next poll', () => {
    const { controller, el } = rig();
    const { world: w, player } = world();
    controller.update(w, true);
    expect(el.style.display).toBe('flex');
    player.castingAbility = TREE_CHOP_CAST_ID;
    controller.update(w, false);
    expect(el.style.display).toBe('none');
  });

  it('shows the Interact button glyph on the touch interface', () => {
    document.body.classList.add('mobile-touch');
    const { controller, el } = rig();
    controller.update(world().world, true);
    expect(el.querySelector<HTMLElement>('.tut-keycap-button')?.style.display).toBe('');
  });
});
