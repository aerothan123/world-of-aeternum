// The seasonal-event ClientWorld mirror (the IWorldSeasonal facet, online half),
// one more link in the wire-state base-class chain (QuestWorldWireState ->
// LanceWireState -> GuildHallWireState -> SeasonalWireState -> ReconWireState -> ClientWorld), so
// online.ts stays under its monolith ceiling. It owns the `season` and `hpf` self
// delta keys (server/quest_snapshot_wire.ts).
//
// Presentation only: the server decides whether an event runs; this mirrors the
// answer. The one local effect of
// the mirrored season is collision: the event's solid dressing joins this client's
// collider grid while it runs (seasonal_decor_colliders.ts), so self-prediction walks
// round the same stalls and bales the server's Sim does.
import { GOURDLIGHT_PUMPKINS } from '../sim/content/gourdlight_pumpkins';
import { isBuiltinWorldActive } from '../sim/data';
import { syncSeasonalDecorColliders } from '../sim/seasonal_decor_colliders';
import { GuildHallWireState } from './guild_hall_wire_state';

/** A self `season` value: an event id, or null (an explicit clear). Anything else
 *  is dropped as version skew, never rendered. */
export function decodeSeasonWire(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9_]{1,40}$/.test(value) ? value : null;
}

const PUMPKIN_IDS = new Set(GOURDLIGHT_PUMPKINS.map((pumpkin) => pumpkin.id));

/** Only inspect a catalog-bounded prefix, accepting each known stable id once. */
export function decodeHauntedPumpkinsWire(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const found = new Set<string>();
  for (let i = 0; i < Math.min(value.length, GOURDLIGHT_PUMPKINS.length); i++) {
    const id: unknown = value[i];
    if (typeof id === 'string' && PUMPKIN_IDS.has(id)) found.add(id);
  }
  return Object.freeze([...found].sort());
}

export class SeasonalWireState extends GuildHallWireState {
  /** The world's seed (ClientWorld's own cfg), for the decor collider gate. */
  declare cfg: { seed: number };
  activeSeasonalEvent: string | null = null;
  hauntedPumpkinsFound: readonly string[] = Object.freeze([]);

  /** The lance family's self apply, then the seasonal keys of the same record. */
  override applyQuestSelfSnapshot(
    self: Parameters<GuildHallWireState['applyQuestSelfSnapshot']>[0] & {
      lance?: unknown;
      lrest?: unknown;
      lguide?: unknown;
      season?: unknown;
      hpf?: unknown;
    },
    simTime?: unknown,
  ): boolean {
    const changed = super.applyQuestSelfSnapshot(self, simTime);
    if (self.season !== undefined) {
      this.activeSeasonalEvent = decodeSeasonWire(self.season);
      this.syncSeasonalColliders();
    }
    if (self.hpf !== undefined) this.hauntedPumpkinsFound = decodeHauntedPumpkinsWire(self.hpf);
    return changed;
  }

  /** A fresh session starts closed until the server's first self record says
   *  otherwise: the quest family's session reset clears the seasonal mirrors too. */
  override resetQuestWorldWireState(): void {
    super.resetQuestWorldWireState();
    this.activeSeasonalEvent = null;
    this.hauntedPumpkinsFound = Object.freeze([]);
    this.syncSeasonalColliders();
  }

  /** The mirrored season's collider gate (a reset before cfg exists has nothing to close). */
  private syncSeasonalColliders(): void {
    if (!this.cfg || !isBuiltinWorldActive()) return;
    syncSeasonalDecorColliders(this.cfg.seed, this.activeSeasonalEvent);
  }
}
