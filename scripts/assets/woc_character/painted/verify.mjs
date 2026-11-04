// Every repainted GLB against its committed original: the JSON is identical but for the image
// buffer views' offsets and lengths, and every non-image buffer view holds the same bytes, so
// geometry, skin, clips, morphs and WOC_lod are untouched. Also loads each file with glTF-Transform.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { WocLodExtension } from '../woc_lod_extension.mjs';

// Usage: node scripts/assets/woc_character/painted/verify.mjs [git ref of the originals]
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const REF = process.argv[2] ?? 'HEAD';
const DIR = 'public/models/chars/players/woc';
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([...ALL_EXTENSIONS, WocLodExtension])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const parse = (b) => {
  let off = 12;
  let json;
  let bin;
  while (off < b.length) {
    const len = b.readUInt32LE(off);
    const type = b.readUInt32LE(off + 4);
    const d = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(d.toString('utf8'));
    else bin = d;
    off += 8 + len;
  }
  return { json, bin };
};
let bad = 0;
for (const f of fs
  .readdirSync(path.join(ROOT, DIR))
  .filter((f) => /^(base_|head_)/.test(f) && f.endsWith('.glb'))) {
  const rel = `${DIR}/${f}`;
  const now = fs.readFileSync(path.join(ROOT, rel));
  const was = execFileSync('git', ['-C', ROOT, 'show', `${REF}:${rel}`], { maxBuffer: 1 << 28 });
  if (Buffer.compare(now, was) === 0) {
    console.log('UNCHANGED', f);
    continue;
  }
  const a = parse(was);
  const b = parse(now);
  const imgViews = new Set(a.json.images.map((i) => i.bufferView));
  const strip = (j) => {
    const c = structuredClone(j);
    c.bufferViews = c.bufferViews.map((v, i) =>
      imgViews.has(i)
        ? { img: true }
        : {
            ...v,
            byteOffset: 0,
            extensions: v.extensions
              ? JSON.parse(JSON.stringify(v.extensions, (k, x) => (k === 'byteOffset' ? 0 : x)))
              : undefined,
          },
    );
    c.buffers = c.buffers.map((x, i) => (i === 0 ? {} : x));
    return JSON.stringify(c);
  };
  let ok = strip(a.json) === strip(b.json);
  const view = (g, v) => {
    const mo = v.extensions?.EXT_meshopt_compression;
    const parts = [];
    if ((v.buffer ?? 0) === 0)
      parts.push(g.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
    if (mo && (mo.buffer ?? 0) === 0)
      parts.push(g.bin.subarray(mo.byteOffset ?? 0, (mo.byteOffset ?? 0) + mo.byteLength));
    return Buffer.concat(parts);
  };
  a.json.bufferViews.forEach((v, i) => {
    if (imgViews.has(i)) return;
    if (Buffer.compare(view(a, v), view(b, b.json.bufferViews[i])) !== 0) ok = false;
  });
  try {
    await io.readBinary(new Uint8Array(now));
  } catch (e) {
    ok = false;
    console.log('LOADFAIL', f, e.message);
  }
  console.log(ok ? 'OK' : 'MISMATCH', f, was.length, '->', now.length);
  if (!ok) bad++;
}
console.log(bad ? `FAIL ${bad}` : 'ALL OK');
