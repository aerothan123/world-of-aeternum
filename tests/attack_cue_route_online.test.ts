import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
}));

import { AttackCueFragments, attackCueForDamage } from '../server/attack_cue';
import { type ClientSession, GameServer } from '../server/game';
import { damageViewOfAttackCue, presentedCombatEvent } from '../src/render/attack_cue_core';
import type { Entity, SimEvent, Vec3 } from '../src/sim/types';
import { bareClient } from './helpers/bare_client';

// The bystander attack cue (server/attack_cue.ts): a damage event stays with its
// participants (the combat log and meters contract pinned in
// tests/combat_log_event_route_online.test.ts), and every OTHER session whose
// anchor is inside EVENT_RADIUS of the target receives the numberless
// `attackCue` instead, so a stranger's swing still animates on their client.

type DamageEvent = Extract<SimEvent, { type: 'damage' }>;
type AttackCueEvent = Extract<SimEvent, { type: 'attackCue' }>;
type WireMsg = { t?: string; list?: SimEvent[] };

interface FakeClient {
  sent: WireMsg[];
  raw: string[];
  ws: { readyState: number; send(payload: string): void };
}

function fakeWs(): FakeClient {
  const sent: WireMsg[] = [];
  const raw: string[] = [];
  return {
    sent,
    raw,
    ws: {
      readyState: 1,
      send: (payload) => {
        raw.push(payload);
        sent.push(JSON.parse(payload) as WireMsg);
      },
    },
  };
}

