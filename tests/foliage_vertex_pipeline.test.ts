import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FOLIAGE_TOWN_TREE_ASSETS,
  optimizeFoliageVertexDocument,
  primitiveTriangleAttributeFingerprint,
  triangleAttributeFingerprint,
} from '../scripts/assets/foliage_vertex_pipeline.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';

const ROOT = path.join(__dirname, '..');
const EXPECTED_ASSETS = [
  {
    path: 'models/foliage/pine_1.glb',
    inputSha256: 'd4a2c6e6f3d6fcc21a7fc93ae12ab1a3f76bf5747809051744827b3f73c6d23d',
    outputSha256: '1d13dc3096cad3ed601f4cbbcfd4b01bf10756973f2eab1d249d60233ad7b186',
    semanticSha256: '55d31eb650c377a5e2810dce1455ee053ac426de71248a1726e68454fa3bb633',
    vertices: 2_432,
    triangles: 2_599,
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: 'be1bcdc16f603ba763be099037a52de35d2493694e4ab69e7abc6197b72410b8',
    outputSha256: '431ae89330200d7d36bbff1438082ed575a944b9079f00338c7a63ea4f21cfd8',
    semanticSha256: '62b49e80aaddb6d27ce0328c3d4db584239f870f4d0402cbe2a9077435bee1d3',
    vertices: 4_989,
    triangles: 2_600,
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '2200cea8526463d295cc7a0185b04302fd6e7700a68c8a54454ce1c0c08beb58',
    outputSha256: 'e9cdd168e9a6c91ea33e78015ae62c74e97451524776962f65ab6d299ee9cb62',
    semanticSha256: '7ba75d5efc383a774f465e52f7c54756e252f0b742db4a8cb69c4d4ec590dc8c',
    vertices: 2_081,
    triangles: 2_599,
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: '704595b5b5ed17779fce6152c27b024a0b1a248634a0819ef71668caa8749603',
    outputSha256: 'e393bd6f8e3b6fbc6c00e1835419b3e6c5381c01910721835718ae8af7e4eac7',
    semanticSha256: 'c52e639b2b9ce8a8a5caf87d2f7702538c39b2cecba52e15e7efafffc58e7a02',
    vertices: 5_001,
    triangles: 2_599,
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: '8aa0acc0070e0dd675a288bd63850a0a1b60b5d39a687aed73bcfa4ef6ab6845',
    outputSha256: '7cd1f02a2475dfaf34bf5e41148da230de5a96ea5d2f36171685572ed26387fd',
    semanticSha256: 'b2a50f8b1aae9b40e98d4f3f135a9138fa67a41b6313457c585ef51414a2e4d5',
    vertices: 7_991,
    triangles: 4_093,
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: 'a79275e5e15581115c6c54c336ff440f5606ccd79cf51d4d390da38d486c6407',
    outputSha256: 'b7e37ddeaf908d3d0e4aa9c57d4a595d422d5074ef90cf7a6493f211e279a053',
    semanticSha256: 'a089b39da7fc14c4ff17625c7ea5b3af47b8e633d487d60f970a2b80796dc097',
    vertices: 7_315,
    triangles: 4_069,
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: 'c0d30375c98d3a2121df1f36903db92963000719403373a5ceada7de13a1b0bf',
    outputSha256: '6c4e939100d965c82031184adecbe5348108e2d6a5b818f2a9d483275d60803b',
    semanticSha256: '007fcae9d9d6cbbaf23a180b14f7baf6bd8ea7fb523595c681048c5a8202fec5',
    vertices: 7_731,
    triangles: 4_000,
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: 'dd7d24545425778992ab534c18bda5d51a3c29363170d58109e110c79b8cc155',
    outputSha256: '6adb814103bee67125c25c02da96cdb40f9d421626aa65e0b9662cdf977adaef',
    semanticSha256: '00e02f5870f7636b4911384754c414249a9ab351cee1982f4f0daf5dcf030d56',
    vertices: 7_056,
    triangles: 3_999,
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: '9aead0ec2e9054f0f21ba7af7d26bed8aaffd22ac0d9bcbae562ee54def08f70',
    outputSha256: '54b13ee9ab3d118cc54f61f89199c1d96fae9523389c87515fcd9a8727a0a4a2',
    semanticSha256: '2cc9a905ef552571f1d205177906d718b2d15c39e0449053bba89863adfadefe',
    vertices: 6_891,
    triangles: 4_000,
  },
] as const;

function vertexKey(
  primitive: ReturnType<Document['createPrimitive']>,
  vertexIndex: number,
): string {
  return primitive
    .listSemantics()
    .sort()
    .map((semantic) => {
      const accessor = primitive.getAttribute(semantic);
      if (!accessor) throw new Error(`missing ${semantic}`);
      const array = accessor.getArray();
      if (!array) throw new Error(`${semantic} has no array`);
      const byteLength = accessor.getElementSize() * array.BYTES_PER_ELEMENT;
      const byteOffset = array.byteOffset + vertexIndex * byteLength;
      const bytes = Buffer.from(array.buffer, byteOffset, byteLength).toString('hex');
      return `${semantic}:${accessor.getComponentType()}:${accessor.getNormalized()}:${bytes}`;
    })
    .join('|');
}

