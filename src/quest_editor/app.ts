// The Quest Workshop page: the thin DOM coordinator over the pure cores. The
// left column lists every quest giver by zone with its shipped quests
// (read-only chips) and the workshop's own quests (editable); the right column
// is the quest form. Every label is a t() key (src/ui/i18n.catalog/quest_editor.ts);
// every rule is quest_editor_core.ts (the page only shows its verdicts); every
// id list is content_index_core.ts. Save posts the whole set to the dev
// server's loopback endpoint (vite.config.ts questEditorSavePlugin).

import type { GatherNodeType, PlayerClass } from '../sim/types';
import { formatNumber, t } from '../ui/i18n';
import type { TranslationKey } from '../ui/i18n.catalog';
import { type ContentIndex, PLAYER_CLASSES } from './content_index_core';
import { createPicker, type PickerLabels, type PickerOption } from './picker';
import {
  emitWorkshopModule,
  suggestQuestId,
  type ValidationIssue,
  validateWorkshopQuest,
  WORKSHOP_OBJECTIVE_KINDS,
  type WorkshopObjective,
  type WorkshopObjectiveKind,
  type WorkshopQuest,
} from './quest_editor_core';

export interface QuestWorkshopDeps {
  index: ContentIndex;
  initialQuests: WorkshopQuest[];
  /** POST the set; resolves to the server's verdict. */
  save: (
    quests: readonly WorkshopQuest[],
  ) => Promise<{ ok: true; count: number } | { ok: false; detail: string }>;
}

const KIND_KEYS: Record<WorkshopObjectiveKind, TranslationKey> = {
  kill: 'questEditor.form.kinds.kill',
  collect: 'questEditor.form.kinds.collect',
  interact: 'questEditor.form.kinds.interact',
  gather: 'questEditor.form.kinds.gather',
  craft: 'questEditor.form.kinds.craft',
};

const NODE_KEYS: Record<GatherNodeType, TranslationKey> = {
  ore: 'questEditor.form.nodeTypes.ore',
  wood: 'questEditor.form.nodeTypes.wood',
  herb: 'questEditor.form.nodeTypes.herb',
};

const CLASS_KEYS: Record<PlayerClass, TranslationKey> = {
  warrior: 'classes.warrior',
  paladin: 'classes.paladin',
  hunter: 'classes.hunter',
  rogue: 'classes.rogue',
  priest: 'classes.priest',
  shaman: 'classes.shaman',
  mage: 'classes.mage',
  warlock: 'classes.warlock',
  druid: 'classes.druid',
};

const PENDING_SAVE_KEY = 'woc_quest_workshop_pending_save';

// A save rewrites two generated modules the page imports (the workshop set,
// then the wiki content), so Vite reloads it twice; the flag outlives both and
// is dropped by the first edit after, or by age.
const PENDING_SAVE_MAX_AGE_MS = 60_000;

function writePendingSave(count: number | null): void {
  try {
    if (count === null) sessionStorage.removeItem(PENDING_SAVE_KEY);
    else sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify({ count, at: Date.now() }));
  } catch {
    // Blocked storage: the saved line is lost across the reload, nothing else.
  }
}

function readPendingSave(): number | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SAVE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { count?: unknown; at?: unknown };
    const fresh = typeof parsed.at === 'number' && Date.now() - parsed.at < PENDING_SAVE_MAX_AGE_MS;
    if (!fresh) sessionStorage.removeItem(PENDING_SAVE_KEY);
    return fresh && typeof parsed.count === 'number' ? parsed.count : null;
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(labelText: string, control: HTMLElement, hint?: string, wide = false): HTMLElement {
  const wrap = el('div', wide ? 'qw-field wide' : 'qw-field');
  const label = el('label', undefined, labelText);
  wrap.append(label, control);
  if (hint) wrap.append(el('div', 'qw-hint', hint));
  return wrap;
}

function numberInput(
  value: number | null,
  min: number,
  onChange: (v: number | null) => void,
): HTMLInputElement {
  const input = el('input');
  input.type = 'number';
  input.min = String(min);
  input.step = '1';
  input.value = value === null ? '' : String(value);
  input.addEventListener('input', () => {
    onChange(input.value.trim() === '' ? null : Number(input.value));
  });
  return input;
}

