// Raw GLB read/write: JSON chunk + BIN chunk. Replacing an image rewrites ONLY that image's
// bytes; every other byte of the BIN is kept and every buffer-0 offset after a replaced image
// (bufferViews and their EXT_meshopt_compression sources) shifts by the size change (kept a
// multiple of 4, so every alignment holds). Geometry, skins, clips and WOC_lod stay byte-identical.
import fs from 'node:fs';

export function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not glb');
  let off = 12;
  let json = null;
  let bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off);
    const type = b.readUInt32LE(off + 4);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + len;
  }
  return { json, bin };
}

export function imageBytes(glb, i) {
  const img = glb.json.images[i];
  const bv = glb.json.bufferViews[img.bufferView];
  return glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
}

const pad4 = (n) => (n + 3) & ~3;

export function writeGlb(glb, replace, file) {
  const json = structuredClone(glb.json);
  const edits = [];
  for (const [i, bytes] of replace) {
    const bv = json.bufferViews[json.images[i].bufferView];
    if ((bv.buffer ?? 0) !== 0) throw new Error('image outside buffer 0');
    const start = bv.byteOffset ?? 0;
    edits.push({ start, oldSlot: pad4(bv.byteLength), bytes, bv });
  }
  edits.sort((a, b) => a.start - b.start);
  const parts = [];
  let cursor = 0;
  const shifts = []; // [oldEnd, cumulativeDelta]
  let delta = 0;
  for (const e of edits) {
    parts.push(glb.bin.subarray(cursor, e.start));
    const slot = pad4(e.bytes.length);
    parts.push(e.bytes, Buffer.alloc(slot - e.bytes.length));
    cursor = e.start + e.oldSlot;
    delta += slot - e.oldSlot;
    shifts.push([cursor, delta, e]);
  }
  parts.push(glb.bin.subarray(cursor));
  const bin = Buffer.concat(parts);
  const shift = (off) => {
    let d = 0;
    for (const [end, cum] of shifts) if (off >= end) d = cum;
    return off + d;
  };
  const replacedViews = new Set(edits.map((e) => e.bv));
  for (const e of edits) {
    e.bv.byteOffset = shift(e.start);
    e.bv.byteLength = e.bytes.length;
  }
  for (const bv of json.bufferViews) {
    if (replacedViews.has(bv)) continue;
    if ((bv.buffer ?? 0) === 0) bv.byteOffset = shift(bv.byteOffset ?? 0);
    const mo = bv.extensions?.EXT_meshopt_compression;
    if (mo && (mo.buffer ?? 0) === 0) mo.byteOffset = shift(mo.byteOffset ?? 0);
  }
  json.buffers[0].byteLength = bin.length;
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]);
  const binP = Buffer.concat([bin, Buffer.alloc(pad4(bin.length) - bin.length)]);
  const h = Buffer.alloc(12);
  h.writeUInt32LE(0x46546c67, 0);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(js.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binP.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([h, jh, js, bh, binP]));
}
