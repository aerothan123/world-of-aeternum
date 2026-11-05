// The small two-button modal the analytics consent prompt uses
// (src/ui/analytics_consent_prompt.ts); the agreements gate has its own
// view-core plus painter pair (legal_acceptance_core.ts / _controller.ts). It borrows the first-login graphics
// prompt's chrome (graphics-prompt-* classes in src/styles/shell.css) so no new
// CSS ships, and its shape: a self-contained top-level modal with a focus trap,
// a dialog root, and every key stopped at the backdrop.
//
// Every string arrives already localized (the callers pass t() results); this
// module renders text and hrefs, it never spells copy. Links open in a new tab
// (the desktop shell hands http(s) window opens to the system browser).

import { markDialogRoot } from './dialog_root';
import { FocusManager } from './focus_manager';

export interface LegalChoiceLink {
  label: string;
  href: string;
}

export interface LegalChoiceDialogSpec {
  /** A unique id stem for the dialog's title/description ids. */
  idStem: string;
  title: string;
  paragraphs: readonly string[];
  links: readonly LegalChoiceLink[];
  note?: string;
  acceptLabel: string;
  declineLabel: string;
}

const focusManager = new FocusManager();

/**
 * Show the dialog and resolve true for the accept button, false for decline.
 * Escape is the DECLINE answer (never an implicit accept), so neither prompt can
 * be dismissed into a "yes".
 */
export function showLegalChoiceDialog(spec: LegalChoiceDialogSpec): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'graphics-prompt-backdrop legal-choice-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const dialog = document.createElement('form');
    dialog.className = 'ui-panel graphics-prompt-dialog legal-choice-dialog';
    dialog.noValidate = true;
    const titleId = `${spec.idStem}-title`;
    const descId = `${spec.idStem}-desc`;
    markDialogRoot(dialog, { labelledBy: titleId, modal: true });
    dialog.setAttribute('aria-describedby', descId);

    const title = document.createElement('h2');
    title.id = titleId;
    title.className = 'graphics-prompt-title';
    title.textContent = spec.title;

    const body = document.createElement('div');
    body.id = descId;
    for (const text of spec.paragraphs) {
      const p = document.createElement('p');
      p.className = 'graphics-prompt-desc';
      p.textContent = text;
      body.append(p);
    }

    const links = document.createElement('ul');
    links.className = 'graphics-prompt-desc legal-choice-links';
    for (const link of spec.links) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.label;
      li.append(a);
      links.append(li);
    }

    const actions = document.createElement('div');
    actions.className = 'graphics-prompt-actions';
    if (spec.note) {
      const note = document.createElement('p');
      note.className = 'graphics-prompt-note';
      note.textContent = spec.note;
      actions.append(note);
    }
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'ui-btn legal-choice-decline';
    decline.textContent = spec.declineLabel;
    const accept = document.createElement('button');
    accept.type = 'submit';
    accept.className = 'ui-btn ui-btn--gold graphics-prompt-confirm legal-choice-accept';
    accept.textContent = spec.acceptLabel;
    actions.append(decline, accept);

    dialog.append(title, body, links, actions);
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
