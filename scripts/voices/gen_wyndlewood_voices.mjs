// Wyndlewood's own voice set (asset-rights decision 1). Every line the game voices (NPC
// greetings, quest offers and completions, boss, encounter and escort yells, the island guide)
// is spoken by that NPC's own designed voice, from the current content's text. Voices are made
// with ElevenLabs Voice Design on the project's paid account from original casting briefs
// (scripts/voices/wyndlewood_voice_cast.mjs), never cloned or imitated, and each NPC keeps one
// voice everywhere (scripts/voices/wyndlewood_voice_cast.json).
//
//   ELEVENLABS_API_KEY=... node scripts/voices/gen_wyndlewood_voices.mjs design
//       designs a voice for every speaking NPC not yet in the cast table
//   ELEVENLABS_API_KEY=... node scripts/voices/gen_wyndlewood_voices.mjs generate
//       voices every line not yet in the ledger (scripts/voices/wyndlewood_voice_takes.json:
//       date, plan tier, voice, characters); stops while VOICE_RESERVE characters remain
//   RIGHTS_ARCHIVE=<dir> node scripts/voices/gen_wyndlewood_voices.mjs retire
//       moves every clip under public/audio/voice/ the ledger does not list out of the repo
//   node scripts/voices/gen_wyndlewood_voices.mjs manifest
//       rebuilds src/game/voice_manifest.generated.ts from the clips on disk
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { FFMPEG_PATH } from '../sfx/ffmpeg_paths.mjs';
import { VOICE_PROMPTS } from './npc_voice_prompts.mjs';
import { collectVoiceLines } from './voice_line_catalog.mjs';
import { buildVoiceManifestEntries } from './voice_manifest.mjs';
import { voiceBrief } from './wyndlewood_voice_cast.mjs';

const API = 'https://api.elevenlabs.io';
const TTS_MODEL = 'eleven_multilingual_v2';
const OUTPUT_FORMAT = 'mp3_44100_192';
const root = process.cwd();
const voiceDir = path.join(root, 'public/audio/voice');
const castPath = path.join(root, 'scripts/voices/wyndlewood_voice_cast.json');
const ledgerPath = path.join(root, 'scripts/voices/wyndlewood_voice_takes.json');
const manifestPath = path.join(root, 'src/game/voice_manifest.generated.ts');
const RESERVE = Number(process.env.VOICE_RESERVE ?? 2000);
const mode = process.argv[2] ?? 'manifest';

