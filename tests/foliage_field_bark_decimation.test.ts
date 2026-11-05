import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Document, getBounds, Logger, NodeIO, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  decimateFoliageBarkDocument,
  FOLIAGE_BARK_BOUNDS_TOLERANCE,
  FOLIAGE_BARK_TRIANGLE_SHORTFALL,
  FOLIAGE_FIELD_BARK_ASSETS,
  type FoliageBarkSimplifier,
  isFoliageBarkMaterial,
  isFoliageFieldCopyCatalogId,
} from '../scripts/assets/foliage_bark_decimation.mjs';
import { primitiveTriangleAttributeFingerprint } from '../scripts/assets/foliage_vertex_pipeline.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { bgAssetGroups } from '../src/render/battleground_core';
import { foliagePreloadInternalsForTest } from '../src/render/foliage';
import {
  FIELD_BARK_DECIMATED,
  type FieldBarkSpecies,
  treeUrl,
} from '../src/render/foliage_field_models';
import { PROP_ASSET_DEFS } from '../src/render/props';
import { codeWithoutLineComments } from './helpers/code_without_line_comments';
import { stripComments } from './helpers/strip_comments';
import { tsFilesUnder } from './helpers/ts_files_under';

const ROOT = path.join(__dirname, '..');
const BOUNDS_TOLERANCE = 0.05;
const QUIET = new Logger(Logger.Verbosity.WARN);

// The storybook oaks (scripts/assets/fit_fable_foliage.mjs) wear their baked
// WEBP bark sheet and the shared WEBP leaf-card atlas, and no normal map; the
// twisted kit keeps its KTX2 bark, normal and leaf sheets.
const OAK = {
  bark: 'Bark_NormalTree',
  leaves: ['Leaves_NormalTree'],
  barkNormal: null,
  textures: 2,
  textureExtension: 'EXT_texture_webp',
};
const TWISTED = {
  bark: 'Bark_TwistedTree',
  leaves: ['Leaves_TwistedTree'],
  barkNormal: 'Bark_TwistedTree_Normal',
  textures: 3,
  textureExtension: 'KHR_texture_basisu',
};

const EXPECTED = [
  {
    model: 'oak_1',
    sourceSha256: 'd38f3eaf035c06f911003d908eba2b1dc9742094d12ced8299a780631fa1de00',
    budget: 480,
    keepSeams: true,
    outputSha256: 'b2309dd7d62476b40c6c8096401b8aec925dccfa7619e8703640d32307af9501',
    materials: OAK,
    sourceBark: { triangles: 611, vertices: 969 },
    bark: { triangles: 480, vertices: 841 },
  },
  {
    model: 'oak_2',
    sourceSha256: 'c96851d51e4b86fda605fa9af7b9be3df332a6ec1ad9fbcdb4ad8d380ca664a0',
    budget: 470,
    keepSeams: true,
    outputSha256: '6ef8732598dd07f18841c8e7c93c230478d9f1c622e6615bbb8e9845f0d1cbf7',
    materials: OAK,
    sourceBark: { triangles: 736, vertices: 1031 },
    bark: { triangles: 470, vertices: 759 },
  },
  {
    model: 'oak_4',
    sourceSha256: 'ae59752b50a19fd31e2d3088696870bad1ac73e79405f24217edb298f6280453',
    budget: 480,
    keepSeams: true,
    outputSha256: '6be8bdfef6be2713450ed79a286a2321a52d07cb0e0fd6cb20b78c18f3792e5e',
    materials: OAK,
    sourceBark: { triangles: 663, vertices: 1027 },
    bark: { triangles: 480, vertices: 830 },
  },
  {
    model: 'oak_5',
    sourceSha256: '024894e048779493e7802f881b054a841fd9522c46e4ba5f72f8f5a9c1579d30',
    budget: 530,
    keepSeams: true,
    outputSha256: 'ecda9509471c6954f6ca9eedf7bb6b9428072b54dd6bb92a1c841f9f72865fcd',
    materials: OAK,
    sourceBark: { triangles: 587, vertices: 951 },
    bark: { triangles: 530, vertices: 898 },
  },
  {
    model: 'twisted_1',
    sourceSha256: '1f63852b64aa9cb4401325da3c7044c8c4e6039a3392956585523177d508afba',
    budget: 1800,
    outputSha256: '9e6114cac7cfcab7310453aab1e3419548c100a5353adc477a14b0ca2fc042bf',
    materials: TWISTED,
    sourceBark: { triangles: 7152, vertices: 9317 },
    bark: { triangles: 1800, vertices: 1262 },
  },
  {
    model: 'twisted_2',
    sourceSha256: '6ff31dcb2a9c36ea57c039a1902d2521cc4a3a980bf3c255817ab0a17cb260cd',
    budget: 1800,
    outputSha256: '9e1f2b279fb020e967c7df18d549aa6f134e91593f3f804113f54171966faaed',
    materials: TWISTED,
    sourceBark: { triangles: 6741, vertices: 8685 },
    bark: { triangles: 1799, vertices: 1233 },
  },
  {
    model: 'twisted_3',
    sourceSha256: '1f337078cda9d799c289159b53e62f00237115e9d7b1253a0ebb3920057fec41',
    budget: 1800,
    outputSha256: '6573b1ffdabfd42b0c19f06be24908cacdd9e2318479b530051e6f954c2856ba',
    materials: TWISTED,
    sourceBark: { triangles: 7327, vertices: 9362 },
    bark: { triangles: 1800, vertices: 1241 },
  },
] as const;

