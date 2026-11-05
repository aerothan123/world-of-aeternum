// The Wyndlewood soundtrack plan: every generated music cue, its prompt, its
// target length and its priority. Data only; scripts/music/eleven_music.mjs
// reads it to generate (paid), build (free) and estimate cost (free).
//
// IP rule (docs/design/music-direction.md): every prompt describes music ONLY by
// instrumentation, mood, tempo, mode and form. Never name a composer, artist,
// band, song, film or game, and never ask for an imitation. Every lyric below
// was written fresh for Wyndlewood; none quotes or adapts an existing song.
//
// Fields:
//   key      the shipped cue id (public/audio/music/wyn/<key>.mp3)
//   group    title | region | town | combat | dungeon | boss | home | song | stinger
//   seconds  the requested length (the API bills by output length)
//   tier     1 = core (ships first), 2 = full soundtrack, 3 = nice to have
//   prompt   instrumental prompt (force_instrumental), or
//   plan     a composition plan (styles + sections with lyric lines) for songs

/** Shared style guard rails, appended to every instrumental prompt. */
export const GLOBAL_STYLE =
  'Storybook fantasy folk score for a cozy hand-painted adventure world. ' +
  'Acoustic and orchestral instruments only, warm natural room sound, gentle dynamics, ' +
  'clear melody, no vocals. ' +
  'Avoid: drum kit, electric guitar, synthesizers, electronic beats, trailer hits, ' +
  'modern pop production, distorted sounds.';

/** Loop-friendly ending, appended to every looping cue. */
const LOOPABLE =
  'Begin softly and end on a quiet held chord that settles back toward the opening, ' +
  'so it can rest in silence and start again naturally.';

const region = (key, seconds, tier, body) => ({
  key,
  group: 'region',
  seconds,
  tier,
  prompt: `${body} ${LOOPABLE}`,
});

