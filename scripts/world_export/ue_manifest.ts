// Incremental output for the Unreal export: every file is hashed (sha256 of
// its bytes); a file whose hash matches the previous manifest and is still on
// disk is not rewritten, so its mtime stays put and Unreal does not reimport
// it. The manifest is the only file that always changes shape, and it carries
// no timestamps, so an unchanged world yields a byte-identical manifest.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FileEntry {
  sha256: string;
  bytes: number;
}

export type FileMap = Record<string, FileEntry>;

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function toBytes(data: Uint8Array | Uint16Array | string): Uint8Array {
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export interface WriteStats {
  written: number;
  unchanged: number;
}

export class IncrementalWriter {
  readonly files: FileMap = {};
  readonly stats: WriteStats = { written: 0, unchanged: 0 };

  constructor(
    private readonly root: string,
    private readonly previous: FileMap,
  ) {}

  /** Write `rel` under the root unless the same bytes are already there. */
  write(rel: string, data: Uint8Array | Uint16Array | string): FileEntry {
    const bytes = toBytes(data);
    const entry: FileEntry = { sha256: sha256(bytes), bytes: bytes.byteLength };
    const abs = path.join(this.root, rel);
    const prev = this.previous[rel];
    const same =
      prev !== undefined &&
      prev.sha256 === entry.sha256 &&
      fs.existsSync(abs) &&
      fs.statSync(abs).size === entry.bytes;
    if (same) {
      this.stats.unchanged++;
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
      this.stats.written++;
    }
    this.files[rel] = entry;
    return entry;
  }
}

/** Previous manifest's file map, or empty when there is none or it is unreadable. */
export function readPreviousFiles(manifestPath: string): FileMap {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files?: FileMap };
    return m.files ?? {};
  } catch {
    return {};
  }
}

/** Stable JSON: keys sorted so the manifest diffs cleanly. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, sort(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 1);
}
