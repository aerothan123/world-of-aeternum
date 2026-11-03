// The delve self-mirror keys ClientWorld applies per snapshot (the run, the
// companion, Marks, companion upgrades, per-delve clears, the daily record),
// moved out of ClientWorld.applySnapshot to keep online.ts under its monolith
// ceiling. A MOVE: same keys, same order, same delta contract (an omitted key
// means UNCHANGED and keeps the prior mirror; an explicit null resets).

import type { DelveCompanionInfo, DelveDailyInfo, DelveRunInfo } from '../world_api';

export interface DelveSelfMirrors {
  delveRun: DelveRunInfo | null;
  companionState: DelveCompanionInfo | null;
  delveMarks: number;
  companionUpgrades: Record<string, number>;
  delveClears: Record<string, number>;
  delveDaily: DelveDailyInfo;
}

export function applyDelveSelfMirror(
  target: DelveSelfMirrors,
  s: {
    drun?: DelveRunInfo | null;
    dcompanion?: DelveCompanionInfo | null;
    dmarks?: number | null;
    dcomp?: Record<string, number> | null;
    dclears?: Record<string, number> | null;
    delveDaily?: DelveDailyInfo;
  },
): void {
  if (s.drun !== undefined) target.delveRun = s.drun;
  if (s.dcompanion !== undefined) target.companionState = s.dcompanion;
  if (s.dmarks !== undefined) target.delveMarks = s.dmarks ?? 0;
  if (s.dcomp !== undefined) target.companionUpgrades = s.dcomp ?? {};
  if (s.dclears !== undefined) target.delveClears = s.dclears ?? {};
  if (s.delveDaily !== undefined) target.delveDaily = s.delveDaily;
}
