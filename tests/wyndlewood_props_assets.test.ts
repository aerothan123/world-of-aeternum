// The Wyndlewood props kit (src/sim/content/wyndlewood_props.ts): the shipped
// painted models and their wiring. Every WYN_PROP_MODELS row is measured off its
// shipped GLB here (height and ground extents are the inputs to every placement
// scale and collider the story crew and housing derive from them), held to the
// kit's budgets (triangles, bytes, one material, WebP textures at most 512), and
// checked as registered in the props registry, credited, and reachable from the
// furniture catalog where it is furniture.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import { PROP_ASSET_DEFS } from '../src/render/props';
import {
  WYN_FURNITURE_MODEL_URLS,
  WYN_PROP_DEFS,
  WYN_PROP_LOW_TIER_KEYS,
} from '../src/render/wyndlewood_props';
import { FURNITURE_DEFS } from '../src/sim/content/furniture';
import { WYN_PROP_MODEL_IDS, WYN_PROP_MODELS } from '../src/sim/content/wyndlewood_props';

const ROOT = path.join(__dirname, '..');
// Kit budgets (assets_src/wyndlewood_props/kit.json face limits plus headroom).
const MAX_TRIANGLES = 4500;
const MAX_BYTES = 160 * 1024;
const MAX_TEXTURE = 512;

interface Measured {
  height: number;
  w: number;
  d: number;
  minY: number;
  cx: number;
  cz: number;
  triangles: number;
  materials: number;
  bytes: number;
  textures: { mime: string; w: number; h: number }[];
  meshopt: boolean;
}
const measured = new Map<string, Measured>();

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const id of WYN_PROP_MODEL_IDS) {
    const file = path.join(ROOT, 'public', WYN_PROP_MODELS[id].url);
    const doc = await io.read(file);
    const root = doc.getRoot();
    const b = getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
    let triangles = 0;
    for (const mesh of root.listMeshes())
      for (const prim of mesh.listPrimitives())
        triangles += (prim.getIndices()?.getCount() ?? 0) / 3;
    measured.set(id, {
      height: b.max[1] - b.min[1],
      w: b.max[0] - b.min[0],
      d: b.max[2] - b.min[2],
      minY: b.min[1],
      cx: (b.max[0] + b.min[0]) / 2,
      cz: (b.max[2] + b.min[2]) / 2,
      triangles,
      materials: root.listMaterials().length,
      bytes: statSync(file).size,
      textures: root.listTextures().map((t) => {
        const size = t.getSize() ?? [0, 0];
        return { mime: t.getMimeType(), w: size[0], h: size[1] };
      }),
      meshopt: root.listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression'),
    });
  }
});

describe('the Wyndlewood props kit models', () => {
  it('names every model by a unique id, key and file', () => {
    const keys = WYN_PROP_MODEL_IDS.map((id) => WYN_PROP_MODELS[id].propKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const id of WYN_PROP_MODEL_IDS) {
      expect(WYN_PROP_MODELS[id].url).toBe(`/models/props/wyn_${id}.glb`);
      expect(WYN_PROP_MODELS[id].propKey.startsWith('wyn')).toBe(true);
    }
  });

  it('measures every shipped file exactly as the table says', () => {
    for (const id of WYN_PROP_MODEL_IDS) {
      const m = measured.get(id) as Measured;
      const row = WYN_PROP_MODELS[id];
      expect(m.height, `${id} height`).toBeCloseTo(row.propHeight, 2);
      expect(Math.abs(m.w - row.w), `${id} w ${m.w}`).toBeLessThan(0.011);
      expect(Math.abs(m.d - row.d), `${id} d ${m.d}`).toBeLessThan(0.011);
    }
  });

  it('seats every model on the floor, centred, inside the kit budgets', () => {
    for (const id of WYN_PROP_MODEL_IDS) {
      const m = measured.get(id) as Measured;
      expect(Math.abs(m.minY), `${id} floor`).toBeLessThan(1e-3);
      expect(Math.abs(m.cx), `${id} cx`).toBeLessThan(1e-3);
      expect(Math.abs(m.cz), `${id} cz`).toBeLessThan(1e-3);
      expect(m.triangles, `${id} triangles`).toBeLessThanOrEqual(MAX_TRIANGLES);
      expect(m.bytes, `${id} bytes`).toBeLessThanOrEqual(MAX_BYTES);
      expect(m.materials, `${id} materials`).toBe(1);
      expect(m.meshopt, `${id} meshopt`).toBe(true);
      expect(m.textures.length, `${id} textures`).toBeGreaterThan(0);
      for (const t of m.textures) {
        expect(t.mime, `${id} texture type`).toBe('image/webp');
        expect(Math.max(t.w, t.h), `${id} texture size`).toBeLessThanOrEqual(MAX_TEXTURE);
      }
    }
  });

  it('registers every world model in the props registry on every tier and keeps furniture out of the boot preload', () => {
    for (const model of Object.values(WYN_PROP_MODELS)) {
      if (model.category === 'furniture') {
        // Furniture only draws inside a house (house_furniture.ts loads it on
        // demand behind its compile gate), so it never joins the props preload.
        expect(PROP_ASSET_DEFS[model.propKey], model.propKey).toBeUndefined();
        expect(WYN_FURNITURE_MODEL_URLS[model.propKey], model.propKey).toBe(model.url);
        continue;
      }
      expect(PROP_ASSET_DEFS[model.propKey]?.url, model.propKey).toBe(model.url);
      expect(WYN_PROP_DEFS[model.propKey]?.url, model.propKey).toBe(model.url);
      expect(WYN_PROP_LOW_TIER_KEYS).toContain(model.propKey);
    }
  });
  it('credits every shipped model', () => {
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    for (const id of WYN_PROP_MODEL_IDS) expect(credits, id).toContain(`(wyn_${id})`);
  });

  it('draws every wyn furniture render key with a furniture model', () => {
    const byKey = new Map(WYN_PROP_MODEL_IDS.map((id) => [WYN_PROP_MODELS[id].propKey, id]));
    const used = FURNITURE_DEFS.filter((def) => def.renderKey.startsWith('wyn'));
    expect(used.length).toBeGreaterThan(0);
    for (const def of used) {
      const id = byKey.get(def.renderKey);
      expect(id, def.itemId).toBeDefined();
      expect(WYN_PROP_MODELS[id as keyof typeof WYN_PROP_MODELS].category).toBe('furniture');
    }
  });
});
