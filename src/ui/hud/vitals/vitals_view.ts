// The vitals bar (docs/design/project-h-interface.md, "Vitals bar"): the
// Project H player frame, a single wide health bar at bottom centre with the
// level numeral at its right end and the class resource as a thin bar under it.
// No portrait, no ribbon.
//
// It is a DESCRIPTOR of the unit_frame FAMILY, not a second frame: this pure
// core fills a caller-owned UnitFrameDescriptor from the player's live vitals
// (the values the coordinator used to compute inline in Hud.update), and the
// painter beside it (vitals_painter.ts) composes the family's UnitFramePainter
// over the vitals DOM. The core is DOM-free and allocation-light: it mutates the
// descriptor in place and re-formats a text only when the number behind it
// moved (a cache the caller owns), exactly as the inline block did, so a
// repeated identical frame allocates nothing. Its one i18n use is the shared
// hud_frames.ts formatters, which emit locale-correct DIGITS, never a t() key.
//
// The low-health emphasis (`vitalsLow`) is a THRESHOLD the painter turns into a
// state class, so the health bar's tint changes under a third health. It is
// decoration over information the bar already shows (the fill width and the
// text are identical on every tier); it never hides or delays anything, which is
// the gameplay-neutral presentation rule (DESIGN.md 13.1).

import type { ResourceType } from '../../../sim/types';
import type { AbsorbBarInput } from '../../absorb_bar';
import {
  type HealthTextMode,
  healthTextMode,
  unitFrameCurrentMaxText,
  unitFrameHealthText,
} from '../../hud_frames';
import { formatNumber } from '../../i18n';
import type { UnitFrameDescriptor } from '../../unit_frame';

const LEVEL_OPTS: Intl.NumberFormatOptions = { maximumFractionDigits: 0, useGrouping: false };

/** The descriptor id of the player's vitals bar in the unit_frame family. */
export const VITALS_DESCRIPTOR_ID = 'vitals';
/** The player portrait identity key the family carries (no portrait is drawn,
 *  but the key keeps the family's repaint gate well-defined). */
export const VITALS_PORTRAIT_KEY = 'player';
/** Health fraction at or below which the bar wears its low-health tint. */
export const VITALS_LOW_HEALTH_FRAC = 0.35;
/** The class the painter toggles on the frame at or below the threshold. */
export const VITALS_LOW_CLASS = 'vitals-low';
/** The default health text mode (current / max) when the setting is unset. */
export const VITALS_DEFAULT_HP_MODE: HealthTextMode = 3;

/** The live values the vitals bar reads each frame, plain numbers and strings
 *  only (never an entity reference other than the structural absorb input). */
export interface VitalsInput {
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  /** The player's power kind; null is the mana default. */
  resourceType: ResourceType | null;
  level: number;
  name: string;
  /** The raw playerFrameHealthText setting value (clamped here). */
  hpModeSetting: number | undefined;
  /** Current self PvP exposure. */
  pvpRisk: boolean;
  /** The worn Book of Deeds border slug, resolved at the call site. */
  borderSlug: string;
  /** The entity-shaped absorb input, or null when there is no shield. */
  absorb: AbsorbBarInput | null;
}

/** The caller-owned "last formatted" cache that elides the text producers. */
export interface VitalsCache {
  hp: number;
  maxHp: number;
  hpMode: number;
  resource: number;
  maxResource: number;
  level: number;
}

/** Fresh cache: every slot at NaN so the first frame formats everything. */
export function newVitalsCache(): VitalsCache {
  return {
    hp: Number.NaN,
    maxHp: Number.NaN,
    hpMode: Number.NaN,
    resource: Number.NaN,
    maxResource: Number.NaN,
    level: Number.NaN,
  };
}

/** Clear the cache so the next fill re-formats every text. The language
 *  fan-out calls this: the numbers behind the texts are locale-independent, but
 *  their DIGITS come from formatNumber, so a switch must re-resolve them. */
export function resetVitalsCache(cache: VitalsCache): void {
  cache.hp = Number.NaN;
  cache.maxHp = Number.NaN;
  cache.hpMode = Number.NaN;
  cache.resource = Number.NaN;
  cache.maxResource = Number.NaN;
  cache.level = Number.NaN;
}

/** The player's always-present descriptor at its initial values. */
export function newVitalsDescriptor(): UnitFrameDescriptor {
  return {
    present: true,
    hpFrac: 0,
    hpText: '',
    showAbsorbText: true,
    resourceKind: null,
    resFrac: 0,
    resText: '',
    levelText: null,
    name: '',
    portraitKey: VITALS_PORTRAIT_KEY,
    borderSlug: '',
    absorb: null,
    dead: false,
    outOfRange: false,
  };
}

/** The level numeral at the bar's right end: locale digits, nothing else. */
export function vitalsLevelText(level: number): string {
  return formatNumber(level, LEVEL_OPTS);
}

/** True at or below the low-health threshold. A full-health or absent bar
 *  (maxHp 0) is never low. */
export function vitalsLow(hpFrac: number): boolean {
  return hpFrac > 0 && hpFrac <= VITALS_LOW_HEALTH_FRAC;
}

/**
 * Fill the vitals descriptor from the live input. Mutates `d` in place and
 * returns it; re-formats the health, resource and level text only when the
 * numbers behind them changed (tracked in `cache`). Pure apart from those two
 * caller-owned objects, and deterministic: the same input always yields the
 * same descriptor.
 */
export function fillVitalsDescriptor(
  cache: VitalsCache,
  d: UnitFrameDescriptor,
  input: VitalsInput,
): UnitFrameDescriptor {
  d.present = true;
  d.hpFrac = input.hp / Math.max(1, input.maxHp);
  const hpMode = healthTextMode(input.hpModeSetting, VITALS_DEFAULT_HP_MODE);
  if (input.hp !== cache.hp || input.maxHp !== cache.maxHp || hpMode !== cache.hpMode) {
    cache.hp = input.hp;
    cache.maxHp = input.maxHp;
    cache.hpMode = hpMode;
    d.hpText = unitFrameHealthText(input.hp, input.maxHp, hpMode);
    d.showAbsorbText = hpMode !== 0;
  }
  d.resourceKind = input.resourceType;
  d.resFrac = input.resource / Math.max(1, input.maxResource);
  if (input.resource !== cache.resource || input.maxResource !== cache.maxResource) {
    cache.resource = input.resource;
    cache.maxResource = input.maxResource;
    d.resText = unitFrameCurrentMaxText(Math.round(input.resource), input.maxResource);
  }
  if (input.level !== cache.level) {
    cache.level = input.level;
    d.levelText = vitalsLevelText(input.level);
  }
  d.name = input.name;
  d.pvpRisk = input.pvpRisk;
  d.borderSlug = input.borderSlug;
  d.absorb = input.absorb;
  return d;
}
