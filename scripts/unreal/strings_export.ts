// The native client's string table (ea-plan.md workstream W0, feature M34): every English leaf
// of the i18n source catalog (`en` in src/ui/i18n.catalog) as one Unreal string-table CSV whose
// key is the dotted t() key, so a C++ widget asks for `WyndText::Get(TEXT("hud.xp.label"))` and
// never carries player-visible text itself. Placeholders keep the catalog's `{name}` form, which
// FText::Format reads unchanged. English only: locales follow the web catalog at release.
// tests/unreal_strings_export.test.ts keeps the committed copy fresh; the Unreal repo copies it
// to Data/Strings/ (tools/sync_ts_exports.ps1).

import { en } from '../../src/ui/i18n.catalog';

export const STRINGS_EXPORT_FILE = 'wynd_strings_en.csv';

/** The leaves of the catalog object as [dotted key, English text], strings only. */
export function catalogLeaves(node: unknown, prefix = '', out: Array<[string, string]> = []) {
  if (typeof node === 'string') {
    out.push([prefix, node]);
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  const entries = Array.isArray(node)
    ? node.map((v, i) => [String(i), v] as const)
    : Object.entries(node as Record<string, unknown>);
  for (const [k, v] of entries) catalogLeaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** One CSV field: quoted only when it has to be (comma, quote or line break). */
export function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole table, sorted by key, with the header Unreal's string-table import expects. */
export function buildStringsCsv(): string {
  const rows = catalogLeaves(en).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const lines = ['Key,SourceString'];
  for (const [key, text] of rows) lines.push(`${csvField(key)},${csvField(text)}`);
  return `${lines.join('\n')}\n`;
}
