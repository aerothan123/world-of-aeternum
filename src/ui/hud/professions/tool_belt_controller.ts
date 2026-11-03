// Thin DOM painter for the character sheet's Tools section (the gathering
// tool belt). Paints tool_belt_view.ts cells into the given host with the
// paperdoll's own equipment-slot family (`.equip-slot`, the quality socket,
// the corner unequip x), so a tool cell looks and behaves like a gear cell:
// hover for the tooltip, drag a bag tool onto it to equip, right-click or the
// x to unequip (the x is always shown on touch, where tapping a bagged tool
// also equips it through the ordinary item use). Cold: built on each sheet
// render, no driver, no layout reads. Reaches the world only through IWorld.

import { audio } from '../../../game/audio';
import { ITEMS } from '../../../sim/data';
import type { ItemDef, ItemInstancePayload } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import { itemDisplayName } from '../../entity_i18n';
import { draggedCopySlotIndex } from '../../equip_drop_core';
import { esc } from '../../esc';
import { t } from '../../i18n';
import { iconDataUrl } from '../../icons';
import type { ItemDragState } from '../../item_drag_state';
import { tSim } from '../../sim_i18n';
import { svgIcon } from '../../ui_icons';
import { wornItemCellParts } from '../../worn_item_cell_view';
import { gatheringProfessionNameKey } from './gathering_profession_name';
import { buildToolBeltView, type ToolBeltCell, toolBeltDropAccepts } from './tool_belt_view';

export interface ToolBeltPainterDeps {
  world(): IWorld;
  itemIcon(item: ItemDef, quality?: ItemDef['quality']): string;
  attachTooltip(el: HTMLElement, html: () => string): void;
  wornItemTooltip(item: ItemDef, instance?: ItemInstancePayload): string;
  hideTooltip(): void;
  dragState: ItemDragState;
  showError(text: string): void;
  /** Repaint the bags and the sheet after an equip or unequip. */
  refresh(): void;
}

/** The Tools section markup the char window seats under the paperdoll; the
 *  cells are painted into `#char-tool-belt-row` by paintToolBelt. */
export function toolBeltSectionHtml(): string {
  const title = esc(t('hudChrome.toolBelt.title'));
  return `<div class="char-tool-belt" role="group" aria-label="${title}"><span class="cp-title">${title}</span><div class="char-tool-belt-row" id="char-tool-belt-row"></div></div>`;
}

function professionName(cell: ToolBeltCell): string {
  const key = gatheringProfessionNameKey(cell.professionId);
  return key ? t(key) : '';
}

function buildCell(cell: ToolBeltCell, deps: ToolBeltPainterDeps): HTMLElement {
  const { item, instance, professionId } = cell;
  const row = document.createElement('div');
  row.className = 'equip-slot tool-belt-slot';
  row.id = `tool-slot-${professionId}`;
  row.tabIndex = -1;
  row.dataset.toolSlot = professionId;
  const parts = item ? wornItemCellParts(item, instance ?? undefined) : null;
  const icon = item
    ? deps.itemIcon(item, parts?.quality)
    : `<img class="item-icon ui-socket ui-socket--bag" style="border-color:var(--color-slot-empty-border)" src="${iconDataUrl('item', 'slot_empty')}" alt="" draggable="false">`;
  const name = parts ? esc(parts.name) : esc(t('itemUi.equipment.empty'));
  const color = parts ? parts.color : 'var(--color-slot-empty-text)';
  row.innerHTML = `<span class="equip-quality-socket">${icon}${parts?.qualityBadgeLabelled ?? ''}</span><div><div class="slot-name">${esc(professionName(cell))}</div><div class="slot-item" style="color:${color}">${name}</div></div>`;
  bindDrop(row, cell, deps);
  if (!item) {
    deps.attachTooltip(row, () =>
      esc(t('hudChrome.toolBelt.emptySlot', { profession: professionName(cell) })),
    );
    row.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return row;
  }
  deps.attachTooltip(
    row,
    () =>
      `${deps.wornItemTooltip(item, instance ?? undefined)}<div class="tt-sub">${esc(t('hudChrome.toolBelt.unequipHint'))}</div>`,
  );
  const unequip = document.createElement('button');
  unequip.type = 'button';
  unequip.className = 'equip-unequip-btn';
  unequip.innerHTML = svgIcon('close');
  unequip.setAttribute(
    'aria-label',
    t('hudChrome.paperdoll.unequipAria', { item: parts?.ariaName ?? itemDisplayName(item) }),
  );
  const doUnequip = () => {
    deps.world().unequipGatherTool(professionId);
    audio.click();
    deps.hideTooltip();
    deps.refresh();
  };
  unequip.addEventListener('click', (ev) => {
    ev.stopPropagation();
    doUnequip();
  });
  row.appendChild(unequip);
  row.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    doUnequip();
  });
  return row;
}

// A Tools cell as a drop target for a bag stack: only a tool of this cell's
// profession lights the cursor, and the drop equips that exact bag copy
// through the ordinary equip command (the sim re-validates).
function bindDrop(row: HTMLElement, cell: ToolBeltCell, deps: ToolBeltPainterDeps): void {
  row.addEventListener('dragover', (e) => {
    const drag = deps.dragState.get();
    if (!drag || !toolBeltDropAccepts(ITEMS[drag.itemId], cell.professionId)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  row.addEventListener('drop', (e) => {
    const drag = deps.dragState.get();
    if (!drag) return;
    e.preventDefault();
    deps.dragState.end();
    if (!toolBeltDropAccepts(ITEMS[drag.itemId], cell.professionId)) {
      deps.showError(tSim('error.wrongEquipSlot'));
      return;
    }
    const world = deps.world();
    const named = draggedCopySlotIndex(world.inventory, drag.itemId, drag);
    if (named === null) {
      deps.showError(tSim('error.noItem'));
      return;
    }
    world.equipItem(drag.itemId, named === undefined ? undefined : { slotIndex: named });
    audio.click();
    deps.hideTooltip();
    deps.refresh();
  });
}

/** Paint the belt into `host` (the `#char-tool-belt-row` the section html
 *  seats). Returns the cells painted, for the caller's tests. */
export function paintToolBelt(host: Element | null, deps: ToolBeltPainterDeps): ToolBeltCell[] {
  const cells = buildToolBeltView(deps.world().gatherToolSlots, ITEMS);
  if (!host) return cells;
  for (const cell of cells) host.appendChild(buildCell(cell, deps));
  return cells;
}
