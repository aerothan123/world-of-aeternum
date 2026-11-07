// The authored-map, seasonal and score half of the HUD's per-frame music input
// (instance_music.ts InstanceMusicInput), read from the live world. Moved out of
// hud.ts's music head so the coordinator passes one spread.
//
// The map field is null on the shipped world, so the built-in soundtrack decision
// is exactly the location walk it always was; the seasonal field is the world's
// running event (IWorld activeSeasonalEvent), null most of the year. The day phase
// and the score signals switch on the Wyndlewood score layer (music_score_layer.ts):
// the phase picks its day or night cues, the signals feed its stingers.

import { currentDayNightPhase } from '../render/day_night_clock';
import { getActiveWorldContent } from '../sim/data';
import type { InstanceMusicInput } from './instance_music';
import type { ScoreSignals } from './music_score';

/** The world reads the score's stingers diff (IWorld members, all optional so a
 *  partial world, a test or the editor, simply reports no signals). */
export interface ScoreSignalWorld {
  readonly player?: { readonly level: number; readonly dead: boolean } | null;
  readonly questsDone?: ReadonlySet<string>;
  readonly deedsEarned?: ReadonlyMap<string, string>;
  readonly myHouse?: unknown;
}

export function scoreSignalsFrom(world: ScoreSignalWorld): ScoreSignals | null {
  const p = world.player;
  if (!p) return null;
  return {
    level: p.level,
    dead: p.dead,
    questsDone: world.questsDone?.size ?? 0,
    deeds: world.deedsEarned?.size ?? 0,
    hasHouse: world.myHouse !== null && world.myHouse !== undefined,
  };
}

export function authoredMapMusicInput(
  world: {
    readonly activeSeasonalEvent: string | null;
  } & ScoreSignalWorld,
): Pick<InstanceMusicInput, 'mapMusic' | 'seasonalEvent' | 'dayPhase' | 'scoreSignals'> {
  return {
    seasonalEvent: world.activeSeasonalEvent,
    // The maker's own soundtrack for an authored map (the Studio's "Map
    // track" and its areas). Absent on the shipped world.
    mapMusic: getActiveWorldContent().music ?? null,
    dayPhase: currentDayNightPhase(),
    scoreSignals: scoreSignalsFrom(world),
  };
}
