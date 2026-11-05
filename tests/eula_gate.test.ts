// The first-launch EULA gate decision core (src/ui/eula_gate_core.ts) plus the
// shared version token (src/legal_versions.ts).

import { describe, expect, it } from 'vitest';
import { EULA_VERSION, isEulaVersionToken } from '../src/legal_versions';
import {
  eulaGateDecision,
  localEulaRecord,
  parseLocalEulaRecord,
} from '../src/ui/eula_gate_core';

const current = EULA_VERSION;

describe('eulaGateDecision', () => {
  it('prompts a player who never accepted, signed in or offline', () => {
    expect(eulaGateDecision({ current, serverAccepted: null, localAccepted: null })).toBe('prompt');
    expect(eulaGateDecision({ current, serverAccepted: undefined, localAccepted: null })).toBe(
      'prompt',
    );
  });

  it('passes when the ACCOUNT accepted the current version, on any install', () => {
    expect(eulaGateDecision({ current, serverAccepted: current, localAccepted: null })).toBe('pass');
  });

  it('re-prompts after a version bump, even when an older version was accepted', () => {
    expect(
      eulaGateDecision({ current, serverAccepted: '2025-01-01-old', localAccepted: '2025-01-01-old' }),
    ).toBe('prompt');
  });

  it('syncs a local acceptance the account record is missing, without asking again', () => {
    expect(eulaGateDecision({ current, serverAccepted: null, localAccepted: current })).toBe(
      'pass-sync',
    );
    // Offline play or an unreachable server: the local record is the record.
    expect(eulaGateDecision({ current, serverAccepted: undefined, localAccepted: current })).toBe(
      'pass',
    );
  });
});

describe('local EULA record', () => {
  it('round-trips and rejects garbage', () => {
    expect(parseLocalEulaRecord(localEulaRecord(current))).toBe(current);
    expect(parseLocalEulaRecord(null)).toBeNull();
    expect(parseLocalEulaRecord('not json')).toBeNull();
    expect(parseLocalEulaRecord('{"v":7}')).toBeNull();
  });
});

describe('EULA version token', () => {
  it('the current version is a well-formed token', () => {
    expect(isEulaVersionToken(EULA_VERSION)).toBe(true);
    expect(isEulaVersionToken('')).toBe(false);
    expect(isEulaVersionToken('2026-11-04; drop table')).toBe(false);
    expect(isEulaVersionToken(42)).toBe(false);
  });
});
