// WYNDLEWOOD's rebuilt crypt, bastion and temple bodies (src/render/characters/
// refit_enemy_looks.ts): each humanoid file ships on the WOC rig the class library drives
// and each four-legged one on its own rig with the wildlife clip set, and every def drawing
// one is rebuilt from it in place, keeping its size, colour and hand-slot props but none of
// the old body's bespoke clips, toggles or WOC composition.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VisualDef } from '../src/render/characters/manifest';
import { mobVisualKey, VISUALS } from '../src/render/characters/manifest';
import {
  REFIT_ENEMY_FILES,
  refitEnemyLooks,
  refitFileOf,
} from '../src/render/characters/refit_enemy_looks';
import { WILDLIFE_CLIPS } from '../src/render/characters/wildlife_looks';

const PUBLIC = resolve(__dirname, '../public');

function gltf(path: string): {
  nodes?: { name?: string }[];
  skins?: { joints: number[] }[];
  animations?: { name: string }[];
} {
  const buf = readFileSync(path);
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}

function joints(path: string): string[] {
  const json = gltf(path);
  const nodes = json.nodes ?? [];
  return (json.skins?.[0]?.joints ?? []).map((i) => nodes[i]?.name ?? '');
}

const clipNames = (path: string) => (gltf(path).animations ?? []).map((a) => a.name);

const drawing = (file: string) =>
  Object.entries(VISUALS).filter(([, def]) => def.url === `models/creatures/${file}`);

describe('refit enemy looks', () => {
  it('ships every rebuilt body on the rig its clips need', () => {
    for (const [file, body] of Object.entries(REFIT_ENEMY_FILES)) {
      const path = resolve(PUBLIC, 'models/creatures', file);
      expect(existsSync(path), file).toBe(true);
      const names = joints(path);
      if (body.base === 'beast') {
        // its own skeleton, carrying every wildlife clip it plays
        expect(names, file).toContain('Hips');
        const clips = clipNames(path);
        for (const clip of ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death', 'Cast']) {
          expect(clips, `${file} ${clip}`).toContain(clip);
        }
        continue;
      }
      for (const bone of ['hips', 'head', 'upperarm.l', 'hand.r', 'handslot.r', 'foot.r']) {
        expect(names, `${file} joint ${bone}`).toContain(bone);
      }
      // the class library drives it: no clips of its own
      expect(clipNames(path), file).toEqual([]);
    }
  });

  it('rebuilds every def that draws a listed file', () => {
    for (const [file, body] of Object.entries(REFIT_ENEMY_FILES)) {
      const defs = drawing(file);
      expect(defs.length, file).toBeGreaterThan(0);
      for (const [key, look] of defs) {
        if (body.base === 'beast') {
          expect(look.clips, key).toBe(WILDLIFE_CLIPS);
          expect(look.animUrls ?? [], key).toEqual([]);
        } else {
          const base = VISUALS[body.base];
          expect(look.animUrls, key).toEqual(base.animUrls);
          expect(look.clips, key).toBe(base.clips);
          expect(look.walkRef, key).toBe(base.walkRef);
          expect(look.weaponSlots, key).toEqual([]);
        }
        expect(look.wocCharacter, key).toBeUndefined();
        expect(look.meshToggles, key).toBeUndefined();
        expect(look.entranceGesture, key).toBeUndefined();
        expect(look.authoredAtlas, key).toBe(true);
        for (const a of look.attach ?? []) expect(a.bone, key).toMatch(/^handslot\./);
      }
    }
  });

  it('keeps the old def facts and only hand-slot props, unless the mesh carries its own', () => {
    const old: Record<string, VisualDef> = {
      player_warrior: {
        url: 'models/chars/players/woc/base_male.glb',
        clips: VISUALS.player_warrior.clips,
      } as VisualDef,
      player_rogue: {
        url: 'models/chars/players/woc/base_male.glb',
        clips: VISUALS.player_rogue.clips,
      } as VisualDef,
      a: {
        url: 'models/creatures/woc_crypt_ossuary_warrior.glb',
        height: 3.1,
        tint: '#ff0000',
        hover: 0.4,
        clips: { idle: 'Rise' },
        attach: [
          { url: 'models/weapons/sword.glb', bone: 'handslot.r', size: 0.76 },
          { url: 'models/weapons/cape.glb', bone: 'spine' },
        ],
      } as unknown as VisualDef,
      b: {
        url: 'models/creatures/woc_crypt_ossuary_cutthroat.glb',
        attach: [{ url: 'models/weapons/dagger.glb', bone: 'handslot.l' }],
      } as unknown as VisualDef,
      h: {
        url: 'models/creatures/bastion_warhound.glb',
        height: 2.4,
        clips: { idle: 'Prowl' },
        walkRef: 3,
      } as unknown as VisualDef,
      c: { url: 'models/creatures/somebody_else.glb' } as VisualDef,
    };
    const out = refitEnemyLooks(old);
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'h']);
    expect(out.a.height).toBe(3.1);
    expect(out.a.tint).toBe('#ff0000');
    expect(out.a.hover).toBe(0.4);
    expect(out.a.clips).toBe(old.player_warrior.clips);
    expect(out.a.attach?.map((x) => x.bone)).toEqual(['handslot.r']);
    expect(out.b.clips).toBe(old.player_rogue.clips);
    expect(out.b.attach).toEqual([]);
    expect(out.h.clips).toBe(WILDLIFE_CLIPS);
    expect(out.h.height).toBe(2.4);
    expect(out.h.walkRef).toBeUndefined();
    expect(refitFileOf({ url: 'models/creatures/woc_skeleton_minion.glb' })).toBe(
      'woc_skeleton_minion.glb',
    );
    expect(refitFileOf({ url: 'models/creatures/toString' })).toBeNull();
  });

  it('draws the crypt, the bastion and the summoned dead on the rebuilt bodies', () => {
    const cases: [string, string][] = [
      ['restless_bones', 'woc_skeleton_minion.glb'],
      ['crypt_ossuary_warrior', 'woc_crypt_ossuary_warrior.glb'],
      ['crypt_gravecaller_necromancer', 'woc_crypt_gravecaller_necromancer.glb'],
      ['morthen', 'woc_crypt_morthen.glb'],
      ['knight_commander_olen', 'woc_bastion_olen.glb'],
      ['vael_the_mistcaller', 'woc_bastion_vael.glb'],
      ['gaoler_ossick', 'woc_bastion_ossick.glb'],
      ['drowned_watchman', 'drowned_watchman.glb'],
      ['bastion_warhound', 'bastion_warhound.glb'],
    ];
    for (const [mob, file] of cases) {
      const def = VISUALS[mobVisualKey(mob)];
      expect(def.url, mob).toBe(`models/creatures/${file}`);
      const base = REFIT_ENEMY_FILES[file].base;
      expect(def.clips, mob).toBe(base === 'beast' ? WILDLIFE_CLIPS : VISUALS[base].clips);
    }
  });
});
