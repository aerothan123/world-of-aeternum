// The Crucible's floor scores: each Ignivar floor owns its whole soundtrack, pulls and
// quiet stretches included, so each streams one Wyndlewood score cue (music_score.ts).
import { scoreCueUrl } from './music_tracks';

export type CrucibleFloor = 1 | 2 | 3 | 4;

/** The score cue each floor plays: the forge halls, the molten heart, and the
 *  campaign-scale finale for the innermost floor. */
export const CRUCIBLE_FLOOR_CUES: Readonly<Record<CrucibleFloor, string>> = Object.freeze({
  1: 'wyn_dungeon_ancient_forge',
  2: 'wyn_crucible_heart',
  3: 'wyn_crucible_assembly',
  4: 'wyn_boss_final',
});

export const CRUCIBLE_STREAM_URLS: Readonly<Record<CrucibleFloor, string>> = Object.freeze({
  1: scoreCueUrl(CRUCIBLE_FLOOR_CUES[1]) ?? '',
  2: scoreCueUrl(CRUCIBLE_FLOOR_CUES[2]) ?? '',
  3: scoreCueUrl(CRUCIBLE_FLOOR_CUES[3]) ?? '',
  4: scoreCueUrl(CRUCIBLE_FLOOR_CUES[4]) ?? '',
});

const FLOORS: Readonly<Record<string, CrucibleFloor>> = {
  ignivar_forge_approach: 1,
  ignivar_raid_arena: 2,
  ignivar_molten_assembly: 3,
  ignivar_inner_crucible: 4,
  ignivar_forge_lift: 1,
};

export function crucibleFloorForDungeon(dungeonId: string | null): CrucibleFloor | null {
  return dungeonId !== null && Object.hasOwn(FLOORS, dungeonId) ? FLOORS[dungeonId] : null;
}
