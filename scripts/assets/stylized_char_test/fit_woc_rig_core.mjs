// Pure core of the bind-pose retarget that puts a Tripo auto-rigged biped onto
// the shipped WOC_Armored_Rig (fit_woc_rig.mjs is the IO shell). No IO, no deps.
//
// The WOC animation library keys ROTATIONS on every bone and TRANSLATION only on
// `hips` (its scale tracks are constant), so a mesh bound to the WOC skeleton
// plays every shipped clip as long as (a) each WOC bone keeps its own rest
// ROTATION and DIRECTION, (b) the legs from hips to sole are as long as the WOC
// legs (the hips track is absolute), and (c) the mesh sits in that skeleton's
// bind pose. Tripo's rig gives reliable landmarks and weights even under skirts
// and aprons, but its bind pose is its own (arms droop, legs splay). So: pose
// the Tripo skeleton until every mapped bone points along its WOC twin (forward
// kinematics, shortest-arc rotations), re-skin the mesh to that pose with
// Tripo's own weights (linear blend skinning), scale so the hip height matches,
// and hand the WOC joints the posed positions: WOC directions, Tripo bone
// lengths. The weights are remapped onto WOC joints by bone name.

/** Tripo biped joint name -> the WOC joint its weights move with. */
export function wocJointForTripo(name) {
  const n = name.toLowerCase();
  const side = /^l_/.test(n) ? '.l' : /^r_/.test(n) ? '.r' : '';
  if (side) {
    if (n.includes('clavicle')) return `clavicle${side}`;
    if (n.includes('upperarm')) return `upperarm${side}`;
    if (n.includes('forearm')) return `lowerarm${side}`;
    if (n.includes('hand') || /finger|thumb|index|middle|ring|pinky/.test(n)) return `hand${side}`;
    if (n.includes('thigh')) return `upperleg${side}`;
    if (n.includes('calf')) return `lowerleg${side}`;
    if (n.includes('toe')) return `toes${side}`;
    if (n.includes('foot')) return `foot${side}`;
    return null;
  }
  if (/^(root|hip|pelvis|waist)$/.test(n)) return 'hips';
  if (n === 'spine01') return 'spine';
  if (n === 'spine02' || n === 'spine03') return 'chest';
  if (n.startsWith('neck')) return 'neck';
  if (n.startsWith('head')) return 'head';
  return null;
}

/** The aligned bones: [tripo joint, tripo aim child, woc joint, woc aim child].
 *  The Tripo bone (joint to child) is rotated onto the WOC bone's direction. */
export const ALIGN_CHAINS = [
  ['Spine01', 'Spine02', 'spine', 'chest'],
  ['Spine02', 'NeckTwist01', 'chest', 'neck'],
  ['NeckTwist01', 'Head', 'neck', 'head'],
  ...['L', 'R'].flatMap((s) => {
    const w = s === 'L' ? '.l' : '.r';
    return [
      [`${s}_Clavicle`, `${s}_Upperarm`, `clavicle${w}`, `upperarm${w}`],
      [`${s}_Upperarm`, `${s}_Forearm`, `upperarm${w}`, `lowerarm${w}`],
      [`${s}_Forearm`, `${s}_Hand`, `lowerarm${w}`, `wrist${w}`],
      [`${s}_Thigh`, `${s}_Calf`, `upperleg${w}`, `lowerleg${w}`],
      [`${s}_Calf`, `${s}_Foot`, `lowerleg${w}`, `foot${w}`],
      [`${s}_Foot`, `${s}_ToeBase`, `foot${w}`, `toes${w}`],
    ];
  }),
];

/** WOC joint -> the Tripo joint whose POSED position it takes. Joints not
 *  named here keep their WOC offset from a placed parent (fit_woc_rig.mjs). */
