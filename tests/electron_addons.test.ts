// The desktop shell's add-on surface (electron/addons.cjs +
// electron/steam_workshop.cjs): folder scan with path containment, size caps
// and no symlinks; Workshop listing (installed, pending, update) and publish
// (create then update, the legal-agreement flag, visibility, tags) against a
// fake steamworks.js client; the fallback without Steam; and the shared limits
// staying equal to the renderer's manifest core. No electron, no real Steam.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADDON_SHELL_LIMITS,
  createAddonsShell,
  readAddonFolder,
  resolveLocalRoot,
  ADDON_WORKSHOP_TAGS as SHELL_TAGS,
  shellManifest,
} from '../electron/addons.cjs';
import { navigationAllowed } from '../electron/shell_guards.cjs';
import { createSteamShell } from '../electron/steam.cjs';
import {
  ITEM_STATE,
  publishAddonFolder,
  VISIBILITY,
  WORKSHOP_SIDECAR,
} from '../electron/steam_workshop.cjs';
import { ADDON_LIMITS, ADDON_WORKSHOP_TAGS } from '../src/ui/hud/addons/addon_manifest_core';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'wynd-addons-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function writeAddon(
  root: string,
  folder: string,
  manifest: Record<string, unknown>,
  files: Record<string, string>,
) {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'addon.json'), JSON.stringify(manifest));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}
const good = {
  id: 'good-one',
  name: 'Good',
  version: '1.0.0',
  apiVersion: 1,
  files: ['main.js'],
  tags: ['Combat', 'Bogus'],
};

function fakeClient(
  opts: { subscribed?: bigint[]; installed?: Record<string, string>; agreement?: boolean } = {},
) {
  const created: number[] = [];
  const updates: { id: bigint; details: Record<string, unknown> }[] = [];
  const downloads: bigint[] = [];
  const workshop = {
    getSubscribedItems: () => opts.subscribed ?? [],
    state: (id: bigint) =>
      opts.installed?.[String(id)]
        ? ITEM_STATE.subscribed | ITEM_STATE.installed
        : ITEM_STATE.subscribed,
    installInfo: (id: bigint) =>
      opts.installed?.[String(id)]
        ? { folder: opts.installed[String(id)], sizeOnDisk: 1n, timestamp: 0 }
        : null,
    download: vi.fn((id: bigint) => {
      downloads.push(id);
      return true;
    }),
    createItem: vi.fn(async (appId: number) => {
      created.push(appId);
      return { itemId: 4242n, needsToAcceptAgreement: !!opts.agreement };
    }),
    updateItem: vi.fn(async (id: bigint, details: Record<string, unknown>) => {
      updates.push({ id, details });
      return { itemId: id, needsToAcceptAgreement: false };
    }),
  };
  return { client: { workshop }, created, updates, downloads };
}

describe('shared limits stay equal to the renderer manifest core', () => {
  it('pins file caps and the Workshop tag list', () => {
    expect(ADDON_SHELL_LIMITS.maxFiles).toBe(ADDON_LIMITS.maxFiles);
    expect(ADDON_SHELL_LIMITS.maxTotalBytes).toBe(ADDON_LIMITS.maxTotalBytes);
    expect(SHELL_TAGS).toEqual([...ADDON_WORKSHOP_TAGS]);
  });
});

describe('reading add-on folders', () => {
  it('reads a valid folder and filters unknown tags', () => {
    const root = tmp();
    const dir = writeAddon(root, 'good-one', good, { 'main.js': 'wynd.print(1);' });
    const pkg = readAddonFolder(dir, 'local');
    expect(pkg?.files).toEqual({ 'main.js': 'wynd.print(1);' });
    expect(shellManifest(pkg?.manifestText ?? '')?.tags).toEqual(['Combat']);
  });

  it('refuses traversal, symlinks and oversized files', () => {
    const root = tmp();
    writeFileSync(join(root, 'secret.js'), 'TOKEN');
    const dir = writeAddon(
      root,
      'sneaky',
      { ...good, id: 'sneaky', files: ['main.js', 'link.js', 'big.js'] },
      {
        'main.js': 'ok',
        'big.js': 'x'.repeat(ADDON_SHELL_LIMITS.maxTotalBytes + 10),
      },
    );
    try {
      symlinkSync(join(root, 'secret.js'), join(dir, 'link.js'));
    } catch {
      /* symlinks may need privileges on Windows; the traversal checks still run */
    }
    expect(shellManifest(JSON.stringify({ ...good, files: ['../secret.js'] }))).toBeNull();
    const pkg = readAddonFolder(dir, 'local');
    expect(Object.keys(pkg?.files ?? {})).toEqual(['main.js']);
    expect(JSON.stringify(pkg)).not.toContain('TOKEN');
  });

  it('uses the WYND_ADDONS_DIR override only on unpackaged builds', () => {
    expect(
      resolveLocalRoot({
        userDataDir: '/u',
        env: { WYND_ADDONS_DIR: '/dev/addons' },
        isPackaged: false,
      }),
    ).toContain('dev');
    expect(
      resolveLocalRoot({
        userDataDir: '/u',
        env: { WYND_ADDONS_DIR: '/dev/addons' },
        isPackaged: true,
      }),
    ).toMatch(/AddOns$/);
  });
});

