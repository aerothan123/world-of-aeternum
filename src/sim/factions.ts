// Factions and standing progression: the deterministic simulation leaf for
// allied faction identity, zone attribution, standing tiers, and reputation
// awards. Pure functions; zero RNG, no wall clock, no DOM/Three.js imports.
//
// THE FACTIONS OF WYNDLEWOOD (docs/narrative/wyndlewood_bible.md section 5,
// adopted by docs/narrative/wyndlewood_decisions.md section 3). Four allied
// factions keep standing ladders, quartermasters and marks; the fifth, the
// Pale Accord, is the hostile humanoid enemy of the first campaign and keeps
// no standing at all (HOSTILE_FACTIONS below).
//
// SAVE BACK-COMPAT. The provisional code factions shipped as rift_watch,
// church_order and automatons, and live saves (standing, marks, the Allied
// Hearthstone's bind, the weekly commendation) carry those keys. Each one is
// carried onto the successor that inherits its quartermaster, its ladder and
// its marks (LEGACY_FACTION_IDS): the Church Order's Eastbrook chapel ladder
// becomes the Lanternwardens', the Automatons' Wyrmwatch forge ladder becomes
// the Hearthwright Compact's, and the Rift Watch's Drifthaven provisioner
// becomes the Gilt Measure's. The Bracken Circle is new and starts at zero.
// When a save carries both a legacy key and its successor, the successor wins.

import type { PlayerMeta } from './sim';
import type { WorldQuestDef } from './types';

// Catalogue order keeps the inherited ladders in their shipped order (the
// Rift Watch's, the Church Order's, the Automatons' successors) so every
// per-faction list a player already knows keeps its rows; the new Bracken
// Circle joins at the end.
export const FACTION_IDS = [
  'gilt_measure',
  'lanternwardens',
  'hearthwright_compact',
  'bracken_circle',
] as const;
export type FactionId = (typeof FACTION_IDS)[number];

/** The provisional pre-Wyndlewood faction ids, mapped to their successors. */
export const LEGACY_FACTION_IDS: Readonly<Record<string, FactionId>> = Object.freeze({
  church_order: 'lanternwardens',
  automatons: 'hearthwright_compact',
  rift_watch: 'gilt_measure',
});

/** A saved or wired faction id (current or legacy) resolved to a current id. */
export function migrateFactionId(raw: unknown): FactionId | undefined {
  if (typeof raw !== 'string') return undefined;
  if ((FACTION_IDS as readonly string[]).includes(raw)) return raw as FactionId;
  return Object.hasOwn(LEGACY_FACTION_IDS, raw) ? LEGACY_FACTION_IDS[raw] : undefined;
}

export interface FactionDef {
  readonly id: FactionId;
  readonly name: string;
  readonly hub: {
    readonly name: string;
    readonly zoneId: string;
  };
  readonly zones: readonly string[];
  /** The zones of `zones` that run a rotating world-quest board (aliases
   *  excluded). Pinned against world_quest_rotation.ts WORLD_QUEST_ZONES by
   *  tests/factions.test.ts; kept here so this leaf imports no content. */
  readonly worldQuestZones: readonly string[];
}

export const FACTIONS: Readonly<Record<FactionId, FactionDef>> = Object.freeze({
  // Guards, explorers and road wardens: the vale's heartland and its frontiers.
  lanternwardens: Object.freeze({
    id: 'lanternwardens',
    name: 'Lanternwardens',
    hub: Object.freeze({
      name: 'Eastbrook',
      zoneId: 'eastbrook_vale',
    }),
    zones: Object.freeze(['eastbrook_vale', 'zone1', 'frostveil', 'veiled_hollow', 'wraithwood']),
    worldQuestZones: Object.freeze(['eastbrook_vale', 'frostveil', 'veiled_hollow', 'wraithwood']),
  }),
  // Builders, miners, smiths and makers: the forges and the working coasts.
  hearthwright_compact: Object.freeze({
    id: 'hearthwright_compact',
    name: 'Hearthwright Compact',
    hub: Object.freeze({
      name: 'Wyrmwatch',
      zoneId: 'drakelands',
    }),
    zones: Object.freeze(['thornpeak_heights', 'zone3', 'drakelands', 'galecrest']),
    worldQuestZones: Object.freeze(['thornpeak_heights', 'drakelands', 'galecrest']),
  }),
  // Druids, herbalists and woodland keepers: the old forests and the marsh.
  bracken_circle: Object.freeze({
    id: 'bracken_circle',
    name: 'Bracken Circle',
    hub: Object.freeze({
      name: 'Fenbridge',
      zoneId: 'mirefen_marsh',
    }),
    zones: Object.freeze(['mirefen_marsh', 'zone2', 'amberfall', 'willowfen', 'nightbloom']),
    worldQuestZones: Object.freeze(['mirefen_marsh', 'amberfall', 'willowfen', 'nightbloom']),
  }),
  // Merchants, prospectors and financiers: the trade coasts.
  gilt_measure: Object.freeze({
    id: 'gilt_measure',
    name: 'Gilt Measure',
    hub: Object.freeze({
      name: 'Drifthaven',
      zoneId: 'palmreach',
    }),
    zones: Object.freeze(['palmreach', 'farshore', 'farshore_isle', 'evergarden']),
    worldQuestZones: Object.freeze(['palmreach', 'farshore_isle', 'evergarden']),
  }),
});

