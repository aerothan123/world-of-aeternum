// Original Wyndlewood replacements for the inherited CC BY-NC sound effects (asset-rights
// decision 1): one ElevenLabs take per key, written from scratch as plain text descriptions of
// the sound (never another game's audio), asking for several separated instances that
// scripts/sfx/rights_replacement_sfx.mjs slices into the key's shipped variant files. A key
// keeps its file names and count, so no code path changes. `{N}` in a prompt is filled with
// one more instance than the key ships, so the slicer has a spare and repeats stay rare.

const DRY = 'Close-mic and completely dry: no reverb, no music, no ambience.';
const APART = 'with a clear silent pause between each';
const WIDE = 'with a full second of silence between each';
const NO_WORDS = 'Non-verbal, no words.';

const steps = (surface) =>
  `Footsteps of one person in leather boots walking slowly ${surface}, eight separate steps ${APART}. ${DRY}`;

/** Tranche 1: the most-heard core sounds and the Chapter One mob families. */
export const RIGHTS_SFX_PROMPTS = [
  { key: 'foot_grass', request: 6, prompt: steps('across soft grass') },
  { key: 'foot_dirt', request: 6, prompt: steps('along a packed dirt path') },
  { key: 'foot_stone', request: 6, prompt: steps('on flat stone paving') },
  { key: 'foot_wood', request: 6, prompt: steps('on old wooden floorboards') },
  { key: 'foot_snow', request: 6, prompt: steps('through crunchy fresh snow') },
  {
    key: 'foot_water',
    request: 6,
    prompt: steps('wading through shallow ankle-deep water, splashy'),
  },
  // retaken: the first take held too few separate instances
  {
    key: 'move_jump',
    request: 8,
    prompt: `{N} separate jump take-offs by one adventurer: a short cloth and leather rustle and a soft push-off from the ground, ${WIDE}. No voice. ${DRY}`,
  },
  {
    key: 'move_land',
    request: 5,
    prompt: `Four separate landings of one adventurer in boots after a short jump onto dirt: a thud with a light rattle of gear, ${APART}. No voice. ${DRY}`,
  },
  {
    key: 'move_splash',
    request: 9,
    prompt: `Three separate splashes of a person jumping feet first into a lake, ${APART}. ${DRY}`,
  },
  {
    key: 'move_swim',
    request: 8,
    prompt: `One person swimming breaststroke at the water surface, five separate strokes ${APART}. ${DRY}`,
  },
  {
    key: 'melee_swing_light',
    request: 6,
    prompt: `Seven separate quick whooshes of a light dagger slicing through the air, ${APART}. ${DRY}`,
  },
  {
    key: 'melee_swing_blade',
    request: 6,
    prompt: `Seven separate whooshes of a one-handed steel sword swung through the air, ${APART}. ${DRY}`,
  },
  {
    key: 'melee_swing_heavy',
    request: 6,
    prompt: `Seven separate deep heavy whooshes of a two-handed axe swung hard through the air, ${APART}. ${DRY}`,
  },
  {
    key: 'melee_unarmed',
    request: 10,
    prompt: `{N} separate bare-fist punches landing on a padded leather target, a dull meaty thud each, ${WIDE}. ${DRY}`,
  },
  {
    key: 'melee_bow',
    request: 10,
    prompt: `{N} separate shots of a wooden longbow, each the string's release twang and a short arrow whoosh, ${WIDE}. ${DRY}`,
  },
  {
    key: 'combat_block',
    request: 6,
    prompt: `{N} separate sword blows striking a wooden shield with an iron rim, ${WIDE}. ${DRY}`,
  },
  {
    key: 'combat_parry',
    request: 4.5,
    prompt: `Three separate sword-on-sword parries: a sharp bright steel clash with a short scrape, ${APART}. ${DRY}`,
  },
  {
    key: 'combat_dodge',
    request: 4.5,
    prompt: `Three separate quick evasive sidesteps: a fast cloth and leather swish with a light boot scuff, ${APART}. No voice. ${DRY}`,
  },
  {
    key: 'combat_crit',
    request: 6,
    prompt: `{N} separate brutal heavy weapon hits on armour, each a deep crunching impact with a metal clang, ${WIDE}. ${DRY}`,
  },
  {
    key: 'player_hurt',
    request: 5,
    prompt: `Five separate short pained grunts from an adult man taking a hit in a fight, ${APART}. ${NO_WORDS} ${DRY}`,
  },
  {
    key: 'player_hurt_female',
    request: 5,
    prompt: `Five separate short pained grunts from an adult woman taking a hit in a fight, ${APART}. ${NO_WORDS} ${DRY}`,
  },
  {
    key: 'player_death',
    request: 9,
    prompt: `Three separate dying groans from an adult man collapsing in battle, each a long fading exhale, ${APART}. ${NO_WORDS} ${DRY}`,
  },
  {
    key: 'player_death_female',
    request: 9,
    prompt: `Three separate dying groans from an adult woman collapsing in battle, each a long fading exhale, ${APART}. ${NO_WORDS} ${DRY}`,
  },
  {
    key: 'quest_accept',
    request: 3,
    single: true,
    prompt:
      'A short warm notification sound: a gentle plucked harp arpeggio rising over two seconds, soft and bright, dry, nothing else.',
  },
  {
    key: 'quest_ready',
    request: 3,
    single: true,
    prompt:
      'A short soft notification sound: two gentle hand-bell chimes on a rising interval with a light shimmer, dry, nothing else.',
  },
  {
    key: 'quest_complete',
    request: 4,
    single: true,
    prompt:
      'A short satisfying reward flourish: a bright rising plucked harp run and soft hand bells resolving on a warm major chord, about three seconds, dry.',
  },
  {
    key: 'ui_level_up',
    request: 5,
    single: true,
    prompt:
      'A short joyful milestone flourish: a rising shimmer of hand bells over a warm wooden flute swell, resolving on a bright major chord, about four seconds, dry.',
  },
  {
    key: 'ui_achievement',
    request: 4,
    single: true,
    prompt:
      'A short proud accomplishment sting: a bright glockenspiel run ending on one soft frame-drum hit, about three seconds, dry.',
  },
];