const sourceUrl = (model: string) => `models/foliage/${model}.glb`;
const fieldUrl = (model: string) => `models/foliage/${model}_field.glb`;

function fileSha256(url: string): string {
  return createHash('sha256')
    .update(readFileSync(path.join(ROOT, 'public', url)))
    .digest('hex');
}

function splitPrimitives(document: Document): { bark: Primitive[]; others: Primitive[] } {
  const bark: Primitive[] = [];
  const others: Primitive[] = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const name = primitive.getMaterial()?.getName() ?? '';
      (isFoliageBarkMaterial(name) ? bark : others).push(primitive);
    }
  }
  return { bark, others };
}

function vertexKeys(primitive: Primitive): string[] {
  const count = primitive.getAttribute('POSITION')?.getCount() ?? 0;
  const keys: string[] = [];
  for (let vertex = 0; vertex < count; vertex++) {
    keys.push(
      primitive
        .listSemantics()
        .sort()
        .map((semantic) => {
          const accessor = primitive.getAttribute(semantic);
          const array = accessor?.getArray();
          if (!accessor || !array) throw new Error(`missing ${semantic}`);
          const size = accessor.getElementSize() * array.BYTES_PER_ELEMENT;
          const bytes = Buffer.from(array.buffer, array.byteOffset + vertex * size, size);
          const format = [
            accessor.getType(),
            accessor.getComponentType(),
            accessor.getNormalized(),
          ].join(':');
          return `${semantic}:${format}:${bytes.toString('hex')}`;
        })
        .join('|'),
    );
  }
  return keys;
}

function textureRecords(document: Document): string[] {
  return document
    .getRoot()
    .listTextures()
    .map((texture) => {
      const image = texture.getImage();
      if (!image) throw new Error(`${texture.getName()} has no image`);
      const sha256 = createHash('sha256').update(image).digest('hex');
      return `${texture.getName()}|${texture.getMimeType()}|${sha256}`;
    });
}

function extensionLists(document: Document): { used: string[]; required: string[] } {
  const extensions = document.getRoot().listExtensionsUsed();
  return {
    used: extensions.map((extension) => extension.extensionName).sort(),
    required: extensions
      .filter((extension) => extension.isRequired())
      .map((extension) => extension.extensionName)
      .sort(),
  };
}

function worldBarkBounds(document: Document, bark: Primitive): { min: number[]; max: number[] } {
  const node = document
    .getRoot()
    .listNodes()
    .find((candidate) => candidate.getMesh()?.listPrimitives().includes(bark));
  const position = bark.getAttribute('POSITION');
  if (!node || !position) throw new Error('bark primitive is not placed');
  const e = node.getWorldMatrix();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const p = [0, 0, 0];
  for (let vertex = 0; vertex < position.getCount(); vertex++) {
    position.getElement(vertex, p);
    const world = [
      e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12],
      e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13],
      e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14],
    ];
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], world[axis]);
      max[axis] = Math.max(max[axis], world[axis]);
    }
  }
  return { min, max };
}

