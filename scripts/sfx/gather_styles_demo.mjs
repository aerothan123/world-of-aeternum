// A side-by-side listening comparison of the gathering strike style directions
// (gather_strike_prompts.mjs GATHER_STRIKE_STYLES), rendered through the same
// mix and reverb chain the game runs (gather_demo_render.mjs). Five sections,
// separated only by short silences, each the same pattern: three close pick
// strikes, three close axe strikes, two distant pick strikes, two distant axe
// strikes.
//   1  the shipped takes          the current reverb ('open')
//   2  A heavy                    the current reverb
//   3  B ringing                  the current reverb
//   4  C crunchy                  the current reverb
//   5  B ringing                  "big valley": a longer, louder tail with clear
//                                 slap echoes off distant terrain (250 to 400 ms)
// "Big valley" is an audition profile only; the runtime is unchanged.
//
//   node scripts/sfx/gather_strike_sfx.mjs styles-build   (renders the style takes)
//   node scripts/sfx/gather_styles_demo.mjs [--out <dir>]
//
// Writes gather_styles_demo.wav/.mp3 and gather_styles_demo_cues.txt.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, loadCores, mixScene, ROOT, SR, writeDemo } from './gather_demo_render.mjs';
import { GATHER_STRIKE_STYLES, STYLE_KEEP } from './gather_strike_prompts.mjs';

const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? process.argv[outArg + 1] : join(ROOT, 'tmp/gather-styles-demo');
const STYLE_DIR = join(ROOT, 'tmp/gather-strike-styles');
const KEYS = { mine: 'impact_gather_pick', chop: 'impact_gather_axe' };

/** The audition "big valley": the open valley's diffuse tail lengthened and the
 *  terrain slaps moved out to 250 to 400 ms and up, so each strike answers back. */
export const BIG_VALLEY = {
  predelay: 0.03,
  decay: 3,
  brightHz: 6400,
  darkHz: 1600,
  echoes: [
    { at: 0.26, gain: 1, pan: -0.5 },
    { at: 0.34, gain: 0.85, pan: 0.55 },
    { at: 0.4, gain: 0.6, pan: -0.15 },
    { at: 0.62, gain: 0.42, pan: 0.35 },
    { at: 0.95, gain: 0.26, pan: -0.3 },
  ],
  echoShare: 0.6,
  send: 0.95,
  seed: 0xb16a11e,
};

const core = await loadCores();
const shipped = (key) =>
  Array.from({ length: 4 }, (_, i) => decode(join(ROOT, `public/audio/sfx/${key}_${i + 1}.mp3`)));
const style = (name, key) =>
  Array.from({ length: STYLE_KEEP }, (_, i) =>
    decode(join(STYLE_DIR, name, `${key}_${i + 1}.mp3`)),
  );

const sections = [
  {
    title: 'Current shipped set, current reverb',
    pools: { mine: shipped(KEYS.mine), chop: shipped(KEYS.chop) },
    bus: 'current',
  },
  {
    title: `A ${GATHER_STRIKE_STYLES.heavy.label}, current reverb`,
    style: 'heavy',
    bus: 'current',
  },
  {
    title: `B ${GATHER_STRIKE_STYLES.ringing.label}, current reverb`,
    style: 'ringing',
    bus: 'current',
  },
  {
    title: `C ${GATHER_STRIKE_STYLES.crunchy.label}, current reverb`,
    style: 'crunchy',
    bus: 'current',
  },
  {
    title: `B ringing through the "big valley" reverb (audition only)`,
    style: 'ringing',
    bus: 'valley',
  },
];

// one section: 3 close picks, 3 close axes, 2 distant picks, 2 distant axes
const PATTERN = [
  ...[0, 1, 2].map((k) => ({ dt: k * 1.0, kind: 'mine', distance: 7, azimuth: -25 })),
  ...[0, 1, 2].map((k) => ({ dt: 3.4 + k * 0.95, kind: 'chop', distance: 6, azimuth: 20 })),
  ...[0, 1].map((k) => ({ dt: 6.9 + k * 1.0, kind: 'mine', distance: 58, azimuth: 50 })),
  ...[0, 1].map((k) => ({ dt: 9.2 + k * 0.95, kind: 'chop', distance: 52, azimuth: -55 })),
];
const SECTION_SECONDS = 10.6;
const GAP_SECONDS = 2.2; // silence (and the outgoing tail) between sections
const LEAD = 0.5;

const events = [];
const cues = [];
let t = LEAD;
sections.forEach((section, n) => {
  const pools = section.pools ?? {
    mine: style(section.style, KEYS.mine),
    chop: style(section.style, KEYS.chop),
  };
  cues.push({ n: n + 1, start: t, title: section.title });
  for (const p of PATTERN) {
    events.push({
      time: t + p.dt,
      kind: p.kind,
      distance: p.distance,
      azimuth: p.azimuth,
      bus: section.bus,
      pool: pools[p.kind],
      gainKey: KEYS[p.kind],
    });
  }
  t += SECTION_SECONDS + GAP_SECONDS;
});
const duration = t + 1;

const open = core.REVERB_PROFILES.open;
const reverbs = {
  current: { mixEnv: 'open', ir: core.outdoorImpulseResponse('open', SR) },
  // the mix core sends for 'open'; scale that send up to the valley's own level
  valley: {
    mixEnv: 'open',
    ir: core.outdoorImpulseResponse('open', SR, BIG_VALLEY),
    sendScale: BIG_VALLEY.send / open.send,
  },
};
const { outL, outR } = mixScene(core, events, reverbs, duration);
writeDemo(OUT, [['gather_styles_demo', outL, outR]]);

const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const lines = [
  'Gathering strike styles: listening comparison',
  `Total length ${mmss(duration)}. Sections are separated only by short silences.`,
  'Every section plays: 3 close pick strikes, 3 close axe strikes,',
  'then 2 distant pick strikes (58 yd) and 2 distant axe strikes (52 yd).',
  '',
  ...cues.map((c) => `${mmss(c.start)}  ${c.n}  ${c.title}`),
  '',
];
writeFileSync(join(OUT, 'gather_styles_demo_cues.txt'), lines.join('\n'));
console.log(lines.join('\n'));
