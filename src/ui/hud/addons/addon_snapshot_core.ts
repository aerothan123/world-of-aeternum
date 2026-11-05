// The per-tick world snapshot an add-on reads (wynd.unit / party / minimap /
// inventory / quests). Pure: IWorld in, plain JSON-safe records out, built once
// per HUD fast tick and structured-cloned to every running add-on worker.
//
// FAIRNESS CONTRACT (docs/design/addon-api.md sections 1 and 8): every field
// here is something the player's own HUD already shows. Units are the unit,
// target, target-of-target and party frames; the cast is the target cast bar's
// own state (the castBarState rule, so a fishing bite never leaks timing); minimap
// markers are the built-in minimap's marker model at its widest zoom, so no
// entity beyond the minimap radius appears. Nothing reads enemy cooldowns,
// threat tables, or entities outside interest. tests/addon_fairness.test.ts pins it.

import { activeZoneAt, QUESTS } from '../../../sim/data';
import { type Aura, type Entity, FISHING_CAST_ID } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import { entityDisplayName, questTitle } from '../../entity_display_core';
import { createMinimapMarkers, type MinimapMarkers } from '../../minimap_markers';
import { findOwnPet } from '../../pet_frame_view';
import type { AddonPermission } from './addon_manifest_core';

/** Mirrors MINIMAP_SIZE / MINIMAP_BASE_SCALE in minimap_painter.ts (a DOM module
 *  this pure core must not import); tests/addon_fairness.test.ts pins equality. */
export const ADDON_MINIMAP_SIZE = 162;
export const ADDON_MINIMAP_BASE_SCALE = 1.7;
const MINIMAP_CLIP_PX = ADDON_MINIMAP_SIZE / 2 - 2;
export const ADDON_MINIMAP_RADIUS_YARDS = MINIMAP_CLIP_PX / ADDON_MINIMAP_BASE_SCALE;
const MAX_AURAS = 40;
const MAX_MARKERS = 200;

export interface AddonAura {
  id: string;
  name: string;
  kind: string;
  remaining: number;
  duration: number;
  stacks: number;
  mine: boolean;
}

export interface AddonUnit {
  id: number;
  name: string;
  level: number;
  cls: string | null;
  kind: string;
  hp: number;
  hpMax: number;
  power: number;
  powerMax: number;
  powerType: string | null;
  dead: boolean;
  inCombat: boolean;
  hostile: boolean;
  isPlayer: boolean;
  auras: AddonAura[];
  cast: { ability: string; progress: number; channel: boolean; remaining: number | null } | null;
}

export interface AddonPartyMember {
  unit: string;
  name: string;
  cls: string;
  level: number;
  role: string | null;
  dead: boolean;
  connected: boolean;
}

export interface AddonMinimapMarker {
  kind: string;
  dx: number;
  dz: number;
  detail?: string;
}

export interface AddonSnapshot {
  time: number;
  zoneId: string;
  inCombat: boolean;
  units: Record<string, AddonUnit>;
  party: { raid: boolean; leader: string | null; members: AddonPartyMember[] } | null;
  minimap: {
    x: number;
    z: number;
    facing: number;
    zoneId: string;
    radiusYards: number;
    markers: AddonMinimapMarker[];
  } | null;
  inventory: {
    bags: { itemId: string; count: number }[];
    equipped: string[];
    copper: number;
  } | null;
  quests:
    | { id: string; title: string; done: boolean; objectives: { have: number; need: number }[] }[]
    | null;
}

function auraView(a: Aura, playerId: number): AddonAura {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    remaining: a.permanent ? -1 : Math.max(0, Math.round(a.remaining * 10) / 10),
    duration: a.permanent ? -1 : a.duration,
    stacks: a.stacks ?? 1,
    mine: a.sourceId === playerId,
  };
}

/** The target cast bar's own rule (src/render/cast_bar.ts castBarState, which a
 *  pure ui core may not import; tests/addon_fairness.test.ts pins the two equal):
 *  hidden for corpses and objects, a CONSTANT full bar while fishing. */