function modelBounds(document: Document): { min: number[]; max: number[] } {
  const scenes = document.getRoot().listScenes();
  expect(scenes).toHaveLength(1);
  const { min, max } = getBounds(scenes[0]);
  return { min: [...min], max: [...max] };
}

function expectBoundsClose(
  actual: { min: number[]; max: number[] },
  expected: { min: number[]; max: number[] },
): void {
  for (const face of ['min', 'max'] as const) {
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(actual[face][axis] - expected[face][axis])).toBeLessThanOrEqual(
        BOUNDS_TOLERANCE,
      );
    }
  }
}

const GRID_SIDE = 11;

/** A bark grid of 200 triangles over 121 vertices plus a two-triangle leaf card. */
function treeDocument() {
  const document = new Document().setLogger(QUIET);
  const buffer = document.createBuffer();
  const positions: number[] = [];
  for (let row = 0; row < GRID_SIDE; row++) {
    for (let col = 0; col < GRID_SIDE; col++) positions.push(col, Math.sin(col * row) * 0.2, row);
  }
  const gridIndices: number[] = [];
  for (let row = 0; row < GRID_SIDE - 1; row++) {
    for (let col = 0; col < GRID_SIDE - 1; col++) {
      const a = row * GRID_SIDE + col;
      gridIndices.push(a, a + GRID_SIDE, a + 1, a + 1, a + GRID_SIDE, a + GRID_SIDE + 1);
    }
  }
  const accessor = (
    array: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
    type: 'VEC3' | 'SCALAR',
  ) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const bark = document
    .createPrimitive()
    .setMaterial(document.createMaterial('Bark_Test'))
    .setAttribute('POSITION', accessor(new Float32Array(positions), 'VEC3'))
    .setIndices(accessor(new Uint16Array(gridIndices), 'SCALAR'));
  const leaf = document
    .createPrimitive()
    .setMaterial(document.createMaterial('Leaves_Test'))
    .setAttribute(
      'POSITION',
      accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 'VEC3'),
    )
    .setIndices(accessor(new Uint16Array([0, 1, 2, 2, 1, 3]), 'SCALAR'));
  const mesh = document.createMesh('Tree').addPrimitive(bark).addPrimitive(leaf);
  const node = document.createNode().setMesh(mesh);
  const scene = document.createScene().addChild(node);
  return { document, accessor, gridIndices, bark, leaf, mesh, node, scene };
}

/** Returns the first `triangles` source triangles, so the kept bark loses its far rows. */
function truncatingSimplifier(triangles: number): FoliageBarkSimplifier {
  return {
    simplify: (indices) => [indices.slice(0, triangles * 3), 0],
    getScale: () => 1,
  };
}

function decimate(
  document: Document,
  barkTriangleBudget: number,
  simplifier: FoliageBarkSimplifier = MeshoptSimplifier,
  keepSeams = false,
) {
  return decimateFoliageBarkDocument(document, {
    barkTriangleBudget,
    keepSeams,
    simplifier,
    encoder: MeshoptEncoder,
  });
}

