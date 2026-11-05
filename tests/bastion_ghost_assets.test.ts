import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The captain and the sailor wear rebuilt bodies on the WOC rig now
// (refit_enemy_looks.ts); the ship keeps its ghost-crew build (scripts/assets/bastion_ghost_crew/).
const FILES: Record<string, string> = {};

function asset(name: string, folder = 'creatures') {
  const bytes = readFileSync(
    `public/models/${folder}/${FILES[name] ?? `bastion_ghost_${name}`}.glb`,
  );
  expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  return JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
}

describe('Bastion authored spectral assets', () => {
  it('ship ships as a bounded compressed mesh without texture allocations', () => {
    const glb = asset('ship', 'props');
    expect(glb.meshes.length).toBe(1);
    expect(glb.images ?? []).toHaveLength(0);
    expect(glb.extensionsUsed).toContain('EXT_meshopt_compression');
    expect(glb.materials.some((m: { name: string }) => m.name === 'glow')).toBe(true);
  });
});
