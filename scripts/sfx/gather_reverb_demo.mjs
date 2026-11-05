// Offline listening demo of the shipped gathering strikes through the same mix
// and reverb chain the game runs (gather_demo_render.mjs). Renders about 22 s:
//   0 to 5 s    a miner beside you, among cliffs
//   5 to 10 s   a miner across the canyon (58 yd): mostly echo
//   10 to 15 s  a woodcutter beside you, in an open valley
//   15 to 22 s  a woodcutter across the valley (52 yd), and his tree going over
//
//   node scripts/sfx/gather_reverb_demo.mjs [--out <dir>]
//
// Writes gather_reverb_demo.wav/.mp3 and a dry-only twin (the same mix with the
// send muted) for an A/B of what the reverb adds. Reads the shipped takes from
// public/audio/sfx (run scripts/sfx/gather_strike_sfx.mjs first).
import { join } from 'node:path';
import { decode, loadCores, mixScene, ROOT, SR, writeDemo } from './gather_demo_render.mjs';
import { GATHER_STRIKE_PROMPTS } from './gather_strike_prompts.mjs';

const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? process.argv[outArg + 1] : join(ROOT, 'tmp/gather-reverb-demo');

const core = await loadCores();
const takes = {};
for (const { key, keep } of GATHER_STRIKE_PROMPTS) {
  takes[key] = Array.from({ length: keep }, (_, i) =>
    decode(join(ROOT, `public/audio/sfx/${key}_${i + 1}.mp3`)),
  );
}
const at = (time, kind, distance, azimuth, bus) => {
  const gainKey = core.GATHER_STRIKE_SFX[kind];
  return { time, kind, distance, azimuth, bus, pool: takes[gainKey], gainKey };
};

const events = [];
for (let k = 0; k < 4; k++) events.push(at(0.4 + k * 1.15, 'mine', 7, -25, 'cliffs'));
for (let k = 0; k < 4; k++) events.push(at(5.4 + k * 1.15, 'mine', 58, 50, 'cliffs'));
for (let k = 0; k < 4; k++) events.push(at(10.6 + k * 1.0, 'chop', 6, 20, 'open'));
for (let k = 0; k < 3; k++) events.push(at(15.2 + k * 1.0, 'chop', 52, -55, 'open'));
events.push(at(17.9, 'tree_creak', 52, -50, 'open'));
events.push(at(17.9 + 1.5, 'tree_crash', 50, -45, 'open')); // tree_felling_core TREE_FALL_SECONDS

const reverbs = {
  open: { mixEnv: 'open', ir: core.outdoorImpulseResponse('open', SR) },
  cliffs: { mixEnv: 'cliffs', ir: core.outdoorImpulseResponse('cliffs', SR) },
};
const { outL, outR, dryL, dryR } = mixScene(core, events, reverbs, 22.5);
writeDemo(OUT, [
  ['gather_reverb_demo', outL, outR],
  ['gather_reverb_demo_dry', dryL, dryR],
]);
