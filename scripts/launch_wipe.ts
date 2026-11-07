// The Early Access launch wipe, operator entry point. Run ON the game host
// with the game STOPPED, after a fresh off-machine backup:
//
//   npx tsx scripts/launch_wipe.ts --realm <realm>                      (dry run)
//   npx tsx scripts/launch_wipe.ts --realm <realm> --execute \
//     --confirm "WIPE <realm> <N> CHARACTERS" --operator "<your name>"
//
// Policy, kept keys and cleared stores: server/launch_wipe_core.ts. Safety
// rails (one transaction, empty realm, exact confirmation, one wipe per
// realm, audit row): server/launch_wipe_db.ts. Runbook:
// docs/launch/early-access-wipe.md. DATABASE_URL comes from the environment
// (the same .env the server reads); nothing is hardcoded here.

import '../server/env';
import { Pool } from 'pg';
import { initialCharacterState } from '../server/character_newborn';
import { runLaunchWipe } from '../server/launch_wipe_db';
import type { PlayerClass } from '../src/sim/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const realm = arg('--realm');
  const execute = process.argv.includes('--execute');
  const operator = arg('--operator') ?? process.env.USER ?? 'unknown';
  if (!realm) {
    console.error('usage: --realm <realm> [--execute --confirm "<phrase>" --operator <name>]');
    return 2;
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    return 2;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const result = await runLaunchWipe(pool, {
      realm,
      operator,
      dryRun: !execute,
      confirmation: arg('--confirm'),
      allowRepeat: process.argv.includes('--allow-repeat'),
      freshStateFor: (row) => {
        const old = (row.state ?? {}) as { skin?: unknown };
        const skin = typeof old.skin === 'number' ? old.skin : 0;
        return initialCharacterState(row.cls as PlayerClass, row.name, skin) as unknown as Record<
          string,
          unknown
        >;
      },
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) return 1;
    if (result.dryRun) {
      console.log(`\nDRY RUN only. To wipe for real, stop the game, back up, then add:`);
      console.log(`  --execute --confirm "${result.plan.confirmation}" --operator "<your name>"`);
    }
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('launch wipe failed (nothing was changed):', err?.message ?? err);
    process.exit(1);
  },
);
