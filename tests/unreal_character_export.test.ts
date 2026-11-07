// Freshness and coverage pins for the Unreal humanoid-character exports
// (scripts/unreal/character_export.ts, scripts/unreal/anim_select_export.ts): the
// committed JSON must equal a fresh build from the renderer's own data, so the C++
// ports the Unreal automation tests check against it always see the web client's
// current answers. Regenerate with UNREAL_CHARACTERS_UPDATE=1 on this test.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANIM_SELECT_EXPORT_FILE,
  buildAnimSelectExport,
} from '../scripts/unreal/anim_select_export';
import { buildCharacterExport, CHARACTER_EXPORT_FILE } from '../scripts/unreal/character_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);

function pinFresh(file: string, fresh: unknown) {
  const path = join(DIR, file);
  if (process.env.UNREAL_CHARACTERS_UPDATE === '1') {
    writeFileSync(path, `${JSON.stringify(fresh, null, 2)}\n`);
  }
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
}

describe('unreal character export', () => {
  const chars = buildCharacterExport();

  it('committed character export is fresh', () => {
    pinFresh(CHARACTER_EXPORT_FILE, chars);
  });

  it('committed anim-select cases are fresh', () => {
    pinFresh(ANIM_SELECT_EXPORT_FILE, buildAnimSelectExport());
  });

  it('every class has a male and a female WOC body, and the slice NPCs have looks', () => {
    const bodies = Object.keys(chars.bodies);
    for (const cls of [
      'warrior',
      'paladin',
      'hunter',
      'rogue',
      'mage',
      'priest',
      'warlock',
      'druid',
      'shaman',
    ]) {
      expect(bodies).toContain(`player_${cls}`);
      expect(bodies).toContain(`player_${cls}_female`);
    }
    for (const id of ['warden_tam', 'overseer_pell', 'drillmaster_rook']) {
      expect(chars.npcs[`npc:${id}`]).toBeTruthy();
    }
    console.log(
      `characters: ${bodies.length} bodies, ${Object.keys(chars.npcs).length} looks, ${chars.files.armor.length} armor packs`,
    );
  });
});
