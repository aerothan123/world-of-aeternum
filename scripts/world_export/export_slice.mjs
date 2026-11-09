// World slice export entry: runs export_slice.ts under the tsx loader so the
// exporter can import the game's TypeScript sim and render-pure modules
// directly (the material_source_audit_cli.mjs pattern).
//
//   node scripts/world_export/export_slice.mjs [outDir] [--cells 1024]
//
// Writes heightmap, ground layer, tint, grass and flower rasters, placement,
// scatter, road, water and light records, the referenced GLBs and a manifest.
// The frame and raster contract is the world_slice_export.ts header; the
// written manifest.json names every file, its encoding and the export stats.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const EXPORT_SCRIPT = fileURLToPath(new URL('./export_slice.ts', import.meta.url));

export function runWorldSliceExport(argv) {
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', EXPORT_SCRIPT, ...argv], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(runWorldSliceExport(process.argv.slice(2)));
}