/** Five-action voice sets for one mob family. */
const family = (key, who, sounds) =>
  Object.entries(sounds).map(([action, [request, what]]) => ({
    key: `mob_${key}_${action}`,
    request,
    prompt: `${what} of ${who}, ${APART}. ${DRY}`,
  }));

RIGHTS_SFX_PROMPTS.push(
  ...family('beast', 'a large wild animal', {
    aggro: [3.5, 'Two separate short aggressive snarls'],
    attack: [4.5, 'Three separate quick vicious bite snaps with growls'],
    death: [4, 'Two separate final dying groans, each fading out'],
    hurt: [3, 'Two separate short pained yelping growls'],
    idle: [4, 'Two separate low calm snuffles with a breathy grumble'],
  }),
  ...family('beast_wolf', 'a grey wolf', {
    aggro: [3.5, 'Two separate snarling growls with bared teeth'],
    attack: [4.5, 'Three separate quick snapping bites with snarls'],
    death: [4, 'Two separate dying whimpers, each fading out'],
    hurt: [3, 'Two separate sharp pained yelps'],
    idle: [4.5, 'Three separate quiet sniffs and short low huffs'],
  }),
  ...family('boar', 'an angry wild boar', {
    aggro: [4.5, 'Three separate loud squealing grunts'],
    attack: [5, 'Four separate short aggressive charging grunts and squeals'],
    death: [4, 'Two separate dying squeals, each fading out'],
    hurt: [3, 'Two separate sharp pained squeals'],
    idle: [4, 'Two separate snuffling, rooting grunts'],
  }),
  ...family('burrower', 'a small burrowing creature with clicking mandibles', {
    aggro: [3.5, 'Two separate angry hissing chitters'],
    attack: [4.5, 'Three separate fast clicking mandible snaps with hisses'],
    death: [4, 'Two separate dying chittering rattles, each fading out'],
    hurt: [3, 'Two separate sharp pained squeaking hisses'],
    idle: [4, 'Two separate soft clicking chitters'],
  }),
  ...family('humanoid', 'a rough adult man, a bandit', {
    aggro: [3.5, 'Two separate short angry wordless battle shouts'],
    attack: [4.5, 'Three separate strained effort grunts swinging a weapon'],
    death: [4, 'Two separate dying groans, each fading out'],
    hurt: [3, 'Two separate short pained grunts'],
    idle: [4, 'Two separate bored sighs and a throat clearing'],
  }),
);
for (const p of RIGHTS_SFX_PROMPTS) {
  if (p.key.startsWith('mob_humanoid')) p.prompt = `${p.prompt} ${NO_WORDS}`;
}

