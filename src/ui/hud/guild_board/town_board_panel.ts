// The town quest board's notices tab, the thin painter over town_board_view.ts:
// one pinned notice per posting, with its poster, its text, what it asks, what
// it pays, and the one action the viewer can take. Accepting goes through
// IWorld.acceptQuest, which the server validates (the player must stand at the
// board, town_board_access.ts standsAtTownBoard); the turn-in is the poster's.

import { QUESTS } from '../../../sim/data';
import type { IWorld } from '../../../world_api';
import {
  npcDisplayName,
  questNarrative,
  questObjectiveLabel,
  questTitle,
} from '../../entity_display_core';
import { esc } from '../../esc';
import { formatMoney, formatNumber, type TranslationKey, t } from '../../i18n';
import { buildTownBoardRows, type TownBoardRow } from './town_board_view';

function actionHtml(row: TownBoardRow): string {
  const poster = npcDisplayName(row.posterNpcId);
  switch (row.state) {
    case 'available':
      return `<button type="button" class="btn tb-accept" data-tb-accept="${esc(row.questId)}">${esc(t('hudChrome.townBoard.accept'))}</button>`;
    case 'active':
      return `<span class="tb-status">${esc(t('hudChrome.townBoard.taken'))}</span>`;
    case 'ready':
      return `<span class="tb-status tb-ready">${esc(t('hudChrome.townBoard.ready', { npc: poster }))}</span>`;
    case 'done':
      return `<span class="tb-status tb-done">${esc(t('hudChrome.townBoard.done'))}</span>`;
    case 'locked':
      return `<span class="tb-status tb-locked">${esc(
        row.minLevel !== null
          ? t('hudChrome.townBoard.lockedLevel', {
              level: formatNumber(row.minLevel, { maximumFractionDigits: 0 }),
            })
          : t('hudChrome.townBoard.locked'),
      )}</span>`;
  }
}

function rewardsHtml(row: TownBoardRow): string {
  const parts: string[] = [];
  if (row.xp > 0) {
    parts.push(
      t('hudChrome.townBoard.rewardXp', {
        amount: formatNumber(row.xp, { maximumFractionDigits: 0 }),
      }),
    );
  }
  if (row.copper > 0) parts.push(formatMoney(row.copper));
  if (row.standing) {
    parts.push(
      t('hudChrome.worldQuestTooltip.standingReward', {
        amount: formatNumber(row.standing.amount, { maximumFractionDigits: 0 }),
        faction: t(`hudChrome.reputation.faction.${row.standing.factionId}` as TranslationKey),
      }),
    );
  }
  return parts.map((part) => `<span class="tb-reward">${esc(part)}</span>`).join('');
}

function noticeHtml(row: TownBoardRow, playerName: string): string {
  const quest = QUESTS[row.questId];
  const objectives = quest.objectives
    .map(
      (objective, index) =>
        `<li>${esc(
          t('hudChrome.townBoard.objective', {
            label: questObjectiveLabel(row.questId, index),
            count: formatNumber(objective.count, { maximumFractionDigits: 0 }),
          }),
        )}</li>`,
    )
    .join('');
  return (
    `<article class="tb-notice tb-${row.state}" data-tb-quest="${esc(row.questId)}">` +
    `<h3 class="tb-title">${esc(questTitle(row.questId))}</h3>` +
    `<div class="tb-poster">${esc(t('hudChrome.townBoard.postedBy', { npc: npcDisplayName(row.posterNpcId) }))}</div>` +
    `<p class="tb-text">${esc(questNarrative(row.questId, 'text', playerName))}</p>` +
    `<ul class="tb-objectives">${objectives}</ul>` +
    `<div class="tb-rewards">${rewardsHtml(row)}</div>` +
    `<div class="tb-action">${actionHtml(row)}</div>` +
    `</article>`
  );
}

/** Paint the notices tab into `body`; `rerender` repaints after an accept. */
export function paintTownBoardPanel(
  body: HTMLElement,
  world: IWorld,
  boardId: string,
  rerender: () => void,
): void {
  const rows = buildTownBoardRows(boardId, world);
  if (rows.length === 0) {
    body.innerHTML = `<div class="lb-empty">${esc(t('hudChrome.townBoard.empty'))}</div>`;
    return;
  }
  const name = world.player.name;
  body.innerHTML =
    `<p class="tb-intro">${esc(t('hudChrome.townBoard.intro'))}</p>` +
    `<div class="tb-notices">${rows.map((row) => noticeHtml(row, name)).join('')}</div>`;
  for (const button of body.querySelectorAll<HTMLButtonElement>('[data-tb-accept]')) {
    button.addEventListener('click', () => {
      const questId = button.dataset.tbAccept;
      if (!questId) return;
      world.acceptQuest(questId);
      button.disabled = true;
      rerender();
    });
  }
}
