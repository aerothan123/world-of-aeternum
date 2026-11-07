// The first-launch player-agreements dialog painter: the thin DOM consumer of
// the pure view model in legal_acceptance_core.ts. It mints the dialog's static
// skeleton once, writes every text node and attribute through the PainterHost
// writer facet (painter_host.ts; it owns a small facet of its own, like
// hud/menu/menu_control_controller.ts, because it runs before the HUD exists),
// traps focus with the shared FocusManager, and resolves the player's answer.
//
// It owns no decision and no network: legal_acceptance_prompt.ts decides when
// to show it and records the answer. Every string comes from t() through the
// view's keys; links open in a new tab (the desktop shell hands http(s) window
// opens to the system browser). It borrows the first-login prompt chrome
// (graphics-prompt-* classes in src/styles/shell.css) so no new CSS ships.
// Escape is the DECLINE answer, never an implicit accept.

import type { LegalDocId } from '../legal_versions';
import { markDialogRoot } from './dialog_root';
import { FocusManager } from './focus_manager';
import { t } from './i18n';
import type { LegalAcceptanceView } from './legal_acceptance_core';
import { makeWriterFacet, type PainterHostWriters } from './painter_host';

export interface LegalAcceptanceDialogDeps {
  /** The full document URL for each agreement. */
  urlFor(doc: LegalDocId): string;
  /** The writer facet; defaults to one owned by this dialog. */
  writers?: PainterHostWriters;
}

const ID_STEM = 'legal-acceptance';
const focusManager = new FocusManager();

function ownWriters(): PainterHostWriters {
  return makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {},
    () => {},
  );
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Paint the dialog from the view model and resolve true for I Accept, false for Decline. */
export function showLegalAcceptanceDialog(
  view: LegalAcceptanceView,
  deps: LegalAcceptanceDialogDeps,
): Promise<boolean> {
  const w = deps.writers ?? ownWriters();
  return new Promise<boolean>((resolve) => {
    const backdrop = el('div', 'graphics-prompt-backdrop legal-choice-backdrop');
    w.setAttr(backdrop, 'role', 'presentation');

    const dialog = el('form', 'ui-panel graphics-prompt-dialog legal-choice-dialog');
    dialog.noValidate = true;
    const titleId = `${ID_STEM}-title`;
    const descId = `${ID_STEM}-desc`;
    markDialogRoot(dialog, { labelledBy: titleId, modal: true });
    w.setAttr(dialog, 'aria-describedby', descId);

    const title = el('h2', 'graphics-prompt-title');
    title.id = titleId;
    w.setText(title, t(view.titleKey));

    const body = el('div', 'legal-acceptance-body');
    body.id = descId;
    const intro = el('p', 'graphics-prompt-desc');
    w.setText(intro, t(view.introKey));
    body.append(intro);

    for (const section of view.sections) {
      const block = el('section', 'legal-acceptance-section');
      w.setAttr(block, 'data-legal-doc', section.doc);
      const heading = el('h3', 'graphics-prompt-desc legal-acceptance-heading');
      w.setText(heading, t(section.headingKey));
      block.append(heading);
      if (section.updated) {
        const updated = el('p', 'graphics-prompt-note legal-acceptance-updated');
        w.setText(updated, t(view.updatedKey));
        block.append(updated);
      }
      const points = el('ul', 'graphics-prompt-desc legal-acceptance-points');
      for (const key of section.pointKeys) {
        const li = el('li');
        w.setText(li, t(key));
        points.append(li);
      }
      block.append(points);
      const meta = el('p', 'graphics-prompt-note legal-choice-links');
      const version = el('span');
      w.setText(version, t(view.versionKey, { version: section.version }));
      const link = el('a');
      link.href = deps.urlFor(section.doc);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      w.setText(link, t(view.readFullKey));
      w.setAttr(link, 'aria-describedby', `${ID_STEM}-${section.doc}-heading`);
      heading.id = `${ID_STEM}-${section.doc}-heading`;
      meta.append(version, document.createTextNode(' '), link);
      block.append(meta);
      body.append(block);
    }

    const earlyAccess = el('p', 'graphics-prompt-desc');
    w.setText(earlyAccess, t(view.earlyAccessKey));
    const publisher = el('p', 'graphics-prompt-note legal-acceptance-publisher');
    w.setText(publisher, t(view.publisherKey));
    body.append(earlyAccess, publisher);

    const actions = el('div', 'graphics-prompt-actions');
    const decline = el('button', 'ui-btn legal-choice-decline');
    decline.type = 'button';
    w.setText(decline, t(view.declineKey));
    const accept = el('button', 'ui-btn ui-btn--gold graphics-prompt-confirm legal-choice-accept');
    accept.type = 'submit';
    w.setText(accept, t(view.acceptKey));
    actions.append(decline, accept);

    dialog.append(title, body, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    const focusHandle = focusManager.open({ root: () => dialog });

    let closed = false;
    const close = (answer: boolean): void => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      focusHandle.release();
      resolve(answer);
    };
    dialog.addEventListener('submit', (e) => {
      e.preventDefault();
      close(true);
    });
    decline.addEventListener('click', () => close(false));
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
      e.stopPropagation();
    });
    focusHandle.focusFirst();
  });
}
