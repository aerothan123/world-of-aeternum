import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  convertColliders,
  convertField,
  convertNodes,
  convertRoads,
  type DesignBox,
  type DesignHeightfield,
  fieldHeightAt,
  framePosts,
  type ImportConfig,
  SERVER_WATER_LEVEL,
} from '../scripts/eastbrook_v2/import_core';
import { rotY } from '../src/sim/collider_shapes';
import { EBV2_FIELD_GRID, EBV2_HEIGHTS_B64 } from '../src/sim/eastbrook_v2/field.generated';
import {
  EBV2_COLLIDER_IDS,
  EBV2_COLLIDERS,
  EBV2_NODES,
  EBV2_POINTS,
  EBV2_TREE_IDS,
  EBV2_TREES,
} from '../src/sim/eastbrook_v2/layout.generated';
import { WATER_LEVEL } from '../src/sim/world';

// The Eastbrook Vale v2 import (scripts/eastbrook_v2/): the pure conversion on small
// fixtures, and the committed generated tables against their manifest. The world
// side (ground, solids, sites) is tests/eastbrook_v2_world.test.ts.

const ROOT = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'data/eastbrook_v2/manifest.json'), 'utf8'));

const cfg = (over: Partial<ImportConfig> = {}): ImportConfig => ({
  yOffset: -8.3,
  clip: { xMin: 0, xMax: 4, zMin: 0, zMax: 4 },
  edgeBand: 1,
  waterEdgeBlend: 2,
  overheadClearance: 2.2,
  flatTop: 0.35,
  corridors: [],
  ...over,
});

function grid(h: (i: number, j: number) => number, ws: (i: number, j: number) => number) {
  const heights: number[][] = [];
  const water: number[][] = [];
  for (let j = 0; j < 7; j++) {
    heights.push([]);
    water.push([]);
    for (let i = 0; i < 7; i++) {
      heights[j].push(h(i, j));
      water[j].push(ws(i, j));
    }
  }
  return {
    grid: { x0: -1, z0: -1, cell_m: 1, nx: 7, nz: 7 },
    sea_level_cm: 400,
    heights,
    water_surface: water,
  } satisfies DesignHeightfield;
}

describe('eastbrook v2 import: conversion', () => {
  it('restates the server waterline the design sea lands on', () => {
    expect(SERVER_WATER_LEVEL).toBe(WATER_LEVEL);
  });

  it('drops dry ground by the y offset and keeps a water cell at its own depth', () => {
    // dry 980 cm everywhere, one pond cell at (2,2) with bed 240 and surface 460
    const hf = grid(
      (i, j) => (i === 3 && j === 3 ? 240 : 980),
      (i, j) => (i === 3 && j === 3 ? 460 : 0),
    );
    const f = convertField(hf, cfg({ waterEdgeBlend: 0 }));
    expect(f.nx).toBe(5);
    expect(f.waterCells).toBe(1);
    expect(fieldHeightAt(f, 0, 0)).toBeCloseTo(9.8 - 8.3, 6);
    // the pond keeps its 2.2 m of water under the server's waterline
    expect(fieldHeightAt(f, 2, 2)).toBeCloseTo(WATER_LEVEL - 2.2, 6);
  });

  it('eases dry ground beside water from the water offset to the flat offset', () => {
    const hf = grid(
      (i, j) => (i === 3 && j === 3 ? 240 : 500),
      (i, j) => (i === 3 && j === 3 ? 460 : 0),
    );
    const f = convertField(hf, cfg({ waterEdgeBlend: 2 }));
    const next = fieldHeightAt(f, 3, 2); // 1 yd from the pond
    const far = fieldHeightAt(f, 0, 0); // beyond the blend
    expect(far).toBeCloseTo(5 - 8.3, 6);
    // the water offset is -8.9 m here (surface 4.6 onto -4.3), the flat one -8.3
    expect(next).toBeLessThan(far);
    expect(next).toBeGreaterThan(5 - 8.9);
  });

  it('turns the design yaw into the server OBB rotation so the long side lies where drawn', () => {
    const f = convertField(
      grid(
        () => 980,
        () => 0,
      ),
      cfg(),
    );
    const box: DesignBox = {
      id: 'b',
      name: 'wall',
      kind: 'box',
      x: 2,
      y: 11,
      z: 2,
      hx: 3,
      hy: 1.5,
      hz: 0.5,
      yaw: 90,
    };
    const out = convertColliders([box], f, cfg());
    expect(out.rows).toHaveLength(1);
    const [, , hw, hd, rot, top] = out.rows[0];
    expect([hw, hd]).toEqual([3, 0.5]);
    // yaw 90 turns the design's local +X onto world +z; the server's rotY must agree
    const end = rotY(hw, 0, rot);
    // rot is stored to 4 decimals, so the end lands within a few hundred-thousandths
    expect(end.x).toBeCloseTo(0, 4);
    expect(Math.abs(end.z)).toBeCloseTo(3, 4);
    expect(top).toBeCloseTo(12.5 - 8.3, 6);
  });

  it('drops overhead slabs, flat paving, tree trunks, node bodies and service props, and opens gate frames', () => {
    const f = convertField(
      grid(
        () => 980,
        () => 0,
      ),
      cfg(),
    );
    const base = { kind: 'box', x: 2, z: 2, hx: 1, hz: 1, yaw: 0 } as const;
    const boxes: DesignBox[] = [
      { ...base, id: 'lintel', name: 'lintel', y: 14, hy: 0.5 },
      { ...base, id: 'paving', name: 'paving', y: 9.85, hy: 0.05 },
      { ...base, id: 'trunk', name: 'tree_forest_001', src: 'env', y: 11, hy: 2 },
      { ...base, id: 'ore', name: 'ore_ebv_01', src: 'env', y: 10, hy: 0.5 },
      { ...base, id: 'board', name: 'Notice_Board', y: 11, hy: 1 },
      { ...base, id: 'frame', name: 'Gate_Frame', y: 12, hy: 3, hx: 0.5, hz: 1.5 },
      { ...base, id: 'outside', name: 'far', x: 40, y: 11, hy: 1 },
    ];
    const out = convertColliders(
      boxes,
      f,
      cfg({ openFrames: ['Gate_Frame'], serviceProps: ['Notice_Board'] }),
      new Set(['ore_ebv_01']),
    );
    expect(out.skipped).toEqual({
      outside: 1,
      overhead: 1,
      flat: 1,
      treeTrunk: 1,
      nodeBody: 1,
      serviceProp: 1,
      openFrame: 1,
    });
    expect(out.ids).toEqual(['frame_post0', 'frame_post1']);
    const posts = framePosts(boxes[5], 0.35);
    expect(posts.map((p) => [p.x, p.z, p.hz])).toEqual([
      [2, 2 - 1.15, 0.35],
      [2, 2 + 1.15, 0.35],
    ]);
  });

  it('clips nodes and roads to the slot and keeps every kind it knows', () => {
    const c = cfg();
    const nodes = convertNodes(
      [
        { id: 't1', kind: 'tree', name: 't', x: 1, y: 10, z: 1 },
        { id: 'o1', kind: 'ore', name: 'o', x: 2, y: 10, z: 2 },
        { id: 'h9', kind: 'herb', name: 'h', x: 99, y: 10, z: 2 },
      ],
      c,
    );
    expect(nodes.trees).toEqual([[1, 1]]);
    expect(nodes.nodes.map((n) => n.id)).toEqual(['o1']);
    expect(nodes.outside).toEqual({ herb: 1 });
    expect(() =>
      convertNodes([{ id: 'x', kind: 'cactus', name: 'x', x: 1, y: 1, z: 1 }], c),
    ).toThrow();
    const roads = convertRoads(
      [
        {
          id: 'r',
          name: 'R',
          width_m: 4,
          points: [
            [1, 1],
            [3, 3],
            [9, 9],
            [2, 2],
            [1, 2],
          ],
        },
      ],
      c,
    );
    expect(roads.map((r) => r.id)).toEqual(['r', 'r#1']);
  });
});

