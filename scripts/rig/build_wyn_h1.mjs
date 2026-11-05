// WYN-H1, the Wyndlewood-owned humanoid skeleton (docs/design/wyndlewood-rig.md): rebinds a
// stylized body onto a skeleton whose joints are placed from landmarks measured on THAT
// body's own mesh (slices of its vertex cloud plus fixed proportions), with identity rest
// rotations, so no joint position, rest pose or inverse bind matrix comes from another rig.
// The joint names are the plain anatomical ones the engine's seams key on (handslot.l/r,
// head, armor_shoulder.l/r, root), so attachment and bind-by-name stay unchanged. The mesh,
// its skin weights (from the body's own Tripo rig) and its materials are kept as they are.
//
// usage: node scripts/rig/build_wyn_h1.mjs --in <stylized base.glb> --out <wyn base.glb>
//          [--landmarks <out.json>]
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { mat4Apply, mat4Invert, mat4Mul } from './wyn_math.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(opt('in'));
const root = doc.getRoot();
const skins = root.listSkins();
const joints = skins[0].listJoints();
const worldOf = (n) => n.getWorldMatrix();

// 1. the bind shape of every skin (mesh space -> world in the bind pose), kept as is
const bind = new Map();
for (const skin of skins) {
  const ibm = skin.getInverseBindMatrices();
  const sj = skin.listJoints();
  const per = sj.map((j, k) => mat4Mul(worldOf(j), ibm.getElement(k, [])));
  bind.set(skin, { sj, per });
}

