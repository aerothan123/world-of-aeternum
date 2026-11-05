// @vitest-environment happy-dom
// The add-on runtime end to end, in process: the REAL runtime controller, the
// REAL serialized prelude in a fake worker (tests/helpers/addon_fake_worker.ts
// stands in for the sandboxed iframe), the REAL SDK examples, and a real offline
// Sim. Covers loading, snapshots and events reaching add-ons, frames reaching
// the DOM, saved-variable persistence per account and per character, crash
// isolation (a throwing add-on, a hung add-on, a flooding add-on), the boot
// sentinel and safe mode, the secure-button path, and the Addons window.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sim } from '../src/sim/sim';
import { FocusManager } from '../src/ui/focus_manager';
import { AddonRuntime, type AddonRuntimeDeps } from '../src/ui/hud/addons/addon_runtime_controller';
import {
  ADDON_BUDGET,
  ADDON_SENTINEL_KEY,
  ADDON_STATE_KEY,
  savedVariableKey,
} from '../src/ui/hud/addons/addon_runtime_core';
import type { AddonPackage } from '../src/ui/hud/addons/addon_sources';
import { AddonsWindowController } from '../src/ui/hud/addons/addons_window_controller';
import { makeWriterFacet } from '../src/ui/painter_host';
import type { IWorld } from '../src/world_api';
import { createFakeSandbox } from './helpers/addon_fake_worker';

const EXAMPLES = join(__dirname, '..', 'sdk', 'addons', 'examples');

function examplePackage(folder: string): AddonPackage {
  const dir = join(EXAMPLES, folder);
  const files: Record<string, string> = {};
  for (const f of readdirSync(dir))
    if (f.endsWith('.js')) files[f] = readFileSync(join(dir, f), 'utf8');
  return {
    origin: 'dev',
    folder,
    manifestText: readFileSync(join(dir, 'addon.json'), 'utf8'),
    files,
  };
}

function inlinePackage(
  id: string,
  code: string,
  extra: Record<string, unknown> = {},
): AddonPackage {
  return {
    origin: 'local',
    folder: id,
    manifestText: JSON.stringify({
      id,
      name: id,
      version: '1.0.0',
      apiVersion: 1,
      files: ['main.js'],
      ...extra,
    }),
    files: { 'main.js': code },
  };
}

class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const runtimes: AddonRuntime[] = [];
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function setup(
  packages: AddonPackage[],
  opts: { storage?: MemStorage; sim?: Sim; shellSafe?: boolean } = {},
) {
  const sim = opts.sim ?? new Sim({ seed: 3, playerClass: 'warrior', autoEquip: true });
  const world = sim as unknown as IWorld;
  const storage = opts.storage ?? new MemStorage();
  const uiRoot = document.createElement('div');
  document.body.appendChild(uiRoot);
  const holder: { sandbox: ReturnType<typeof createFakeSandbox> | null } = { sandbox: null };
  let clock = 1000;
  const secure = { pressActionSlot: vi.fn(), targetUnit: vi.fn(), toggleWindow: vi.fn() };
  const print = vi.fn();
  const writers = makeWriterFacet(
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
    () => {},
    () => {},
  );
  const deps: AddonRuntimeDeps = {
    world,
    writers,
    document,
    window,
    storage,
    uiRoot,
    uiScale: () => 1,
    focus: new FocusManager(),
    print,
    secure,
    locale: () => 'en',
    isIgnored: () => false,
    listPackages: async () => ({
      packages,
      shellSafeMode: opts.shellSafe === true,
      workshopAvailable: false,
      desktop: false,
      localFolder: null,
    }),
    defaultEnabled: true,
    urlSafeMode: false,
    now: () => clock,
    createSandbox: (onEvent) => {
      holder.sandbox = createFakeSandbox(onEvent);
      return holder.sandbox;
    },
  };
  const rt = new AddonRuntime(deps);
  runtimes.push(rt);
  return {
    rt,
    sim,
    world,
    storage,
    uiRoot,
    get sandbox() {
      if (!holder.sandbox) throw new Error('sandbox not created yet');
      return holder.sandbox;
    },
    secure,
    print,
    advance(ms: number) {
      clock += ms;
    },
  };
}

