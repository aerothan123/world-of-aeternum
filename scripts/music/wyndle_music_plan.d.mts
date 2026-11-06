// Types for scripts/music/wyndle_music_plan.mjs (the soundtrack plan), for the tests
// that read it (tests/music_score.test.ts).

export interface MusicPlanSongPlan {
  readonly positive_global_styles: readonly string[];
  readonly negative_global_styles: readonly string[];
  readonly sections: readonly (readonly [string, number, readonly string[], readonly string[]])[];
}

export interface MusicPlanCue {
  readonly key: string;
  readonly group: string;
  readonly seconds: number;
  readonly tier: number;
  readonly prompt?: string;
  readonly plan?: MusicPlanSongPlan;
  readonly title?: string;
  readonly venue?: string;
}

export const GLOBAL_STYLE: string;
export const MUSIC_PLAN: readonly MusicPlanCue[];
export function toCompositionPlan(plan: MusicPlanSongPlan): { chunks: unknown[] };
export function planSeconds(maxTier?: number): number;
