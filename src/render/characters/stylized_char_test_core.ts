// The stylized character TEST (owner look review, not a shipping lane): two
// hand-painted test bodies that stand in for the male warrior player and one
// Eastbrook townsperson, ONLY when a dev session opts in with
// `?stylizedchars=1`. Default visuals are untouched: with the flag off (every
// production build, every headless host, every test) `stylizedTestRigKey`
// answers null and no def is registered.
//
// Pure and three-free: the switch, the entity-to-key rule and the defs as data
// derived from the shipped WOC warrior def (same skeleton, same animation
// library, same ClipMap and weapon attach), so the test bodies animate through
// the existing dispatch (visualKeyFor / ClipMap / VisualDef) and invent nothing.
// What differs is the mesh: one skinned body (head included) refit onto the
// WOC_Armored_Rig by scripts/assets/stylized_char_test/fit_woc_rig.mjs.

import type { Entity } from '../../sim/types';
import type { VisualDef } from './manifest';

/** The URL switch, read once per session. */
export const STYLIZED_CHARS_PARAM = 'stylizedchars';

/** The two test keys. */
export const STYLIZED_WARRIOR_KEY = 'test_stylized_warrior';
export const STYLIZED_TOWNSFOLK_KEY = 'test_stylized_quartermaster';

/** The Eastbrook townsperson the test body stands in for (zone1.ts). */
export const STYLIZED_TOWNSFOLK_TEMPLATE = 'trader_wilkes';

const TEST_DIR = 'models/chars/test_stylized';
export const STYLIZED_WARRIOR_URL = `${TEST_DIR}/warrior_stylized.glb`;
export const STYLIZED_TOWNSFOLK_URL = `${TEST_DIR}/quartermaster_stylized.glb`;

/** True when `search` (a location.search string) opts in. Only `1`/`on` do. */
export function stylizedCharsRequested(search: string): boolean {
  const v = new URLSearchParams(search).get(STYLIZED_CHARS_PARAM);
  return v === '1' || v === 'on';
}

/** The test key an entity draws with while the test is on, else null. A
 *  warrior player of either body pick and the one townsperson; nothing else. */
export function stylizedTestKeyFor(
  e: Pick<Entity, 'kind' | 'templateId'>,
  enabled: boolean,
): string | null {
  if (!enabled) return null;
  if (e.kind === 'player' && e.templateId === 'warrior') return STYLIZED_WARRIOR_KEY;
  if (e.kind === 'npc' && e.templateId === STYLIZED_TOWNSFOLK_TEMPLATE) {
    return STYLIZED_TOWNSFOLK_KEY;
  }
  return null;
}

/** The two defs, derived from the WOC warrior def: its animation library,
 *  ClipMap, gait refs and weapon layout ride along unchanged; the WOC-only
 *  composition (`wocCharacter`: split armor, streamed head) does not, because
 *  each test body is one finished mesh. The townsperson holds nothing. */
export function stylizedTestDefs(warrior: VisualDef): Record<string, VisualDef> {
  const { wocCharacter: _woc, ...shared } = warrior;
  return {
    [STYLIZED_WARRIOR_KEY]: { ...shared, url: STYLIZED_WARRIOR_URL, lazyPreload: true },
    [STYLIZED_TOWNSFOLK_KEY]: {
      ...shared,
      url: STYLIZED_TOWNSFOLK_URL,
      lazyPreload: true,
      attach: [],
      weaponSlots: [],
      offhandSlot: undefined,
    },
  };
}
