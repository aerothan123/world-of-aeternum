// A short listening comparison for the rock pick pass (gather_strike_sfx.mjs
// rock-select), through the same mix and the current reverb the game runs
// (gather_demo_render.mjs). Sections separated only by short silences, each
// three close pick strikes and two distant ones (58 yd):
//   1  the punchy-ring pick (the styles demo's section 4), for reference
//   2  the new rock takes
//   3  the layered rock pick (the punchiest attack over a stone-crack body)
// then the heavy axe once, close, at the end.
//
//   node scripts/sfx/gather_strike_sfx.mjs rock-select   (renders the rock takes)
//   node scripts/sfx/gather_rock_demo.mjs [--out <dir>]
//
// Writes gather_rock_demo.wav/.mp3 and gather_rock_demo_cues.txt.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, loadCores, mixScene, ROOT, SR, writeDemo } from './gather_demo_render.mjs';

const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? process.argv[outArg + 1] : join(ROOT, 'tmp/gather-rock-demo');
const STYLE_DIR = join(ROOT, 'tmp/gather-strike-styles');
const PICK = 'impact_gather_pick';
const AXE = 'impact_gather_axe';

const takesIn = (dir, key) =>
  readdirSync(join(STYLE_DIR, dir))
    .filter((f) => f.startsWith(`${key}_`) && f.endsWith('.mp3'))
    .sort()
    .map((f) => decode(join(STYLE_DIR, dir, f)));

// Each take is peak-normalized by the conform, so a noisy stone crack reads
// quieter than a peaky ring. Level-match every take to the same RMS over its
// first 150 ms, so the sections compare character, not loudness.
const headRms = (x) => {
  const n = Math.min(x.length, Math.round(0.15 * SR));
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i] * x[i];
  return Math.sqrt(s / n);
};
const REF_RMS = 0.12;
const levelled = (pool) => pool.map((x) => x.map((v) => (v * REF_RMS) / (headRms(x) || 1)));

const core = await loadCores();
const sections = [
  {
    title: 'Reference: the punchy-ring pick (styles demo section 4)',
    pool: levelled(takesIn('punchy', PICK)),
  },
  {
    title: 'New rock pick takes (stone crack, short gritty resonance, no ring)',
    pool: levelled(takesIn('rockpick', PICK)),
  },
  {
    title: 'New LAYERED rock pick (punchiest attack over a stone-crack body, shaped)',
    pool: levelled(takesIn('rocklayered', PICK)),
  },
];
const PATTERN = [
  ...[0, 1, 2].map((k) => ({ dt: k * 1.0, distance: 7, azimuth: -25 })),
  ...[0, 1].map((k) => ({ dt: 3.4 + k * 1.0, distance: 58, azimuth: 50 })),
];
const SECTION_SECONDS = 5.0;
const GAP_SECONDS = 2.2;

const events = [];
const cues = [];
let t = 0.5;
sections.forEach((section, n) => {
  cues.push({ n: n + 1, start: t, title: section.title });
  for (const p of PATTERN) {
    events.push({
      time: t + p.dt,
      kind: 'mine',
      distance: p.distance,
      azimuth: p.azimuth,
      bus: 'current',
      pool: section.pool,
      gainKey: PICK,
    });
  }
  t += SECTION_SECONDS + GAP_SECONDS;
});
cues.push({ n: 4, start: t, title: 'The heavy axe once, close, for scale' });
events.push({
  time: t,
  kind: 'chop',
  distance: 6,
  azimuth: 20,
  bus: 'current',
  pool: takesIn('heavy', AXE).slice(0, 1),
  gainKey: AXE,
});
const duration = t + 3;

const reverbs = { current: { mixEnv: 'open', ir: core.outdoorImpulseResponse('open', SR) } };
const { outL, outR } = mixScene(core, events, reverbs, duration);
writeDemo(OUT, [['gather_rock_demo', outL, outR]]);

const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const lines = [
  'Gathering rock pick pass: listening comparison',
  `Total length ${mmss(duration)}. Sections are separated only by short silences; current reverb throughout.`,
  'Sections 1 to 3 each play 3 close pick strikes, then 2 distant pick strikes (58 yd).',
  'Every pick take is level-matched (same loudness over its first 150 ms), so compare character.',
  '',
  ...cues.map((c) => `${mmss(c.start)}  ${c.n}  ${c.title}`),
  '',
];
writeFileSync(join(OUT, 'gather_rock_demo_cues.txt'), lines.join('\n'));
console.log(lines.join('\n'));
