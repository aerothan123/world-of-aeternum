// The stylized character TEST (dev-only `?stylizedchars=1`): the opt-in rule,
// the derived defs, default visuals untouched with the flag off, the shipped
// test bodies' rig contract, and the pure retarget math that fit them onto the
// WOC_Armored_Rig (scripts/assets/stylized_char_test/).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calmSkinTexel } from '../scripts/assets/stylized_char_test/calm_skin_core.mjs';
import {
  ALIGN_CHAINS,
  len,
  poseSkeleton,
  qFromTo,
  qrot,
  remapInfluences,
  sub,
  WOC_POSITION_SOURCE,
  wocJointForTripo,
} from '../scripts/assets/stylized_char_test/fit_woc_rig_core.mjs';
import { invert4, transformPoint4 } from '../scripts/assets/stylized_char_test/mat4_core.mjs';
import {
  applyFrame,
  conformFrames,
  conformVertex,
  stretch,
} from '../scripts/assets/stylized_chars/conform_core.mjs';
import {
  BOOT_LINE,
  splitByRegion,
  triangleRegion,
  vertexRegion,
} from '../scripts/assets/stylized_chars/segment_core.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  STOUT_ARM_DIALS,
  STYLIZED_BASE_FEMALE_URL,
  STYLIZED_BASE_MALE_URL,
  STYLIZED_TOWNSFOLK_KEY,
  STYLIZED_TOWNSFOLK_TEMPLATE,
  STYLIZED_TOWNSFOLK_URL,
  stylizedCharsRequested,
  stylizedPlayerKey,
  stylizedTestDefs,
  stylizedTestKeyFor,
} from '../src/render/characters/stylized_char_test_core';
import { stylizedCharsEnabled } from '../src/render/characters/stylized_char_test_flag';
import {
  isStylizedKit,
  STYLIZED_CLASS_SET,
  STYLIZED_SETS,
  stylizedAppearance,
  stylizedClassSetOf,
  stylizedDrawableWorn,
  stylizedItemId,
  stylizedKitSets,
  stylizedKitWorn,
  stylizedManifest,
} from '../src/render/characters/stylized_kit_core';
import {
  parseWocArmorPackUrl,
  wocArmorPackUrl,
  wocArmorRigKey,
  wocArmorRigKeyOfSet,
} from '../src/render/characters/woc_armor_core';
import { wocManifestSets, wocNodeNameOf } from '../src/render/characters/woc_parts_core';
import type { Entity } from '../src/sim/types';

function glbJson(path: string): {
  skins?: { joints: number[] }[];
  nodes: { name?: string }[];
  animations?: unknown[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
} {
  const buf = readFileSync(path);
  const n = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + n).toString('utf8'));
}
const jointNames = (path: string) => {
  const j = glbJson(path);
  return (j.skins?.[0]?.joints ?? []).map((i) => j.nodes[i].name);
};

