// The Quest Workshop's searchable picker: a text input over a filtered list of
// options (an NPC, a mob, an item, a recipe, a quest), each shown as its
// display name, an optional meta line and its id. Owns its own DOM; the labels
// it needs (placeholder, the no-match line, the clear button) arrive localized
// from the app, so this module stays i18n-free.

export interface PickerOption {
  id: string;
  label: string;
  /** A secondary line (level band, zone, kind) shown under the label. */
  meta?: string;
  /** Extra words the filter also matches on (a zone name, a title). */
  keywords?: string;
}

export interface PickerLabels {
  placeholder: string;
  noMatch: string;
  clear: string;
}

export interface Picker {
  root: HTMLElement;
  setValue(id: string | null): void;
  getValue(): string | null;
}

const MAX_SHOWN = 60;

function matches(option: PickerOption, needle: string): boolean {
  if (needle === '') return true;
  const hay =
    `${option.label} ${option.id} ${option.meta ?? ''} ${option.keywords ?? ''}`.toLowerCase();
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

export function createPicker(
  options: readonly PickerOption[],
  labels: PickerLabels,
  initial: string | null,
  onChange: (id: string | null) => void,
): Picker {
  const byId = new Map(options.map((o) => [o.id, o]));
  const root = document.createElement('div');
  root.className = 'qw-picker';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = labels.placeholder;
  input.autocomplete = 'off';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'qw-picker-clear';
  clear.textContent = labels.clear;
  clear.title = labels.clear;
  const list = document.createElement('ul');
  list.hidden = true;
  root.append(input, clear, list);

  let value: string | null = null;
  let active = 0;
  let shown: PickerOption[] = [];

  const display = (): void => {
    const option = value === null ? undefined : byId.get(value);
    input.value = option ? option.label : (value ?? '');
    clear.hidden = value === null;
  };

  const close = (): void => {
    list.hidden = true;
    display();
  };

  const choose = (id: string | null): void => {
    value = id;
    close();
    onChange(id);
  };

  const render = (): void => {
    const needle = input.value.trim().toLowerCase();
    shown = options.filter((o) => matches(o, needle)).slice(0, MAX_SHOWN);
    active = 0;
    list.replaceChildren();
    if (shown.length === 0) {
      const li = document.createElement('li');
      li.className = 'meta';
      li.textContent = labels.noMatch;
      list.append(li);
    }
    shown.forEach((option, i) => {
      const li = document.createElement('li');
      if (i === active) li.classList.add('active');
      const id = document.createElement('span');
      id.className = 'id';
      id.textContent = option.id;
      const label = document.createElement('span');
      label.textContent = option.label;
      li.append(id, label);
      if (option.meta) {
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = option.meta;
        li.append(meta);
      }
      li.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        choose(option.id);
      });
      list.append(li);
    });
    list.hidden = false;
  };

  input.addEventListener('focus', () => {
    input.select();
    render();
  });
  input.addEventListener('input', render);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (ev) => {
    if (list.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const next = ev.key === 'ArrowDown' ? active + 1 : active - 1;
      active = Math.max(0, Math.min(shown.length - 1, next));
      list.querySelectorAll('li').forEach((li, i) => {
        li.classList.toggle('active', i === active);
      });
      list.querySelectorAll('li')[active]?.scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const option = shown[active];
      if (option) choose(option.id);
    } else if (ev.key === 'Escape') {
      close();
      input.blur();
    }
  });
  clear.addEventListener('click', () => choose(null));

  value = initial;
  display();
  return {
    root,
    setValue(id) {
      value = id;
      display();
    },
    getValue: () => value,
  };
}
