// The Hollow Crypt's trash bodies, rebuilt for Wyndlewood: each mob template draws its own
// shipped GLB, a painted single mesh on the WOC rig that plays the class library it fights
// like (refit_enemy_looks.ts), untinted, and each fighter still holds its prop at the WOC
// hold size (the cutthroat's knives are part of its mesh).

import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { REFIT_ENEMY_FILES } from '../src/render/characters/refit_enemy_looks';
import type { Entity } from '../src/sim/types';

const BODIES: Record<string, string> = {
  crypt_ossuary_warrior: 'woc_crypt_ossuary_warrior.glb',
  crypt_gravecaller_adept: 'woc_crypt_gravecaller_adept.glb',
  crypt_ossuary_cutthroat: 'woc_crypt_ossuary_cutthroat.glb',
  crypt_gravecaller_necromancer: 'woc_crypt_gravecaller_necromancer.glb',
  hollow_chorister: 'woc_crypt_hollow_chorister.glb',
  crypt_bone_brute: 'woc_crypt_bone_brute.glb',
};

const defOf = (templateId: string) => VISUALS[visualKeyFor({ kind: 'mob', templateId } as Entity)];

describe('the Hollow Crypt trash bodies', () => {
  it('draws each mob from its own rebuilt GLB on the class library it fights like', () => {
    for (const [mob, file] of Object.entries(BODIES)) {
      const def = defOf(mob);
      expect(def.url, mob).toBe(`models/creatures/${file}`);
      const body = REFIT_ENEMY_FILES[file];
      expect(body, mob).toBeDefined();
      expect(def.clips, mob).toBe(VISUALS[body.base].clips);
      expect(def.authoredAtlas, mob).toBe(true);
      // the painted atlas carries its own colour: no entity tint washing it toward the template's
      expect(def.tint, mob).toBeUndefined();
    }
    expect(defOf('crypt_bone_minion').tint).toBeUndefined();
  });

  it('arms each fighter with its prop at the WOC hold size', () => {
    const held = (mob: string) => (defOf(mob).attach ?? []).map((a) => [a.bone, a.size]);
    expect(held('crypt_ossuary_warrior')).toEqual([['handslot.r', 0.76]]);
    expect(held('crypt_gravecaller_adept')).toEqual([['handslot.r', 0.76]]);
    expect(held('crypt_gravecaller_necromancer')).toEqual([['handslot.r', 0.76]]);
    expect(held('crypt_ossuary_cutthroat')).toEqual([]);
    expect(held('hollow_chorister')).toEqual([]);
    expect(held('crypt_bone_brute')).toEqual([]);
  });
});
