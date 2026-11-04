import { describe, expect, it } from 'vitest';
import {
  GATHER_NODE_VARIANTS,
  gatherNodeVariantFor,
  gatherNodeVariantType,
  nodeShowsDepleted,
} from '../src/render/gather_node_variant_core';
import { activeGatherNodes } from '../src/sim/data';
import { NODE_MATERIAL_TABLE } from '../src/sim/professions/gathering_materials';

describe('gather node variant core', () => {
  it('draws each node as the material its zone yields', () => {
    expect(gatherNodeVariantFor('ore', 'eastbrook_vale')).toBe('ore_copper');
    expect(gatherNodeVariantFor('ore', 'mirefen_marsh')).toBe('ore_iron');
    expect(gatherNodeVariantFor('herb', 'eastbrook_vale')).toBe('herb_silverleaf');
    expect(gatherNodeVariantFor('herb', 'mirefen_marsh')).toBe('herb_goldleaf');
    expect(gatherNodeVariantFor('herb', 'thornpeak_heights')).toBe('herb_sunpetal');
  });

  it('gives every shipped ore and herb node an authored variant of its own type', () => {
    const nodes = activeGatherNodes().filter((n) => n.type === 'ore' || n.type === 'herb');
    expect(nodes.length).toBeGreaterThan(50);
    for (const node of nodes) {
      const variant = gatherNodeVariantFor(node.type, node.zoneId);
      expect(variant, node.id).not.toBeNull();
      if (variant) expect(gatherNodeVariantType(variant)).toBe(node.type);
    }
    // Every authored variant is reachable from the material table.
    const reachable = new Set(
      (['ore', 'herb'] as const).flatMap((type) =>
        Object.keys(NODE_MATERIAL_TABLE[type]).map((zone) => gatherNodeVariantFor(type, zone)),
      ),
    );
    for (const variant of GATHER_NODE_VARIANTS) expect(reachable.has(variant), variant).toBe(true);
  });

  it('leaves a material with no authored model on the shared type model', () => {
    expect(gatherNodeVariantFor('wood', 'eastbrook_vale')).toBeNull();
  });

  it('reads harvested only while the viewer timer is running', () => {
    expect(nodeShowsDepleted(null)).toBe(false);
    expect(nodeShowsDepleted(0)).toBe(false);
    expect(nodeShowsDepleted(0.05)).toBe(true);
    expect(nodeShowsDepleted(240)).toBe(true);
  });
});
