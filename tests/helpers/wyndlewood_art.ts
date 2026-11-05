// The Wyndlewood 2D repaint record (scripts/assets/wyndlewood_2d/provenance.json): one row per
// replaced shipping file, keyed by its repository path, carrying the Tripo sheet, cell, task,
// subject, master hash, and the exact shipped bytes (shippingSha256, shippingBytes, pinned by
// apply_provenance.mjs after the family converters ran). Art suites that pinned a replaced
// file's old accepted bytes hold the live file to this record instead.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const WYNDLEWOOD_PROVENANCE_RECORD = 'scripts/assets/wyndlewood_2d/provenance.json';
export const WYNDLEWOOD_PACK = 'wyndlewood-2d-v1';
/** The one `generatedBatches` row in public/ui/items/mapping.json that owns every repainted item. */
export const WYNDLEWOOD_ITEM_BATCH = 'wyndlewood-2d-items-v1';
export const WYNDLEWOOD_OWNER = 'Wyndlewood';
export const WYNDLEWOOD_LICENSE =
  'Wyndlewood original art (owned by the Wyndlewood project owner, created for this game)';
export const WYNDLEWOOD_SOURCE =
  "Tripo text-to-image (seedream_v4) from original text prompts on the Wyndlewood owner's paid Tripo plan; no reference images";

export type WyndlewoodRecord = {
  sheet: string;
  cell: number;
  grid: number;
  taskId: string | null;
  model: string;
  subject: string | null;
  masterSha256: string;
  shippingSha256: string;
  shippingBytes: number;
};

let cache: Record<string, WyndlewoodRecord> | null = null;

export function wyndlewoodProvenance(): Record<string, WyndlewoodRecord> {
  cache ??= JSON.parse(
    readFileSync(path.join(process.cwd(), WYNDLEWOOD_PROVENANCE_RECORD), 'utf8'),
  ) as Record<string, WyndlewoodRecord>;
  return cache;
}

/** The record for one repository-relative file; throws when the repaint never recorded it. */
export function wyndlewoodRecord(file: string): WyndlewoodRecord {
  const key = file.replace(/^\/+/, '');
  const record = wyndlewoodProvenance()[key];
  if (!record) throw new Error(`${key} has no Wyndlewood provenance record`);
  return record;
}

/** The record for one repository-relative file, or null when the repaint did not replace it. */
export function wyndlewoodRecordOrNull(file: string): WyndlewoodRecord | null {
  return wyndlewoodProvenance()[file.replace(/^\/+/, '')] ?? null;
}

export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The exact per-class skill mapping row apply_provenance.mjs writes for a repainted ability
 * icon: the upstream fields are dropped and the row points at its provenance sheet cell.
 */
export function wyndlewoodAbilityRow(cls: string, abilityId: string, output = `${abilityId}.webp`) {
  const record = wyndlewoodRecord(`public/ui/skills/${cls}/${output}`);
  return {
    abilityId,
    output,
    sourcePack: WYNDLEWOOD_PACK,
    sourceFile: `${WYNDLEWOOD_PROVENANCE_RECORD}#${record.sheet}/${record.cell}`,
    source: WYNDLEWOOD_SOURCE,
    owner: WYNDLEWOOD_OWNER,
    license: WYNDLEWOOD_LICENSE,
  };
}

/**
 * The CREDITS.md row label that licenses one repainted directory, carrying the exact number
 * of files the provenance record holds under it (so a file added or dropped from the record
 * without a CREDITS update fails the suites that look the row up).
 */
export function wyndlewoodCreditsLabel(dir: string): string {
  const prefix = dir.endsWith('/') ? dir : `${dir}/`;
  const count = Object.keys(wyndlewoodProvenance()).filter((f) => f.startsWith(prefix)).length;
  if (count === 0) throw new Error(`${prefix} holds no Wyndlewood provenance records`);
  return `Wyndlewood repaint of \`${prefix}\` (${count} files)`;
}

/** The exact aura mapping row apply_provenance.mjs writes for a repainted aura painting. */
export function wyndlewoodAuraRow(auraId: string, output = `${auraId}.webp`) {
  const record = wyndlewoodRecord(`public/ui/auras/${output}`);
  return {
    auraId,
    output,
    sourcePack: WYNDLEWOOD_PACK,
    sourceFile: `${WYNDLEWOOD_PROVENANCE_RECORD}#${record.sheet}/${record.cell}`,
    source: WYNDLEWOOD_SOURCE,
    owner: WYNDLEWOOD_OWNER,
    license: WYNDLEWOOD_LICENSE,
    intendedVisualSubject: record.subject,
    sourceSha256: record.masterSha256,
  };
}