function joinServer(server: GameServer, fc: FakeClient, id: number, name: string): ClientSession {
  const session = server.join(
    fc.ws as Parameters<GameServer['join']>[0],
    id,
    id,
    name,
    'warrior',
    null,
  );
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

function clearSent(...clients: FakeClient[]): void {
  for (const client of clients) {
    client.sent.length = 0;
    client.raw.length = 0;
  }
}

function route(server: GameServer, events: SimEvent[]): void {
  (server as unknown as { routeEvents(events: SimEvent[]): void }).routeEvents(events);
}

function delivered<T extends SimEvent['type']>(
  client: FakeClient,
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return client.sent
    .filter((msg) => msg.t === 'events')
    .flatMap((msg) => msg.list ?? [])
    .filter((event): event is Extract<SimEvent, { type: T }> => event.type === type);
}

function damage(sourceId: number, targetId: number, extra: Partial<DamageEvent> = {}): DamageEvent {
  return {
    type: 'damage',
    sourceId,
    targetId,
    amount: 17,
    crit: false,
    school: 'physical',
    ability: 'Heroic Strike',
    abilityId: 'heroic_strike',
    kind: 'hit',
    ...extra,
  };
}

function place(server: GameServer, session: ClientSession, pos: Vec3): void {
  const entity = server.sim.entities.get(session.pid);
  if (!entity) throw new Error(`missing entity ${session.pid}`);
  entity.pos = { ...pos };
  entity.prevPos = { ...pos };
  server.sim.grid.update(entity);
  server.sim.playerGrid.update(entity);
}

function setup() {
  const server = new GameServer();
  const attackerClient = fakeWs();
  const bystanderClient = fakeWs();
  const farClient = fakeWs();
  const attacker = joinServer(server, attackerClient, 201, 'Attacker');
  const bystander = joinServer(server, bystanderClient, 202, 'Bystander');
  const far = joinServer(server, farClient, 203, 'Far');
  const anchor = server.sim.entities.get(attacker.pid) as Entity;
  // The effigy stands beside the attacker; the bystander is a few yards off and
  // the third player is well past EVENT_RADIUS (90 yd).
  const effigy = [...server.sim.entities.values()].find(
    (e) => e.kind === 'mob' && e.id !== attacker.pid,
  ) as Entity;
  effigy.pos = { x: anchor.pos.x + 3, y: anchor.pos.y, z: anchor.pos.z };
  effigy.prevPos = { ...effigy.pos };
  server.sim.grid.update(effigy);
  place(server, bystander, { x: anchor.pos.x + 6, y: anchor.pos.y, z: anchor.pos.z });
  place(server, far, { x: anchor.pos.x + 400, y: anchor.pos.y, z: anchor.pos.z });
  clearSent(attackerClient, bystanderClient, farClient);
  return { server, attackerClient, bystanderClient, farClient, attacker, bystander, far, effigy };
}

describe('bystander attack cue routing', () => {
  it('hands an in-range non-participant the cue, the attacker the damage event, and the far player nothing', () => {
    const { server, attackerClient, bystanderClient, farClient, attacker, effigy } = setup();
    const event = damage(attacker.pid, effigy.id, { crit: true });

    route(server, [event]);

    // The attacker keeps the real event and never also gets the cue.
    expect(delivered(attackerClient, 'damage')).toEqual([event]);
    expect(delivered(attackerClient, 'attackCue')).toHaveLength(0);
    // The bystander gets exactly the cue, with the attacker's id and the ability id,
    // and no number anywhere on it.
    expect(delivered(bystanderClient, 'damage')).toHaveLength(0);
    const cues = delivered(bystanderClient, 'attackCue');
    expect(cues).toEqual([
      {
        type: 'attackCue',
        sourceId: attacker.pid,
        targetId: effigy.id,
        school: 'physical',
        ability: 'Heroic Strike',
        abilityId: 'heroic_strike',
        kind: 'hit',
        crit: true,
        landed: true,
      },
    ]);
    expect('amount' in cues[0]).toBe(false);
    // Out of event range: no frame at all.
    expect(farClient.sent).toHaveLength(0);
  });

  it('keeps the cue off a party member, who receives the damage event itself', () => {
    const { server, attackerClient, bystanderClient, attacker, bystander, effigy } = setup();
    server.sim.partyInvite(bystander.pid, attacker.pid);
    server.sim.partyAccept(bystander.pid);
    clearSent(attackerClient, bystanderClient);

    route(server, [damage(attacker.pid, effigy.id)]);

    expect(delivered(bystanderClient, 'damage')).toHaveLength(1);
    expect(delivered(bystanderClient, 'attackCue')).toHaveLength(0);
  });

  it('cues a stranger being hit by a mob the viewer is not fighting', () => {
    const { server, bystanderClient, attacker, effigy } = setup();

    route(server, [damage(effigy.id, attacker.pid, { ability: null, abilityId: undefined })]);

    const cues = delivered(bystanderClient, 'attackCue');
    expect(cues).toHaveLength(1);
    expect(cues[0].sourceId).toBe(effigy.id);
    expect(cues[0].targetId).toBe(attacker.pid);
    expect('abilityId' in cues[0]).toBe(false);
  });

  it('reports a fully absorbed or avoided swing without its amounts', () => {
    const { server, bystanderClient, attacker, effigy } = setup();

    route(server, [
      damage(attacker.pid, effigy.id, { amount: 0, absorbed: 17 }),
      damage(attacker.pid, effigy.id, { amount: 0, kind: 'dodge' }),
    ]);

    const cues = delivered(bystanderClient, 'attackCue');
    expect(cues.map((c) => [c.kind, c.landed, c.absorbed])).toEqual([
      ['hit', false, true],
      ['dodge', false, undefined],
    ]);
  });

  it('serializes one cue fragment per damage event per batch, byte-identical to a plain stringify', () => {
    const entities = new Map<number, { pos: Vec3 }>([
      [1, { pos: { x: 0, y: 0, z: 0 } }],
      [2, { pos: { x: 1, y: 0, z: 0 } }],
    ]);
    const events: SimEvent[] = [damage(1, 2), { type: 'castStop', entityId: 1, success: true }];
    const stringify = vi.spyOn(JSON, 'stringify');
    const cues = new AttackCueFragments(events, entities, 90);
    const near: string[] = [];
    const away: string[] = [];
    cues.pushForBystander(0, { x: 0, y: 0, z: 0 }, near);
    cues.pushForBystander(0, { x: 2, y: 0, z: 0 }, near);
    cues.pushForBystander(1, { x: 0, y: 0, z: 0 }, near);
    cues.pushForBystander(0, { x: 500, y: 0, z: 0 }, away);
    const calls = stringify.mock.calls.length;
    stringify.mockRestore();
    expect(calls).toBe(1);
    expect(away).toEqual([]);
    expect(near).toHaveLength(2);
    expect(near[0]).toBe(near[1]);
    expect(near[0]).toBe(JSON.stringify(attackCueForDamage(events[0] as DamageEvent)));
    // Bandwidth statement: 100 to 160 bytes per cue on the wire (this one carries
    // both a label and an ability id, the widest shape).
    expect(near[0].length).toBeLessThanOrEqual(160);
  });
});

describe('ClientWorld exposes a received attack cue through drainEvents', () => {
  it('queues the cue untouched for the HUD and renderer drain', () => {
    const client = bareClient(202);
    const cue: AttackCueEvent = {
      type: 'attackCue',
      sourceId: 201,
      targetId: 900,
      school: 'physical',
      ability: 'Heroic Strike',
      abilityId: 'heroic_strike',
      kind: 'hit',
      crit: false,
      landed: true,
    };
    (client as unknown as { onMessage(msg: string): void }).onMessage(
      JSON.stringify({ t: 'events', list: [cue] }),
    );
    expect(client.drainEvents()).toEqual([cue]);
    expect(client.drainEvents()).toEqual([]);
  });
});

describe('attack cue damage view (the renderer side)', () => {
  it('re-reads the cue as a numberless damage event and memoizes it by identity', () => {
    const cue: AttackCueEvent = {
      type: 'attackCue',
      sourceId: 201,
      targetId: 900,
      school: 'physical',
      ability: null,
      kind: 'hit',
      crit: true,
      landed: true,
      absorbed: true,
      attackAnimationStarted: true,
    };
    const view = damageViewOfAttackCue(cue);
    expect(view).toEqual({
      type: 'damage',
      sourceId: 201,
      targetId: 900,
      amount: 1,
      crit: true,
      school: 'physical',
      ability: null,
      kind: 'hit',
      absorbed: 1,
      attackAnimationStarted: true,
    });
    expect(damageViewOfAttackCue(cue)).toBe(view);
    expect(presentedCombatEvent(cue)).toBe(view);
    const avoided = damageViewOfAttackCue({
      ...cue,
      landed: false,
      absorbed: undefined,
      kind: 'miss',
    });
    expect(avoided.amount).toBe(0);
    expect('absorbed' in avoided).toBe(false);
  });

  it('passes every other event through by identity', () => {
    const ev: SimEvent = { type: 'castStop', entityId: 1, success: false };
    expect(presentedCombatEvent(ev)).toBe(ev);
  });
});
