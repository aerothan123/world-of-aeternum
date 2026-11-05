// Vael the Fogbinder as Death (the art guide's model, scripts/assets/specs/
// woc_bastion_vael.json): the great scythe is held, never spun. It is modelled IN
// the right fist and its `scythe` bone is parented to hand.r, so every swing is
// carried by the shoulder, the elbow, the spine and the floating body; the off hand
// closes round the snath for the heavy blows. These pins decode the shipped GLB the
// way the game loads it (meshopt). Lengths are in the GLB's own units (the body
// stands about 1.8 tall in them; 3.68 yards a unit at his manifest height).

import { readFileSync } from 'node:fs';
import { type Node as GltfNode, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  VEIL_BOIL_FADE_SECONDS,
  veilBoilAlpha,
  veilBoilDone,
  veilBoilScale,
  veilRiseEmerged,
} from '../src/render/sunken_bastion/bastion_gaol_reaper_core';
import { VAEL_TUNING } from '../src/sim/encounters/sunken_bastion/ids';
import type { Entity } from '../src/sim/types';

const GLB = 'public/models/creatures/woc_bastion_vael.glb';
const FPS = 30;

async function readGlb() {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(GLB);
}

type Doc = Awaited<ReturnType<typeof readGlb>>;

/** The angle (degrees) between two unit quaternions [x, y, z, w]. */
function quatAngleDeg(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

function node(doc: Doc, name: string): GltfNode {
  const n = doc
    .getRoot()
    .listNodes()
    .find((x) => x.getName() === name);
  if (!n) throw new Error(`no node ${name}`);
  return n;
}

/** Samples one clip at `t` seconds and returns each node's world matrix. */
function worldAt(doc: Doc, clipName: string, t: number): Map<GltfNode, THREE.Matrix4> {
  const clip = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === clipName);
  if (!clip) throw new Error(`no clip ${clipName}`);
  const trs = new Map<GltfNode, { t: number[]; r: number[]; s: number[] }>();
  for (const n of doc.getRoot().listNodes())
    trs.set(n, { t: n.getTranslation(), r: n.getRotation(), s: n.getScale() });
  for (const ch of clip.listChannels()) {
    const target = ch.getTargetNode();
    const sampler = ch.getSampler();
    const input = sampler?.getInput();
    const output = sampler?.getOutput();
    if (!target || !input || !output) continue;
    const path = ch.getTargetPath();
    if (path !== 'translation' && path !== 'rotation' && path !== 'scale') continue;
    const times: number[] = [];
    for (let i = 0; i < input.getCount(); i++) times.push(input.getScalar(i));
    let i = 0;
    while (i < times.length - 1 && times[i + 1] <= t) i++;
    const j = Math.min(times.length - 1, i + 1);
    const span = times[j] - times[i];
    const k = span > 0 ? Math.min(1, Math.max(0, (t - times[i]) / span)) : 0;
    const a = output.getElement(i, []);
    const b = output.getElement(j, []);
    const slot = trs.get(target);
    if (!slot) continue;
    if (path === 'rotation') {
      const qa = new THREE.Quaternion(a[0], a[1], a[2], a[3]).normalize();
      const qb = new THREE.Quaternion(b[0], b[1], b[2], b[3]).normalize();
      const q = qa.slerp(qb, k);
      slot.r = [q.x, q.y, q.z, q.w];
    } else {
      const v = a.map((x, n) => x + (b[n] - x) * k);
      if (path === 'translation') slot.t = v;
      else slot.s = v;
    }
  }
  const world = new Map<GltfNode, THREE.Matrix4>();
  const visit = (n: GltfNode, parent: THREE.Matrix4) => {
    const p = trs.get(n);
    if (!p) return;
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(p.t[0], p.t[1], p.t[2]),
      new THREE.Quaternion(p.r[0], p.r[1], p.r[2], p.r[3]),
      new THREE.Vector3(p.s[0], p.s[1], p.s[2]),
    );
    const m = parent.clone().multiply(local);
    world.set(n, m);
    for (const c of n.listChildren()) visit(c, m);
  };
  for (const scene of doc.getRoot().listScenes())
    for (const n of scene.listChildren()) visit(n, new THREE.Matrix4());
  return world;
}

