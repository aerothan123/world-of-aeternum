// Parity case suites for the native client's C++ ports (ea-plan.md decision D1: C++ ports pinned
// by TS-exported vectors). Each suite runs the authoritative TS rule over a fixed input grid and
// records what it answered; the Unreal automation test `Wyndlewood.<Domain>.Parity.<Suite>`
// replays the same inputs through its port and must reproduce every case.
// File shape (one JSON per suite, Data/Parity/<suite>.json in the Unreal repo):
//   { suite, source, note, cases: [{ in: {...}, out: ... }] }
// To add a suite: write a builder here, register it in PARITY_SUITES, run
// `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_parity_export.test.ts`, copy the file with
// the Unreal repo's tools/sync_ts_exports.ps1, then write the C++ test against it.

import { MAX_LEVEL, mobXpValue, zeroDiff } from '../../src/sim/types';
import { maskProfanity } from '../../src/ui/profanity';

export const PARITY_EXPORT_SUBDIR = 'parity';

export interface ParityCase {
  in: Record<string, number | string | boolean>;
  out: unknown;
}

export interface ParitySuite {
  suite: string;
  source: string;
  note: string;
  cases: ParityCase[];
}

/** Kill XP per mob level and player level (classic-era base, level-difference scale, gray). */
function xpMobValue(): ParitySuite {
  const cases: ParityCase[] = [];
  for (let player = 1; player <= MAX_LEVEL; player++) {
    for (let mob = 1; mob <= MAX_LEVEL + 5; mob++) {
      cases.push({
        in: { mobLevel: mob, playerLevel: player },
        out: { xp: mobXpValue(mob, player), zeroDiff: zeroDiff(player) },
      });
    }
  }
  return {
    suite: 'xp_mob_value',
    source: 'src/sim/types.ts mobXpValue, zeroDiff',
    note: 'JS Math.round semantics: halves round toward +infinity',
    cases,
  };
}

/**
 * The chat log's soft-word mask (W5). Terms ride the case as one comma-joined string (the server
 * ships them normalized: lower-case a to z only, so a comma never occurs inside one).
 */
function chatProfanityMask(): ParitySuite {
  const termSets = ['', 'darn', 'darn,heck', 'heck,crud,dang', 'ab'];
  const texts = [
    '',
    'hello there',
    'darn it',
    'DARN it all',
    'd4rn and h3ck',
    'd@rn d$rn',
    'what the heck!',
    'heck!heck',
    'Heckler and darnedest',
    'c|ud cr+d cr_ud',
    'well...darn,heck;crud',
    '1337 h4x0r 5p34k',
    'dang_it @dang $dang$',
    'no bad words here, friend',
    'tabs\tand\nnewlines darn',
    'unicode café darn über heck',
    'emoji free zone d a r n',
    'ab abc cab a_b a-b',
    '!!! ||| +++ @@@ $$$',
    '___ 000 dArN___',
  ];
  const cases: ParityCase[] = [];
  for (const terms of termSets) {
    const list = terms === '' ? [] : terms.split(',');
    for (const text of texts) {
      cases.push({ in: { text, terms }, out: { masked: maskProfanity(text, list) } });
    }
  }
  return {
    suite: 'chat_profanity_mask',
    source: 'src/ui/profanity.ts maskProfanity',
    note: 'terms is comma-joined; the mask keeps UTF-16 token length (tokens are ASCII only)',
    cases,
  };
}

export const PARITY_SUITES: Record<string, () => ParitySuite> = {
  xp_mob_value: xpMobValue,
  chat_profanity_mask: chatProfanityMask,
};

export function buildParitySuite(name: string): ParitySuite {
  const build = PARITY_SUITES[name];
  if (!build) throw new Error(`unknown parity suite ${name}`);
  return build();
}