afterEach(() => {
  for (const rt of runtimes.splice(0))
    (rt as unknown as { shutdown(c: boolean): void }).shutdown(false);
  document.body.innerHTML = '';
});

describe('add-on runtime: loading the SDK examples', () => {
  it('loads all three examples, renders their frames and keeps them running', async () => {
    const h = setup(
      ['simple-damage-meter', 'encounter-timer', 'minimap-coords'].map(examplePackage),
    );
    await h.rt.start();
    await tick();
    h.rt.tick();
    await tick();
    expect(h.rt.entries.map((e) => [e.key, e.status])).toEqual([
      ['simple-damage-meter', 'running'],
      ['encounter-timer', 'running'],
      ['minimap-coords', 'running'],
    ]);
    const layer = h.uiRoot.querySelector('#addon-layer');
    expect(layer?.querySelectorAll('[data-addon]').length).toBe(3);
    expect(layer?.querySelectorAll('.addon-w').length).toBeGreaterThan(20);
    // Add-on text only ever lands as text, never as markup.
    expect(layer?.querySelector('script, img, iframe, a')).toBeNull();
    for (const e of h.rt.entries)
      expect(e.errors.total, `${e.key}: ${e.errors.recent.join('; ')}`).toBe(0);
  });

  it('routes a combat event to the damage meter and its slash command', async () => {
    const h = setup([examplePackage('simple-damage-meter')]);
    await h.rt.start();
    await tick();
    h.sim.player.inCombat = false;
    h.rt.tick();
    await tick();
    h.sim.player.inCombat = true;
    h.rt.tick();
    await tick();
    const mob = [...h.sim.entities.values()].find((e) => e.kind === 'mob');
    if (!mob) throw new Error('no mob');
    h.rt.onEvents([
      {
        type: 'damage',
        sourceId: h.sim.playerId,
        targetId: mob.id,
        amount: 500,
        crit: false,
        school: 'physical',
        ability: null,
        kind: 'hit',
      },
    ] as never);
    await tick(600);
    h.rt.tick();
    await tick();
    const texts = [...h.uiRoot.querySelectorAll('.addon-w--text')].map((el) => el.textContent);
    expect(texts.some((t) => t?.includes(h.sim.player.name))).toBe(true);
    expect(h.rt.handleSlash('/sdm reset')).toBe(true);
    await tick();
    expect(h.print).toHaveBeenCalledWith('[Simple Damage Meter] Meter reset.', null);
    expect(h.rt.handleSlash('/notacommand')).toBe(false);
  });
});

describe('add-on runtime: saved variables', () => {
  it('persists per account and per character, keyed by realm and name', async () => {
    const storage = new MemStorage();
    const code = `
      wynd.saved.account.n = (wynd.saved.account.n || 0) + 1;
      wynd.saved.character.who = 'me';
      wynd.saved.save();
    `;
    const pkg = () =>
      inlinePackage('sv-test', code, { savedVariables: { account: true, character: true } });
    const h = setup([pkg()], { storage });
    await h.rt.start();
    await tick();
    const ch = { realm: h.world.realm || 'offline', name: h.sim.player.name };
    expect(JSON.parse(storage.getItem(savedVariableKey('sv-test', 'account', ch)) ?? '{}')).toEqual(
      { n: 1 },
    );
    expect(
      JSON.parse(storage.getItem(savedVariableKey('sv-test', 'character', ch)) ?? '{}'),
    ).toEqual({ who: 'me' });
    // A clean exit (pagehide) clears the boot sentinel; the next session reads the data back.
    (h.rt as unknown as { onPageHide(): void }).onPageHide();
    const h2 = setup([pkg()], { storage, sim: h.sim });
    await h2.rt.start();
    await tick();
    expect(JSON.parse(storage.getItem(savedVariableKey('sv-test', 'account', ch)) ?? '{}')).toEqual(
      { n: 2 },
    );
    // Another character gets its own character scope.
    expect(savedVariableKey('sv-test', 'character', { realm: 'r', name: 'A' })).not.toBe(
      savedVariableKey('sv-test', 'character', { realm: 'r', name: 'B' }),
    );
  });

  it('refuses writes to an undeclared scope and oversized writes', async () => {
    const h = setup([
      inlinePackage('sv-big', `wynd.saved.account.blob = 'x'.repeat(300000); wynd.saved.save();`, {
        savedVariables: { account: true },
      }),
    ]);
    await h.rt.start();
    await tick();
    const e = h.rt.entries[0];
    expect(e.errors.total).toBeGreaterThan(0);
    expect([...h.storage.map.keys()].some((k) => k.startsWith('woc_addon_sv_v1:sv-big'))).toBe(
      false,
    );
  });
});

