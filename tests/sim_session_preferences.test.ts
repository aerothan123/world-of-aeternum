import { describe, expect, it } from 'vitest';
import {
  applySimSessionPreference,
  isSimSessionPreferenceKey,
  pushSimSessionPreferences,
} from '../src/game/sim_session_preferences';
import { SessionPreferenceMemo } from '../src/net/session_preferences';

// The client half of the sim-authoritative session preferences: main.ts pushes
// every stored one on world entry and mirrors a toggle at once
// (src/game/sim_session_preferences.ts), and ClientWorld replays the last value
// of each after a reconnect (src/net/session_preferences.ts).

function recorder() {
  const calls: string[] = [];
  return {
    calls,
    world: {
      setStopAutoAttackOnTargetSwitch: (on: boolean) => calls.push(`stop:${on}`),
      setAutoLoot: (on: boolean) => calls.push(`loot:${on}`),
    },
  };
}

describe('sim session preferences (client)', () => {
  it('pushes every stored preference on world entry, Auto Loot included', () => {
    const { calls, world } = recorder();
    const stored = { stopAutoAttackOnTargetSwitch: false, autoLoot: true };
    pushSimSessionPreferences(world, { get: (k) => stored[k] });
    expect(calls).toEqual(['stop:false', 'loot:true']);
  });

  it('routes a toggle to its own setter only', () => {
    const { calls, world } = recorder();
    expect(isSimSessionPreferenceKey('autoLoot')).toBe(true);
    expect(isSimSessionPreferenceKey('walkByAutoloot')).toBe(false);
    applySimSessionPreference(world, 'autoLoot', false);
    expect(calls).toEqual(['loot:false']);
  });

  it('replays the last value of each preference, in first-set order', () => {
    const memo = new SessionPreferenceMemo()
      .with({ cmd: 'set_auto_loot', enabled: true })
      .with({ cmd: 'stopAutoAttackOnTargetSwitch', enabled: true })
      .with({ cmd: 'set_auto_loot', enabled: false });
    const sent: unknown[] = [];
    memo.replay((pref) => sent.push(pref));
    expect(sent).toEqual([
      { cmd: 'set_auto_loot', enabled: false },
      { cmd: 'stopAutoAttackOnTargetSwitch', enabled: true },
    ]);
    const empty: unknown[] = [];
    new SessionPreferenceMemo().replay((pref) => empty.push(pref));
    expect(empty).toEqual([]);
  });
});
