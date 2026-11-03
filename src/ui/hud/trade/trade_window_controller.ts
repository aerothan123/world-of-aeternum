// The player-to-player trade window, a HUD domain extracted off the Hud
// coordinator: the window's repaint (a signature-gated wholesale rebuild, the
// market_window idiom), the staged gold offer inputs, the per-row remove
// prompt, and the item-history / material-sources affordances on both offer
// sides. Every outcome resolves in the sim (tradeConfirm / tradeCancel); this
// module only paints TradeInfo and pushes the locally staged offer.
//
// Per src/ui/hud/CLAUDE.md this module never imports Hud: every host capability
// (the IWorld, the staged gold offer Hud shares with the bags window,
// tooltips) arrives through TradeWindowControllerDeps. It reads browser state
// (document) and is registered in UI_DOM_MODULES.

import { stackSizeOf } from '../../../sim/bags';
import { ITEMS } from '../../../sim/data';
import type { MaterialComposition } from '../../../sim/material_sources';
import type { InvSlot, ItemDef, ItemInstancePayload } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import { showQuantityPrompt } from '../../bank_quantity_prompt';
import { itemDisplayName } from '../../entity_i18n';
import { esc } from '../../esc';
import { formatMoney as formatLocalizedMoney, formatNumber, t } from '../../i18n';
import { type ItemHistoryHolder, itemHistoryProvenanceFor } from '../../item_history_access_view';
import {
  appendItemHistoryActionAfter,
  attachItemHistoryContextMenu,
  closeItemHistoryDialogForOwner,
} from '../../item_history_dialog';
import { itemNameColor } from '../../item_name_color';
import { knownItemDef } from '../../known_item';
import {
  appendMaterialSourcesActionAfter,
  attachMaterialSourcesContextMenu,
  closeMaterialSourcesDialogForOwner,
  type MaterialSourcesDialogOpener,
} from '../../material_sources_dialog';
import { dismissInstalledPrompt, installPromptDialog } from '../../prompt_dialog';
import {
  buildTradeItemRow,
  removeTradeOfferUnits,
  resolveTradeOfferRemove,
  tradeOfferRemoveOpensPrompt,
  tradeRowTooltipTarget,
} from '../../trade_view';
import { svgIcon } from '../../ui_icons';
import { unknownItemIconHtml } from '../../unknown_item_icon';
import { wornItemCellParts } from '../../worn_item_cell_view';

// The unranked fallback, the same token spelling the bag, bank and character
// windows use for a quality the wire did not rank.
const QUALITY_DEFAULT_COLOR = 'var(--color-quality-default)';
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/** The remove prompt's own class: NOT in the bags window's teardown selector,
 *  so a bags close or mobile cluster-close cannot sweep a modal that belongs
 *  to the trade window (only the trade window is inert under it). */
const TRADE_REMOVE_PROMPT_CLASS = 'trade-remove-prompt';

/** Tear down every trade quantity prompt, this window's remove prompt AND the
 *  bags' offer prompt (a trade that closes takes both with it), through each
 *  one's own dismiss() so whichever root it made inert is cleared. */
function dismissTradeOfferPrompts(): void {
  for (const p of document.querySelectorAll(`.trade-offer-prompt, .${TRADE_REMOVE_PROMPT_CLASS}`)) {
    dismissInstalledPrompt(p);
  }
}

/** The host capabilities the controller borrows from Hud, per the domain
 *  contract (narrow closures, never the Hud class). */
export interface TradeWindowControllerDeps {
  /** The IWorld the trade window reads and acts through. */
  world(): IWorld;
  /** The gold trade's locally staged offer. Owned by Hud because the bags
   *  window stages into it too; the controller resets it on open/close.
   *  MUST return the LIVE object, never a copy: the controller mutates it in
   *  place (item unstage decrements/splices, the coin-input copper write). */
  staged(): { items: InvSlot[]; copper: number };
  setStaged(next: { items: InvSlot[]; copper: number }): void;
  /** Push the staged offer to the server (Hud owns the gold-trade send). */
  pushTradeOffer(): void;
  itemIcon(item: ItemDef, quality?: ItemDef['quality']): string;
  attachTooltip(el: HTMLElement, html: () => string): void;
  openMaterialSources?: MaterialSourcesDialogOpener;
  itemTooltip(
    item: ItemDef,
    compare?: boolean,
    instance?: ItemInstancePayload,
    materialSources?: MaterialComposition,
  ): string;
  renderBags(): void;
}