describe('eastbrook v2 import: the committed generated tables', () => {
  it('match the manifest the import wrote beside them', () => {
    const counts = manifest.counts;
    expect(EBV2_FIELD_GRID.nx * EBV2_FIELD_GRID.nz).toBe(counts.fieldCells);
    expect(atob(EBV2_HEIGHTS_B64).length).toBe(counts.fieldCells * 2);
    expect(EBV2_COLLIDERS.length).toBe(counts.colliders);
    expect(EBV2_COLLIDER_IDS.length).toBe(counts.colliders);
    expect(new Set(EBV2_COLLIDER_IDS).size).toBe(counts.colliders);
    expect(EBV2_POINTS.length).toBe(counts.points);
    expect(EBV2_TREES.length).toBe(counts.trees);
    expect(EBV2_TREE_IDS.length).toBe(counts.trees);
    for (const kind of ['ore', 'herb', 'berry', 'fishing'] as const) {
      expect(EBV2_NODES.filter((n) => n.kind === kind).length, kind).toBe(counts.nodes[kind]);
    }
    expect(manifest.source.files['heightfield.json']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keep the field clipped to the eastbrook_vale slot', () => {
    // the slot: x -270..180 (the vale grew west over the old strait), z -180..180
    expect(EBV2_FIELD_GRID).toMatchObject({ x0: -270, z0: -180, nx: 451, nz: 361, yOffset: -8.3 });
    const inSlot = (x: number, z: number) => x >= -270 && x <= 180 && Math.abs(z) <= 180;
    for (const [x, z] of EBV2_TREES) expect(inSlot(x, z), `tree ${x},${z}`).toBe(true);
    for (const [x, z] of EBV2_COLLIDERS) expect(inSlot(x, z), `box ${x},${z}`).toBe(true);
  });

  // The re-run arm: with the Unreal exports on disk (EASTBROOK_V2_SRC), the import
  // in --check mode must find nothing to write. CI has no Unreal checkout, so it
  // skips there; the world crew's re-export is caught on the next local import.
  const src = process.env.EASTBROOK_V2_SRC;
  it.skipIf(!src || !existsSync(join(src ?? '', 'heightfield.json')))(
    'is current against the design exports named by EASTBROOK_V2_SRC',
    () => {
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/eastbrook_v2/import_eastbrook_v2.ts',
          '--src',
          src!,
          '--check',
        ],
        { cwd: ROOT, stdio: 'pipe' },
      );
    },
    120_000,
  );
});
