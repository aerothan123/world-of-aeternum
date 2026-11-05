// The painted split-rail fence (scripts/assets/fit_village_fence.mjs) ships
// simplified: the village lays hundreds of rail modules, each a shadow caster.
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';

/** Mirrors FENCE_TRIANGLE_BUDGET in scripts/assets/fit_village_fence.mjs. */
const FENCE_TRIANGLE_BUDGET = 600;

describe('village fence triangle budget', () => {
  it('ships the painted rail at or under its budget', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.read(path.join(process.cwd(), 'public/models/props/fence.glb'));
    let tris = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const p of mesh.listPrimitives()) {
        tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3;
      }
    }
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThanOrEqual(FENCE_TRIANGLE_BUDGET);
  });
});
