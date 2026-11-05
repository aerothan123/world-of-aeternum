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
  // --- Phase B: the open country at night, the remaining zones, harbours, and interiors.
  {
    key: 'amb_bed_night_wild',
    request: 30,
    prompt:
      'Open countryside at night: steady chirping crickets, soft breeze in grass, a distant owl. No music.',
  },
  {
    key: 'amb_bed_peaks',
    request: 30,
    prompt:
      'High mountain pass: cold gusting wind over rocks, distant raven calls, pebbles trickling. No music.',
  },
  {
    key: 'amb_bed_harbor',
    request: 30,
    prompt:
      'Seaside harbor by day: waves on a wooden pier, creaking ropes and moored boats, gulls, far voices. No music.',
  },
  {
    key: 'amb_bed_cave',
    request: 30,
    prompt:
      'Inside a damp cave: slow echoing water drips, low still air rumble, a faint trickle. No music.',
  },
  {
    key: 'amb_bed_crypt',
    request: 30,
    prompt:
      'Old stone crypt: deep hollow drone, distant dripping, dust settling, cold stillness. No music.',
  },
  {
    key: 'amb_bed_temple',
    request: 30,
    prompt:
      'Vast ancient stone hall: low reverberant hum, distant running water, wind through arches. No music.',
  },
  {
    key: 'amb_bed_jungle',
    request: 30,
    prompt:
      'Dense tropical rainforest: humid insect chorus, exotic bird calls, dripping leaves. No music.',
  },
  {
    key: 'amb_bed_frost',
    request: 30,
    prompt:
      'Frozen tundra: icy wind with blowing snow, creaking ice, muffled cold stillness. No music.',
  },
  {
    key: 'amb_bed_ember',
    request: 30,
    prompt:
      'Volcanic wasteland: deep earth rumble, hissing steam vents, crackling embers, hot wind. No music.',
  },
  {
    key: 'amb_bed_haunt',
    request: 30,
    prompt:
      'Eerie dark forest: still damp air, creaking branches, slow drips, low moaning wind. No music.',
  },
  {
    key: 'amb_bed_garden',
    request: 30,
    prompt:
      'Lush flower garden: a gentle fountain, buzzing bees, songbirds, soft breeze in leaves. No music.',
  },
  {
    key: 'amb_bed_amber',
    request: 30,
    prompt:
      'Autumn woodland: dry leaves rustling and falling, a gentle breeze, a few distant birds. No music.',
  },
  {
    key: 'amb_bed_gale',
    request: 30,
    prompt:
      'Windswept grassy highland: strong steady wind over hills, whipping grass, a far hawk cry. No music.',
  },
  {
    key: 'amb_bed_dusk',
    request: 30,
    prompt:
      'Hushed twilight valley: a faint low breeze, soft evening insects, an uneasy stillness. No music.',
  },
];