function emptyObjective(kind: WorkshopObjectiveKind): WorkshopObjective {
  switch (kind) {
    case 'kill':
      return { type: 'kill', targetMobId: '', count: 1, label: '' };
    case 'collect':
      return { type: 'collect', itemId: '', count: 1, label: '' };
    case 'interact':
      return { type: 'interact', count: 1, label: '' };
    case 'gather':
      return { type: 'gather', nodeType: 'ore', count: 1, label: '' };
    case 'craft':
      return { type: 'craft', recipeId: '', count: 1, label: '' };
  }
}

export class QuestWorkshopApp {
  private readonly index: ContentIndex;
  private readonly save: QuestWorkshopDeps['save'];
  private quests: WorkshopQuest[];
  private savedSnapshot: string;
  private selectedId: string | null = null;
  private selectedGiver: string | null = null;
  private filter = '';
  private saving = false;

  private readonly catalog = el('div', 'qw-catalog');
  private readonly form = el('div', 'qw-form');
  private readonly status = el('div', 'qw-status');
  private issuesBox: HTMLElement | null = null;
  private codeBox: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private idInput: HTMLInputElement | null = null;
  private idTouched = false;

  private readonly pickerLabels: PickerLabels;
  private readonly npcOptions: PickerOption[];
  private readonly giverOptions: PickerOption[];
  private readonly mobOptions: PickerOption[];
  private readonly itemOptions: PickerOption[];
  private readonly objectOptions: PickerOption[];
  private readonly nodeItemOptions: PickerOption[];
  private readonly recipeOptions: PickerOption[];

  constructor(mount: HTMLElement, deps: QuestWorkshopDeps) {
    this.index = deps.index;
    this.save = deps.save;
    this.quests = deps.initialQuests.map((q) => structuredClone(q));
    this.savedSnapshot = JSON.stringify(this.quests);
    this.pickerLabels = {
      placeholder: t('questEditor.form.pickerPlaceholder'),
      noMatch: t('questEditor.form.pickerNoMatch'),
      clear: t('questEditor.form.pickerClear'),
    };
    const index = this.index;
    this.npcOptions = Object.values(index.npcs).map((npc) => ({
      id: npc.id,
      label: npc.name,
      meta: t('questEditor.form.npcMeta', { title: npc.title, zone: npc.zoneName }),
    }));
    this.giverOptions = this.npcOptions.filter((o) => index.npcs[o.id].questIds.length > 0);
    this.mobOptions = Object.values(index.mobs).map((mob) => ({
      id: mob.id,
      label: mob.name,
      meta:
        mob.zoneName === null
          ? t('questEditor.form.mobMeta', { min: mob.minLevel, max: mob.maxLevel })
          : t('questEditor.form.mobMetaZone', {
              min: mob.minLevel,
              max: mob.maxLevel,
              zone: mob.zoneName,
            }),
    }));
    this.itemOptions = Object.values(index.items).map((item) => ({
      id: item.id,
      label: item.name,
      meta: t('questEditor.form.itemMeta', { kind: item.kind, quality: item.quality }),
    }));
    this.objectOptions = this.itemOptions.filter((o) => index.groundObjectItemIds.has(o.id));
    this.nodeItemOptions = this.itemOptions.filter((o) => index.nodeItemIds.has(o.id));
    this.recipeOptions = Object.values(index.recipes).map((recipe) => ({
      id: recipe.id,
      label: recipe.resultName,
      meta: t('questEditor.form.recipeMeta', {
        profession: recipe.professionId,
        result: recipe.resultName,
      }),
    }));

    const header = el('div', 'qw-header');
    header.append(
      el('h1', undefined, t('questEditor.title')),
      el('div', 'qw-subtitle', t('questEditor.subtitle')),
      this.status,
    );
    const body = el('div', 'qw-body');
    body.append(this.catalog, this.form);
    mount.replaceChildren(header, body);
    // A successful save rewrites generated modules this page imports, so Vite
    // reloads it mid-request; the pending flag survives the reload and turns
    // into the saved line here (a per-viewer convenience, never state).
    const pendingSave = readPendingSave();
    this.setStatus(
      pendingSave === null
        ? t('questEditor.status.loaded', { count: formatNumber(this.quests.length) })
        : t('questEditor.status.saved', { count: formatNumber(pendingSave) }),
      'ok',
    );
    this.renderCatalog();
    this.renderForm();
  }

