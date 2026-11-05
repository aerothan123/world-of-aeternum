// Writes the native-client protocol export (JSON plus the generated C++ header)
// from the TypeScript sources. Run with `npm run unreal:protocol`; pass a
// directory as the first argument to also copy the header there (for example
// the Unreal project's Source/WyndlewoodCore/Public/Generated).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildProtocolExport,
  PROTOCOL_EXPORT_DIR,
  PROTOCOL_HEADER_FILE,
  PROTOCOL_JSON_FILE,
} from './protocol_export';

const root = resolve(import.meta.dirname, '..', '..');
const { json, header } = buildProtocolExport(root);
const dir = join(root, PROTOCOL_EXPORT_DIR);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, PROTOCOL_JSON_FILE), json);
writeFileSync(join(dir, PROTOCOL_HEADER_FILE), header);
console.log(`wrote ${PROTOCOL_EXPORT_DIR}/${PROTOCOL_JSON_FILE} and ${PROTOCOL_HEADER_FILE}`);
const extra = process.argv[2];
if (extra) {
  mkdirSync(extra, { recursive: true });
  writeFileSync(join(extra, PROTOCOL_HEADER_FILE), header);
  console.log(`copied ${PROTOCOL_HEADER_FILE} to ${extra}`);
}
