// Pins the exact bytes the TS client sends for the commands the Unreal client
// implements (target, cast, attack, interact, accept, turnin, use). The C++ test
// Wyndlewood.Net.Commands.Frames asserts its builders emit these same literals, so a
// change to a command's shape here fails until the C++ side follows. Also pins that
// none of these tokens is dispatch-only (a client must never send those).

import { describe, expect, it } from 'vitest';
import { COMMAND_NAMES, DISPATCH_ONLY_COMMANDS } from '../src/world_api';
import { bareClient } from './helpers/bare_client';

function capturingClient(): { client: ReturnType<typeof bareClient>; sent: string[] } {
  const sent: string[] = [];
  const client = bareClient(7, {
    connected: true,
    inputSeq: 40,
    pendingQuestCommands: new Map(),
    ws: { readyState: 1, bufferedAmount: 0, send: (s: string) => sent.push(s) },
  });
  return { client, sent };
}

describe('unreal command frames', () => {
  it('ClientWorld emits the literals the C++ builders are pinned to', () => {
    const { client, sent } = capturingClient();
    client.targetEntity(809);
    client.targetEntity(null);
    client.castAbility('heroic_strike');
    client.castAbilityOn('heroic_strike', 809);
    client.startAutoAttack();
    client.interact();
    client.acceptQuest('q_ps_the_gauntlet');
    client.acceptQuest('q_x', 'b');
    client.turnInQuest('q_ps_strike_true');
    client.turnInQuest('q_x', 'sword');
    client.useItem('baked_bread');
    expect(sent).toEqual([
      '{"t":"cmd","cmd":"target","id":809,"seq":41}',
      '{"t":"cmd","cmd":"target","id":null,"seq":42}',
      '{"t":"cmd","cmd":"cast","ability":"heroic_strike"}',
      '{"t":"cmd","cmd":"cast","ability":"heroic_strike","target":809}',
      '{"t":"cmd","cmd":"attack"}',
      '{"t":"cmd","cmd":"interact"}',
      '{"t":"cmd","cmd":"accept","quest":"q_ps_the_gauntlet"}',
      '{"t":"cmd","cmd":"accept","quest":"q_x","selection":"b"}',
      '{"t":"cmd","cmd":"turnin","quest":"q_ps_strike_true"}',
      '{"t":"cmd","cmd":"turnin","quest":"q_x","choice":"sword"}',
      '{"t":"cmd","cmd":"use","item":"baked_bread"}',
    ]);
  });

  it('every token the Unreal client sends is a client command, never dispatch-only', () => {
    const dispatchOnly = new Set<string>(DISPATCH_ONLY_COMMANDS);
    for (const token of ['target', 'cast', 'attack', 'interact', 'accept', 'turnin', 'use']) {
      expect(COMMAND_NAMES as readonly string[]).toContain(token);
      expect(dispatchOnly.has(token)).toBe(false);
    }
  });
});
