// Fairness of the add-on API (docs/design/addon-api.md sections 1 and 8): an
// add-on reads only what the player's own HUD shows and can never act on its
// own. Pinned against a real offline Sim: the snapshot's units are the HUD's
// frames, minimap markers stay inside the minimap radius, no hidden combat
// internals leak, the event filter drops third-party combat, and the worker
// message vocabulary holds no action at all.
import { describe, expect, it } from 'vitest';
import { castBarState } from '../src/render/cast_bar';
import { Sim } from '../src/sim/sim';
import { type Entity, FISHING_CAST_ID, type SimEvent } from '../src/sim/types';
import { filterAddonEvents } from '../src/ui/hud/addons/addon_event_filter_core';
import { ADDON_PERMISSIONS, type AddonPermission } from '../src/ui/hud/addons/addon_manifest_core';
import { parseWorkerMessage } from '../src/ui/hud/addons/addon_runtime_core';
import {
  ADDON_MINIMAP_BASE_SCALE,
  ADDON_MINIMAP_RADIUS_YARDS,
  ADDON_MINIMAP_SIZE,
  addonCastState,
  createAddonSnapshotBuilder,
  stripSnapshotForPermissions,
} from '../src/ui/hud/addons/addon_snapshot_core';
import { MINIMAP_BASE_SCALE, MINIMAP_SIZE } from '../src/ui/minimap_painter';
import type { IWorld } from '../src/world_api';

const ALL = new Set<AddonPermission>(ADDON_PERMISSIONS);

function world(): { sim: Sim; w: IWorld } {
  const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true });
  return { sim, w: sim as unknown as IWorld };
}

function nearestMob(sim: Sim, maxDist = Infinity): Entity | undefined {
  const p = sim.player;
  let best: Entity | undefined;
  let bestD = maxDist;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead || e.ownerId !== null) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

describe('the snapshot only carries HUD-visible data', () => {
  it('keeps the minimap constants equal to the minimap painter', () => {
    expect(ADDON_MINIMAP_SIZE).toBe(MINIMAP_SIZE);
    expect(ADDON_MINIMAP_BASE_SCALE).toBe(MINIMAP_BASE_SCALE);
  });

  it('exposes only frame unit tokens and no combat internals', () => {
    const { sim, w } = world();
    const mob = nearestMob(sim);
    expect(mob).toBeDefined();
    if (mob) sim.player.targetId = mob.id;
    const snap = createAddonSnapshotBuilder().build(w, 1, ALL);
    for (const k of Object.keys(snap.units)) {
      expect(k).toMatch(/^(player|target|targettarget|pet|party[1-4]|raid\d+)$/);
    }
    const json = JSON.stringify(snap);
    for (const hidden of [
      'cooldown',
      'threat',
      'swingTimer',
      'procState',
      'damageHistory',
      'attackPower',
      'spellPower',
      'abilityCharges',
      'aggroTable',
    ]) {
      expect(json, hidden).not.toContain(`"${hidden}`);
    }
  });

  it('never lists a minimap marker beyond the minimap radius, and never far entities', () => {
    const { sim, w } = world();
    const snap = createAddonSnapshotBuilder().build(w, 1, ALL);
    expect(snap.minimap).not.toBeNull();
    for (const m of snap.minimap?.markers ?? []) {
      expect(Math.hypot(m.dx, m.dz)).toBeLessThanOrEqual(ADDON_MINIMAP_RADIUS_YARDS + 1);
    }
    // An untargeted mob far outside the minimap never appears anywhere.
    const p = sim.player;
    const far = [...sim.entities.values()].find(
      (e) => e.kind === 'mob' && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 150,
    );
    expect(far).toBeDefined();
    if (far) expect(JSON.stringify(snap)).not.toContain(`"id":${far.id},`);
  });

  it('strips each add-on copy to its own permissions', () => {
    const { w } = world();
    const snap = createAddonSnapshotBuilder().build(w, 1, ALL);
    const bare = stripSnapshotForPermissions(snap, new Set());
    expect(bare.minimap).toBeNull();
    expect(bare.inventory).toBeNull();
    expect(bare.quests).toBeNull();
    expect(bare.party).toBeNull();
    expect(
      Object.keys(bare.units).every((k) => ['player', 'target', 'targettarget', 'pet'].includes(k)),
    ).toBe(true);
  });

  it('mirrors the target cast bar rule exactly, including the constant fishing bar', () => {
    const { sim } = world();
    const base = sim.player;
    const variants: Partial<Entity>[] = [
      { castingAbility: null, castTotal: 0, castRemaining: 0 },
      { castingAbility: 'fireball', castTotal: 2, castRemaining: 0.5, channeling: false },
      { castingAbility: 'arcane_missiles', castTotal: 3, castRemaining: 1, channeling: true },
      { castingAbility: FISHING_CAST_ID, castTotal: 20, castRemaining: 3, channeling: false },
      { castingAbility: 'fireball', castTotal: 2, castRemaining: 1, dead: true },
    ];
    for (const v of variants) {
      const e = { ...base, ...v } as Entity;
      const hud = castBarState(e);
      const ours = addonCastState(e);
      expect(ours.visible).toBe(hud.visible);
      if (hud.visible && ours.visible) {
        expect(ours.fill).toBeCloseTo(hud.fill, 10);
        expect(ours.channel).toBe(hud.channel);
        expect(ours.fishing).toBe(hud.fishing);
      }
    }
  });
});

