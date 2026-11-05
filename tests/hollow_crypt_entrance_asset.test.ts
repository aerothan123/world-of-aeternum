// The Fallen Chapel's shipping GLBs (scripts/assets/hollow_crypt_entrance/build.mjs,
// authored in code by scripts/assets/hollow_crypt_entrance/wyn_chapel.mjs):
// exact bytes, the live authoring fingerprint, the media manifest rows, the
// Blender nodes and materials the runtime keys on, and the landmark budget
// (texture free, vertex colour only, meshopt; under 51,000 triangles and one
// megabyte across the four files, split so the growth and the churchyard cull
// and shed apart from the walls).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  HOLLOW_CRYPT_ENTRANCE_ASSETS,
  sourceFingerprint,
} from '../scripts/assets/hollow_crypt_entrance/build.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { hollowCryptEntrancePreloadInternalsForTest } from '../src/render/hollow_crypt_entrance';

const ROOT = path.join(__dirname, '..');

const PINS: Record<string, { sha: string; bytes: number; triangles: number; maxBytes: number }> = {
  'public/models/props/hollow_crypt_entrance.glb': {
    sha: '7a3266a6155c8a4c6f50560625896c6ca30eecdae7e1048f6df6ef87bd873e0d',
    bytes: 119952,
    triangles: 15860,
    maxBytes: 480 * 1024,
  },
  'public/models/props/hollow_crypt_entrance_walls.glb': {
    sha: 'eaf8f5531696bb14316b4d03e06098880ff15438f140f4bc84c9c73d1914705c',
    bytes: 88468,
    triangles: 13190,
    maxBytes: 240 * 1024,
  },
  'public/models/props/hollow_crypt_entrance_props.glb': {
    sha: '1636a123591395cea268f18e4c3f2ed3c1c6335eded136f2a2aa9b6abd8b9733',
    bytes: 56568,
    triangles: 7324,
    maxBytes: 130 * 1024,
  },
  'public/models/props/hollow_crypt_entrance_growth.glb': {
    sha: '949276548a9dc7fe4480e43872f3a03c2d7fd60104331ed5fd17281508ff438b',
    bytes: 44728,
    triangles: 3988,
    maxBytes: 160 * 1024,
  },
};

describe('the Fallen Chapel shipping assets', () => {
  it('the runtime preloads exactly the four shipped GLBs', () => {
    expect(hollowCryptEntrancePreloadInternalsForTest.urls).toEqual(
      HOLLOW_CRYPT_ENTRANCE_ASSETS.map((a) => `/${a.target.replace(/^public\//, '')}`),
    );
    expect(Object.keys(PINS).sort()).toEqual(
      HOLLOW_CRYPT_ENTRANCE_ASSETS.map((a) => a.target).sort(),
    );
  });

  for (const asset of HOLLOW_CRYPT_ENTRANCE_ASSETS) {
    it(`${asset.target}: exact bytes, live fingerprint, manifest row, nodes, materials, budget`, async () => {
      const pin = PINS[asset.target];
      const bytes = readFileSync(path.join(ROOT, asset.target));
      expect(bytes.length).toBe(pin.bytes);
      expect(bytes.length).toBeLessThanOrEqual(pin.maxBytes);
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(sha).toBe(pin.sha);
      const url = asset.target.replace(/^public\//, '');
      const stem = url.replace(/\.glb$/, '');
      expect(MEDIA_ASSETS[url]).toBe(`/media/${stem}.${sha.slice(0, 12)}.glb`);
      await MeshoptDecoder.ready;
      const doc = await new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
        .readBinary(bytes);
      const root = doc.getRoot();
      expect(root.getExtras().sourceFingerprint).toBe(sourceFingerprint(ROOT));
      expect(root.listTextures()).toHaveLength(0);
      expect(root.listAnimations()).toHaveLength(0);
      expect(root.listSkins()).toHaveLength(0);
      expect(
        doc
          .getRoot()
          .listExtensionsUsed()
          .map((e) => e.extensionName),
      ).toContain('EXT_meshopt_compression');
      expect(
        root
          .listMaterials()
          .map((m) => m.getName())
          .sort(),
      ).toEqual(asset.materials);
      // the leaf cards are the only double-sided lit surface
      for (const material of root.listMaterials()) {
        if (material.getName() === 'KitStone') expect(material.getDoubleSided()).toBe(false);
        if (material.getName() === 'KitLeaf') expect(material.getDoubleSided()).toBe(true);
      }
      expect(
        root
          .listNodes()
          .map((n) => n.getName())
          .sort(),
      ).toEqual([asset.root, ...asset.pieces].sort());
      let triangles = 0;
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          expect(prim.listSemantics()).toContain('COLOR_0');
          triangles +=
            (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
        }
      }
      expect(triangles).toBe(pin.triangles);
    });
  }

  it('the whole landmark stays inside its budget', () => {
    const pins = Object.values(PINS);
    expect(pins.reduce((sum, p) => sum + p.triangles, 0)).toBeLessThanOrEqual(51_000);
    expect(pins.reduce((sum, p) => sum + p.bytes, 0)).toBeLessThanOrEqual(1024 * 1024);
  });

  it('the model reaches from the ground to the bellcote and no further than its footprint', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const asset of HOLLOW_CRYPT_ENTRANCE_ASSETS) {
      const doc = await io.readBinary(readFileSync(path.join(ROOT, asset.target)));
      // scene bounds: the meshopt quantization scale lives on the nodes
      const bounds = getBounds(doc.getRoot().listScenes()[0]);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], bounds.min[k]);
        max[k] = Math.max(max[k], bounds.max[k]);
      }
    }
    // door-local: x west, y up, z north. The gable stands 22 yd south of the
    // door and towers over a 1.8 yd character; the footings go below ground.
    expect(max[1]).toBeGreaterThan(20);
    expect(max[1]).toBeLessThan(24);
    expect(min[1]).toBeLessThan(-0.3);
    // (the fallen bell lies a third sunk on its side: its rim is the deepest point)
    expect(min[1]).toBeGreaterThan(-2.2);
    expect(Math.max(Math.abs(min[0]), Math.abs(max[0]))).toBeLessThan(20);
    expect(min[2]).toBeGreaterThan(-50);
    expect(max[2]).toBeLessThan(14);
  });
});
