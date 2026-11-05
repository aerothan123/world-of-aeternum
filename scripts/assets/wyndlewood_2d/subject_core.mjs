// Pure subject composer for the Wyndlewood 2D replacement (no I/O). Turns a replaced file
// path plus the game's own content records into an original painted subject line.

export const FAMILIES = [
  { id: 'skills', dir: 'public/ui/skills' },
  { id: 'auras', dir: 'public/ui/auras' },
  { id: 'items', dir: 'public/ui/items' },
  { id: 'deeds', dir: 'public/ui/deeds' },
  ...[
    'ui/professions', 'ui/chrome', 'ui/specs', 'ui/crests', 'ui/map-markers', 'ui/currency', 'ui/ranks',
    'ui/leaderboard', 'ui/delve-affixes', 'ui/status', 'ui/procs', 'ui/fiesta', 'ui/weekly', 'ui/weekly-vault',
    'ui/world-quests', 'ui/dungeons', 'ui/dungeon-scenes', 'ui/emotes', 'ui/classes', 'ui/portraits',
    'ui/daily-rewards', 'ui/courier', 'ui/reliquary', 'textures/loading',
  ].map((d) => ({ id: 'misc', dir: `public/${d}` })),
];

const CHROME = {
  spellbook: 'an open spellbook with a glowing page', professions: 'a crossed hammer and sewing needle',
  character: 'a knight helm above a folded tabard', donate: 'a heart-shaped ruby', chest: 'a small iron-bound treasure chest',
  emote: 'a smiling theatre mask', bags: 'a leather satchel drawn shut', questlog: 'a scroll with a feather quill',
  'harvest-journal': 'a leaf-bound field journal', book: 'a heavy tome with a brass clasp', crafting: 'an anvil with a hammer',
  arena: 'crossed swords over a round shield', crown: 'a jewelled gold crown', talents: 'a small glowing tree of light',
  dfinder: 'a dark dungeon gate in a cliff', leaderboard: 'a laurel-wrapped trophy cup', social: 'two clasped hands',
  cards: 'a fan of painted playing cards', perfecting: 'a cut gem under a magnifying lens', map: 'a folded parchment map with a compass',
};

/** Shape class of a misc file: 'tile' (square-ish small art painted in sheets) or 'wide'
 *  (a scene painted alone at its own aspect). */
export function miscShape(w, h) {
  return Math.max(w, h) <= 260 && Math.abs(w - h) <= 8 ? 'tile' : 'wide';
}

export function miscSubject(dir, stem, meta) {
  const h = humanize(stem.replace(/^(archetype|prof|gather|aug|pow|medal|emote)[-_]/, ''));
  switch (dir) {
    case 'ui/chrome': return CHROME[stem] ?? h;
    case 'ui/professions': return `badge of the ${h} craft, its tools shown`;
    case 'ui/specs': return `heraldic seal of the ${h} path`;
    case 'ui/crests': return `round crest of a ${h}`;
    case 'ui/map-markers': return `a small round map pin for ${h}`;
    case 'ui/currency': return stem.startsWith('coin_') ? `a ${h} coin` : `a minted token for ${h}`;
    case 'ui/dungeons': return `portrait bust of ${h}, a dungeon foe`;
    case 'ui/portraits': return `portrait of a ${h} companion`;
    case 'ui/classes': return `round crest of the ${h} hero class`;
    case 'ui/emotes': return `a cheerful adventurer making a ${h} gesture`;
    case 'ui/weekly': return meta.shape === 'wide' ? `a wide painted scene of ${h} adventure` : `a medal for ${h}`;
    case 'ui/weekly-vault': return `a square iron vault door, ${h}`;
    case 'ui/world-quests': return meta.shape === 'wide' ? `a wide painted scene of ${h}` : `a ${h} medal`;
    case 'ui/leaderboard': return `a ${h} medal with a laurel`;
    case 'ui/procs': return `a ${h} spirit bird with spread wings`;
    case 'ui/ranks': return 'an ornate gold dragon frame';
    case 'ui/dungeon-scenes': return `a wide painted view into the ${h}`;
    case 'ui/courier': return 'a winged mail donkey carrying a satchel of letters';
    case 'ui/daily-rewards': return 'a small open treasure chest spilling coins';
    case 'ui/reliquary': return 'a perfect beast specimen preserved in a glass jar';
    case 'textures/loading': return `a sweeping painted landscape of the ${h}, an adventure vista`;
    default: return `${motifFor(h, '')}, a lingering magical effect`;
  }
}