describe('createAddonsShell', () => {
  it('lists local add-ons without Steam, and reports the Workshop unavailable', async () => {
    const userDataDir = tmp();
    writeAddon(join(userDataDir, 'AddOns'), 'good-one', good, { 'main.js': 'x' });
    const shell = createAddonsShell({
      userDataDir,
      env: {},
      isPackaged: true,
      argv: [],
      steamShell: null,
    });
    const list = await shell.list();
    expect(list.workshopAvailable).toBe(false);
    expect(list.safeMode).toBe(false);
    expect(list.packages.map((p) => [p.origin, p.folder])).toEqual([['local', 'good-one']]);
  });

  it('honors the --safe-mode launch flag', () => {
    const shell = createAddonsShell({
      userDataDir: tmp(),
      env: {},
      isPackaged: true,
      argv: ['app', '--safe-mode'],
    });
    expect(shell.safeMode).toBe(true);
  });

  it('lists installed Workshop items and requests downloads for the rest', async () => {
    const userDataDir = tmp();
    const wsRoot = tmp();
    const installed = writeAddon(
      wsRoot,
      '111',
      { ...good, id: 'from-workshop' },
      { 'main.js': 'y' },
    );
    const fake = fakeClient({ subscribed: [111n, 222n], installed: { '111': installed } });
    const shell = createAddonsShell({
      userDataDir,
      env: {},
      isPackaged: true,
      argv: [],
      steamShell: { enabled: true, appId: 123, client: () => fake.client },
    });
    const list = await shell.list();
    expect(list.workshopAvailable).toBe(true);
    const ws = list.packages.filter((p) => p.origin === 'workshop');
    expect(ws.map((p) => [p.folder, !!p.pending])).toEqual([
      ['111', false],
      ['222', true],
    ]);
    expect(fake.downloads).toContain(222n);
  });

  it('publishes a local add-on: creates once, then updates the same item', async () => {
    const userDataDir = tmp();
    const dir = writeAddon(join(userDataDir, 'AddOns'), 'good-one', good, { 'main.js': 'x' });
    const fake = fakeClient({ agreement: true });
    const shell = createAddonsShell({
      userDataDir,
      env: {},
      isPackaged: true,
      steamShell: { enabled: true, appId: 123, client: () => fake.client },
    });
    const first = await shell.publish({
      folder: 'good-one',
      visibility: 'friends',
      changeNote: 'hi',
    });
    expect(first).toEqual({ ok: true, code: 'agreement', itemId: '4242' });
    expect(JSON.parse(readFileSync(join(dir, WORKSHOP_SIDECAR), 'utf8')).publishedFileId).toBe(
      '4242',
    );
    const second = await shell.publish({
      folder: 'good-one',
      visibility: 'public',
      changeNote: 'v2',
    });
    expect(second.code).toBe('published');
    expect(fake.created).toEqual([123]);
    expect(fake.updates).toHaveLength(2);
    const d = fake.updates[1].details;
    expect(d.visibility).toBe(VISIBILITY.public);
    expect(d.tags).toEqual(['Addon', 'Combat']);
    expect(d.contentPath).toBe(dir);
  });

  it('refuses traversal and unknown folders, and answers noSteam without a client', async () => {
    const userDataDir = tmp();
    writeAddon(join(userDataDir, 'AddOns'), 'good-one', good, { 'main.js': 'x' });
    const noSteam = createAddonsShell({ userDataDir, env: {}, isPackaged: true, steamShell: null });
    expect((await noSteam.publish({ folder: '../..' })).code).toBe('notFound');
    expect((await noSteam.publish({ folder: 'missing' })).code).toBe('notFound');
    expect((await noSteam.publish({ folder: 'good-one' })).code).toBe('noSteam');
  });

  it('publishAddonFolder never throws when Steam fails', async () => {
    const dir = writeAddon(tmp(), 'x-addon', good, { 'main.js': 'x' });
    const client = {
      workshop: {
        createItem: async () => {
          throw new Error('offline');
        },
        updateItem: async () => ({}),
      },
    };
    const res = await publishAddonFolder({
      client,
      appId: 1,
      dir,
      manifest: { name: 'X' },
      visibility: 'private',
      fs: await import('node:fs'),
      tagAllowlist: SHELL_TAGS,
    });
    expect(res).toEqual({ ok: false, code: 'failed' });
  });
});

describe('shell integration points', () => {
  it('exposes the lazy steamworks client for the Workshop glue', () => {
    const init = vi.fn(() => ({ workshop: {} }));
    const shell = createSteamShell({
      distribution: 'steam',
      isPackaged: true,
      requireSteamworks: () => ({ init }),
    });
    expect(shell.client()).toEqual({ workshop: {} });
    const web = createSteamShell({
      distribution: 'website',
      isPackaged: true,
      requireSteamworks: () => ({ init }),
    });
    expect(web.client()).toBeNull();
  });

  it('lets the sandboxed srcdoc subframe navigate, never a srcdoc main frame', () => {
    expect(navigationAllowed('about:srcdoc', false, ['app://worldofclaudecraft'])).toBe(true);
    expect(navigationAllowed('about:srcdoc', true, ['app://worldofclaudecraft'])).toBe(false);
  });
});
