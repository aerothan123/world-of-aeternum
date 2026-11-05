// Whether this session runs the stylized character review (`?stylizedchars=1`), and the
// review's own picks (`stylizedkit=plate|leather|mixed|bare`, `stylizedface=default|b|c`,
// `stylizedhair=h1|h2|h3|none`, `stylizedhelm=on|off`, `stylizedrig=wyn`), read ONCE at module load. Dev builds
// only: a production bundle constant-folds `import.meta.env.DEV` to false, so none of it can
// be reached there, and a host without a location (Node, the headless env, every test) always
// runs stock.
// The rules these gate are stylized_char_test_core.ts and stylized_kit_core.ts.
import { stylizedCharsRequested } from './stylized_char_test_core';

function readSearch(): string | null {
  if (!import.meta.env?.DEV) return null;
  if (typeof location === 'undefined') return null;
  return location.search;
}

const search = readSearch();
const enabled = search !== null && stylizedCharsRequested(search);
const params = enabled && search !== null ? new URLSearchParams(search) : null;

/** True when this dev session opted into the stylized character review. */
export function stylizedCharsEnabled(): boolean {
  return enabled;
}

/** A review pick (`stylizedkit`, `stylizedface`, `stylizedhair`, `stylizedhelm`), or null. */
export function stylizedReviewParam(name: 'kit' | 'face' | 'hair' | 'helm' | 'rig'): string | null {
  return params?.get(`stylized${name}`) ?? null;
}
