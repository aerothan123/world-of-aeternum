// Conform a Tripo auto-rigged biped onto the EXACT shipped WOC rest skeleton (pure, no IO).
//
// fit_woc_rig_core.mjs (the first stylized test) moved the WOC joints to the new body. A
// modular kit cannot: every armor file binds to the base by bone name and rig_merge.ts only
// reconciles ONE constant transform between a part's inverse bind matrices and the base's,
// so every piece of every set must sit on the base's own rest pose, bone for bone. So here
// the body goes to the skeleton instead: each Tripo bone is turned onto its WOC twin's
// direction (fit_woc_rig_core poseSkeleton), then stretched along that axis to the twin's
// length and placed at the twin's joint. A vertex follows its own influences' frames, so a
// limb keeps its girth (the chunky look) and only its pivots and lengths conform.
//
// Frame of a Tripo joint t that a WOC joint takes its position from (a "main" joint):
//   F_t(x) = O_t + S_t R_t (x - P_t)
//   P_t rest position (faced), R_t the aligning rotation, O_t the WOC joint position,
//   S_t = s (I + (k_t - 1) d d^T): the uniform fit scale s, stretched by k_t along the
//   WOC bone direction d so the Tripo child lands exactly on the WOC child.
// Any other Tripo joint (twists, Pelvis, Waist, Root) rides its nearest main ancestor's
// frame (it is part of that bone), and a joint with no main ancestor rides Hip's.
import {
  add,
  dot,
  len,
  norm,
  poseSkeleton,
  qrot,
  scale,
  sub,
} from '../stylized_char_test/fit_woc_rig_core.mjs';

const SIDES = [
  ['L', '.l'],
  ['R', '.r'],
];

/** The WOC joint each main Tripo joint is placed on, and the WOC child that sets its
 *  stretch (null: no stretch, a leaf). */
export const MAIN_JOINTS = {
  Hip: ['hips', null],
  Spine01: ['spine', 'chest'],
  Spine02: ['chest', 'neck'],
  NeckTwist01: ['neck', 'head'],
  Head: ['head', null],
  ...Object.fromEntries(
    SIDES.flatMap(([s, w]) => [
      [`${s}_Clavicle`, [`clavicle${w}`, `upperarm${w}`]],
      [`${s}_Upperarm`, [`upperarm${w}`, `lowerarm${w}`]],
      [`${s}_Forearm`, [`lowerarm${w}`, `wrist${w}`]],
      [`${s}_Hand`, [`wrist${w}`, null]],
      [`${s}_Thigh`, [`upperleg${w}`, `lowerleg${w}`]],
      [`${s}_Calf`, [`lowerleg${w}`, `foot${w}`]],
      [`${s}_Foot`, [`foot${w}`, `toes${w}`]],
      [`${s}_ToeBase`, [`toes${w}`, null]],
    ]),
  ),
};

/** The Tripo child whose posed position measures a main joint's own bone length. */
export const MAIN_CHILD = {
  Spine01: 'Spine02',
  Spine02: 'NeckTwist01',
  NeckTwist01: 'Head',
  ...Object.fromEntries(
    SIDES.flatMap(([s]) => [
      [`${s}_Clavicle`, `${s}_Upperarm`],
      [`${s}_Upperarm`, `${s}_Forearm`],
      [`${s}_Forearm`, `${s}_Hand`],
      [`${s}_Thigh`, `${s}_Calf`],
      [`${s}_Calf`, `${s}_Foot`],
      [`${s}_Foot`, `${s}_ToeBase`],
    ]),
  ),
};

/** Apply S = s (I + (k - 1) d d^T) to v. */
export function stretch(v, s, k, d) {
  if (!d || k === 1) return scale(v, s);
  return scale(add(v, scale(d, dot(v, d) * (k - 1))), s);
}

/**
 * Build every Tripo joint's frame.
 * joints: [{ name, parent, pos }] top-down (faced rest positions).
 * woc: Map(wocJointName -> rest-world position) of the target base.
 * Returns { frames (aligned to joints), fitScale }.
 */
export function conformFrames(joints, woc) {
  const byName = new Map(joints.map((j, i) => [j.name, i]));
  const align = new Map();
  for (const [t, [w, wc]] of Object.entries(MAIN_JOINTS)) {
    if (!wc || !MAIN_CHILD[t]) continue;
    align.set(t, { child: MAIN_CHILD[t], dir: sub(woc.get(wc), woc.get(w)) });
  }
  const pose = poseSkeleton(joints, align);
  const span = (a, b) => len(sub(pose.pos[byName.get(a)], pose.pos[byName.get(b)]));
  const wspan = (a, b) => len(sub(woc.get(a), woc.get(b)));
  // The uniform fit: hip-to-ankle, so the legs carry the WOC hips track to the ground.
  const s =
    (wspan('upperleg.l', 'foot.l') + wspan('upperleg.r', 'foot.r')) /
    (span('L_Thigh', 'L_Foot') + span('R_Thigh', 'R_Foot'));
  const frames = new Array(joints.length);
  for (let i = 0; i < joints.length; i++) {
    const t = joints[i].name;
    const main = MAIN_JOINTS[t];
    if (!main) continue;
    const [w, wc] = main;
    let k = 1;
    let d = null;
    if (wc && MAIN_CHILD[t]) {
      d = norm(sub(woc.get(wc), woc.get(w)));
      const tl = span(t, MAIN_CHILD[t]) * s;
      k = tl > 1e-9 ? wspan(wc, w) / tl : 1;
    }
    frames[i] = { O: woc.get(w), R: pose.rot[i], s, k, d, P: joints[i].pos };
  }
  const hip = byName.get('Hip');
  for (let i = 0; i < joints.length; i++) {
    if (frames[i]) continue;
    let a = joints[i].parent;
    while (a >= 0 && !MAIN_JOINTS[joints[a].name]) a = joints[a].parent;
    frames[i] = frames[a >= 0 ? a : hip];
  }
  return { frames, fitScale: s };
}

/** A point carried by one frame. */
export function applyFrame(f, x) {
  return add(f.O, stretch(qrot(f.R, sub(x, f.P)), f.s, f.k, f.d));
}

/** Linear-blend a vertex (and its normal, rotation only) through its influences' frames;
 *  `idx` index into `frames`. */
export function conformVertex(v, n, idx, wts, frames) {
  let out = [0, 0, 0];
  let nout = [0, 0, 0];
  let sum = 0;
  for (let k = 0; k < idx.length; k++) {
    const w = wts[k];
    if (!w) continue;
    const f = frames[idx[k]];
    out = add(out, scale(applyFrame(f, v), w));
    if (n) nout = add(nout, scale(qrot(f.R, n), w));
    sum += w;
  }
  if (sum <= 0) return { v: [...v], n: n ? [...n] : null };
  return { v: scale(out, 1 / sum), n: n ? norm(nout) : null };
}
