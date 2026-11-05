// The Addons window: master toggle, per-add-on enable, status and load errors,
// permissions, CPU / message / widget / saved-data stats, Options (declared
// settings), Reset saved data, Publish to Workshop (desktop, local add-ons),
// Reload UI, Open add-ons folder, and safe mode. A cold window (src/ui/CLAUDE.md
// painter gate): it rebuilds only when the model signature changes and repaints
// the stats cells in place once a second, so focus is never yanked from a
// keyboard player. Every add-on supplied string (name, author, description,
// errors) is user-generated content and passes through esc().

import { desktopBridge } from '../../../runtime';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import type { FocusManager, FocusTrapHandle } from '../../focus_manager';
import {
  captureFocusKey,
  findFocusKey,
  focusKeyAttr,
  restoreFirstEnabled,
} from '../../focus_restore';
import { formatNumber, type TranslationKey, t } from '../../i18n';
import { svgIcon } from '../../ui_icons';
import type { AddonEntry, AddonRuntime } from './addon_runtime_controller';
import {
  type AddonsWindowModel,
  type AddonsWindowRow,
  addonsWindowModel,
  savedKb,
} from './addons_window_view';

const TITLE_ID = 'addons-window-title';

type View = { kind: 'list' } | { kind: 'options'; key: string } | { kind: 'publish'; key: string };

export interface AddonsWindowDeps {
  document: Document;
  uiRoot: HTMLElement;
  focus: FocusManager;
  runtime: AddonRuntime;
}

export class AddonsWindowController {
  private root: HTMLElement | null = null;
  private trap: FocusTrapHandle | null = null;
  private view: View = { kind: 'list' };
  private lastSig = '';
  private readonly expanded = new Set<string>();
  private notice: { key: TranslationKey; values: Record<string, string> } | null = null;

  constructor(private readonly deps: AddonsWindowDeps) {}

  get isOpen(): boolean {
    return this.root !== null && this.root.style.display !== 'none';
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    const root = this.ensureRoot();
    root.style.display = 'block';
    this.view = { kind: 'list' };
    this.lastSig = '';
    this.refresh();
    this.trap?.release(false);
    this.trap = this.deps.focus.open({ root: () => this.root });
    this.trap.focusFirst('[data-act="master"]');
  }

  /** Returns true when the window was open (the Escape dispatcher's contract). */
  close(): boolean {
    if (!this.isOpen || !this.root) return false;
    this.root.style.display = 'none';
    this.trap?.release(true);
    this.trap = null;
    return true;
  }

