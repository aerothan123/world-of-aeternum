// The emote wheel's per-character slot persistence, extracted from the Hud
// coordinator (tests/monolith_budget.test.ts ratchet). Storage is injected, so
// this module reaches no host global; the keys and the one-time migration that
// seeds the "question" emote are unchanged from the inline version.

import { isOverheadEmoteId, type OverheadEmoteId } from '../world_api';
import { DEFAULT_EMOTE_WHEEL, EMOTE_WHEEL_LIMIT } from './emote_wheel_defaults';
import { emoteWheelSlotsKey, emoteWheelVersionKey } from './emote_wheel_keys';

type EmoteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Load a character's wheel slots (deduped, capped, migrated once). */
export function loadEmoteWheelSlots(
  storage: EmoteStorage,
  playerClass: string,
  name: string,
): OverheadEmoteId[] {
  const key = emoteWheelSlotsKey(playerClass, name);
  const versionKey = emoteWheelVersionKey(playerClass, name);
  let raw: unknown = null;
  try {
    raw = JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    /* corrupt */
  }
  const ids = Array.isArray(raw) ? raw.filter(isOverheadEmoteId) : [];
  const deduped = ids.filter((id, i) => ids.indexOf(id) === i).slice(0, EMOTE_WHEEL_LIMIT);
  let migrated = false;
  try {
    migrated = storage.getItem(versionKey) === '1';
  } catch {
    /* storage unavailable */
  }
  if (deduped.length > 0 && !migrated && !deduped.includes('question')) {
    deduped.splice(2, 0, 'question');
    deduped.length = Math.min(deduped.length, EMOTE_WHEEL_LIMIT);
    try {
      storage.setItem(key, JSON.stringify(deduped));
      storage.setItem(versionKey, '1');
    } catch {
      /* storage unavailable */
    }
  }
  return deduped.length > 0 ? deduped : [...DEFAULT_EMOTE_WHEEL];
}

/** Persist a character's wheel slots and mark the migration done. */
export function saveEmoteWheelSlots(
  storage: EmoteStorage,
  playerClass: string,
  name: string,
  slots: readonly OverheadEmoteId[],
): void {
  try {
    storage.setItem(emoteWheelSlotsKey(playerClass, name), JSON.stringify(slots));
    storage.setItem(emoteWheelVersionKey(playerClass, name), '1');
  } catch {
    /* storage unavailable */
  }
}
