import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import {
  buildMeshTile,
  MESH_CELLS,
  MESH_PER_TILE,
  MESH_VERTS,
  MESH_YD,
  type MeshTileInput,
  meshTileName,
  meshTileToGlb,
} from '../scripts/world_export/ue_terrain_mesh';
import { QUAD_YD, TILE_VERTS } from '../scripts/world_export/ue_tiles';

const n2 = TILE_VERTS * TILE_VERTS;
const weights = (): Uint8Array[] => [
  new Uint8Array(n2).fill(10),
  new Uint8Array(n2).fill(20),
  new Uint8Array(n2).fill(30),
  new Uint8Array(n2).fill(40),
];
const input = (over: Partial<MeshTileInput> = {}): MeshTileInput => ({
  originX: 255,
  originZ: -510,
  height: () => 3,
  weights: weights(),
  uvOrigin: { x: 0, z: -1000 },
  uvSize: { x: 1000, z: 2000 },
  ...over,
});

describe('terrain mesh tiles', () => {
  it('splits a 255 yd tile into 5 x 5 meshes of 102 cells under the Uint16 cap', () => {
    expect(MESH_PER_TILE * MESH_CELLS).toBe(510);
    expect(MESH_YD).toBe(51);
    expect(MESH_VERTS * MESH_VERTS).toBeLessThan(65535);
    expect(meshTileName(3, 12)).toBe('terrain_3_12');
  });

  it('builds a full grid with counter-clockwise faces seen from +Y', () => {
    const m = buildMeshTile(input(), 1, 2);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.vertexCount).toBe(MESH_VERTS * MESH_VERTS);
    expect(m.quadCount).toBe(MESH_CELLS * MESH_CELLS);
    expect(m.indices).toHaveLength(m.quadCount * 6);
    // vertex 0 sits at the sub-mesh corner in the game frame
    expect(Array.from(m.positions.slice(0, 3))).toEqual([
      255 + 102 * QUAD_YD,
      3,
      -510 + 204 * QUAD_YD,
    ]);
    const p = (v: number): number[] => Array.from(m.positions.slice(v * 3, v * 3 + 3));
    const [a, b, c] = [p(m.indices[0]), p(m.indices[1]), p(m.indices[2])];
    const ux = b[0] - a[0];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vz = c[2] - a[2];
    expect(uz * vx - ux * vz).toBeGreaterThan(0); // y component of (b-a) x (c-a)
  });

  it('bakes the splat weights into COLOR_0 and the world-normalized UVs', () => {
    const m = buildMeshTile(input(), 0, 0);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(Array.from(m.colors.slice(0, 4))).toEqual([10, 20, 30, 40]);
    expect(m.uvs[0]).toBeCloseTo((255 - 0) / 1000, 6);
    expect(m.uvs[1]).toBeCloseTo((-510 + 1000) / 2000, 6);
  });

  it('derives normals from the slope, reaching into neighbour tiles', () => {
    // rises 0.5 yd per yd along +x, including past the tile edge
    const m = buildMeshTile(input({ height: (i) => 0.5 * (255 + i * QUAD_YD) }), 0, 0);
    expect(m).not.toBeNull();
    if (!m) return;
    const len = Math.hypot(0.5, 1);
    expect(m.normals[0]).toBeCloseTo(-0.5 / len, 5);
    expect(m.normals[1]).toBeCloseTo(1 / len, 5);
    expect(m.normals[2]).toBeCloseTo(0, 5);
  });

  it('skips a mesh tile that is all padding', () => {
    expect(buildMeshTile(input({ mask: new Uint8Array(n2) }), 2, 2)).toBeNull();
  });

  it('drops padding quads and the vertices only they used', () => {
    // inside only for lattice columns i <= 255, which cuts sub-mesh sx = 2 (i 204..306)
    const mask = new Uint8Array(n2);
    for (let j = 0; j < TILE_VERTS; j++)
      for (let i = 0; i <= 255; i++) mask[j * TILE_VERTS + i] = 255;
    const m = buildMeshTile(input({ mask }), 2, 0);
    expect(m).not.toBeNull();
    if (!m) return;
    const cols = 255 - 204 + 1; // cells whose left corner is inside
    expect(m.quadCount).toBe(cols * MESH_CELLS);
    expect(m.vertexCount).toBe((cols + 1) * MESH_VERTS);
    // sub-mesh sx = 3 starts at i = 306, past the mask: nothing left
    expect(buildMeshTile(input({ mask }), 3, 0)).toBeNull();
  });

  it('writes a glTF that follows the slice terrain convention', async () => {
    const m = buildMeshTile(input(), 0, 0);
    expect(m).not.toBeNull();
    if (!m) return;
    const doc = await new NodeIO().readBinary(await meshTileToGlb('terrain_0_0', m));
    const mesh = doc.getRoot().listMeshes()[0];
    expect(mesh.getName()).toBe('terrain_0_0');
    expect(doc.getRoot().listNodes()[0].getName()).toBe('terrain_0_0');
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    const prim = mesh.listPrimitives()[0];
    expect(prim.listSemantics().sort()).toEqual(['COLOR_0', 'NORMAL', 'POSITION', 'TEXCOORD_0']);
    const color = prim.getAttribute('COLOR_0');
    expect(color?.getNormalized()).toBe(true);
    expect(color?.getType()).toBe('VEC4');
    expect(prim.getIndices()?.getCount()).toBe(m.indices.length);
    expect(prim.getMaterial()).not.toBeNull();
  });
});
