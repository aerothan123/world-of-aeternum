// Pins the exact bytes the TS client sends for the commands the Unreal client
// implements (target, cast, attack, interact). The C++ test
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
    expect(sent).toEqual([
      '{"t":"cmd","cmd":"target","id":809,"seq":41}',
      '{"t":"cmd","cmd":"target","id":null,"seq":42}',
      '{"t":"cmd","cmd":"cast","ability":"heroic_strike"}',
      '{"t":"cmd","cmd":"cast","ability":"heroic_strike","target":809}',
      '{"t":"cmd","cmd":"attack"}',
      '{"t":"cmd","cmd":"interact"}',
    ]);
  });

  it('every token the Unreal client sends is a client command, never dispatch-only', () => {
    const dispatchOnly = new Set<string>(DISPATCH_ONLY_COMMANDS);
    for (const token of ['target', 'cast', 'attack', 'interact']) {
      expect(COMMAND_NAMES as readonly string[]).toContain(token);
      expect(dispatchOnly.has(token)).toBe(false);
    }
  });
});
