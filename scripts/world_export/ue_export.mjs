// Unreal world export entry: runs ue_export_cli.ts under the tsx loader.
//
//   node scripts/world_export/ue_export.mjs [outDir] [--zone id]... [--no-tiles]
//        [--registry path]... [--seed n]
//
// Output layout and the coordinate contract are in ue_export_cli.ts and
// ue_space.ts. Unchanged files are not rewritten (see ue_manifest.ts).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const UE_EXPORT_SCRIPT = fileURLToPath(new URL('./ue_export_cli.ts', import.meta.url));

export function runUeWorldExport(argv) {
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', UE_EXPORT_SCRIPT, ...argv], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(runUeWorldExport(process.argv.slice(2)));
}
