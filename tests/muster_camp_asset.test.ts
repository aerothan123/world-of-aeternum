import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  MUSTER_TORCH_FLAME_HEIGHT as CONTRACT_FLAME_HEIGHT,
  MUSTER_CAMP_MATERIALS,
  MUSTER_CAMP_PIECES,
} from '../scripts/assets/muster_camp/contract.mjs';
import {
  MUSTER_CAMP_SOURCE_FILES,
  musterCampSourceFingerprint,
} from '../scripts/assets/muster_camp/source_fingerprint.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { MUSTER_KIT_PROP_DEFS, MUSTER_TORCH_FLAME_HEIGHT } from '../src/render/muster_camps';
import {
  MUSTER_CLUTTER_KEYS,
  MUSTER_PIECE_SPECS,
  type MusterKitKey,
} from '../src/sim/muster_camp_layout';

// The Mirefen muster camp kit (image-to-glb pipeline, Blender factory at
// scripts/assets/muster_camp/model.py). Pins the source inventory, the live source
// fingerprint, and every shipped GLB byte for byte. A change to any fingerprinted
// file means re-running scripts/assets/muster_camp/export_muster_camp.mjs, then
// `node scripts/build_media_manifest.mjs generate`, then re-pinning below from the
// summary the exporter prints (sizes stay put on a fingerprint-only re-export).

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_FINGERPRINT = '989d695819c8c900684ebf63353e0918cbb7afd9959d893b83c7ef59942a60f5';

interface Pin {
  bytes: number;
  sha256: string;
  triangles: number;
  primitives: number;
  materials: string[];
}

const PINS: Record<MusterKitKey, Pin> = {
  musterPalisade: {
    bytes: 37_092,
    sha256: '9f9d70b7c04bbb2a71a3ab605933e7344ea6e7aa734ebfaca100e01b10293262',
    triangles: 1426,
    primitives: 3,
    materials: ['MusterCloth', 'MusterRock', 'MusterWood'],
  },
  musterBarricade: {
    bytes: 41_688,
    sha256: '83ddbb9d40e98d0558d41d1ddda4ac659fb8117c89bfb96b6812db5944e20232',
    triangles: 1760,
    primitives: 4,
    materials: ['MusterCloth', 'MusterIron', 'MusterRock', 'MusterWood'],
  },
  musterGate: {
    bytes: 54_372,
    sha256: '91037f69d45d2c699caa827afe251fa61f7c1bc69918cefa5d9b37781e6a7bc7',
    triangles: 2568,
    primitives: 4,
    materials: ['MusterCloth', 'MusterIron', 'MusterRock', 'MusterWood'],
  },
  musterWatchtower: {
    bytes: 68_272,
    sha256: 'b30ebf10873d0804ab30b62535ec4d338c6d01372d02560e765023f10fb4c114',
    triangles: 3464,
    primitives: 3,
    materials: ['MusterCloth', 'MusterRock', 'MusterWood'],
  },
  musterTentLarge: {
    bytes: 21_404,
    sha256: '84cc7a86a2ef3dacb7b0cda214d49b3ae633cde8a4bbaf0f10eba66b321927d9',
    triangles: 702,
    primitives: 3,
    materials: ['MusterCloth', 'MusterRock', 'MusterWood'],
  },
  musterTentSmall: {
    bytes: 20_960,
    sha256: '54fb983b27b1db3e18f8082839faa158fc0d94886e03d4ff5f873ba6ddfaea5a',
    triangles: 678,
    primitives: 3,
    materials: ['MusterCloth', 'MusterRock', 'MusterWood'],
  },
  musterWeaponRack: {
    bytes: 43_748,
    sha256: 'dd33a27b678672e6a04048c5195a4c501db51a7d016495b3b7da607651d16956',
    triangles: 1830,
    primitives: 5,
    materials: ['MusterCloth', 'MusterCrystal', 'MusterIron', 'MusterRock', 'MusterWood'],
  },
  musterLanternPost: {
    bytes: 20_624,
    sha256: '757f2d7a084f6765b936750e97a890ceedd5b05c33783a0da26279bdbfa98630',
    triangles: 520,
    primitives: 5,
    materials: ['MusterCloth', 'MusterGlow', 'MusterIron', 'MusterRock', 'MusterWood'],
  },
  musterCrate: {
    bytes: 14_816,
    sha256: 'c5e840b8acb94e5432fd85a9c7cfa0b7b4a189926e90de4d433dc0d28d4ac703',
    triangles: 572,
    primitives: 2,
    materials: ['MusterIron', 'MusterWood'],
  },
  musterBarrel: {
    bytes: 7_548,
    sha256: 'd4a245f5d7e546fc506fbba492dbea06641db35369af13a05749324690d0ec7a',
    triangles: 188,
    primitives: 2,
    materials: ['MusterIron', 'MusterWood'],
  },
  musterSacks: {
    bytes: 11_212,
    sha256: 'eb2c3c974a41cc58346fd87e4ed305d8915a83e0603aab2ad0a2fafae1fdf6d7',
    triangles: 408,
    primitives: 1,
    materials: ['MusterCloth'],
  },
  musterCartWheel: {
    bytes: 16_992,
    sha256: '3a3ed38362ec141f44a5835fc4f00df874e503313709621099acb717ab42a441',
    triangles: 620,
    primitives: 3,
    materials: ['MusterIron', 'MusterRock', 'MusterWood'],
  },
  musterTorch: {
    bytes: 18_476,
    sha256: '269be7e1bad5ff87fc34c636796d5163c774e550addc17010038e92d5f6abdd8',
    triangles: 368,
    primitives: 5,
    materials: ['MusterCloth', 'MusterGlow', 'MusterIron', 'MusterRock', 'MusterWood'],
  },
};

