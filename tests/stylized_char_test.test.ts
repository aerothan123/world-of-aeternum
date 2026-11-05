// The stylized character TEST (dev-only `?stylizedchars=1`): the opt-in rule,
// the derived defs, default visuals untouched with the flag off, the shipped
// test bodies' rig contract, and the pure retarget math that fit them onto the
// WOC_Armored_Rig (scripts/assets/stylized_char_test/).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  STYLIZED_TOWNSFOLK_KEY,
  STYLIZED_TOWNSFOLK_TEMPLATE,
  STYLIZED_TOWNSFOLK_URL,
  STYLIZED_WARRIOR_KEY,
  STYLIZED_WARRIOR_URL,
  stylizedCharsRequested,
  stylizedTestDefs,
  stylizedTestKeyFor,
} from '../src/render/characters/stylized_char_test_core';
import { stylizedCharsEnabled } from '../src/render/characters/stylized_char_test_flag';
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

  it('names a test key only for the warrior player and the one townsperson', () => {
    const ent = (kind: Entity['kind'], templateId: string) => ({ kind, templateId });
    expect(stylizedTestKeyFor(ent('player', 'warrior'), true)).toBe(STYLIZED_WARRIOR_KEY);
    expect(stylizedTestKeyFor(ent('player', 'mage'), true)).toBeNull();
    expect(stylizedTestKeyFor(ent('npc', STYLIZED_TOWNSFOLK_TEMPLATE), true)).toBe(
      STYLIZED_TOWNSFOLK_KEY,
    );
    expect(stylizedTestKeyFor(ent('npc', 'smith_haldren'), true)).toBeNull();
    expect(stylizedTestKeyFor(ent('mob', STYLIZED_TOWNSFOLK_TEMPLATE), true)).toBeNull();
    expect(stylizedTestKeyFor(ent('player', 'warrior'), false)).toBeNull();
  });

  it('is off on a host without a location, so the default visuals are unchanged', () => {
    expect(stylizedCharsEnabled()).toBe(false);
    expect(VISUALS[STYLIZED_WARRIOR_KEY]).toBeUndefined();
    expect(VISUALS[STYLIZED_TOWNSFOLK_KEY]).toBeUndefined();
    const warrior = { kind: 'player', templateId: 'warrior', auras: [] } as unknown as Entity;
    expect(visualKeyFor(warrior)).toBe('player_warrior');
  });

  it('derives both defs from the WOC warrior: same clips and library, no WOC composition', () => {
    const base = VISUALS.player_warrior;
    const defs = stylizedTestDefs(base);
    const w = defs[STYLIZED_WARRIOR_KEY];
    const t = defs[STYLIZED_TOWNSFOLK_KEY];
    for (const d of [w, t]) {
      expect(d.wocCharacter).toBeUndefined();
      expect(d.lazyPreload).toBe(true);
      expect(d.animUrls).toEqual(base.animUrls);
      expect(d.clips).toBe(base.clips);
    }
    expect(w.url).toBe(STYLIZED_WARRIOR_URL);
    expect(w.attach).toEqual(base.attach);
    expect(t.url).toBe(STYLIZED_TOWNSFOLK_URL);
    expect(t.attach).toEqual([]);
  });
});

describe('stylized test bodies (shipped files)', () => {
  const base = jointNames('public/models/chars/players/woc/base_male.glb');
  for (const url of [STYLIZED_WARRIOR_URL, STYLIZED_TOWNSFOLK_URL]) {
    it(`${url} is one skinned body on the WOC rig, clips left to the library`, () => {
      const path = `public/${url}`;
      expect(jointNames(path)).toEqual(base);
      const j = glbJson(path);
      expect(j.animations ?? []).toHaveLength(0);
      const prims = (j.meshes ?? []).flatMap((m) => m.primitives);
      expect(prims).toHaveLength(1);
      expect(Object.keys(prims[0].attributes)).toEqual(
        expect.arrayContaining(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']),
      );
    });
  }
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