// --- Tranche 2: the other mob families, the warrior kit, magic, projectiles, wands, lockpick,
// and the rickshaw loop.

/** A five-action set; every action asks for {N} instances. */
const familyN = (key, who) => [
  {
    key: `mob_${key}_aggro`,
    request: 5,
    prompt: `{N} separate short aggressive challenge calls of ${who}, ${APART}. ${DRY}`,
  },
  {
    key: `mob_${key}_attack`,
    request: 6,
    prompt: `{N} separate quick fierce attacking sounds of ${who}, ${APART}. ${DRY}`,
  },
  {
    key: `mob_${key}_death`,
    request: 6,
    prompt: `{N} separate final dying sounds of ${who}, each fading out, ${APART}. ${DRY}`,
  },
  {
    key: `mob_${key}_hurt`,
    request: 4,
    prompt: `{N} separate short pained sounds of ${who} being struck, ${APART}. ${DRY}`,
  },
  {
    key: `mob_${key}_idle`,
    request: 5,
    prompt: `{N} separate calm idle sounds of ${who}, ${APART}. ${DRY}`,
  },
];
RIGHTS_SFX_PROMPTS.push(
  ...familyN('demon', 'a hulking fiery demon, deep and guttural, non-verbal'),
  ...familyN('dragonkin', 'a young dragon-like reptilian beast with a rumbling throat'),
  ...familyN(
    'elemental',
    'a living elemental of rock and flame: grinding stone and roaring fire, not a voice',
  ),
  ...familyN(
    'elemental_ignivar',
    'a colossal fire elemental lord: a roaring furnace with crackling magma, not a voice',
  ),
  ...familyN(
    'elemental_varkhul',
    'a giant molten iron forge golem: grinding metal and a deep furnace roar, not a voice',
  ),
  ...familyN('mudfin', 'a small amphibious fish creature: gurgling, croaking burbles, non-verbal'),
  ...familyN('ogre', 'a huge dim-witted ogre: deep bellowing grunts, non-verbal'),
  ...familyN('reptile', 'a large lizard: hissing and throaty clicks'),
  ...familyN('spider', 'a giant spider: chittering, clicking fangs and hissing'),
  ...familyN('troll', 'a tall wild troll: throaty snarling growls, non-verbal'),
  ...familyN('undead', 'a shambling undead ghoul: raspy rattling groans, non-verbal'),
  ...familyN(
    'undead_skeleton',
    'a skeleton warrior: rattling bones and a dry clacking jaw, not a voice',
  ),
);

