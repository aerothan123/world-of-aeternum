// Freshness pin for the Unreal entity-visual export (scripts/unreal/visual_export.ts):
// the committed entity_visuals.json must equal a fresh build from the renderer's own
// dispatch. Regenerate with UNREAL_VISUALS_UPDATE=1 on this test.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';
import { buildVisualExport, VISUAL_EXPORT_FILE } from '../scripts/unreal/visual_export';

const FILE = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR, VISUAL_EXPORT_FILE);

describe('unreal entity visual export', () => {
  it('committed export is fresh', () => {
    const fresh = buildVisualExport();
    if (process.env.UNREAL_VISUALS_UPDATE === '1')
      writeFileSync(FILE, `${JSON.stringify(fresh, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FILE, 'utf8'))).toEqual(fresh);
  });

  it('covers the slice: the starter island mobs and every class resolve a model', () => {
    const v = buildVisualExport();
    expect(v.mobs.training_effigy?.key).toBeTruthy();
    expect(v.mobs.shore_scuttler?.model).toBeTruthy();
    for (const cls of Object.keys(v.players)) expect(v.players[cls].key).toBeTruthy();
    const withModel = Object.values(v.mobs).filter((m) => m.model !== null).length;
    console.log(
      `visuals: ${Object.keys(v.mobs).length} mobs (${withModel} with a model), ${Object.keys(v.npcs).length} npcs`,
    );
  });
});
