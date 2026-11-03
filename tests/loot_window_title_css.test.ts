import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression pin for the loot popup title that collapsed to one glyph ("W." for
// a Wild Boar). The popup was a hard `width: 230px` whose title is the head's
// only flex child allowed to shrink to nothing (`.ui-win-title`, library.css:
// `min-width: 0`, `nowrap`, `ellipsis`), so any shortfall in the popup's width
// came straight out of the corpse's name. The fix lets the popup size to its
// content (led by the title) between a floor and a title ceiling, reserves the
// pinned close button's footprint on desktop, and keeps the prose sections from
// driving the width. The real layout is measured in a browser; this pins the
// declarations that produce it, read from the shipped sheet.

const COMPONENTS = fileURLToPath(new URL('../src/styles/components.css', import.meta.url));
const LIBRARY = fileURLToPath(new URL('../src/styles/library.css', import.meta.url));

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declaration block(s) of every rule whose selector list contains `selector`
 *  exactly (one selector of a comma list), concatenated. */
function declarationsFor(css: string, selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop.
  while ((m = re.exec(css)) !== null) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector)) out.push(m[2]);
  }
  return out.join(';');
}

function prop(decls: string, name: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'g');
  let last: string | null = null;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop.
  while ((m = re.exec(decls)) !== null) last = m[1].trim();
  return last;
}

describe('loot window title sizing', () => {
  const css = stripComments(readFileSync(COMPONENTS, 'utf8'));

  it('sizes the popup to its content above a floor, never a fixed width', () => {
    const win = declarationsFor(css, '#loot-window');
    expect(prop(win, 'width')).toBe('max-content');
    expect(prop(win, 'min-width')).toBe('230px');
  });

  it('caps only the title, so a long name ellipsizes past the ceiling and not before', () => {
    const title = declarationsFor(css, '#loot-window > .panel-title > .ui-win-title');
    expect(prop(title, 'max-width')).toBe('320px');
    // The ellipsis itself stays the shared primitive's (library.css), which is
    // what makes "past the ceiling" an ellipsis rather than an overflow.
    const library = stripComments(readFileSync(LIBRARY, 'utf8'));
    const primitive = declarationsFor(library, '.ui-win-title');
    expect(prop(primitive, 'text-overflow')).toBe('ellipsis');
    expect(prop(primitive, 'white-space')).toBe('nowrap');
  });

  it('reserves the pinned close button on desktop so a long name never runs under it', () => {
    const head = declarationsFor(css, '#loot-window > .panel-title');
    // inset-inline-end 8px + the 26px .ui-x-btn + a 6px gap.
    expect(prop(head, 'padding-inline-end')).toBe('40px');
  });

  it('keeps the harvest prose and the footer hint from setting the popup width', () => {
    expect(prop(declarationsFor(css, '#loot-window > .corpse-harvest'), 'contain')).toBe(
      'inline-size',
    );
    expect(prop(declarationsFor(css, '#loot-window > .town-focus-hint'), 'contain')).toBe(
      'inline-size',
    );
  });
});