/**
 * The exact 128px alpha footprint every repainted deed crest shares: slice_install.mjs frames
 * each painted cell in one code-built disc and metal ring, so the measured geometry (in the
 * accepted-art manifest shape) is identical for every crest.
 */
export const WYNDLEWOOD_DEED_MEDALLION_GEOMETRY = {
  alphaThreshold: 8,
  min: 0,
  max: 255,
  transparentPixels: 8289,
  translucentPixels: 1028,
  opaquePixels: 7067,
  visiblePixels: 7742,
  coverage: 0.472534,
  alphaBounds: [14, 14, 113, 113],
  padding: [14, 14, 14, 14],
  centerOffset: [0, 0],
};

type Geometry = Record<string, unknown>;
type AuditedAsset = {
  runtimeUrl?: string;
  acceptedSha256?: string;
  acceptedBytes?: number;
  accepted?: { geometry?: Geometry } & Record<string, unknown>;
  expected?: { geometry?: Geometry } & Record<string, unknown>;
  geometry?: Geometry;
};

function repinMedallionGeometry(geometry: Geometry): void {
  if ('transparentPixels' in geometry) {
    for (const key of Object.keys(geometry)) delete geometry[key];
    Object.assign(geometry, structuredClone(WYNDLEWOOD_DEED_MEDALLION_GEOMETRY));
    return;
  }
  for (const key of ['alphaBounds', 'bounds'] as const) {
    if (key in geometry) geometry[key] = [...WYNDLEWOOD_DEED_MEDALLION_GEOMETRY.alphaBounds];
  }
  if ('visiblePixels' in geometry) {
    geometry.visiblePixels = WYNDLEWOOD_DEED_MEDALLION_GEOMETRY.visiblePixels;
  }
}

/**
 * A copy of an accepted-art manifest (the shape scripts/lib/icon_asset_audit.mjs audits) whose
 * repainted assets carry their Wyndlewood shipping pins in place of the superseded accepted
 * bytes and hash, and, for deed crests, the medallion geometry in place of the superseded
 * crest's pinned bounds and pixel counts (in whichever of the accepted, expected, or
 * asset-level geometry blocks the manifest pinned them). Every other field, the per-family
 * contracts and their padding, centring, and coverage limits included, is audited unchanged,
 * so the shared audit still enforces format, size, budget, and alpha mode on the live art;
 * assets the repaint did not touch keep their own pins.
 */
export function withWyndlewoodRepaintPins<M extends { assets: readonly object[] }>(manifest: M): M {
  const copy = structuredClone(manifest);
  for (const asset of copy.assets as AuditedAsset[]) {
    if (typeof asset.runtimeUrl !== 'string') continue;
    const record = wyndlewoodProvenance()[`public${asset.runtimeUrl}`];
    if (!record) continue;
    asset.acceptedSha256 = record.shippingSha256;
    asset.acceptedBytes = record.shippingBytes;
    if (!asset.runtimeUrl.startsWith('/ui/deeds/')) continue;
    for (const geometry of [asset.accepted?.geometry, asset.expected?.geometry, asset.geometry]) {
      if (geometry) repinMedallionGeometry(geometry);
    }
  }
  return copy;
}

/**
 * public/ui/items/mapping.json exactly as it stood before the repaint (the blob at
 * 2fbe8d6a, the commit before c520c078 repainted every item icon), archived because
 * apply_provenance.mjs moved every item out of its upstream entry or batch. The historical
 * art suites audit their superseded batch lineage against this frozen record and the current
 * ownership against the live mapping. The reader refuses a drifted archive.
 */
export const WYNDLEWOOD_SUPERSEDED_ITEM_MAPPING =
  'docs/achievements/wyndlewood-2d-repaint-2026-11-05/superseded-items-mapping.json';
export const WYNDLEWOOD_SUPERSEDED_ITEM_MAPPING_SHA256 =
  '0126b72f468a0116b5fec89e3341012cab34870865137296b2ce8ac757c17805';

export function supersededItemMapping<T>(): T {
  const bytes = readFileSync(path.join(process.cwd(), WYNDLEWOOD_SUPERSEDED_ITEM_MAPPING));
  const digest = sha256Hex(bytes);
  if (digest !== WYNDLEWOOD_SUPERSEDED_ITEM_MAPPING_SHA256) {
    throw new Error(`${WYNDLEWOOD_SUPERSEDED_ITEM_MAPPING} drifted (sha256 ${digest})`);
  }
  return JSON.parse(bytes.toString('utf8')) as T;
}