  /** Runtime change hook: rebuild on structure change, else repaint stats. */
  refresh(): void {
    if (!this.isOpen || !this.root) return;
    const model = this.model();
    const sig = `${JSON.stringify(this.view)}|${JSON.stringify(this.notice)}|${model.signature}`;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.rebuild(model);
    } else {
      this.paintStats(model);
    }
  }

  private ensureRoot(): HTMLElement {
    if (this.root) return this.root;
    const r = this.deps.document.createElement('div');
    r.id = 'addons-window';
    r.className = 'window panel';
    r.style.display = 'none';
    markDialogRoot(r, { labelledBy: TITLE_ID });
    r.addEventListener('click', (e) => this.onClick(e));
    r.addEventListener('change', (e) => this.onChange(e));
    this.deps.uiRoot.appendChild(r);
    this.root = r;
    return r;
  }

  private entryInput(e: AddonEntry) {
    const m = e.manifest;
    return {
      key: e.key,
      origin: e.pkg.origin,
      folder: e.pkg.folder,
      name: m?.name ?? null,
      version: m?.version ?? null,
      author: m?.author || null,
      description: m?.description || null,
      status: e.status,
      detail: e.detail,
      stopReason: e.stopReason,
      manifestErrorField: e.manifestError?.code === 'field' ? e.manifestError.field : null,
      manifestErrorJson: e.manifestError?.code === 'json',
      enabled: m ? this.deps.runtime.isAddonEnabled(m.id) : false,
      permissions: m?.permissions ?? [],
      hasSettings: (m?.settings.length ?? 0) > 0,
      stats: e.stats,
      recentErrors: e.errors.recent,
    };
  }

  private model(): AddonsWindowModel {
    const rt = this.deps.runtime;
    return addonsWindowModel({
      masterEnabled: rt.masterEnabled,
      loadOutdated: rt.loadOutdated,
      safeMode: rt.safeMode,
      desktop: rt.sources?.desktop === true,
      workshopAvailable: rt.sources?.workshopAvailable === true,
      entries: rt.entries.map((e) => this.entryInput(e)),
      expandedErrors: this.expanded,
    });
  }

  private rebuild(model: AddonsWindowModel): void {
    const root = this.root;
    if (!root) return;
    const focusKey = captureFocusKey(root);
    let body: string;
    if (this.view.kind === 'options') body = this.optionsHtml(this.view.key);
    else if (this.view.kind === 'publish') body = this.publishHtml(this.view.key);
    else body = this.listHtml(model);
    root.innerHTML =
      `<div class="panel-title"><span id="${TITLE_ID}">${esc(t('hudChrome.addons.title'))}</span>` +
      `<button type="button" class="x-btn" data-act="close" aria-label="${esc(t('hudChrome.addons.close'))}">${svgIcon('close')}</button></div>` +
      (this.notice
        ? `<p class="addons-notice" role="status">${esc(t(this.notice.key, this.notice.values))}</p>`
        : '') +
      body;
    if (model.rows.length > 0) this.paintStats(model);
    if (focusKey) restoreFirstEnabled([findFocusKey(root, focusKey) as HTMLButtonElement | null]);
  }

  private listHtml(model: AddonsWindowModel): string {
    const chk = (act: string, on: boolean, labelKey: TranslationKey) =>
      `<label class="addons-check"><input type="checkbox" data-act="${act}"${focusKeyAttr(act)}${on ? ' checked' : ''}> ${esc(t(labelKey))}</label>`;
    let html = '<div class="addons-top">';
    html += chk('master', model.masterEnabled, 'hudChrome.addons.masterToggle');
    html += chk('outdated', model.loadOutdated, 'hudChrome.addons.loadOutdated');
    html += `<p class="addons-hint ui-muted">${esc(t('hudChrome.addons.masterHint'))}</p></div>`;
    if (model.bannerKey) {
      html += `<div class="addons-banner" role="status"><p>${esc(t(model.bannerKey))}</p>`;
      html += `<button type="button" class="btn ui-btn" data-act="leaveSafe"${focusKeyAttr('leaveSafe')}>${esc(t('hudChrome.addons.leaveSafe'))}</button></div>`;
    }
    if (model.workshopNoteKey) {
      html += `<p class="addons-hint ui-muted">${esc(t(model.workshopNoteKey))}</p>`;
    }
    html += '<ul class="addons-list">';
    if (model.emptyKey) html += `<li class="addons-empty ui-muted">${esc(t(model.emptyKey))}</li>`;
    for (const row of model.rows) html += this.rowHtml(row);
    html += '</ul><div class="addons-actions">';
    html += `<button type="button" class="btn ui-btn" data-act="reload"${focusKeyAttr('reload')}>${esc(t('hudChrome.addons.reload'))}</button>`;
    if (model.desktop) {
      html += `<button type="button" class="btn ui-btn" data-act="folder"${focusKeyAttr('folder')}>${esc(t('hudChrome.addons.openFolder'))}</button>`;
    }
    html += `<button type="button" class="btn ui-btn" data-act="safe"${focusKeyAttr('safe')}>${esc(t('hudChrome.addons.restartSafe'))}</button>`;
    html += `</div><p class="addons-hint ui-muted">${esc(t('hudChrome.addons.memoryNote'))}</p>`;
    return html;
  }

  private rowHtml(row: AddonsWindowRow): string {
    const k = esc(row.key);
    const fk = (act: string) => focusKeyAttr(`${act}:${row.key}`);
    let html = `<li class="addons-row" data-key="${k}"><div class="addons-row-head">`;
    html += `<label class="addons-check"><input type="checkbox" data-act="enable" data-key="${k}"${fk('enable')}${row.enabled ? ' checked' : ''}${row.canToggle ? '' : ' disabled'} aria-label="${esc(t('hudChrome.addons.enable', { name: row.title }))}"> <span class="addons-name">${esc(row.title)}</span></label>`;
    if (row.version) {
      html += `<span class="addons-meta ui-muted">${esc(t('hudChrome.addons.version', { version: row.version }))}</span>`;
    }
    if (row.author) {
      html += `<span class="addons-meta ui-muted">${esc(t('hudChrome.addons.by', { author: row.author }))}</span>`;
    }
    html += `<span class="addons-chip">${esc(t(row.originKey))}</span>`;
    html += `<span class="addons-status addons-status--${row.statusTone}">${esc(t(row.statusKey))}</span></div>`;
    if (row.detailKey) {
      html += `<p class="addons-detail">${esc(t(row.detailKey, row.detailValues))}</p>`;
    }
    if (row.description) html += `<p class="addons-desc">${esc(row.description)}</p>`;
    if (row.permissionKeys.length > 0) {
      html += `<div class="addons-perms"><span class="ui-muted">${esc(t('hudChrome.addons.permissions'))}</span>`;
      for (const key of row.permissionKeys)
        html += `<span class="addons-chip">${esc(t(key))}</span>`;
      html += '</div>';
    }
    html += `<div class="addons-stats ui-muted" data-stats="${k}"></div><div class="addons-row-actions">`;
    if (row.canOptions) {
      html += `<button type="button" class="btn ui-btn" data-act="options" data-key="${k}"${fk('options')}>${esc(t('hudChrome.addons.options'))}</button>`;
    }
    if (row.errors.length > 0) {
      html += `<button type="button" class="btn ui-btn" data-act="errors" data-key="${k}"${fk('errors')} aria-expanded="${row.showErrors}">${esc(t('hudChrome.addons.showErrors', { count: formatNumber(row.errors.length) }))}</button>`;
    }
    html += `<button type="button" class="btn ui-btn" data-act="reset" data-key="${k}"${fk('reset')}>${esc(t('hudChrome.addons.resetSaved'))}</button>`;
    if (row.canPublish) {
      html += `<button type="button" class="btn ui-btn" data-act="publish" data-key="${k}"${fk('publish')}>${esc(t('hudChrome.addons.publish'))}</button>`;
    }
    html += '</div>';
    if (row.showErrors && row.errors.length > 0) {
      html += '<ol class="addons-errors">';
      for (const line of row.errors) html += `<li>${esc(line)}</li>`;
      html += '</ol>';
    }
    return `${html}</li>`;
  }

  private paintStats(model: AddonsWindowModel): void {
    const root = this.root;
    if (!root) return;
    for (const row of model.rows) {
      const cell = [...root.querySelectorAll<HTMLElement>('[data-stats]')].find(
        (el) => el.dataset.stats === row.key,
      );
      if (!cell) continue;
      const s = row.stats;
      const text = row.running
        ? t('hudChrome.addons.stats', {
            cpu: formatNumber(s.cpuMsPerSec, { maximumFractionDigits: 1 }),
            msgs: formatNumber(s.msgsPerSec, { maximumFractionDigits: 0 }),
            widgets: formatNumber(s.widgets),
            kb: formatNumber(savedKb(s.savedBytes), { maximumFractionDigits: 1 }),
            errors: formatNumber(s.errors),
          })
        : '';
      if (cell.textContent !== text) cell.textContent = text;
    }
  }

  private entry(key: string): AddonEntry | undefined {
    return this.deps.runtime.entries.find((e) => e.key === key);
  }

  private optionsHtml(key: string): string {
    const e = this.entry(key);
    const m = e?.manifest;
    if (!e || !m) return '';
    const values = this.deps.runtime.settingsFor(e);
    let html = `<h3 class="addons-sub">${esc(t('hudChrome.addons.optionsTitle', { name: m.name }))}</h3><div class="addons-settings">`;
    for (const s of m.settings) {
      const id = `addon-opt-${esc(m.id)}-${esc(s.key)}`;
      const data = `data-act="setting" data-key="${esc(key)}" data-setting="${esc(s.key)}"${focusKeyAttr(`setting:${s.key}`)}`;
      if (s.type === 'toggle') {
        html += `<label class="addons-check"><input id="${id}" type="checkbox" ${data}${values[s.key] ? ' checked' : ''}> ${esc(s.label)}</label>`;
      } else if (s.type === 'slider') {
        html += `<label class="addons-field" for="${id}">${esc(s.label)}</label><input id="${id}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${Number(values[s.key])}" ${data}>`;
      } else {
        html += `<label class="addons-field" for="${id}">${esc(s.label)}</label><select id="${id}" ${data}>`;
        for (const o of s.options) {
          html += `<option value="${esc(o.value)}"${values[s.key] === o.value ? ' selected' : ''}>${esc(o.label)}</option>`;
        }
        html += '</select>';
      }
    }
    html += `</div><div class="addons-actions"><button type="button" class="btn ui-btn" data-act="back"${focusKeyAttr('back')}>${esc(t('hudChrome.addons.back'))}</button></div>`;
    return html;
  }

  private publishHtml(key: string): string {
    const e = this.entry(key);
    if (!e?.manifest) return '';
    const vis: [string, TranslationKey][] = [
      ['private', 'hudChrome.addons.visibility.private'],
      ['friends', 'hudChrome.addons.visibility.friends'],
      ['unlisted', 'hudChrome.addons.visibility.unlisted'],
      ['public', 'hudChrome.addons.visibility.public'],
    ];
    let html = `<h3 class="addons-sub">${esc(t('hudChrome.addons.publishTitle', { name: e.manifest.name }))}</h3>`;
    html += `<p class="addons-hint ui-muted">${esc(t('hudChrome.addons.publishHint'))}</p>`;
    html += `<label class="addons-field" for="addon-pub-vis">${esc(t('hudChrome.addons.visibility.label'))}</label><select id="addon-pub-vis">`;
    for (const [v, k] of vis) html += `<option value="${v}">${esc(t(k))}</option>`;
    html += `</select><label class="addons-field" for="addon-pub-note">${esc(t('hudChrome.addons.changeNote'))}</label>`;
    html += '<input id="addon-pub-note" type="text" maxlength="400">';
    html += `<div class="addons-actions"><button type="button" class="btn ui-btn" data-act="doPublish" data-key="${esc(key)}"${focusKeyAttr('doPublish')}>${esc(t('hudChrome.addons.publishConfirm'))}</button>`;
    html += `<button type="button" class="btn ui-btn" data-act="back"${focusKeyAttr('back')}>${esc(t('hudChrome.addons.back'))}</button></div>`;
    return html;
  }

  private onClick(ev: Event): void {
    const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const rt = this.deps.runtime;
    const key = el.dataset.key ?? '';
    this.notice = null;
    switch (el.dataset.act) {
      case 'close':
        this.close();
        return;
      case 'reload':
        void rt.reload();
        break;
      case 'folder':
        void desktopBridge()?.openAddonsFolder?.();
        break;
      case 'safe':
        rt.restartInSafeMode();
        return;
      case 'leaveSafe':
        rt.leaveSafeMode();
        break;
      case 'errors':
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
        break;
      case 'options':
        this.view = { kind: 'options', key };
        break;
      case 'publish':
        this.view = { kind: 'publish', key };
        break;
      case 'back':
        this.view = { kind: 'list' };
        break;
      case 'reset': {
        const e = this.entry(key);
        if (e?.manifest) {
          rt.resetSaved(e.manifest.id);
          this.notice = { key: 'hudChrome.addons.resetDone', values: { name: e.manifest.name } };
        }
        break;
      }
      case 'doPublish':
        void this.publish(key);
        return;
      default:
        return;
    }
    this.refresh();
  }

  private onChange(ev: Event): void {
    const el = ev.target as HTMLInputElement | HTMLSelectElement | null;
    if (!el?.dataset.act) return;
    const rt = this.deps.runtime;
    const key = el.dataset.key ?? '';
    if (el.dataset.act === 'master') {
      rt.setMasterEnabled((el as HTMLInputElement).checked);
      this.notice = { key: 'hudChrome.addons.reloadNeeded', values: {} };
    } else if (el.dataset.act === 'outdated') {
      rt.setLoadOutdated((el as HTMLInputElement).checked);
      this.notice = { key: 'hudChrome.addons.reloadNeeded', values: {} };
    } else if (el.dataset.act === 'enable') {
      const e = this.entry(key);
      if (e?.manifest) rt.setAddonEnabled(e.manifest.id, (el as HTMLInputElement).checked);
      this.notice = { key: 'hudChrome.addons.reloadNeeded', values: {} };
    } else if (el.dataset.act === 'setting') {
      const e = this.entry(key);
      const def = e?.manifest?.settings.find((s) => s.key === el.dataset.setting);
      if (!e || !def) return;
      const value =
        def.type === 'toggle'
          ? (el as HTMLInputElement).checked
          : def.type === 'slider'
            ? Number(el.value)
            : el.value;
      rt.setSetting(e, def.key, value);
      return;
    }
    this.refresh();
  }

  private async publish(key: string): Promise<void> {
    const e = this.entry(key);
    const bridge = desktopBridge();
    const root = this.root;
    if (!e || !root || !bridge?.publishAddon) return;
    const vis =
      (root.querySelector('#addon-pub-vis') as HTMLSelectElement | null)?.value ?? 'private';
    const note = (root.querySelector('#addon-pub-note') as HTMLInputElement | null)?.value ?? '';
    const visibility =
      (['public', 'friends', 'private', 'unlisted'] as const).find((v) => v === vis) ?? 'private';
    this.notice = { key: 'hudChrome.addons.publishing', values: {} };
    this.refresh();
    let code = 'failed';
    let itemId = '';
    try {
      const res = await bridge.publishAddon({
        folder: e.pkg.folder,
        visibility,
        changeNote: note.slice(0, 400),
      });
      code = res.code;
      itemId = res.itemId ?? '';
    } catch {
      code = 'failed';
    }
    const keys: Record<string, TranslationKey> = {
      published: 'hudChrome.addons.publishResult.published',
      agreement: 'hudChrome.addons.publishResult.agreement',
      noSteam: 'hudChrome.addons.publishResult.noSteam',
      invalid: 'hudChrome.addons.publishResult.invalid',
      notFound: 'hudChrome.addons.publishResult.notFound',
      failed: 'hudChrome.addons.publishResult.failed',
    };
    this.notice = { key: keys[code] ?? keys.failed, values: { id: itemId } };
    this.view = { kind: 'list' };
    this.refresh();
  }
}