const QUALITY = {
  poor: 'battered',
  common: 'plain',
  uncommon: 'green-trimmed',
  rare: 'blue-trimmed',
  epic: 'violet and gold',
  legendary: 'radiant orange-gold',
};
const SLOT = {
  helmet: 'helmet', shoulder: 'shoulder pauldrons', chest: 'chest armor', legs: 'leg armor',
  gloves: 'gloves', feet: 'boots', waist: 'belt', ring: 'ring', neck: 'amulet',
  trinket: 'trinket charm', offhand: 'off-hand shield or focus', mainhand: 'weapon',
  twohand: 'two-handed weapon', ranged: 'ranged weapon',
};
const ARMOR = { cloth: 'cloth', leather: 'leather', mail: 'chainmail', plate: 'plate' };
const SCHOOL = {
  fire: 'orange fire', frost: 'pale blue frost', arcane: 'violet arcane light',
  nature: 'green nature magic', holy: 'golden holy light', shadow: 'purple shadow',
  physical: 'steel and force', storm: 'lightning', chrono: 'sand-gold time magic',
};

export const clean = (s) =>
  String(s ?? '')
    .replace(/\$[a-z0-9]+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
export const humanize = (id) =>
  clean(
    String(id)
      .replace(/^(pal|hun|pri|sha|war|wlk|rog|mag|dru)_r\d+_/, '')
      .replace(/^(mob|wlk|pal|hun|pri|sha|war|rog|mag|dru|pow|aug)_/, '')
      .replace(/_/g, ' ')
      .replace(/\bbg\b/g, 'battleground')
      .replace(/\bcd\b/g, 'cooldown'),
  );
const firstSentence = (s, n = 110) => {
  const t = clean(s).split(/(?<=\.)\s/)[0];
  return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}` : t.replace(/\.$/, '');
};

// Subjects are pictures only: no proper names, no colons, no mechanics text. A name or a
// "label: description" shape makes the generator paint the words as captions.
const low = (s) => clean(s).toLowerCase().replace(/[:;]/g, ' ').replace(/\s+/g, ' ').trim();

export function itemSubject(it, id) {
  if (!it) return `a ${humanize(id)} leather backpack`;
  const q = QUALITY[it.quality] ?? 'plain';
  const name = low(it.name);
  const k = it.kind;
  if (k === 'armor') {
    const mat = ARMOR[it.armorType] ? `${ARMOR[it.armorType]} ` : '';
    return `${q} ${mat}${SLOT[it.slot] ?? 'armor piece'}`;
  }
  if (k === 'weapon' || k === 'held_offhand') return `a ${q} ${name.replace(/^the /, '')}, shown whole`;
  if (k === 'potion' || k === 'elixir' || k === 'flask') return `a stoppered glass bottle of ${name}`;
  if (k === 'food') return `${name} served on a small wooden board`;
  if (k === 'drink') return `${name} in a drinking cup`;
  if (k === 'recipe') return 'a rolled recipe parchment tied with a wax seal';
  if (k === 'scroll') return `a rolled magic scroll glowing softly`;
  if (k === 'bag') return `a ${q} cloth and leather carrying bag`;
  if (k === 'mount') return `leather riding reins with a brass charm for a ${name.replace(/^(reins of (the )?|ignition key )/, '')}`;
  return `${name}, ${q}`;
}

// Visual motifs keyed off the words of a power's name, id and effect text. The generator
// only ever sees the motif, never the name, so no caption gets painted.
const MOTIFS = [
  [/interrupt|silence|counter|kick|pummel|hush|lockout/, 'a shattered glowing rune circle'],
  [/hourglass|temporal|chrono|reversal|clock|time/, 'a glowing hourglass with drifting sand'],
  [/totem/, 'a carved wooden totem pole glowing'],
  [/trap|snare/, 'a steel jaw trap on the ground'],
  [/bomb|explosive|grenade|detonat/, 'a bursting bomb with sparks'],
  [/poison|venom|toxic|plague|disease|blight/, 'a dripping green poison flask'],
  [/stealth|vanish|sneak|shroud|camo|hide|prowl/, 'a hooded figure fading into smoke'],
  [/dagger|stab|backstab|ambush|gouge|garrote|eviscerat|kidney|cheap shot/, 'a curved dagger glinting in shadow'],
  [/arrow|shot|shoot|volley|aim|marksman|\bbow\b|crossbow|bolt/, 'a glowing arrow in flight'],
  [/bear|bruin|ursine/, 'a roaring bear spirit'],
  [/\bcat\b|feline|lynx|claw|rend|rake|swipe/, 'three raking claw marks of light'],
  [/wolf|howl|pack/, 'a howling wolf spirit'],
  [/hawk|eagle|owl|raven|harrier|feather|bird|wing/, 'a swooping hawk with spread wings'],
  [/roar|shout|cry|bellow|menace|taunt/, 'rings of a shockwave rolling outward'],
  [/moon|lunar|star|celestial|astral/, 'a crescent moon among bright stars'],
  [/root|entangle|vine|grip/, 'twisting roots bursting from the ground'],
  [/oak|bark|thorn|briar|bramble|leaf|grove|wild|bloom|sap/, 'a swirl of oak leaves and bark'],
  [/heal|mend|renew|life|restor|grace|mercy|cure|purif/, 'a soft healing glow rising from cupped hands'],
  [/shield|ward|barrier|guard|aegis|protect|bulwark|fortif/, 'a glowing round shield'],
  [/fire|flame|burn|ember|blaze|pyre|cinder|scorch|ignit|immolat|incinerat/, 'a roaring fireball'],
  [/frost|ice|frozen|chill|cold|rime|glacial|snow|blizzard/, 'jagged ice crystals bursting outward'],
  [/lightning|thunder|storm|shock|spark|static|galvan/, 'a forked lightning bolt'],
  [/wind|gale|gust|cyclone|typhoon|tempest|hurricane|squall/, 'a spiralling gust of wind with leaves'],
  [/water|wave|tide|torrent|rain|surge/, 'a cresting wave of water'],
  [/earth|stone|quake|boulder|rock|tremor/, 'cracked stone erupting from the ground'],
  [/demon|fel|imp|infernal|summon/, 'a horned demonic sigil glowing'],
  [/bone|skull|death|undead|soul|spirit|grave|corpse|necro/, 'a glowing skull wreathed in wisps'],
  [/blood|bleed|hemorrhag|marrow|sanguin/, 'falling drops of crimson blood'],
  [/drain|siphon|leech|tap|vampir/, 'a stream of red light drawn from a figure'],
  [/mind|psychic|fear|terror|horror|charm|sleep|slumber|confus|dream/, 'a dreamy swirl of mist around a closed eye'],
  [/shadow|dark|void|gloam|umbral|dusk|night|hex|curse|doom|afflict|corrupt|ruin/, 'a coiling cloud of dark purple shadow'],
  [/holy|light|radiant|dawn|\bsun|divine|sacred|judg|smite|bless|zeal|sentence/, 'a burst of golden holy light'],
  [/arcane|missile|mana|blink|polymorph|teleport|convergence/, 'a swirling violet arcane orb'],
  [/rage|fury|berserk|frenzy|bloodlust|enrage|wrath/, 'a red rage aura around a clenched fist'],
  [/hammer|mace|crush|smash|bash|slam|concuss|stun|bonecrush/, 'a heavy war hammer smashing down'],
  [/charge|rush|dash|sprint|leap|lunge|step|stride|steed|haste|fleet|speed/, 'swift speed streaks behind a running boot'],
  [/sword|blade|slash|strike|cleave|sweep|whirl|mortal|execut|overpower|takedown/, 'a bright sword slash arc'],
  [/form|shift|transform/, 'a figure changing shape in swirling light'],
  [/pet|beast|companion|tame|call/, 'a loyal hunting hound'],
];
export function motifFor(text, school, ...more) {
  for (const part of [text, ...more]) {
    const t = String(part ?? '').toLowerCase();
    const hit = MOTIFS.find(([re]) => re.test(t));
    if (hit) return hit[1];
  }
  return school === 'physical' ? 'crossed steel blades striking sparks' : 'a swirling orb of magic';
}

export function abilitySubject(ab, cls, id) {
  const school = ab?.school ?? '';
  const colour = SCHOOL[school] ?? 'glowing magic';
  return `${motifFor(ab?.name ?? '', school, id.replace(/_/g, ' '), ab?.description ?? '')}, ${colour}`;
}

const DEED_MOTIFS = [
  [/fish|cast|angl/i, 'a leaping fish'], [/harvest|gather|herb|crop|garden|farm/i, 'a sheaf of herbs and a sickle'],
  [/ore|mine|mining/i, 'a pickaxe on an ore vein'], [/discover|item|collect|catalogue|cabinet/i, 'an open treasure chest'],
  [/slay|defeat|kill|terror|boss/i, 'crossed swords over a skull'], [/dungeon|heroic|raid/i, 'a dark dungeon gate'],
  [/skill|craft|tailor|smith|forge|leather|alchem|cook|enchant|jewel|inscri|engineer/i, 'a crafting hammer and anvil'],
  [/pvp|honor|arena|duel/i, 'two crossed banners'], [/quest|chronicle|story/i, 'an open storybook'],
  [/level|experience|rested|titan/i, 'a rising sun'], [/faction|reputation|trusted/i, 'a heraldic shield'],
  [/epic|legendary|rare|purple|blue|orange/i, 'a glowing gem'], [/explore|travel|map|journey/i, 'a compass rose'],
  [/mount|ride|steed/i, 'a horse head'], [/pet|companion|buddy/i, 'a small friendly creature'],
];
export function deedSubject(d, id) {
  const text = `${d?.name ?? ''} ${d?.desc ?? ''} ${d?.category ?? ''} ${id}`;
  const motif = DEED_MOTIFS.find(([re]) => re.test(text))?.[1] ?? 'a laurel wreath around a star';
  return `${motif}, softly lit on a warm painted background`;
}
/** Ring metal for the code-built medallion frame (slice_install draws it, the generator never does). */
export function deedMetal(d, id) {
  const text = `${d?.category ?? ''} ${id}`;
  return /progression|prog_/.test(text) ? 'silver' : /dungeon|dgn_/.test(text) ? 'iron' : 'bronze';
}

export function composeSubject(family, file, index) {
  const parts = file.split('/');
  const stem = parts[parts.length - 1].replace(/\.[a-z]+$/, '');
  if (family === 'items') return { family, file, id: stem, group: index.items.get(stem)?.kind ?? 'other', subject: itemSubject(index.items.get(stem), stem) };
  if (family === 'skills') {
    const cls = parts[3];
    const ab = index.abilities.get(stem) ?? index.talents.get(stem);
    return { family, file, id: stem, group: cls, subject: abilitySubject(ab, cls, stem) };
  }
  if (family === 'auras') {
    const ab = index.abilities.get(stem);
    const what = ab ? abilitySubject(ab, ab.class ?? 'hero', stem) : `${motifFor(humanize(stem), '')}, a lingering magical effect`;
    return { family, file, id: stem, group: 'aura', subject: what };
  }
  if (family === 'deeds') {
    const d = index.deeds.get(stem);
    return { family, file, id: stem, group: d?.category ?? 'deed', metal: deedMetal(d, stem), subject: deedSubject(d, stem) };
  }
  if (family === 'misc') {
    const dir = parts.slice(1, 3).join('/');
    const meta = index.meta?.get(file) ?? { w: 128, h: 128, alpha: false, format: 'webp' };
    const shape = miscShape(meta.w, meta.h);
    return { family: shape === 'tile' ? 'misc' : 'wide', file, id: stem, group: dir, shape, ...meta, subject: `${miscSubject(dir, stem, { ...meta, shape })}${shape === 'wide' && meta.alpha ? ', alone on a plain dark slate backdrop' : ''}` };
  }
  return null;
}

const VARIANTS = ['', 'seen up close', 'in a glowing ring', 'rising upward', 'twin', 'erupting outward', 'over a battlefield', 'in a swirling vortex', 'at dusk', 'cracking the ground', 'with drifting sparks', 'in a beam of light', 'framed by mist', 'spiralling', 'shattering', 'in a storm of motes'];
/** Spread repeated motifs within one family apart with a deterministic visual variant. */
export function varySubjects(records) {
  const seen = new Map();
  for (const r of records) {
    if (r.family === 'items') continue;
    const k = `${r.family}|${r.subject}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const v = VARIANTS[n % VARIANTS.length];
    if (v) r.subject = `${r.subject}, ${v}`;
  }
  return records;
}