describe('foliage vertex pipeline', () => {
  let io: NodeIO;

  beforeAll(async () => {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  });

  it('preserves triangle winding and every corner attribute bit while welding', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
      .createAccessor('position')
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
      .setBuffer(buffer);
    const normal = document
      .createAccessor('normal')
      .setType('VEC3')
      .setNormalized(true)
      .setArray(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0]))
      .setBuffer(buffer);
    const indices = document
      .createAccessor('indices')
      .setType('SCALAR')
      .setArray(new Uint16Array([0, 1, 2, 3, 4, 5]))
      .setBuffer(buffer);
    const primitive = document
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setIndices(indices);
    document.createMesh().addPrimitive(primitive);

    const before = triangleAttributeFingerprint(document);
    await optimizeFoliageVertexDocument(document, MeshoptEncoder);

    expect(triangleAttributeFingerprint(document)).toBe(before);
    expect(primitive.getAttribute('POSITION')?.getCount()).toBe(4);
    expect(primitive.getIndices()?.getArray()).toBeInstanceOf(Uint16Array);
  });

  it('fingerprints one primitive by its winding and corner bytes, not by corner rotation', async () => {
    const document = await io.read(path.join(ROOT, 'public', 'models/foliage/pine_1.glb'));
    const leaves = document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .filter((primitive) => primitive.getMaterial()?.getName() === 'Leaves_Pine');
    expect(leaves).toHaveLength(1);
    const [leaf] = leaves;
    const pinned = 'bc364cbc6ff727e81555520f7141c05db0e2578eb63f4240af9d80d39a28b3ac';
    expect(primitiveTriangleAttributeFingerprint(leaf)).toBe(pinned);

    const indices = leaf.getIndices();
    const original = indices?.getArray()?.slice();
    if (!indices || !original) throw new Error('Leaves_Pine is not indexed');
    const [a, b, c] = original;
    expect(new Set([a, b, c]).size).toBe(3);
    const withFirstTriangle = (corners: readonly number[]) => {
      const edited = original.slice();
      edited.set(corners);
      indices.setArray(edited);
      return primitiveTriangleAttributeFingerprint(leaf);
    };
    expect(withFirstTriangle([b, c, a])).toBe(pinned);
    expect(withFirstTriangle([c, a, b])).toBe(pinned);
    expect(withFirstTriangle([a, c, b])).not.toBe(pinned);
    indices.setArray(original);
    expect(primitiveTriangleAttributeFingerprint(leaf)).toBe(pinned);

    for (const semantic of leaf.listSemantics()) {
      const accessor = leaf.getAttribute(semantic);
      const array = accessor?.getArray();
      if (!accessor || !array) throw new Error(`missing ${semantic}`);
      const edited = array.slice();
      const byteOffset = a * accessor.getElementSize() * edited.BYTES_PER_ELEMENT;
      new Uint8Array(edited.buffer, edited.byteOffset + byteOffset, 1)[0] ^= 1;
      accessor.setArray(edited);
      expect(primitiveTriangleAttributeFingerprint(leaf), semantic).not.toBe(pinned);
      accessor.setArray(array);
    }
    expect(primitiveTriangleAttributeFingerprint(leaf)).toBe(pinned);
  });

  it('keeps the migration inventory complete and independently pinned', () => {
    expect(FOLIAGE_TOWN_TREE_ASSETS).toEqual(
      EXPECTED_ASSETS.map(({ path: assetPath, inputSha256, outputSha256, semanticSha256 }) => ({
        path: assetPath,
        inputSha256,
        outputSha256,
        semanticSha256,
      })),
    );
  });

  for (const asset of EXPECTED_ASSETS) {
    it(`pins exact welded geometry and artifact bytes for ${asset.path}`, async () => {
      const assetPath = path.join(ROOT, 'public', asset.path);
      const bytes = readFileSync(assetPath);
      const artifactSha256 = createHash('sha256').update(bytes).digest('hex');
      expect(artifactSha256).toBe(asset.outputSha256);
      const parsed = path.posix.parse(asset.path);
      expect(MEDIA_ASSETS[asset.path]).toBe(
        path.posix.join(
          '/media',
          parsed.dir,
          `${parsed.name}.${artifactSha256.slice(0, 12)}${parsed.ext}`,
        ),
      );

      const document = await io.read(assetPath);
      expect(triangleAttributeFingerprint(document)).toBe(asset.semanticSha256);

      let vertices = 0;
      let triangles = 0;
      for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          const index = primitive.getIndices();
          expect(position).toBeDefined();
          expect(index).toBeDefined();
          if (!position || !index) continue;
          const indexArray = index.getArray();
          expect(indexArray).toBeInstanceOf(Uint16Array);
          if (!indexArray) continue;
          expect(Math.max(...indexArray)).toBeLessThanOrEqual(65_534);
          vertices += position.getCount();
          triangles += index.getCount() / 3;

          const uniqueVertices = new Set<string>();
          for (let vertex = 0; vertex < position.getCount(); vertex++) {
            uniqueVertices.add(vertexKey(primitive, vertex));
          }
          expect(uniqueVertices.size).toBe(position.getCount());
        }
      }
      expect({ vertices, triangles }).toEqual({
        vertices: asset.vertices,
        triangles: asset.triangles,
      });
    });
  }
});
