// Original Wyndlewood replacements for the inherited CC BY-NC sound effects (asset-rights
// decision 1): one ElevenLabs take per key, written from scratch as plain text descriptions of
// the sound (never another game's audio), asking for several separated instances that
// scripts/sfx/rights_replacement_sfx.mjs slices into the key's shipped variant files. A key
// keeps its file names and count, so no code path changes.

const DRY = 'Close-mic and completely dry: no reverb, no music, no ambience.';
const APART = 'with a clear silent pause between each';
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
  {
    key: 'move_jump',
    request: 5,
    prompt: `Five separate jump take-offs by one adventurer: a short cloth and leather rustle and a soft push-off from the ground, ${APART}. No voice. ${DRY}`,
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
    request: 6,
    prompt: `Seven separate bare-fist punches landing on a padded leather target, a dull meaty thud each, ${APART}. ${DRY}`,
  },
  {
    key: 'melee_bow',
    request: 6,
    prompt: `Five separate shots of a wooden longbow: the string's release twang and a short arrow whoosh, ${APART}. ${DRY}`,
  },
  {
    key: 'combat_block',
    request: 4.5,
    prompt: `Three separate sword blows striking a wooden shield with an iron rim, ${APART}. ${DRY}`,
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
    request: 4.5,
    prompt: `Three separate brutal heavy weapon hits on armour: a deep crunching impact with a metal clang, ${APART}. ${DRY}`,
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
    aggro: [3.5, `Two separate short angry wordless battle shouts`],
    attack: [4.5, 'Three separate strained effort grunts swinging a weapon'],
    death: [4, 'Two separate dying groans, each fading out'],
    hurt: [3, 'Two separate short pained grunts'],
    idle: [4, 'Two separate bored sighs and a throat clearing'],
  }),
);
for (const p of RIGHTS_SFX_PROMPTS) {
  if (p.key.startsWith('mob_humanoid')) p.prompt = `${p.prompt} ${NO_WORDS}`;
}
