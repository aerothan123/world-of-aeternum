import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// The Solana browser RPC boundary this file used to pin (jayson's browser client
// versus its stream-json server utilities) retired with the wallet stack: no
// @solana, @reown or @wallet-standard package is in the manifest any more
// (tests/crypto_removed.test.ts pins that), so there is no closure to prove.
describe('documented dependency advisory boundaries', () => {
  it('keeps Electron packaging downloads on Got without HTTP caching', () => {
    const builderRequire = createRequire(require.resolve('app-builder-lib'));
    const electronGetEntry = builderRequire.resolve('@electron/get');
    const electronRequire = createRequire(electronGetEntry);
    const got = electronRequire('got');
    expect(got.defaults.options.cache).toBeUndefined();
    const downloader = readFileSync(
      path.join(path.dirname(electronGetEntry), 'GotDownloader.js'),
      'utf8',
    );
    expect(downloader).toContain('got_1.default.stream(url, gotOptions)');
    expect(downloader).not.toMatch(/\bcache\s*:/);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.build?.electronDownload?.cache).toBeUndefined();
  });
});
