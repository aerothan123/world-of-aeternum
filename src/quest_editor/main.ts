// Quest Workshop entry (loaded by quest_editor.html, a dev-only page). Loads the
// active locale before the first localized paint (the src/editor/main.ts
// idiom), stamps the document language and title, builds the content index
// over the live tables, loads the committed workshop set straight from the
// generated module (Vite serves and hot-reloads it), and mounts the app. Save
// is the one network call: a same-origin POST to the dev server's
// loopback-only /__quest_editor/save (vite.config.ts questEditorSavePlugin).

import { WORKSHOP_QUEST_ORDER, WORKSHOP_QUESTS } from '../sim/content/workshop_quests.generated';
import { ensureLocaleLoaded, getLanguage, languageTag, t } from '../ui/i18n';
import { QuestWorkshopApp } from './app';
import { buildContentIndex } from './content_index_core';
import { fromQuestDef, type WorkshopQuest } from './quest_editor_core';

async function postSave(
  quests: readonly WorkshopQuest[],
): Promise<{ ok: true; count: number } | { ok: false; detail: string }> {
  let response: Response;
  try {
    response = await fetch('/__quest_editor/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quests }),
    });
  } catch {
    return { ok: false, detail: t('questEditor.status.reasonNetwork') };
  }
  let body: {
    ok?: boolean;
    count?: number;
    error?: string;
    detail?: string;
    setIssue?: string | null;
  } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // A non-JSON answer (a proxy page, a crash) reads as a rejection below.
  }
  if (response.ok && body.ok === true) return { ok: true, count: body.count ?? quests.length };
  const detail = body.setIssue ?? body.detail ?? body.error ?? String(response.status);
  return { ok: false, detail: t('questEditor.status.reasonRejected', { detail }) };
}

async function boot(): Promise<void> {
  const mount = document.getElementById('quest-workshop');
  if (!mount) return;
  mount.textContent = t('questEditor.loading');
  try {
    await ensureLocaleLoaded(getLanguage());
  } catch {
    // A missing locale chunk falls back to English; render regardless.
  }
  document.documentElement.lang = languageTag(getLanguage());
  document.title = t('questEditor.documentTitle');
  const app = new QuestWorkshopApp(mount, {
    index: buildContentIndex(),
    initialQuests: WORKSHOP_QUEST_ORDER.map((id) => fromQuestDef(WORKSHOP_QUESTS[id])),
    save: postSave,
  });
  // Dev-only handle for debugging and the screenshot script.
  (window as unknown as { __questWorkshop?: QuestWorkshopApp }).__questWorkshop = app;
}

void boot();
