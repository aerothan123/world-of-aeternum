// Freshness and shape pins for the W4 M19 tutorial export to the native client
// (scripts/unreal/tutorial_export.ts): the Proving Shore tutorial view suites the Unreal tests
// `Wyndlewood.Progression.Parity.Tutorial*` replay. Regenerate with UNREAL_PARITY_UPDATE=1.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARITY_EXPORT_SUBDIR } from '../scripts/unreal/parity_export';
import { PROTOCOL_EXPORT_DIR } from '../scripts/unreal/protocol_export';
import {
  buildTutorialSuite,
  TUTORIAL_PARITY_SUITES,
  type TutorialCard,
  tutorialChainIds,
} from '../scripts/unreal/tutorial_export';
import { BIND_ACTIONS } from '../src/game/keybinds';
import { PROVING_SHORE_QUEST_ORDER } from '../src/sim/content/proving_shore';

const DIR = join(resolve(import.meta.dirname, '..'), PROTOCOL_EXPORT_DIR);
const UPDATE = process.env.UNREAL_PARITY_UPDATE === '1';

describe('unreal tutorial parity export', () => {
  for (const name of Object.keys(TUTORIAL_PARITY_SUITES)) {
    it(`committed suite ${name} is fresh`, () => {
      const fresh = buildTutorialSuite(name);
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

  it('every exported bind is a real keybind id', () => {
    const ids = new Set(BIND_ACTIONS.map((a) => a.id));
    for (const c of buildTutorialSuite('tutorial_view').cases) {
      const card = c.out as unknown as TutorialCard;
      for (const p of card.params) expect(ids.has(p.bind)).toBe(true);
      for (const k of card.keycaps) expect(ids.has(k)).toBe(true);
    }
  });

  it('the chain opens on the ladder, visits every station in rail order, and ends on the bell', () => {
    const ids = tutorialChainIds();
    expect(ids[0]).toBe('bootcamp:talk');
    expect(ids[ids.length - 1]).toBe('bell');
    let last = -1;
    for (const quest of PROVING_SHORE_QUEST_ORDER.slice(1)) {
      const at = ids.indexOf(`coach:${quest}:available`);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    expect(ids).toContain('ring:equip');
  });
});
