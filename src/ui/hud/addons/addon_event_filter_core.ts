// Maps a frame's SimEvent batch to the add-on COMBAT_LOG and CHAT records.
// Pure. FAIRNESS: a combat record passes only when the player, the player's
// pet/guardian, or a party member (or THEIR pet) is the source or the target:
// the same participant set the built-in meters count (src/ui/meters.ts). A
// castStart/castStop also passes for the CURRENT TARGET, because the target
// cast bar already shows it. Events between third parties, personal events of
// other players (offline batches carry every pid), and pure presentation cues
// (attackCue, spellfx) never pass. tests/addon_fairness.test.ts pins this.

import type { Entity, SimEvent } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import { entityDisplayName } from '../../entity_display_core';

export interface AddonActor {
  id: number;
  name: string;
  kind: string;
  isPlayer: boolean;
  isPet: boolean;
  isParty: boolean;
  ownerName?: string;
}

export interface AddonCombatRecord {
  time: number;
  kind: 'damage' | 'heal' | 'absorb' | 'aura' | 'death' | 'castStart' | 'castStop';
  source: AddonActor | null;
  target: AddonActor | null;
  amount?: number;
  overheal?: number;
  absorbed?: number;
  crit?: boolean;
  school?: string;
  ability?: string | null;
  abilityId?: string | null;
  result?: string;
  gained?: boolean;
  stacks?: number;
  success?: boolean;
  periodic?: boolean;
}

export interface AddonChatRecord {
  time: number;
  channel: string;
  from: string;
  text: string;
  to?: string;
}

export interface AddonEventBatch {
  combat: AddonCombatRecord[];
  chat: AddonChatRecord[];
}

const MAX_TEXT = 512;

/** The participant set for one batch: player, party, and their owned entities. */
export function addonParticipants(world: IWorld): Set<number> {
  const ids = new Set<number>([world.playerId]);
  for (const m of world.partyInfo?.members ?? []) ids.add(m.pid);
  return ids;
}

function ownerOf(e: Entity | undefined): number | null {
  if (!e) return null;
  const owner = e.ownerId;
  return typeof owner === 'number' ? owner : null;
}

function actor(
  world: IWorld,
  id: number,
  party: ReadonlySet<number>,
  ownerHint?: number,
): AddonActor | null {
  const e = world.entities.get(id);
  const owner = ownerHint ?? ownerOf(e);
  if (!e) {
    // A source that already despawned (a pet whose owner died) keeps its owner.
    if (owner === null || !party.has(owner)) return null;
    const ownerEnt = world.entities.get(owner);
    return {
      id,
      name: '',
      kind: 'pet',
      isPlayer: false,
      isPet: true,
      isParty: true,
      ownerName: ownerEnt ? entityDisplayName(ownerEnt) : undefined,
    };
  }
  const isPet = owner !== null;
  const rec: AddonActor = {
    id,
    name: entityDisplayName(e),
    kind: isPet ? 'pet' : e.kind,
    isPlayer: e.kind === 'player',
    isPet,
    isParty: party.has(id) || (owner !== null && party.has(owner)),
  };
  if (isPet && owner !== null) {
    const ownerEnt = world.entities.get(owner);
    if (ownerEnt) rec.ownerName = entityDisplayName(ownerEnt);
  }
  return rec;
}

function involved(
  world: IWorld,
  id: number | undefined,
  party: ReadonlySet<number>,
  ownerHint?: number,
): boolean {
  if (typeof id !== 'number') return false;
  if (party.has(id)) return true;
  const owner = ownerHint ?? ownerOf(world.entities.get(id));
  return owner !== null && party.has(owner);
}

/** Filter + map one batch. `time` is the session clock in seconds. */
export function filterAddonEvents(
  events: readonly SimEvent[],
  world: IWorld,
  time: number,
  wantChat: boolean,
): AddonEventBatch {
  const out: AddonEventBatch = { combat: [], chat: [] };
  if (events.length === 0) return out;
  const pid = world.playerId;
  const party = addonParticipants(world);
  const targetId = world.player.targetId;
  for (const ev of events) {
    // pid MEANS personal/owner-only (src/sim/types.ts); never another player's.
    if (ev.pid !== undefined && ev.pid !== pid) continue;
    switch (ev.type) {
      case 'damage': {
        const src = involved(world, ev.sourceId, party, ev.sourceOwnerId);
        if (!src && !involved(world, ev.targetId, party)) break;
        out.combat.push({
          time,
          kind: 'damage',
          source: actor(world, ev.sourceId, party, ev.sourceOwnerId),
          target: actor(world, ev.targetId, party),
          amount: ev.amount,
          absorbed: ev.absorbed ?? 0,
          crit: ev.crit,
          school: ev.school,
          ability: ev.ability,
          abilityId: ev.abilityId ?? null,
          result: ev.kind,
        });
        break;
      }
      case 'heal2': {
        if (ev.cueOnly) break;
        if (!involved(world, ev.sourceId, party) && !involved(world, ev.targetId, party)) break;
        out.combat.push({
          time,
          kind: 'heal',
          source: actor(world, ev.sourceId, party),
          target: actor(world, ev.targetId, party),
          amount: ev.amount,
          overheal: ev.overheal ?? 0,
          absorbed: ev.absorbed ?? 0,
          crit: ev.crit,
          ability: ev.ability,
          abilityId: ev.abilityId ?? null,
          periodic: !!ev.hot,
        });
        break;
      }
      case 'absorb': {
        if (!involved(world, ev.sourceId, party) && !involved(world, ev.targetId, party)) break;
        out.combat.push({
          time,
          kind: 'absorb',
          source: actor(world, ev.sourceId, party),
          target: actor(world, ev.targetId, party),
          amount: ev.amount,
          ability: ev.ability,
          abilityId: ev.abilityId,
        });
        break;
      }
      case 'aura': {
        if (!involved(world, ev.targetId, party) && !involved(world, ev.sourceId, party)) break;
        out.combat.push({
          time,
          kind: 'aura',
          source: typeof ev.sourceId === 'number' ? actor(world, ev.sourceId, party) : null,
          target: actor(world, ev.targetId, party),
          ability: ev.name,
          abilityId: ev.abilityId ?? null,
          gained: ev.gained,
          stacks: ev.stacks ?? 1,
        });
        break;
      }
      case 'death': {
        if (!involved(world, ev.entityId, party) && !involved(world, ev.killerId, party)) break;
        out.combat.push({
          time,
          kind: 'death',
          source: actor(world, ev.killerId, party),
          target: actor(world, ev.entityId, party),
        });
        break;
      }
      case 'castStart':
      case 'castStop': {
        if (ev.entityId !== targetId && !involved(world, ev.entityId, party)) break;
        const rec: AddonCombatRecord = {
          time,
          kind: ev.type,
          source: actor(world, ev.entityId, party),
          target: null,
        };
        if (ev.type === 'castStart') rec.ability = ev.ability;
        else rec.success = ev.success;
        out.combat.push(rec);
        break;
      }
      case 'chat': {
        if (!wantChat) break;
        const rec: AddonChatRecord = {
          time,
          channel: ev.channel ?? 'say',
          from: ev.from.slice(0, 64),
          text: ev.text.slice(0, MAX_TEXT),
        };
        if (ev.to) rec.to = ev.to.slice(0, 64);
        out.chat.push(rec);
        break;
      }
      default:
        break;
    }
  }
  return out;
}
