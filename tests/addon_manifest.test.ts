// Add-on manifest validation, API-version compatibility and load ordering
// (src/ui/hud/addons/addon_manifest_core.ts), plus the shipped SDK examples
// parsing cleanly. docs/design/addon-api.md section 4.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADDON_API_MIN,
  ADDON_API_VERSION,
  ADDON_RESERVED_SLASH,
  type AddonManifest,
  apiCompatibility,
  parseAddonManifest,
  resolveLoadOrder,
} from '../src/ui/hud/addons/addon_manifest_core';

const base = {
  id: 'my-addon',
  name: 'My Addon',
  version: '1.2.3',
  apiVersion: 1,
  files: ['main.js'],
};
const parse = (over: Record<string, unknown>) =>
  parseAddonManifest(JSON.stringify({ ...base, ...over }));
const fieldOf = (r: ReturnType<typeof parseAddonManifest>) =>
  r.ok ? null : r.error.code === 'field' ? r.error.field : 'json';

describe('parseAddonManifest', () => {
  it('accepts a minimal manifest and fills defaults', () => {
    const r = parseAddonManifest(JSON.stringify(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.permissions).toEqual([]);
    expect(r.manifest.loadOrder).toBe(100);
    expect(r.manifest.savedVariables).toEqual({ account: false, character: false });
  });

  it('accepts `entry` as a single-file shorthand', () => {
    const { files: _files, ...rest } = base;
    const r = parseAddonManifest(JSON.stringify({ ...rest, entry: 'src/main.js' }));
    expect(r.ok && r.manifest.files).toEqual(['src/main.js']);
  });

  it('rejects malformed JSON and non-objects', () => {
    expect(fieldOf(parseAddonManifest('{'))).toBe('json');
    expect(fieldOf(parseAddonManifest('[]'))).toBe('json');
  });

  it.each([
    ['id', { id: 'Bad Id' }],
    ['id', { id: 'ab' }],
    ['name', { name: '' }],
    ['version', { version: '1.0' }],
    ['apiVersion', { apiVersion: 0 }],
    ['permissions', { permissions: ['network'] }],
    ['files', { files: ['../escape.js'] }],
    ['files', { files: ['main.ts'] }],
    ['files', { files: [] }],
    ['slashCommands', { slashCommands: ['w'] }],
    ['slashCommands', { slashCommands: ['reloadui'] }],
    ['dependencies', { dependencies: ['my-addon'] }],
    ['tags', { tags: ['Cheats'] }],
    ['settings', { settings: [{ key: 'x', type: 'slider', label: 'X', min: 5, max: 1 }] }],
  ])('rejects a bad %s', (field, over) => {
    expect(fieldOf(parse(over))).toBe(field);
  });

  it('reserves the game and runtime slash commands', () => {
    for (const name of ['addons', 'reloadui', 'w', 'p', 'g', 'roll', 'invite', 'who', 'share']) {
      expect(ADDON_RESERVED_SLASH).toContain(name);
    }
  });

  it('ignores unknown top-level keys (forward compatibility)', () => {
    expect(parse({ futureThing: { a: 1 } }).ok).toBe(true);
  });

  it('parses all three setting kinds with clamped defaults', () => {
    const r = parse({
      settings: [
        { key: 'on', type: 'toggle', label: 'On', default: true },
        { key: 'n', type: 'slider', label: 'N', min: 1, max: 5, default: 99 },
        {
          key: 'c',
          type: 'choice',
          label: 'C',
          options: [{ value: 'a', label: 'A' }],
          default: 'zz',
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.settings.map((s) => s.default)).toEqual([true, 5, 'a']);
  });
});

describe('apiCompatibility', () => {
  it('loads the current version, refuses newer, flags older than the minimum', () => {
    expect(apiCompatibility(ADDON_API_VERSION)).toBe('ok');
    expect(apiCompatibility(ADDON_API_VERSION + 1)).toBe('tooNew');
    expect(apiCompatibility(1, 3, 2)).toBe('outdated');
    expect(apiCompatibility(2, 3, 2)).toBe('ok');
    expect(ADDON_API_MIN).toBeLessThanOrEqual(ADDON_API_VERSION);
  });
});

describe('resolveLoadOrder', () => {
  const m = (id: string, over: Partial<AddonManifest> = {}): AddonManifest => {
    const r = parseAddonManifest(JSON.stringify({ ...base, id }));
    if (!r.ok) throw new Error('fixture');
    return { ...r.manifest, ...over };
  };

  it('puts dependencies first, then loadOrder, then id', () => {
    const { order, issues } = resolveLoadOrder([
      m('zeta-ui', { dependencies: ['lib-core'] }),
      m('alpha-ui', { loadOrder: 50 }),
      m('lib-core', { loadOrder: 900 }),
      m('beta-ui'),
    ]);
    expect(issues).toEqual([]);
    expect(order.indexOf('lib-core')).toBeLessThan(order.indexOf('zeta-ui'));
    expect(order[0]).toBe('alpha-ui');
  });

  it('blocks a missing required dependency and everything that needs it', () => {
    const { order, issues } = resolveLoadOrder([
      m('aaa-one', { dependencies: ['missing-lib'] }),
      m('bbb-two', { dependencies: ['aaa-one'] }),
      m('ccc-ok', { optionalDependencies: ['missing-lib'] }),
    ]);
    expect(order).toEqual(['ccc-ok']);
    expect(issues.map((i) => i.id).sort()).toEqual(['aaa-one', 'bbb-two']);
  });

  it('reports a dependency cycle instead of looping', () => {
    const { order, issues } = resolveLoadOrder([
      m('aaa-one', { dependencies: ['bbb-two'] }),
      m('bbb-two', { dependencies: ['aaa-one'] }),
    ]);
    expect(order).toEqual([]);
    expect(issues.some((i) => i.code === 'cycle')).toBe(true);
  });
});

describe('the SDK examples', () => {
  const root = join(__dirname, '..', 'sdk', 'addons', 'examples');
  const folders = readdirSync(root);

  it('ships the three documented examples', () => {
    expect(folders.sort()).toEqual(['encounter-timer', 'minimap-coords', 'simple-damage-meter']);
  });

  it.each(folders)('%s has a valid manifest whose files exist', (folder) => {
    const r = parseAddonManifest(readFileSync(join(root, folder, 'addon.json'), 'utf8'));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.id).toBe(folder);
    for (const f of r.manifest.files)
      expect(readFileSync(join(root, folder, f), 'utf8').length).toBeGreaterThan(0);
  });
});
