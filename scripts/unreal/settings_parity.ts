// Parity suites for the native client's settings and input port (W11, ea-plan.md section 3.2).
// The C++ keybind model (WyndlewoodSettings/WyndKeybinds) loads the registry suite as its action
// table and must reproduce every conflict case: the eviction look-ahead (findBindConflict), what
// a bind leaves behind, the refusal reasons, combo canonicalization and the slot reset.
// Registered in scripts/unreal/parity_export.ts PARITY_SUITES.

import { BIND_ACTIONS, bindRefusalReason, canonicalCombo, Keybinds } from '../../src/game/keybinds';
import {
  BIND_ACTION_LABEL_KEYS,
  BIND_CATEGORY_LABEL_KEYS,
} from '../../src/ui/keybind_action_names_core';
import type { ParityCase, ParitySuite } from './parity_export';

/** The rebindable action table: id, category, held or edge, two defaults, the shared flag. */
export function keybindRegistry(): ParitySuite {
  return {
    suite: 'keybind_registry',
    source: 'src/game/keybinds.ts BIND_ACTIONS',
    note: "order is the registry order; '' is no default; category is the English category name",
    cases: BIND_ACTIONS.map((a) => ({
      in: { id: a.id },
      out: {
        category: a.category,
        kind: a.kind,
        d0: a.defaults[0] ?? '',
        d1: a.defaults[1] ?? '',
        shared: a.allowShared === true,
        // The row label key (keybind_action_names_core.ts); '' for a slot or an unmapped id, which
        // the client names as the web does (attack, numbered slot, registry label).
        labelKey: BIND_ACTION_LABEL_KEYS[a.id] ?? '',
        categoryKey: BIND_CATEGORY_LABEL_KEYS[a.category] ?? '',
      },
    })),
  };
}

/** Bindings that differ from the defaults, as id -> [primary, secondary] ('' is unbound). */
function changedFromDefaults(kb: Keybinds): Record<string, string[]> {
  const fresh = new Keybinds().snapshot();
  const now = kb.snapshot();
  const out: Record<string, string[]> = {};
  for (const id of Object.keys(now)) {
    const a = now[id] ?? [];
    const b = fresh[id] ?? [];
    if (a[0] !== b[0] || a[1] !== b[1]) out[id] = [a[0] ?? '', a[1] ?? ''];
  }
  return out;
}

/** Steps run before a probe: 'bind|id|index|combo', 'clear|id|index', 'resetSlots', ';'-joined. */
function runSteps(kb: Keybinds, steps: string): void {
  if (steps === '') return;
  for (const step of steps.split(';')) {
    const [op, id = '', index = '0', combo = ''] = step.split('|');
    if (op === 'bind') kb.bind(id, Number(index), combo);
    else if (op === 'clear') kb.clear(id, Number(index));
    else if (op === 'resetSlots') kb.resetSlots();
    else throw new Error(`unknown step ${step}`);
  }
}

const PROBE_COMBOS = [
  'KeyW',
  'Shift+KeyW',
  'KeyQ',
  'KeyE',
  'Digit1',
  'Shift+Digit1',
  'Ctrl+Digit1',
  'Meta+Digit1',
  'Numpad1',
  'Shift+Numpad1',
  'Space',
  'Tab',
  'KeyA',
  'KeyM',
  'F1',
  'Escape',
  'Mouse1',
  'Mouse2',
  'Mouse4',
  'WheelUp',
  'Ctrl+WheelDown',
  'ShiftLeft',
  'ControlLeft',
  'Backquote',
];

const SCENARIOS = [
  '',
  'bind|slot1|0|KeyQ',
  'bind|forward|0|KeyQ;bind|slot2|1|KeyW',
  'clear|forward|0;clear|forward|1',
  'bind|slot12|0|Digit1;resetSlots',
  'bind|slot5|0|Shift+Digit1;bind|jump|1|Mouse4',
];

const CANON_INPUTS = [
  'KeyA',
  'Shift+KeyA',
  'Shift+Ctrl+KeyA',
  'Meta+Alt+Shift+Ctrl+Digit1',
  'Shift+Shift+KeyA',
  'Alt+ControlRight',
  'ControlLeft',
  'Hyper+KeyA',
  'Key-A',
  '',
  '+KeyA',
  'Mouse4',
  'Ctrl+WheelUp',
];

/** The rebind rules the options window and the on-bar mode share (findBindConflict, bind). */
export function keybindConflicts(): ParitySuite {
  const ids = BIND_ACTIONS.map((a) => a.id);
  // After a scenario, probe the actions it touched plus a held, an edge and every shared action.
  const scenarioIds = ids.filter(
    (id) =>
      ['forward', 'back', 'jump', 'slot0', 'slot1', 'slot2', 'slot5', 'slot12', 'slot23'].includes(
        id,
      ) || BIND_ACTIONS.some((a) => a.id === id && a.allowShared === true),
  );
  const cases: ParityCase[] = [];
  for (const steps of SCENARIOS) {
    const base = new Keybinds();
    base.reset();
    runSteps(base, steps);
    cases.push({ in: { kind: 'state', steps }, out: { changed: changedFromDefaults(base) } });
    for (const id of steps === '' ? ids : scenarioIds) {
      for (const combo of PROBE_COMBOS) {
        for (const index of steps === '' ? [0, 1] : [0]) {
          const kb = new Keybinds();
          kb.reset();
          runSteps(kb, steps);
          const conflict = kb.findBindConflict(id, index, combo);
          const ok = kb.bind(id, index, combo);
          cases.push({
            in: { kind: 'bind', steps, id, index, combo },
            out: {
              conflict: conflict === null ? null : { ...conflict },
              ok,
              changed: changedFromDefaults(kb),
            },
          });
        }
      }
    }
  }
  for (const id of ids) {
    for (const combo of PROBE_COMBOS) {
      cases.push({
        in: { kind: 'refuse', id, combo },
        out: { reason: bindRefusalReason(id, combo) ?? '' },
      });
    }
  }
  for (const raw of CANON_INPUTS) {
    cases.push({ in: { kind: 'canon', raw }, out: { combo: canonicalCombo(raw) ?? '' } });
  }
  return {
    suite: 'keybind_conflicts',
    source:
      'src/game/keybinds.ts Keybinds.findBindConflict, bind, clear, resetSlots; bindRefusalReason; canonicalCombo',
    note: "every bind case starts from defaults, runs steps, probes findBindConflict then bind; '' is unbound or null",
    cases,
  };
}
