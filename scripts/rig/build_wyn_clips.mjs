// The WYN-H1 clip library, P0 (docs/design/wyndlewood-rig.md): Idle, Walk and Run authored
// from scratch as analytic key poses on the WYN-H1 skeleton (identity rest rotations, so
// every rotation below reads in the world axes: +x the body's left, +y up, +z forward). No
// clip samples another rig's animation. The gaits are in place (the engine moves the body);
// the printed walkRef/runRef are the world speeds at which each cycle's planted foot keeps
// pace with the ground, for the VisualDef's cadence matching.
//
// usage: node scripts/rig/build_wyn_clips.mjs --rig <wyn base.glb> --out <anims.glb>
//          [--height <world units the body is drawn at>]
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { deg, qSeq, qx, qy, qz } from './wyn_math.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const src = await io.read(opt('rig'));
const joints = src.getRoot().listSkins()[0].listJoints();
const rest = new Map(joints.map((j) => [j.getName(), j.getTranslation()]));
const jw = new Map(joints.map((j) => [j.getName(), j.getWorldTranslation()]));
const H = Math.max(...[...jw.values()].map((p) => p[1])) / 0.88; // crown ~ head joint / 0.88
const legLen = jw.get('upperleg.l')[1] - jw.get('foot.l')[1];

// the clip skeleton: the same joint tree, no mesh
const out = new Document();
const buf = out.createBuffer();
const node = new Map();
const parentOf = (j) => joints.find((p) => p.listChildren().includes(j)) ?? null;
const rigRoot = out.createNode('WYN_H1');
for (const j of joints) {
  node.set(
    j.getName(),
    out.createNode(j.getName()).setTranslation(j.getTranslation()).setRotation(j.getRotation()),
  );
}
for (const j of joints) {
  const p = parentOf(j);
  (p ? node.get(p.getName()) : rigRoot).addChild(node.get(j.getName()));
}
out.createScene('WYN_H1').addChild(rigRoot);

const FPS = 30;
const TAU = Math.PI * 2;
const wrap = (p) => p - Math.floor(p);
const bump = (p, c, w) => {
  let d = Math.abs(wrap(p) - c);
  d = Math.min(d, 1 - d);
  return Math.exp(-((d / w) ** 2));
};

/** Bake a looping clip: pose(phase) -> { joint: { r?: quat, t?: vec3 } }. */
function bake(name, seconds, pose) {
  const n = Math.round(seconds * FPS);
  const times = [];
  const frames = [];
  for (let i = 0; i <= n; i++) {
    times.push((i / n) * seconds);
    frames.push(pose(i === n ? 0 : i / n));
  }
  const anim = out.createAnimation(name);
  const input = out
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Float32Array(times))
    .setBuffer(buf);
  const keys = new Set(frames.flatMap((f) => Object.keys(f)));
  for (const jn of keys) {
    for (const path of ['r', 't']) {
      if (!frames[0][jn]?.[path]) continue;
      const output = out
        .createAccessor()
        .setType(path === 'r' ? 'VEC4' : 'VEC3')
        .setArray(new Float32Array(frames.flatMap((f) => f[jn][path])))
        .setBuffer(buf);
      const sampler = out
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation('LINEAR');
      anim.addSampler(sampler);
      anim.addChannel(
        out
          .createAnimationChannel()
          .setTargetNode(node.get(jn))
          .setTargetPath(path === 'r' ? 'rotation' : 'translation')
          .setSampler(sampler),
      );
    }
  }
  return anim;
}

const add3 = (a, b) => a.map((v, i) => v + b[i]);

/** The shared body: legs, arms and torso from per-side gait values (degrees). */
function body(g) {
  const leg = (thigh, knee, foot, toe) => ({
    upper: qx(deg(-thigh)),
    lower: qx(deg(knee)),
    // the foot's world pitch is thigh + knee + its own: solve its own for the wanted pitch
    foot: qx(deg(foot + thigh - knee)),
    toes: qx(deg(-toe)),
  });
  const L = leg(g.thighL, g.kneeL, g.footL, g.toeL);
  const R = leg(g.thighR, g.kneeR, g.footR, g.toeR);
  return {
    hips: { t: add3(rest.get('hips'), g.hipT), r: qSeq(qz(deg(g.hipRoll)), qy(deg(g.hipYaw))) },
    spine: { r: qSeq(qx(deg(g.lean * 0.4 + g.breath * 0.3)), qy(deg(g.chestYaw * 0.4))) },
    chest: { r: qSeq(qx(deg(g.lean * 0.6 - g.breath)), qy(deg(g.chestYaw * 0.6))) },
    neck: { r: qx(deg(-g.lean * 0.5 + g.headPitch * 0.4)) },
    head: {
      r: qSeq(
        qx(deg(-g.lean * 0.4 + g.headPitch * 0.6)),
        qy(deg(g.headYaw - (g.hipYaw + g.chestYaw) * 0.8)),
      ),
    },
    'upperleg.l': { r: L.upper },
    'lowerleg.l': { r: L.lower },
    'foot.l': { r: L.foot },
    'toes.l': { r: L.toes },
    'upperleg.r': { r: R.upper },
    'lowerleg.r': { r: R.lower },
    'foot.r': { r: R.foot },
    'toes.r': { r: R.toes },
    'clavicle.l': { r: qz(deg(-3 - g.breath * 0.5)) },
    'clavicle.r': { r: qz(deg(3 + g.breath * 0.5)) },
    // the arm comes down out of the bind T-pose first, then swings in the parent frame
    'upperarm.l': { r: qSeq(qz(deg(-g.hang)), qy(deg(-6)), qx(deg(-g.armL))) },
    'upperarm.r': { r: qSeq(qz(deg(g.hang)), qy(deg(6)), qx(deg(-g.armR))) },
    'lowerarm.l': { r: qy(deg(-g.elbowL)) },
    'lowerarm.r': { r: qy(deg(g.elbowR)) },
    'wrist.l': { r: qz(deg(-6)) },
    'wrist.r': { r: qz(deg(6)) },
  };
}