export const MUSIC_PLAN = [
  // Title and front end
  {
    key: 'wyn_title',
    group: 'title',
    seconds: 150,
    tier: 1,
    prompt:
      'Main title theme. Opens with a lone wooden flute over a soft harp, a hopeful rising ' +
      'melody in D major with a Mixolydian lowered seventh that gives it an old-world folk ' +
      'colour. Warm strings enter, then a gentle hand drum and a hammered dulcimer; the ' +
      'theme grows into a broad, heartfelt full statement with horns and a wordless light ' +
      'choir, like the first sight of a green valley at sunrise. Middle section turns ' +
      'briefly to a hushed minor-key reflection with low clarinet hinting at danger beyond ' +
      'the lanterns, then returns to the main melody, fuller and brighter. Moderate tempo, ' +
      'about 84 bpm, 3/4 swaying feel. Ends on a sustained warm chord.',
  },
  {
    key: 'wyn_charselect',
    group: 'title',
    seconds: 90,
    tier: 2,
    prompt:
      'Calm character selection music. The main melody of a hopeful D Mixolydian folk theme ' +
      'played quietly by solo harp and cello, with soft sustained strings and an occasional ' +
      'wooden flute answer. Intimate, patient, like a fire in an inn before a journey. ' +
      'Slow tempo, about 70 bpm. ' +
      LOOPABLE,
  },

  // Regions (day and night). Day: warm and melodic. Night: sparse, mysterious.
  region(
    'wyn_region_proving_shore_day',
    100,
    2,
    'Seaside morning on a small starter island. Gentle fiddle and tin whistle melody over ' +
      'plucked lute and soft frame drum, G major, light 6/8 lilt, about 96 bpm, sea-breeze ' +
      'optimism and a sense of first steps.',
  ),
  region(
    'wyn_region_proving_shore_night',
    70,
    3,
    'Night on a quiet island shore. Solo harp arpeggios, a low flute melody, soft string ' +
      'pad, slow, E minor, calm and a little lonely, distant lantern light on the water.',
  ),
  region(
    'wyn_region_eastbrook_vale_day',
    120,
    1,
    'Pastoral home-valley theme. Rolling green hills, watermills, farm fields under a golden ' +
      'sky. Acoustic guitar-like lute and harp picking, a singing fiddle melody answered by ' +
      'wooden flute, light hand percussion, warm cello bass, G major, 6/8, about 100 bpm. ' +
      'Friendly, open and unhurried, with a gentle middle section on solo oboe.',
  ),
  region(
    'wyn_region_eastbrook_vale_night',
    90,
    1,
    'The same green valley at night. Slow, hushed: harp and celesta-like bell tones, a low ' +
      'alto flute melody, soft sustained strings, crickets-quiet texture, E minor with a ' +
      'gentle Dorian lift, about 66 bpm. Peaceful but with a faint unease at the edges.',
  ),
  region(
    'wyn_region_farshore_isle_day',
    100,
    2,
    'Island exploration with maritime mystery. Concertina-like reed, fiddle and low ' +
      'whistle over a rolling 6/8 hand drum, A Dorian, about 92 bpm. Salt wind, rope and ' +
      'timber, curiosity with a hint of old shipwreck sorrow in the middle section.',
  ),
  region(
    'wyn_region_farshore_isle_night',
    70,
    3,
    'Foggy island night. Distant low horn calls, slow solo cello, soft bowed string ' +
      'harmonics, a tolling deep bell-like tone, A minor, about 60 bpm, mysterious and wide.',
  ),
  region(
    'wyn_region_mirefen_marsh_day',
    100,
    1,
    'Haunted wetlands of stilt houses and misty walkways. Low clarinet and bass clarinet ' +
      'melody, plucked double bass, muted strings, soft wooden clicks and a slow frame drum, ' +
      'D Phrygian, about 76 bpm. Eccentric, damp, slightly comic but uneasy, as if the marsh ' +
      'remembers things that never happened.',
  ),
  region(
    'wyn_region_mirefen_marsh_night',
    70,
    2,
    'Marsh at night. Sparse and eerie: glassy bowed string harmonics, a breathy low flute, ' +
      'slow detuned-sounding harp notes, distant soft choir hum, D minor, very slow, about ' +
      '56 bpm. Pale lights over black water.',
  ),
  region(
    'wyn_region_thornpeak_heights_day',
    100,
    1,
    'Mountain mining highlands with ancient forges. Strong low strings and horns, steady ' +
      'anvil-like metallic percussion on the off beat, a proud fiddle melody, E minor ' +
      'Aeolian, 4/4 marching, about 104 bpm. Hardy, industrious, wind on high stone.',
  ),
  region(
    'wyn_region_thornpeak_heights_night',
    70,
    2,
    'Mountains at night. Low horn and cello duet, slow, distant wind-like flute, sparse ' +
      'low drum heartbeat, E minor, about 62 bpm, cold stars over quiet mine lamps.',
  ),
  region(
    'wyn_region_veiled_hollow_day',
    100,
    2,
    'A sealed, forgotten kingdom reached through a portal. Shimmering harp glissandi, ' +
      'muted strings, soft celesta and glass-like bell tones, a wistful oboe melody, ' +
      'B Lydian, about 72 bpm. Dreamlike, faded royal grandeur, beauty under dust.',
  ),
  region(
    'wyn_region_veiled_hollow_night',
    70,
    3,
    'Night in a faded portal kingdom. Very soft wordless choir, slow string chords that ' +
      'drift between major and minor, solo harp, about 58 bpm, haunting and still.',
  ),
  region(
    'wyn_region_drakelands_day',
    100,
    2,
    'Volcanic dragon lands. Deep low brass and low strings, large frame drums in a slow ' +
      'heavy pulse, a fierce fiddle and horn melody, C Phrygian dominant colour, about ' +
      '88 bpm. Heat shimmer, ash, awe and danger, but still adventurous rather than grim.',
  ),
  region(
    'wyn_region_drakelands_night',
    70,
    3,
    'Volcanic land at night. Low bowed strings, rumbling soft timpani rolls, a lonely ' +
      'bass flute line, embers glowing, C minor, about 60 bpm.',
  ),
  region(
    'wyn_region_frostveil_day',
    100,
    2,
    'Frozen wilderness of ancient pacts. Crystalline harp and bell tones, high violins ' +
      'in long notes, a solemn low flute melody, soft tapped frame drum, A Aeolian, about ' +
      '70 bpm. Vast, cold, pure, a sense of old oaths in the ice.',
  ),
  region(
    'wyn_region_frostveil_night',
    70,
    3,
    'Snowbound night. Glassy string harmonics, slow solo cello, wind-soft flute breath, ' +
      'very sparse bells, A minor, about 54 bpm, hushed and endless.',
  ),
  region(
    'wyn_region_amberfall_day',
    100,
    2,
    'Ancient autumn forest of falling amber leaves. Warm harp, nylon-string-like lute ' +
      'and cello, a nostalgic English horn melody, light brushed hand percussion, F major ' +
      'with gentle minor turns, about 84 bpm. Golden, bittersweet, deep old trees.',
  ),
  region(
    'wyn_region_amberfall_night',
    70,
    3,
    'Autumn forest night. Soft low strings, slow harp, an alto flute melody, faint wooden ' +
      'creaks of percussion, D minor, about 60 bpm, leaves drifting in moonlight.',
  ),
  region(
    'wyn_region_willowfen_day',
    100,
    2,
    'Magical willow wetlands. Flowing harp arpeggios, soft clarinet and flute in thirds, ' +
      'gentle pizzicato strings, small chimes, E-flat major, 6/8, about 80 bpm. Graceful, ' +
      'enchanted, green light through hanging branches.',
  ),
  region(
    'wyn_region_willowfen_night',
    70,
    3,
    'Willow wetland night. Twinkling small bells, slow harp, very soft choir pad, a ' +
      'gentle flute lullaby line, C minor, about 58 bpm, glowing insects over still water.',
  ),
  region(
    'wyn_region_nightbloom_day',
    100,
    2,
    'Moonlit supernatural land of glowing flowers. Ethereal wordless female choir, ' +
      'celesta, harp, slow string chords, a floating solo violin, F-sharp Lydian, about ' +
      '64 bpm. Beautiful and strange, memories drifting like pollen.',
  ),
  region(
    'wyn_region_nightbloom_night',
    70,
    3,
    'Deep moonlit night among glowing flowers. Barely there: high string harmonics, ' +
      'soft glass bells, a distant hummed choir chord, about 50 bpm, otherworldly calm.',
  ),
  region(
    'wyn_region_wraithwood_day',
    100,
    2,
    'Ancient haunted forest of guardian spirits. Low strings in slow tremolo, a solemn ' +
      'cello melody, distant soft choir, hollow wooden percussion, B minor, about 68 bpm. ' +
      'Reverent and eerie, ghosts of old heroes among enormous trees.',
  ),
  region(
    'wyn_region_wraithwood_night',
    70,
    3,
    'Haunted forest at night. Whispering bowed textures, a slow bass clarinet, one ' +
      'lonely high violin line, faint low choir, B minor, about 52 bpm, chilling but quiet.',
  ),
  region(
    'wyn_region_palmreach_day',
    100,
    2,
    'Tropical coast with ancient ruins and trading ports. Marimba and plucked strings, ' +
      'bright flute melody, hand drums and shakers in a relaxed groove, A major with a ' +
      'Mixolydian lift, about 100 bpm. Sun, surf, adventure and treasure.',
  ),
  region(
    'wyn_region_palmreach_night',
    70,
    3,
    'Tropical night. Soft marimba, gentle hand drum, a mellow wooden flute, warm string ' +
      'pad, F-sharp minor, about 70 bpm, warm breeze and distant ruins.',
  ),
  region(
    'wyn_region_evergarden_day',
    100,
    2,
    'An unnaturally perfect paradise garden. Sweet music-box-like celesta, harp and ' +
      'flutes in simple, too-perfect C major phrases, soft strings, about 76 bpm. Pleasant ' +
      'on the surface, with subtle harmonic wrongness creeping in: a repeated phrase that ' +
      'never resolves, a held note slightly out of place.',
  ),
  region(
    'wyn_region_evergarden_night',
    70,
    3,
    'Paradise garden at night. A slow music-box melody that gradually slows, soft strings ' +
      'holding unresolved chords, C major turning ambiguous, about 56 bpm, serene and ' +
      'unsettling.',
  ),
  region(
    'wyn_region_galecrest_day',
    100,
    2,
    'Storm highlands with ancient structures suspended over valleys. Driving low strings ' +
      'ostinato, soaring horns and violins, powerful frame drums, D Dorian, about 108 bpm. ' +
      'Wind, height and old engineering marvels, heroic and exhilarating.',
  ),
  region(
    'wyn_region_galecrest_night',
    70,
    3,
    'Storm highlands at night. Low rumbling drums far away, sustained horns, a solo ' +
      'fiddle melody in the wind, D minor, about 64 bpm, lightning over distant ruins.',
  ),
  region(
    'wyn_region_southern_reaches_day',
    100,
    3,
    'Warm southern frontier of open grasslands and dusty roads. Plucked lute, bowed ' +
      'fiddle, low whistle and a steady walking hand drum, A Mixolydian, about 96 bpm. ' +
      'Wide horizons, caravans and far travel.',
  ),
  region(
    'wyn_region_southern_reaches_night',
    70,
    3,
    'Southern frontier night. Campfire-quiet solo lute, soft cello, distant flute, ' +
      'A minor, about 62 bpm, stars over open plains.',
  ),

  // Towns
  {
    key: 'wyn_town_eastbrook_day',
    group: 'town',
    seconds: 150,
    tier: 1,
    prompt:
      'Village town theme for a welcoming market village of crooked cottages, an inn, ' +
      'workshops and cobbled streets. Bouncy fiddle melody with accordion-like reed and ' +
      'tin whistle, plucked lute rhythm, light frame drum and wooden spoons-like clicks, ' +
      'D major, 2/4 polka-like lilt, about 112 bpm. Cheerful bustle, merchants and bakers, ' +
      'a little humour, with a warm, slower middle section on cello and harp. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_town_eastbrook_night',
    group: 'town',
    seconds: 100,
    tier: 1,
    prompt:
      'The same village at night, lanterns in windows. Slow solo fiddle playing a gentle ' +
      'version of a cheerful village tune, harp chords, soft cello, a low whistle answer, ' +
      'D major turning to B minor, about 72 bpm. Cozy, quiet, safe behind shutters. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_town_fenbridge_day',
    group: 'town',
    seconds: 110,
    tier: 2,
    prompt:
      'Marsh town of stilt houses and wooden walkways. Lazy swaying clarinet and button ' +
      'accordion-like reed melody, plucked double bass, brushed frame drum, a banjo-like ' +
      'plucked lute, G minor with major lifts, 3/4, about 92 bpm. Cheerfully gloomy, ' +
      'eccentric locals, welcoming once they trust you. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_town_fenbridge_night',
    group: 'town',
    seconds: 75,
    tier: 3,
    prompt:
      'Marsh town at night. Slow clarinet, soft accordion-like reed chords, quiet plucked ' +
      'bass, lantern glow over mist, G minor, about 66 bpm. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_town_highwatch_day',
    group: 'town',
    seconds: 110,
    tier: 2,
    prompt:
      'Mountain mining town with forges and stone halls. Sturdy low strings, horn melody, ' +
      'rhythmic hammer-on-anvil metallic percussion, fiddle counter-melody, E minor ' +
      'turning to G major, 4/4, about 100 bpm. Proud, hard-working, warm hearths. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_town_highwatch_night',
    group: 'town',
    seconds: 75,
    tier: 3,
    prompt:
      'Mountain town at night. Low horn and cello, soft distant anvil taps, warm harp, ' +
      'E minor, about 64 bpm, embers of forges cooling. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_town_goldcrest_day',
    group: 'town',
    seconds: 110,
    tier: 2,
    prompt:
      'Grand harbor capital city of merchants and guilds. Stately strings and brass, ' +
      'bright woodwinds, harpsichord-like plucked keyboard, tambourine and frame drum, ' +
      'B-flat major, 4/4, about 108 bpm. Prosperous, busy docks, banners and gulls. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_town_goldcrest_night',
    group: 'town',
    seconds: 75,
    tier: 3,
    prompt:
      'Harbor capital at night. Soft strings, gentle plucked keyboard, a lyrical oboe ' +
      'melody, lapping-water calm, G minor, about 68 bpm, lamplit quays. ' +
      LOOPABLE,
  },

  // Combat layers (one per region family plus the Pale Accord)
  ...[
    [
      'wyn_combat_pastoral',
      1,
      'Exciting field battle in green countryside. Fast driving fiddles and low strings ' +
        'ostinato, punchy frame drums and taiko-like low drums, horn stabs, D minor, about ' +
        '140 bpm. Energetic and adventurous, not grim.',
    ],
    [
      'wyn_combat_marsh',
      2,
      'Battle in a misty marsh. Urgent low clarinets and plucked double bass ostinato, ' +
        'rattling wooden percussion, staccato strings, D Phrygian, about 132 bpm, tense and ' +
        'murky but energetic.',
    ],
    [
      'wyn_combat_highland',
      2,
      'Mountain and forge battle. Heavy anvil-like metal percussion, big frame drums, low ' +
        'brass riffs, fierce fiddles, E minor, about 138 bpm, powerful and heroic.',
    ],
    [
      'wyn_combat_frost',
      3,
      'Battle in frozen wilds. Icy tremolo strings, sharp bell accents, pounding low drums, ' +
        'horn calls, A minor, about 136 bpm, cold and urgent.',
    ],
    [
      'wyn_combat_eerie',
      2,
      'Battle against spirits and haunted things. Agitated tremolo strings, low choir ' +
        'stabs, eerie glassy harmonics, pounding drums, B minor, about 132 bpm, frightening ' +
        'but exciting.',
    ],
    [
      'wyn_combat_wild',
      3,
      'Battle in tropical and wild lands. Rapid hand drums and marimba ostinato, bold ' +
        'brass, fast flute runs, F-sharp minor, about 140 bpm, wild and thrilling.',
    ],
    [
      'wyn_combat_pale_accord',
      2,
      'Battle against a secretive cult of scholars. Dark low woodwinds (bassoons, bass ' +
        'clarinet, contrabassoon), cold string clusters, a stern low choir chant on vowels, ' +
        'relentless timpani, C minor with chromatic menace, about 128 bpm. Sinister and ' +
        'driven.',
    ],
  ].map(([key, tier, body]) => ({
    key,
    group: 'combat',
    seconds: 70,
    tier,
    prompt: `${body} Starts strongly on the downbeat and ends on a firm final chord.`,
  })),

  // Dungeons and raids
  ...[
    [
      'wyn_dungeon_hollow_crypt',
      1,
      'Exploring a dusty crypt under a village. Slow low strings, distant tolling bell, ' +
        'muted horn, dripping harp notes, soft low choir hum, D minor, about 64 bpm, ' +
        'spooky but storybook rather than horror.',
    ],
    [
      'wyn_dungeon_sunken_bastion',
      2,
      'A drowned sea fortress full of bells beneath the tide. Underwater-feeling slow ' +
        'string swells, muffled deep bells, low horn, harp ripples, F minor, about 60 bpm.',
    ],
    [
      'wyn_dungeon_drowned_temple',
      2,
      'A flooded marsh temple of forgotten shrines. Soft chant-like choir on vowels, slow ' +
        'bass clarinet, dripping celesta, low drone, D Phrygian, about 58 bpm, sacred and ' +
        'eerie.',
    ],
    [
      'wyn_dungeon_last_keep',
      2,
      'A ruined iron fortress of an empty crown. Martial low snare-like frame drum, ' +
        'sombre brass chorale, low strings, E minor, about 72 bpm, faded glory and steel.',
    ],
    [
      'wyn_dungeon_dawnhold_castle',
      2,
      'A misty castle of a hidden kingdom. Melancholic royal strings, harp, a noble horn ' +
        'theme in minor, soft choir, B minor, about 70 bpm, beautiful decay.',
    ],
    [
      'wyn_dungeon_gravewyrm_sanctum',
      2,
      'An ash and ice sanctum where a sleeping crown lies. Deep low brass drones, cold ' +
        'string tremolo, slow heavy drums, distant choir, C minor, about 62 bpm, dread.',
    ],
    [
      'wyn_dungeon_wildheart_basin',
      3,
      'The heart of the old wild, final campaign dungeon. Living, breathing textures: ' +
        'hand drums like a heartbeat, swelling strings, wooden flutes, warm choir, A minor ' +
        'rising to C major, about 76 bpm, primal and hopeful.',
    ],
    [
      'wyn_dungeon_ancient_forge',
      2,
      'The ancient forge raid halls. Rhythmic hammer and anvil percussion, enormous low ' +
        'brass, molten-slow low strings, choir, C Phrygian, about 84 bpm, colossal.',
    ],
  ].map(([key, tier, body]) => ({
    key,
    group: 'dungeon',
    seconds: 100,
    tier,
    prompt: `${body} ${LOOPABLE}`,
  })),

  // Bosses
  ...[
    [
      'wyn_boss_dungeon',
      1,
      'Dungeon boss battle. Powerful full orchestra with choir: pounding timpani and big ' +
        'drums, low brass riffs, fierce fast strings, a heroic horn countermelody, D minor, ' +
        'about 150 bpm, climactic and exciting.',
    ],
    [
      'wyn_boss_pale_accord',
      2,
      'Boss battle against the leader of a secret cult who broke an ancient promise. Dark ' +
        'low choir chanting on vowels, chromatic low woodwinds, hammering timpani, stabbing ' +
        'strings, organ-free, C minor, about 144 bpm, sinister grandeur.',
    ],
    [
      'wyn_boss_raid_dragon',
      2,
      'Raid battle against a great dragon. Massive brass, thunderous drums, full choir, ' +
        'racing strings, E minor, about 152 bpm, epic and overwhelming but heroic.',
    ],
    [
      'wyn_boss_final',
      3,
      'Final campaign battle to restore an ancient binding promise. Begins dark and ' +
        'driving, full orchestra and choir, then the hopeful main title melody bursts ' +
        'through in the horns over the battle rhythm, D minor to D major, about 146 bpm.',
    ],
  ].map(([key, tier, body]) => ({
    key,
    group: 'boss',
    seconds: 90,
    tier,
    prompt: `${body} Starts strongly and ends on a firm final chord.`,
  })),

  // Home
  {
    key: 'wyn_home_day',
    group: 'home',
    seconds: 110,
    tier: 1,
    prompt:
      'Cozy music for inside your own cottage. Warm solo acoustic lute and harp, soft ' +
      'cello, a gentle wooden flute melody, light brushed percussion, F major, about 78 ' +
      'bpm. Homely, content, a kettle on the hearth and sunlight through the window. ' +
      LOOPABLE,
  },
  {
    key: 'wyn_home_night',
    group: 'home',
    seconds: 85,
    tier: 2,
    prompt:
      'Your cottage at night by the fire. Very soft solo harp and celesta, warm low ' +
      'strings, slow flute, F major, about 60 bpm, sleepy and safe. ' +
      LOOPABLE,
  },

  // Stingers (short; the score layer plays them over a brief duck)
  ...[
    [
      'wyn_sting_quest_complete',
      6,
      'Short triumphant folk fanfare: bright fiddle and flute flourish with a harp ' +
        'glissando and a warm major chord on strings and horn, ending cleanly.',
    ],
    [
      'wyn_sting_level_up',
      6,
      'Short rising celebratory fanfare: ascending harp and bells, horns and strings ' +
        'swelling to a bright D major chord with a soft choir "ah", ending cleanly.',
    ],
    [
      'wyn_sting_discovery',
      7,
      'Short wonder sting for discovering a new place: soft shimmering harp and celesta ' +
        'rising, a gentle horn phrase, an open warm chord, ending cleanly.',
    ],
    [
      'wyn_sting_death',
      6,
      'Short sombre sting for a fallen hero: low cello and soft choir descending to a ' +
        'quiet minor chord, a single distant bell, ending in silence.',
    ],
    [
      'wyn_sting_deed',
      5,
      'Short proud accomplishment sting: two bright horn notes and a quick fiddle run ' +
        'over a frame drum roll, a warm major chord, ending cleanly.',
    ],
    [
      'wyn_sting_home_key',
      6,
      'Short heart-warming sting for receiving the key to your own home: gentle harp, ' +
        'solo flute and warm strings, a tender major cadence, ending cleanly.',
    ],
  ].map(([key, seconds, body]) => ({
    key,
    group: 'stinger',
    seconds,
    tier: 1,
    prompt: body,
  })),

  // In-world songs (original lyrics). Composition plans with sung sections.
  {
    key: 'wyn_song_kettle_before_the_candle',
    group: 'song',
    title: 'Kettle Before the Candle',
    venue: 'The Copper Kettle Inn, Eastbrook',
    seconds: 140,
    tier: 1,
    plan: {
      positive_global_styles: [
        'lively tavern folk singalong',
        'fiddle, button accordion, tin whistle, plucked lute, frame drum, stomping feet',
        'warm mixed tavern voices, a cheerful female lead with a group chorus',
        '6/8 jig feel, D major, 120 bpm',
        'acoustic, live room sound',
      ],
      negative_global_styles: ['drum kit', 'electric guitar', 'synthesizer', 'pop production'],
      sections: [
        ['Intro', 8000, ['fiddle and whistle play the tune'], []],
        [
          'Verse 1',
          22000,
          [],
          [
            'Come in off the ferry road, the rain is on your hood,',
            'Hang your boots beside the fire and leave them where they stood,',
            "There's barley in the copper pot and bread upon the board,",
            'And no one ever won a fight on nothing but a sword.',
          ],
        ],
        [
          'Chorus',
          22000,
          ['whole room joins in'],
          [
            "So it's kettle before the candle and supper before the fight,",
            "Fill the bowl and pass the ladle, we'll mend the world tonight,",
            'The road can wait till morning and the dark can mind its door,',
            "There's always room at the Copper Kettle for one weary traveller more.",
          ],
        ],
        [
          'Verse 2',
          22000,
          [],
          [
            'The miller swears his scarecrow walked a furrow in the night,',
            "The baker swears her rival's pie is only half done right,",
            "The warden's lost his lantern and the merchant's lost his pay,",
            'But nobody leaves the Kettle hungry, not on any day.',
          ],
        ],
        [
          'Chorus',
          22000,
          ['whole room joins in'],
          [
            "So it's kettle before the candle and supper before the fight,",
            "Fill the bowl and pass the ladle, we'll mend the world tonight,",
            'The road can wait till morning and the dark can mind its door,',
            "There's always room at the Copper Kettle for one weary traveller more.",
          ],
        ],
        [
          'Bridge',
          18000,
          ['softer, just fiddle and voice'],
          [
            'And if the lanterns gutter low and the old roads come undone,',
            "We'll keep a chair beside the hearth for every wandering one.",
          ],
        ],
        [
          'Final Chorus',
          26000,
          ['big, joyful, everyone singing, ends with a shout and stamp'],
          [
            "So it's kettle before the candle and supper before the fight,",
            "Fill the bowl and pass the ladle, we'll mend the world tonight,",
            'The road can wait till morning and the dark can mind its door,',
            "There's always room at the Copper Kettle for one weary traveller more.",
          ],
        ],
      ],
    },
  },
  {
    key: 'wyn_song_usually_is',
    group: 'song',
    title: 'It Usually Is',
    venue: 'The Mirefen tavern on the Fenbridge road',
    seconds: 132,
    tier: 1,
    plan: {
      positive_global_styles: [
        'swaying comic-gloomy tavern waltz',
        'button accordion, clarinet, plucked upright bass, brushed frame drum',
        'gravelly cheerful male baritone lead, a few patrons humming along',
        '3/4, G minor with major lifts, 96 bpm',
        'acoustic, live room sound',
      ],
      negative_global_styles: ['drum kit', 'electric guitar', 'synthesizer', 'pop production'],
      sections: [
        ['Intro', 8000, ['accordion and clarinet'], []],
        [
          'Verse 1',
          24000,
          [],
          [
            'The mist came up the walkway and it settled in my ale,',
            'My roof has sprung another leak, my cousin, gone, no trail,',
            'The frogs have started singing in a tongue that no one knows,',
            "But pull a stool up, stranger, that's the way the marsh life goes.",
          ],
        ],
        [
          'Chorus',
          18000,
          ['patrons join'],
          [
            'Oh it could be worse, it usually is,',
            'The boards could rot, the lamps could fizz,',
            'So drink to the fog and the long wet night,',
            'It could be worse, and it usually is, all right.',
          ],
        ],
        [
          'Verse 2',
          24000,
          [],
          [
            "My mother's in a portrait that she swears she never sat,",
            "I remember someone's wedding, but I can't think whose was that,",
            'The shrine bell rang at midnight and nobody pulled the rope,',
            "So I've doubled what I'm charging and I've halved what I call hope.",
          ],
        ],
        [
          'Chorus',
          18000,
          ['patrons join'],
          [
            'Oh it could be worse, it usually is,',
            'The boards could rot, the lamps could fizz,',
            'So drink to the fog and the long wet night,',
            'It could be worse, and it usually is, all right.',
          ],
        ],
        [
          'Bridge',
          18000,
          ['quieter, tender'],
          [
            'But the lamps are lit in Mirefen and the stilts are standing still,',
            "And as long as someone's singing, then I reckon someone will.",
          ],
        ],
        [
          'Final Chorus',
          22000,
          ['everyone, then a wry spoken last line'],
          [
            'Oh it could be worse, it usually is,',
            'The boards could rot, the lamps could fizz,',
            'So drink to the fog and the long wet night,',
            'It could be worse, and it usually is, all right.',
          ],
        ],
      ],
    },
  },
  {
    key: 'wyn_song_raise_the_beam',
    group: 'song',
    title: 'Raise the Beam',
    venue: 'Hearthwright work crews, housing and building sites',
    seconds: 120,
    tier: 2,
    plan: {
      positive_global_styles: [
        'call and response work song',
        'steady mallet and hammer percussion on the beat, fiddle drone, low hand drum',
        'strong male lead caller with a group of workers answering',
        '4/4, D Dorian, 96 bpm',
        'acoustic, outdoor feel',
      ],
      negative_global_styles: ['drum kit', 'electric guitar', 'synthesizer', 'pop production'],
      sections: [
        ['Intro', 6000, ['hammers keep time'], []],
        [
          'Verse 1',
          26000,
          ['call and response'],
          [
            "Who'll raise the beam? We'll raise the beam!",
            'Oak from the hollow and pine from the stream,',
            'Peg it and plane it and set it up true,',
            'A house is a promise, and promises do.',
          ],
        ],
        [
          'Verse 2',
          26000,
          ['call and response'],
          [
            "Who'll lay the stone? We'll lay the stone!",
            'Nobody in Wyndlewood builds it alone,',
            'Mortar and muscle and bread at the noon,',
            'A roof by the harvest, a hearth by the moon.',
          ],
        ],
        [
          'Verse 3',
          26000,
          ['call and response, building'],
          [
            "Who'll light the hearth? We'll light the hearth!",
            'Kindling and kinship and good honest earth,',
            'Open the shutters and sweep out the floor,',
            "A home is a lantern that's lit from the door.",
          ],
        ],
        [
          'Outro',
          36000,
          ['all together, then hammers alone to the end'],
          [
            "Who'll raise the beam? We'll raise the beam!",
            'A house is a promise, and promises do.',
          ],
        ],
      ],
    },
  },
  {
    key: 'wyn_song_muddlecap_lullaby',
    group: 'song',
    title: 'The Muddlecap Lullaby',
    venue: 'A lullaby: the inn late at night, and your home at night',
    seconds: 130,
    tier: 2,
    plan: {
      positive_global_styles: [
        'gentle folk lullaby',
        'solo harp, soft wooden flute, a little warm cello',
        'soft, tender solo female voice, close and intimate',
        '3/4, F major, 66 bpm',
      ],
      negative_global_styles: ['drums', 'electric guitar', 'synthesizer', 'pop production'],
      sections: [
        ['Intro', 8000, ['harp alone'], []],
        [
          'Verse 1',
          30000,
          [],
          [
            'Quiet now, little muddlecap, the spoons are in the drawer,',
            "You've hidden every button and you've moved the chair once more,",
            'The moon is on the windowsill, the cat is on the stair,',
            'So curl up in the kindling box and leave my slippers there.',
          ],
        ],
        ['Interlude', 12000, ['flute melody'], []],
        [
          'Verse 2',
          30000,
          [],
          [
            'Quiet now, little traveller, the road is fast asleep,',
            'The lanterns watch the hedgerows and the hills are counting sheep,',
            'The Keeper keeps the fire low, the Ferryman the rain,',
            "And morning's just around the bend to bring you home again.",
          ],
        ],
        [
          'Outro',
          50000,
          ['hummed, fading, harp to the end'],
          ['Quiet now, quiet now,', 'The fire is low, quiet now.'],
        ],
      ],
    },
  },
  {
    key: 'wyn_song_keep_to_the_road',
    group: 'song',
    title: 'Keep to the Road',
    venue: 'A wandering bard at any inn; the ballad of the Lanternwardens',
    seconds: 150,
    tier: 2,
    plan: {
      positive_global_styles: [
        'storytelling folk ballad',
        'fingerpicked lute, fiddle, soft frame drum, low whistle',
        'clear warm female storyteller voice, a few voices on the chorus',
        '4/4, A minor to C major, 88 bpm',
        'acoustic',
      ],
      negative_global_styles: ['drum kit', 'electric guitar', 'synthesizer', 'pop production'],
      sections: [
        ['Intro', 8000, ['lute picking'], []],
        [
          'Verse 1',
          26000,
          [],
          [
            "There's a lantern on the ferry road that no one ever lit,",
            'It burns the colour of a promise and it never moves a bit,',
            'My grandmother would tell me, child, whatever else you do,',
            "Don't follow lights that call your name, they never call for you.",
          ],
        ],
        [
          'Chorus',
          20000,
          ['voices join'],
          [
            'So keep to the road, keep to the road,',
            'Where the wardens walk and the millstreams flowed,',
            'Carry your own light, carry your load,',
            'And keep to the road, keep to the road.',
          ],
        ],
        [
          'Verse 2',
          26000,
          [],
          [
            'I met a warden by the bridge with a lamp upon her pole,',
            "She'd walked from Thornpeak's quarries down to Mirefen's sunken hole,",
            'She said the old roads tremble now like threads pulled from a seam,',
            'But every lantern carried home is stitching up the dream.',
          ],
        ],
        [
          'Chorus',
          20000,
          ['voices join'],
          [
            'So keep to the road, keep to the road,',
            'Where the wardens walk and the millstreams flowed,',
            'Carry your own light, carry your load,',
            'And keep to the road, keep to the road.',
          ],
        ],
        [
          'Outro',
          50000,
          ['fiddle solo, then the last chorus line softly'],
          ['Carry your own light, and keep to the road.'],
        ],
      ],
    },
  },
  {
    key: 'wyn_song_five_witnesses',
    group: 'song',
    title: 'Hymn of the Five Witnesses',
    venue: 'Shrines and the sacred places of the Five Kindly Witnesses',
    seconds: 120,
    tier: 3,
    plan: {
      positive_global_styles: [
        'gentle sacred folk hymn',
        'light mixed choir, soft strings, harp',
        'slow, reverent, warm, spacious hall',
        '3/4, G Mixolydian, 60 bpm',
      ],
      negative_global_styles: ['drums', 'organ', 'electric guitar', 'synthesizer'],
      sections: [
        ['Intro', 8000, ['harp and strings'], []],
        [
          'Verse',
          40000,
          ['choir'],
          [
            'Keeper of Flame, keep the hearth when we are cold,',
            'Listener Beneath Roots, remember what was told,',
            'Ferryman of Rain, carry home the ones we miss,',
            'Sleeper in Stone, give our hands the strength for this.',
          ],
        ],
        [
          'Refrain',
          30000,
          ['choir swells'],
          [
            'Shepherd of Last Light, when the long day is done,',
            'Gather every lantern in and count us, every one.',
          ],
        ],
        [
          'Outro',
          42000,
          ['choir hums the melody, strings fade'],
          [
            'Five who were watching when the promise was made,',
            'We keep it still. We are not afraid.',
          ],
        ],
      ],
    },
  },
];

/** Section tuples to the API's chunked composition plan (the music_v2 shape): one
 *  chunk per section, its text the bracketed section name then its lyric lines
 *  (an instrumental section carries an inline direction instead), and the song's
 *  global styles repeated on every chunk ahead of the section's own. */
export function toCompositionPlan(plan) {
  return {
    chunks: plan.sections.map(([section_name, duration_ms, local, lines]) => ({
      text:
        lines.length > 0
          ? `[${section_name}]\n${lines.join('\n')}`
          : `[${section_name}]\n{instrumental}`,
      duration_ms,
      positive_styles: [...plan.positive_global_styles, ...local].slice(0, 50),
      negative_styles: plan.negative_global_styles.slice(0, 50),
      context_adherence: 'high',
    })),
  };
}

/** Total requested seconds, optionally for one tier and below. */
export function planSeconds(maxTier = 3) {
  return MUSIC_PLAN.filter((t) => t.tier <= maxTier).reduce((s, t) => s + t.seconds, 0);
}
