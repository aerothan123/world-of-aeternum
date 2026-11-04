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

/** Style directions for the two strikes, auditioned side by side in the styles
 *  demo (scripts/sfx/gather_styles_demo.mjs) before any of them replaces a shipped
 *  take. Not catalog rows: their masters live in scripts/sfx/sources/gather/variants/. */
export const GATHER_STRIKE_STYLES = {
  heavy: {
    label: 'heavy: deeper and weightier, a strong low-mid body thump, less treble',
    impact_gather_pick: {
      request: 1,
      trim: 0.6,
      prompt: `One single massive iron pickaxe slammed down hard into a granite boulder: a deep, weighty low-mid thump of solid stone taking the blow, the dull heavy crack of rock, very little treble or ring. One hit only. ${DRY}`,
    },
    impact_gather_axe: {
      request: 1,
      trim: 0.6,
      prompt: `One single heavy felling axe driven deep into a huge old tree trunk: a deep, weighty, chesty wooden thud with a strong low-mid body, a dull fibrous crack, little treble. One hit only. ${DRY}`,
    },
  },
  ringing: {
    label: 'ringing: a bright steel ring that sustains and decays, a sharp crack with hollow wood',
    impact_gather_pick: {
      request: 1.2,
      trim: 0.9,
      prompt: `One single steel pickaxe striking hard granite: a sharp metallic clang at contact and the steel head ringing out clearly, a bright tone sustaining and decaying smoothly over most of a second, a short rock crack under it. One hit only. ${DRY}`,
    },
    impact_gather_axe: {
      request: 1,
      trim: 0.7,
      prompt: `One single sharp axe striking a dry standing tree trunk: a crisp, sharp wood crack at the bite and a hollow, resonant wooden knock ringing from the trunk afterwards. One hit only. ${DRY}`,
    },
  },
  crunchy: {
    label: 'crunchy: gritty rock break and skittering debris, splintering crack and flying chips',
    impact_gather_pick: {
      request: 1.2,
      trim: 0.8,
      // the falling debris IS the direction: never cut at a "second hit"
      singleHit: false,
      prompt: `One single pickaxe biting into a rocky ore vein: a gritty crunching rock break, stone crumbling apart, pebbles and gravel skittering and tumbling down right after. One hit only. ${DRY}`,
    },
    impact_gather_axe: {
      request: 1.2,
      trim: 0.8,
      singleHit: false,
      prompt: `One single axe chopping into a log: a splintering wood crack, fibres tearing, and wood chips flying and pattering down around it. One hit only. ${DRY}`,
    },
  },
};

/** The tightened B direction for the pick (the user's steer: punchier, more of a
 *  metal-on-rock ring): a hard, fast transient with a strong mid punch, then a
 *  clear steel-on-stone ring, little debris. Pick only, more candidates; also the
 *  source pool for the layered build (gather_strike_sfx.mjs styles-layer). */
GATHER_STRIKE_STYLES.punchy = {
  label: 'B punchy ring: a hard punchy hit, then a clear steel-on-stone ring',
  impact_gather_pick: {
    request: 1.2,
    trim: 0.9,
    candidates: 8,
    prompt: `One single hard steel pickaxe blow on solid granite: an instant, hard, punchy impact with a strong midrange crack and nothing soft at the front, then the steel head ringing clearly against the stone, a bright metallic ring sustaining and decaying over about half a second, only a few small chips. One hit only. ${DRY}`,
  },
};

/** Candidates generated and takes kept per style direction and strike. */
export const STYLE_CANDIDATES = 4;
export const STYLE_KEEP = 2;

/** The catalog rows (sfx_prompts.mjs): custom, one ordered track per kept take. */
export const GATHER_STRIKE_SFX = GATHER_STRIKE_PROMPTS.map(({ key, trim, keep, prompt }) => ({
  key,
  duration: trim,
  prompt,
  custom: true,
  variants: Array.from({ length: keep }, () => ({})),
}));
