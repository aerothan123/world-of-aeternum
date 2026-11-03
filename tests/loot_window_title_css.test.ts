import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression pin for the loot popup title that collapsed to one glyph ("W." for
// a Wild Boar). The popup was a hard `width: 230px` whose title is the head's
// only flex child allowed to shrink to nothing (`.ui-win-title`, library.css:
// `min-width: 0`, `nowrap`, `ellipsis`), so any shortfall in the popup's width
// came straight out of the corpse's name. The fix lets the popup size to its
// content (led by the title) between a floor and a title ceiling, seats the
// close button as an in-flow head item (never the shell's absolute pin), and
// keeps the prose sections from driving the width. The real layout is measured in a browser; this pins the
// declarations that produce it, read from the shipped sheet.

const COMPONENTS = fileURLToPath(new URL('../src/styles/components.css', import.meta.url));
const LIBRARY = fileURLToPath(new URL('../src/styles/library.css', import.meta.url));
const LAYOUT = fileURLToPath(new URL('../src/styles/layout.css', import.meta.url));
const MOBILE = fileURLToPath(new URL('../src/styles/hud.mobile.css', import.meta.url));

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

  // The "Sableweb L[X]ker" regression: the close X was the shell's ABSOLUTE pin
  // (layout.css `.window > .panel-title > .x-btn`), out of the head's flex flow
  // and out of the popup's max-content width, so the only guard between the name
  // and the button was a padding reserve hand-matched to one button footprint.
  // The fix makes the button an in-flow, non-shrinking flex item at the end of
  // the head row: name and button can never share pixels, the popup widens to
  // fit both, and a shortfall comes out of the name as an ellipsis.
  it('lays the head out as a flex row with the close button as a non-overlapping item', () => {
    const x = declarationsFor(css, '#loot-window > .panel-title > .x-btn');
    expect(prop(x, 'position')).toBe('static');
    expect(prop(x, 'transform')).toBe('none');
    expect(prop(x, 'flex')).toBe('none');
    expect(prop(x, 'margin-inline-start')).toBe('auto');
    // The shell head the button sits in is a flex row (layout.css + library.css).
    const layout = stripComments(readFileSync(LAYOUT, 'utf8'));
    expect(prop(declarationsFor(layout, '.window > .panel-title'), 'display')).toBe('flex');
    const library = stripComments(readFileSync(LIBRARY, 'utf8'));
    expect(prop(declarationsFor(library, '.ui-win-head'), 'display')).toBe('flex');
    // The title is the row's only shrinkable item, so it gives way first.
    const primitive = declarationsFor(library, '.ui-win-title');
    expect(prop(primitive, 'min-width')).toBe('0');
    expect(prop(primitive, 'overflow')).toBe('hidden');
  });

  it('keeps the end inset at the shell pin position on both layouts, never a reserve', () => {
    // 8px matches the shell's `inset-inline-end: 8px`, so the X sits where it
    // always did; the old reserves (40px desktop, 52px touch) existed only for
    // the absolute pin and would now double the button's room.
    expect(prop(declarationsFor(css, '#loot-window > .panel-title'), 'padding-inline-end')).toBe(
      '8px',
    );
    const mobile = stripComments(readFileSync(MOBILE, 'utf8'));
    expect(
      prop(
        declarationsFor(mobile, 'body.mobile-touch #loot-window > .panel-title'),
        'padding-inline-end',
      ),
    ).toBe('8px');
  });

  it('never lets a later rule re-pin the loot close button out of flow', () => {
    for (const file of [COMPONENTS, MOBILE, LAYOUT]) {
      const sheet = stripComments(readFileSync(file, 'utf8'));
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop.
      while ((m = re.exec(sheet)) !== null) {
        const sel = m[1];
        if (!/#loot-window/.test(sel) || !/x-btn/.test(sel)) continue;
        const pos = prop(m[2], 'position');
        if (pos !== null) expect(pos, sel.trim()).toBe('static');
      }
    }
  });

  // Box arithmetic over the shipped values: for a range of name widths, the
  // title's right edge (start padding + min(name, ceiling, room)) never passes
  // the button's left edge inside a popup sized by the same rules.
  it('the title box ends before the close button for every name length', () => {
    const library = stripComments(readFileSync(LIBRARY, 'utf8'));
    const gap = Number.parseFloat(prop(declarationsFor(library, '.ui-win-head'), 'gap') ?? '0');
    const xWidth = Number.parseFloat(prop(declarationsFor(library, '.ui-x-btn'), 'width') ?? '0');
    const end = Number.parseFloat(
      prop(declarationsFor(css, '#loot-window > .panel-title'), 'padding-inline-end') ?? '0',
    );
    const ceiling = Number.parseFloat(
      prop(declarationsFor(css, '#loot-window > .panel-title > .ui-win-title'), 'max-width') ?? '0',
    );
    const floor = Number.parseFloat(prop(declarationsFor(css, '#loot-window'), 'min-width') ?? '0');
    const start = 12; // the shell --window-pad
    expect(gap).toBeGreaterThan(0);
    expect(xWidth).toBeGreaterThan(0);
    for (const viewportCap of [Number.POSITIVE_INFINITY, 300, 240]) {
      for (let name = 10; name <= 500; name += 7) {
        const content = start + Math.min(name, ceiling) + gap + xWidth + end;
        const head = Math.min(Math.max(content, floor), viewportCap);
        const room = head - start - end - gap - xWidth;
        const titleRight = start + Math.min(name, ceiling, Math.max(0, room));
        const buttonLeft = head - end - xWidth;
        expect(titleRight, `name ${name}px, cap ${viewportCap}`).toBeLessThanOrEqual(
          buttonLeft - gap,
        );
      }
    }
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
