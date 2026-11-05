import { describe, expect, it } from 'vitest';
import {
  simToUe,
  simYawToUeYawDeg,
  ueToSim,
  ueYawDegToSimYaw,
} from '../scripts/world_export/ue_space';
import {
  decodeHeight,
  encodeHeight,
  pickHeightEncoding,
  TILE_VERTS,
  TILE_YD,
  tileBounds,
  tileName,
  tileOf,
  tilesCovering,
} from '../scripts/world_export/ue_tiles';

describe('FSimSpace equivalent', () => {
  it('maps (x, y, z) to UE (X, Y, Z) = (x, z, y) * 100', () => {
    expect(simToUe(1, 2, 3)).toEqual({ x: 100, y: 300, z: 200 });
    expect(simToUe(-0.5, 0.25, 12)).toEqual({ x: -50, y: 1200, z: 25 });
  });

  it('round-trips positions', () => {
    const p = ueToSim(simToUe(-14.25, 7.5, -100.125));
    expect(p.x).toBeCloseTo(-14.25, 6);
    expect(p.y).toBeCloseTo(7.5, 6);
    expect(p.z).toBeCloseTo(-100.125, 6);
  });

  it('negates yaw and keeps the facing direction', () => {
    // sim local +X after rotY is (cos, -sin) in (x, z); UE yaw psi gives (cos, sin) in (X, Y)
    for (const rotY of [0, 0.5, 1.7, -2.2, Math.PI]) {
      const psi = (simYawToUeYawDeg(rotY) * Math.PI) / 180;
      expect(Math.cos(psi)).toBeCloseTo(Math.cos(rotY), 3);
      const sim = { x: Math.cos(rotY), z: -Math.sin(rotY) };
      const ue = simToUe(sim.x, 0, sim.z);
      expect(Math.sin(psi) * 100).toBeCloseTo(ue.y, 1);
    }
    expect(ueYawDegToSimYaw(simYawToUeYawDeg(1.1))).toBeCloseTo(1.1, 4);
  });

  it('keeps yaw in (-180, 180]', () => {
    expect(simYawToUeYawDeg(Math.PI)).toBe(180);
    expect(simYawToUeYawDeg(-Math.PI)).toBe(180);
    expect(simYawToUeYawDeg(Math.PI * 2)).toBe(0);
  });
});

describe('landscape tile grid', () => {
  it('is a 511 vertex, 255 yard tile', () => {
    expect(TILE_VERTS).toBe(511);
    expect(TILE_YD).toBe(255);
  });

  it('names tiles with a sign letter', () => {
    expect(tileName({ tx: -2, tz: 5 })).toBe('tile_n02_p05');
    expect(tileName({ tx: 0, tz: 0 })).toBe('tile_p00_p00');
  });

  it('finds the tile of a point on the origin grid', () => {
    expect(tileOf(0, 0)).toEqual({ tx: 0, tz: 0 });
    expect(tileOf(-0.1, 254.9)).toEqual({ tx: -1, tz: 0 });
    expect(tileOf(255, 255)).toEqual({ tx: 1, tz: 1 });
    const b = tileBounds({ tx: -1, tz: 2 });
    expect(b).toEqual({ minX: -255, maxX: 0, minZ: 510, maxZ: 765 });
  });

  it('covers a zone without touching-edge tiles and without gaps', () => {
    const zone = { minX: -180, maxX: 180, minZ: -180, maxZ: 180 };
    const tiles = tilesCovering(zone);
    expect(tiles).toHaveLength(4);
    const aligned = tilesCovering({ minX: 0, maxX: 255, minZ: 0, maxZ: 255 });
    expect(aligned).toEqual([{ tx: 0, tz: 0 }]);
  });
});

describe('height encoding', () => {
  it('stays within 1 cm over a 400 m range', () => {
    const enc = pickHeightEncoding(-20, 380);
    expect(enc.stepCm).toBeLessThan(1);
    for (const h of [-20, 0, 12.3456, 199.999, 380]) {
      const back = decodeHeight(encodeHeight(h, enc), enc);
      expect(Math.abs(back - h) * 100).toBeLessThanOrEqual(enc.stepCm / 2 + 1e-6);
    }
  });

  it('raises the scale only when the range needs it', () => {
    expect(pickHeightEncoding(0, 100).scaleZ).toBe(100);
    expect(pickHeightEncoding(0, 1000).scaleZ).toBeGreaterThan(100);
  });
});
