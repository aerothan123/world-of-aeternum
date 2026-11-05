import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IncrementalWriter,
  readPreviousFiles,
  stableJson,
} from '../scripts/world_export/ue_manifest';
import { allRoads } from '../scripts/world_export/ue_roads';
import {
  pickHeightEncoding,
  TILE_VERTS,
  tileBounds,
  tileName,
  tilesCovering,
} from '../scripts/world_export/ue_tiles';
import {
  loadRegistryKeys,
  validateAssets,
  validateTileHeights,
} from '../scripts/world_export/ue_validate';
import {
  assetIdOf,
  dungeonWalls,
  exportTileRasters,
  placementToUe,
  polylineMidpoint,
  tileZoneMask,
  worldTiles,
  zoneInfos,
  zonePlacements,
  zoneRoads,
} from '../scripts/world_export/ue_zone_export';
import { DUNGEON_LIST, getActiveWorldContent, ZONES } from '../src/sim/data';
import { WORLD_SEED } from '../src/sim/world_seed';

const zones = zoneInfos();

describe('zone and tile coverage', () => {
  it('lists every zone of the world', () => {
    expect(zones).toHaveLength(ZONES.length);
    expect(new Set(zones.map((z) => z.id)).size).toBe(zones.length);
  });

  it('covers each zone corner and centre with an exported tile, each tile once', () => {
    const tiles = worldTiles(zones);
    const names = tiles.map(tileName);
    expect(new Set(names).size).toBe(names.length);
    const has = (x: number, z: number): boolean =>
      tiles.some((t) => {
        const b = tileBounds(t);
        return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
      });
    for (const { rect } of zones) {
      expect(has(rect.minX, rect.minZ)).toBe(true);
      expect(has(rect.maxX, rect.maxZ)).toBe(true);
      expect(has((rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2)).toBe(true);
    }
  });
});

describe('tile rasters', () => {
  it('keep heights within 1 cm of the sim and ground weights normalised', () => {
    const t = worldTiles(zones)[0];
    const enc = pickHeightEncoding(-50, 300);
    const r = exportTileRasters(t, WORLD_SEED, enc);
    const rep = validateTileHeights(tileName(t), t, r.heights, enc, WORLD_SEED, 17);
    expect(rep.maxVertexErrCm).toBeLessThanOrEqual(1);
    expect(r.layers).toHaveLength(5);
    for (const o of [0, 1000, 130000, r.heights.length - 1]) {
      const sum = r.layers.reduce((a, l) => a + l[o], 0);
      expect(Math.abs(sum - 255)).toBeLessThanOrEqual(6);
    }
  }, 120_000);
});

describe('records', () => {
  it('converts a placement to Unreal space with a registry id', () => {
    const p = placementToUe({
      id: 'a',
      source: 'wells',
      path: '/models/props/well.glb',
      x: 2,
      y: 1.5,
      z: -3,
      rotY: Math.PI / 2,
      fit: { mode: 'maxDim', size: 2 },
      seatOnGround: true,
      approximate: true,
    });
    expect(p.assetId).toBe('props/well');
    expect(p.location).toEqual({ x: 200, y: -300, z: 150 });
    expect(p.yawDeg).toBe(-90);
    expect(p.fit).toEqual({ mode: 'maxDim', sizeUu: 200 });
    expect(p.approximate).toBe(true);
    expect(assetIdOf('/models/foliage/oak_1.glb')).toBe('foliage/oak_1');
  });

  it('finds the length midpoint of a polyline', () => {
    const m = polylineMidpoint([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ]);
    expect(m).toEqual({ x: 10, z: 0 });
  });

  it('gives every road to exactly one zone and includes the Fenbridge and Highwatch streets', () => {
    const roads = allRoads();
    expect(roads.some((r) => r.id.startsWith('fenbridge:') || r.kind === 'road')).toBe(true);
    expect(roads.some((r) => r.id === 'highwatch:stormcrag' || r.id.startsWith('road:'))).toBe(
      true,
    );
    let total = 0;
    for (const z of zones) total += zoneRoads(z, roads, WORLD_SEED).length;
    expect(total).toBe(roads.length);
  });

  it('keeps each placement in the zone that owns it', () => {
    const z = zones.find((x) => x.id === 'eastbrook_vale') ?? zones[0];
    const list = zonePlacements(z, WORLD_SEED, () => null);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p.location.x / 100).toBeGreaterThanOrEqual(z.rect.minX);
      expect(p.location.x / 100).toBeLessThanOrEqual(z.rect.maxX);
    }
  });

  it('exports the wall colliders of every dungeon', () => {
    const d = dungeonWalls();
    expect(d).toHaveLength(DUNGEON_LIST.length);
    expect(d.reduce((a, x) => a + x.walls.length, 0)).toBeGreaterThan(0);
    for (const w of d.flatMap((x) => x.walls)) {
      expect(['box', 'cylinder', 'prism']).toContain(w.shape);
      expect(Number.isFinite(w.location.x + w.location.y + w.location.z)).toBe(true);
    }
  });
});

