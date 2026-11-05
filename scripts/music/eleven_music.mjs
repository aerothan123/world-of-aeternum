// The Wyndlewood soundtrack pipeline: ElevenLabs Music generation (paid), the
// free and reproducible build of the shipped cues, the generated runtime table,
// and the provenance ledger. The plan (prompts, lyrics, lengths, tiers) is
// scripts/music/wyndle_music_plan.mjs.
//
//   ELEVENLABS_API_KEY=... node scripts/music/eleven_music.mjs usage
//       prints the account's plan tier and used / limit credits (never the key)
//   node scripts/music/eleven_music.mjs estimate [--rate <credits per minute>]
//       free: requested minutes per tier and the credit cost at a measured rate
//   ELEVENLABS_API_KEY=... node scripts/music/eleven_music.mjs generate
//         [--only <key,key>] [--tier <n>] [--budget <credits>]
//       paid: one take per cue into tmp/music-takes/<key>.mp3, cheapest tier first;
//       existing takes are kept, so a rerun only fills the gaps. Each take's measured
//       credit cost, date, model and plan tier land in scripts/music/provenance.json.
//   node scripts/music/eleven_music.mjs build [--only <key,key>]
//       free: every take to public/audio/music/wyn/<key>.mp3 (loudness matched to the
//       existing remasters, 44.1 kHz stereo 128 kbps, edge fades), then regenerates
//       src/game/music_score_tracks.generated.ts and docs/audio/elevenlabs_provenance.md
//
// The raw takes are NOT committed (they are 20 to 40 MB of source per hour);
// keep tmp/music-takes/ to rebuild. Every take is generated with the
// instrumental guard (or a composition plan for the sung cues) and an IP-clean
// prompt: instrumentation, mood, tempo, mode and form only.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FFMPEG_PATH, FFPROBE_PATH } from '../sfx/ffmpeg_paths.mjs';
import { GLOBAL_STYLE, MUSIC_PLAN, toCompositionPlan } from './wyndle_music_plan.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TAKES = join(ROOT, 'tmp/music-takes');
const OUT_DIR = join(ROOT, 'public/audio/music/wyn');
const LEDGER = join(ROOT, 'scripts/music/provenance.json');
const GENERATED = join(ROOT, 'src/game/music_score_tracks.generated.ts');
const PROVENANCE_DOC = join(ROOT, 'docs/audio/elevenlabs_provenance.md');
const API = 'https://api.elevenlabs.io';
const MODEL = process.env.WYN_MUSIC_MODEL || 'music_v2';
/** Integrated loudness of the shipped cues (LUFS). Matches the existing zone
 *  remasters (measured with `measure`), so the new score sits in the same mix. */
const TARGET_LUFS = -15.5;
const STINGER_LUFS = -15;
const TRUE_PEAK = -1.5;

const mode = process.argv[2] ?? 'estimate';
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const onlyArg = arg('--only');
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const maxTier = Number(arg('--tier') ?? 3);
const budget = arg('--budget') ? Number(arg('--budget')) : Number.POSITIVE_INFINITY;
const cues = MUSIC_PLAN.filter((t) => (!only || only.has(t.key)) && t.tier <= maxTier).sort(
  (a, b) => a.tier - b.tier,
);

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return key;
}

async function subscription() {
  const res = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': apiKey() } });
  if (!res.ok) return null;
  return res.json();
}

function describe(s) {
  if (!s) return 'usage: unavailable';
  const left = s.character_limit - s.character_count;
  return `usage: ${s.character_count} / ${s.character_limit} credits used, ${left} left (tier ${s.tier}, status ${s.status ?? '?'}, resets ${s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) : '?'})`;
}

function requestBody(cue) {
  if (cue.plan) return { composition_plan: toCompositionPlan(cue.plan), model_id: MODEL };
  return {
    prompt: `${cue.prompt} ${GLOBAL_STYLE}`,
    music_length_ms: cue.seconds * 1000,
    force_instrumental: true,
    model_id: MODEL,
  };
}