// Idle: weight settles over a slow breath, the head drifts
const IDLE_S = 3.2;
bake('Idle', IDLE_S, (p) => {
  const b = Math.sin(TAU * p);
  const sway = Math.sin(TAU * p + 0.6);
  return body({
    thighL: 1.5,
    thighR: -1,
    kneeL: 3,
    kneeR: 2,
    footL: 0,
    footR: 0,
    toeL: 0,
    toeR: 0,
    armL: 2 + b * 0.8,
    armR: 2 + b * 0.8,
    elbowL: 12 + b,
    elbowR: 12 + b,
    hang: 76,
    hipT: [sway * 0.004 * H, -0.004 * H + b * 0.0015 * H, 0],
    hipYaw: sway * 1.5,
    hipRoll: sway * 1.2,
    lean: 1,
    chestYaw: -sway,
    breath: b * 1.4,
    headYaw: Math.sin(TAU * p) * 4,
    headPitch: Math.sin(TAU * p * 2) * 1,
  });
});

// the gait generator: thigh swing, knee flex peaking early in the swing, a foot that strikes
// heel first and rolls off the toe, counter-swinging arms, a two-beat hip bob
function gait(G) {
  return (p) => {
    const side = (q) => {
      const f = G.A * Math.sin(TAU * q);
      const k =
        G.Kswing * Math.max(0, Math.cos(TAU * (q + 0.07))) ** 2 + G.Kstance * bump(q, 0.5, 0.12);
      const foot =
        G.toeOff * bump(q, 0.78, 0.07) - G.heel * bump(q, 0.25, 0.06) - 6 * bump(q, 0.95, 0.1);
      return { f, k, foot, toe: G.toeOff * 0.8 * bump(q, 0.78, 0.07) };
    };
    const l = side(p);
    const r = side(p + 0.5);
    const s = G.arm * Math.sin(TAU * (p + 0.5));
    return body({
      thighL: l.f,
      thighR: r.f,
      kneeL: l.k,
      kneeR: r.k,
      footL: l.foot,
      footR: r.foot,
      toeL: l.toe,
      toeR: r.toe,
      armL: s,
      armR: -s,
      elbowL: G.elbow + G.elbowSwing * Math.max(0, s / G.arm),
      elbowR: G.elbow + G.elbowSwing * Math.max(0, -s / G.arm),
      hang: G.hang,
      hipT: [0, (G.low ? -1 : 1) * G.bob * Math.cos(2 * TAU * p) - G.bob, 0],
      hipYaw: G.yaw * Math.sin(TAU * p),
      hipRoll: 1.5 * Math.sin(TAU * p + Math.PI / 2),
      lean: G.lean,
      chestYaw: -G.yaw * 1.3 * Math.sin(TAU * p),
      breath: 0,
      headYaw: 0,
      headPitch: 0,
    });
  };
}
const WALK = {
  seconds: 1.04,
  A: 22,
  Kswing: 58,
  Kstance: 8,
  arm: 16,
  elbow: 14,
  elbowSwing: 10,
  hang: 78,
  bob: 0.008 * H,
  lean: 3,
  yaw: 5,
  toeOff: 24,
  heel: 10,
  low: false,
};
const RUN = {
  seconds: 0.64,
  A: 40,
  Kswing: 100,
  Kstance: 22,
  arm: 34,
  elbow: 78,
  elbowSwing: 14,
  hang: 72,
  bob: 0.018 * H,
  lean: 11,
  yaw: 8,
  toeOff: 30,
  heel: 6,
  low: true,
};
bake('Walk', WALK.seconds, gait(WALK));
bake('Run', RUN.seconds, gait(RUN));

// the in-place stride speeds: the planted foot sweeps 2 * legLen * sin(A) every half cycle
const scale = Number(opt('height', '2.86')) / H;
const speed = (g) => ((4 * legLen * Math.sin(deg(g.A))) / g.seconds) * scale;
await new NodeIO().write(opt('out'), out);
console.log(
  JSON.stringify({
    out: opt('out'),
    clips: ['Idle', 'Walk', 'Run'],
    walkRef: +speed(WALK).toFixed(2),
    runRef: +speed(RUN).toFixed(2),
  }),
);
