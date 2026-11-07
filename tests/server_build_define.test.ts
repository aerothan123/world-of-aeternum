// The server bundle reads the Early Access switches without import.meta.env.
// `npm run server` bundles server/main.ts as CommonJS (scripts/build_server.mjs),
// where esbuild lowers `import.meta` to `{}`; src/early_access_flags.ts reads its
// Vite client switches at module scope, so without the shared server define the
// realm threw on `import.meta.env.VITE_MEMBERSHIP_ENABLED` before it listened.
// This bundles the real server reader with the real build options and loads it.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs build helper, no type declarations
import { SERVER_BUILD_DEFINE } from '../scripts/server_build_define.mjs';

const entry = fileURLToPath(new URL('../server/early_access_flags.ts', import.meta.url));

async function loadServerBundle(env: Record<string, string | undefined>) {
  const out = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    define: SERVER_BUILD_DEFINE,
    write: false,
    logLevel: 'silent',
  });
  const code = out.outputFiles[0].text;
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const fakeProcess = { env };
  new Function('module', 'exports', 'require', 'process', code)(
    mod,
    mod.exports,
    createRequire(entry),
    fakeProcess,
  );
  expect(code).not.toMatch(/import_meta\d*\.env/);
  return mod.exports as { SERVER_EARLY_ACCESS: { membership: boolean; claudium: boolean } };
}

describe('server bundle early access flags', () => {
  it('loads in the CommonJS server bundle and defaults both switches off', async () => {
    const { SERVER_EARLY_ACCESS } = await loadServerBundle({});
    expect(SERVER_EARLY_ACCESS).toEqual({ membership: false, claudium: false });
  });

  it('reads the realm switches from process.env', async () => {
    const { SERVER_EARLY_ACCESS } = await loadServerBundle({
      MEMBERSHIP_ENABLED: '1',
      CLAUDIUM_ENABLED: '1',
    });
    expect(SERVER_EARLY_ACCESS).toEqual({ membership: true, claudium: true });
  });
});
