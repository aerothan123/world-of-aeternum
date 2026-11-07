import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRIP_MAX_X, STRIP_MIN_X, ZONES } from '../src/sim/data';
import { groundHeight, waterLevelAt } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// W17: the sim's own floor and waterline per zone, for the Unreal client's self
// predictor (its kernel reads ground and water from here instead of tracing the
// drawn tiles, which do not carry every carved bed). One little-endian int16
// grid per field, in centimetres, at STEP yards; the client samples bilinearly.
// The waterline is NO_WATER where waterLevelAt is -Infinity.
//
// UNREAL_HEIGHTFIELD_OUT=<dir> writes <zone>.ground.bin, <zone>.water.bin and
// heightfields.json; UNREAL_HEIGHTFIELD_ZONES=a,b limits the zones (default
// every zone; EA is every zone up to proving_shore, the frontier excluded);
// UNREAL_HEIGHTFIELD_STEP sets the grid step in yards (default 1). Without the out dir the test only lists the zones and checks a
// sample round-trips.

const STEP = Number(process.env.UNREAL_HEIGHTFIELD_STEP ?? '1');
const NO_WATER = -32768;

interface ZoneRect {
  id: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

function rects(): ZoneRect[] {
  return ZONES.map((z) => ({
    id: z.id,
    xMin: z.xMin ?? STRIP_MIN_X,
    xMax: z.xMax ?? STRIP_MAX_X,
    zMin: z.zMin,
    zMax: z.zMax,
  }));
}

function cm(v: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(v * 100)));
}

function grid(r: ZoneRect) {
  const nx = Math.floor((r.xMax - r.xMin) / STEP) + 1;
  const nz = Math.floor((r.zMax - r.zMin) / STEP) + 1;
  const ground = new Int16Array(nx * nz);
  const water = new Int16Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = r.zMin + j * STEP;
    for (let i = 0; i < nx; i++) {
      const x = r.xMin + i * STEP;
      ground[j * nx + i] = cm(groundHeight(x, z, WORLD_SEED));
      const w = waterLevelAt(x, z, WORLD_SEED);
      water[j * nx + i] = Number.isFinite(w) ? cm(w) : NO_WATER;
    }
  }
  return { nx, nz, ground, water };
}

describe('unreal heightfield export', () => {
  it('samples each zone floor and waterline', () => {
    const all = rects();
    const wanted = (process.env.UNREAL_HEIGHTFIELD_ZONES ?? '').split(',').filter(Boolean);
    const chosen = wanted.length ? all.filter((r) => wanted.includes(r.id)) : all;
    for (const r of all) console.log(`zone ${r.id} x ${r.xMin}..${r.xMax} z ${r.zMin}..${r.zMax}`);
    const out = process.env.UNREAL_HEIGHTFIELD_OUT;
    if (!out) {
      const g = grid({ ...chosen[0], xMax: chosen[0].xMin + 2, zMax: chosen[0].zMin + 2 });
      expect(g.ground[0] / 100).toBeCloseTo(
        groundHeight(chosen[0].xMin, chosen[0].zMin, WORLD_SEED),
        1,
      );
      return;
    }
    if (!existsSync(out)) mkdirSync(out, { recursive: true });
    const manifest = {
      source: 'tests/unreal_heightfield_export.test.ts',
      step: STEP,
      unit: 'cm int16 little-endian, row-major (z rows of x)',
      noWater: NO_WATER,
      zones: [] as Array<ZoneRect & { nx: number; nz: number }>,
    };
    for (const r of chosen) {
      const g = grid(r);
      writeFileSync(join(out, `${r.id}.ground.bin`), Buffer.from(g.ground.buffer));
      writeFileSync(join(out, `${r.id}.water.bin`), Buffer.from(g.water.buffer));
      manifest.zones.push({ ...r, nx: g.nx, nz: g.nz });
    }
    writeFileSync(join(out, 'heightfields.json'), `${JSON.stringify(manifest, null, 1)}\n`);
    expect(manifest.zones.length).toBeGreaterThan(0);
  }, 600_000);
});