describe('add-on runtime: crash isolation', () => {
  it('auto-disables an add-on that keeps throwing, and keeps the others running', async () => {
    const h = setup([
      inlinePackage('thrower', `wynd.on('UPDATE', () => { throw new Error('nope'); });`),
      examplePackage('encounter-timer'),
    ]);
    await h.rt.start();
    await tick();
    for (let i = 0; i < ADDON_BUDGET.errorLimit + 2; i++) {
      h.rt.tick();
      await tick(5);
    }
    await tick();
    const thrower = h.rt.entries.find((e) => e.key === 'thrower');
    expect(thrower?.status).toBe('stopped');
    expect(thrower?.stopReason).toBe('errors');
    expect(h.rt.isAddonEnabled('thrower')).toBe(false);
    expect(JSON.parse(h.storage.getItem(ADDON_STATE_KEY) ?? '{}').addons.thrower.autoDisabled).toBe(
      'errors',
    );
    expect(h.rt.entries.find((e) => e.key === 'encounter-timer')?.status).toBe('running');
    expect(h.uiRoot.querySelector('[data-addon="thrower"]')).toBeNull();
  });

  it('terminates an add-on that stops answering heartbeats', async () => {
    const h = setup([inlinePackage('sleeper', `wynd.on('LOADED', () => {});`)]);
    await h.rt.start();
    await tick();
    // Simulate a worker stuck in a loop: it stops processing host messages.
    const w = h.sandbox.workers.get('sleeper');
    expect(w).toBeDefined();
    const live = (h.rt as unknown as { live: Map<string, { port: MessagePort }> }).live.get(
      'sleeper',
    );
    if (live) live.port.onmessage = null;
    // Ticks 500 ms apart: the game is running normally, the worker is silent.
    for (let i = 0; i < 12; i++) {
      h.advance(500);
      h.rt.tick();
    }
    expect(h.rt.entries[0].status).toBe('stopped');
    expect(h.rt.entries[0].stopReason).toBe('hang');
    expect(h.sandbox.workers.has('sleeper')).toBe(false);
  });

  it('stops an add-on that floods the interface', async () => {
    const h = setup([
      inlinePackage('flooder', `for (let i = 0; i < 5000; i++) wynd.ui.create('frame', {});`),
    ]);
    await h.rt.start();
    await tick(60);
    expect(h.rt.entries[0].status).toBe('stopped');
    expect(h.rt.entries[0].stopReason).toBe('flood');
  });

  it('reports a load error without affecting the game', async () => {
    const h = setup([inlinePackage('broken', 'this is ( not js')]);
    await h.rt.start();
    await tick();
    expect(h.rt.entries[0].status).toBe('error');
    expect(h.rt.entries[0].stopReason).toBe('load');
  });

  it('starts in safe mode after a crash during add-on startup, and on request', async () => {
    const storage = new MemStorage();
    storage.setItem(ADDON_SENTINEL_KEY, '1');
    const h = setup([examplePackage('encounter-timer')], { storage });
    await h.rt.start();
    expect(h.rt.safeMode).toBe('crash');
    expect(h.rt.liveKeys()).toEqual([]);
    const shell = setup([examplePackage('encounter-timer')], { shellSafe: true });
    await shell.rt.start();
    expect(shell.rt.safeMode).toBe('url');
    expect(shell.rt.liveKeys()).toEqual([]);
  });

  it('arms the boot sentinel while starting and clears it once stable', async () => {
    const h = setup([examplePackage('encounter-timer')]);
    await h.rt.start();
    expect(h.storage.getItem(ADDON_SENTINEL_KEY)).toBe('1');
    h.advance(ADDON_BUDGET.stableAfterMs + 1);
    h.rt.tick();
    expect(h.storage.getItem(ADDON_SENTINEL_KEY)).toBeNull();
  });
});

