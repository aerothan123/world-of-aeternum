// Writes Unreal-importable copies of the game's creature and mount GLBs (the originals stay
// untouched) and measures the footfalls of every gait clip, for the W14 native client.
//  - Every non-humanoid model the creature export names (mobs, mounts) plus the ferry:
//    dequantized, meshopt and KTX2 stripped (textures transcoded to PNG with asset-convert's
//    scripts/unreal/ktx2_png.mjs), and the clips of the visual's extra animation files
//    (animUrls) merged onto the base by node name, so one skinned file carries the body
//    and every clip it plays.
//  - Footfalls: each gait clip (walk, run, walkBack and their library names) is played
//    through its rig by forward kinematics at 60 Hz; each foot (the lowest joint of each
//    leg chain, tails excluded) plants where its height reaches a local minimum near the
//    bottom of its travel. Times are seconds into the clip.
// Usage (cwd = worktree): node scripts/unreal/prep_creatures.mjs <creature_visuals.json> \
//   <ktx2_png.mjs> <publicModelsDir> <outDir> [--feet-only <extra.gltf|glb> ...]
// Writes <outDir>/<model>.glb and <outDir>/creature_prep.json.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const args = process.argv.slice(2);
const [exportPath, ktxModule, modelsDir, outDir] = args;
const feetOnly = args.includes('--feet-only') ? args.slice(args.indexOf('--feet-only') + 1) : [];
const { ktx2ToPngBuffer } = await import(pathToFileURL(path.resolve(ktxModule)).href);
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const exp = JSON.parse(fs.readFileSync(exportPath, 'utf8'));

// --- quaternion and matrix helpers (glTF order: column-major, quat x y z w) ---
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qrot(q, v) {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [p[0], p[1], p[2]];
}
function nlerp(a, b, t) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  const o = [0, 1, 2, 3].map((i) => a[i] * (1 - t) + b[i] * s * t);
  const l = Math.hypot(...o) || 1;
  return o.map((x) => x / l);
}

/** A sampler's value at time t (linear, step, or cubic spline's value term). */
function sample(input, output, size, interp, t) {
  const n = input.length;
  const cubic = interp === 'CUBICSPLINE';
  const at = (i) => {
    const base = cubic ? (i * 3 + 1) * size : i * size;
    return Array.from(output.slice(base, base + size));
  };
  if (t <= input[0]) return at(0);
  if (t >= input[n - 1]) return at(n - 1);
  let i = 0;
  while (i < n - 2 && input[i + 1] < t) i++;
  if (interp === 'STEP') return at(i);
  const u = (t - input[i]) / (input[i + 1] - input[i] || 1);
  const a = at(i);
  const b = at(i + 1);
  if (size === 4) return nlerp(a, b, u);
  return a.map((x, k) => x + (b[k] - x) * u);
}

/** World positions of the given joints at time t of an animation. */
function poseAt(doc, anim, joints, t) {
  const local = new Map();
  for (const n of doc.getRoot().listNodes()) {
    local.set(n, { t: n.getTranslation(), r: n.getRotation(), s: n.getScale() });
  }
  if (anim) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      const smp = ch.getSampler();
      if (!node || !smp) continue;
      const path = ch.getTargetPath();
      const size = path === 'rotation' ? 4 : 3;
      if (path === 'weights') continue;
      const v = sample(
        smp.getInput().getArray(),
        smp.getOutput().getArray(),
        size,
        smp.getInterpolation(),
        t,
      );
      const L = local.get(node);
      if (path === 'translation') L.t = v;
      else if (path === 'rotation') L.r = v;
      else if (path === 'scale') L.s = v;
    }
  }
  const world = new Map();
  const solve = (n) => {
    if (world.has(n)) return world.get(n);
    const L = local.get(n);
    const p = n.getParentNode();
    let W;
    if (!p) W = { t: L.t, r: L.r, s: L.s };
    else {
      const P = solve(p);
      const sc = [L.t[0] * P.s[0], L.t[1] * P.s[1], L.t[2] * P.s[2]];
      const rt = qrot(P.r, sc);
      W = {
        t: [P.t[0] + rt[0], P.t[1] + rt[1], P.t[2] + rt[2]],
        r: qmul(P.r, L.r),
        s: [P.s[0] * L.s[0], P.s[1] * L.s[1], P.s[2] * L.s[2]],
      };
    }
    world.set(n, W);
    return W;
  };
  return joints.map((j) => solve(j).t);
}