describe('stylized character test switch', () => {
  it('opts in only on ?stylizedchars=1 or on', () => {
    expect(stylizedCharsRequested('?stylizedchars=1')).toBe(true);
    expect(stylizedCharsRequested('?gfx=high&stylizedchars=on')).toBe(true);
    expect(stylizedCharsRequested('?stylizedchars=0')).toBe(false);
    expect(stylizedCharsRequested('')).toBe(false);
  });

  it('names a review key for a WOC class player (by body pick) and the one townsperson', () => {
    const ent = (kind: Entity['kind'], templateId: string) => ({ kind, templateId });
    expect(stylizedTestKeyFor(ent('player', 'warrior'), true)).toBe(
      stylizedPlayerKey('warrior', 'male'),
    );
    expect(
      stylizedTestKeyFor(
        { kind: 'player', templateId: 'mage', modularAppearance: { gender: 'female' } },
        true,
      ),
    ).toBe(stylizedPlayerKey('mage', 'female'));
    expect(stylizedTestKeyFor(ent('player', 'mech'), true)).toBeNull();
    expect(stylizedTestKeyFor(ent('npc', STYLIZED_TOWNSFOLK_TEMPLATE), true)).toBe(
      STYLIZED_TOWNSFOLK_KEY,
    );
    expect(stylizedTestKeyFor(ent('npc', 'smith_haldren'), true)).toBeNull();
    expect(stylizedTestKeyFor(ent('mob', STYLIZED_TOWNSFOLK_TEMPLATE), true)).toBeNull();
    expect(stylizedTestKeyFor(ent('player', 'warrior'), false)).toBeNull();
  });

  it('is off on a host without a location, so the default visuals are unchanged', () => {
    expect(stylizedCharsEnabled()).toBe(false);
    expect(Object.keys(VISUALS).filter((k) => k.startsWith('stylized_'))).toEqual([]);
    expect(VISUALS[STYLIZED_TOWNSFOLK_KEY]).toBeUndefined();
    const warrior = { kind: 'player', templateId: 'warrior', auras: [] } as unknown as Entity;
    expect(visualKeyFor(warrior)).toBe('player_warrior');
  });

  it('derives a def per class and fit from its WOC def, loading only its own set', () => {
    const defs = stylizedTestDefs(VISUALS);
    for (const [cls, set] of Object.entries(STYLIZED_CLASS_SET)) {
      for (const fit of ['male', 'female'] as const) {
        const d = defs[stylizedPlayerKey(cls, fit)];
        const src = VISUALS[fit === 'female' ? `player_${cls}_female` : `player_${cls}`];
        expect(d, `${cls} ${fit}`).toBeDefined();
        expect(d.clips).toBe(src.clips);
        expect(d.animUrls).toEqual(src.animUrls);
        expect(d.wocCharacter?.animationNames).toBe(src.wocCharacter?.animationNames);
        expect(wocManifestSets(d.wocCharacter as never)).toEqual([`stylized_${set}`]);
        expect(stylizedClassSetOf(d.wocCharacter as never)).toBe(set);
      }
    }
    // a review kit that borrows sets adds exactly those
    const mixed = stylizedTestDefs(VISUALS, 'mixed')[stylizedPlayerKey('mage', 'male')];
    expect(wocManifestSets(mixed.wocCharacter as never).sort()).toEqual(
      ['stylized_leather', 'stylized_mage', 'stylized_plate'].sort(),
    );
  });

  it('derives the warrior defs from the WOC warrior: same clip library, the kit per fit', () => {
    const male = VISUALS.player_warrior;
    const female = VISUALS.player_warrior_female;
    const defs = stylizedTestDefs(VISUALS);
    const m = defs[stylizedPlayerKey('warrior', 'male')];
    const f = defs[stylizedPlayerKey('warrior', 'female')];
    const t = defs[STYLIZED_TOWNSFOLK_KEY];
    for (const d of [m, f, t]) expect(d.lazyPreload).toBe(true);
    expect(m.animUrls).toEqual(male.animUrls);
    expect(t.animUrls).toEqual(male.animUrls);
    expect(f.animUrls).toEqual(female.animUrls);
    expect(m.url).toBe(STYLIZED_BASE_MALE_URL);
    expect(f.url).toBe(STYLIZED_BASE_FEMALE_URL);
    expect(m.wocCharacter?.ownHead).toBe(true);
    expect(f.wocCharacter?.fit).toBe('female');
    expect(m.clips).toBe(male.clips);
    // the townsperson: one fixed body, nothing held, a calm jog, arms dialled off the belly
    expect(t.wocCharacter).toBeUndefined();
    expect(t.url).toBe(STYLIZED_TOWNSFOLK_URL);
    expect(t.attach).toEqual([]);
    expect(t.clips.run).toBe(male.clips.walk);
    expect(t.dials).toBe(STOUT_ARM_DIALS);
  });
});

