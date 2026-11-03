// Felled-tree presentation, the pure half (src/render/tree_felling.ts is the
// thin Three.js consumer). DOM-free, Three-free, clock-injected: every curve and
// every set decision a Vitest can pin directly (tests/tree_felling_core.test.ts).
//
// The timeline of one fall, in seconds from the moment the client learns of it
// (the `treeFelled` event; docs/design/tree-chopping.md):
//   0 .. FALL          the trunk tips away from the feller about its base, easing
//                      IN like gravity (angle grows with the square of time);
//   FALL               impact: the dust burst and the crash cue fire once;
//   FALL .. +BOUNCE    a small rebound off the ground and settle;
//   .. +HOLD           the trunk lies still;
//   .. +FADE           it sinks and shrinks away, leaving the stump.
// A tree already felled when the client first sees it (a join, a reconnect, a
// walk into range) skips straight to the stump. A regrow plays a sapling that
// eases up from SAPLING_START scale to full over REGROW.
//
// Gameplay-neutral by construction: none of this decides anything. The stump is
// drawn on every graphics preset because a missing tree is world state a player
// navigates by (the graphics fairness rule, root CLAUDE.md).

/** Seconds the trunk takes to reach the ground. */
export const TREE_FALL_SECONDS = 1.5;
/** Seconds of the rebound after impact. */
export const TREE_BOUNCE_SECONDS = 0.45;
/** Peak rebound, radians back up off the ground. */
export const TREE_BOUNCE_RADIANS = 0.09;
/** Seconds the trunk lies still before it starts to go. */
export const TREE_LIE_SECONDS = 1.2;
/** Seconds the fallen trunk takes to sink away. */
export const TREE_FADE_SECONDS = 2;
/** Seconds a regrowing sapling takes to reach full size. */
export const TREE_REGROW_ANIM_SECONDS = 2;
/** The sapling's starting scale. */
export const SAPLING_START_SCALE = 0.12;
/** How far past vertical the trunk lies once down (a hair under flat, so a
 *  crown resting on ground reads as resting, not clipping). */
export const TREE_REST_RADIANS = Math.PI / 2 - 0.06;
/** The cast-clip key a chopping body plays: characters/visual.ts maps it to
 *  the rig's one-hand melee swing, looped for as long as the chop runs. */
export const TREE_CHOP_CAST_CLIP = 'chop_tree';
/** One axe swing (matches the sim's TREE_CHOP_SWING_SECONDS). */
export const CHOP_SWING_SECONDS = 1;
/** The axe meets the trunk this far into each swing (the hit cue's beat). */
export const CHOP_HIT_PHASE = 0.55;

/** Total seconds from fall start until the trunk is gone. */
export const TREE_FALL_TOTAL_SECONDS =
  TREE_FALL_SECONDS + TREE_BOUNCE_SECONDS + TREE_LIE_SECONDS + TREE_FADE_SECONDS;

export interface FallPose {
  /** Tilt from vertical about the base, radians (0 standing, ~PI/2 down). */
  angle: number;
  /** Uniform scale of the fallen trunk (1, then shrinking while it sinks). */
  scale: number;
  /** World units the trunk has sunk into the ground. */
  sink: number;
  /** True once the trunk has met the ground (impact has happened). */
  landed: boolean;
  /** True once the trunk is gone and only the stump remains. */
  done: boolean;
}

/** The fall pose `t` seconds after the fall began. Monotone in `t` up to the
 *  impact, then a damped rebound, then still, then a sink. */
export function fallPoseAt(t: number, out: FallPose = blankPose()): FallPose {
  const time = Math.max(0, t);
  out.scale = 1;
  out.sink = 0;
  out.landed = time >= TREE_FALL_SECONDS;
  out.done = time >= TREE_FALL_TOTAL_SECONDS;
  if (time < TREE_FALL_SECONDS) {
    const u = time / TREE_FALL_SECONDS;
    out.angle = TREE_REST_RADIANS * u * u; // ease-in, the way a tree goes over
    return out;
  }
  const afterImpact = time - TREE_FALL_SECONDS;
  if (afterImpact < TREE_BOUNCE_SECONDS) {
    const u = afterImpact / TREE_BOUNCE_SECONDS;
    out.angle = TREE_REST_RADIANS - TREE_BOUNCE_RADIANS * Math.sin(Math.PI * u) * (1 - u * 0.5);
    return out;
  }
  out.angle = TREE_REST_RADIANS;
  const fading = afterImpact - TREE_BOUNCE_SECONDS - TREE_LIE_SECONDS;
  if (fading > 0) {
    const u = Math.min(1, fading / TREE_FADE_SECONDS);
    const ease = u * u * (3 - 2 * u);
    out.scale = Math.max(0, 1 - ease);
    out.sink = ease * 0.8;
  }
  return out;
}

function blankPose(): FallPose {
  return { angle: 0, scale: 1, sink: 0, landed: false, done: false };
}

/** Whether the impact beat falls inside (prev, now]: the one frame that fires
 *  the dust burst and the crash cue. */
export function impactCrossed(prevT: number, nowT: number): boolean {
  return prevT < TREE_FALL_SECONDS && nowT >= TREE_FALL_SECONDS;
}

/** The regrowing sapling's scale `t` seconds into the regrow (ease-out). */
export function regrowScaleAt(t: number): number {
  const u = Math.max(0, Math.min(1, t / TREE_REGROW_ANIM_SECONDS));
  const ease = 1 - (1 - u) * (1 - u);
  return SAPLING_START_SCALE + (1 - SAPLING_START_SCALE) * ease;
}

/** How many axe hits a chop has landed by `elapsed` seconds into its cast:
 *  one per swing, each at CHOP_HIT_PHASE of the swing. */
export function chopHitsBy(elapsed: number): number {
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / CHOP_SWING_SECONDS + (1 - CHOP_HIT_PHASE));
}

/** The horizontal fall direction for a fall yaw (the sim's convention: the
 *  trunk heads along (sin(yaw), cos(yaw))). */
export function fallDirection(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** One frame's change to the felled set, against what the view already shows. */
export interface FelledDiff {
  /** Felled now, not shown before: fall if a fall event is pending, else stump. */
  added: number[];
  /** Shown before, standing now: regrow. */
  removed: number[];
}

/** Diff the shown set against the world's felled ids. Deterministic order
 *  (ascending ids) so the painter's work is reproducible. */
export function diffFelled(
  shown: ReadonlySet<number>,
  felled: Iterable<number>,
  out: FelledDiff = { added: [], removed: [] },
): FelledDiff {
  out.added.length = 0;
  out.removed.length = 0;
  const now = new Set<number>();
  for (const id of felled) {
    now.add(id);
    if (!shown.has(id)) out.added.push(id);
  }
  for (const id of shown) if (!now.has(id)) out.removed.push(id);
  out.added.sort((a, b) => a - b);
  out.removed.sort((a, b) => a - b);
  return out;
}

/** A pending fall is honoured only this long after its event: a fall the
 *  client hears about but whose tree it has not drawn within the window (out of
 *  draw range) collapses to a stump with no animation. */
export const PENDING_FALL_TTL_SECONDS = 3;

/** Whether a pending fall event is still fresh enough to animate. */
export function pendingFallFresh(eventAt: number, now: number): boolean {
  return now - eventAt <= PENDING_FALL_TTL_SECONDS;
}

/** The stump's size for a tree of decoration `scale`: radius and height in
 *  world yards (a trunk base a little wider than the trunk collider). */
export function stumpDims(scale: number): { radius: number; height: number } {
  return { radius: 0.62 * scale, height: 0.55 + 0.25 * scale };
}