describe('foliage field bark decimation', () => {
  let io: NodeIO;

  beforeAll(async () => {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    await MeshoptSimplifier.ready;
    io = new NodeIO().setLogger(QUIET).registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  });

  it('keeps the stage table complete and independently pinned', () => {
    expect(FOLIAGE_FIELD_BARK_ASSETS).toEqual(
      EXPECTED.map(({ model, sourceSha256, budget, outputSha256, ...rest }) => ({
        sourcePath: sourceUrl(model),
        sourceSha256,
        barkTriangleBudget: budget,
        ...('keepSeams' in rest ? { keepSeams: rest.keepSeams } : {}),
        outputPath: fieldUrl(model),
        outputSha256,
      })),
    );
    expect(FOLIAGE_BARK_TRIANGLE_SHORTFALL).toBe(4);
    expect(FOLIAGE_BARK_BOUNDS_TOLERANCE).toBe(BOUNDS_TOLERANCE);
  });

  it('draws a field copy for exactly the stage table outputs', () => {
    const fieldTableUrls = (Object.keys(FIELD_BARK_DECIMATED) as FieldBarkSpecies[]).flatMap(
      (species) => FIELD_BARK_DECIMATED[species].map((variant) => treeUrl(species, variant)),
    );
    expect(fieldTableUrls.sort()).toEqual(
      FOLIAGE_FIELD_BARK_ASSETS.map(({ outputPath }) => outputPath).sort(),
    );
    expect(treeUrl('pine', 1)).toBe('models/foliage/pine_1.glb');
    expect(treeUrl('pine', 5)).toBe('models/foliage/pine_5.glb');
    expect(treeUrl('oak', 3)).toBe('models/foliage/oak_3.glb');
  });

  it('classifies only the Bark_ materials as bark', () => {
    const expected: Record<string, boolean> = {
      Bark_NormalTree: true,
      Bark_TwistedTree: true,
      Bark_DeadTree: true,
      Leaves_NormalTree: false,
      Leaves_Pine: false,
      Leaves_TwistedTree: false,
      Leaves: false,
      Rocks: false,
      bark_NormalTree: false,
      NormalTree_Bark: false,
      '': false,
    };
    for (const [name, isBark] of Object.entries(expected)) {
      expect(isFoliageBarkMaterial(name), name).toBe(isBark);
    }
  });

  it('skips exactly the stage outputs in the editor asset catalog', () => {
    for (const { model } of EXPECTED) {
      expect(isFoliageFieldCopyCatalogId(`foliage/${model}_field`), model).toBe(true);
    }
    for (const id of [
      'foliage/pine_1',
      'foliage/pine_3',
      'foliage/pine_5_field',
      'weapons/iron_field_hammer',
    ]) {
      expect(isFoliageFieldCopyCatalogId(id), id).toBe(false);
    }
    expect(
      codeWithoutLineComments(
        readFileSync(path.join(ROOT, 'scripts/gen_asset_catalog.mjs'), 'utf8'),
      ),
    ).toContain('.filter((e) => !isFoliageFieldCopyCatalogId(e.id))');
  });

  for (const asset of EXPECTED) {
    it(`rebuilds ${asset.model}_field byte for byte from its source through the stage`, async () => {
      const document = await io.read(path.join(ROOT, 'public', sourceUrl(asset.model)));
      const report = await decimate(
        document,
        asset.budget,
        MeshoptSimplifier,
        'keepSeams' in asset && asset.keepSeams,
      );
      const rebuiltSha256 = createHash('sha256')
        .update(await io.writeBinary(document))
        .digest('hex');
      expect(
        rebuiltSha256,
        `${fieldUrl(asset.model)} no longer matches a rebuild of ${sourceUrl(asset.model)} ` +
          'through decimateFoliageBarkDocument. If the change is intended: run ' +
          '`node scripts/assets/decimate_foliage_bark.mjs --write-pins`, paste the printed pins ' +
          'into FOLIAGE_FIELD_BARK_ASSETS and into EXPECTED here with the printed bark counts, ' +
          'then run `node scripts/build_media_manifest.mjs generate`.',
      ).toBe(asset.outputSha256);
      expect({ triangles: report.sourceTriangles, vertices: report.sourceVertices }).toEqual(
        asset.sourceBark,
      );
      expect({ triangles: report.barkTriangles, vertices: report.barkVertices }).toEqual(
        asset.bark,
      );
    });

    it(`ships ${asset.model}_field with decimated bark and untouched leaves and textures`, async () => {
      expect(fileSha256(sourceUrl(asset.model))).toBe(asset.sourceSha256);
      const outputSha256 = fileSha256(fieldUrl(asset.model));
      expect(outputSha256).toBe(asset.outputSha256);
      expect(MEDIA_ASSETS[fieldUrl(asset.model)]).toBe(
        `/media/models/foliage/${asset.model}_field.${outputSha256.slice(0, 12)}.glb`,
      );

      const source = await io.read(path.join(ROOT, 'public', sourceUrl(asset.model)));
      const output = await io.read(path.join(ROOT, 'public', fieldUrl(asset.model)));
      const sourceParts = splitPrimitives(source);
      const outputParts = splitPrimitives(output);
      expect(sourceParts.bark).toHaveLength(1);
      expect(outputParts.bark).toHaveLength(1);
      const [sourceBark] = sourceParts.bark;
      const [outputBark] = outputParts.bark;

      for (const bark of [sourceBark, outputBark]) {
        expect(bark.getMaterial()?.getName()).toBe(asset.materials.bark);
        expect(bark.getMaterial()?.getNormalTexture()?.getName() ?? null).toBe(
          asset.materials.barkNormal,
        );
      }
      for (const parts of [sourceParts, outputParts]) {
        expect(parts.others.map((primitive) => primitive.getMaterial()?.getName())).toEqual(
          asset.materials.leaves,
        );
      }

      expect({
        triangles: (sourceBark.getIndices()?.getCount() ?? 0) / 3,
        vertices: sourceBark.getAttribute('POSITION')?.getCount(),
      }).toEqual(asset.sourceBark);
      expect({
        triangles: (outputBark.getIndices()?.getCount() ?? 0) / 3,
        vertices: outputBark.getAttribute('POSITION')?.getCount(),
      }).toEqual(asset.bark);

      const sourceBarkVertices = new Set(vertexKeys(sourceBark));
      const outputBarkVertices = vertexKeys(outputBark);
      expect(outputBarkVertices.filter((key) => !sourceBarkVertices.has(key))).toEqual([]);
      expect(new Set(outputBark.getIndices()?.getArray()).size).toBe(asset.bark.vertices);

      expect(outputParts.others.map(primitiveTriangleAttributeFingerprint)).toEqual(
        sourceParts.others.map(primitiveTriangleAttributeFingerprint),
      );
      expect(textureRecords(output)).toEqual(textureRecords(source));
      expect(textureRecords(output)).toHaveLength(asset.materials.textures);
      expect(extensionLists(output)).toEqual(extensionLists(source));
      expect(extensionLists(output).required).toContain(asset.materials.textureExtension);

      expectBoundsClose(modelBounds(output), modelBounds(source));
      expectBoundsClose(worldBarkBounds(output, outputBark), worldBarkBounds(source, sourceBark));
    });
  }

  it('simplifies only the bark primitive and drops the vertices it stops using', async () => {
    const { document, bark, leaf } = treeDocument();
    const leafBefore = primitiveTriangleAttributeFingerprint(leaf);

    const report = await decimate(document, 60);

    const { bark: finishedBark, others } = splitPrimitives(document);
    expect(finishedBark).toHaveLength(1);
    expect(finishedBark[0]).toBe(bark);
    const barkTriangles = (bark.getIndices()?.getCount() ?? 0) / 3;
    const barkVertices = bark.getAttribute('POSITION')?.getCount() ?? 0;
    expect(report.sourceTriangles).toBe(200);
    expect(barkTriangles).toBe(report.barkTriangles);
    expect(barkTriangles).toBeLessThanOrEqual(60);
    expect(barkTriangles).toBeGreaterThanOrEqual(56);
    expect(barkVertices).toBeLessThan(GRID_SIDE * GRID_SIDE);
    expect(new Set(bark.getIndices()?.getArray()).size).toBe(barkVertices);
    expect(primitiveTriangleAttributeFingerprint(others[0])).toBe(leafBefore);

    await expect(decimate(document, barkTriangles)).rejects.toThrow(/is not below/);
    leaf.setMaterial(document.createMaterial('Bark_Second'));
    await expect(decimate(document, 1)).rejects.toThrow(/Expected one bark primitive, found 2/);
  });

  it('decimates a Uint8 indexed bark within its source index range', async () => {
    const { document, bark, leaf, gridIndices } = treeDocument();
    bark.getIndices()?.setArray(new Uint8Array(gridIndices));
    const leafBefore = primitiveTriangleAttributeFingerprint(leaf);

    const report = await decimate(document, 60);

    const indices = bark.getIndices()?.getArray();
    const vertices = bark.getAttribute('POSITION')?.getCount() ?? 0;
    expect(report.barkTriangles).toBe(60);
    expect(indices?.length).toBe(180);
    expect(Math.max(...(indices ?? []))).toBe(vertices - 1);
    expect(new Set(indices).size).toBe(vertices);
    expect(report.barkVertices).toBe(vertices);
    expect(primitiveTriangleAttributeFingerprint(leaf)).toBe(leafBefore);
  });
});