describe('the snapshot on a ClientWorld-shaped mirror', () => {
  it('builds out-of-interest party members from the party frame fields only', () => {
    const { sim } = world();
    const player = sim.player;
    // An online mirror: the party member is NOT in interest (no entity), so only
    // the PartyMemberInfo row the party frame paints is available.
    const mirror = {
      cfg: sim.cfg,
      entities: new Map([[player.id, player]]),
      playerId: player.id,
      player,
      realm: 'test',
      partyInfo: {
        leader: player.id,
        raid: false,
        master: sim.partyInfo?.master ?? null,
        members: [
          {
            pid: player.id,
            name: player.name,
            cls: 'warrior',
            level: 5,
            hp: 1,
            mhp: 1,
            res: 0,
            mres: 0,
            rtype: null,
            x: 0,
            z: 0,
            dead: 0,
            inCombat: 0,
            group: 1,
          },
          {
            pid: 9999,
            name: 'Faraway',
            cls: 'priest',
            level: 7,
            hp: 40,
            mhp: 80,
            res: 10,
            mres: 100,
            rtype: 'mana',
            x: 900,
            z: 900,
            dead: 0,
            inCombat: 1,
            group: 1,
            auras: [{ id: 'renew', kind: 'hot', remaining: 4 }],
          },
        ],
      },
      inventory: [],
      equipment: {},
      copper: 0,
      questLog: new Map(),
    } as unknown as IWorld;
    const perms = new Set<AddonPermission>(['party']);
    const snap = createAddonSnapshotBuilder().build(mirror, 1, perms);
    expect(snap.units.party1).toMatchObject({
      name: 'Faraway',
      hp: 40,
      hpMax: 80,
      inCombat: true,
      cast: null,
    });
    expect(snap.units.party1.auras.map((a) => a.id)).toEqual(['renew']);
    expect(JSON.stringify(snap)).not.toContain('900');
    expect(snap.party?.members.map((m) => m.unit)).toEqual(['player', 'party1']);
  });
});

describe('the combat log filter keeps only own and party combat', () => {
  it('passes own damage, drops third parties, other players personal events and cues', () => {
    const { sim, w } = world();
    const me = sim.playerId;
    const mobs = [...sim.entities.values()].filter((e) => e.kind === 'mob' && e.ownerId === null);
    const [a, b] = mobs;
    const dmg = (sourceId: number, targetId: number, pid?: number): SimEvent =>
      ({
        type: 'damage',
        sourceId,
        targetId,
        amount: 10,
        crit: false,
        school: 'physical',
        ability: null,
        kind: 'hit',
        ...(pid !== undefined ? { pid } : {}),
      }) as SimEvent;
    const events: SimEvent[] = [
      dmg(me, a.id),
      dmg(a.id, me),
      dmg(a.id, b.id),
      dmg(me, a.id, me + 999),
      {
        type: 'attackCue',
        sourceId: a.id,
        targetId: b.id,
        school: 'physical',
        ability: null,
        kind: 'hit',
        crit: false,
        landed: true,
      } as SimEvent,
      { type: 'castStart', entityId: b.id, ability: 'x', time: 1 } as SimEvent,
    ];
    const out = filterAddonEvents(events, w, 1, false);
    expect(out.combat).toHaveLength(2);
    expect(out.combat.every((r) => r.source?.id === me || r.target?.id === me)).toBe(true);
    // The current target's cast passes: the target cast bar already shows it.
    sim.player.targetId = b.id;
    const targeted = filterAddonEvents(events.slice(5), w, 1, false);
    expect(targeted.combat.map((r) => r.kind)).toEqual(['castStart']);
  });

  it('drops chat unless asked, and never another players whisper delivered offline', () => {
    const { sim, w } = world();
    const chat = (pid?: number): SimEvent =>
      ({
        type: 'chat',
        fromPid: 5,
        from: 'Bob',
        text: 'hi',
        channel: 'whisper',
        ...(pid ? { pid } : {}),
      }) as SimEvent;
    expect(filterAddonEvents([chat()], w, 1, false).chat).toHaveLength(0);
    expect(filterAddonEvents([chat()], w, 1, true).chat).toHaveLength(1);
    expect(filterAddonEvents([chat(sim.playerId + 1)], w, 1, true).chat).toHaveLength(0);
  });
});

describe('no automation: the worker vocabulary has no action', () => {
  it.each([
    { t: 'cast', ability: 'fireball' },
    { t: 'castAbility', id: 'x' },
    { t: 'chat', text: '/g hi' },
    { t: 'move', x: 1 },
    { t: 'target', id: 1 },
    { t: 'useItem', id: 'potion' },
    { t: 'trade' },
    { t: 'click', id: 1 },
    { t: 'secure', action: { type: 'actionSlot', slot: 1 } },
    { t: 'eval', code: '1' },
  ])('rejects %o', (msg) => {
    expect(parseWorkerMessage(msg)).toBeNull();
  });

  it('accepts only the closed read/draw/persist set', () => {
    const accepted = [
      'ui',
      'sv',
      'slash',
      'print',
      'err',
      'stats',
      'pong',
      'ready',
      'loadError',
      'comm',
    ];
    const samples: Record<string, unknown> = {
      ui: { t: 'ui', ops: [] },
      sv: { t: 'sv', scope: 'account', json: '{}' },
      slash: { t: 'slash', name: 'x' },
      print: { t: 'print', text: 'x' },
      err: { t: 'err', where: 'x', message: 'y' },
      stats: { t: 'stats', cpuMs: 1 },
      pong: { t: 'pong' },
      ready: { t: 'ready' },
      loadError: { t: 'loadError', message: 'x' },
      comm: { t: 'comm', to: 'lib-core', json: '1' },
    };
    for (const t of accepted) expect(parseWorkerMessage(samples[t])?.t, t).toBe(t);
  });
});
