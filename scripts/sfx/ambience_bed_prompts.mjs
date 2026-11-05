// The region ambience beds' ElevenLabs prompts (scripts/sfx/ambience_beds_sfx.mjs). Kept short:
// the account bills per second requested, so every bed is one take, no audition batch.
// Original descriptions of natural and village sound only, no reference to any other work.
// `request` is the seconds asked for; the built loop is SEAM_SECONDS shorter.

export const AMBIENCE_BED_PROMPTS = [
  {
    key: 'amb_bed_shore',
    request: 22,
    prompt: 'Gentle ocean surf on a sandy beach, seagulls calling, steady sea breeze. No music.',
  },
  {
    key: 'amb_bed_town_day',
    request: 30,
    prompt:
      'Medieval village by day: a babbling river, distant chatter, faint anvil, a cart rolling, songbirds. No music.',
  },
  {
    key: 'amb_bed_town_night',
    request: 30,
    // The first take of a quieter prompt came back near silent (about -65 dBFS RMS).
    prompt:
      'Village at night beside a flowing river: chirping crickets, an owl hooting, water over stones. No music.',
  },
  {
    key: 'amb_bed_meadow',
    request: 30,
    prompt:
      'Open summer meadow: soft breeze in tall grass, bees and insects, larks singing. No music.',
  },
  {
    key: 'amb_bed_forest',
    request: 30,
    prompt:
      'Deep forest: wind in tall trees, creaking boughs, rustling leaves, sparse birdsong. No music.',
  },
  {
    key: 'amb_bed_marsh',
    request: 30,
    prompt:
      'Swamp at dusk: croaking frogs, buzzing insects, bubbling still water, reeds in wind. No music.',
  },
];
