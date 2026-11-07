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
import { shouldMirrorErrorToast } from '../../src/ui/error_toast_log';
import {
  CHAT_TAB_CHANNELS,
  chatChannelColor,
  composeChatLine,
  composeWhisperReply,
  sentLineTargetForHost,
  WHISPER_TAB,
} from '../../src/ui/hud/chat/chat_channels';
import { CHAT_BOX_LIMITS, placeChatBox } from '../../src/ui/hud/chat/chat_window';
import { maskProfanity } from '../../src/ui/profanity';
import { keybindConflicts, keybindRegistry } from './settings_parity';

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

/**
 * The chat input rules (W5): the line a channel tab or the whisper tab sends for what was typed,
 * and the sticky target the sent line leaves (online and offline host).
 */
function chatCompose(): ParitySuite {
  const typed = [
    '',
    '   ',
    'hello',
    '  padded  ',
    '/w Bob hi',
    '/r thanks',
    '/reply ok',
    '!lfg need tank',
    '/p pull now',
    '/party ready',
    '/bg go',
    '/y HEY',
    '/yell hey',
    '/s hi',
    '/say hi',
    '/g guild line',
    '/gu guild line',
    '/guild line',
    '/o officers',
    '/officer note',
    '/general hi',
    '/1 hi',
    '/world hi',
    '/lfg anyone',
    '/me waves',
    '/roll',
    '/join world',
    '/P caps party',
    '/pvp',
    '/invite Bob',
  ];
  const cases: ParityCase[] = [];
  for (const text of typed) {
    for (const tab of CHAT_TAB_CHANNELS) {
      cases.push({ in: { kind: 'compose', tab, text }, out: { line: composeChatLine(tab, text) } });
    }
    cases.push({
      in: { kind: 'compose', tab: WHISPER_TAB, text },
      out: { line: composeWhisperReply(text) },
    });
    for (const online of [true, false]) {
      cases.push({
        in: { kind: 'sticky', online, text },
        out: { target: sentLineTargetForHost(text, { online }) ?? '' },
      });
    }
  }
  return {
    suite: 'chat_compose',
    source:
      'src/ui/hud/chat/chat_channels.ts composeChatLine, composeWhisperReply, sentLineTargetForHost',
    note: "kind compose: line sent from tab; kind sticky: target ('' is null) after sending text",
    cases,
  };
}

/**
 * The chat log's error mirror (W5): hud.ts showLocalizedError logs an error toast into the
 * system channel only when shouldMirrorErrorToast says so, then remembers it as the last
 * mirrored text. Each case replays one stream of error toasts and records which were logged.
 */
function chatErrorMirror(): ParitySuite {
  const streams: string[][] = [
    [],
    ['Invalid attack target.'],
    ['Invalid attack target.', 'Invalid attack target.', 'Invalid attack target.'],
    ['Out of range.', 'Line of sight.', 'Out of range.'],
    ['Out of range.', 'Out of range.', 'Not enough mana.', 'Not enough mana.', 'Out of range.'],
    ['', '   ', 'Out of range.', '', 'Out of range.'],
    ['\n\t', 'A', 'a', 'A', 'A '],
    ['Invalid attack target.', 'Invalid attack target.', 'You are dead.', 'Invalid attack target.'],
  ];
  const cases: ParityCase[] = [];
  for (const stream of streams) {
    let last: string | undefined;
    const logged: boolean[] = [];
    for (const text of stream) {
      const ok = shouldMirrorErrorToast(text, last);
      if (ok) last = text;
      logged.push(ok);
    }
    cases.push({ in: { texts: JSON.stringify(stream) }, out: { logged } });
  }
  return {
    suite: 'chat_error_mirror',
    source:
      'src/ui/error_toast_log.ts shouldMirrorErrorToast (as hud.ts showLocalizedError drives it)',
    note: 'texts is a JSON array of consecutive error toasts; logged[i] says whether line i reached the log',
    cases,
  };
}

/** The per-channel chat line colour (lowercase #rrggbb), including the say fallback. */
function chatChannelColors(): ParitySuite {
  const channels = [
    'say',
    'yell',
    'party',
    'battleground',
    'raidWarning',
    'general',
    'world',
    'lfg',
    'guild',
    'officer',
    'whisper',
    'emote',
    'roll',
    'system',
    'unknown',
    '',
  ];
  return {
    suite: 'chat_channel_color',
    source: 'src/ui/hud/chat/chat_channels.ts chatChannelColor',
    note: 'unknown channels fall back to say',
    cases: channels.map((channel) => ({
      in: { channel },
      out: { color: chatChannelColor(channel) },
    })),
  };
}

/** The movable, resizable chat box clamp (placeChatBox at scale 1, the default limits). */
function chatBoxPlace(): ParitySuite {
  const geos = [
    { left: 12, top: 600, width: 370, height: 184 },
    { left: -50, top: -50, width: 100, height: 20 },
    { left: 5000, top: 5000, width: 2000, height: 2000 },
    { left: 300, top: 200, width: 760, height: 600 },
    { left: 8, top: 8, width: 240, height: 96 },
    { left: 900, top: 100, width: 500, height: 300 },
  ];
  const viewports = [
    { w: 1920, h: 1080 },
    { w: 1280, h: 720 },
    { w: 400, h: 300 },
  ];
  const chromes = [0, 24, 52];
  const cases: ParityCase[] = [];
  for (const g of geos) {
    for (const v of viewports) {
      for (const chromeH of chromes) {
        const { geo } = placeChatBox(g, v, chromeH, 1, CHAT_BOX_LIMITS, 0);
        cases.push({
          in: { ...g, vw: v.w, vh: v.h, chromeH },
          out: { left: geo.left, top: geo.top, width: geo.width, height: geo.height },
        });
      }
    }
  }
  return {
    suite: 'chat_box_place',
    source: 'src/ui/hud/chat/chat_window.ts placeChatBox, CHAT_BOX_LIMITS',
    note: 'visual space (scale 1), no reserved area above',
    cases,
  };
}

export const PARITY_SUITES: Record<string, () => ParitySuite> = {
  xp_mob_value: xpMobValue,
  chat_profanity_mask: chatProfanityMask,
  chat_compose: chatCompose,
  chat_error_mirror: chatErrorMirror,
  chat_channel_color: chatChannelColors,
  chat_box_place: chatBoxPlace,
  keybind_registry: keybindRegistry,
  keybind_conflicts: keybindConflicts,
};

export function buildParitySuite(name: string): ParitySuite {
  const build = PARITY_SUITES[name];
  if (!build) throw new Error(`unknown parity suite ${name}`);
  return build();
}
