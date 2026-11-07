// Freshness and shape pins for the W6 map exports to the native client
// (scripts/unreal/map_export.ts): the parity suites the Unreal tests `Wyndlewood.Map.Parity.*`
// replay and the map content the client's minimap and zone map read.
// Regenerate with UNREAL_PARITY_UPDATE=1 on this test.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMapContent,
  buildMapSuite,
  MAP_CONTENT_FILE,
  MAP_EXPORT_SUBDIR,
  MAP_PARITY_SUITES,
} from '../scripts/unreal/map_export';
import { PARITY_EXPORT_SUBDIR } from '../scripts/unreal/parity_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

type Marker = { kind: string; ref: string; wx: number; wz: number; mx: number; my: number };

describe('unreal map parity export', () => {
  for (const name of Object.keys(MAP_PARITY_SUITES)) {
    it(`committed suite ${name} is fresh`, () => {
      const fresh = buildMapSuite(name);
      expect(fresh.suite).toBe(name);
      expect(fresh.cases.length).toBeGreaterThan(0);
      const dir = join(DIR, PARITY_EXPORT_SUBDIR);
      const path = join(dir, `${name}.json`);
      if (UPDATE) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path, `${JSON.stringify(fresh, null, 2)}\n`);
      }
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
    });
  }

  it('the minimap suite covers quest, node, project and party markers', () => {
    const kinds = new Set<string>();
    for (const c of buildMapSuite('map_minimap_markers').cases) {
      for (const m of (c.out as { markers: Marker[] }).markers) kinds.add(m.kind);
    }
    for (const k of [
      'npc',
      'gather-node',
      'town-project',
      'party-disc',
      'party-arrow',
      'player',
      'ally',
      'corpse',
    ]) {
      expect(kinds.has(k), k).toBe(true);
    }
  });

  it('the zone suite covers quest areas, quest givers, landmarks and a ping', () => {
    const outs = buildMapSuite('map_zone_frame').cases.map(
      (c) => c.out as Record<string, unknown[] | unknown>,
    );
    const any = (k: string) => outs.some((o) => Array.isArray(o[k]) && (o[k] as []).length > 0);
    for (const k of ['questAreas', 'npcs', 'stations', 'party']) expect(any(k), k).toBe(true);
    expect(outs.some((o) => o.ping !== null)).toBe(true);
  });
});

describe('unreal map content export', () => {
  it('committed content is fresh', () => {
    const fresh = buildMapContent();
    const dir = join(DIR, MAP_EXPORT_SUBDIR);
    const path = join(dir, MAP_CONTENT_FILE);
    if (UPDATE) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, `${JSON.stringify(fresh)}\n`);
    }
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('carries zones, nodes, stations and town projects', () => {
    const c = buildMapContent();
    expect(c.zones.length).toBeGreaterThan(0);
    expect(c.gatherNodes.length).toBeGreaterThan(0);
    expect(c.stations.length).toBeGreaterThan(0);
    expect(c.townProjects.length).toBeGreaterThan(0);
  });
});
