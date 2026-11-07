// Live-ops templates: every metric the alert rules read exists in server/
// (a rename there must update deploy/alerts/wyndlewood.rules.yml), and the
// off-machine backup script stays a credential-free, strict-mode template.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tsFilesUnder } from './helpers/ts_files_under';

const root = process.cwd();
const rules = fs.readFileSync(path.join(root, 'deploy/alerts/wyndlewood.rules.yml'), 'utf8');
const backup = fs.readFileSync(path.join(root, 'deploy/backup_offsite.sh'), 'utf8');

describe('alert rule templates', () => {
  it('only read woc_* metrics the server defines', () => {
    const serverSource = tsFilesUnder(path.join(root, 'server'))
      .map(({ full }) => fs.readFileSync(full, 'utf8'))
      .join('\n');
    const used = [...new Set(rules.match(/\bwoc_[a-z_]+/g) ?? [])];
    expect(used.length).toBeGreaterThan(5);
    const missing = used.filter((name) => !serverSource.includes(`'${name}'`));
    expect(missing, 'alert rules name a metric the server no longer exports').toEqual([]);
  });

  it('link only to runbooks that exist', () => {
    for (const ref of new Set(rules.match(/docs\/launch\/[a-z-]+\.md/g) ?? [])) {
      expect(fs.existsSync(path.join(root, ref)), ref).toBe(true);
    }
  });

  it('the backup metric the BackupMissing rule reads is what the script writes', () => {
    expect(rules).toContain('wyndlewood_backup_last_success_timestamp_seconds');
    expect(backup).toContain('wyndlewood_backup_last_success_timestamp_seconds');
  });
});

describe('off-machine backup script', () => {
  it('is strict-mode bash that parses', () => {
    expect(backup.startsWith('#!/usr/bin/env bash')).toBe(true);
    expect(backup).toContain('set -euo pipefail');
    // The parse check needs a POSIX bash; a Windows checkout (CRLF, or WSL's
    // bash.exe with path translation) cannot run it faithfully, so it is a
    // Linux/macOS (CI) check only.
    if (process.platform !== 'win32') {
      execFileSync('bash', ['-n', path.join(root, 'deploy/backup_offsite.sh')]);
    }
  });

  it('carries no credential: keys come from the env file and rclone config', () => {
    expect(backup).not.toMatch(/AKIA[0-9A-Z]{12,}/);
    expect(backup).not.toMatch(/AGE-SECRET-KEY-/);
    expect(backup).not.toMatch(/(password|secret|token)\s*=\s*['"][^'"$]+['"]/i);
    // The dump is encrypted to a PUBLIC recipient before it leaves the host.
    expect(backup).toContain('age -r "$AGE_RECIPIENT"');
  });

  it('deletes a partial dump on any failure and refuses a loose env file', () => {
    expect(backup).toContain('trap cleanup EXIT');
    expect(backup).toMatch(/rm -f "\$out"/);
    // ok=1 is set only on the success line, after every check passed.
    expect(backup.indexOf('ok=1')).toBeGreaterThan(backup.indexOf('rclone size'));
    expect(backup).toContain('stat -c %u "$ENV_FILE"');
    expect(backup).toMatch(/"\$mode" != "600"/);
  });
});