/** Where the left wrist sits against the scythe's shaft at `t` into `clip`:
 *  its distance off the shaft line and how far along it (from the right grip,
 *  positive toward the blade). */
function offHandOnShaft(doc: Doc, clip: string, t: number): { off: number; along: number } {
  const w = worldAt(doc, clip, t);
  const scythe = w.get(node(doc, 'scythe'));
  const hand = w.get(node(doc, 'hand.l'));
  if (!scythe || !hand) throw new Error('missing bones');
  const grip = new THREE.Vector3().setFromMatrixPosition(scythe);
  // A bone's own +Y runs head to tail: the scythe bone runs up the shaft.
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(scythe);
  const wrist = new THREE.Vector3().setFromMatrixPosition(hand);
  const rel = wrist.sub(grip);
  const along = rel.dot(axis);
  const off = rel.sub(axis.multiplyScalar(along)).length();
  return { off, along };
}

const def = VISUALS[visualKeyFor({ kind: 'mob', templateId: 'vael_the_mistcaller' } as Entity)];

describe('Vael, Death itself: his body and clips', () => {
  it("draws the art guide's reaper for Vael and for his shadow copies alike", () => {
    expect(def.url).toBe('models/creatures/woc_bastion_vael.glb');
    expect(visualKeyFor({ kind: 'mob', templateId: 'vael_fog_shade' } as Entity)).toBe(
      visualKeyFor({ kind: 'mob', templateId: 'vael_the_mistcaller' } as Entity),
    );
  });

  it('stays a single skinned body inside the boss budget', async () => {
    expect(readFileSync(GLB).length).toBeLessThan(2_500_000);
    const doc = await readGlb();
    expect(doc.getRoot().listSkins().length).toBe(1);
  });
});
// The Fog Veil's rise (bastion_gaol_reaper_core.ts): Jose saw the shadow copies
// pop in. The Emerge clip is half the rise bar, so at rate 1 it looped (the
// figure rose, dropped back under the flags and rose again), and the rig
// crossfaded into it from a standing pose (an upright figure flashing in
// before it dropped). Now the rise plays once over the bar, snapped in.
describe('Vael, Death itself: the veil figures rise out of the roof once', () => {
  async function clipSeconds(name: string): Promise<number> {
    const doc = await readGlb();
    const clip = doc
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === name);
    if (!clip) throw new Error(`no clip ${name}`);
    let end = 0;
    for (const s of clip.listSamplers()) {
      const input = s.getInput();
      if (input) end = Math.max(end, input.getScalar(input.getCount() - 1));
    }
    return end;
  }

  it('the body is under the flags as the rise starts and out of them when it ends', () => {
    expect(veilRiseEmerged(0)).toBe(0);
    let prev = 0;
    for (let t = 0; t <= VAEL_TUNING.veilRiseSeconds; t += 0.05) {
      const k = veilRiseEmerged(t);
      expect(k).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = k;
    }
    expect(veilRiseEmerged(VAEL_TUNING.veilRiseSeconds)).toBe(1);
    // The hood breaks the surface well inside the bar, not at its end.
    expect(veilRiseEmerged(VAEL_TUNING.veilRiseSeconds * 0.5)).toBeGreaterThan(0.5);
  });

  it('the boil wells up before the body shows, holds through the rise, then drains', () => {
    expect(veilBoilAlpha(0)).toBe(0);
    expect(veilBoilAlpha(0.2)).toBe(1);
    expect(veilBoilAlpha(VAEL_TUNING.veilRiseSeconds)).toBe(1);
    expect(veilBoilAlpha(VAEL_TUNING.veilRiseSeconds + VEIL_BOIL_FADE_SECONDS / 2)).toBeCloseTo(
      0.5,
      6,
    );
    expect(veilBoilDone(VAEL_TUNING.veilRiseSeconds + VEIL_BOIL_FADE_SECONDS + 0.01)).toBe(true);
    expect(veilBoilDone(VAEL_TUNING.veilRiseSeconds)).toBe(false);
    expect(veilBoilScale(0.05)).toBeLessThan(veilBoilScale(0.5));
    expect(veilBoilScale(0.5)).toBe(1);
  });
});
