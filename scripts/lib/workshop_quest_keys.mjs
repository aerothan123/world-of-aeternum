// Quest Workshop i18n rows: the ONE shared rule for which catalog keys belong to
// the owner's workshop quests (src/sim/content/workshop_quests.generated.ts).
//
// A workshop quest's text is player-visible English that resolves through
// tEntity exactly like a shipped quest (src/ui/world_entity_i18n.ts lists
// WORKSHOP_QUEST_IDS), so its `entities.quests.<id>.*` leaves land in `en` and
// would otherwise read `pending` in every locale, which (a) puts the owner's
// own un-localized content on the maintainer's release fill worklist and (b)
// trips the M16 non-Latin English-leak guard at PR tier. The workshop is a
// documented exemption class instead: these rows are `blocked` with
// WORKSHOP_REASON in the registry and never `pending` at runtime, and
// tests/i18n_completeness.test.ts waives M16 for exactly them.
//
// Consumed by THREE places that must always agree (the retired-keys precedent,
// scripts/i18n_retired_keys.mjs):
//   - scripts/i18n_scan.mjs: a workshop key's unprovided locale rows become
//     `blocked` registry rows (WORKSHOP_REASON), never `pending`;
//   - scripts/i18n_build.mjs: the runtime `pending` set excludes them the same
//     way (build and registry stay in lockstep);
//   - tests/i18n_completeness.test.ts (M16) and tests/i18n_status_registry.test.ts
//     (the blocked-row pin) read the same predicate.
//
// The exemption is keyed on the exact ids the generated file carries, which only
// the workshop tool writes, so no shipped quest can ride it: a shipped quest id
// is never in WORKSHOP_QUEST_IDS (data.ts skips a colliding workshop id, and the
// tool refuses one at save time).

export const WORKSHOP_REASON =
  "Quest Workshop content: the owner's own quest text (src/sim/content/workshop_quests.generated.ts), shipped as written in every locale; never a fill work item (docs/quest-workshop.md).";

/** The catalog key prefixes a workshop quest set owns: one per quest id. */
export function workshopQuestKeyPrefixes(workshopQuestIds) {
  return workshopQuestIds.map((id) => `entities.quests.${id.replace(/[^A-Za-z0-9_]/g, '_')}.`);
}

/** A predicate over catalog keys for one workshop quest id set. */
export function makeIsWorkshopQuestKey(workshopQuestIds) {
  const prefixes = workshopQuestKeyPrefixes(workshopQuestIds);
  return (key) => prefixes.some((prefix) => key.startsWith(prefix));
}
