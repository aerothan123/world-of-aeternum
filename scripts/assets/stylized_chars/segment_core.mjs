// Cut a conformed, WOC-weighted body into the WOC armor slots (pure, no IO).
//
// A Tripo dressed model is ONE mesh. A modular kit needs one piece per manifest armor slot
// (woc_character_manifest.ts armorSlots) and the bare body cut the same way, so a worn piece
// can hide exactly the body region it covers (appearance slots `body_<slot>`, hidden through
// the item's hidesAppearance). The cut follows the skin: a vertex belongs to the region of
// its heaviest WOC joint, the lower leg splits at the boot line (a fraction of the knee to
// ankle span) so boots are the feet slot, and a triangle goes where most of its corners go.
// Cutting every model of a fit by the same rule on the same skeleton is what makes a plate
// chest sit beside a leather sleeve.

/** Region (manifest armor slot, or `head` for the face) of each WOC joint. */
export const JOINT_REGION = {
  root: 'waist',
  hips: 'waist',
  'skirt.front.l': 'waist',
  'skirt.front.r': 'waist',
  'skirt.back.l': 'waist',
  'skirt.back.r': 'waist',
  'tassel.side.l': 'waist',
  'tassel.side.r': 'waist',
  spine: 'chest',
  chest: 'chest',
  'clavicle.l': 'chest',
  'clavicle.r': 'chest',
  neck: 'head',
  head: 'head',
  'upperarm.l': 'arms',
  'upperarm.r': 'arms',
  'armor_shoulder.l': 'arms',
  'armor_shoulder.r': 'arms',
  'lowerarm.l': 'hands',
  'lowerarm.r': 'hands',
  'wrist.l': 'hands',
  'wrist.r': 'hands',
  'hand.l': 'hands',
  'hand.r': 'hands',
  'handslot.l': 'hands',
  'handslot.r': 'hands',
  'upperleg.l': 'legs',
  'upperleg.r': 'legs',
  'lowerleg.l': 'legs',
  'lowerleg.r': 'legs',
  'foot.l': 'feet',
  'foot.r': 'feet',
  'toes.l': 'feet',
  'toes.r': 'feet',
};

/** Every region in a fixed order (the order pieces are written in). */
export const REGIONS = ['head', 'chest', 'arms', 'hands', 'waist', 'legs', 'feet'];

/** Below this share of the knee-to-ankle span a lower-leg vertex is boot (feet). */
export const BOOT_LINE = 0.45;

/**
 * The region of one vertex.
 * jointNames: WOC joint names by index; idx/wts its WOC influences; p its position;
 * knee/ankle: Map side -> position of lowerleg/foot joints ({ l, r }).
 */
export function vertexRegion(jointNames, idx, wts, p, knee, ankle) {
  let best = -1;
  let bw = -1;
  for (let k = 0; k < idx.length; k++) {
    if (wts[k] > bw) {
      bw = wts[k];
      best = idx[k];
    }
  }
  const name = jointNames[best] ?? 'hips';
  const region = JOINT_REGION[name] ?? 'waist';
  if (name === 'lowerleg.l' || name === 'lowerleg.r') {
    const side = name.endsWith('.l') ? 'l' : 'r';
    const a = knee[side];
    const b = ankle[side];
    const span = a[1] - b[1];
    const t = span > 1e-9 ? (a[1] - p[1]) / span : 0;
    if (t > BOOT_LINE) return 'feet';
  }
  return region;
}

/** A triangle's region: the majority of its corners, the first corner on a three-way tie. */
export function triangleRegion(r0, r1, r2) {
  if (r1 === r2) return r1;
  return r0;
}

/**
 * Split an indexed triangle list by per-vertex region. Returns Map(region -> {
 * vertices: original vertex indices kept, indices: triangle indices into that list }).
 * `keep(region)` filters regions (null keeps all).
 */
export function splitByRegion(indices, regions, keep = null) {
  const out = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    const r = triangleRegion(regions[a], regions[b], regions[c]);
    if (keep && !keep(r)) continue;
    let piece = out.get(r);
    if (!piece) {
      piece = { remap: new Map(), vertices: [], indices: [] };
      out.set(r, piece);
    }
    for (const v of [a, b, c]) {
      let n = piece.remap.get(v);
      if (n === undefined) {
        n = piece.vertices.length;
        piece.remap.set(v, n);
        piece.vertices.push(v);
      }
      piece.indices.push(n);
    }
  }
  for (const piece of out.values()) delete piece.remap;
  return out;
}