export function addonCastState(
  e: Entity,
):
  | { visible: false }
  | { visible: true; label: string; fill: number; channel: boolean; fishing: boolean } {
  if (e.dead || e.kind === 'object' || !e.castingAbility || e.castTotal <= 0)
    return { visible: false };
  const remaining = Math.max(0, Math.min(1, e.castRemaining / e.castTotal));
  const fishing = e.castingAbility === FISHING_CAST_ID;
  const fill = fishing ? 1 : e.channeling ? remaining : 1 - remaining;
  return { visible: true, label: e.castingAbility, fill, channel: !!e.channeling, fishing };
}

/** One unit-frame record for an entity the HUD frames show. */
export function addonUnitFromEntity(e: Entity, playerId: number): AddonUnit {
  const cast = addonCastState(e);
  const fishing = cast.visible && cast.fishing;
  const auras: AddonAura[] = [];
  for (const a of e.auras) {
    if (auras.length >= MAX_AURAS) break;
    auras.push(auraView(a, playerId));
  }
  return {
    id: e.id,
    name: entityDisplayName(e),
    level: e.level,
    cls: e.kind === 'player' ? e.templateId : null,
    kind: e.kind === 'mob' && e.ownerId !== null ? 'pet' : e.kind,
    hp: Math.max(0, Math.round(e.hp)),
    hpMax: Math.max(1, Math.round(e.maxHp)),
    power: Math.max(0, Math.round(e.resource)),
    powerMax: Math.max(0, Math.round(e.maxResource)),
    powerType: e.resourceType,
    dead: !!e.dead,
    inCombat: !!e.inCombat,
    hostile: !!e.hostile,
    isPlayer: e.kind === 'player',
    auras,
    cast: cast.visible
      ? {
          ability: cast.label,
          progress: Math.round(cast.fill * 1000) / 1000,
          channel: cast.channel,
          remaining: fishing ? null : Math.max(0, Math.round(e.castRemaining * 10) / 10),
        }
      : null,
  };
}

export interface AddonSnapshotBuilder {
  build(world: IWorld, time: number, perms: ReadonlySet<AddonPermission>): AddonSnapshot;
}

/** A builder that reuses the minimap marker container across ticks. `perms`
 *  is the UNION of permissions of the running add-ons; the runtime then strips
 *  each add-on's copy to its own grant (stripSnapshotForPermissions). */