  // ---------------------------------------------------------------- state

  private get selected(): WorkshopQuest | null {
    return this.quests.find((q) => q.id === this.selectedId) ?? null;
  }

  private dirty(): boolean {
    return JSON.stringify(this.quests) !== this.savedSnapshot;
  }

  private issuesFor(quest: WorkshopQuest): ValidationIssue[] {
    return validateWorkshopQuest(quest, this.index, this.quests);
  }

  private takenIds(): Set<string> {
    return new Set([...Object.keys(this.index.quests), ...this.quests.map((q) => q.id)]);
  }

  private setStatus(text: string, tone: '' | 'ok' | 'err' = ''): void {
    this.status.textContent = text;
    this.status.className = `qw-status ${tone}`.trim();
  }

  private questOptions(exceptId: string | null): PickerOption[] {
    const shipped = Object.values(this.index.quests).map((q) => ({
      id: q.id,
      label: q.name,
      meta: t('questEditor.form.questMeta', {
        giver: this.index.npcs[q.giverNpcId]?.name ?? q.giverNpcId,
      }),
    }));
    const workshop = this.quests
      .filter((q) => q.id !== exceptId)
      .map((q) => ({
        id: q.id,
        label: q.name,
        meta: t('questEditor.form.questMeta', {
          giver: this.index.npcs[q.giverNpcId]?.name ?? q.giverNpcId,
        }),
      }));
    return [...workshop, ...shipped];
  }

  // -------------------------------------------------------------- actions

  private newQuest(giverId: string): void {
    const name = t('questEditor.catalog.newQuestFor', {
      name: this.index.npcs[giverId]?.name ?? giverId,
    });
    const quest: WorkshopQuest = {
      id: suggestQuestId(name, this.takenIds()),
      name: '',
      giverNpcId: giverId,
      turnInNpcId: giverId,
      text: '',
      completionText: '',
      objectives: [emptyObjective('kill')],
      xpReward: 0,
      copperReward: 0,
      itemRewards: {},
      choiceRewards: [],
      recipeReward: null,
      requiresQuest: null,
      minLevel: null,
      maxLevel: null,
      requiredClass: [],
    };
    this.quests.push(quest);
    this.selectedId = quest.id;
    this.selectedGiver = giverId;
    this.idTouched = false;
    this.renderCatalog();
    this.renderForm();
    this.setStatus(t('questEditor.status.unsaved'));
  }

  private duplicateQuest(quest: WorkshopQuest): void {
    const copy = structuredClone(quest);
    copy.id = suggestQuestId(quest.name || quest.id, this.takenIds());
    this.quests.push(copy);
    this.selectedId = copy.id;
    this.idTouched = true;
    this.renderCatalog();
    this.renderForm();
    this.setStatus(t('questEditor.status.unsaved'));
  }

  private deleteQuest(quest: WorkshopQuest): void {
    if (!window.confirm(t('questEditor.actions.confirmDelete', { name: quest.name || quest.id })))
      return;
    this.quests = this.quests.filter((q) => q !== quest);
    this.selectedId = null;
    this.renderCatalog();
    this.renderForm();
    this.setStatus(t('questEditor.status.unsaved'));
  }

  private discardChanges(): void {
    this.quests = JSON.parse(this.savedSnapshot) as WorkshopQuest[];
    if (this.selected === null) this.selectedId = null;
    this.renderCatalog();
    this.renderForm();
    this.setStatus(t('questEditor.status.ready'));
  }

