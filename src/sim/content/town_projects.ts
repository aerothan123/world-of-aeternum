// Town restoration projects (Wyndlewood, the Hearthwright Compact's "everyday
// work strengthens the world" pillar; docs/design/wyndlewood-game-plan.md
// section 4, missing item 6). Data only: the rules are
// src/sim/life_skills/town_projects.ts.
//
// A project is a town works with STAGES. Each stage asks the realm for a
// number of BUNDLES; a bundle is a fixed set of materials one player hands in
// at the project's site with the interact key. When a stage's bundles are all
// in, the next stage opens; a finished stage is what the town crew dresses
// visibly (each stage id is the stable key a prop set reads later). Every
// bundle pays the contributor repeatable-quest XP at the project's level and
// Hearthwright standing (src/sim/life_skills/standing_seam.ts).
//
// The first two are Eastbrook examples, sited on the civic yard plan
// (docs/design/town-layout-eastbrook.md): the yard well at about (-10, -118)
// and the main street lamps by (-44, -97). Materials are Eastbrook's tier 1
// gathers, so a level 3 to 7 player can feed them, and so can an alt.
// Names are plain descriptive English (no coined proper nouns).

export interface TownProjectBundle {
  readonly itemId: string;
  readonly count: number;
}

export interface TownProjectStageDef {
  /** Stable persisted id (the stage key the town dressing reads). */
  readonly id: string;
  /** Player-visible stage name (English; localized by the client matcher). */
  readonly name: string;
  readonly bundle: readonly TownProjectBundle[];
  /** Bundles the realm must hand in to finish the stage. */
  readonly bundlesNeeded: number;
}

export interface TownProjectDef {
  /** Stable persisted id. */
  readonly id: string;
  readonly name: string;
  readonly zoneId: string;
  /** Where the work happens: the interact key within SITE_RADIUS contributes. */
  readonly site: { readonly x: number; readonly z: number };
  /** The level the contribution's XP and standing are priced at. */
  readonly level: number;
  readonly stages: readonly TownProjectStageDef[];
}

/** How close to a site (yards) the interact key contributes. */
export const TOWN_PROJECT_SITE_RADIUS = 3;

export const TOWN_PROJECTS: readonly TownProjectDef[] = Object.freeze([
  Object.freeze({
    id: 'eastbrook_yard_well',
    name: 'The Yard Well',
    zoneId: 'eastbrook_vale',
    site: Object.freeze({ x: -10, z: -118 }),
    level: 5,
    stages: Object.freeze([
      Object.freeze({
        id: 'eastbrook_yard_well_shaft',
        name: 'Line the shaft',
        bundle: Object.freeze([Object.freeze({ itemId: 'copper_ore', count: 10 })]),
        bundlesNeeded: 30,
      }),
      Object.freeze({
        id: 'eastbrook_yard_well_roof',
        name: 'Raise the roof',
        bundle: Object.freeze([Object.freeze({ itemId: 'ashwood_log', count: 10 })]),
        bundlesNeeded: 30,
      }),
      Object.freeze({
        id: 'eastbrook_yard_well_winch',
        name: 'Hang the winch',
        bundle: Object.freeze([
          Object.freeze({ itemId: 'iron_ore', count: 5 }),
          Object.freeze({ itemId: 'ashwood_log', count: 5 }),
        ]),
        bundlesNeeded: 20,
      }),
    ]),
  }),
  Object.freeze({
    id: 'eastbrook_street_lamps',
    name: 'The Main Street Lamps',
    zoneId: 'eastbrook_vale',
    site: Object.freeze({ x: -44, z: -97 }),
    level: 4,
    stages: Object.freeze([
      Object.freeze({
        id: 'eastbrook_street_lamps_posts',
        name: 'Set the posts',
        bundle: Object.freeze([
          Object.freeze({ itemId: 'ashwood_log', count: 8 }),
          Object.freeze({ itemId: 'copper_ore', count: 4 }),
        ]),
        bundlesNeeded: 25,
      }),
      Object.freeze({
        id: 'eastbrook_street_lamps_lanterns',
        name: 'Hang the lanterns',
        bundle: Object.freeze([Object.freeze({ itemId: 'iron_ore', count: 6 })]),
        bundlesNeeded: 25,
      }),
    ]),
  }),
]);

export function townProjectById(id: string): TownProjectDef | undefined {
  return TOWN_PROJECTS.find((p) => p.id === id);
}