export const WOC_POSITION_SOURCE = {
  hips: 'Hip',
  spine: 'Spine01',
  chest: 'Spine02',
  neck: 'NeckTwist01',
  head: 'Head',
  ...Object.fromEntries(
    ['L', 'R'].flatMap((s) => {
      const w = s === 'L' ? '.l' : '.r';
      return [
        [`clavicle${w}`, `${s}_Clavicle`],
        [`upperarm${w}`, `${s}_Upperarm`],
        [`armor_shoulder${w}`, `${s}_Upperarm`],
        [`lowerarm${w}`, `${s}_Forearm`],
        [`wrist${w}`, `${s}_Hand`],
        [`upperleg${w}`, `${s}_Thigh`],
        [`lowerleg${w}`, `${s}_Calf`],
        [`foot${w}`, `${s}_Foot`],
        [`toes${w}`, `${s}_ToeBase`],
      ];
    }),
  ),
};

// --- small vector / quaternion math (quaternions are [x, y, z, w]) ----------
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const QI = [0, 0, 0, 1];

export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function qrot(q, v) {
  const u = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

/** Shortest-arc rotation taking direction `from` onto direction `to`. */
export function qFromTo(from, to) {
  const f = norm(from);
  const t = norm(to);
  const d = dot(f, t);
  if (d > 1 - 1e-9) return [...QI];
  if (d < -1 + 1e-9) {
    const axis = norm(Math.abs(f[0]) < 0.9 ? cross(f, [1, 0, 0]) : cross(f, [0, 1, 0]));
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(f, t);
  const q = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return q.map((x) => x / l);
}

/**
 * Forward-kinematic re-pose of a skeleton known only by joint positions.
 * joints: [{ name, parent (index or -1), pos }] in TOP-DOWN order.
 * align: Map(jointName -> { child: name, dir: target direction }).
 * Returns { rot: per-joint world rotation delta, pos: per-joint posed position }.
 * A joint with no alignment inherits its parent's rotation (twist bones, the
 * root), so its offset from the parent rigidly follows.
 */
export function poseSkeleton(joints, align) {
  const byName = new Map(joints.map((j, i) => [j.name, i]));
  const rot = joints.map(() => [...QI]);
  const pos = joints.map((j) => [...j.pos]);
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    const p = j.parent;
    const parentRot = p >= 0 ? rot[p] : QI;
    if (p >= 0) pos[i] = add(pos[p], qrot(parentRot, sub(j.pos, joints[p].pos)));
    const a = align.get(j.name);
    if (!a) {
      rot[i] = [...parentRot];
      continue;
    }
    const c = byName.get(a.child);
    const current = qrot(parentRot, sub(joints[c].pos, j.pos));
    rot[i] = qmul(qFromTo(current, a.dir), parentRot);
  }
  return { rot, pos };
}

/** Linear-blend re-skin of one vertex (and optional normal) from the rest
 *  skeleton (`restPos`) to the posed one. idx/wts: its influences. */
export function reskinVertex(v, n, idx, wts, restPos, pose) {
  let out = [0, 0, 0];
  let nout = [0, 0, 0];
  let sum = 0;
  for (let k = 0; k < idx.length; k++) {
    const w = wts[k];
    if (!w) continue;
    const j = idx[k];
    const r = pose.rot[j];
    out = add(out, scale(add(pose.pos[j], qrot(r, sub(v, restPos[j]))), w));
    if (n) nout = add(nout, scale(qrot(r, n), w));
    sum += w;
  }
  if (sum <= 0) return { v: [...v], n: n ? [...n] : null };
  return { v: scale(out, 1 / sum), n: n ? norm(nout) : null };
}

/** Merge influences onto WOC joints: sums duplicate targets, keeps the 4
 *  heaviest, renormalizes. `map[i]` is the WOC joint index of Tripo joint i. */
export function remapInfluences(idx, wts, map, fallback) {
  const acc = new Map();
  for (let k = 0; k < idx.length; k++) {
    const w = wts[k];
    if (!w) continue;
    const t = map[idx[k]] ?? fallback;
    acc.set(t, (acc.get(t) ?? 0) + w);
  }
  const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
  const outIdx = [0, 0, 0, 0];
  const outW = [0, 0, 0, 0];
  top.forEach(([j, w], k) => {
    outIdx[k] = j;
    outW[k] = w / sum;
  });
  if (!top.length) {
    outIdx[0] = fallback;
    outW[0] = 1;
  }
  return { idx: outIdx, wts: outW };
}
