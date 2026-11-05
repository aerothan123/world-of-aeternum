// WYN-H1 P0 (docs/design/wyndlewood-rig.md): the shipped skeleton carries every seam bone,
// its rest pose is its own (identity rest rotations outside the grip slots), the clip
// library is mesh-free and names every clip the P0 ClipMap plays, and the dev switch only
// re-points the stylized player defs.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import {
  stylizedPlayerKey,
  stylizedTestDefs,
} from '../src/render/characters/stylized_char_test_core';
import {
  WYN_P0_CLIP_NAMES,
  WYN_P0_CLIPS,
  WYN_P0_GAIT,
  wynAnimsUrl,
  wynBaseUrl,
} from '../src/render/characters/wyn_rig_core';

interface GlbJson {
  nodes: { name?: string; rotation?: number[] }[];
  skins?: { joints: number[] }[];
  meshes?: unknown[];
  animations?: { name: string; channels: { target: { node: number } }[] }[];
}
function glbJson(path: string): GlbJson {
  const b = readFileSync(path);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}
const SEAM_BONES = [
  'root',
  'hips',
  'head',
  'handslot.l',
  'handslot.r',
  'armor_shoulder.l',
  'armor_shoulder.r',
  'upperarm.l',
  'upperleg.r',
  'foot.l',
];

describe('WYN-H1 skeleton and P0 clips', () => {
  for (const fit of ['male', 'female'] as const) {
    it(`${fit}: every seam bone, identity rest outside the grip slots, one skeleton`, () => {
      const j = glbJson(`public/${wynBaseUrl(fit)}`);
      const skins = j.skins ?? [];
      const names = skins[0].joints.map((i) => j.nodes[i].name);
      for (const b of SEAM_BONES) expect(names).toContain(b);
      for (const i of skins[0].joints) {
        const n = j.nodes[i];
        if (n.name?.startsWith('handslot')) continue;
        expect(n.rotation ?? [0, 0, 0, 1], n.name).toEqual([0, 0, 0, 1]);
      }
      for (const s of skins) expect(s.joints.map((i) => j.nodes[i].name)).toEqual(names);
    });

    it(`${fit}: a mesh-free clip library with the P0 clips on skeleton joints only`, () => {
      const base = glbJson(`public/${wynBaseUrl(fit)}`);
      const bones = new Set((base.skins ?? [])[0].joints.map((i) => base.nodes[i].name));
      const a = glbJson(`public/${wynAnimsUrl(fit)}`);
      expect(a.meshes ?? []).toHaveLength(0);
      const clips = (a.animations ?? []).map((c) => c.name);
      for (const c of WYN_P0_CLIP_NAMES) expect(clips).toContain(c);
      for (const anim of a.animations ?? []) {
        for (const ch of anim.channels) expect(bones.has(a.nodes[ch.target.node].name)).toBe(true);
      }
    });
  }

  it('the P0 ClipMap plays only clips the library ships', () => {
    const named = Object.values(WYN_P0_CLIPS).flatMap((v) => (Array.isArray(v) ? v : [v]));
    for (const c of named) expect(WYN_P0_CLIP_NAMES as readonly string[]).toContain(c);
  });

  it('the dev switch re-points the stylized players at WYN-H1 and nothing else', () => {
    const woc = stylizedTestDefs(VISUALS);
    const wyn = stylizedTestDefs(VISUALS, null, 'wyn');
    for (const fit of ['male', 'female'] as const) {
      const d = wyn[stylizedPlayerKey('mage', fit)];
      expect(d.url).toBe(wynBaseUrl(fit));
      expect(d.animUrls).toEqual([wynAnimsUrl(fit)]);
      expect(d.clips).toBe(WYN_P0_CLIPS);
      expect(d.walkRef).toBe(WYN_P0_GAIT[fit].walkRef);
      expect(d.runRef).toBe(WYN_P0_GAIT[fit].runRef);
      expect(woc[stylizedPlayerKey('mage', fit)].url).not.toBe(wynBaseUrl(fit));
    }
    expect(Object.keys(wyn).sort()).toEqual(Object.keys(woc).sort());
  });
});
