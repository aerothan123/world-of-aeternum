import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';

// Reviewed Blender reductions, shipped with meshopt and 512px KTX2 textures.
// Bounds are pinned to release/v0.44.0, not computed from the replacement.
const ASSETS = [
  {
    file: 'quest/supply_crate',
    sha256: 'dfb220bc3b93d7ed962639a102b05d597be4c0596ea7a0a6cd021fb1fd891d56',
    triangles: 2311,
    byteCap: 330000,
    min: [-0.949722, -0.663891, -0.605672],
    max: [0.947787, 0.665588, 0.603818],
    normal: true,
    textures: [
      '5c5fcb2c54e104f24d5e7813b00b0ccc3eb055aced2286ca8e6f2142bd75e3b9',
      '87283a4934ba4dc8121cd4c0f0bff40e2aa7ccad3e8737cf913a2b5ed9bf0742',
    ],
  },
  {
    file: 'quest/weathered_ledger_page',
    sha256: '4c86be654583ec1b80cc88155dc329ecb3770d91e749f33c97e3da8da6593e5f',
    triangles: 4413,
    byteCap: 110000,
    min: [-0.950768, -0.61745, -0.145558],
    max: [0.947218, 0.619452, 0.141048],
    normal: false,
    textures: ['df21b4cca017258c4258dfc9d85d1933082e180f79be6d6c1b17d641f2262433'],
  },
  {
    file: 'quest/gravecaller_sigil',
    sha256: '560b9287dac9613856f87e7bba333b6799cbd35974e6831583061670175fa7af',
    triangles: 4364,
    byteCap: 125000,
    min: [-0.721574, -0.950755, -0.720308],
    max: [0.718498, 0.948646, 0.716518],
    normal: false,
    textures: ['6a6096f9b265af6ffd77e6df8b93df81f7fbf09a28d77280ed2d17c46a58f872'],
  },
];
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

beforeAll(async () => {
  await MeshoptDecoder.ready;
});

describe('Eastbrook and Tutorial Island optimized shipping assets', () => {
  it.each(ASSETS)(
    '$file preserves its reviewed geometry, shading and cache identity',
    async (asset) => {
      const rel = `models/${asset.file}.glb`;
      const file = path.join(__dirname, '..', 'public', rel);
      const bytes = readFileSync(file);
      expect(sha256(bytes)).toBe(asset.sha256);
      expect(bytes.length).toBeLessThanOrEqual(asset.byteCap);
      expect(MEDIA_ASSETS[rel]).toBe(
        `/media/models/${asset.file}.${asset.sha256.slice(0, 12)}.glb`,
      );
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      expect(json.extensionsRequired).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
      );
      expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');

      const doc = await io.read(file);
      const root = doc.getRoot();
      expect(root.listSkins()).toHaveLength(0);
      expect(root.listAnimations()).toHaveLength(0);
      expect(root.listMeshes()).toHaveLength(1);
      const primitives = root.listMeshes()[0].listPrimitives();
      expect(primitives).toHaveLength(1);
      const primitive = primitives[0];
      expect(primitive.getMode()).toBe(Primitive.Mode.TRIANGLES);
      const positions = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      assert(positions && indices);
      const indexArray = indices.getArray();
      assert(indexArray);
      expect(indices.getCount() / 3).toBe(asset.triangles);
      expect(Array.from(indexArray).every((i) => i >= 0 && i < positions.getCount())).toBe(true);
      for (const semantic of ['NORMAL', 'TEXCOORD_0']) {
        expect(primitive.getAttribute(semantic)?.getCount()).toBe(positions.getCount());
      }
      for (const semantic of primitive.listSemantics()) {
        const array = primitive.getAttribute(semantic)?.getArray();
        assert(array);
        expect(Array.from(array).every(Number.isFinite)).toBe(true);
      }
      expect(root.listScenes()).toHaveLength(1);
      const bounds = getBounds(root.listScenes()[0]);
      for (const bound of ['min', 'max'] as const) {
        asset[bound].forEach((value, axis) => {
          expect(Math.abs(bounds[bound][axis] - value)).toBeLessThan(0.002);
        });
      }

      const material = primitive.getMaterial();
      assert(material);
      expect(material.getBaseColorTexture()).not.toBeNull();
      expect(!!material.getNormalTexture()).toBe(asset.normal);
      expect(material.getDoubleSided()).toBe(true);
      expect(material.getMetallicFactor()).toBe(0);
      expect(material.getRoughnessFactor()).toBe(0.8);
      const textureHashes = root.listTextures().map((texture) => {
        expect(texture.getMimeType()).toBe('image/ktx2');
        expect(texture.getSize()).toEqual([512, 512]);
        const image = texture.getImage();
        assert(image);
        expect(Buffer.from(image).readUInt32LE(40)).toBe(10);
        return sha256(image);
      });
      // Two models reuse their original compressed images byte-for-byte. Only
      // the retopologized crate has a new color bake and tangent-space normal map.
      // (The three dead trees left this table when the storybook models
      // replaced them; tests/fable_foliage_fit.test.ts covers those files.)
      expect(textureHashes.sort()).toEqual([...asset.textures].sort());
    },
  );
});