export class TradeWindowController {
  private tradeWasOpen = false;
  private lastTradeSig = '';

  constructor(private readonly deps: TradeWindowControllerDeps) {}

  private get sim(): IWorld {
    return this.deps.world();
  }
  private get stagedTrade(): { items: InvSlot[]; copper: number } {
    return this.deps.staged();
  }
  private set stagedTrade(next: { items: InvSlot[]; copper: number }) {
    this.deps.setStaged(next);
  }
  private itemIcon(item: ItemDef, quality?: ItemDef['quality']): string {
    return this.deps.itemIcon(item, quality);
  }
  private attachTooltip(el: HTMLElement, html: () => string): void {
    this.deps.attachTooltip(el, html);
  }
  private itemTooltip(
    item: ItemDef,
    compare?: boolean,
    instance?: ItemInstancePayload,
    materialSources?: MaterialComposition,
  ): string {
    return this.deps.itemTooltip(item, compare, instance, materialSources);
  }
  private renderBags(): void {
    this.deps.renderBags();
  }
  private pushTradeOffer(): void {
    this.deps.pushTradeOffer();
  }

  /** The trade window root, resolved ONCE per controller. updateTradeWindow
   *  runs on a medium band while a trade is open, and it re-queried the
   *  document every tick (a faithful-move artifact of the extraction); the
   *  element is created by the HTML entry and never replaced, so the ref is
   *  stable for the session. Lazily resolved because the controller is built
   *  before the shell's windows are wired. */
  private tradeWindowEl: HTMLElement | null = null;

  /** A click on one of this side's offered rows: the same quantity prompt the
   *  bags open (bank_quantity_prompt.ts), in REMOVE mode. The number is how
   *  many units to take off the line (capped at the line's count, with the
   *  vault's unit and whole-stack step pairs), Remove takes that many, Remove
   *  all takes the whole line. A one-unit line has no quantity to choose and
   *  unstages directly (tradeOfferRemoveOpensPrompt, the bags gate's twin).
   *  The window is the inert root; the submit re-resolves the live line so a
   *  prompt left open across a vanished line refuses. */
  private showOfferRemovePrompt(itemId: string): void {
    const line = this.stagedTrade.items.find((s) => s.itemId === itemId);
    if (!line) return;
    if (!tradeOfferRemoveOpensPrompt(line)) {
      if (removeTradeOfferUnits(this.stagedTrade.items, itemId, 1)) this.pushTradeOffer();
      return;
    }
    const el = this.tradeWindow();
    const item = knownItemDef(ITEMS, itemId);
    const itemName = item ? itemDisplayName(item) : itemId;
    const stepSize = stackSizeOf(item);
    const count = (n: number): string => formatNumber(n, { maximumFractionDigits: 0 });
    showQuantityPrompt(
      {
        installPromptDialog: (prompt, opener, close) =>
          installPromptDialog(prompt, opener, close, {
            inertRoot: el,
            idPrefix: 'trade-prompt-title',
          }),
        dismissSiblings: dismissTradeOfferPrompts,
      },
      {
        className: TRADE_REMOVE_PROMPT_CLASS,
        step: {
          size: stepSize,
          downAriaText: t('hudChrome.bank.quantityStepDownAria', { count: count(stepSize) }),
          upAriaText: t('hudChrome.bank.quantityStepUpAria', { count: count(stepSize) }),
          unitDownAriaText: t('hudChrome.bank.quantityStepDownAria', { count: count(1) }),
          unitUpAriaText: t('hudChrome.bank.quantityStepUpAria', { count: count(1) }),
        },
        titleText: t('hudChrome.trade.offerRemoveTitle', { item: itemName }),
        inputAriaText: t('hudChrome.trade.offerRemoveInput'),
        confirmText: t('hudChrome.trade.offerRemove'),
        confirmAllText: t('hudChrome.trade.offerRemoveAll'),
        cancelText: t('itemUi.vendor.sellQuantityCancel'),
        maxCount: Math.max(1, Math.floor(line.count)),
        resolveCount: (requested) =>
          resolveTradeOfferRemove(this.stagedTrade.items, itemId, requested),
        send: (taken) => {
          if (removeTradeOfferUnits(this.stagedTrade.items, itemId, taken)) this.pushTradeOffer();
        },
        afterClose: () => {
          // The push repaints the window wholesale (the opener row is gone),
          // so land on its always-present close button.
          el.querySelector<HTMLElement>('[data-close]')?.focus();
        },
      },
    );
  }