export function createAddonSnapshotBuilder(): AddonSnapshotBuilder {
  let markers: MinimapMarkers | null = null;
  return {
    build(world, time, perms) {
      const p = world.player;
      const pid = world.playerId;
      const units: Record<string, AddonUnit> = { player: addonUnitFromEntity(p, pid) };
      const target = p.targetId !== null ? world.entities.get(p.targetId) : undefined;
      if (target) {
        units.target = addonUnitFromEntity(target, pid);
        const tot = target.targetId !== null ? world.entities.get(target.targetId) : undefined;
        if (tot) units.targettarget = addonUnitFromEntity(tot, pid);
      }
      const pet = findOwnPet(world.entities.values(), pid);
      if (pet) units.pet = addonUnitFromEntity(pet, pid);
      let party: AddonSnapshot['party'] = null;
      const info = world.partyInfo;
      if (perms.has('party') && info && info.members.length > 0) {
        const members: AddonPartyMember[] = [];
        let n = 0;
        info.members.forEach((m, i) => {
          const token = info.raid ? `raid${i + 1}` : m.pid === pid ? 'player' : `party${++n}`;
          members.push({
            unit: token,
            name: m.name,
            cls: m.cls,
            level: m.level,
            role: m.role ?? null,
            dead: m.dead !== 0,
            connected: m.connected !== 0,
          });
          if (token === 'player') return;
          const ent = world.entities.get(m.pid);
          const base = ent ? addonUnitFromEntity(ent, pid) : null;
          units[token] = {
            id: m.pid,
            name: m.name,
            level: m.level,
            cls: m.cls,
            kind: 'player',
            hp: Math.max(0, Math.round(m.hp)),
            hpMax: Math.max(1, Math.round(m.mhp)),
            power: Math.max(0, Math.round(m.res)),
            powerMax: Math.max(0, Math.round(m.mres)),
            powerType: m.rtype,
            dead: m.dead !== 0,
            inCombat: m.inCombat !== 0,
            hostile: false,
            isPlayer: true,
            auras: base
              ? base.auras
              : (m.auras ?? []).map((a) => ({
                  id: a.id,
                  name: a.id,
                  kind: a.kind,
                  remaining: a.remaining ?? -1,
                  duration: -1,
                  stacks: 1,
                  mine: false,
                })),
            cast: base ? base.cast : null,
          };
        });
        const leader = info.members.find((m) => m.pid === info.leader);
        party = { raid: info.raid, leader: leader ? leader.name : null, members };
      }
      let minimap: AddonSnapshot['minimap'] = null;
      const zoneId = activeZoneAt(p.pos.x, p.pos.z).id;
      if (perms.has('minimap')) {
        markers ??= createMinimapMarkers();
        const model = markers.build(world, ADDON_MINIMAP_SIZE, ADDON_MINIMAP_BASE_SCALE);
        const half = ADDON_MINIMAP_SIZE / 2;
        const out: AddonMinimapMarker[] = [];
        for (const mk of model.markers) {
          if (out.length >= MAX_MARKERS) break;
          if (mk.kind === 'player') continue;
          const rec: AddonMinimapMarker = {
            kind: mk.kind,
            dx: Math.round(((mk.mx - half) / ADDON_MINIMAP_BASE_SCALE) * 10) / 10,
            dz: Math.round(((mk.my - half) / ADDON_MINIMAP_BASE_SCALE) * 10) / 10,
          };
          if (mk.kind === 'gather-node') rec.detail = mk.type;
          else if (mk.kind === 'npc') rec.detail = mk.marker;
          else if (mk.kind === 'mob') rec.detail = mk.aggro ? 'aggro' : 'idle';
          else if (mk.kind === 'party-disc' || mk.kind === 'party-arrow') rec.detail = mk.cls;
          out.push(rec);
        }
        minimap = {
          x: Math.round(p.pos.x * 10) / 10,
          z: Math.round(p.pos.z * 10) / 10,
          facing: Math.round(p.facing * 1000) / 1000,
          zoneId: model.zoneId,
          radiusYards: Math.round(ADDON_MINIMAP_RADIUS_YARDS * 10) / 10,
          markers: out,
        };
      }
      let inventory: AddonSnapshot['inventory'] = null;
      if (perms.has('inventory')) {
        inventory = {
          bags: world.inventory.map((s) => ({ itemId: s.itemId, count: s.count })),
          equipped: Object.values(world.equipment).filter((v): v is string => !!v),
          copper: world.copper,
        };
      }
      let quests: AddonSnapshot['quests'] = null;
      if (perms.has('quests')) {
        quests = [];
        for (const qp of world.questLog.values()) {
          const def = QUESTS[qp.questId];
          quests.push({
            id: qp.questId,
            title: questTitle(qp.questId),
            done: qp.state !== 'active',
            objectives: (def?.objectives ?? []).map((o, i) => ({
              have: qp.counts[i] ?? 0,
              need: qp.resolvedCounts?.[i] ?? o.count ?? 0,
            })),
          });
        }
      }
      return { time, zoneId, inCombat: !!p.inCombat, units, party, minimap, inventory, quests };
    },
  };
}

/** One add-on's view of the shared snapshot: the permission-gated sections it
 *  was not granted are nulled and party unit tokens are dropped. Shallow: the
 *  structured clone on postMessage is the copy. */
export function stripSnapshotForPermissions(
  snap: AddonSnapshot,
  perms: ReadonlySet<AddonPermission>,
): AddonSnapshot {
  let units = snap.units;
  if (!perms.has('party')) {
    units = {};
    for (const k of ['player', 'target', 'targettarget', 'pet']) {
      if (snap.units[k]) units[k] = snap.units[k];
    }
  }
  return {
    ...snap,
    units,
    party: perms.has('party') ? snap.party : null,
    minimap: perms.has('minimap') ? snap.minimap : null,
    inventory: perms.has('inventory') ? snap.inventory : null,
    quests: perms.has('quests') ? snap.quests : null,
  };
}
