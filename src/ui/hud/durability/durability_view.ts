// The HUD durability indicator (classic armor figure): a pure, DOM-free core
// over the worn gear. Hidden while every piece is above the low threshold;
// tinted LOW when any piece is under DURABILITY_LOW_FRACTION of its maximum,
// BROKEN when any piece is at zero (a broken piece grants nothing,
// src/sim/durability/). Reads IWorld.equipment / equipmentInstances, so both
// worlds paint the same thing.

import {
  DURABILITY_SLOTS,
  type DurabilityState,
  durabilityState,
} from '../../../sim/durability/durability_rules';
import type { EquipSlot, ItemDef, ItemInstancePayload } from '../../../sim/types';
import { t } from '../../i18n';

export interface DurabilityView {
  state: DurabilityState;
  /** The accessible label and tooltip ('' while hidden). */
  label: string;
}

const HIDDEN: DurabilityView = { state: 'ok', label: '' };

export function durabilityView(
  equipment: Partial<Record<EquipSlot, string>>,
  instances: Partial<Record<EquipSlot, ItemInstancePayload>>,
  items: Readonly<Record<string, ItemDef>>,
): DurabilityView {
  let worst: DurabilityState = 'ok';
  for (const slot of DURABILITY_SLOTS) {
    const id = equipment[slot];
    if (!id) continue;
    const s = durabilityState(items[id], instances[slot]?.wear);
    if (s === 'broken') {
      worst = 'broken';
      break;
    }
    if (s === 'low') worst = 'low';
  }
  if (worst === 'ok') return HIDDEN;
  return {
    state: worst,
    label: t(worst === 'broken' ? 'hudChrome.durability.broken' : 'hudChrome.durability.low'),
  };
}