/** Warrior abilities: [release (the swing), impact key suffix(es) and what lands]. */
const WARRIOR = {
  avatar: [
    'an empowered towering overhead swing with a deep rushing whoosh',
    [['avatar_rise', 'a surge of power rising: a deep resonant whomp with a rumbling swell']],
  ],
  bloodletting: [
    'a fast slashing cut through the air',
    [
      ['bloodletting', 'a sharp slicing cut with a wet spatter'],
      ['blood_recovery', 'a pulsing heartbeat thump with a warm rush'],
    ],
  ],
  breachmaker: [
    'a heavy armour-breaking overhead chop',
    [['breachmaker', 'a crunching blow splitting plate armour']],
  ],
  brute: ['a brutal wide shoulder-driven swing', [['brute', 'a heavy blunt bash on armour']]],
  early_grave: [
    'a decisive downward execution strike',
    [['early_grave', 'a final crushing blow, a deep thud and a bone crack']],
  ],
  faultline: [
    'a ground-splitting downward smash',
    [['faultline', 'the ground cracking open with rumbling stone']],
  ],
  goad: [
    'a quick taunting shield bash',
    [['goad_bark', 'a sharp shield slam with a short wordless shout']],
  ],
  guard: [
    'a shield raised fast with a leather and metal rattle',
    [['guard_lock', 'a shield locking into place with a heavy metallic clunk']],
  ],
  gyre: [
    'a spinning whirlwind sweep of a greatsword',
    [['gyre_sweep', 'a wide sweeping strike hitting several targets in quick succession']],
  ],
  hammer: [
    'a heavy throwing hammer hurled with a spinning whoosh',
    [['hammer_land', 'a thrown hammer slamming into armour with a heavy clang']],
    'melee_warrior_hammer_throw',
  ],
  hobble: ['a low quick leg-sweeping slash', [['hobble_cut', 'a short tearing slice to the leg']]],
  jawcrack: [
    'a short hard uppercut with a weapon pommel',
    [['jawcrack_break', 'a crunching jaw-breaking hit']],
  ],
  maiming: ['a vicious hooking slash', [['maiming', 'a deep tearing wound strike']]],
  mending: [
    'a warrior bracing to recover: a steady breath and settling armour',
    [['mending_lock', 'a warm soft pulse of renewed vigour']],
  ],
  quake: [
    'a mighty two-handed slam swung toward the ground',
    [['quake', 'a shockwave rumble shaking the earth']],
  ],
  reaver: ['a reaping wide axe swing', [['reaver', 'a ripping axe hit']]],
  reckless: ['a wild frenzied swing', [['reckless_tear', 'a savage tearing hit']]],
  red_harvest: [
    'a three-part combination of fast swings',
    [
      ['red_harvest_first', 'a first quick slash hit'],
      ['red_harvest_second', 'a second harder slash hit'],
      ['red_harvest_finish', 'a final heavy finishing chop'],
    ],
  ],
  redhand: ['a fast backhand strike', [['redhand', 'a meaty heavy strike']]],
  resolve: [
    'a warrior steeling himself: an armour creak and a deep breath',
    [['resolve_lock', 'a firm resolute metallic lock with a low hum']],
  ],
  revenge: ['an angry counter swing', [['revenge', 'a punishing counter hit on a shield']]],
  seething: [
    'a seething furious swing',
    [['seething_release', 'a burst of fiery rage, a crackling whoosh']],
  ],
  shear: [
    'a scraping shearing slash along armour',
    [['shear_peel', 'metal peeling and scraping off armour']],
  ],
  shieldcrack: [
    'a heavy shield bash wind-up',
    [['shieldcrack', 'a shield cracking under a heavy blow, splintering wood and metal']],
  ],
  sword_guard: [
    'a sword raised into a parrying guard',
    [['sword_guard_lock', 'blades locking with a ringing scrape']],
  ],
  toll: [
    'a heavy mace swung in a wide arc',
    [['toll_clench', 'a deep resonant clang ringing like a struck bell']],
  ],
  twinstrike: [
    'two fast alternating strikes',
    [
      ['twinstrike_first', 'a quick first hit'],
      ['twinstrike_second', 'a quick second hit'],
    ],
  ],
  victory: [
    'a triumphant finishing swing',
    [['victory', 'a decisive heavy hit with a ringing clang']],
  ],
};
for (const [name, [release, impacts, releaseKey]] of Object.entries(WARRIOR)) {
  RIGHTS_SFX_PROMPTS.push({
    key: releaseKey ?? `melee_warrior_${name}_release`,
    request: 5,
    prompt: `{N} separate takes of ${release}, ${APART}. Weapon motion only, no impact, no voice. ${DRY}`,
  });
  for (const [suffix, what] of impacts) {
    RIGHTS_SFX_PROMPTS.push({
      key: `impact_warrior_${suffix}`,
      request: 5,
      prompt: `{N} separate takes of ${what}, ${APART}. ${DRY}`,
    });
  }
}