describe('stylized modular kit manifest', () => {
  const warrior = VISUALS.player_warrior.wocCharacter;
  if (!warrior) throw new Error('the WOC warrior def carries a manifest');

  it('lists every set slot, each piece hiding the bare body region it covers', () => {
    for (const fit of ['male', 'female'] as const) {
      const man = stylizedManifest(fit, warrior, 'plate', ['leather']);
      expect(man.ownHead).toBe(true);
      expect(man.baseNodes).toEqual([]);
      for (const set of ['plate', 'leather'] as const) {
        for (const slot of ['chest', 'arms', 'hands', 'waist', 'legs', 'feet']) {
          const item = man.items[stylizedItemId(fit, set, slot)];
          expect(item.slot).toBe(slot);
          expect(item.set).toBe(`stylized_${set}`);
          expect(item.hidesAppearance).toEqual([`body_${slot}`]);
          expect(man.appearance[`body_${slot}`].variants.default.nodes).toHaveLength(1);
        }
      }
      expect(man.items[stylizedItemId(fit, 'plate', 'head')].hidesAppearance).toEqual(['hair']);
      expect(man.items[stylizedItemId(fit, 'leather', 'head')]).toBeUndefined();
    }
  });

  it('names every part so the WOC resolver keeps it its own part (no `_<digits>` suffix)', () => {
    for (const fit of ['male', 'female'] as const) {
      const man = stylizedManifest(fit, warrior, 'plate', STYLIZED_SETS.slice(1));
      const names = [
        ...Object.values(man.appearance).flatMap((s) =>
          Object.values(s.variants).flatMap((v) => v.nodes),
        ),
        ...Object.values(man.items).flatMap((i) => i.nodes),
      ];
      expect(new Set(names.map(wocNodeNameOf)).size).toBe(names.length);
    }
  });

  it('mixes sets per slot and honours a hidden helm', () => {
    const mixed = stylizedKitWorn('male', 'mixed', false);
    expect(mixed.chest).toBe('male_stylized_plate_chest');
    expect(mixed.arms).toBe('male_stylized_plate_shoulders');
    expect(mixed.head).toBe('male_stylized_plate_helm');
    expect(mixed.legs).toBe('male_stylized_leather_legs');
    expect(mixed.feet).toBe('male_stylized_leather_boots');
    expect(stylizedKitWorn('female', 'leather', false).head).toBeNull();
    expect(stylizedKitWorn('male', 'plate', true).head).toBeNull();
    expect(Object.values(stylizedKitWorn('male', 'bare', false)).every((v) => v === null)).toBe(
      true,
    );
    // the class kit wears the body's own set; a helmless set leaves the head empty
    const priest = stylizedKitWorn('female', 'class', false, 'priest');
    expect(priest.chest).toBe('female_stylized_priest_chest');
    expect(priest.head).toBeNull();
    expect(stylizedKitSets('class', 'druid')).toEqual(['druid']);
    expect(stylizedKitSets('mixed', 'druid')).toEqual(['plate', 'leather']);
    expect(isStylizedKit('warlock')).toBe(true);
    expect(isStylizedKit('robes')).toBe(false);
  });

  it('draws the bare region under a piece whose set file has not attached yet', () => {
    const man = stylizedManifest('male', warrior, 'plate', ['leather']);
    const worn = stylizedKitWorn('male', 'mixed', false);
    // only the plate file is attached: its nodes resolve, the leather ones do not yet
    const resolved = new Set(
      Object.values(man.items)
        .filter((i) => i.set === 'stylized_plate')
        .flatMap((i) => i.nodes),
    );
    const drawable = stylizedDrawableWorn(man, worn, resolved);
    expect(drawable.chest).toBe(worn.chest);
    expect(drawable.head).toBe(worn.head);
    expect(drawable.legs).toBeNull();
    expect(drawable.feet).toBeNull();
    // a body that brings no head of its own (every shipped WOC body) is untouched
    const shipped = { ...man, ownHead: false };
    expect(stylizedDrawableWorn(shipped, worn, new Set())).toBe(worn);
  });

  it('takes a review face and hair only when the manifest has them', () => {
    const man = stylizedManifest('male', warrior);
    expect(stylizedAppearance(man, 'c', 'h3')).toMatchObject({ face: 'c', hair: 'h3' });
    expect(stylizedAppearance(man, 'zz', 'none')).toMatchObject({ face: 'default', hair: null });
    expect(stylizedAppearance(man, null, null)).toMatchObject({ face: 'default', hair: 'h1' });
  });

  it('files stylized sets under their own root, round-tripping through the parser', () => {
    const url = wocArmorPackUrl('female', 'stylized_plate', 'high');
    expect(url).toBe('models/chars/players/woc_stylized/armor/female_stylized_plate_top.glb');
    expect(parseWocArmorPackUrl(url)).toEqual({
      fit: 'female',
      set: 'stylized_plate',
      tier: 'high',
    });
    expect(wocArmorPackUrl('male', 'warrior', 'low')).toBe(
      'models/chars/players/woc/armor/male_warrior_low.glb',
    );
    // stylized packs are prepared against the stylized base only: the two bases share joints
    // and rest pose but not their quantized inverse binds
    expect(wocArmorRigKeyOfSet('male', 'stylized_plate')).toBe(wocArmorRigKey('male', true));
    expect(wocArmorRigKeyOfSet('male', 'warrior')).toBe(wocArmorRigKey('male', false));
    expect(wocArmorRigKey('male', true)).not.toBe(wocArmorRigKey('male', false));
    expect(wocArmorRigKey('male', true)).not.toBe(wocArmorRigKey('female', true));
    // a set under the wrong root is not a pack
    expect(
      parseWocArmorPackUrl('models/chars/players/woc/armor/male_stylized_plate_low.glb'),
    ).toBeNull();
    expect(
      parseWocArmorPackUrl('models/chars/players/woc_stylized/armor/male_warrior_low.glb'),
    ).toBeNull();
  });
});