async function composeOne(cue) {
  const body = JSON.stringify(requestBody(cue));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/v1/music?output_format=mp3_44100_192`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
      body,
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${cue.key} -> ${res.status} ${detail.slice(0, 300)}`);
  }
}

function readLedger() {
  return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { takes: {} };
}

function writeLedger(ledger) {
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
}

async function generate() {
  mkdirSync(TAKES, { recursive: true });
  const ledger = readLedger();
  let before = await subscription();
  console.log(describe(before));
  let spent = 0;
  for (const cue of cues) {
    const file = join(TAKES, `${cue.key}.mp3`);
    if (existsSync(file)) continue;
    if (spent >= budget) {
      console.log(`budget reached (${spent} credits); stopping before ${cue.key}`);
      break;
    }
    process.stdout.write(`compose ${cue.key} (${cue.seconds}s, tier ${cue.tier})... `);
    let audio;
    try {
      audio = await composeOne(cue);
    } catch (e) {
      console.log(`FAILED ${String(e.message).slice(0, 300)}`);
      continue;
    }
    writeFileSync(file, audio);
    const after = await subscription();
    const cost = before && after ? after.character_count - before.character_count : null;
    if (cost !== null) spent += cost;
    ledger.takes[cue.key] = {
      date: new Date().toISOString().slice(0, 10),
      planTier: after?.tier ?? before?.tier ?? 'unknown',
      model: MODEL,
      requestedSeconds: cue.seconds,
      credits: cost,
      sung: Boolean(cue.plan),
    };
    writeLedger(ledger);
    console.log(`ok (${cost ?? '?'} credits)`);
    before = after ?? before;
  }
  console.log(`spent ${spent} credits this run`);
  console.log(describe(await subscription()));
}

