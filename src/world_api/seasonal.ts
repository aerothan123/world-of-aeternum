// IWorld facet: seasonal events (src/sim/seasonal/). What event the world is
// running and the local player's Haunted Pumpkin finds. The event WINDOW is the
// server's (server/seasonal_calendar.ts); the client never decides it, it only
// mirrors the answer.
//
// Offline the Sim reads its own seasonal state (closed unless /dev season opens
// it); online ClientWorld mirrors the `season` and `hpf` self keys.

export interface IWorldSeasonal {
  /** The seasonal event running now (e.g. 'gourdlight_eve'), or null. */
  readonly activeSeasonalEvent: string | null;
  /** Stable pumpkin ids discovered by the local player this event edition. */
  readonly hauntedPumpkinsFound: readonly string[];
}
