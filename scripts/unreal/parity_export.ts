// Parity case suites for the native client's C++ ports (ea-plan.md decision D1: C++ ports pinned
// by TS-exported vectors). Each suite runs the authoritative TS rule over a fixed input grid and
// records what it answered; the Unreal automation test `Wyndlewood.<Domain>.Parity.<Suite>`
// replays the same inputs through its port and must reproduce every case.
// File shape (one JSON per suite, Data/Parity/<suite>.json in the Unreal repo):
//   { suite, source, note, cases: [{ in: {...}, out: ... }] }
// To add a suite: write a builder here, register it in PARITY_SUITES, run
// `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_parity_export.test.ts`, copy the file with
// the Unreal repo's tools/sync_ts_exports.ps1, then write the C++ test against it.

import { MAX_LEVEL, mobXpValue, zeroDiff } from '../../src/sim/types';
import { keybindConflicts, keybindRegistry } from './settings_parity';

export const PARITY_EXPORT_SUBDIR = 'parity';

export interface ParityCase {
  in: Record<string, number | string | boolean>;
  out: unknown;
}

export interface ParitySuite {
  suite: string;
  source: string;
  note: string;
  cases: ParityCase[];
}

/** Kill XP per mob level and player level (classic-era base, level-difference scale, gray). */
function xpMobValue(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let player = 1; player <= MAX_LEVEL; player++) {
    for (let mob = 1; mob <= MAX_LEVEL + 5; mob++) {
      cases.push({
        in: { mobLevel: mob, playerLevel: player },
        out: { xp: mobXpValue(mob, player), zeroDiff: zeroDiff(player) },
      });
    }
  }
  return {
    suite: 'xp_mob_value',
    source: 'src/sim/types.ts mobXpValue, zeroDiff',
    note: 'JS Math.round semantics: halves round toward +infinity',
    cases,
  };
}

export const PARITY_SUITES: Record<string, () => ParitySuite> = {
  xp_mob_value: xpMobValue,
  keybind_registry: keybindRegistry,
  keybind_conflicts: keybindConflicts,
};

export function buildParitySuite(name: string): ParitySuite {
  const build = PARITY_SUITES[name];
  if (!build) throw new Error(`unknown parity suite ${name}`);
  return build();
}