/** Static zone-to-faction lookup for every overworld zone and its aliases,
 *  built from FACTIONS so the two can never disagree. */
export const ZONE_TO_FACTION: Readonly<Record<string, FactionId>> = Object.freeze(
  Object.fromEntries(
    FACTION_IDS.flatMap((id) => FACTIONS[id].zones.map((zoneId) => [zoneId, id] as const)),
  ),
);

/** Return the faction that owns the given zone, or null for neutral/tutorial zones. */
export function factionForZone(zoneId: string): FactionId | null {
  return ZONE_TO_FACTION[zoneId] ?? null;
}

/** Return the display name of a faction. */
export function factionDisplayName(factionId: FactionId): string {
  return FACTIONS[factionId]?.name ?? factionId;
}

// ---------------------------------------------------------------------------
// The hostile faction
// ---------------------------------------------------------------------------

export const HOSTILE_FACTION_IDS = ['pale_accord'] as const;
export type HostileFactionId = (typeof HOSTILE_FACTION_IDS)[number];

export interface HostileFactionDef {
  readonly id: HostileFactionId;
  readonly name: string;
  /** The shipped mob templates that serve it (ids frozen; the reframe is
   *  display and prose only, docs/narrative/wyndlewood_decisions.md section 1). */
  readonly mobIds: readonly string[];
}

/** The Pale Accord: Vauldren Sere's secret order. The shipped Gravecaller and
 *  Wyrmcult cells are its agents; the Pale Choir of the Drowned Temple is its
 *  sung liturgy (the clash the decisions file asks to make deliberate). */
export const HOSTILE_FACTIONS: Readonly<Record<HostileFactionId, HostileFactionDef>> =
  Object.freeze({
    pale_accord: Object.freeze({
      id: 'pale_accord',
      name: 'Pale Accord',
      mobIds: Object.freeze([
        'morthen',
        'hollow_acolyte',
        'crypt_gravecaller_adept',
        'crypt_gravecaller_necromancer',
        'candlewright_acolyte',
        'tidebound_acolyte',
        'vael_the_mistcaller',
        'korzul_the_gravewyrm',
      ]),
    }),
  });

