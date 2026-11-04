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
    inputSha256: '31a76e626def6daf9611365b53dc58cb170f6cddd4315ed95579e2c60078f675',
    outputSha256: 'ecbbc9720a97a74e16b218a366c994c74597b9a6b88b6d1bc6affb6afeb1613b',
    semanticSha256: '55d31eb650c377a5e2810dce1455ee053ac426de71248a1726e68454fa3bb633',
    vertices: 2_432,
    triangles: 2_599,
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: '98047c27de982c8c132266b64e80db2e9858805c36d512d19ea931617e29c116',
    outputSha256: 'ccee3bd8ab160f2e611fe3a374f4a8dc665d80dc20a348f6d8c4e1559128dbd4',
    semanticSha256: '62b49e80aaddb6d27ce0328c3d4db584239f870f4d0402cbe2a9077435bee1d3',
    vertices: 4_989,
    triangles: 2_600,
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '69a56b68efaae361d0e7f28de35b9fb851f59414f0a9f254373e7c798c21cd21',
    outputSha256: '8a10627cec57530e2bbfcdd5e38ed6392baeb4c8521ab25a5b44bf535a198ad6',
    semanticSha256: '7ba75d5efc383a774f465e52f7c54756e252f0b742db4a8cb69c4d4ec590dc8c',
    vertices: 2_081,
    triangles: 2_599,
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: '12bfd15a7ba8fca2bdca0806c979f1fd178778f19d204760b32ad7e763d99820',
    outputSha256: 'a91cca4c39666dd0814db29904b798036f05851a4a0639f45945359357ca166a',
    semanticSha256: 'c52e639b2b9ce8a8a5caf87d2f7702538c39b2cecba52e15e7efafffc58e7a02',
    vertices: 5_001,
    triangles: 2_599,
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: 'd5d44b90f577f74dacfd4f98161cf4d32694ca3834bea5429ce4c4be57d17693',
    outputSha256: 'ddc65fe9715309f3a35a2cec37201b8739f5695979413f3af82be6274483da20',
    semanticSha256: 'a5b20476ce8047cfa8e641bd305a5b2de7a479b2a6f98a3b32c320ec5d0d7d31',
    vertices: 7_991,
    triangles: 4_093,
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: '424230625f822f8ade09addc313596687fda291b41fed8f786b099bde40f7353',
    outputSha256: 'dca286be3fc655c14e024234461fd665d856b554e232e8f345609e2238f79f92',
    semanticSha256: 'ea31866413a42520b65e71ed1ea97154d13d28f18ed80e435ef58da623a682e2',
    vertices: 7_315,
    triangles: 4_069,
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: 'a7126bb3a2cc8a83e63c05edb73d807dc0b81f818b6f403841f14f52a2088fb9',
    outputSha256: '0d478b176b62b4dc6ea470ba8f498112d286518ced8f1137621d73caeb3dcc7f',
    semanticSha256: 'f2eb742522c4f11001ccd26241ce269b83b0bc75dffc78030331d4b12a4fd289',
    vertices: 7_731,
    triangles: 4_000,
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: '0043c61c3fc964fe7b0ce92944c520e4159b5bf882ff303e4e5595f90dffdec3',
    outputSha256: '18f6ddbf280be80dab09b17030cc7700d0badaea9fe83e9a4a8329fb0f6f64f7',
    semanticSha256: '0c6e1fb6746cf3136d1f49b7ccf6cb7c6c212708055e647e83b651360c29d497',
    vertices: 7_056,
    triangles: 3_999,
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: 'dd767648f6ca39f37d8787a967fed952d8db6753e100d090b60b8c08158c1b1b',
    outputSha256: 'e1f29f1dfc7f30b4209633c79c0fcdc286a2504e1e4398376d36244d051a328c',
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