// The sets whose files are built so far (the class sets land with their build).
const BUILT_SETS: readonly string[] = ['plate', 'leather'];

describe('stylized shipped files', () => {
  for (const fit of ['male', 'female'] as const) {
    const woc = jointNames(`public/models/chars/players/woc/base_${fit}.glb`);
    const man = stylizedManifest(
      fit,
      VISUALS.player_warrior.wocCharacter as never,
      'plate',
      STYLIZED_SETS.slice(1),
    );
    it(`${fit}: the base and every set file sit on the WOC rig and carry every manifest node`, () => {
      const base = glbJson(`public/models/chars/players/woc_stylized/base_${fit}.glb`);
      expect(jointNames(`public/models/chars/players/woc_stylized/base_${fit}.glb`)).toEqual(woc);
      const baseNames = base.nodes.map((n) => n.name);
      for (const slot of Object.values(man.appearance)) {
        for (const v of Object.values(slot.variants)) {
          for (const n of v.nodes) expect(baseNames, n).toContain(n);
        }
      }
      for (const set of BUILT_SETS.map((s) => `stylized_${s}`)) {
        for (const tier of ['low', 'medium'] as const) {
          const path = `public/${wocArmorPackUrl(fit, set, tier)}`;
          expect(jointNames(path)).toEqual(woc);
          const names = glbJson(path).nodes.map((n) => n.name);
          for (const item of Object.values(man.items)) {
            if (item.set === set) for (const n of item.nodes) expect(names, n).toContain(n);
          }
        }
      }
    });
  }

  it('the townsperson is one skinned body on the WOC rig, clips left to the library', () => {
    const path = `public/${STYLIZED_TOWNSFOLK_URL}`;
    expect(jointNames(path)).toEqual(jointNames('public/models/chars/players/woc/base_male.glb'));
    const j = glbJson(path);
    expect(j.animations ?? []).toHaveLength(0);
    const prims = (j.meshes ?? []).flatMap((m) => m.primitives);
    expect(prims).toHaveLength(1);
    expect(Object.keys(prims[0].attributes)).toEqual(
      expect.arrayContaining(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']),
    );
  });
});

describe('stylized kit build cores', () => {
  it('stretches only along the bone axis', () => {
    const v = stretch([1, 2, 0], 1, 2, [1, 0, 0]);
    expect(v).toEqual([2, 2, 0]);
    expect(stretch([1, 2, 3], 2, 1, null)).toEqual([2, 4, 6]);
  });

  it('carries a bone onto its WOC twin: placed at the joint, scaled, stretched on its axis', () => {
    // a shin from y 0.5 down to 0.1, onto a WOC shin at y 0.25 that is twice as long after the
    // uniform half-scale fit
    const f = { O: [0, 0.25, 0], R: [0, 0, 0, 1], s: 0.5, k: 2, d: [0, 1, 0], P: [0, 0.5, 0] };
    const foot = applyFrame(f, [0, 0.1, 0]);
    expect(foot[1]).toBeCloseTo(-0.15, 9);
    // girth is scaled but not stretched
    expect(applyFrame(f, [0.1, 0.5, 0])[0]).toBeCloseTo(0.05, 9);
    // a vertex split between two frames blends them
    const g = { ...f, O: [1, 0.25, 0] };
    const mid = conformVertex([0, 0.5, 0], [1, 0, 0], [0, 1], [0.5, 0.5], [f, g]);
    expect(mid.v[0]).toBeCloseTo(0.5, 9);
    expect(mid.n?.[0]).toBeCloseTo(1, 9);
  });

  it('fits the uniform scale hip to ankle on a full Tripo biped', () => {
    const J = (name: string, parent: number, pos: number[]) => ({ name, parent, pos });
    const joints = [
      J('Hip', -1, [0, 1, 0]),
      J('Spine01', 0, [0, 1.1, 0]),
      J('Spine02', 1, [0, 1.3, 0]),
      J('NeckTwist01', 2, [0, 1.5, 0]),
      J('Head', 3, [0, 1.6, 0]),
    ];
    const woc = new Map<string, number[]>([
      ['hips', [0, 0.5, 0]],
      ['spine', [0, 0.55, 0]],
      ['chest', [0, 0.65, 0]],
      ['neck', [0, 0.75, 0]],
      ['head', [0, 0.8, 0]],
    ]);
    for (const [s, w, z] of [
      ['L', 'l', -0.1],
      ['R', 'r', 0.1],
    ] as const) {
      const at = (y: number, x = 0) => [x, y, z];
      const b = joints.length;
      joints.push(
        J(`${s}_Thigh`, 0, at(0.9)),
        J(`${s}_Calf`, b, at(0.5)),
        J(`${s}_Foot`, b + 1, at(0.1)),
        J(`${s}_ToeBase`, b + 2, at(0.05, 0.1)),
        J(`${s}_Clavicle`, 2, at(1.4)),
        J(`${s}_Upperarm`, b + 4, at(1.4, 0.0001)),
        J(`${s}_Forearm`, b + 5, at(1.4, 0.0002)),
        J(`${s}_Hand`, b + 6, at(1.4, 0.0003)),
      );
      for (const [n, y, x] of [
        ['upperleg', 0.45, 0],
        ['lowerleg', 0.25, 0],
        ['foot', 0.05, 0],
        ['toes', 0.02, 0.05],
        ['clavicle', 0.7, 0],
        ['upperarm', 0.7, 0.0001],
        ['lowerarm', 0.7, 0.0002],
        ['wrist', 0.7, 0.0003],
      ] as const) {
        woc.set(`${n}.${w}`, [x, y, z / 2]);
      }
    }
    const { frames, fitScale } = conformFrames(joints, woc);
    expect(fitScale).toBeCloseTo(0.5, 6);
    const knee = applyFrame(frames[joints.findIndex((j) => j.name === 'L_Thigh')], [0, 0.5, -0.1]);
    expect(knee[1]).toBeCloseTo(0.25, 6);
    expect(knee[2]).toBeCloseTo(-0.05, 6);
  });

  it('cuts by the heaviest joint, splits the shin at the boot line, triangles by majority', () => {
    const names = ['hips', 'lowerleg.l', 'chest'];
    const knee = { l: [0, 0.5, 0], r: [0, 0.5, 0] };
    const ankle = { l: [0, 0.1, 0], r: [0, 0.1, 0] };
    const shin = (y: number) => vertexRegion(names, [1, 0], [0.8, 0.2], [0, y, 0], knee, ankle);
    expect(shin(0.45)).toBe('legs');
    expect(shin(0.5 - 0.4 * (BOOT_LINE + 0.05))).toBe('feet');
    expect(vertexRegion(names, [0, 2], [0.3, 0.7], [0, 1, 0], knee, ankle)).toBe('chest');
    expect(triangleRegion('legs', 'feet', 'feet')).toBe('feet');
    expect(triangleRegion('legs', 'feet', 'chest')).toBe('legs');
    const parts = splitByRegion([0, 1, 2, 1, 3, 2], ['a', 'a', 'a', 'b']);
    expect(parts.get('a')?.indices).toEqual([0, 1, 2, 1, 3, 2]);
    expect(parts.get('a')?.vertices).toEqual([0, 1, 2, 3]);
    expect(splitByRegion([0, 1, 2], ['a', 'a', 'a'], (r: string) => r !== 'a').size).toBe(0);
  });

  it('calms only saturated bright red-orange skin texels, hue and value kept', () => {
    expect(calmSkinTexel(230, 150, 130)).toEqual([230, 150, 130]); // a calm skin tone: untouched
    const [r, g, b] = calmSkinTexel(230, 80, 60);
    expect(r).toBe(230);
    expect(g).toBeGreaterThan(80);
    expect(b).toBeGreaterThan(60);
    expect((r - Math.min(g, b)) / r).toBeLessThan(0.5);
    expect(calmSkinTexel(80, 30, 20)).toEqual([80, 30, 20]); // dark: untouched
    expect(calmSkinTexel(60, 200, 90)).toEqual([60, 200, 90]); // green: untouched
  });
});

describe('WOC rig retarget core', () => {
  const TRIPO_BIPED = [
    'Root',
    'Hip',
    'Pelvis',
    'Waist',
    'Spine01',
    'Spine02',
    'NeckTwist01',
    'NeckTwist02',
    'Head',
    ...['L', 'R'].flatMap((s) =>
      [
        'Thigh',
        'ThighTwist01',
        'ThighTwist02',
        'Calf',
        'CalfTwist01',
        'CalfTwist02',
        'Foot',
        'ToeBase',
        'Clavicle',
        'Upperarm',
        'UpperarmTwist01',
        'UpperarmTwist02',
        'Forearm',
        'ForearmTwist01',
        'ForearmTwist02',
        'Hand',
      ].map((b) => `${s}_${b}`),
    ),
  ];

  it('maps every Tripo biped joint onto a WOC joint, sides kept', () => {
    for (const n of TRIPO_BIPED) expect(wocJointForTripo(n), n).not.toBeNull();
    expect(wocJointForTripo('L_ForearmTwist02')).toBe('lowerarm.l');
    expect(wocJointForTripo('R_ThighTwist01')).toBe('upperleg.r');
    expect(wocJointForTripo('Spine02')).toBe('chest');
    expect(ALIGN_CHAINS.every(([a, b]) => TRIPO_BIPED.includes(a) && TRIPO_BIPED.includes(b))).toBe(
      true,
    );
    expect(Object.values(WOC_POSITION_SOURCE).every((n) => TRIPO_BIPED.includes(n))).toBe(true);
  });

  it('rotates a drooping arm onto the target line and keeps its bone lengths', () => {
    const joints = [
      { name: 'S', parent: -1, pos: [0, 1, 0] },
      { name: 'E', parent: 0, pos: [0.3, 0.9, 0] },
      { name: 'H', parent: 1, pos: [0.6, 0.78, 0.02] },
    ];
    const align = new Map([
      ['S', { child: 'E', dir: [1, 0, 0] }],
      ['E', { child: 'H', dir: [1, 0, 0] }],
    ]);
    const pose = poseSkeleton(joints, align);
    const upper = sub(pose.pos[1], pose.pos[0]);
    const lower = sub(pose.pos[2], pose.pos[1]);
    expect(upper[1]).toBeCloseTo(0, 9);
    expect(lower[1]).toBeCloseTo(0, 9);
    expect(len(upper)).toBeCloseTo(len(sub(joints[1].pos, joints[0].pos)), 9);
    expect(len(lower)).toBeCloseTo(len(sub(joints[2].pos, joints[1].pos)), 9);
  });

  it('builds shortest-arc rotations and merges influences onto WOC joints', () => {
    const v = qrot(qFromTo([0, 1, 0], [1, 0, 0]), [0, 1, 0]);
    expect(v[0]).toBeCloseTo(1, 9);
    expect(v[1]).toBeCloseTo(0, 9);
    const r = remapInfluences([0, 1, 2, 3], [0.4, 0.3, 0.2, 0.1], [5, 5, 7, 9], 0);
    expect(r.idx.slice(0, 3)).toEqual([5, 7, 9]);
    expect(r.wts[0]).toBeCloseTo(0.7, 9);
    expect(r.wts.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('inverts an affine matrix', () => {
    const m = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, -3, 4, 1];
    const p = transformPoint4(invert4(m), transformPoint4(m, [0.5, 0.25, -1]));
    expect(p[0]).toBeCloseTo(0.5, 9);
    expect(p[1]).toBeCloseTo(0.25, 9);
    expect(p[2]).toBeCloseTo(-1, 9);
  });
});