const hit = (key, what) => ({ key, request: 5, prompt: `{N} separate ${what}, ${APART}. ${DRY}` });
const one = (key, request, what) => ({
  key,
  request,
  single: true,
  prompt: `${what} Single sound. ${DRY}`,
});
RIGHTS_SFX_PROMPTS.push(
  hit('impact_bone', 'weapon hits on bone, each a hard dry crack'),
  hit('impact_flesh', 'weapon hits on flesh, each a dull meaty thud'),
  hit('impact_leather', 'weapon hits on leather armour, each a slapping thump'),
  hit('impact_metal', 'weapon hits on plate armour, each a sharp metallic clang'),
  one(
    'impact_masterwork_execution',
    2.5,
    'An expertly placed heavy executing strike: a crisp metal crunch with a short ring.',
  ),
  one(
    'impact_arcane',
    2,
    'An arcane magic bolt striking a target: a crystalline shimmering burst.',
  ),
  one('impact_fire', 2, 'A fireball hitting a target: a whooshing fiery burst and crackle.'),
  one(
    'impact_frost',
    2,
    'An ice bolt shattering on a target: a crisp crack of ice and a glassy tinkle.',
  ),
  one('impact_holy', 2, 'A radiant holy light striking: a bright bell-like swell.'),
  one('impact_nature', 2, 'A nature spell striking: a burst of rustling leaves and a woody snap.'),
  one('impact_shadow', 2, 'A shadow bolt striking: a deep hollow whoomph with a dark airy hiss.'),
  one('heal_impact', 2, 'A gentle healing spell landing: a soft warm shimmering swell.'),
  one('buff_apply', 2, 'A protective blessing settling on someone: a rising sparkling chime.'),
  one('debuff_apply', 2, 'A curse settling on someone: a descending dark hum.'),
  one(
    'spell_nova',
    3,
    'A magical nova blast expanding outward: a deep whoosh and a shimmering burst.',
  ),
  one(
    'proj_arcane',
    2,
    "An arcane bolt launched from a caster's hands: a fizzing crystalline whoosh.",
  ),
  one('proj_fire', 2, "A fireball launched from a caster's hands: a roaring fiery whoosh."),
  one('proj_frost', 2, "An ice shard launched from a caster's hands: a cold crackling whoosh."),
  one(
    'proj_holy',
    2,
    "A bolt of holy light launched from a caster's hands: a bright humming whoosh.",
  ),
  one('proj_nature', 2, "A nature bolt launched from a caster's hands: a whirling leafy whoosh."),
  one('proj_shadow', 2, "A shadow bolt launched from a caster's hands: a dark hollow whoosh."),
  hit('wand_arcane', 'quick arcane wand zaps, each a bright fizzing crackle'),
  hit('wand_holy', 'quick holy wand zaps, each a clear shining ping'),
  hit('wand_shadow', 'quick shadow wand zaps, each a dark buzzing pulse'),
  hit('lockpick_advanced', 'delicate metal pin clicks inside an intricate lock'),
  one('lockpick_begin', 1.5, 'A lockpick slid into a keyhole: a small metal scrape.'),
  one('lockpick_bind', 1, 'A lock pin binding under tension: a tight metallic tick.'),
  one('lockpick_bonus', 1.5, 'A small satisfying bright double click with a soft sparkle.'),
  one('lockpick_end', 1.5, 'A lockpick drawn out of a lock: a short metal scrape.'),
  one('lockpick_fail', 1.5, 'A lockpick snapping inside a lock: a sharp metal ping.'),
  one(
    'lockpick_page_cleared',
    2.5,
    'A lock mechanism tumbling open in sequence: several clicks, then a solid clunk.',
  ),
  one('lockpick_retry', 1.5, 'A lockpick repositioned in a keyhole: a light metallic rattle.'),
  one('lockpick_slip', 1, 'A lockpick slipping in a lock: a quick scrape.'),
  one('lockpick_success', 1.5, 'A lock springing open: a solid clunk and click.'),
  one('lockpick_trap', 1.5, 'A trap in a lock triggering: a sharp spring snap and a dart whoosh.'),
  {
    key: 'mount_loop_rickshaw_mount',
    request: 20,
    single: true,
    loop: true,
    prompt: `A wooden rickshaw cart rolling steadily over a dirt road: creaking wooden wheels, a rattling frame and a rolling crunch, continuous and even. ${DRY}`,
  },
);
