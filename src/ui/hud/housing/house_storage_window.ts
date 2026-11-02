// Player housing (Project H), phase 3: the house storage window painter. Owns
// the #house-storage-window DOM and paints the pooled storage behind the
// placed chests from the pure HouseStorageModel (house_storage_view.ts): a
// stored grid (click withdraws) over a carried grid (click deposits), both
// drawn with the bank family's item cell (personal_bank_item_cell.ts), so
// every item-cell mark the bank paints (seal, glyphs, fine rim, lock) paints
// here too, and the .bank-grid / .bank-item classes carry the family's CSS.
//
// Cold, signature-gated window (the account_bank_window.ts shape inside a
// courier-style shell): innerHTML rebuild on open, on a real change of either
// grid, and on a language switch; the slow-band refreshIfChanged line in
// Hud.update() closes it when the mirror goes null (walked away from the
// chest). Holds no Sim reference and reaches into Hud only through its deps.

import type { InvSlot } from '../../../sim/types';
import type { HouseStorageView } from '../../../world_api';
import { formatCount } from '../../count_format';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import {
  captureFocusKey,
  findFocusKey,
  focusKeyAttr,
  restoreFirstEnabled,
} from '../../focus_restore';
import { t } from '../../i18n';
import {
  buildPersonalBankItemCell,
  type PersonalBankItemCellDeps,
} from '../../personal_bank_item_cell';
import { buildHouseStorageView, houseStorageSignature } from './house_storage_view';

// Grace before a null mirror closes the window: online the storage mirror rides
// the proximity snapshot, so it can lag the open by about a tick (the bank's
// BANK_INFO_GRACE_MS semantics).
const STORAGE_INFO_GRACE_MS = 3_000;

export interface HouseStorageWindowDeps extends PersonalBankItemCellDeps {
  root(): HTMLElement;
  storage(): HouseStorageView | null;
  inventory(): readonly InvSlot[];
  closeOthers(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
  now(): number;
}

export class HouseStorageWindow {
  private opened = false;
  private openedAt = 0;
  private opener: HTMLElement | null = null;
  private lastSignature = '';

  constructor(private readonly deps: HouseStorageWindowDeps) {}

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened) {
      this.render(true);
      return;
    }
    this.deps.closeOthers();
    this.opener = this.deps.captureFocus();
    this.opened = true;
    this.openedAt = this.deps.now();
    this.deps.root().style.display = 'flex';
    this.render(true);
    this.deps.root().querySelector<HTMLButtonElement>('.x-btn')?.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.deps.hideTooltip();
    this.deps.root().style.display = 'none';
    this.lastSignature = '';
    this.deps.restoreFocus(this.opener);
    this.opener = null;
  }

  /** The slow-band poll: closes once the mirror has gone null past the open
   *  grace (walked away from every chest), else repaints on a real change. */
  refreshIfChanged(): void {
    if (!this.opened) return;
    if (this.deps.storage() === null) {
      if (this.deps.now() - this.openedAt > STORAGE_INFO_GRACE_MS) this.close();
      return;
    }
    this.render();
  }

  /** The language fan-out arm: one forced rebuild, signature re-latched. */
  relocalize(): void {
    if (this.opened) this.render(true);
  }

  render(force = false): void {
    if (!this.opened) return;
    const storage = this.deps.storage();
    const inventory = this.deps.inventory();
    const signature = houseStorageSignature(storage, inventory);
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.deps.hideTooltip();
    const root = this.deps.root();
    const focus = captureFocusKey(root);
    markDialogRoot(root, { labelledBy: 'house-storage-title' });
    const model = buildHouseStorageView(storage, inventory);
    root.innerHTML = `<div class="panel-title ui-win-head"><span id="house-storage-title" class="ui-win-title">${esc(t('hudChrome.housing.storage.title'))}</span><button type="button" class="x-btn ui-x-btn" aria-label="${esc(t('hudChrome.housing.storage.close'))}"${focusKeyAttr('close')}>×</button></div><div class="ui-win-body house-storage-body"></div>`;
    root.querySelector<HTMLButtonElement>('.x-btn')!.onclick = () => this.close();
    const body = root.querySelector<HTMLElement>('.house-storage-body')!;
    if (model.kind === 'away') {
      body.appendChild(this.notice('hudChrome.housing.storage.away', 'status'));
    } else {
      body.appendChild(
        this.section(
          t('hudChrome.housing.storage.storedTitle'),
          t('hudChrome.housing.storage.meter', {
            used: formatCount(model.used),
            total: formatCount(model.total),
            chests: formatCount(model.chests),
          }),
          model.stored.map((slot) => ({ slot, allowed: true })),
          model.emptyCells,
          'hudChrome.housing.storage.storedEmpty',
          'hudChrome.housing.storage.withdrawHint',
          (slotIndex) => this.deps.world().houseStorageWithdraw(slotIndex),
          'withdraw',
        ),
      );
      body.appendChild(
        this.section(
          t('hudChrome.housing.storage.carriedTitle'),
          model.full ? t('hudChrome.housing.storage.full') : '',
          model.carried.map((slot) => ({ slot, allowed: slot.allowed && !model.full })),
          0,
          'hudChrome.housing.storage.carriedEmpty',
          'hudChrome.housing.storage.depositHint',
          (slotIndex) => this.deps.world().houseStorageDeposit(slotIndex),
          'deposit',
        ),
      );
    }
    if (focus) {
      restoreFirstEnabled([
        findFocusKey(root, focus),
        root.querySelector<HTMLButtonElement>('.x-btn'),
      ]);
    }
  }

  private notice(key: Parameters<typeof t>[0], role?: 'status'): HTMLElement {
    const p = document.createElement('p');
    p.className = 'bank-empty house-storage-notice';
    if (role) p.setAttribute('role', role);
    p.textContent = t(key);
    return p;
  }

  private section(
    title: string,
    meter: string,
    cells: { slot: Parameters<typeof buildPersonalBankItemCell>[1]; allowed: boolean }[],
    emptyCells: number,
    emptyKey: Parameters<typeof t>[0],
    hintKey: Parameters<typeof t>[0],
    onClick: (slotIndex: number) => void,
    direction: 'deposit' | 'withdraw',
  ): HTMLElement {
    const box = document.createElement('section');
    box.className = `house-storage-section house-storage-${direction}`;
    const head = document.createElement('div');
    head.className = 'house-storage-section-head';
    const heading = document.createElement('h3');
    heading.textContent = title;
    head.appendChild(heading);
    if (meter) {
      const count = document.createElement('span');
      count.className = 'house-storage-count';
      count.textContent = meter;
      head.appendChild(count);
    }
    box.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'bank-grid house-storage-grid';
    if (cells.length === 0) grid.appendChild(this.notice(emptyKey));
    for (const { slot, allowed } of cells) {
      const cell = buildPersonalBankItemCell(
        this.deps,
        slot,
        formatCount(slot.count),
        () => {
          if (!allowed) return;
          onClick(slot.slotIndex);
          this.deps.onInventoryChanged();
        },
        () => this.render(true),
        { wholeStack: true, hintKey },
      );
      (cell as HTMLButtonElement).disabled = !allowed;
      cell.dataset.focusKey = `house-${direction}:${slot.slotIndex}`;
      grid.appendChild(cell);
    }
    for (let i = 0; cells.length > 0 && i < emptyCells; i++) {
      const cell = document.createElement('div');
      cell.className = 'bank-item ui-socket ui-socket--bag empty';
      cell.setAttribute('aria-hidden', 'true');
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    return box;
  }
}