describe('add-on runtime: watchdog fairness to a stalled game', () => {
  it('does not blame an add-on when the GAME stalls between ticks', async () => {
    const h = setup([inlinePackage('patient', `wynd.on('LOADED', () => {});`)]);
    await h.rt.start();
    await tick();
    h.rt.tick();
    await tick();
    // A 6 s main-thread stall (a zone load): one huge tick gap, then normal ticks.
    h.advance(6000);
    h.rt.tick();
    await tick();
    h.advance(500);
    h.rt.tick();
    expect(h.rt.entries[0].status).toBe('running');
  });

  it('gives up on an add-on that never finishes loading', async () => {
    const h = setup([inlinePackage('never', `wynd.on('LOADED', () => {});`)]);
    await h.rt.start();
    const e = h.rt.entries[0];
    e.status = 'loading';
    for (let i = 0; i < 50; i++) {
      h.advance(500);
      h.rt.tick();
    }
    expect(e.status).toBe('error');
    expect(e.detail).toContain('timed out');
  });
});

describe('add-on runtime: no automation', () => {
  it('never touches a world command, even when a compromised worker sends forged messages', async () => {
    const sim = new Sim({ seed: 3, playerClass: 'warrior', autoEquip: true });
    const spies = ['castAbility', 'chat', 'targetEntity', 'useItem', 'tabTarget'].map((m) =>
      vi.spyOn(sim as unknown as Record<string, () => void>, m as never),
    );
    const h = setup([inlinePackage('forger', `wynd.on('LOADED', () => {});`)], { sim });
    await h.rt.start();
    await tick();
    const live = (h.rt as unknown as { live: Map<string, unknown> }).live.get('forger') as {
      port: MessagePort;
    };
    // Post AS the worker: the host end receives these through its own handler.
    const handle = (
      h.rt as unknown as { onWorkerMessage(k: string, m: unknown): void }
    ).onWorkerMessage.bind(h.rt);
    for (const forged of [
      { t: 'cast', ability: 'charge' },
      { t: 'chat', text: '/g gold for sale' },
      {
        t: 'ui',
        ops: [
          {
            op: 'c',
            id: 1,
            type: 'button',
            parent: null,
            props: { secure: { type: 'actionSlot', slot: 1 } },
          },
        ],
      },
    ]) {
      handle('forger', forged);
    }
    void live;
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(h.secure.pressActionSlot).not.toHaveBeenCalled();
    // The secure button was refused: no permission.
    expect(h.uiRoot.querySelector('.addon-w--secure')).toBeNull();
  });

  it('runs exactly one declared secure action per click, and only with the permission', async () => {
    const h = setup([
      inlinePackage(
        'bar',
        `wynd.ui.create('button', { text: 'Bags', secure: { type: 'toggleWindow', window: 'bags' } });`,
        { permissions: ['secureActions'] },
      ),
    ]);
    await h.rt.start();
    await tick();
    const btn = h.uiRoot.querySelector<HTMLButtonElement>('.addon-w--secure');
    expect(btn).not.toBeNull();
    // A script click is untrusted: nothing happens.
    btn?.click();
    expect(h.secure.toggleWindow).not.toHaveBeenCalled();
    // A trusted click (the frames controller's isTrusted gate passed) runs the declared action once.
    const click = (
      h.rt as unknown as { onWidgetClick(k: string, id: number, b: number, s: unknown): void }
    ).onWidgetClick.bind(h.rt);
    click('bar', 1, 0, { type: 'toggleWindow', window: 'bags' });
    expect(h.secure.toggleWindow).toHaveBeenCalledTimes(1);
    expect(h.secure.toggleWindow).toHaveBeenCalledWith('bags');
  });

  it('defers a secure button created in combat together with its children', async () => {
    const h = setup([
      inlinePackage(
        'late',
        `wynd.on('COMBAT_START', () => {
           const b = wynd.ui.create('button', { text: 'Go', secure: { type: 'actionSlot', slot: 1 } });
           wynd.ui.create('text', { parent: b, text: 'child' });
         });`,
        { permissions: ['secureActions'] },
      ),
    ]);
    await h.rt.start();
    await tick();
    h.rt.tick();
    await tick();
    h.sim.player.inCombat = true;
    h.rt.tick();
    await tick();
    expect(h.uiRoot.querySelector('.addon-w--secure')).toBeNull();
    h.sim.player.inCombat = false;
    h.rt.tick();
    await tick();
    expect(h.uiRoot.querySelector('.addon-w--secure .addon-w--text')?.textContent).toBe('child');
    expect(h.rt.entries[0].errors.total).toBe(0);
  });

  it('defers re-declaring a secure button while in combat', async () => {
    const h = setup([
      inlinePackage(
        'swapper',
        `const b = wynd.ui.create('button', { text: 'A', secure: { type: 'actionSlot', slot: 1 } });
         wynd.on('COMBAT_START', () => b.set({ secure: { type: 'actionSlot', slot: 2 }, text: 'B' }));`,
        { permissions: ['secureActions'] },
      ),
    ]);
    await h.rt.start();
    await tick();
    h.rt.tick();
    await tick();
    h.sim.player.inCombat = true;
    h.rt.tick();
    await tick();
    const tree = (
      h.rt as unknown as {
        live: Map<
          string,
          { tree: { widgets: Map<number, { props: { secure?: { slot?: number } } }> } }
        >;
      }
    ).live.get('swapper')?.tree;
    expect(tree?.widgets.get(1)?.props.secure?.slot).toBe(1);
    h.sim.player.inCombat = false;
    h.rt.tick();
    await tick();
    expect(tree?.widgets.get(1)?.props.secure?.slot).toBe(2);
  });
});

describe('the Addons window', () => {
  it('lists add-ons with status and permissions and toggles one off', async () => {
    const h = setup([
      examplePackage('simple-damage-meter'),
      inlinePackage('bad', '', { version: 'x' }),
    ]);
    await h.rt.start();
    await tick();
    const win = new AddonsWindowController({
      document,
      uiRoot: h.uiRoot,
      focus: new FocusManager(),
      runtime: h.rt,
    });
    win.open();
    const root = h.uiRoot.querySelector('#addons-window');
    expect(root?.getAttribute('role')).toBe('dialog');
    const rows = root?.querySelectorAll('.addons-row');
    expect(rows?.length).toBe(2);
    expect(root?.textContent).toContain('Simple Damage Meter');
    expect(root?.textContent).toContain('Combat log');
    const enable = root?.querySelector<HTMLInputElement>(
      'input[data-act="enable"][data-key="simple-damage-meter"]',
    );
    expect(enable?.checked).toBe(true);
    if (enable) {
      enable.checked = false;
      enable.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect(h.rt.isAddonEnabled('simple-damage-meter')).toBe(false);
    expect(win.close()).toBe(true);
    expect(win.close()).toBe(false);
  });
});
