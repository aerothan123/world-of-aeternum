// Rewrites a shipped (web-optimized) GLB into a plain glTF 2.0 binary that a
// desktop engine importer reads without extensions: meshopt buffers decoded,
// quantized attributes expanded to float, KTX2 (basis) and WebP textures
// decoded to PNG. Geometry, materials, node transforms and UVs are otherwise
// untouched, so the model is the same one the client draws.
//
// KTX2 is transcoded with the client's own vendored basis transcoder
// (public/basis/basis_transcoder.*, the same build the game ships), so no
// external tool is needed (scripts/assets/wolf_rig/to_blender.mjs needs `ktx`).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { type Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

/** The web-delivery extensions this pass removes. */
export const WEB_ONLY_EXTENSIONS = [
  'EXT_meshopt_compression',
  'KHR_mesh_quantization',
  'KHR_texture_basisu',
  'EXT_texture_webp',
] as const;

interface BasisKtx2File {
  isValid(): boolean;
  getWidth(): number;
  getHeight(): number;
  startTranscoding(): boolean;
  getImageTranscodedSizeInBytes(level: number, layer: number, face: number, fmt: number): number;
  transcodeImage(
    dst: Uint8Array,
    level: number,
    layer: number,
    face: number,
    fmt: number,
    flags: number,
    channel0: number,
    channel1: number,
  ): boolean;
  close(): void;
  delete(): void;
}
interface BasisModule {
  initializeBasis(): void;
  KTX2File: new (data: Uint8Array) => BasisKtx2File;
}

/** basis_universal transcoder_texture_format cTFRGBA32 */
const TF_RGBA32 = 13;

let basis: Promise<BasisModule> | null = null;
function basisModule(repo: string): Promise<BasisModule> {
  if (!basis) {
    const dir = path.join(repo, 'public/basis');
    // The transcoder is an Emscripten CommonJS bundle, but it sits under the
    // repo's "type": "module" package scope, where require() would load it as
    // ESM and get no export: wrap it as the CommonJS function it is.
    const source = fs.readFileSync(path.join(dir, 'basis_transcoder.js'), 'utf8');
    const cjs = { exports: {} as unknown };
    const file = path.join(dir, 'basis_transcoder.js');
    vm.runInThisContext(
      `(function (module, exports, require, __filename, __dirname) {\n${source}\n})`,
    )(cjs, cjs.exports, createRequire(file), file, dir);
    const factory = cjs.exports as (opts: { wasmBinary: Uint8Array }) => Promise<BasisModule>;
    basis = factory({ wasmBinary: fs.readFileSync(path.join(dir, 'basis_transcoder.wasm')) }).then(
      (m) => {
        m.initializeBasis();
        return m;
      },
    );
  }
  return basis;
}

/** Decode one KTX2 (basis) image to PNG bytes. */
export async function ktx2ToPng(repo: string, ktx2: Uint8Array): Promise<Uint8Array> {
  const m = await basisModule(repo);
  const file = new m.KTX2File(ktx2);
  try {
    if (!file.isValid() || !file.startTranscoding()) throw new Error('invalid KTX2 image');
    const w = file.getWidth();
    const h = file.getHeight();
    const out = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, TF_RGBA32));
    if (!file.transcodeImage(out, 0, 0, 0, TF_RGBA32, 0, -1, -1))
      throw new Error('KTX2 transcode failed');
    return new Uint8Array(
      await sharp(out, { raw: { width: w, height: h, channels: 4 } })
        .png()
        .toBuffer(),
    );
  } finally {
    file.close();
    file.delete();
  }
}

let io: Promise<NodeIO> | null = null;
function nodeIO(): Promise<NodeIO> {
  if (!io) {
    io = MeshoptDecoder.ready.then(() =>
      new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }),
    );
  }
  return io;
}

/** Strip the web-delivery extensions from a parsed document in place. */
export async function toEngineDocument(repo: string, doc: Document): Promise<void> {
  for (const tex of doc.getRoot().listTextures()) {
    const mime = tex.getMimeType();
    const image = tex.getImage();
    if (!image) continue;
    if (mime === 'image/ktx2') tex.setImage(await ktx2ToPng(repo, image));
    else if (mime === 'image/webp')
      tex.setImage(new Uint8Array(await sharp(image).png().toBuffer()));
    else continue;
    tex.setMimeType('image/png');
    const uri = tex.getURI();
    if (uri) tex.setURI(uri.replace(/\.(ktx2|webp)$/i, '.png'));
  }
  await doc.transform(dequantize());
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if ((WEB_ONLY_EXTENSIONS as readonly string[]).includes(ext.extensionName)) ext.dispose();
  }
}

/** Read a shipped GLB and return the engine-ready GLB bytes plus the
 *  extensions it still declares. */
export async function engineGlb(
  repo: string,
  glb: Uint8Array,
): Promise<{ bytes: Uint8Array; extensionsUsed: string[] }> {
  const reader = await nodeIO();
  const doc = await reader.readBinary(glb);
  await toEngineDocument(repo, doc);
  const bytes = await reader.writeBinary(doc);
  return {
    bytes,
    extensionsUsed: doc
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName),
  };
}