/** The hostile faction a mob template serves, or null. */
export function hostileFactionForMob(templateId: string): HostileFactionId | null {
  for (const id of HOSTILE_FACTION_IDS) {
    if (HOSTILE_FACTIONS[id].mobIds.includes(templateId)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Standing tiers & thresholds
// ---------------------------------------------------------------------------

export const STANDING_TIERS = [
  'unknown',
  'recognized',
  'trusted',
  'proven',
  'vanguard',
  'champion',
] as const;

export type StandingTier = (typeof STANDING_TIERS)[number];

export const STANDING_THRESHOLDS: Readonly<Record<StandingTier, number>> = Object.freeze({
  unknown: 0,
  recognized: 1_000,
  trusted: 3_000,
  proven: 7_000,
  vanguard: 13_000,
  champion: 20_000,
});

export const MAX_STANDING = STANDING_THRESHOLDS.champion;
export const LOW_LEVEL_MAX_STANDING = STANDING_THRESHOLDS.trusted; // 3,000 cap for levels 5-15

/** Generic display labels for standing tiers. */
export const STANDING_TIER_LABELS: Readonly<Record<StandingTier, string>> = Object.freeze({
  unknown: 'Unknown',
  recognized: 'Recognized',
  trusted: 'Trusted',
  proven: 'Proven',
  vanguard: 'Vanguard',
  champion: 'Champion',
});

/** Thematic faction-specific flavor titles for each standing tier. */
export const FACTION_TIER_TITLES: Readonly<
  Record<FactionId, Readonly<Record<StandingTier, string>>>
> = Object.freeze({
  lanternwardens: Object.freeze({
    unknown: 'Outsider',
    recognized: 'Lamplighter',
    trusted: 'Lanternbearer',
    proven: 'Warden',
    vanguard: 'Lanternwarden',
    champion: 'Champion',
  }),
  hearthwright_compact: Object.freeze({
    unknown: 'Outsider',
    recognized: 'Hand',
    trusted: 'Journeyman',
    proven: 'Hearthwright',
    vanguard: 'Master Hearthwright',
    champion: 'Champion',
  }),
  bracken_circle: Object.freeze({
    unknown: 'Outsider',
    recognized: 'Seedling',
    trusted: 'Grovefriend',
    proven: 'Greenkeeper',
    vanguard: 'Circle Elder',
    champion: 'Champion',
  }),
  gilt_measure: Object.freeze({
    unknown: 'Outsider',
    recognized: 'Client',
    trusted: 'Associate',
    proven: 'Factor',
    vanguard: 'Magnate',
    champion: 'Champion',
  }),
});

/** Determine the current standing tier from cumulative reputation points. */
export function standingTierForReputation(reputation: number): StandingTier {
  const points = Math.max(0, Math.floor(reputation));
  if (points >= STANDING_THRESHOLDS.champion) return 'champion';
  if (points >= STANDING_THRESHOLDS.vanguard) return 'vanguard';
  if (points >= STANDING_THRESHOLDS.proven) return 'proven';
  if (points >= STANDING_THRESHOLDS.trusted) return 'trusted';
  if (points >= STANDING_THRESHOLDS.recognized) return 'recognized';
  return 'unknown';
}

/** Return the thematic title for a character's standing in a specific faction. */
export function factionTierTitle(factionId: FactionId, reputation: number): string {
  const tier = standingTierForReputation(reputation);
  return FACTION_TIER_TITLES[factionId]?.[tier] ?? STANDING_TIER_LABELS[tier];
}

export interface StandingProgress {
  readonly current: number;
  readonly tier: StandingTier;
  readonly tierStart: number;
  readonly tierNext: number | null;
  readonly tierProgress: number;
  readonly tierRequired: number;
  readonly percent: number;
}

/** Calculate detailed progress towards the next standing tier. */
export function standingProgress(reputation: number): StandingProgress {
  const current = Math.max(0, Math.min(MAX_STANDING, Math.floor(reputation)));
  const tier = standingTierForReputation(current);
  const tierIndex = STANDING_TIERS.indexOf(tier);
  const tierStart = STANDING_THRESHOLDS[tier];
  const nextTier = tierIndex < STANDING_TIERS.length - 1 ? STANDING_TIERS[tierIndex + 1] : null;

  if (nextTier === null) {
    return {
      current,
      tier,
      tierStart,
      tierNext: null,
      tierProgress: current - tierStart,
      tierRequired: 0,
      percent: 100,
    };
  }

  const tierNext = STANDING_THRESHOLDS[nextTier];
  const tierRequired = tierNext - tierStart;
  const tierProgress = current - tierStart;
  const percent =
    tierRequired > 0 ? Math.min(100, Math.floor((tierProgress / tierRequired) * 100)) : 100;

  return {
    current,
    tier,
    tierStart,
    tierNext,
    tierProgress,
    tierRequired,
    percent,
  };
}

/** Maximum standing reputation a player can reach at their current level. */
export function maxStandingForLevel(level: number): number {
  return level <= 15 ? LOW_LEVEL_MAX_STANDING : MAX_STANDING;
}

// ---------------------------------------------------------------------------
// World quest standing rewards
// ---------------------------------------------------------------------------

/** World-quest standing per completion at levels 16 and up; 30 below. */
export const WORLD_QUEST_STANDING_AT_CAP = 100;

/** Amount of standing awarded by a World Quest: a flat amount by level
 *  bracket (faction reputation comes from activities, not zones, so a
 *  faction's zone count no longer weights it; faction_activity.ts). */
export function worldQuestStandingReward(_quest: WorldQuestDef, playerLevel: number): number {
  // Bracket 5-15: 30 reputation per WQ; 16-20: 100.
  return playerLevel <= 15 ? 30 : WORLD_QUEST_STANDING_AT_CAP;
}

/** The faction a World Quest pays: decided by what the player DOES there
 *  (its objective type), never by the zone it stands in (the Wyndlewood
 *  activity rule, faction_activity.ts FACTION_ACTIVITY_SOURCES):
 *  fighting and escorting for the Lanternwardens, building and restoring for
 *  the Hearthwright Compact, gathering and cleansing for the Bracken Circle,
 *  carrying and commerce for the Gilt Measure. */
export function worldQuestFaction(quest: WorldQuestDef): FactionId {
  switch (quest.objective.type) {
    case 'kill':
    case 'investigation':
    case 'shadow':
    case 'escort':
    case 'glider':
      return 'lanternwardens';
    case 'forging':
    case 'salvage':
    case 'puzzle':
    case 'interact':
    case 'tracing':
      return 'hearthwright_compact';
    case 'gather':
    case 'wisp_maze':
      return 'bracken_circle';
    case 'delivery':
    case 'vehicle':
    case 'match3':
      return 'gilt_measure';
    default:
      return 'lanternwardens';
  }
}

// ---------------------------------------------------------------------------
// Faction standing state & mutation
// ---------------------------------------------------------------------------

export function freshFactionReputation(): Record<FactionId, number> {
  return {
    lanternwardens: 0,
    hearthwright_compact: 0,
    bracken_circle: 0,
    gilt_measure: 0,
  };
}

/** Read a per-faction number record, carrying legacy keys onto their
 *  successors (a current key on the same save outranks its legacy key). */
function readFactionRecord(
  raw: unknown,
  accept: (val: number) => number | null,
): Record<FactionId, number> {
  const result = freshFactionReputation();
  if (!raw || typeof raw !== 'object') return result;
  const obj = raw as Record<string, unknown>;
  for (const [legacy, successor] of Object.entries(LEGACY_FACTION_IDS)) {
    const val = obj[legacy];
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    const next = accept(val);
    if (next !== null) result[successor] = next;
  }
  for (const id of FACTION_IDS) {
    const val = obj[id];
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    const next = accept(val);
    if (next !== null) result[id] = next;
  }
  return result;
}

export function sanitizeFactionReputation(raw: unknown): Record<FactionId, number> {
  return readFactionRecord(raw, (val) => Math.max(0, Math.min(MAX_STANDING, Math.floor(val))));
}

export interface AwardStandingResult {
  readonly gained: number;
  readonly total: number;
  readonly tier: StandingTier;
  /** The tier before the award; differs from `tier` exactly when a new tier was reached. */
  readonly previousTier: StandingTier;
  readonly capped: boolean;
}

/** Award faction reputation to PlayerMeta, respecting level caps. Pure state mutation. */
export function awardFactionReputation(
  meta: PlayerMeta,
  factionId: FactionId,
  amount: number,
  playerLevel: number,
): AwardStandingResult {
  if (!meta.factions) {
    meta.factions = freshFactionReputation();
  }
  const current = meta.factions[factionId] ?? 0;
  const cap = maxStandingForLevel(playerLevel);
  const add = Math.max(0, Math.floor(amount));
  const newTotal = Math.min(cap, current + add);
  const gained = newTotal - current;
  meta.factions[factionId] = newTotal;
  const tier = standingTierForReputation(newTotal);
  const previousTier = standingTierForReputation(current);
  const capped = current + add > cap;
  return { gained, total: newTotal, tier, previousTier, capped };
}

/** The dedicated currency ID for each allied faction. The three inherited
 *  ladders keep their shipped currency ids (frozen; persisted balances and
 *  committed art key on them); only their display names changed. */
export const FACTION_CURRENCY_IDS: Readonly<Record<FactionId, string>> = Object.freeze({
  lanternwardens: 'church_order_crest',
  hearthwright_compact: 'automaton_cog',
  bracken_circle: 'bracken_circle_acorn',
  gilt_measure: 'rift_watch_mark',
});

export function freshFactionCurrencies(): Record<FactionId, number> {
  return freshFactionReputation();
}

export function sanitizeFactionCurrencies(raw: unknown): Record<FactionId, number> {
  return readFactionRecord(raw, (val) => (val > 0 ? Math.floor(val) : null));
}

/** The Allied Hearthstone's saved or wired hub: a known faction id (a legacy id
 *  binds to its successor's hub), else unbound. */
export function sanitizeAlliedHearthstoneAttunement(raw: unknown): FactionId | undefined {
  return migrateFactionId(raw);
}

/** Reward in faction currency for completing a World Quest in that faction's zone. */
export function worldQuestFactionCurrencyReward(_quest: WorldQuestDef, level: number): number {
  return level <= 15 ? 5 : 10;
}

/** Display name of each faction's currency. */
export function factionCurrencyName(factionId: FactionId): string {
  switch (factionId) {
    case 'lanternwardens':
      return 'Lantern Crest';
    case 'hearthwright_compact':
      return 'Hearthwright Cog';
    case 'bracken_circle':
      return 'Bracken Acorn';
    case 'gilt_measure':
      return 'Gilt Mark';
  }
}

/** Award faction currency directly to PlayerMeta. */
export function awardFactionCurrency(
  meta: PlayerMeta,
  factionId: FactionId,
  amount: number,
): number {
  if (!meta.factionCurrencies) {
    meta.factionCurrencies = freshFactionCurrencies();
  }
  const current = meta.factionCurrencies[factionId] ?? 0;
  const next = current + Math.max(0, Math.floor(amount));
  meta.factionCurrencies[factionId] = next;
  return next;
}
