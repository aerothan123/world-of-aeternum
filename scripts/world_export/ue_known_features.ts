// Terrain features that make the between-vertex interpolation error large
// inside a zone. They are properties of the sim terrain, not exporter errors:
// terrainHeight is discontinuous there, so no 0.5 yd lattice can follow it.
import type { HeightReport } from './ue_validate';

/** Between-vertex error (cm) above which a cell is recorded as a known feature. */
export const KNOWN_FEATURE_THRESHOLD_CM = 100;

/** Hand-checked notes by tile name; anything else is listed as unclassified. */
export const KNOWN_FEATURE_NOTES: Readonly<Record<string, string>> = {
  tile_p01_p08:
    'Drakelands forge approach: stepped terraces (brazier props at 2.6, 5.65, 6.9, 10.65 and 14.9 yd) rise to a flat plateau at exactly 19.00 yd with a sheer rim about 11 yd high; terrainHeight steps within 0.05 yd. An authored terrace stamp, not an exporter error and not a river bank or building pad.',
};

export interface KnownFeature {
  tile: string;
  errCm: number;
  at: { x: number; z: number };
  zone: string;
  kind: 'terrain-discontinuity';
  note: string;
}

export function knownFeatures(
  reports: readonly HeightReport[],
  zoneOf: (x: number, z: number) => string,
): KnownFeature[] {
  return reports
    .filter((r) => r.maxOffGridAt && r.maxOffGridErrCm > KNOWN_FEATURE_THRESHOLD_CM)
    .map((r) => {
      const at = r.maxOffGridAt as { x: number; z: number };
      return {
        tile: r.tile,
        errCm: r.maxOffGridErrCm,
        at,
        zone: zoneOf(at.x, at.z),
        kind: 'terrain-discontinuity' as const,
        note:
          KNOWN_FEATURE_NOTES[r.tile] ??
          'Unclassified: the sim terrain steps here faster than the 0.5 yd lattice; not checked by hand.',
      };
    })
    .sort((a, b) => b.errCm - a.errCm);
}