  private tradeWindow(): HTMLElement {
    if (this.tradeWindowEl === null || !this.tradeWindowEl.isConnected) {
      this.tradeWindowEl = $('#trade-window');
    }
    return this.tradeWindowEl;
  }

  updateTradeWindow(): void {
    const el = this.tradeWindow();
    const info = this.sim.tradeInfo;
    if (!info) {
      if (this.tradeWasOpen) {
        closeMaterialSourcesDialogForOwner(el);
        closeItemHistoryDialogForOwner(el);
        // The adjust prompt cannot outlive its window: tear it down through
        // its own dismiss() (inert cleared), and clear inert once more as the
        // force-close backstop the prompt recipe asks every owner for.
        dismissTradeOfferPrompts();
        el.inert = false;
        el.style.display = 'none';
        this.tradeWasOpen = false;
        this.stagedTrade = { items: [], copper: 0 };
        this.lastTradeSig = '';
        if ($('#bags').style.display !== 'none') this.renderBags();
      }
      return;
    }
    if (!this.tradeWasOpen) {
      this.tradeWasOpen = true;
      this.stagedTrade = { items: [], copper: 0 };
      this.renderBags();
      $('#bags').style.display = 'flex';
    }
    const sig = JSON.stringify([
      info.myOffer,
      info.theirOffer,
      info.myAccepted,
      info.theirAccepted,
      this.stagedTrade,
    ]);
    if (sig === this.lastTradeSig) return;
    // Visible BEFORE the render body: the panel's CSS default is
    // display:none, and a throw on the FIRST paint used to leave a live
    // trade with no panel at all (no Accept, no Cancel). A partial paint
    // the player can see and escape beats an invisible one.
    el.style.display = 'block';

    // The whole render sits in one try: it is throw-free by construction
    // (buildTradeItemRow resolves unknown ids), so the catch is the blast
    // radius bound for an UNKNOWN future throw, which would otherwise abort
    // every update() call banded after this one (arena, fiesta, the Vale
    // Cup surfaces). The finally commits the repaint signature on BOTH
    // paths, deliberately: on success that is commit-after-complete-paint;
    // on a throw it means the panel shows its last complete paint until the
    // OFFER DATA next changes (which re-derives the signature and retries),
    // with one console.error per attempt. The alternative, committing on
    // success only, would re-run a deterministic throw every band tick for
    // pure log spam. What the shipped bug did that this does not: the
    // signature committed BEFORE the render outside any try, so each data
    // change re-threw straight into the band (aborting the callers after
    // this one) and every other frame skipped the repaint entirely.
    try {
      const itemRow = (s: InvSlot, mine: boolean) => {
        // Stale-client guard (R34): the other side's offer is server truth and
        // can carry an id this bundle predates; buildTradeItemRow keeps the raw
        // id as the label and the icon falls back instead of dereferencing the
        // missing def (the shipped failure shape threw here and froze the offer
        // display behind the already-set repaint signature).
        const { item, label } = buildTradeItemRow(s, ITEMS);
        // The name in its quality colour, through the shared family module
        // rather than a hand-rolled lookup: itemNameColor owns the fallback
        // token, gives a quest-purpose item the bag and tooltip's quest gold,
        // and reads the map with Object.hasOwn so a wire quality colliding with
        // an Object.prototype key cannot interpolate a function source into a
        // style attribute. NOT the .q-<rung> class, which is the icon FRAME
        // family: it carries border-color plus an epic and legendary glow and
        // never a text colour, so on a bare span it painted a stray halo and
        // left the name the inherited grey.
        // The staged COPY's own quality (a legacy legendary-rolled copy is
        // tradable and reads legendary here, the all-surfaces item-cell rule;
        // a promoted copy is bound and never reaches the table).
        // One cell-authority read for the color AND the rim (the label keeps
        // the def name plus count from buildTradeItemRow: a promoted copy is
        // bound and never reaches the table, so only a persisted named-but-
        // unbound payload, which the load arm admits but the live shape never
        // mints, would show the def here beside the chosen name in its tooltip).
        const parts = item ? wornItemCellParts(item, s.instance) : null;
        const qColor =
          item && parts
            ? itemNameColor({ kind: item.kind, quality: parts.quality ?? 'common' })
            : QUALITY_DEFAULT_COLOR;
        const inner = `<span class="ui-socket ui-socket--bag">${item && parts ? this.itemIcon(item, parts.quality) : unknownItemIconHtml(s.itemId)}${parts?.qualityBadgeLabelled ?? ''}</span><span style="color:${qColor}">${esc(label)}</span>`;
        return mine
          ? `<button type="button" class="trade-item mine ui-card" data-item="${esc(s.itemId)}">${inner}</button>`
          : `<div class="trade-item ui-card">${inner}</div>`;
      };
      const emptyRows = (count: number, label: string) =>
        Array.from(
          { length: Math.max(0, 4 - count) },
          (_, index) =>
            `<div class="trade-item trade-item-empty"><span class="ui-socket ui-socket--bag empty" aria-hidden="true"></span>${index === 0 && count === 0 ? `<span class="trade-empty">${esc(label)}</span>` : ''}</div>`,
        ).join('');
      el.innerHTML = `
        <div class="panel-title ui-win-head"><span class="ui-win-title">${esc(t('hud.trade.title', { name: info.otherName }))}</span><button type="button" class="x-btn ui-x-btn" data-close aria-label="${esc(t('hud.trade.cancel'))}">${svgIcon('close')}</button></div>
        <div class="trade-cols">
          <div class="trade-col ${info.myAccepted ? 'accepted' : ''}">
            <h4>${esc(t('hud.trade.yourOffer'))}</h4>
            <div class="trade-items ui-well">${info.myOffer.items.map((s) => itemRow(s, true)).join('')}${emptyRows(info.myOffer.items.length, t('hud.trade.emptyMine'))}</div>
            <div class="trade-money"><span class="trade-money-label">${esc(t('hud.trade.money'))}:</span>
              <span class="trade-coins">
                <input class="coininput ui-input" id="trade-g" type="number" min="0" value="${Math.floor(this.stagedTrade.copper / 10000)}" aria-label="${esc(t('itemUi.money.gold'))}"><span class="coin g" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.goldShort'))}</span>
                <input class="coininput ui-input" id="trade-s" type="number" min="0" max="99" value="${Math.floor((this.stagedTrade.copper % 10000) / 100)}" aria-label="${esc(t('itemUi.money.silver'))}"><span class="coin s" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.silverShort'))}</span>
                <input class="coininput ui-input" id="trade-c" type="number" min="0" max="99" value="${this.stagedTrade.copper % 100}" aria-label="${esc(t('itemUi.money.copper'))}"><span class="coin c" aria-hidden="true"></span><span class="mkt-coin-tag">${esc(t('itemUi.money.copperShort'))}</span>
              </span>
            </div>
          </div>
          <div class="trade-col ${info.theirAccepted ? 'accepted' : ''}">
            <h4>${esc(t('hud.trade.theirOffer', { name: info.otherName }))}</h4>
            <div class="trade-items ui-well">${info.theirOffer.items.map((s) => itemRow(s, false)).join('')}${emptyRows(info.theirOffer.items.length, t('hud.trade.emptyTheirs'))}</div>
            <div class="trade-money">${esc(t('hud.trade.money'))}: <span class="gold">${formatLocalizedMoney(info.theirOffer.copper)}</span></div>
          </div>
        </div>
        <div class="trade-hint">${esc(t('hud.trade.hint'))}</div>`;
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn ui-btn ui-btn--red';
      acceptBtn.textContent = info.myAccepted ? t('hud.trade.waiting') : t('hud.trade.accept');
      acceptBtn.disabled = info.myAccepted;
      acceptBtn.addEventListener('click', () => this.sim.tradeConfirm());
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn ui-btn';
      cancelBtn.textContent = t('hud.trade.cancel');
      cancelBtn.addEventListener('click', () => this.sim.tradeCancel());
      // The two window actions in one row (the sheet pins it to the bottom
      // on touch, so the commit control never sits below the fold).
      const actions = document.createElement('div');
      actions.className = 'trade-actions';
      actions.append(acceptBtn, cancelBtn);
      el.append(actions);
      el.querySelector('[data-close]')?.addEventListener('click', () => this.sim.tradeCancel());
      el.querySelectorAll('.trade-item.mine').forEach((row) => {
        row.addEventListener('click', () => {
          this.showOfferRemovePrompt((row as HTMLElement).dataset.item ?? '');
        });
      });
      // Wire the same stat tooltip bag/vendor/bank slots use onto both offer
      // sides, keyed positionally (the rendered rows are the offer's own items
      // in order, with no other `.trade-item` siblings to misalign against).
      // Both offer sides render from the same InvSlot shape (TradeOffer.items
      // in src/world_api/trade.ts), so the trade-slot tooltip reuses the exact
      // bag tooltip (item + per-instance enchant/masterwork/signature detail)
      // rather than any bespoke trade-only summary.
      // A tracked copy on EITHER side also opens its Item history (right-click
      // on the row, plus the visible button every layout shows beside a list
      // row): the counterparty's copy reads the public projection
      // (item_history_access_view.ts), so no character id reaches the dialog.
      const attachTradeTooltips = (
        rows: NodeListOf<Element>,
        slots: InvSlot[],
        holder: ItemHistoryHolder,
      ) => {
        rows.forEach((row, i) => {
          const target = tradeRowTooltipTarget(slots, i);
          if (!target) return;
          const rowElement = row as HTMLElement;
          this.attachTooltip(rowElement, () =>
            this.itemTooltip(target.item, true, target.instance, target.materialSources),
          );
          const itemName = itemDisplayName(target.item);
          const history = itemHistoryProvenanceFor(target.instance, holder);
          attachItemHistoryContextMenu(rowElement, itemName, history);
          appendItemHistoryActionAfter(rowElement, itemName, history, 'listRow');
          attachMaterialSourcesContextMenu(
            rowElement,
            itemName,
            target.materialSources,
            this.deps.openMaterialSources,
          );
          appendMaterialSourcesActionAfter(
            rowElement,
            itemName,
            target.materialSources,
            this.deps.openMaterialSources,
          );
        });
      };
      attachTradeTooltips(
        el.querySelectorAll('.trade-col:first-child .trade-item'),
        info.myOffer.items,
        'self',
      );
      attachTradeTooltips(
        el.querySelectorAll('.trade-col:last-child .trade-item'),
        info.theirOffer.items,
        'other',
      );
      const goldInput = el.querySelector('#trade-g') as HTMLInputElement;
      const silverInput = el.querySelector('#trade-s') as HTMLInputElement;
      const copperInput = el.querySelector('#trade-c') as HTMLInputElement;
      const syncTradeMoney = () => {
        const gg = Math.max(0, Math.floor(Number(goldInput?.value) || 0));
        const ss = Math.max(0, Math.floor(Number(silverInput?.value) || 0));
        const cc = Math.max(0, Math.floor(Number(copperInput?.value) || 0));
        this.stagedTrade.copper = gg * 10000 + ss * 100 + cc;
        this.pushTradeOffer();
      };
      [goldInput, silverInput, copperInput].forEach((input) => {
        input?.addEventListener('change', syncTradeMoney);
      });
    } catch (err) {
      console.error('[trade] trade window render failed', err);
    } finally {
      this.lastTradeSig = sig;
    }
  }
}
