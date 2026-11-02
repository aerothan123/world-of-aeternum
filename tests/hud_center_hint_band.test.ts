// The bottom-centre hint band versus the class resource orb (the Paladin
// devotion medallion). Reported from real play: with a Paladin, the sun orb
// ("0/20" above the action bar) sat across the coach's centred keycap ask
// ("B Open your bags") and the interact affordance line. Both bands are
// percent-anchored at bottom centre, so this is a layout core expressed in
// CSS tokens (src/styles/tokens.css --class-orb-top / --class-orb-size /
// --hud-center-hint-bottom), and this suite evaluates them numerically at
// several viewport heights rather than trusting a glance: the hint's bottom
// edge must clear the orb's top edge, at 1080p, at the reported 633px capture,
// on a short handheld viewport (the 72px orb) and on a tall one.
//
// Pure arithmetic over the sheets, the css_corpus / mobile_window family: no
// DOM, no layout engine. The three tokens are the ONLY numbers the test reads,
// so a future seat change moves the assertion with it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripComments } from './helpers/strip_comments';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const TOKENS = stripComments(readFileSync(`${REPO}src/styles/tokens.css`, 'utf8'));
const HUD = stripComments(readFileSync(`${REPO}src/styles/hud.css`, 'utf8'));

/** The literal a `--name: <value>;` declaration carries in a sheet. */
function token(sheet: string, name: string): string {
  const m = new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*([^;]+);`, 's').exec(sheet);
  if (!m) throw new Error(`token ${name} is not declared`);
  return m[1].replace(/\s+/g, ' ').trim();
}

/** The `--class-orb-size` a `@media (max-height: Npx)` block re-declares on
 *  :root, with its threshold, or null when the sheet has no such block. */
function shortViewportOrb(sheet: string): { maxHeight: number; size: number } | null {
  const m = /@media \(max-height: (\d+)px\) \{\s*:root \{\s*--class-orb-size: (\d+)px;\s*\}/.exec(
    sheet,
  );
  return m ? { maxHeight: Number(m[1]), size: Number(m[2]) } : null;
}

const px = (s: string): number => {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(s);
  if (!m) throw new Error(`not a px length: ${s}`);
  return Number(m[1]);
};
const pct = (s: string): number => {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(s);
  if (!m) throw new Error(`not a percentage: ${s}`);
  return Number(m[1]) / 100;
};

/** The seat as the browser resolves it at a viewport height (CSS px from the
 *  top): the orb's top edge, and the hint band's bottom edge. */
function seatAt(viewportHeight: number, orbSizePx: number) {
  const orbTop = pct(token(TOKENS, '--class-orb-top'));
  const gap = px(token(TOKENS, '--spacing-sm'));
  // The orb is centred on its seat (translate: -50% -50%), so its top edge
  // is half its size above the centre line.
  const orbTopEdge = viewportHeight * orbTop - orbSizePx / 2;
  // --hud-center-hint-bottom: calc(100% - top + size / 2 + gap), a `bottom:`
  // offset, so the hint's bottom edge measured from the top is the viewport
  // height minus it.
  const hintBottomOffset = viewportHeight * (1 - orbTop) + orbSizePx / 2 + gap;
  const hintBottomEdge = viewportHeight - hintBottomOffset;
  return { orbTopEdge, hintBottomEdge };
}

describe('the bottom-centre hint band stands above the class resource orb', () => {
  it('spells the hint seat from the orb tokens, in tokens.css', () => {
    expect(token(TOKENS, '--hud-center-hint-bottom')).toBe(
      'calc( 100% - var(--class-orb-top) + var(--class-orb-size) / 2 + var(--spacing-sm) )',
    );
  });

  it('the orb seat and BOTH hint lines read the tokens, never a literal', () => {
    const orb = /\.paladin-devotion-frame \{([^}]*)\}/.exec(HUD)?.[1] ?? '';
    expect(orb).toMatch(/top: var\(--class-orb-top\);/);
    expect(orb).toMatch(/width: var\(--class-orb-size\);/);
    expect(orb).toMatch(/height: var\(--class-orb-size\);/);
    const ask = /\.tut-prompt\.tut-prompt-center \{([^}]*)\}/.exec(HUD)?.[1] ?? '';
    expect(ask).toMatch(/bottom: var\(--hud-center-hint-bottom\);/);
    const affordance = /#interact-affordance \{([^}]*)\}/.exec(HUD)?.[1] ?? '';
    expect(affordance).toMatch(/bottom: var\(--hud-center-hint-bottom\);/);
  });

  const stockOrb = px(token(TOKENS, '--class-orb-size'));
  const short = shortViewportOrb(HUD);

  it('the short-viewport orb step-down re-declares the shared token, so the hint follows it', () => {
    expect(short).not.toBeNull();
    expect(short!.size).toBeLessThan(stockOrb);
  });

  it.each([
    ['1920x1080', 1080],
    ['2560x1080 (21:9)', 1080],
    ['1517x633 (the reported 2.4:1 capture)', 633],
    ['1366x768', 768],
    ['2560x1440', 1440],
    ['the 820px short-viewport threshold itself', 820],
  ])('leaves a visible gap between the hint and the orb at %s', (_label, height) => {
    const orbSize = short && height <= short.maxHeight ? short.size : stockOrb;
    const { orbTopEdge, hintBottomEdge } = seatAt(height, orbSize);
    // The hint's bottom edge sits strictly above the orb's top edge, by the
    // spacing token at least.
    expect(hintBottomEdge).toBeLessThanOrEqual(orbTopEdge - px(token(TOKENS, '--spacing-sm')));
    // And it has not been pushed off the top half of the screen: it is still
    // a bottom-centre hint, beneath the crosshair.
    expect(hintBottomEdge).toBeGreaterThan(height * 0.5);
  });

  it('the old literal seats overlapped the orb, which is what this guards', () => {
    // bottom: 26% (the coach ask) and bottom: 30% (the affordance) at 1080p.
    const { orbTopEdge } = seatAt(1080, stockOrb);
    const oldAskBottomEdge = 1080 - 1080 * 0.26;
    const oldAffordanceBottomEdge = 1080 - 1080 * 0.3;
    expect(oldAskBottomEdge).toBeGreaterThan(orbTopEdge);
    expect(oldAffordanceBottomEdge).toBeGreaterThan(orbTopEdge);
  });
});