describe('foliage bark decimation guards', () => {
  beforeAll(async () => {
    await MeshoptEncoder.ready;
    await MeshoptSimplifier.ready;
  });

  it('collapses across uv seams only without keepSeams', async () => {
    const seen: (readonly string[] | undefined)[] = [];
    const budget = 60;
    const recording: FoliageBarkSimplifier = {
      simplify: (indices, _positions, _stride, _target, _error, flags) => {
        seen.push(flags);
        return [indices.slice(0, budget * 3), 0];
      },
      getScale: () => 1,
    };
    await decimate(treeDocument().document, budget, recording).catch(() => undefined);
    await decimate(treeDocument().document, budget, recording, true).catch(() => undefined);
    expect(seen).toEqual([['Permissive'], []]);
  });

  it('holds the simplified bark inside its budget window', async () => {
    const budget = 60;
    const budgetText = `budget ${budget}`;
    await expect(
      decimate(treeDocument().document, budget, truncatingSimplifier(budget + 1)),
    ).rejects.toThrow(`Bark simplified to ${budget + 1} triangles, ${budgetText}`);
    await expect(
      decimate(treeDocument().document, budget, truncatingSimplifier(budget - 5)),
    ).rejects.toThrow(`Bark simplified to ${budget - 5} triangles, ${budgetText}`);
    // Both window edges pass on to the next guard: the truncated grid lost its far rows.
    for (const triangles of [budget, budget - FOLIAGE_BARK_TRIANGLE_SHORTFALL]) {
      await expect(
        decimate(treeDocument().document, budget, truncatingSimplifier(triangles)),
      ).rejects.toThrow(/^Bark bounds moved by \d/);
    }
  });

  it('rejects a bark whose simplified bounds shrink', async () => {
    await expect(decimate(treeDocument().document, 60, truncatingSimplifier(60))).rejects.toThrow(
      /^Bark bounds moved by 7$/,
    );
  });

  it('rejects a tree with no leaf primitive', async () => {
    const { document, mesh, leaf } = treeDocument();
    mesh.removePrimitive(leaf);
    await expect(decimate(document, 60)).rejects.toThrow(
      'Expected leaf primitives next to the bark',
    );
  });

  it('rejects a bark mesh placed by two nodes or by none', async () => {
    const twice = treeDocument();
    twice.scene.addChild(twice.document.createNode().setMesh(twice.mesh));
    await expect(decimate(twice.document, 60)).rejects.toThrow(
      'Bark mesh Tree is instanced by 2 nodes',
    );
    const unplaced = treeDocument();
    unplaced.node.setMesh(null);
    await expect(decimate(unplaced.document, 60)).rejects.toThrow(
      'Bark mesh Tree is instanced by 0 nodes',
    );
  });

  it('rejects a bark that is not indexed', async () => {
    const { document, bark } = treeDocument();
    bark.setIndices(null);
    await expect(decimate(document, 60)).rejects.toThrow(
      'Bark primitive is not indexed or has no POSITION',
    );
  });

  it('rejects a leaf that shares the bark index accessor', async () => {
    const { document, bark, leaf, accessor } = treeDocument();
    const positions = bark.getAttribute('POSITION')?.getArray();
    const barkIndices = bark.getIndices();
    if (!(positions instanceof Float32Array) || !barkIndices) throw new Error('bark grid');
    leaf
      .setAttribute(
        'POSITION',
        accessor(
          positions.map((value) => value + 0.5),
          'VEC3',
        ),
      )
      .setIndices(barkIndices);
    await expect(decimate(document, 60)).rejects.toThrow('Non-bark primitive 0 changed');
  });

  it('rejects a document without exactly one scene', async () => {
    const { document } = treeDocument();
    document.createScene();
    await expect(decimate(document, 60)).rejects.toThrow('Expected one scene, found 2');
  });
});

