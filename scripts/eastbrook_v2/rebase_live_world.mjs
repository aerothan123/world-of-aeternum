#!/usr/bin/env node
// Re-open the live-world touch-up source on the current shipped world, headless:
// the editor's "open the current live-world source" step. Needed after every
// Eastbrook v2 import or resite, because moving Eastbrook's content changes the
// shipped-world baseline token the touch-up patch is pinned to
// (src/sim/world_touchup.ts). It keeps every reviewed edit layer of
// data/world_touchup/current.map.json, takes the baseline's content rows and
// token, then runs the owning exporter (scripts/world_touchup.mjs export), which
// rewrites src/sim/world_touchup.generated.ts. Review that the exporter reports
// the same changed layers as before.
//
//   node scripts/eastbrook_v2/rebase_live_world.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(ROOT);
const generated = 'src/sim/world_touchup.generated.ts';
const doc = 'data/world_touchup/current.map.json';

// The built-in world refuses to load while the patch names a stale baseline, and
// the baseline is exactly what this step recomputes: lift the pin for the read.
// The exporter below rewrites the whole artifact either way.
const original = readFileSync(generated, 'utf8');
writeFileSync(generated, original.replace(/"base": "[^"]*"/, '"base": null'));
const temp = mkdtempSync(path.join(tmpdir(), 'woc-live-world-rebase-'));
try {
  const outfile = path.join(temp, 'core.mjs');
  await build({
    entryPoints: ['src/editor/live_world_core.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
    define: { 'import.meta.env': '{}' },
  });
  const { liveWorldBaseline } = await import(pathToFileURL(outfile).href);
  const source = JSON.parse(readFileSync(doc, 'utf8'));
  const base = liveWorldBaseline();
  source.content = base.content;
  source.meta.overworldBase = base.meta.overworldBase;
  writeFileSync(doc, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`live-world source rebased to ${base.meta.overworldBase}`);
  execFileSync(process.execPath, ['scripts/world_touchup.mjs', 'export', doc], {
    stdio: 'inherit',
  });
  // the exporter rewrites the document expanded; it is a checked-in, Biome-formatted
  // file, so format it back
  const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');
  execFileSync(process.execPath, [biome, 'format', '--write', doc], { stdio: 'ignore' });
} catch (error) {
  writeFileSync(generated, original);
  throw error;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
