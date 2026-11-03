// The gathering tool belt over the wire: the server's unequip dispatch (shape
// only, the sim re-validates), the `gtool` self-delta, the ClientWorld mirror
// decode (the sim's own load rule, malformed refused to an empty belt), the
// client send, and the end-to-end equip and unequip through a real Sim.

import { describe, expect, it } from 'vitest';
import { appendGatheringSelfWire } from '../server/gathering_self_wire';
import { dispatchInventoryGroupingCommand } from '../server/material_stack_wire';
import { decodeGatherToolSlotsWire } from '../src/net/professions_self_mirror';
import { Sim } from '../src/sim/sim';
import { bareClient } from './helpers/bare_client';

function fakeSim() {
  const calls: unknown[][] = [];
  const sim = {
    moveInventoryItem: (...a: unknown[]) => calls.push(['move', ...a]),
    sortInventory: (...a: unknown[]) => calls.push(['sort', ...a]),
    separateMaterialStack: (...a: unknown[]) => calls.push(['sep', ...a]),
    combineMaterialStacks: (...a: unknown[]) => calls.push(['comb', ...a]),
    unequipItem: (...a: unknown[]) => {
      calls.push(['unequip', ...a]);
      return true;
    },
    unequipGatherTool: (...a: unknown[]) => {
      calls.push(['unequipTool', ...a]);
      return true;
    },
  };
  return { sim, calls };
}

describe('server dispatch: unequip_gather_tool', () => {
  it('routes a real profession id and drops anything else', () => {
    const { sim, calls } = fakeSim();
    dispatchInventoryGroupingCommand(sim, 7, { cmd: 'unequip_gather_tool', profession: 'mining' });
    dispatchInventoryGroupingCommand(sim, 7, { cmd: 'unequip_gather_tool', profession: 'cooking' });
    dispatchInventoryGroupingCommand(sim, 7, { cmd: 'unequip_gather_tool', profession: 3 });
    dispatchInventoryGroupingCommand(sim, 7, { cmd: 'unequip_gather_tool' });
    expect(calls).toEqual([['unequipTool', 'mining', 7]]);
  });

  it('keeps the worn-gear unequip arm it absorbed', () => {
    const { sim, calls } = fakeSim();
    dispatchInventoryGroupingCommand(sim, 7, { cmd: 'unequip_item', slot: 'helmet' });
    dispatchInventoryGroupingCommand(sim, 7, { cmd: 'unequip_item', slot: 'not_a_slot' });
    expect(calls).toEqual([['unequip', 'helmet', 7]]);
  });
});

describe('the gtool self-delta and its mirror', () => {
  it('emits the belt and decodes it back through the load rule', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Wire');
    const out: Record<string, unknown> = {};
    appendGatheringSelfWire(
      sim,
      pid,
      (k, v) => {
        out[k] = JSON.parse(JSON.stringify(v));
      },
      (k, raw) => {
        out[k] = JSON.parse(raw);
      },
    );
    expect(decodeGatherToolSlotsWire(out.gtool)).toEqual(sim.gatherToolSlotsFor(pid));
  });

  it('refuses a malformed frame to an empty belt and drops misfiled rows', () => {
    expect(decodeGatherToolSlotsWire(null)).toEqual({});
    expect(decodeGatherToolSlotsWire('junk')).toEqual({});
    expect(
      decodeGatherToolSlotsWire({
        mining: { itemId: 'handaxe', count: 1 },
        logging: { itemId: 'handaxe', count: 4 },
      }),
    ).toEqual({ logging: { itemId: 'handaxe', count: 1 } });
  });

  it('a bare ClientWorld starts with an empty belt and sends the unequip command', () => {
    const sent: unknown[] = [];
    const client = bareClient(1, {
      connected: true,
      ws: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)) },
    });
    (globalThis as { WebSocket?: unknown }).WebSocket = { OPEN: 1 };
    expect(client.gatherToolSlots).toEqual({});
    client.unequipGatherTool('herbalism');
    expect(sent).toEqual([{ t: 'cmd', cmd: 'unequip_gather_tool', profession: 'herbalism' }]);
  });
});
