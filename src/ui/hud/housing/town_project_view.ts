// Town restoration projects (src/sim/life_skills/town_projects.ts): the pure
// text plan behind the project window the interact key raises at a site.
// DOM-free; town_project_feedback.ts localizes nothing itself beyond calling
// this and showing the result through the HUD's world prompt.

import { townProjectById } from '../../../sim/content/town_projects';
import { ITEMS } from '../../../sim/data';
import type { SimEvent } from '../../../sim/types';
import { itemDisplayName } from '../../entity_i18n';
import { formatNumber, type TranslationKey, t } from '../../i18n';

export type TownProjectEvent = Extract<SimEvent, { type: 'townProject' }>;

export interface TownProjectWindowPlan {
  /** The window body (plain text; the caller escapes it). */
  text: string;
  /** Whether the window offers the Contribute button (an open stage). */
  canContribute: boolean;
}

const nameKey = (id: string) => `hudChrome.townProject.name.${id}` as TranslationKey;

export function townProjectWindowPlan(ev: TownProjectEvent): TownProjectWindowPlan | null {
  const def = townProjectById(ev.projectId);
  if (!def) return null;
  const project = t(nameKey(def.id));
  const stage = def.stages[ev.stage];
  if (!stage) {
    return { text: t('hudChrome.townProject.complete', { project }), canContribute: false };
  }
  const items = stage.bundle
    .map((b) =>
      t('hudChrome.townProject.bundleItem', {
        count: formatNumber(b.count),
        item: ITEMS[b.itemId] ? itemDisplayName(ITEMS[b.itemId]) : b.itemId,
      }),
    )
    .join(t('hudChrome.townProject.bundleJoin'));
  return {
    text: t('hudChrome.townProject.progress', {
      project,
      stage: t(nameKey(stage.id)),
      done: formatNumber(ev.bundles),
      needed: formatNumber(stage.bundlesNeeded),
      items,
    }),
    canContribute: true,
  };
}
