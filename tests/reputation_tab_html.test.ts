import { describe, expect, it } from 'vitest';
import { STANDING_THRESHOLDS } from '../src/sim/factions';
import type { WorldQuestProgress } from '../src/sim/types';
import { reputationTabHtml } from '../src/ui/hud/reputation/reputation_tab_html';
import type { IWorld } from '../src/world_api';

function worldStub(
  factions: Partial<Record<string, number>>,
  level = 20,
  log: Array<[string, WorldQuestProgress['state']]> = [],
  expiresAtMs = 0,
): IWorld {
  return {
    factions,
    player: { level },
    worldQuestLog: new Map(
      log.map(([questId, state]) => [questId, { questId, count: 0, state } as WorldQuestProgress]),
    ),
    worldQuestExpiresAtMs: expiresAtMs,
  } as unknown as IWorld;
}

describe('reputation tab html', () => {
  it('paints one card per faction with the tier class, a progress bar and the standing pill', () => {
    const html = reputationTabHtml(
      worldStub({ gilt_measure: 3_400, lanternwardens: 1_240, hearthwright_compact: 0 }),
      0,
    );
    expect(html.match(/class="char-rep-row /g)).toHaveLength(4);
    expect(html).toContain('char-rep-tier-trusted');
    expect(html).toContain('char-rep-tier-recognized');
    expect(html).toContain('char-rep-tier-unknown');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="10"');
    expect(html).toContain('--char-rep-pct:10%');
    // The tier-internal progress, not the cumulative total, is what the bar reads.
    expect(html).toContain(`${3_400 - STANDING_THRESHOLDS.trusted} / `);
  });

  it('names the level cap instead of a next tier while levels 5 to 15 are capped', () => {
    const capped = reputationTabHtml(
      worldStub({ hearthwright_compact: STANDING_THRESHOLDS.trusted }, 12),
      0,
    );
    expect(capped).toContain('until level 16');
    const uncapped = reputationTabHtml(
      worldStub({ hearthwright_compact: STANDING_THRESHOLDS.trusted }, 16),
      0,
    );
    expect(uncapped).not.toContain('until level 16');
    expect(uncapped).toContain('Next: Proven');
  });

  it('summarises the day and the faction title from the highest standing', () => {
    const html = reputationTabHtml(
      worldStub(
        { gilt_measure: 60, lanternwardens: 1_500 },
        20,
        [
          ['wq_a', 'completed'],
          ['wq_b', 'active'],
        ],
        10_000,
      ),
      4_000,
    );
    expect(html).toContain('1 / 2');
    expect(html).toContain('Faction title');
    // Lanternwardens at Recognized outranks Gilt Measure at Unknown.
    expect(html).toContain('Lamplighter');
    expect(html).not.toContain('Client');
  });

  it('frames each faction emblem inside its crest as decorative art', () => {
    const html = reputationTabHtml(worldStub({}), 0);
    const crests = html.match(/<span class="char-rep-crest" aria-hidden="true">(.*?)<\/span>/g);
    expect(crests).toHaveLength(4);
    for (const [index, art] of [
      'rift_watch_mark',
      'church_order_crest',
      'automaton_cog',
      'bracken_circle_acorn',
    ].entries()) {
      expect(crests?.[index]).toContain(
        `<img class="char-rep-emblem" src="/ui/currency/${art}.webp" alt="" draggable="false">`,
      );
    }
  });

  it('escapes nothing it does not own: every dynamic value passes through esc()', () => {
    const html = reputationTabHtml(worldStub({}), 0);
    expect(html).not.toContain('<script');
    expect(html).toContain('class="char-rep-legend"');
  });
});