  private async saveAll(): Promise<void> {
    if (this.saving) return;
    if (this.quests.some((q) => this.issuesFor(q).length > 0)) {
      this.setStatus(t('questEditor.status.fixErrors'), 'err');
      return;
    }
    if (!this.dirty()) {
      this.setStatus(t('questEditor.status.noChanges'));
      return;
    }
    this.saving = true;
    this.setStatus(t('questEditor.actions.saving'));
    if (this.saveButton) this.saveButton.disabled = true;
    writePendingSave(this.quests.length);
    try {
      const result = await this.save(this.quests);
      if (result.ok) {
        this.savedSnapshot = JSON.stringify(this.quests);
        this.setStatus(t('questEditor.status.saved', { count: formatNumber(result.count) }), 'ok');
      } else {
        writePendingSave(null);
        this.setStatus(t('questEditor.status.saveFailed', { reason: result.detail }), 'err');
      }
    } finally {
      this.saving = false;
      if (this.saveButton) this.saveButton.disabled = false;
      this.renderCatalog();
    }
  }

  // ------------------------------------------------------------- catalog

  private renderCatalog(): void {
    const index = this.index;
    this.catalog.replaceChildren();
    this.catalog.append(el('h2', undefined, t('questEditor.catalog.heading')));
    const filter = el('input', 'qw-filter');
    filter.type = 'search';
    filter.placeholder = t('questEditor.catalog.filterPlaceholder');
    filter.value = this.filter;
    filter.addEventListener('input', () => {
      this.filter = filter.value;
      this.renderCatalog();
      filter.focus();
    });
    this.catalog.append(filter);

    const needle = this.filter.trim().toLowerCase();
    const savedIds = new Set((JSON.parse(this.savedSnapshot) as WorkshopQuest[]).map((q) => q.id));
    const savedById = new Map(
      (JSON.parse(this.savedSnapshot) as WorkshopQuest[]).map((q) => [q.id, q]),
    );
    const workshopByGiver = new Map<string, WorkshopQuest[]>();
    for (const quest of this.quests) {
      const list = workshopByGiver.get(quest.giverNpcId) ?? [];
      list.push(quest);
      workshopByGiver.set(quest.giverNpcId, list);
    }
    for (const zone of index.zones) {
      const givers = Object.values(index.npcs).filter(
        (npc) =>
          npc.zoneId === zone.id &&
          (npc.questIds.length > 0 || workshopByGiver.has(npc.id)) &&
          (needle === '' ||
            `${npc.name} ${npc.title} ${npc.id} ${zone.name}`.toLowerCase().includes(needle)),
      );
      if (givers.length === 0) continue;
      this.catalog.append(
        el('div', 'qw-zone', t('questEditor.catalog.zoneGroup', { zone: zone.name })),
      );
      for (const npc of givers) {
        const row = el('div', 'qw-giver');
        if (npc.id === this.selectedGiver) row.classList.add('selected');
        const head = el('div');
        head.append(el('span', 'qw-giver-name', npc.name), el('span', 'qw-giver-title', npc.title));
        row.append(head);
        const shipped = el('div', 'qw-chips');
        for (const questId of npc.questIds) {
          const chip = el('span', 'qw-chip', index.quests[questId]?.name ?? questId);
          chip.title = questId;
          shipped.append(chip);
        }
        if (npc.questIds.length > 0) row.append(shipped);
        const mine = workshopByGiver.get(npc.id) ?? [];
        if (mine.length > 0) {
          const chips = el('div', 'qw-chips');
          for (const quest of mine) {
            const chip = el('button', 'qw-chip workshop', quest.name || quest.id);
            chip.type = 'button';
            chip.title = quest.id;
            if (quest.id === this.selectedId) chip.classList.add('selected');
            if (this.issuesFor(quest).length > 0) {
              chip.append(el('span', 'mark', t('questEditor.catalog.invalidMark')));
            } else if (
              !savedIds.has(quest.id) ||
              JSON.stringify(savedById.get(quest.id)) !== JSON.stringify(quest)
            ) {
              chip.append(el('span', 'mark unsaved', t('questEditor.catalog.unsavedMark')));
            }
            chip.addEventListener('click', (ev) => {
              ev.stopPropagation();
              this.selectedId = quest.id;
              this.selectedGiver = npc.id;
              this.idTouched = true;
              this.renderCatalog();
              this.renderForm();
            });
            chips.append(chip);
          }
          row.append(chips);
        }
        const add = el('button', 'small qw-new', t('questEditor.catalog.newQuest'));
        add.type = 'button';
        add.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.newQuest(npc.id);
        });
        row.append(add);
        row.addEventListener('click', () => {
          this.selectedGiver = npc.id;
          this.renderCatalog();
          if (this.selected === null) this.renderForm();
        });
        this.catalog.append(row);
      }
    }
  }

  // ---------------------------------------------------------------- form

  private renderForm(): void {
    const quest = this.selected;
    this.form.replaceChildren();
    this.issuesBox = null;
    this.codeBox = null;
    this.saveButton = null;
    this.idInput = null;
    if (quest === null) {
      this.form.append(
        el('h2', undefined, t('questEditor.form.emptyHeading')),
        el('p', 'qw-empty', t('questEditor.form.emptyHint')),
      );
      if (this.quests.length === 0) {
        this.form.append(el('p', 'qw-empty', t('questEditor.catalog.noWorkshopQuests')));
      }
      return;
    }
    this.form.append(el('h2', undefined, t('questEditor.form.heading')));
    this.form.append(this.renderActions(quest));
    this.issuesBox = el('div', 'qw-issues');
    this.form.append(this.issuesBox);
    this.form.append(this.renderBasics(quest));
    this.form.append(this.renderObjectives(quest));
    this.form.append(this.renderRewards(quest));
    this.form.append(this.renderRequirements(quest));
    const code = el('div', 'qw-section');
    code.append(el('h3', undefined, t('questEditor.form.sectionCode')));
    code.append(el('div', 'qw-hint', t('questEditor.form.codeHint')));
    this.codeBox = el('pre', 'qw-code');
    code.append(this.codeBox);
    this.form.append(code);
    this.refreshDerived();
  }

  private renderActions(quest: WorkshopQuest): HTMLElement {
    const bar = el('div', 'qw-actions');
    const save = el('button', 'primary', t('questEditor.actions.save'));
    save.type = 'button';
    save.addEventListener('click', () => void this.saveAll());
    this.saveButton = save;
    const duplicate = el('button', undefined, t('questEditor.actions.duplicate'));
    duplicate.type = 'button';
    duplicate.addEventListener('click', () => this.duplicateQuest(quest));
    const discard = el('button', undefined, t('questEditor.actions.discard'));
    discard.type = 'button';
    discard.addEventListener('click', () => this.discardChanges());
    const remove = el('button', 'danger', t('questEditor.actions.delete'));
    remove.type = 'button';
    remove.addEventListener('click', () => this.deleteQuest(quest));
    bar.append(save, duplicate, discard, remove);
    return bar;
  }

  private section(titleKey: TranslationKey): { section: HTMLElement; grid: HTMLElement } {
    const section = el('div', 'qw-section');
    section.append(el('h3', undefined, t(titleKey)));
    const grid = el('div', 'qw-grid');
    section.append(grid);
    return { section, grid };
  }

  private renderBasics(quest: WorkshopQuest): HTMLElement {
    const { section, grid } = this.section('questEditor.form.sectionBasics');
    const name = el('input');
    name.type = 'text';
    name.placeholder = t('questEditor.form.namePlaceholder');
    name.value = quest.name;
    name.maxLength = 80;
    name.addEventListener('input', () => {
      quest.name = name.value;
      if (!this.idTouched) {
        const taken = this.takenIds();
        taken.delete(quest.id);
        quest.id = suggestQuestId(name.value, taken);
        this.selectedId = quest.id;
        if (this.idInput) this.idInput.value = quest.id;
      }
      this.refreshDerived();
    });
    grid.append(field(t('questEditor.form.name'), name));

    const id = el('input');
    id.type = 'text';
    id.value = quest.id;
    id.spellcheck = false;
    id.addEventListener('input', () => {
      this.idTouched = true;
      quest.id = id.value.trim();
      this.selectedId = quest.id;
      this.refreshDerived();
    });
    this.idInput = id;
    grid.append(field(t('questEditor.form.id'), id, t('questEditor.form.idHint')));

    const giver = createPicker(this.giverOptions, this.pickerLabels, quest.giverNpcId, (value) => {
      const previous = quest.giverNpcId;
      quest.giverNpcId = value ?? '';
      if (quest.turnInNpcId === previous || quest.turnInNpcId === '') {
        quest.turnInNpcId = quest.giverNpcId;
        turnIn.setValue(quest.turnInNpcId || null);
      }
      this.selectedGiver = quest.giverNpcId || this.selectedGiver;
      this.refreshDerived();
    });
    grid.append(field(t('questEditor.form.giver'), giver.root));
    const turnIn = createPicker(this.npcOptions, this.pickerLabels, quest.turnInNpcId, (value) => {
      quest.turnInNpcId = value ?? '';
      this.refreshDerived();
    });
    grid.append(field(t('questEditor.form.turnIn'), turnIn.root, t('questEditor.form.turnInHint')));

    const text = el('textarea');
    text.placeholder = t('questEditor.form.textPlaceholder');
    text.value = quest.text;
    text.addEventListener('input', () => {
      quest.text = text.value;
      this.refreshDerived();
    });
    grid.append(field(t('questEditor.form.text'), text, undefined, true));
    const completion = el('textarea');
    completion.placeholder = t('questEditor.form.completionPlaceholder');
    completion.value = quest.completionText;
    completion.addEventListener('input', () => {
      quest.completionText = completion.value;
      this.refreshDerived();
    });
    grid.append(field(t('questEditor.form.completionText'), completion, undefined, true));
    return section;
  }

  private renderObjectives(quest: WorkshopQuest): HTMLElement {
    const section = el('div', 'qw-section');
    section.append(el('h3', undefined, t('questEditor.form.sectionObjectives')));
    const list = el('div');
    section.append(list);
    const rebuild = (): void => {
      list.replaceChildren();
      quest.objectives.forEach((objective, i) => {
        list.append(this.renderObjective(quest, objective, i, rebuild));
      });
      this.refreshDerived();
    };
    rebuild();
    const add = el('button', undefined, t('questEditor.form.addObjective'));
    add.type = 'button';
    add.addEventListener('click', () => {
      quest.objectives.push(emptyObjective('kill'));
      rebuild();
    });
    section.append(add);
    return section;
  }

  private renderObjective(
    quest: WorkshopQuest,
    objective: WorkshopObjective,
    i: number,
    rebuild: () => void,
  ): HTMLElement {
    const row = el('div', 'qw-objective');
    const tools = el('div', 'qw-row-tools');
    tools.append(el('span', undefined, `#${formatNumber(i + 1)}`));
    const remove = el('button', 'small', t('questEditor.form.removeObjective'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      quest.objectives.splice(i, 1);
      rebuild();
    });
    tools.append(remove);
    row.append(tools);

    const kind = el('select');
    for (const k of WORKSHOP_OBJECTIVE_KINDS) {
      const option = el('option', undefined, t(KIND_KEYS[k]));
      option.value = k;
      if (k === objective.type) option.selected = true;
      kind.append(option);
    }
    kind.addEventListener('change', () => {
      const next = emptyObjective(kind.value as WorkshopObjectiveKind);
      next.count = objective.count;
      next.label = objective.label;
      quest.objectives[i] = next;
      rebuild();
    });
    row.append(field(t('questEditor.form.objectiveKind'), kind));

    const target = (
      options: PickerOption[],
      value: string | null,
      set: (v: string | null) => void,
    ) =>
      field(
        t('questEditor.form.objectiveTarget'),
        createPicker(options, this.pickerLabels, value, (v) => {
          set(v);
          this.refreshDerived();
        }).root,
      );

    switch (objective.type) {
      case 'kill':
        row.append(
          target(this.mobOptions, objective.targetMobId || null, (v) => {
            objective.targetMobId = v ?? '';
          }),
        );
        break;
      case 'collect':
        row.append(
          target(this.itemOptions, objective.itemId || null, (v) => {
            objective.itemId = v ?? '';
          }),
        );
        break;
      case 'interact': {
        const npc = createPicker(
          this.npcOptions,
          this.pickerLabels,
          objective.targetNpcId ?? null,
          (v) => {
            if (v === null) delete objective.targetNpcId;
            else {
              objective.targetNpcId = v;
              delete objective.targetObjectItemId;
              object.setValue(null);
            }
            this.refreshDerived();
          },
        );
        const object = createPicker(
          this.objectOptions,
          this.pickerLabels,
          objective.targetObjectItemId ?? null,
          (v) => {
            if (v === null) delete objective.targetObjectItemId;
            else {
              objective.targetObjectItemId = v;
              delete objective.targetNpcId;
              npc.setValue(null);
            }
            this.refreshDerived();
          },
        );
        row.append(field(t('questEditor.form.objectiveInteractNpc'), npc.root));
        row.append(field(t('questEditor.form.objectiveInteractObject'), object.root));
        break;
      }
      case 'gather': {
        const node = el('select');
        for (const type of this.index.nodeTypes) {
          const option = el('option', undefined, t(NODE_KEYS[type]));
          option.value = type;
          if (type === objective.nodeType) option.selected = true;
          node.append(option);
        }
        node.addEventListener('change', () => {
          objective.nodeType = node.value as GatherNodeType;
          this.refreshDerived();
        });
        row.append(field(t('questEditor.form.objectiveTarget'), node));
        row.append(
          field(
            t('questEditor.form.objectiveGatherItem'),
            createPicker(this.nodeItemOptions, this.pickerLabels, objective.itemId ?? null, (v) => {
              if (v === null) delete objective.itemId;
              else objective.itemId = v;
              this.refreshDerived();
            }).root,
          ),
        );
        break;
      }
      case 'craft':
        row.append(
          target(this.recipeOptions, objective.recipeId || null, (v) => {
            objective.recipeId = v ?? '';
          }),
        );
        break;
    }

    const count = numberInput(objective.count, 1, (v) => {
      objective.count = v ?? 0;
      this.refreshDerived();
    });
    row.append(field(t('questEditor.form.objectiveCount'), count));
    const label = el('input');
    label.type = 'text';
    label.placeholder = t('questEditor.form.objectiveLabelPlaceholder');
    label.value = objective.label;
    label.addEventListener('input', () => {
      objective.label = label.value;
      this.refreshDerived();
    });
    row.append(field(t('questEditor.form.objectiveLabel'), label));
    return row;
  }

  private renderRewards(quest: WorkshopQuest): HTMLElement {
    const { section, grid } = this.section('questEditor.form.sectionRewards');
    const xp = numberInput(quest.xpReward, 0, (v) => {
      quest.xpReward = v ?? 0;
      this.refreshDerived();
    });
    grid.append(field(t('questEditor.form.xp'), xp));

    const money = el('div', 'qw-money');
    const gold = numberInput(Math.floor(quest.copperReward / 10000), 0, () => recount());
    const silver = numberInput(Math.floor(quest.copperReward / 100) % 100, 0, () => recount());
    const copper = numberInput(quest.copperReward % 100, 0, () => recount());
    silver.max = '99';
    copper.max = '99';
    const recount = (): void => {
      const g = Number(gold.value || 0);
      const s = Number(silver.value || 0);
      const c = Number(copper.value || 0);
      quest.copperReward = g * 10000 + s * 100 + c;
      this.refreshDerived();
    };
    money.append(
      gold,
      el('span', undefined, t('questEditor.form.gold')),
      silver,
      el('span', undefined, t('questEditor.form.silver')),
      copper,
      el('span', undefined, t('questEditor.form.copper')),
    );
    grid.append(field(t('questEditor.form.money'), money));

    const choices = el('div');
    const rebuildChoices = (): void => {
      choices.replaceChildren();
      quest.choiceRewards.forEach((itemId, i) => {
        const line = el('div', 'qw-money');
        const picker = createPicker(this.itemOptions, this.pickerLabels, itemId || null, (v) => {
          if (v === null) {
            quest.choiceRewards.splice(i, 1);
            rebuildChoices();
          } else quest.choiceRewards[i] = v;
          this.refreshDerived();
        });
        picker.root.style.flex = '1';
        line.append(picker.root);
        choices.append(line);
      });
      const add = el('button', 'small', t('questEditor.form.addChoiceReward'));
      add.type = 'button';
      add.addEventListener('click', () => {
        quest.choiceRewards.push('');
        rebuildChoices();
        this.refreshDerived();
      });
      choices.append(add);
    };
    rebuildChoices();
    grid.append(
      field(
        t('questEditor.form.choiceRewards'),
        choices,
        t('questEditor.form.choiceRewardsHint'),
        true,
      ),
    );

    const perClass = el('div', 'qw-grid');
    for (const cls of PLAYER_CLASSES) {
      const picker = createPicker(
        this.itemOptions,
        this.pickerLabels,
        quest.itemRewards[cls] ?? null,
        (v) => {
          if (v === null) delete quest.itemRewards[cls];
          else quest.itemRewards[cls] = v;
          this.refreshDerived();
        },
      );
      perClass.append(field(t(CLASS_KEYS[cls]), picker.root));
    }
    grid.append(
      field(
        t('questEditor.form.classRewards'),
        perClass,
        t('questEditor.form.classRewardsHint'),
        true,
      ),
    );

    const recipe = createPicker(this.recipeOptions, this.pickerLabels, quest.recipeReward, (v) => {
      quest.recipeReward = v;
      this.refreshDerived();
    });
    grid.append(field(t('questEditor.form.recipeReward'), recipe.root));
    return section;
  }

  private renderRequirements(quest: WorkshopQuest): HTMLElement {
    const { section, grid } = this.section('questEditor.form.sectionRequirements');
    grid.append(
      field(
        t('questEditor.form.minLevel'),
        numberInput(quest.minLevel, 1, (v) => {
          quest.minLevel = v;
          this.refreshDerived();
        }),
        t('questEditor.form.levelHint'),
      ),
    );
    grid.append(
      field(
        t('questEditor.form.maxLevel'),
        numberInput(quest.maxLevel, 1, (v) => {
          quest.maxLevel = v;
          this.refreshDerived();
        }),
        t('questEditor.form.levelHint'),
      ),
    );
    const prerequisite = createPicker(
      this.questOptions(quest.id),
      this.pickerLabels,
      quest.requiresQuest,
      (v) => {
        quest.requiresQuest = v;
        this.refreshDerived();
      },
    );
    grid.append(
      field(
        t('questEditor.form.prerequisite'),
        prerequisite.root,
        t('questEditor.form.prerequisiteHint'),
      ),
    );

    const classes = el('div', 'qw-classes');
    for (const cls of PLAYER_CLASSES) {
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = quest.requiredClass.includes(cls);
      box.addEventListener('change', () => {
        quest.requiredClass = PLAYER_CLASSES.filter((c) =>
          c === cls ? box.checked : quest.requiredClass.includes(c),
        );
        this.refreshDerived();
      });
      label.append(box, document.createTextNode(t(CLASS_KEYS[cls])));
      classes.append(label);
    }
    grid.append(
      field(
        t('questEditor.form.requiredClass'),
        classes,
        t('questEditor.form.requiredClassHint'),
        true,
      ),
    );
    return section;
  }

  // ------------------------------------------------------------- derived

  private issueText(issue: ValidationIssue): string {
    const key = `questEditor.issues.${issue.code}` as TranslationKey;
    return t(key, {
      value: issue.value ?? '',
      row: issue.objectiveIndex === undefined ? '' : formatNumber(issue.objectiveIndex + 1),
    });
  }

  /** Re-run validation and the code preview for the selected quest, and
   *  refresh the catalog marks, without rebuilding the form (keeps focus). */
  private refreshDerived(): void {
    const quest = this.selected;
    if (quest === null || this.issuesBox === null || this.codeBox === null) return;
    const issues = this.issuesFor(quest);
    this.issuesBox.replaceChildren();
    this.issuesBox.hidden = issues.length === 0;
    if (issues.length > 0) {
      const ul = el('ul');
      for (const issue of issues) ul.append(el('li', undefined, this.issueText(issue)));
      this.issuesBox.append(ul);
    }
    this.codeBox.textContent = emitWorkshopModule([quest]);
    if (this.saveButton) this.saveButton.disabled = this.saving || issues.length > 0;
    if (this.dirty()) {
      writePendingSave(null);
      this.setStatus(t('questEditor.status.unsaved'));
    }
    this.renderCatalog();
  }
}
