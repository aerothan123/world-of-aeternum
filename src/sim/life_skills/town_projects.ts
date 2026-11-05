// Town restoration projects: the live system (content in
// src/sim/content/town_projects.ts). A player standing at a project's site
// presses interact (interaction.ts interact) and hands in ONE bundle of the
// current stage's materials; the realm's counter for that stage goes up, and
// a full stage opens the next. Each bundle pays the contributor XP at the
// project's level (TOWN_PROJECT_BUNDLE_XP_BAR_SHARE of the bar, with the
// classic quest out-level reduction) and Hearthwright standing through the
// one standing seam.
//
// State is REALM-WIDE, not per character: one progress record per project,
// shared by everyone. It is persisted by the authoritative host under the
// world_state key townProjectsStateKey(realm) (server/town_projects_store.ts)
// through serializeTownProjects / loadTownProjects; the offline host keeps it
// for the session.
//
// Where the state lives: a WeakMap keyed on the SimContext object, so each Sim
// (and each test Sim) has its own isolated record without a new field on the
// sim.ts coordinator, which is at its monolith ceiling. It is genuine sim
// state, not a memo: this is a documented exception to src/sim/CLAUDE.md
// "Adding a mechanic", step 1, to be moved onto Sim when sim.ts is next
// extracted. `townProjectsRev` bumps on every write so the host's save is
// revision-gated (it writes only when something changed).
//
// Deterministic: no rng, no clock.

import {
  TOWN_PROJECT_SITE_RADIUS,
  TOWN_PROJECTS,
  type TownProjectDef,
} from '../content/town_projects';
import { outLevelXpFactor } from '../quests/quest_xp';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { type Entity, xpForLevel } from '../types';
import { grantLifeSkillStanding } from './standing_seam';

/** Share of the project level's bar one bundle pays. */
export const TOWN_PROJECT_BUNDLE_XP_BAR_SHARE = 0.02;

export interface TownProjectProgress {
  /** Index of the stage being worked (stages.length when complete). */
  stage: number;
  /** Bundles handed in toward the current stage. */
  bundles: number;
}

interface TownProjectsState {
  progress: Map<string, TownProjectProgress>;
  /** Stored rows for ids this build does not know, carried through every
   *  write unchanged (never deleted). */
  retained: Record<string, unknown>;
  rev: number;
}

const STATE = new WeakMap<object, TownProjectsState>();

function stateOf(ctx: object): TownProjectsState {
  let s = STATE.get(ctx);
  if (!s) {
    s = { progress: new Map(), retained: {}, rev: 0 };
    STATE.set(ctx, s);
  }
  return s;
}

export function townProjectProgress(ctx: object, projectId: string): TownProjectProgress {
  return stateOf(ctx).progress.get(projectId) ?? { stage: 0, bundles: 0 };
}

/** Revision of the realm's project state (bumps on every write). */
export function townProjectsRev(ctx: object): number {
  return stateOf(ctx).rev;
}

/** Whether a stage (by stable id) is finished: what the town dressing reads. */
export function townProjectStageDone(ctx: object, stageId: string): boolean {
  for (const def of TOWN_PROJECTS) {
    const i = def.stages.findIndex((s) => s.id === stageId);
    if (i >= 0) return townProjectProgress(ctx, def.id).stage > i;
  }
  return false;
}

/** The XP one bundle pays a player of `playerLevel`. */
export function townProjectBundleXp(def: TownProjectDef, playerLevel: number): number {
  const base = Math.round(TOWN_PROJECT_BUNDLE_XP_BAR_SHARE * xpForLevel(def.level));
  return Math.round(base * outLevelXpFactor(playerLevel - def.level));
}

function siteAt(e: Entity): TownProjectDef | undefined {
  const r2 = TOWN_PROJECT_SITE_RADIUS * TOWN_PROJECT_SITE_RADIUS;
  return TOWN_PROJECTS.find((def) => {
    const dx = e.pos.x - def.site.x;
    const dz = e.pos.z - def.site.z;
    return dx * dx + dz * dz <= r2;
  });
}

/** The interact arm: true when the player stands at a project site (the press
 *  is spent here, contribution or not). */
export function tryContributeAtTownProject(ctx: SimContext, meta: PlayerMeta, p: Entity): boolean {
  const def = siteAt(p);
  if (!def) return false;
  const state = stateOf(ctx);
  const progress = townProjectProgress(ctx, def.id);
  const stage = def.stages[progress.stage];
  if (!stage) {
    ctx.notice(meta.entityId, `${def.name} is complete. The town thanks you.`);
    return true;
  }
  const short = stage.bundle.find((b) => ctx.countItem(b.itemId, meta.entityId) < b.count);
  if (short) {
    ctx.notice(
      meta.entityId,
      `${def.name}: ${stage.name} needs a bundle of materials. ${progress.bundles} of ${stage.bundlesNeeded} bundles are in.`,
    );
    return true;
  }
  for (const b of stage.bundle) ctx.removeItem(b.itemId, b.count, meta.entityId);
  const next: TownProjectProgress = { stage: progress.stage, bundles: progress.bundles + 1 };
  const finished = next.bundles >= stage.bundlesNeeded;
  if (finished) {
    next.stage++;
    next.bundles = 0;
  }
  state.progress.set(def.id, next);
  state.rev++;
  const xp = townProjectBundleXp(def, p.level);
  if (xp > 0) ctx.grantXp(xp, meta);
  grantLifeSkillStanding(ctx, meta, 'townProject', def.level);
  ctx.notice(
    meta.entityId,
    finished
      ? `${def.name}: ${stage.name} is finished. The town thanks you.`
      : `You contribute to ${def.name}: ${stage.name}, ${next.bundles} of ${stage.bundlesNeeded} bundles.`,
  );
  return true;
}

/** The persisted realm record: projectId to progress, sparse (an untouched
 *  project is absent). */
export function serializeTownProjects(ctx: object): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stateOf(ctx).retained };
  for (const def of TOWN_PROJECTS) {
    const p = stateOf(ctx).progress.get(def.id);
    if (p && (p.stage > 0 || p.bundles > 0)) out[def.id] = { stage: p.stage, bundles: p.bundles };
  }
  return out;
}

/** The one load path: known project ids only, stage clamped to the stage
 *  count, bundles clamped below the current stage's need. A row for an id
 *  this build does not know is retained verbatim and written back. */
export function loadTownProjects(ctx: object, raw: unknown): void {
  const state = stateOf(ctx);
  state.progress.clear();
  state.retained = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return;
  const known = new Set(TOWN_PROJECTS.map((d) => d.id));
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(id)) state.retained[id] = row;
  }
  for (const def of TOWN_PROJECTS) {
    const r = (raw as Record<string, unknown>)[def.id] as { stage?: unknown; bundles?: unknown };
    if (!r || typeof r !== 'object') continue;
    const stage =
      typeof r.stage === 'number' && Number.isInteger(r.stage)
        ? Math.max(0, Math.min(def.stages.length, r.stage))
        : 0;
    const need = def.stages[stage]?.bundlesNeeded ?? 0;
    const bundles =
      typeof r.bundles === 'number' && Number.isInteger(r.bundles)
        ? Math.max(0, Math.min(Math.max(0, need - 1), r.bundles))
        : 0;
    state.progress.set(def.id, { stage, bundles });
  }
}