/** The bosses' processing after synthesis: pitch factor and echo, for size. */
const BOSS_FX = {
  nythraxis: { pitch: 0.9, echo: 'aecho=0.8:0.8:90:0.3' },
  ignivar: { pitch: 0.86, echo: 'aecho=0.8:0.6:40|80:0.3|0.2' },
  varkhul: { pitch: 0.84, echo: 'aecho=0.8:0.7:60|120:0.3|0.2' },
};

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = () => {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error('ELEVENLABS_API_KEY is not set');
  return { 'xi-api-key': k, 'content-type': 'application/json' };
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function loadContent() {
  const build = await esbuild.build({
    stdin: {
      contents:
        "export { NPCS, QUESTS, ESCORTS } from './src/sim/data.ts'; " +
        "export { IGNIVAR_DIALOGUE_LINES } from './src/sim/encounters/ignivar_dialogue.ts'; " +
        "export { VARKHUL_DIALOGUE_LINES } from './src/sim/encounters/varkhul_dialogue.ts';",
      resolveDir: root,
      sourcefile: 'wyndlewood-voice-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString('base64')}`
  );
}

/** Player tokens read naturally for everyone (as gen_npc_lines.mjs does). */
function spoken(text) {
  return text
    .replace(/\$N/g, 'adventurer')
    .replace(/\$C/g, 'adventurer')
    .replace(/\$d/g, 'some')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Body gender per NPC id, read from the look roster's source (no render import). */
function lookGenders() {
  const src = readFileSync(path.join(root, 'src/render/characters/npc_looks.ts'), 'utf8');
  const out = {};
  for (const m of src.matchAll(
    /^ {2}([a-z0-9_]+): \{\s*\n\s*cls:[^\n]*\n\s*app: \{\s*\n\s*gender: '(male|female)'/gm,
  )) {
    out[m[1]] = m[2];
  }
  return out;
}

/** The gender word of the earlier voice notes, as a fallback fact (never their prose). */
function noteGender(id) {
  const d = VOICE_PROMPTS.find((p) => p.npcId === id)?.voiceDescription ?? '';
  if (/\bfemale\b|\bwoman\b/i.test(d)) return 'female';
  if (/\bmale\b|\bman\b/i.test(d)) return 'male';
  return null;
}

async function subscription() {
  const res = await fetch(`${API}/v1/user/subscription`, { headers: headers() });
  if (!res.ok) return null;
  const s = await res.json();
  return {
    used: s.character_count,
    limit: s.character_limit,
    tier: s.tier,
    voices: s.voice_slots_used,
    voiceLimit: s.voice_limit,
  };
}

async function post(url, body) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}${url}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const detail = await res.text().catch(() => '');
    const err = new Error(`${url} -> ${res.status} ${detail.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
}

/** Design one voice from a brief and keep it on the account. */
async function designVoice(name, brief, sample) {
  let generatedId;
  try {
    const r = await post('/v1/text-to-voice/create-previews', {
      voice_description: brief,
      text: sample,
    });
    generatedId = (await r.json()).previews[0].generated_voice_id;
  } catch (err) {
    if (![404, 405, 410, 422].includes(err.status)) throw err;
    const r = await post('/v1/text-to-voice/design', {
      voice_description: brief,
      text: sample,
      model_id: 'eleven_multilingual_ttv_v2',
    });
    generatedId = (await r.json()).previews[0].generated_voice_id;
  }
  const r = await post('/v1/text-to-voice/create-voice-from-preview', {
    voice_name: name,
    voice_description: brief,
    generated_voice_id: generatedId,
  });
  return (await r.json()).voice_id;
}

/** A design sample of 100 to 600 characters, from the NPC's own first line. */
function sampleFor(text) {
  let s = spoken(text ?? '');
  const pad =
    ' Well met, traveller. Mind how you go on the road today, and come back safe and sound.';
  while (s.length < 110) s += pad;
  return s.slice(0, 600);
}

async function design() {
  const content = await loadContent();
  const lines = collectVoiceLines(content);
  const genders = lookGenders();
  const cast = readJson(castPath, {});
  const speakers = [...new Set(lines.map((l) => l.voiceNpc))].sort();
  const s0 = await subscription();
  console.log(
    `speakers ${speakers.length}; voice slots ${s0?.voices}/${s0?.voiceLimit}; usage ${s0?.used}/${s0?.limit}`,
  );
  for (const id of speakers) {
    if (cast[id]?.voice_id) continue;
    const s = await subscription();
    if (s && s.voiceLimit && s.voices >= s.voiceLimit - 2) {
      console.log(`STOP: voice slots full (${s.voices}/${s.voiceLimit}) at ${id}`);
      break;
    }
    const npc = content.NPCS[id];
    const name = npc?.name ?? VOICE_PROMPTS.find((p) => p.npcId === id)?.name ?? id;
    const gender = genders[id] ?? noteGender(id);
    const brief = voiceBrief({ id, name, title: npc?.title, gender });
    const first = lines.find((l) => l.voiceNpc === id);
    const voiceId = await designVoice(
      `Wyndlewood ${name}`.slice(0, 60),
      brief,
      sampleFor(first?.text),
    );
    cast[id] = {
      name,
      title: npc?.title ?? null,
      gender,
      brief,
      voice_id: voiceId,
      designed: today(),
      tier: s?.tier ?? 'unknown',
    };
    writeJson(castPath, cast);
    console.log(`designed ${id}: ${name}`);
  }
  const s1 = await subscription();
  console.log(
    `design done; voice slots ${s1?.voices}/${s1?.voiceLimit}; usage ${s1?.used}/${s1?.limit}`,
  );
}

/** A boss line, pitched down and given a little size. */
function processBoss(file, boss) {
  const { pitch, echo } = BOSS_FX[boss];
  const tmp = `${file}.raw.mp3`;
  renameSync(file, tmp);
  execFileSync(FFMPEG_PATH, [
    '-v',
    'error',
    '-y',
    '-i',
    tmp,
    '-af',
    `asetrate=44100*${pitch},aresample=44100,atempo=${(1 / pitch).toFixed(4)},${echo},alimiter=limit=0.89`,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    file,
  ]);
  rmSync(tmp, { force: true });
}

async function generate() {
  const lines = collectVoiceLines(await loadContent());
  const cast = readJson(castPath, {});
  const ledger = readJson(ledgerPath, {});
  let chars = 0;
  let made = 0;
  for (const line of lines) {
    const rel = `${line.voiceNpc}/${line.key}.mp3`;
    const dest = path.join(voiceDir, line.voiceNpc, `${line.key}.mp3`);
    if (ledger[rel] && existsSync(dest)) continue;
    const voice = cast[line.voiceNpc];
    if (!voice?.voice_id) {
      console.log(`no voice for ${line.voiceNpc}, ${line.key} skipped`);
      continue;
    }
    if (made % 10 === 0) {
      const s = await subscription();
      if (s && s.limit - s.used < RESERVE) {
        console.log(`STOP: ${s.limit - s.used} characters left (reserve ${RESERVE}) at ${rel}`);
        break;
      }
    }
    const text = spoken(line.text);
    const r = await post(`/v1/text-to-speech/${voice.voice_id}?output_format=${OUTPUT_FORMAT}`, {
      text,
      model_id: TTS_MODEL,
    });
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    if (BOSS_FX[line.voiceNpc]) processBoss(dest, line.voiceNpc);
    ledger[rel] = { generated: today(), tier: 'paid', voice: voice.name, chars: text.length };
    writeJson(ledgerPath, ledger);
    chars += text.length;
    made++;
  }
  const s = await subscription();
  for (const v of Object.values(ledger)) if (v.tier === 'paid') v.tier = s?.tier ?? 'paid';
  writeJson(ledgerPath, ledger);
  console.log(
    `voiced ${made} lines, ${chars} characters; usage now ${s?.used} / ${s?.limit} (tier ${s?.tier})`,
  );
}

function retire() {
  const archive = process.env.RIGHTS_ARCHIVE;
  if (!archive) throw new Error('RIGHTS_ARCHIVE is not set');
  const ledger = readJson(ledgerPath, {});
  let moved = 0;
  for (const dir of readdirSync(voiceDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of readdirSync(path.join(voiceDir, dir.name))) {
      if (!f.endsWith('.mp3') || ledger[`${dir.name}/${f}`]) continue;
      const dest = path.join(archive, 'voice', dir.name, f);
      mkdirSync(path.dirname(dest), { recursive: true });
      renameSync(path.join(voiceDir, dir.name, f), dest);
      moved++;
    }
    if (readdirSync(path.join(voiceDir, dir.name)).length === 0)
      rmSync(path.join(voiceDir, dir.name), { recursive: true });
  }
  console.log(`retired ${moved} inherited voice clips`);
}

async function manifest() {
  const lines = collectVoiceLines(await loadContent());
  const diskPathFor = (line) => path.join(voiceDir, line.voiceNpc, `${line.key}.mp3`);
  const entries = buildVoiceManifestEntries(lines, diskPathFor);
  const sorted = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((k) => [k, entries[k]]),
  );
  writeFileSync(
    manifestPath,
    [
      '// Generated by scripts/gen_npc_lines.mjs. Do not edit by hand.',
      '// Maps an NPC voice-line key to its public audio path (served from public/).',
      'export const VOICE_LINES: Record<string, string> = ',
      `${JSON.stringify(sorted, null, 2)} as const;`,
      '',
    ].join('\n'),
  );
  console.log(`manifest: ${Object.keys(sorted).length} of ${lines.length} lines voiced`);
}

if (mode === 'design') await design();
else if (mode === 'generate') await generate();
else if (mode === 'retire') retire();
else if (mode === 'manifest') await manifest();
else throw new Error(`unknown mode ${mode}`);
