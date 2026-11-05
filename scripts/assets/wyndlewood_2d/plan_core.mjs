// Pure sheet planner for the Wyndlewood 2D replacement. A sheet is one Tripo text-to-image
// task painting GRID x GRID separate subjects in a ruled grid; the slicer cuts it back into
// one master per cell. Original text prompts only: no reference images are ever sent.

export const MAX_PROMPT = 1790; // Tripo text-to-image rejects prompts over 1800 characters

export const STYLE = 'Painted fantasy storybook game art, soft natural colours, warm top-left light.';

export const FAMILY_STYLE = {
  items: 'each cell one complete object centered on a plain dark slate backdrop',
  deeds: 'each cell a full-bleed square painting filling the cell',
  skills: 'each cell a full-bleed square spell painting filling the cell',
  auras: 'each cell a full-bleed square spell painting filling the cell',
  misc: 'each cell one complete subject centered on a plain dark slate backdrop',
};

/** Generation size for a lone painting with the target aspect (about 4.2 MP, sides /16). */
export function wideSize(w, h) {
  const a = w / h;
  const H = Math.round(Math.sqrt(4_200_000 / a) / 16) * 16;
  const W = Math.round((H * a) / 16) * 16;
  return `${W}x${H}`;
}

export function widePrompt(subject) {
  return `${STYLE} A single painting with no border: ${subject}. ${NEGATIVE}`.slice(0, MAX_PROMPT);
}

export const NEGATIVE = 'Pictures only, never any words, captions, titles, letters or numbers, and no frames.';

const cut = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/[\s,;:]+\S*$/, ''));

export function sheetPrompt(family, subjects, grid) {
  const n = grid * grid;
  const head = `${STYLE} A ${grid}x${grid} grid of ${n} separate paintings in equal square cells split by thin black lines, ${FAMILY_STYLE[family]}. Left to right, top to bottom: `;
  const tail = `. ${NEGATIVE}`;
  const per = Math.floor((MAX_PROMPT - head.length - tail.length) / n) - `${n}) `.length - 2;
  const list = subjects.map((s, i) => `${i + 1}) ${cut(s, per)}`).join('; ');
  return `${head}${list}${tail}`;
}

/** Chunk subject records into sheets; a short final sheet is padded with repeats of its own
 *  subjects (those extra cells are discarded) so every sheet keeps the same grid. */
export function planSheets(records, { grid = 4 } = {}) {
  const n = grid * grid;
  const groups = new Map();
  for (const r of records) {
    const k = `${r.family}/${r.group}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  // Merge small groups of one family so sheets stay full.
  const byFamily = new Map();
  for (const [k, list] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const fam = k.split('/')[0];
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push(...list);
  }
  const sheets = [];
  for (const [fam, list] of byFamily) {
    if (fam === 'wide') {
      for (const c of list) {
        const id = `wide_${String(sheets.filter((x) => x.family === 'wide').length + 1).padStart(3, '0')}`;
        sheets.push({ id, family: 'wide', grid: 1, size: wideSize(c.w, c.h), cells: [{ index: 0, file: c.file, id: c.id }], prompt: widePrompt(c.subject) });
      }
      continue;
    }
    for (let i = 0; i < list.length; i += n) {
      const cells = list.slice(i, i + n);
      const id = `${fam}_${String(sheets.filter((s) => s.family === fam).length + 1).padStart(3, '0')}`;
      const subjects = cells.map((c) => c.subject);
      while (subjects.length < n) subjects.push(subjects[subjects.length % cells.length]);
      sheets.push({
        id,
        family: fam,
        grid,
        cells: cells.map((c, j) => ({ index: j, file: c.file, id: c.id })),
        prompt: sheetPrompt(fam, subjects, grid),
      });
    }
  }
  return sheets;
}