describe('incremental manifest', () => {
  it('rewrites only changed files and keeps the manifest stable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-export-'));
    const first = new IncrementalWriter(dir, {});
    first.write('a/one.json', '{"a":1}');
    first.write('b.bin', new Uint16Array([1, 2, 3]));
    expect(first.stats).toEqual({ written: 2, unchanged: 0 });
    const mtime = fs.statSync(path.join(dir, 'a/one.json')).mtimeMs;

    const second = new IncrementalWriter(dir, first.files);
    second.write('a/one.json', '{"a":1}');
    second.write('b.bin', new Uint16Array([1, 2, 4]));
    expect(second.stats).toEqual({ written: 1, unchanged: 1 });
    expect(fs.statSync(path.join(dir, 'a/one.json')).mtimeMs).toBe(mtime);
    expect(stableJson({ b: 1, a: { d: 1, c: 2 } })).toBe(stableJson({ a: { c: 2, d: 1 }, b: 1 }));

    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ files: second.files }));
    expect(Object.keys(readPreviousFiles(path.join(dir, 'manifest.json'))).sort()).toEqual([
      'a/one.json',
      'b.bin',
    ]);
    expect(readPreviousFiles(path.join(dir, 'nope.json'))).toEqual({});
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('asset validation', () => {
  it('reports ids missing from the registry instead of failing', () => {
    const mk = (assetId: string) =>
      placementToUe({
        id: assetId,
        source: 's',
        path: `/models/${assetId}.glb`,
        x: 0,
        y: 0,
        z: 0,
        rotY: 0,
        fit: { mode: 'raw', scale: 1 },
        seatOnGround: true,
      });
    const reg = { keys: new Set(['props/well']), found: ['reg.json'] };
    const rep = validateAssets(
      { z1: [mk('props/well'), mk('props/barrel')], z2: [mk('props/barrel')] },
      reg,
    );
    expect(rep.missing).toEqual([{ assetId: 'props/barrel', uses: 2, zones: ['z1', 'z2'] }]);
    expect(rep.referenced).toBe(2);
    expect(loadRegistryKeys(['Z:/does/not/exist.json']).found).toEqual([]);
  });
});

describe('padding cells past the world edge', () => {
  // x 510..765 is the east-most tile column; the world ends at x = 540.
  const edge = { tx: 2, tz: 0 };

  it('marks vertices outside every zone as padding in the tile mask', () => {
    const mask = tileZoneMask(edge, zones);
    const n = TILE_VERTS;
    const b = tileBounds(edge);
    const at = (x: number, z: number): number =>
      mask[Math.round((z - b.minZ) / 0.5) * n + Math.round((x - b.minX) / 0.5)];
    expect(at(520, 50)).toBe(255);
    expect(at(540, 50)).toBe(255);
    expect(at(540.5, 50)).toBe(0);
    expect(at(700, 50)).toBe(0);
  });

  it('gives a tile wholly inside the world no padding', () => {
    const inner = tileZoneMask({ tx: -1, tz: 0 }, zones);
    expect(inner.every((v) => v === 255)).toBe(true);
  });

  it('scores the between-vertex error only on cells inside the zones', () => {
    const enc = pickHeightEncoding(-50, 300);
    const r = exportTileRasters(edge, WORLD_SEED, enc);
    const mask = tileZoneMask(edge, zones);
    const all = validateTileHeights('edge', edge, r.heights, enc, WORLD_SEED, 1);
    const scored = validateTileHeights('edge', edge, r.heights, enc, WORLD_SEED, 1, mask);
    // the unauthored terrain past x = 540 holds a cliff of tens of yards
    expect(all.maxOffGridErrCm).toBeGreaterThan(500);
    expect(scored.maxOffGridErrCm).toBeLessThan(all.maxOffGridErrCm / 5);
    // vertex quantization is still checked everywhere
    expect(scored.maxVertexErrCm).toBe(all.maxVertexErrCm);
  }, 120_000);
});

describe('new player spawn', () => {
  it('lies in tiles that the export writes', () => {
    const w = getActiveWorldContent();
    const area = w.playerSpawnArea ?? {
      minX: w.playerStart.x,
      maxX: w.playerStart.x,
      minZ: w.playerStart.z,
      maxZ: w.playerStart.z,
    };
    const exported = new Set(worldTiles(zones).map(tileName));
    const need = tilesCovering({
      minX: area.minX,
      maxX: area.maxX + 0.001,
      minZ: area.minZ,
      maxZ: area.maxZ + 0.001,
    });
    expect(need.length).toBeGreaterThan(0);
    for (const t of need) expect(exported.has(tileName(t))).toBe(true);
  });
});