async function io(): Promise<NodeIO> {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

describe('Mirefen muster camp kit pipeline', () => {
  it('pins the deterministic source inventory, the live fingerprint and the optimizer spec', () => {
    expect(MUSTER_CAMP_SOURCE_FILES).toEqual([
      'scripts/assets/muster_camp/model.py',
      'scripts/assets/muster_camp/contract.mjs',
      'scripts/assets/muster_camp/export_muster_camp.mjs',
      'scripts/assets/muster_camp/source_fingerprint.mjs',
      'scripts/assets/specs/muster_camp.json',
      'scripts/assets/build_assets.mjs',
      'pnpm-lock.yaml',
    ]);
    expect(musterCampSourceFingerprint(REPO_ROOT)).toBe(SOURCE_FINGERPRINT);
    const spec = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'scripts/assets/specs/muster_camp.json'), 'utf8'),
    );
    expect(spec.items).toEqual(
      MUSTER_CAMP_PIECES.map((piece) => ({
        src: `tmp/asset_src/muster_camp/${piece.file}.glb`,
        out: `models/props/${piece.file}.glb`,
        type: 'static',
        keepExtras: true,
      })),
    );
  });

  it('keeps the contract, the props registry and the layout core on one key set', () => {
    const keys = MUSTER_CAMP_PIECES.map((piece) => piece.key).sort();
    expect(Object.keys(PINS).sort()).toEqual(keys);
    expect(Object.keys(MUSTER_KIT_PROP_DEFS).sort()).toEqual(keys);
    expect(Object.keys(MUSTER_PIECE_SPECS).sort()).toEqual(keys);
    for (const piece of MUSTER_CAMP_PIECES) {
      const key = piece.key as MusterKitKey;
      expect(MUSTER_KIT_PROP_DEFS[key]).toEqual({
        url: `/models/props/${piece.file}.glb`,
        kit: 'muster',
      });
      expect(MUSTER_CLUTTER_KEYS.has(key)).toBe(piece.tierClass === 'clutter');
    }
    expect(MUSTER_TORCH_FLAME_HEIGHT).toBe(CONTRACT_FLAME_HEIGHT);
  });

  for (const piece of MUSTER_CAMP_PIECES) {
    const key = piece.key as MusterKitKey;
    it(`pins ${piece.file}.glb: bytes, structure, vertex colour, bounds, fingerprint`, async () => {
      const pin = PINS[key];
      const rel = `models/props/${piece.file}.glb`;
      const bytes = readFileSync(path.join(REPO_ROOT, 'public', rel));
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(bytes.length).toBe(pin.bytes);
      expect(sha).toBe(pin.sha256);
      expect(bytes.length).toBeLessThanOrEqual(piece.maxBytes);
      expect(MEDIA_ASSETS[rel]).toBe(`/media/models/props/${piece.file}.${sha.slice(0, 12)}.glb`);

      const document = await (await io()).readBinary(bytes);
      const root = document.getRoot();
      expect(
        root
          .listExtensionsUsed()
          .map((extension) => extension.extensionName)
          .sort(),
      ).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization']);
      expect(root.listTextures()).toHaveLength(0);
      expect(root.listAnimations()).toHaveLength(0);
      expect(root.listSkins()).toHaveLength(0);
      expect(root.listScenes()).toHaveLength(1);

      let triangles = 0;
      let primitives = 0;
      const materials = new Set<string>();
      for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          primitives++;
          const position = primitive.getAttribute('POSITION');
          triangles += (primitive.getIndices()?.getCount() ?? position?.getCount() ?? 0) / 3;
          expect(
            primitive.getAttribute('COLOR_0'),
            `${rel} primitive without COLOR_0`,
          ).not.toBeNull();
          materials.add(primitive.getMaterial()?.getName() ?? '');
        }
      }
      expect(triangles).toBe(pin.triangles);
      expect(triangles).toBeLessThanOrEqual(piece.maxTriangles);
      expect(primitives).toBe(pin.primitives);
      expect([...materials].sort()).toEqual(pin.materials);
      for (const name of materials) expect(MUSTER_CAMP_MATERIALS).toContain(name);

      const scene = root.listScenes()[0];
      const roots = scene.listChildren();
      expect(roots.map((node) => node.getName())).toEqual([key[0].toUpperCase() + key.slice(1)]);
      const runtime = roots[0].getExtras().sculptRuntime as Record<string, unknown>;
      expect(runtime).toMatchObject({
        schemaVersion: 1,
        kitKey: key,
        stage: 'final',
        tierClass: piece.tierClass,
        coordinateFrame: { front: '+Z', up: '+Y', right: '+X', units: 'world-yards' },
        collider: { shippingCollisionMesh: false },
      });
      expect(root.getExtras().sourceFingerprint).toBe(SOURCE_FINGERPRINT);
      expect(
        (root.getAsset().extras as { sourceFingerprint?: string } | undefined)?.sourceFingerprint,
      ).toBe(SOURCE_FINGERPRINT);

      // floor-seated, centred, and the layout core's footprint matches the model
      const { min, max } = getBounds(scene);
      expect(Math.abs(min[1])).toBeLessThanOrEqual(0.01);
      expect(Math.abs(min[0] + max[0])).toBeLessThanOrEqual(0.02);
      expect(Math.abs(min[2] + max[2])).toBeLessThanOrEqual(0.02);
      const spec = MUSTER_PIECE_SPECS[key];
      // tents leave their guy ropes out of the box, the tower its ladder foot
      expect(spec.halfWidth).toBeLessThanOrEqual(max[0] + 0.05);
      expect(spec.halfWidth).toBeGreaterThanOrEqual(max[0] - 0.55);
      expect(spec.halfDepth).toBeLessThanOrEqual(max[2] + 0.05);
      expect(spec.halfDepth).toBeGreaterThanOrEqual(max[2] - 0.65);

      if (key === 'musterTorch') {
        const flame = root.listNodes().find((node) => node.getName() === 'Socket_Flame');
        expect(flame).toBeDefined();
        expect(flame?.getWorldTranslation()[1]).toBeCloseTo(MUSTER_TORCH_FLAME_HEIGHT, 3);
      }
    });
  }

  it('sizes the kit next to the 2.6 yd player: stakes, tower, rack', async () => {
    const heightOf = async (file: string): Promise<number> => {
      const document = await (await io()).readBinary(
        readFileSync(path.join(REPO_ROOT, 'public/models/props', `${file}.glb`)),
      );
      return getBounds(document.getRoot().listScenes()[0]).max[1];
    };
    const palisade = await heightOf('muster_palisade');
    expect(palisade).toBeGreaterThanOrEqual(3.5);
    expect(palisade).toBeLessThanOrEqual(4.8);
    const tower = await heightOf('muster_watchtower');
    expect(tower).toBeGreaterThanOrEqual(9);
    expect(tower).toBeLessThanOrEqual(10.5);
    const rack = await heightOf('muster_weapon_rack');
    expect(rack).toBeGreaterThan(2.6);
  });
});
