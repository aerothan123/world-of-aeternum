import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { coverGlbs } from '../scripts/world_export/cover_meshes';
import { engineGlb, WEB_ONLY_EXTENSIONS } from '../scripts/world_export/engine_glb';
import { EXPORT_SCRIPT } from '../scripts/world_export/export_slice.mjs';
import { object3DToGlb } from '../scripts/world_export/procedural_glb';
import { terrainTiles } from '../scripts/world_export/terrain_mesh';
import type { WorldSliceExport } from '../scripts/world_export/world_slice_export';
import {
  collectPlacements,
  collectScatter,
  decorationSpecies,
  EASTBROOK_VALE_SLICE,
  EXPORT_SLICES,
  GROUND_LAYERS,
  keyLights,
  parsePropAssetUrls,
  quantizeHeights,
  sampleGround,
  sampleHeights,
} from '../scripts/world_export/world_slice_export';
import { sunDirection } from '../src/render/day_night_core';
import { isOnProvingShore } from '../src/sim/content/proving_shore';
import { getActiveWorldContent } from '../src/sim/data';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import { generateGroundDressing } from '../src/sim/ground_dressing';
import { generateDecorationsInBounds, terrainHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The world slice export must be a READ of the live game, never a
// re-derivation: these pins compare the exporter against the game functions
// it claims to sample, so a terrain, scatter or placement change moves both.
const B = EASTBROOK_VALE_SLICE;
const propUrls = parsePropAssetUrls(fs.readFileSync('src/render/props.ts', 'utf8'));
const resolve = (k: string): string | null => propUrls[k] ?? null;
const inB = (x: number, z: number): boolean =>
  x >= B.minX && x <= B.maxX && z >= B.minZ && z <= B.maxZ;

describe('world slice export', () => {
  it('samples heights from terrainHeight on the documented raster layout', () => {
    const res = 9;
    const h = sampleHeights(B, res, WORLD_SEED);
    const step = (B.maxX - B.minX) / (res - 1);
    for (const [i, j] of [
      [0, 0],
      [4, 4],
      [8, 1],
      [2, 7],
    ]) {
      const x = B.minX + i * step;
      const z = B.minZ + j * step;
      expect(h[j * res + i]).toBe(Math.fround(terrainHeight(x, z, WORLD_SEED)));
    }
    // the Eastbrook hub and Wolf Run, pinned so a terrain retune is a visible diff
    expect(terrainHeight(-14, -100, WORLD_SEED)).toBeCloseTo(-0.8475, 3);
    expect(terrainHeight(0, 0, WORLD_SEED)).toBeCloseTo(-3.0521, 3);
  });

  it('round-trips heights through the 16-bit encoding', () => {
    const h = new Float32Array([-12, -3.25, 0, 7.5, 40]);
    const q = quantizeHeights(h, -12, 40);
    for (let i = 0; i < h.length; i++) expect(-12 + (q[i] / 65535) * 52).toBeCloseTo(h[i], 3);
  });

  it('reads ground layers from the client terrain sampler and normalizes them', () => {
    const sub = { minX: -30, maxX: -2, minZ: -114, maxZ: -86 };
    const res = 129;
    const { splat } = sampleGround(sub, res, WORLD_SEED, 128);
    const n = GROUND_LAYERS.length;
    let cobble = 0;
    for (let o = 0; o < res * res; o++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += splat[o * n + k];
      expect(sum).toBeCloseTo(1, 4);
      cobble += splat[o * n + 4];
    }
    // the civic square's streets are laid as cobble
    expect(cobble).toBeGreaterThan(100);
  });

  it('exports every placed building, stall, well and fence the shipped content puts in the slice', () => {
    const P = getActiveWorldContent().props;
    const placements = collectPlacements(B, WORLD_SEED, resolve);
    const by = (s: string): number => placements.filter((p) => p.source === s).length;
    expect(by('buildings')).toBe(P.buildings.filter((b) => b.assetId && inB(b.x, b.z)).length);
    expect(by('stalls')).toBe(P.stalls.filter((s) => inB(s.x, s.z)).length);
    expect(by('wells')).toBe(P.wells.filter((s) => inB(s.x, s.z)).length);
    expect(by('fences')).toBe(
      P.fences.filter((f) => inB((f.x1 + f.x2) / 2, (f.z1 + f.z2) / 2)).length,
    );
    expect(by('buildings')).toBeGreaterThanOrEqual(6);
    const bank = placements.find((p) => p.id === 'eastbrook_bank');
    expect(bank?.path).toBe('/models/tidehold/bank.glb');
    // stood as render/eastbrook_placed_building.ts stands it: layout anchor,
    // turn and uniform scale, sunk by the layout's lift
    const placed = EASTBROOK_LAYOUT.buildings.find((b) => b.id === 'eastbrook_bank')?.placement;
    expect(placed).toBeDefined();
    expect(bank?.x).toBe(placed?.x);
    expect(bank?.rotY).toBe(placed?.rotation);
    expect(bank?.fit).toEqual({ mode: 'raw', scale: placed?.scale });
    expect(bank?.y).toBeCloseTo(
      terrainHeight(bank?.x ?? 0, bank?.z ?? 0, WORLD_SEED) + (placed?.lift ?? 0),
      9,
    );
    for (const p of placements) expect(p.path).toMatch(/^\/models\/.+\.glb$/);
  });

  it('exports the procedural scatter one for one with the generators', () => {
    const scatter = collectScatter(B, WORLD_SEED);
    const dec = generateDecorationsInBounds(WORLD_SEED, B).filter((d) => inB(d.x, d.z));
    const dress = generateGroundDressing(WORLD_SEED, { bounds: B }).filter((d) => inB(d.x, d.z));
    expect(scatter.length).toBe(dec.length + dress.length);
    expect(scatter.filter((t) => t.species === 'rock').length).toBe(
      dec.filter((d) => d.kind === 'rock').length,
    );
    // the vale is broadleaf: its scatter trees are oaks, never pines
    for (const d of dec) {
      if (d.biome === 'vale' && d.kind !== 'rock') expect(decorationSpecies(d)).toBe('oak');
    }
  });

  it('takes its key lights from the client sun path', () => {
    const lights = keyLights('vale');
    const golden = lights.find((l) => l.name === 'golden_hour');
    expect(golden?.sunDir).toEqual(sunDirection(golden?.phase ?? 0));
    expect(lights.find((l) => l.name === 'noon')?.dayness).toBeCloseTo(1, 6);
  });

  it('rewrites a shipped web GLB without its delivery extensions', async () => {
    const src = new Uint8Array(fs.readFileSync('public/models/tidehold/smithy.glb'));
    const out = await engineGlb(process.cwd(), src);
    for (const ext of WEB_ONLY_EXTENSIONS) expect(out.extensionsUsed).not.toContain(ext);
    const json = JSON.parse(
      Buffer.from(out.bytes.buffer, out.bytes.byteOffset, out.bytes.byteLength)
        .subarray(20, 20 + new DataView(out.bytes.buffer, out.bytes.byteOffset).getUint32(12, true))
        .toString('utf8'),
    );
    expect(json.images.length).toBeGreaterThan(0);
    for (const img of json.images) expect(img.mimeType).toBe('image/png');
  }, 30_000);

  it('cuts terrain tiles whose vertices sit on the exported heights', async () => {
    const sub = { minX: -30, maxX: -2, minZ: -114, maxZ: -86 };
    const res = 129;
    const heights = sampleHeights(sub, res, WORLD_SEED);
    const { splat } = sampleGround(sub, res, WORLD_SEED, 128);
    const step = (sub.maxX - sub.minX) / (res - 1);
    const meta = { bounds: sub, res, step, layers: GROUND_LAYERS };
    const tiles = await terrainTiles({ meta, heights, splat } as unknown as WorldSliceExport, 2);
    expect(tiles.map((t) => t.name)).toEqual([
      'terrain_0_0',
      'terrain_1_0',
      'terrain_0_1',
      'terrain_1_1',
    ]);
    const doc = await new NodeIO().readBinary(tiles[3].bytes);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const pos = prim.getAttribute('POSITION')?.getArray() as Float32Array;
    // the tile's first vertex is grid sample (64, 64); its last is the far corner
    expect(pos[1]).toBe(heights[64 * res + 64]);
    expect(pos[pos.length - 2]).toBe(heights[res * res - 1]);
    expect(prim.getAttribute('COLOR_0')?.getCount()).toBe(65 * 65);
  });

  it('resolves the prop asset table and ships its entry script', () => {
    expect(propUrls.fence).toBe('/models/props/fence.glb');
    expect(propUrls.bonfire).toBe('/models/props/bonfire.glb');
    expect(fs.existsSync(EXPORT_SCRIPT)).toBe(true);
  });

  it('bakes code-built geometry to a world-space GLB', async () => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 }),
    );
    mesh.position.set(10, 1, -5);
    g.add(mesh);
    const doc = await new NodeIO().readBinary(await object3DToGlb(g, { name: 'box' }));
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const pos = prim.getAttribute('POSITION')?.getArray() as Float32Array;
    let minX = Infinity;
    for (let i = 0; i < pos.length; i += 3) minX = Math.min(minX, pos[i]);
    expect(minX).toBeCloseTo(9, 6);
    expect(prim.getMaterial()?.getRoughnessFactor()).toBeCloseTo(0.9, 6);
  });

  it('names a Proving Shore slice that holds the starter island', () => {
    const s = EXPORT_SLICES.proving_shore;
    expect(EXPORT_SLICES.eastbrook_vale).toEqual(B);
    expect(s.maxX - s.minX).toBe(s.maxZ - s.minZ);
    // the island's hub, Dawnrest Camp, where the server spawns fresh players
    expect(isOnProvingShore(-300, 50)).toBe(true);
    for (const [x, z] of [
      [-300, 50],
      [-540, -180],
      [-181, 179],
    ]) {
      expect(x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ).toBe(true);
    }
  });

  it('writes deterministic vertex-coloured ground cover', async () => {
    const a = await coverGlbs();
    const b = await coverGlbs();
    expect(a.map((c) => c.name)).toContain('grass_clump_a');
    expect(a.some((c) => c.name.startsWith('flower_'))).toBe(true);
    for (const [i, c] of a.entries())
      expect(Buffer.compare(Buffer.from(c.bytes), Buffer.from(b[i].bytes))).toBe(0);
    const doc = await new NodeIO().readBinary(a[0].bytes);
    expect(doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('COLOR_0')).toBeTruthy();
  });
});
