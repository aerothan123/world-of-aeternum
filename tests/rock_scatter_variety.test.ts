import { describe, expect, it } from 'vitest';
import {
  rockGrassBlocked,
  rockGrassDisc,
  rockGrassMaxReach,
} from '../src/render/rock_grass_clear_core';
import {
  decorationHasCollider,
  decorationScale,
  ROCK_LANDMARK_SCALE,
  rockHeightOf,
  rockRadius,
} from '../src/sim/decoration_dims';
import { generateDecorations, generateDecorationsInBounds } from '../src/sim/world';

const SEED = 1337;

describe('rock scatter size variety', () => {
  it('keeps the historic tree roll and is deterministic', () => {
    for (let i = 0; i < 200; i++) {
      const s = decorationScale('tree', i * 7, i * 3, SEED);
      expect(s).toBeGreaterThanOrEqual(0.7);
      expect(s).toBeLessThanOrEqual(1.6);
      expect(decorationScale('tree', i * 7, i * 3, SEED)).toBe(s);
    }
  });

  it('rolls a few landmark boulders and some dressing stones in the live field', () => {
    const rocks = generateDecorations(SEED).filter((d) => d.kind === 'rock');
    expect(rocks.length).toBeGreaterThan(100);
    const landmarks = rocks.filter((d) => d.scale >= ROCK_LANDMARK_SCALE[0]);
    const small = rocks.filter((d) => d.scale < 0.7);
    expect(landmarks.length / rocks.length).toBeGreaterThan(0.02);
    expect(landmarks.length / rocks.length).toBeLessThan(0.09);
    expect(small.length / rocks.length).toBeGreaterThan(0.08);
    const max = ROCK_LANDMARK_SCALE[0] + ROCK_LANDMARK_SCALE[1];
    for (const d of rocks) expect(d.scale).toBeLessThanOrEqual(max + 1e-9);
  });

  it('gives every landmark a collider sized from the same scale the renderer reads', () => {
    const rocks = generateDecorations(SEED).filter(
      (d) => d.kind === 'rock' && d.scale >= ROCK_LANDMARK_SCALE[0],
    );
    for (const d of rocks) {
      expect(decorationHasCollider(d)).toBe(true);
      // 1.9 scale x 0.84 yd x the 0.8 low end of the per-rock height roll
      expect(rockHeightOf(d, SEED)).toBeGreaterThan(1.25);
      expect(rockRadius(d.scale)).toBeGreaterThan(1.3);
    }
  });

  it('bounded generation agrees with the full field (the collider source)', () => {
    const bounds = { minX: -420, maxX: -300, minZ: -80, maxZ: 40 };
    const full = generateDecorations(SEED).filter(
      (d) => d.x >= bounds.minX && d.x <= bounds.maxX && d.z >= bounds.minZ && d.z <= bounds.maxZ,
    );
    const local = generateDecorationsInBounds(SEED, bounds);
    const key = (d: { x: number; z: number; scale: number }) => `${d.x}|${d.z}|${d.scale}`;
    expect(new Set(local.map(key))).toEqual(new Set(full.map(key)));
  });
});

describe('refined rock grass collar', () => {
  it('clears the foot, thins the ring, leaves the meadow', () => {
    const disc = rockGrassDisc(0, 0, 1.2);
    expect(rockGrassBlocked([disc], 0.3, 0.2)).toBe(true);
    expect(rockGrassBlocked([disc], rockGrassMaxReach(1.2) + 0.05, 0)).toBe(false);
    let kept = 0;
    let total = 0;
    const hard = Math.sqrt(disc.hard2);
    const soft = Math.sqrt(disc.soft2);
    for (let a = 0; a < 400; a++) {
      const r = hard + ((soft - hard) * (a % 20)) / 20;
      const th = a * 0.37;
      total++;
      if (!rockGrassBlocked([disc], Math.cos(th) * r, Math.sin(th) * r)) kept++;
    }
    expect(kept / total).toBeGreaterThan(0.45);
    expect(kept / total).toBeLessThan(0.95);
  });

  it('collar scales with the rock and covers the visual footprint', () => {
    for (const s of [0.42, 1, 2.7]) {
      const d = rockGrassDisc(0, 0, s);
      // a rendered rock is about 1.08 * scale across: radius 0.54 * scale
      expect(Math.sqrt(d.hard2)).toBeGreaterThan(0.54 * s);
      expect(d.soft2).toBeGreaterThan(d.hard2);
    }
  });
});
