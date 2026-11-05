// Whether this session runs the stylized character TEST (`?stylizedchars=1`),
// read ONCE at module load. Dev builds only: a production bundle constant-folds
// `import.meta.env.DEV` to false, so the flag cannot be reached there, and a
// host without a location (Node, the headless env, every test) always runs
// stock. The rule and the defs it gates are stylized_char_test_core.ts.
import { stylizedCharsRequested } from './stylized_char_test_core';

function readFlag(): boolean {
  if (!import.meta.env?.DEV) return false;
  if (typeof location === 'undefined') return false;
  return stylizedCharsRequested(location.search);
}

const enabled = readFlag();

/** True when this dev session opted into the stylized character test. */
export function stylizedCharsEnabled(): boolean {
  return enabled;
}
