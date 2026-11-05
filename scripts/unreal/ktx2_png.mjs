// KTX2 (Basis) to PNG using the Basis transcoder that ships inside three.js. The emscripten file is a
// classic script, not a module: its node-only branch mixes __dirname/require with top-level await, which
// node rejects when sniffing the format. That branch is stripped (the web path works with an explicit
// wasmBinary) and the script is evaluated with vm. Run with cwd = worktree root.
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';

const BASIS_DIR = 'node_modules/three/examples/jsm/libs/basis';
let basisPromise = null;

export function loadBasis() {
  if (!basisPromise) {
    basisPromise = (async () => {
      const src = fs
        .readFileSync(`${BASIS_DIR}/basis_transcoder.js`, 'utf8')
        .replace('typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string"', 'false')
        .replaceAll('__dirname', '""')
        .replaceAll('require("fs")', 'null')
        .replaceAll('require("path")', 'null');
      vm.runInThisContext(`${src}\n;globalThis.BASIS = BASIS;`);
      const mod = await globalThis.BASIS({ wasmBinary: fs.readFileSync(`${BASIS_DIR}/basis_transcoder.wasm`) });
      mod.initializeBasis();
      return mod;
    })();
  }
  return basisPromise;
}

/** Returns { png: Buffer, w, h, mean: [r,g,b] } for a KTX2 byte buffer (RGBA32 transcode target). */
export async function ktx2ToPngBuffer(bytes) {
  const basis = await loadBasis();
  const f = new basis.KTX2File(new Uint8Array(bytes));
  try {
    if (!f.isValid()) throw new Error('invalid ktx2');
    if (!f.startTranscoding()) throw new Error('transcode start failed');
    const w = f.getWidth();
    const h = f.getHeight();
    const dst = new Uint8Array(f.getImageTranscodedSizeInBytes(0, 0, 0, 13));
    if (!f.transcodeImage(dst, 0, 0, 0, 13, 0, -1, -1)) throw new Error('transcode failed');
    const png = await sharp(Buffer.from(dst), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    const st = await sharp(png).stats();
    return { png, w, h, mean: st.channels.slice(0, 3).map((c) => Math.round(c.mean)) };
  } finally {
    f.close();
    f.delete();
  }
}
