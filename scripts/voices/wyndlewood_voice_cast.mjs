// Wyndlewood's voice cast: every speaking NPC gets a voice of its own, designed with ElevenLabs
// Voice Design from an original casting brief (never a clone or an imitation of a real person,
// an actor, or another game's character), and keeps that voice everywhere it speaks. The brief
// is built here from the NPC's own content (name, title, body) and, for the named cast, the
// character notes of docs/narrative/wyndlewood_bible.md, in new words.
//
// Pure and deterministic (tested by tests/wyndlewood_voice_cast.test.ts); the generated cast
// table, with each NPC's brief and designed voice, is scripts/voices/wyndlewood_voice_cast.json.

/** The named cast, by a word of their display name: [age, character]. */
export const CHARACTER_NOTES = {
  Fenlow: [
    'in his late fifties',
    'a gruff, wry ferry captain with a stubborn streak and a soft heart under it',
  ],
  Marla: [
    'in her forties',
    'a warm, practical innkeeper, protective, quick to feed anyone in need',
  ],
  Orwin: [
    'in his sixties',
    'an eccentric, forgetful, brilliant historian who keeps losing his train of thought',
  ],
  Ivara: ['in her fifties', 'a gentle, watchful herbalist whose calm can turn quietly unsettling'],
  Silven: [
    'in his thirties',
    'a charming, ambitious merchant with a ready smile and a sharp eye for a deal',
  ],
  Jorren: ['in his forties', 'a cheerfully gloomy tavern keeper brimming with odd stories'],
  Olvessa: ['in her seventies', 'a compassionate, patient marsh healer with an air of old mystery'],
  Brunna: ['in her forties', 'a proud, direct master smith with no patience for foolishness'],
  Odrik: ['in his fifties', 'a loud, dramatic mining foreman who startles easily'],
  Raska: ['in her thirties', 'a brilliant, reckless, endlessly enthusiastic dragon scholar'],
  Neris: ['in her thirties', 'a quiet, dependable wilderness guide with a dry sense of humour'],
  Pella: ['in her twenties', 'an energetic, perfectionist carpenter who is always half distracted'],
  Tobbin: ['in his fifties', 'a talkative, friendly, superstitious fisherman'],
  Hester: ['in her fifties', 'a grumbling, generous, fiercely competitive baker'],
  Corren: ['in his forties', 'an honourable, organised and perpetually tired warden commander'],
};

/** The bosses: designed as more than human. */
export const BOSS_BRIEFS = {
  nythraxis:
    'An ancient undead king of a fallen kingdom: a vast, cold, slow and regal male voice, cruel and grieving, with a hollow, echoing weight. Not human-sounding.',
  ignivar:
    'A colossal living forge elemental: a booming, crackling male voice like a furnace given speech, with a metallic ring under every word. Not human-sounding.',
  varkhul:
    'A towering forge-father of molten iron: a deep, gravelly, rumbling male voice, proud and weary, heavy as an anvil. Not human-sounding.',
};

/** A role's temperament, by a word of the NPC's title. */
const ROLE_TEMPERAMENT = [
  [
    /warden|captain|marshal|guard|sentry|watch|scout|commander|sergeant/i,
    'steady, alert and plain-spoken',
  ],
  [
    /merchant|trader|vendor|bursar|auction|quartermaster|provisioner|broker|card/i,
    'brisk, sociable and businesslike',
  ],
  [
    /smith|forge|armou?rer|tanner|wright|carpenter|mason|foreman|miner|tinker|weaver/i,
    'practical, blunt and hardworking',
  ],
  [
    /herbal|apothecar|healer|alchemist|garden|orchard|mender|spirit/i,
    'gentle, attentive and unhurried',
  ],
  [
    /lore|archiv|chronicl|scholar|astronom|vicar|brother|sexton|keeper|historian|scribe/i,
    'thoughtful, measured and a little wry',
  ],
  [
    /fish|ferry|tide|harbou?r|netter|salvag|strand|quay|sailor|boat|navigator/i,
    'weathered, easygoing and salt of the earth',
  ],
  [/cook|innkeep|tavern|hearth|baker|brewer/i, 'warm, chatty and hospitable'],
  [/hunt|trapper|ranger|stable/i, 'outdoorsy, terse and capable'],
];

/** A spread of regional British-Isles accents, so the villages do not sound alike. */
const ACCENTS = [
  'a soft rural English accent',
  'a light West Country lilt',
  'a gentle Northern English accent',
  'a mild Scottish burr',
  'a soft Irish lilt',
  'a crisp Southern English accent',
  'a lilting Welsh accent',
];
const AGES = ['in their thirties', 'in their forties', 'in their fifties'];

/** FNV-1a, so each NPC's accent and age stay put across builds. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The named-cast notes for a display name, or null. */
export function characterNotesFor(name) {
  for (const word of String(name ?? '').split(/[\s'.-]+/)) {
    if (Object.hasOwn(CHARACTER_NOTES, word)) return CHARACTER_NOTES[word];
  }
  return null;
}

/**
 * The casting brief for one NPC voice: gender, age, character and accent, in plain words.
 * @param {{ id: string, name?: string, title?: string, gender?: 'male' | 'female' | null }} npc
 */
export function voiceBrief(npc) {
  if (Object.hasOwn(BOSS_BRIEFS, npc.id)) return BOSS_BRIEFS[npc.id];
  const h = hash(npc.id);
  const who = npc.gender === 'female' ? 'A woman' : npc.gender === 'male' ? 'A man' : 'A person';
  const notes = characterNotesFor(npc.name);
  const title = String(npc.title ?? '');
  const elder = /elder|mother|old|grand|widow|sexton|hermit|crone/i.test(`${npc.name} ${title}`);
  const young = /apprentice|young|novice|page|squire/i.test(`${npc.name} ${title}`);
  const age =
    notes?.[0] ??
    (elder ? 'in old age' : young ? 'in their early twenties' : AGES[h % AGES.length]);
  const role = title ? title.toLowerCase() : 'villager';
  const character =
    notes?.[1] ??
    `a ${role}, ${ROLE_TEMPERAMENT.find(([re]) => re.test(`${title} ${npc.id}`))?.[1] ?? 'friendly and down to earth'}`;
  const accent = ACCENTS[(h >>> 4) % ACCENTS.length];
  return `${who} ${age}: ${character}, speaking with ${accent}. A natural, characterful fantasy villager voice with clear diction, an original voice, not an imitation of anyone.`;
}
