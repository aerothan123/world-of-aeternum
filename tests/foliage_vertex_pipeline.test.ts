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
    inputSha256: '78dcb783364e151c8ee17e07d365aecd6f31fe24e9cd9119132d9c196aaed7e5',
    outputSha256: 'cdad3f039064450c357cbe87c33b2e560615913b4dcc6835679c41b497bd7799',
    semanticSha256: 'd72fb90ead75df40f11eff17103ce453369d5a8a688911413cc19d36c28e42de',
    vertices: 3_325,
    triangles: 4_084,
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: 'eaac25dab0b1c7b0c1da3aa8df25fb0b670cbc9c3425098413eb95de7e045e26',
    outputSha256: '646a28a9e5faec1ce8caede92a1d92ce3437256ea12b485b02f9ab93e2fbeeed',
    semanticSha256: 'a2a91ab9492687502fa5d62836e1d817b0f7cae591d57f2fdaeabacea36c7d53',
    vertices: 7_363,
    triangles: 4_142,
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '660270acbf9b4a32760365122cfafc2946fb84c7ef2102183f89d010ba53aab7',
    outputSha256: '43eacf51dceb2ca03d3d6dd31222ade3889657fef96d2e25e56c2ab37e3291f0',
    semanticSha256: 'db75c6fe80422ba7d07d9e72387df928e147b0c31e21ca479aca7e53d5112885',
    vertices: 2_856,
    triangles: 4_026,
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: '5e61db323e5bf68c42696fec8917d5c7d64482de757ed0b8226018abbd394e9d',
    outputSha256: '6af936e4158a62350c1a018cdc71170b0c451afce507732aa3be6a32b6ae7f17',
    semanticSha256: '84ccf91e258c41ac9e6d5db1727b41c996beaf6ac3dda8e11e296361bcc141a8',
    vertices: 6_408,
    triangles: 3_991,
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: '3a32608ed5cc4472eec7b59dae6469d5790a4153dd4941efbaef95409f297a26',
    outputSha256: 'd2d4e8f5181b00f37bd83833b60cb8e1e1ebe2bc20f665bf18e9ffb7f9bec87d',
    semanticSha256: 'b2a50f8b1aae9b40e98d4f3f135a9138fa67a41b6313457c585ef51414a2e4d5',
    vertices: 7_991,
    triangles: 4_093,
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: '898c537f9aceffb3e0550731f8808736eb45a0974e10dc7d23ec7fd225d3d4be',
    outputSha256: '8dc4c2499901fdde7f9cbe46bb7969badd44296150baf3b0059ecffd96bd2edd',
    semanticSha256: 'a83ce5724a570de2f2ad6ffbf49dd7f713c2628372bda6a4ac4b03c29902bbe4',
    vertices: 7_325,
    triangles: 4_069,
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: 'b04605fb523c95be62f3119d9018c477ac4df7d676cd6f2362f7e696f29968b9',
    outputSha256: '37892d97cb0012a41397958d6d126c195a3c4419ac37da93163b23c0d9d5c99e',
    semanticSha256: 'f17f7a172fb8fdbae7097ffe103b70c5269e4a56d80cc6ed794a12efb4338ec7',
    vertices: 8_048,
    triangles: 4_335,
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: '226d40a4ea5004b57db56576b7d30fad0d0fc52dd99b36acedebb439d29d443b',
    outputSha256: 'c765344102ec3e8b833ffe2d937db76c06d93617922324701e81c2bd25ffad0c',
    semanticSha256: 'be3b6d0587cae11d9c7553ab12cc10218089333e2a00a186cf0c821d79f02a38',
    vertices: 7_221,
    triangles: 4_206,
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: '601c46968891b3831647dad68d4d3b8f885cdba173a3b16a886cd9be49e94b47',
    outputSha256: '584d816b262718828a2c072b615a8549929c4aa684d65fcf05d9822c8397a809',
    semanticSha256: '826f3458ea072360a39928a107deed0f7f761ce48817370ba0cc708e5356c806',
    vertices: 7_016,
    triangles: 4_144,
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
    const pinned = '3e68ab2c455b35035434f428024222d71319be945148a55501cc7532a0e21fd1';
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
