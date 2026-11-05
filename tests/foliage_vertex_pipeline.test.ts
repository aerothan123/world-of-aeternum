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
    inputSha256: '10dce8acf42359fc9cbf40f7d0003e48af239250321ea623b7c6af26b374a8a3',
    outputSha256: 'e7dfb7dc0bd53dda1a4f3c73cc54a271ee040c7f8396e3e4c522b501190c9f3d',
    semanticSha256: 'fb47b49e240306007f30756cfb686caaa153a7085e8d9618d07f378a75b31a44',
    vertices: 6_993,
    triangles: 2_947,
  },
  {
    path: 'models/foliage/pine_2.glb',
    inputSha256: '1f3b73333c705d9bbb01d4144e6f6853a65a960d77b71e3c8aa8ad4fe89e4e6a',
    outputSha256: 'ef01904671f3755e3ffb2773c4a16e4cd24c0db29d5a09cedc4148da80e38fae',
    semanticSha256: '2b686bff89372efe802b4e48981541c16f68760f229f2e9ef6e6bca5ccf804b3',
    vertices: 6_739,
    triangles: 2_818,
  },
  {
    path: 'models/foliage/pine_4.glb',
    inputSha256: '946e85df1d89deffb0acb7e9bf2c57124e3d7409d68c0f7be41c3761e89fd6e6',
    outputSha256: '438301274c50d74fad8ced9c5f0e92ded2abc4d7dfd25fcb7a47c5facead74ae',
    semanticSha256: '96102401696917f891ba5642fc96026f0240d50bbeb9b9c9a9df2f4b910bd9a1',
    vertices: 5_332,
    triangles: 2_139,
  },
  {
    path: 'models/foliage/pine_5.glb',
    inputSha256: 'f8cb6205791570c44b9c6812d88d6af1b91539e5905cde92e7a92bfb2ec3daf0',
    outputSha256: '37dbc1baf4758c43b889b4db232b484ade845888eb2f1b012cfa79c09d43d75a',
    semanticSha256: '57cb00b5afd56866ad125e4f60fab357cf9842c3b97e737948c10740edb52c56',
    vertices: 6_175,
    triangles: 2_554,
  },
  {
    path: 'models/foliage/oak_1.glb',
    inputSha256: 'dccda5d55a04a64c654ddb9e499df9ea60a4c74b0df5dba48cdf0b1d720c8039',
    outputSha256: 'd38f3eaf035c06f911003d908eba2b1dc9742094d12ced8299a780631fa1de00',
    semanticSha256: 'b2cf6414ec5c9589924bb6da19bac810c6be5c3248fa1837ab857fd9f871c6bf',
    vertices: 5_246,
    triangles: 2_300,
  },
  {
    path: 'models/foliage/oak_2.glb',
    inputSha256: '7c93696510c20d00e59d4abc06e82a685c0b75d1e5ccfa99ce7b7be5f2995c7f',
    outputSha256: 'c96851d51e4b86fda605fa9af7b9be3df332a6ec1ad9fbcdb4ad8d380ca664a0',
    semanticSha256: '34d3d8dc62382f154efd5d77d8487af12fda44c1d04f87220bdcdb537c3e0574',
    vertices: 5_396,
    triangles: 2_469,
  },
  {
    path: 'models/foliage/oak_3.glb',
    inputSha256: '11245bab27d8f0e274f15bc3a1083241cd6e161547f7331ec29d63f4a71a1217',
    outputSha256: '682cd65970d23c1fcb63ba2573b5e86ded8ca7c972c14bd52c3c936b6f114d8b',
    semanticSha256: 'a9110b91bb1039fa26b8bed7e90ebd136d9f30d20bf331d8f2e422587c67c5a8',
    vertices: 5_369,
    triangles: 2_325,
  },
  {
    path: 'models/foliage/oak_4.glb',
    inputSha256: '1168937fcfc8f6eb44b91d37b2d59f94a8ca3bd42e1c5baedd074863fe1b2020',
    outputSha256: 'ae59752b50a19fd31e2d3088696870bad1ac73e79405f24217edb298f6280453',
    semanticSha256: '26564016837029fefd7a4193114284388a343695e19ef51db2b8242d6e2814b4',
    vertices: 5_008,
    triangles: 2_204,
  },
  {
    path: 'models/foliage/oak_5.glb',
    inputSha256: 'd554d130ee37487f515b02ca01845f588a7106c2948a97367dba30738fb97c00',
    outputSha256: '024894e048779493e7802f881b054a841fd9522c46e4ba5f72f8f5a9c1579d30',
    semanticSha256: '737eee01c5dd78b8673e9102d4d52be5a4800f8c5eedfe9fa4804e72c995ad0a',
    vertices: 4_962,
    triangles: 2_144,
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
    const pinned = 'e6334517fc4c030b005d5e6853f130f262a0ecac591011da364e6d9e7a147084';
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
