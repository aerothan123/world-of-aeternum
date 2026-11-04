// Re-pin the split delivery (export_split.json, held to the served bytes by
// tests/woc_export.test.ts) after the paint pass: the pass changes only image bytes, and only
// of the bases and the under-armor atlases among the pinned files, so every pinned file's sha256
// is read again off disk and nothing else in the pin moves. build_woc_split.mjs --pin-only
// cannot do this: it pins only what a full verified split build wrote, and that build needs the
// Blender export this host does not have. A re-pin that would touch any file other than a base
// or an under-armor atlas fails: an armor file or a library changing is not this pass.
//
// Usage: node scripts/assets/woc_character/painted/repin.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const PIN = path.join(HERE, '..', 'export_split.json');
const pin = JSON.parse(fs.readFileSync(PIN, 'utf8'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const moved = [];
for (const rel of Object.keys(pin.files)) {
  const now = sha(path.join(ROOT, 'public', rel));
  if (now === pin.files[rel]) continue;
  if (!/\/base_(male|female)\.glb$|_underarmor\.ktx2$/.test(rel)) {
    throw new Error(`${rel} changed, and the paint pass never writes it: rebuild, do not re-pin`);
  }
  pin.files[rel] = now;
  moved.push(rel);
}
fs.writeFileSync(PIN, `${JSON.stringify(pin, null, 2)}\n`);
console.log('REPIN', moved.length, 'files');
for (const rel of moved) console.log(' ', rel);