function probeSeconds(file) {
  const out = execFileSync(
    FFPROBE_PATH,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  return Number.parseFloat(out.trim());
}

/** Integrated loudness (LUFS) of a file, from ffmpeg's ebur128 summary. */
function lufsOf(file) {
  const r = spawnSync(
    FFMPEG_PATH,
    ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  const text = String(r.stderr ?? '');
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(summary);
  return m ? Number(m[1]) : null;
}

function sha12(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);
}

function buildOne(cue) {
  const src = join(TAKES, `${cue.key}.mp3`);
  if (!existsSync(src)) return false;
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${cue.key}.mp3`);
  const dur = probeSeconds(src);
  const lufs = cue.group === 'stinger' ? STINGER_LUFS : TARGET_LUFS;
  const fadeOut = cue.group === 'stinger' ? 0.25 : 2.5;
  const af = [
    `loudnorm=I=${lufs}:TP=${TRUE_PEAK}:LRA=14`,
    'afade=t=in:st=0:d=0.04',
    `afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(2)}:d=${fadeOut}`,
  ].join(',');
  execFileSync(
    FFMPEG_PATH,
    [
      '-y', '-v', 'error', '-i', src, '-af', af, '-ar', '44100', '-ac', '2',
      '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', out,
    ],
    { stdio: 'inherit' },
  );
  return true;
}

function writeGenerated() {
  const rows = [];
  for (const cue of MUSIC_PLAN) {
    const file = join(OUT_DIR, `${cue.key}.mp3`);
    if (!existsSync(file)) continue;
    rows.push(
      `  ${cue.key}: { url: '/audio/music/wyn/${cue.key}.mp3?v=${sha12(file)}', seconds: ${probeSeconds(file).toFixed(1)} },`,
    );
  }
  const text = [
    '// GENERATED by scripts/music/eleven_music.mjs build. Do not edit by hand.',
    '// The shipped Wyndlewood score cues: content-hashed stream URL and length.',
    '// A cue absent here has not been generated yet; the score layer then falls',
    '// back to the procedural remasters (music_tracks.ts).',
    '',
    'export interface ScoreTrackFile {',
    '  readonly url: string;',
    '  readonly seconds: number;',
    '}',
    '',
    'export const SCORE_TRACK_FILES: Readonly<Record<string, ScoreTrackFile>> = {',
    ...rows,
    '};',
    '',
  ].join('\n');
  writeFileSync(GENERATED, text);
  console.log(`wrote ${rows.length} cues to src/game/music_score_tracks.generated.ts`);
}

function writeProvenanceDoc() {
  const ledger = readLedger();
  const extra = existsSync(join(ROOT, 'scripts/music/provenance_other.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'scripts/music/provenance_other.json'), 'utf8'))
    : { assets: [] };
  const lines = [
    '# ElevenLabs provenance ledger',
    '',
    'Every audio asset generated with ElevenLabs, with the date and the account plan tier',
    'at generation time. Assets generated on the FREE tier carry no commercial rights and',
    'must be regenerated on a paid plan before release if the terms require it.',
    '',
    'Regenerate this file with `node scripts/music/eleven_music.mjs build` (music rows come',
    'from `scripts/music/provenance.json`, other crews\' rows from',
    '`scripts/music/provenance_other.json`).',
    '',
    '## Music (feature/music)',
    '',
    '| Cue | Date | Plan tier | Model | Requested s | Credits | Sung |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const [key, t] of Object.entries(ledger.takes).sort()) {
    lines.push(
      `| ${key} | ${t.date} | ${t.planTier} | ${t.model} | ${t.requestedSeconds} | ${t.credits ?? '?'} | ${t.sung ? 'yes' : 'no'} |`,
    );
  }
  lines.push('', '## Other crews (sound effects and ambience)', '');
  lines.push('| Asset | Branch | Date | Plan tier | Note |', '|---|---|---|---|---|');
  for (const a of extra.assets) {
    lines.push(`| ${a.asset} | ${a.branch} | ${a.date} | ${a.tier} | ${a.note ?? ''} |`);
  }
  const free = extra.assets.filter((a) => /free/i.test(a.tier)).length +
    Object.values(ledger.takes).filter((t) => /free/i.test(String(t.planTier))).length;
  lines.push('', `Free-tier assets listed: ${free}.`, '');
  mkdirSync(join(ROOT, 'docs/audio'), { recursive: true });
  writeFileSync(PROVENANCE_DOC, lines.join('\n'));
}

function estimate() {
  const rate = Number(arg('--rate') ?? 0);
  for (const tier of [1, 2, 3]) {
    const list = MUSIC_PLAN.filter((t) => t.tier === tier);
    const s = list.reduce((a, t) => a + t.seconds, 0);
    const credits = rate ? Math.round((s / 60) * rate) : '?';
    console.log(`tier ${tier}: ${list.length} cues, ${(s / 60).toFixed(1)} min, ~${credits} credits`);
  }
  const all = MUSIC_PLAN.reduce((a, t) => a + t.seconds, 0);
  console.log(`total: ${MUSIC_PLAN.length} cues, ${(all / 60).toFixed(1)} min`);
}

async function main() {
  if (mode === 'usage') console.log(describe(await subscription()));
  else if (mode === 'estimate') estimate();
  else if (mode === 'generate') await generate();
  else if (mode === 'measure') {
    for (const f of process.argv.slice(3)) console.log(`${f}: ${lufsOf(f)} LUFS, ${probeSeconds(f).toFixed(1)} s`);
  } else if (mode === 'build') {
    let n = 0;
    for (const cue of cues) if (buildOne(cue)) n++;
    console.log(`built ${n} cues`);
    for (const cue of cues) {
      const out = join(OUT_DIR, `${cue.key}.mp3`);
      if (existsSync(out)) console.log(`  ${cue.key}: ${lufsOf(out)} LUFS, ${probeSeconds(out).toFixed(1)} s`);
    }
    writeGenerated();
    writeProvenanceDoc();
  } else throw new Error(`unknown mode ${mode}`);
}

await main();