describe('foliage field bark consumers', () => {
  const decimatedSources = EXPECTED.map(({ model }) => sourceUrl(model));
  const fieldCopies = EXPECTED.map(({ model }) => fieldUrl(model));

  it('points the world foliage field at exactly the seven field copies', () => {
    const { allFoliageModelUrls, lowTierFoliageModelUrls, highTierFoliageModelUrls } =
      foliagePreloadInternalsForTest;
    const all = [...allFoliageModelUrls()];
    expect(all.filter((url) => url.endsWith('_field.glb')).sort()).toEqual([...fieldCopies].sort());
    expect(all.filter((url) => decimatedSources.includes(url))).toEqual([]);
    expect([...highTierFoliageModelUrls()].sort()).toEqual(all.sort());
    expect([...lowTierFoliageModelUrls()].sort()).toEqual(
      [
        'models/foliage/pine_1.glb',
        'models/foliage/oak_1_field.glb',
        'models/foliage/twisted_1_field.glb',
        'models/foliage/dead_1.glb',
        'models/foliage/rock_1.glb',
        'models/foliage/bush.glb',
        'models/foliage/bush_flowers.glb',
        'models/foliage/fern.glb',
        'models/foliage/mushroom.glb',
      ].sort(),
    );
    for (const kept of [
      'pine_1',
      'pine_2',
      'pine_4',
      'pine_5',
      'oak_3',
      'dead_1',
      'dead_2',
      'dead_3',
    ]) {
      expect(all).toContain(sourceUrl(kept));
    }
    for (const url of all) {
      const sha256 = fileSha256(url);
      expect(MEDIA_ASSETS[url], url).toBe(
        `/media/${url.replace(/\.glb$/, '')}.${sha256.slice(0, 12)}.glb`,
      );
    }
  });

  it('names a field copy only in the field model table and the media manifest', () => {
    const fieldCopyName = /\b(?:pine|oak|twisted)_\d+_field\b/;
    const fieldModelsImport = /['"][^'"]*\/foliage_field_models(?:\.ts)?['"]/;
    expect(fieldCopyName.test(stripComments("const u = '/models/foliage/oak_2_field.glb';"))).toBe(
      true,
    );
    expect(
      fieldCopyName.test(stripComments("// const u = '/models/foliage/oak_2_field.glb';")),
    ).toBe(false);
    expect(fieldCopyName.test(stripComments("const u = '/models/foliage/oak_2.glb';"))).toBe(false);

    const naming: string[] = [];
    const importing: string[] = [];
    for (const { file, full } of tsFilesUnder(path.join(ROOT, 'src'))) {
      const code = stripComments(readFileSync(full, 'utf8'));
      if (fieldCopyName.test(code)) naming.push(file);
      if (fieldModelsImport.test(code)) importing.push(file);
    }
    expect(naming).toContain('render/assets/manifest.generated.ts');
    expect(
      naming.filter(
        (file) =>
          file !== 'render/assets/manifest.generated.ts' &&
          file !== 'render/foliage_field_models.ts',
      ),
    ).toEqual([]);
    // The Buried Hoard cavern's hero trees (the 2026-09-28 release/v0.44.0 merge
    // into feature/buried-hoards) stand at the field's own scale and share the
    // field's loaded oak_1 and pine_1 sources, so they read the table too rather
    // than naming a copy.
    expect(importing.sort()).toEqual(['render/foliage.ts', 'render/hoard_cavern_foliage.ts']);
  });

  it('keeps the Thornhollow dressing and the oakTree prop on the originals', () => {
    expect(PROP_ASSET_DEFS.oakTree.url).toBe('/models/foliage/oak_4.glb');
    const battlegroundFoliage = bgAssetGroups()
      .map((group) => group.path)
      .filter((url) => url.includes('/foliage/'));
    expect(battlegroundFoliage).toContain('/models/foliage/twisted_1.glb');
    expect(battlegroundFoliage).toContain('/models/foliage/oak_1.glb');
    expect(battlegroundFoliage.filter((url) => url.endsWith('_field.glb'))).toEqual([]);
  });
});