/** The feet of a rig: the deepest low joint of each leg chain, tails and wings excluded. */
function feetOf(doc) {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) return [];
  const joints = skin.listJoints();
  const rest = poseAt(doc, null, joints, 0);
  const ys = rest.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const band = lo + 0.15 * (hi - lo);
  const bad = /tail|wing|tongue|jaw|hair|ear|weapon|prop|ik|pole|target/i;
  const low = new Set(joints.filter((j, i) => rest[i][1] <= band && !bad.test(j.getName())));
  const feet = [];
  for (const j of low) {
    // keep the deepest: no low joint below it in its chain
    const hasLowChild = [...low].some((k) => {
      for (let p = k.getParentNode(); p; p = p.getParentNode()) if (p === j) return true;
      return false;
    });
    if (!hasLowChild) feet.push(j);
  }
  // collapse feet that sit in the same chain branch (two toes of one foot): keep the lowest per
  // first non-low ancestor
  const byLeg = new Map();
  for (const f of feet) {
    let a = f.getParentNode();
    while (a && low.has(a)) a = a.getParentNode();
    const i = joints.indexOf(f);
    const prev = byLeg.get(a);
    if (!prev || rest[i][1] < rest[joints.indexOf(prev)][1]) byLeg.set(a, f);
  }
  const out = [...byLeg.values()];
  const restOf = (f) => rest[joints.indexOf(f)];
  const quad = out.length >= 4;
  return out.map((f) => {
    const p = restOf(f);
    // glTF: a model faces +Z, its left is +X
    const side = p[0] >= 0 ? 'l' : 'r';
    const end = quad ? (p[2] >= 0 ? 'f' : 'b') : '';
    return { joint: f, name: f.getName(), label: end + side };
  });
}

/** Footfall times of one clip: per foot, the local minima of its height near the bottom. */
function footfalls(doc, anim, feet) {
  if (!anim || feet.length === 0) return [];
  let dur = 0;
  for (const s of anim.listSamplers()) {
    const a = s.getInput().getArray();
    dur = Math.max(dur, a[a.length - 1]);
  }
  if (dur <= 0.05) return [];
  const hz = 60;
  const steps = Math.max(2, Math.round(dur * hz));
  const track = feet.map(() => []);
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * dur;
    const ps = poseAt(
      doc,
      anim,
      feet.map((f) => f.joint),
      t,
    );
    ps.forEach((p, i) => track[i].push(p[1]));
  }
  const out = [];
  track.forEach((h, i) => {
    const lo = Math.min(...h);
    const hi = Math.max(...h);
    if (hi - lo < 1e-4) return; // a foot that never lifts (a slide, a hover) makes no step
    const near = lo + 0.3 * (hi - lo);
    let last = -1;
    for (let k = 0; k < h.length - 1; k++) {
      const prev = h[(k - 1 + h.length - 1) % (h.length - 1)];
      const next = h[k + 1];
      if (h[k] <= near && h[k] <= prev && h[k] < next) {
        const t = (k / steps) * dur;
        if (last < 0 || t - last > 0.15) {
          out.push({ t: Math.round(t * 1000) / 1000, foot: feet[i].label, joint: feet[i].name });
          last = t;
        }
      }
    }
  });
  return out.sort((a, b) => a.t - b.t);
}

function isGait(name) {
  return (
    /walk|run|jog|trot|gallop|sprint|canter|stride|gait/i.test(name) &&
    !/attack|hit|death/i.test(name)
  );
}

function stripCompression(doc) {
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (
      ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'].includes(
        ext.extensionName,
      )
    )
      ext.dispose();
  }
}

async function pngTextures(doc) {
  for (const t of doc.getRoot().listTextures()) {
    if (t.getMimeType() !== 'image/ktx2') continue;
    const r = await ktx2ToPngBuffer(t.getImage());
    t.setImage(new Uint8Array(r.png)).setMimeType('image/png');
    t.setURI(`${t.getName() || 'tex'}.png`);
  }
}

async function readDecoded(file) {
  const doc = await io.read(file);
  await doc.transform(dequantize());
  return doc;
}

