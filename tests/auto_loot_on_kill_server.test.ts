import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; the wire dispatch is under test.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  runWithStatementTimeout: vi.fn(async () => ({ rows: [] })),
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndGuildBankState: vi.fn(async () => true),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  saveMailPartitions: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
  })),
  grantAccountMechChroma: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
  })),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
    mountSkinIds: [],
  })),
  loadAccountFlair: vi.fn(async () => ({
    ai: false,
    streamer: false,
    links: {},
  })),
}));

// As in game_sessions.test.ts, wire/save fixtures do not start the separately
// tested referral outbox or its constructor-owned polling timer.
vi.mock('../server/referral_game_adapter', () => ({
  ReferralGameAdapter: class {
    cards = { isBusy: () => false };
    attach() {}
    detach() {}
    observe() {}
    command() {}
    async stop() {}
  },
}));

import { GameServer } from '../server/game';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import type { MobTemplate } from '../src/sim/types';
import { fakeWs, joinServer } from './helpers/bare_client';

// Kill-time Auto Loot over the real server dispatch: the `set_auto_loot` command
// (ClientWorld.setAutoLoot, server/session_preference_wire.ts) reaches the
// authoritative sim for THAT session's player only, and the loot a kill then
// hands that player travels in that session's events frame and no other.

const TEMPLATE_ID = 'test_auto_loot_server_mob';

beforeEach(() => {
  (MOBS as Record<string, MobTemplate>)[TEMPLATE_ID] = {
    ...MOBS.forest_wolf,
    id: TEMPLATE_ID,
    loot: [
      { copper: 80, chance: 1 },
      { itemId: 'worn_sword', chance: 1 },
    ],
  };
});
afterEach(() => {
  delete (MOBS as Record<string, MobTemplate>)[TEMPLATE_ID];
});

// biome-ignore lint/suspicious/noExplicitAny: sent frames are untyped wire JSON
function eventsOf(sent: any[]): any[] {
  return sent.flatMap((msg) => (msg.t === 'events' ? msg.list : []));
}

describe('set_auto_loot over the server', () => {
  it('arms only the sending player; a malformed payload never arms it', () => {
    const server = new GameServer();
    const fa = fakeWs();
    const fb = fakeWs();
    const a = joinServer(server, fa, 1, 'Avery');
    const b = joinServer(server, fb, 2, 'Bryn');
    server.handleMessage(a, JSON.stringify({ t: 'cmd', cmd: 'set_auto_loot', enabled: true }));
    server.handleMessage(b, JSON.stringify({ t: 'cmd', cmd: 'set_auto_loot', enabled: 'yes' }));
    expect(server.sim.meta(a.pid)?.autoLootOnKill).toBe(true);
    expect(server.sim.meta(b.pid)?.autoLootOnKill).toBeFalsy();
    server.handleMessage(a, JSON.stringify({ t: 'cmd', cmd: 'set_auto_loot', enabled: false }));
    expect(server.sim.meta(a.pid)?.autoLootOnKill).toBe(false);
  });

  it("a kill's auto-looted loot reaches only the looter's session", () => {
    const server = new GameServer();
    const fa = fakeWs();
    const fb = fakeWs();
    const a = joinServer(server, fa, 1, 'Avery');
    const b = joinServer(server, fb, 2, 'Bryn');
    server.handleMessage(a, JSON.stringify({ t: 'cmd', cmd: 'set_auto_loot', enabled: true }));
    const sim = server.sim;
    const pa = sim.entities.get(a.pid)!;
    const pb = sim.entities.get(b.pid)!;
    pb.pos = { x: pa.pos.x + 3, y: pa.pos.y, z: pa.pos.z };
    const mob = createMob(992_000, MOBS[TEMPLATE_ID], 2, { ...pa.pos });
    mob.tappedById = a.pid;
    sim.entities.set(mob.id, mob);
    const copper = sim.meta(a.pid)!.copper;
    fa.sent.length = 0;
    fb.sent.length = 0;

    sim.ctx.handleDeath(mob, pa);
    // biome-ignore lint/suspicious/noExplicitAny: routeEvents is a private server-loop method
    (server as any).routeEvents(sim.tick());

    expect(sim.meta(a.pid)!.copper).toBeGreaterThan(copper);
    expect(sim.countItem('worn_sword', a.pid)).toBe(1);
    const mine = eventsOf(fa.sent).filter((e) => e.type === 'loot');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((e) => /You loot|You receive/.test(e.text))).toBe(true);
    expect(eventsOf(fb.sent).filter((e) => e.type === 'loot')).toEqual([]);
  });
});
