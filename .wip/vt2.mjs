// Run vitest files one at a time; compact pass/fail plus failing assertion lines.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const cwd = process.env.VT_CWD ?? 'C:/Users/cdero/Apps/woa-story';
let files = process.argv.slice(2);
if (files.length === 1 && files[0].endsWith('.txt')) {
  files = fs.readFileSync(files[0], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
const failed = [];
const noise = /refresh account|referral|social snapshot|friend index|runWithStatementTimeout/;
for (const f of files) {
  const r = spawnSync(`node_modules\\.bin\\vitest run ${f} --reporter=verbose --testTimeout=60000`, {
    cwd, shell: true, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, CI: '1' },
  });
  const out = `${r.stdout}\n${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
  const tests = /Tests\s+(.*)/.exec(out)?.[1] ?? '?';
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} ${f} :: ${tests}`);
  if (r.status !== 0) {
    failed.push(f);
    const lines = out.split(/\r?\n/).filter((l) => !noise.test(l));
    const keep = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/FAIL |AssertionError|Error:|Expected|Received|^\s*[-+] |\u00d7|\u2717|toBe|toEqual|\.test\.ts:\d+/.test(l)) keep.push(l.slice(0, 400));
    }
    console.log(keep.slice(0, 60).join('\n'));
  }
}
console.log('FAILED FILES:', failed.join(' ') || 'none');