/** Copies every clip of src onto base's nodes by name. */
function mergeClips(base, src) {
  const nodes = new Map(
    base
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const have = new Set(
    base
      .getRoot()
      .listAnimations()
      .map((a) => a.getName()),
  );
  const buf = base.getRoot().listBuffers()[0] ?? base.createBuffer();
  let n = 0;
  for (const a of src.getRoot().listAnimations()) {
    if (have.has(a.getName())) continue;
    const anim = base.createAnimation(a.getName());
    for (const ch of a.listChannels()) {
      const target = ch.getTargetNode() && nodes.get(ch.getTargetNode().getName());
      if (!target) continue;
      const s = ch.getSampler();
      const copy = (acc) =>
        base
          .createAccessor()
          .setType(acc.getType())
          .setArray(new Float32Array(acc.getArray()))
          .setBuffer(buf);
      const sampler = base
        .createAnimationSampler()
        .setInput(copy(s.getInput()))
        .setOutput(copy(s.getOutput()))
        .setInterpolation(s.getInterpolation());
      anim.addSampler(sampler);
      anim.addChannel(
        base
          .createAnimationChannel()
          .setTargetNode(target)
          .setTargetPath(ch.getTargetPath())
          .setSampler(sampler),
      );
    }
    n++;
  }
  return n;
}

const manifest = { models: {}, feet: {}, warnings: [] };

function measure(key, doc) {
  const feet = feetOf(doc);
  const clips = {};
  for (const a of doc.getRoot().listAnimations()) {
    if (!isGait(a.getName())) continue;
    clips[a.getName()] = footfalls(doc, a, feet);
  }
  manifest.feet[key] = { feet: feet.map((f) => ({ joint: f.name, foot: f.label })), clips };
}

// every non-humanoid model with its extra clip files
const models = new Map();
const add = (v) => {
  if (!v.model || v.humanoid) return;
  const prev = models.get(v.model) ?? new Set();
  for (const a of v.animModels ?? []) prev.add(a);
  models.set(v.model, prev);
};
for (const m of Object.values(exp.mobs)) add(m);
for (const m of Object.values(exp.mounts)) add(m);
for (const f of exp.ferries ?? []) if (!models.has(f.model)) models.set(f.model, new Set());

for (const [model, animSet] of [...models].sort((a, b) => a[0].localeCompare(b[0]))) {
  const file = path.join(modelsDir, `${model}.glb`);
  if (!fs.existsSync(file)) {
    manifest.warnings.push(`missing ${model}`);
    continue;
  }
  try {
    const doc = await readDecoded(file);
    let merged = 0;
    for (const a of animSet) {
      const af = path.join(modelsDir, `${a}.glb`);
      if (fs.existsSync(af)) merged += mergeClips(doc, await readDecoded(af));
      else manifest.warnings.push(`missing clips ${a} for ${model}`);
    }
    await pngTextures(doc);
    stripCompression(doc);
    await doc.transform(
      prune({ propertyTypes: ['Accessor', 'Mesh', 'Material', 'Texture'], keepAttributes: true }),
    );
    const skinned = doc.getRoot().listSkins().length > 0;
    const clips = doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName())
      .sort();
    const out = path.join(outDir, `${model}.glb`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await io.write(out, doc);
    manifest.models[model] = { skinned, clips, merged };
    if (skinned) measure(model, doc);
  } catch (e) {
    manifest.warnings.push(`failed ${model}: ${e.message}`);
  }
}

// the player avatars' prepped rigs (Quaternius, WOC): feet only, nothing written
for (const f of feetOnly) {
  try {
    const doc = await io.read(f);
    measure(`file:${path.basename(f, path.extname(f))}`, doc);
  } catch (e) {
    manifest.warnings.push(`failed feet ${f}: ${e.message}`);
  }
}

fs.writeFileSync(path.join(outDir, 'creature_prep.json'), `${JSON.stringify(manifest, null, 1)}\n`);
const n = Object.keys(manifest.models).length;
const sk = Object.values(manifest.models).filter((m) => m.skinned).length;
console.log(
  `PREP models=${n} skinned=${sk} feet=${Object.keys(manifest.feet).length} warnings=${manifest.warnings.length}`,
);
for (const w of manifest.warnings.slice(0, 20)) console.log(`WARN ${w}`);
