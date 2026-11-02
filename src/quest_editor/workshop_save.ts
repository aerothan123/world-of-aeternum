// Quest Workshop save pipeline, the server-side half: what the dev server's
// /__quest_editor/save endpoint (vite.config.ts questEditorSavePlugin) runs over
// a POST body. It is loaded through the Vite module runner (ssrLoadModule), so
// it sees the SAME content tables the page bundles and re-validates with the
// SAME pure core before anything is written: the browser is never trusted.
//
// Pure over its input (no fs, no network): the plugin owns the file write and
// the wiki regen so this stays unit-testable.

import { buildContentIndex, type ContentIndex } from './content_index_core';
import {
  emitWorkshopModule,
  MAX_WORKSHOP_QUESTS,
  type ValidationIssue,
  validateWorkshopSet,
  type WorkshopQuest,
  workshopQuestFromJson,
} from './quest_editor_core';

export type SaveResult =
  | { ok: true; count: number; module: string }
  | {
      ok: false;
      error: 'bad_json' | 'bad_shape' | 'invalid';
      issues?: Record<string, ValidationIssue[]>;
      setIssue?: string | null;
    };

/** Decode, validate and emit. `index` is injectable for tests; the endpoint
 *  builds it from the live tables. */
export function prepareWorkshopSave(
  body: string,
  index: ContentIndex = buildContentIndex(),
): SaveResult {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, error: 'bad_json' };
  }
  const payload = raw as { quests?: unknown };
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.quests)) {
    return { ok: false, error: 'bad_shape' };
  }
  if (payload.quests.length > MAX_WORKSHOP_QUESTS) {
    return { ok: false, error: 'invalid', issues: {}, setIssue: 'too_many_quests' };
  }
  const quests: WorkshopQuest[] = [];
  const rawKinds: string[][] = [];
  for (const entry of payload.quests) {
    const { quest, rawObjectiveKinds } = workshopQuestFromJson(entry);
    quests.push(quest);
    rawKinds.push(rawObjectiveKinds);
  }
  const verdict = validateWorkshopSet(quests, index, rawKinds);
  if (!verdict.ok) {
    return { ok: false, error: 'invalid', issues: verdict.issues, setIssue: verdict.setIssue };
  }
  return { ok: true, count: quests.length, module: emitWorkshopModule(quests) };
}
