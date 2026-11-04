// libktx (KTX-Software 4.4.2 Web build, wasm) for node: decode a KTX2 to RGBA levels and
// encode RGBA levels to KTX2 (UASTC + zstd or ETC1S/BasisLZ), the same library the ktx CLI
// wraps, for a host without the CLI (ktx_encode.mjs). KTX_WEB_DIR names the directory holding
// libktx.js and libktx.wasm from the release's KTX-Software-4.4.2-Web-libktx.zip; the default
// is tmp/ktx-web under the repo root. Every file this writes carries a KTXwriter value naming
// the paint pass (PAINTED_WRITER), which produce.mjs reads to refuse a second pass.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WEB = process.env.KTX_WEB_DIR ?? path.join(ROOT, 'tmp', 'ktx-web');
export const PAINTED_WRITER = 'libktx 4.4.2 (wasm) woc painted characters';
let mod = null;
export async function ktx() {
  if (mod) return mod;
  const require = createRequire(import.meta.url);
  const createKtxModule = require(path.join(WEB, 'libktx.js'));
  const wasmBinary = fs.readFileSync(path.join(WEB, 'libktx.wasm'));
  mod = await createKtxModule({ wasmBinary });
  return mod;
}

/** Decode every mip level of a KTX2 (basis) file to RGBA8. */
export async function decodeKtx2(bytes) {
  const k = await ktx();
  const t = new k.texture(new Uint8Array(bytes));
  const w = t.baseWidth;
  const h = t.baseHeight;
  const srgb = t.isSrgb;
  const writerKv = t.findKeyValue(k.WRITER_KEY);
  const writer = writerKv ? Buffer.from(writerKv).toString('utf8').replace(/\0+$/, '') : '';
  if (t.needsTranscoding) {
    const r = t.transcodeBasis(k.transcode_fmt.RGBA32, 0);
    if (r !== k.error_code.SUCCESS) throw new Error(`transcode failed ${r.value ?? r}`);
  }
  const levels = [];
  for (let l = 0; ; l++) {
    const lw = Math.max(1, w >> l);
    const lh = Math.max(1, h >> l);
    const img = t.getImage(l, 0, 0);
    if (!img) break;
    levels.push({ width: lw, height: lh, data: Buffer.from(img.slice(0, lw * lh * 4)) });
    if (lw === 1 && lh === 1) break;
  }
  t.delete();
  return { width: w, height: h, srgb, levels, writer };
}

/** Encode RGBA8 levels (level 0 first, each half the last) to a KTX2.
 *  opts: { srgb, codec: 'uastc'|'etc1s', rdo, qlevel, clevel } */
export async function encodeKtx2(levels, opts) {
  const k = await ktx();
  const ci = new k.textureCreateInfo();
  ci.vkFormat = opts.srgb ? k.VkFormat.R8G8B8A8_SRGB : k.VkFormat.R8G8B8A8_UNORM;
  ci.baseWidth = levels[0].width;
  ci.baseHeight = levels[0].height;
  ci.baseDepth = 1;
  ci.numDimensions = 2;
  ci.numLevels = levels.length;
  ci.numLayers = 1;
  ci.numFaces = 1;
  ci.isArray = false;
  ci.generateMipmaps = false;
  const t = new k.texture(ci, k.TextureCreateStorageEnum.ALLOC_STORAGE);
  levels.forEach((lv, i) => {
    const r = t.setImageFromMemory(i, 0, 0, new Uint8Array(lv.data));
    if (r !== k.error_code.SUCCESS) throw new Error(`setImage ${i} failed`);
  });
  t.oetf = opts.srgb ? k.khr_df_transfer.SRGB : k.khr_df_transfer.LINEAR;
  t.primaries = k.khr_df_primaries.BT709;
  const bp = new k.basisParams();
  bp.noSSE = true;
  bp.threadCount = 1;
  if (opts.codec === 'uastc') {
    bp.uastc = true;
    bp.uastcFlags = k.pack_uastc_flag_bits.LEVEL_DEFAULT.value ?? 2;
    if (opts.rdo) {
      bp.uastcRDO = true;
      bp.uastcRDOQualityScalar = opts.rdo;
    }
  } else {
    bp.uastc = false;
    bp.compressionLevel = opts.clevel ?? 1;
    bp.qualityLevel = opts.qlevel ?? 128;
  }
  let r = t.compressBasis(bp);
  if (r !== k.error_code.SUCCESS) throw new Error(`compressBasis failed`);
  if (opts.codec === 'uastc') {
    r = t.deflateZstd(18);
    if (r !== k.error_code.SUCCESS) throw new Error(`zstd failed`);
  }
  t.addKVPairString(k.WRITER_KEY, PAINTED_WRITER);
  const out = Buffer.from(t.writeToMemory());
  t.delete();
  return out;
}
