// The gathering strike and tree-fall cues: ElevenLabs Sound Effects takes,
// generated as several candidates each, auditioned and trimmed by
// scripts/sfx/gather_strike_sfx.mjs. Marked custom so a bulk `npm run sfx:gen`
// never regenerates them; the kept raw masters live in scripts/sfx/sources/gather/.
// Every take is DRY: the outdoor echo is the runtime reverb send
// (src/game/outdoor_reverb_bus.ts), so it can follow distance and the space.

const DRY =
  'Realistic close-mic field recording, completely dry and isolated: no reverb, no room sound, no echo, no music, no voice, no ambience.';

export const GATHER_STRIKE_PROMPTS = [
  {
    key: 'impact_gather_pick',
    // seconds requested from the generator; the kept take is trimmed to `trim`
    request: 1,
    trim: 0.6,
    // a take that swings twice is cut before its second hit
    singleHit: true,
    candidates: 8,
    keep: 4,
    prompt: `One single heavy steel pickaxe striking hard granite: a sharp bright metallic tick at the instant of contact, a dense rock crack, and a few small stone chips falling right after. One hit only, short. ${DRY}`,
  },
  {
    key: 'impact_gather_axe',
    request: 1,
    trim: 0.6,
    singleHit: true,
    candidates: 8,
    keep: 4,
    prompt: `One single sharp felling axe biting deep into a thick oak trunk: a solid heavy woody thunk, a fibrous wood crack, a few splinters. One hit only, short. ${DRY}`,
  },
  {
    key: 'impact_tree_creak',
    request: 2.2,
    trim: 1.8,
    candidates: 4,
    keep: 2,
    prompt: `A large tree trunk creaking and groaning under strain as it starts to tip over, wood fibres snapping and splitting faster and faster. No crash, no impact at the end. ${DRY}`,
  },
  {
    key: 'impact_tree_crash',
    request: 2.6,
    trim: 2.2,
    candidates: 4,
    keep: 2,
    prompt: `A large tree falling and crashing onto a forest floor: one deep heavy thud of the trunk landing, branches breaking and cracking, leaves thrashing, then settling. ${DRY}`,
  },
];

/** The catalog rows (sfx_prompts.mjs): custom, one ordered track per kept take. */
export const GATHER_STRIKE_SFX = GATHER_STRIKE_PROMPTS.map(({ key, trim, keep, prompt }) => ({
  key,
  duration: trim,
  prompt,
  custom: true,
  variants: Array.from({ length: keep }, () => ({})),
}));