// 2. the body's vertex cloud in world space (bare body regions; the face for the crown)
const meshNodes = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
const cloud = [];
const region = {};
let crown = -Infinity;
for (const n of meshNodes) {
  const name = n.getMesh().getName();
  const body = /Body_/.test(name);
  const face = /Face_A$/.test(name);
  if (!body && !face) continue;
  const B = bind.get(n.getSkin()).per[0];
  for (const prim of n.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const el = [];
    for (let i = 0; i < pos.getCount(); i++) {
      const p = mat4Apply(B, pos.getElement(i, el));
      if (body) cloud.push(p);
      const key = name.replace(/^Stylized_(Female_)?/, '');
      if (!region[key]) region[key] = [];
      region[key].push(p);
      crown = Math.max(crown, p[1]);
    }
  }
}
const ground = Math.min(...cloud.map((p) => p[1]));
const H = crown - ground;
const mean = (ps, k) => ps.reduce((s, p) => s + p[k], 0) / Math.max(1, ps.length);
const slab = (pred) => cloud.filter(pred);
// the middle of a slab's bounds (a vertex mean leans toward dense detail like laces)
const centroid = (ps) => {
  if (!ps.length) throw new Error('empty landmark slab');
  return [0, 1, 2].map((k) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of ps) {
      lo = Math.min(lo, p[k]);
      hi = Math.max(hi, p[k]);
    }
    return (lo + hi) / 2;
  });
};
const bounds = (ps, k) => [Math.min(...ps.map((p) => p[k])), Math.max(...ps.map((p) => p[k]))];
const pct = (vals, q) => {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// 3. landmarks
const arms = [...(region.Body_Shoulders ?? []), ...(region.Body_Gloves ?? [])];
const tipX = Math.max(...arms.map((p) => Math.abs(p[0])));
const armY = mean(
  arms.filter((p) => Math.abs(p[0]) > 0.8 * tipX),
  1,
);
const under = region.Body_Chest.filter((p) => p[1] > armY - 0.1 * H && p[1] < armY - 0.05 * H);
const chestX = Math.max(...under.map((p) => Math.abs(p[0])));
const shoulderX = chestX * 0.85;
const wristX = tipX - 0.095 * H;
const armAt = (x) => centroid(arms.filter((p) => p[0] > 0 && Math.abs(p[0] - x) < 0.012 * H));
const shoulder = armAt(shoulderX + 0.03 * H);
shoulder[0] = shoulderX;
const elbow = armAt(shoulderX + 0.5 * (wristX - shoulderX));
const wrist = armAt(wristX);
const palm = armAt(wristX + 0.03 * H);
const grip = armAt(wristX + 0.05 * H);
grip[1] -= 0.008 * H;

let crotchY = ground + 0.3 * H;
for (let y = ground + 0.6 * H; y > ground + 0.25 * H; y -= 0.004 * H) {
  const row = slab((p) => Math.abs(p[1] - y) < 0.004 * H && Math.abs(p[0]) < 0.12 * H);
  if (row.length > 8 && !row.some((p) => Math.abs(p[0]) < 0.012 * H)) {
    crotchY = y;
    break;
  }
}
const hipY = crotchY + 0.075 * H;
const legAt = (y) =>
  centroid(
    slab((p) => p[0] > 0.004 * H && Math.abs(p[1] - y) < 0.01 * H && Math.abs(p[0]) < 0.2 * H),
  );
const hipSock = legAt(crotchY - 0.03 * H);
hipSock[1] = hipY;
const ankleY = ground + 0.07 * H;
const ankle = legAt(ankleY + 0.03 * H);
ankle[1] = ankleY;
const kneeY = ankleY + 0.52 * (hipY - ankleY);
const knee = legAt(kneeY);
const footVerts = slab((p) => p[0] > 0 && p[1] < ground + 0.04 * H && Math.abs(p[0]) < 0.2 * H);
const tipZ = Math.max(...footVerts.map((p) => p[2]));
const ball = [mean(footVerts, 0), ground + 0.02 * H, ankle[2] + 0.65 * (tipZ - ankle[2])];
const torsoAt = (y) =>
  centroid(slab((p) => Math.abs(p[1] - y) < 0.01 * H && Math.abs(p[0]) < 0.08 * H));
const pelvis = torsoAt(hipY);
pelvis[0] = 0;
const face = region.Face_A;
const [faceLo] = bounds(face, 1);
const [fz0, fz1] = bounds(face, 2);
const shTop = bounds(region.Body_Shoulders, 1)[1];
const neck = torsoAt(shTop - 0.005 * H);
neck[0] = 0;
const head = [0, faceLo + 0.06 * H, (fz0 + fz1) / 2 - 0.015 * H];
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const spine = lerp3(pelvis, neck, 0.3);
const chest = lerp3(pelvis, neck, 0.62);
const clav = [0.12 * shoulderX, neck[1] - 0.025 * H, chest[2] + 0.01 * H];
const waist = slab((p) => Math.abs(p[1] - (hipY + 0.03 * H)) < 0.012 * H);
const waistX = pct(
  waist.map((p) => Math.abs(p[0])),
  0.95,
);
const front = Math.max(...waist.map((p) => p[2]));
const back = Math.min(...waist.map((p) => p[2]));

const L = (p) => p; // left side (+x); the right side mirrors x
const R = (p) => [-p[0], p[1], p[2]];
const world = {
  root: [0, 0, 0],
  hips: pelvis,
  spine,
  chest,
  neck,
  head,
};
for (const [side, f] of [
  ['l', L],
  ['r', R],
]) {
  world[`clavicle.${side}`] = f(clav);
  world[`upperarm.${side}`] = f(shoulder);
  world[`armor_shoulder.${side}`] = f(shoulder);
  world[`lowerarm.${side}`] = f(elbow);
  world[`wrist.${side}`] = f(wrist);
  world[`hand.${side}`] = f(palm);
  world[`handslot.${side}`] = f(grip);
  world[`upperleg.${side}`] = f(hipSock);
  world[`lowerleg.${side}`] = f(knee);
  world[`foot.${side}`] = f(ankle);
  world[`toes.${side}`] = f(ball);
  world[`skirt.front.${side}`] = f([0.5 * hipSock[0], hipY + 0.03 * H, front]);
  world[`skirt.back.${side}`] = f([0.5 * hipSock[0], hipY + 0.03 * H, back]);
  world[`tassel.side.${side}`] = f([waistX, hipY + 0.03 * H, pelvis[2]]);
}

// 4. rewrite the joints: identity rest rotations, translations from the landmarks. The grip
// slots keep their world orientation (the weapon axis convention every weapon layout uses).
const oldWorld = new Map(joints.map((j) => [j.getName(), worldOf(j)]));
function quatOfMat(m) {
  const [m00, m10, m20, , m01, m11, m21, , m02, m12, m22] = m;
  const t = m00 + m11 + m22;
  let q;
  if (t > 0) {
    const s = 0.5 / Math.sqrt(t + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}
const missing = joints.map((j) => j.getName()).filter((n) => !world[n]);
if (missing.length) throw new Error(`no landmark for ${missing.join(', ')}`);
const parentOf = (j) => joints.find((p) => p.listChildren().includes(j)) ?? null;
for (const j of joints) {
  const p = parentOf(j);
  const pw = p ? world[p.getName()] : [0, 0, 0];
  const w = world[j.getName()];
  j.setTranslation([w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]]);
  j.setScale([1, 1, 1]);
  j.setRotation(
    /^handslot/.test(j.getName()) ? quatOfMat(oldWorld.get(j.getName())) : [0, 0, 0, 1],
  );
}

// 5. inverse bind matrices from the new joint worlds and each skin's kept bind shape
for (const skin of skins) {
  const { sj, per } = bind.get(skin);
  const ibm = skin.getInverseBindMatrices();
  sj.forEach((j, k) => {
    ibm.setElement(k, mat4Mul(mat4Invert(worldOf(j)), per[k]));
  });
}
for (const s of root.listScenes())
  for (const c of s.listChildren()) if (/WOC/.test(c.getName())) c.setName('WYN_H1');
await io.write(opt('out'), doc);
if (opt('landmarks'))
  writeFileSync(opt('landmarks'), JSON.stringify({ H, ground, crown, joints: world }, null, 1));
console.log(
  JSON.stringify({
    out: opt('out'),
    H: +H.toFixed(4),
    joints: joints.length,
    crotchY: +crotchY.toFixed(3),
    shoulderX: +shoulderX.toFixed(3),
  }),
);
