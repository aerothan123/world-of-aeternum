// Unreal terrain mesh export entry: runs ue_mesh_cli.ts under the tsx loader.
//
//   node scripts/world_export/ue_mesh.mjs [outDir] [--world dir] [--tile name]...
//
// Needs a finished ue_export.mjs run (it reads that export's tiles). Output
// layout and conventions are in ue_mesh_cli.ts and ue_terrain_mesh.ts.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const UE_MESH_SCRIPT = fileURLToPath(new URL('./ue_mesh_cli.ts', import.meta.url));

export function runUeTerrainMesh(argv) {
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', UE_MESH_SCRIPT, ...argv], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(runUeTerrainMesh(process.argv.slice(2)));
}
