# Music direction: the Wyndlewood score

The soundtrack for Wyndlewood: what it sounds like, every cue it ships, how the game plays
it, and what it cost. The cue prompts and lyrics live in `scripts/music/wyndle_music_plan.mjs`
(the source of truth for every cue); the pipeline is `scripts/music/eleven_music.mjs`; the
runtime is `src/game/music_score.ts` and `src/game/music_score_layer.ts`. The per-take ledger
and the shipped lengths are generated into `docs/audio/elevenlabs_music_provenance.md`.

## The sound

A storybook folk score for a cozy, hand-painted world: warm, melodic and acoustic, never
modern. It should feel like a story read by the fire, with danger at the edges of the lantern
light rather than in the middle of the room.

- **Core palette:** warm folk strings (fiddle, cello, a small string section), wooden flutes
  and tin whistle, harp, plucked lute, hammered dulcimer, button accordion and concertina-like
  reeds, hand percussion (frame drum, hand drum, wood clicks, brushed skins).
- **Sacred places:** a light, wordless choir over harp and bells (Nightbloom, the Veiled
  Hollow, the Drowned Temple, the Hymn of the Five Witnesses).
- **The Pale Accord:** dark low winds (bassoon, bass clarinet, contrabassoon), cold string
  clusters, a stern low vowel chant and timpani. Nothing else in the score uses that colour,
  so when it appears the player knows who is in the room.
- **Never:** drum kit, electric guitar, synthesizers, electronic beats, trailer hits, pop
  production, distortion. Every instrumental prompt carries that guard (`GLOBAL_STYLE`).
- **Mode as the map:** the home valley is major and Mixolydian, the marsh Dorian and
  Phrygian, the mountains minor with anvils, the faded kingdoms drift between major and minor,
  the Evergarden is a too-perfect C major that turns ambiguous after dark.
- **Loudness:** score cues ship at -15.5 LUFS integrated (stingers -15), true peak -1.5 dB,
  44.1 kHz stereo 128 kbps, matched to the existing zone remasters so the two sit in one mix.

### Originality rule

Every cue is original. Prompts describe music only by instrumentation, mood, tempo, mode and
form: no composer, artist, band, song, film or game is ever named or imitated, and no
reference audio is ever uploaded. Every lyric was written fresh for Wyndlewood. Each song
title was checked with an exact-phrase web search (2026-11-05) and none names a known song:

| Title | Verdict |
|---|---|
| Kettle Before the Candle | no song by that title found |
| It Usually Is | no song by that title found (generic phrase) |
| Raise the Beam | no song by that title found (a building-site phrase) |
| The Muddlecap Lullaby | no hit for the coined word "Muddlecap" |
| Keep to the Road | no song by that title found (generic phrase) |
| Hymn of the Five Witnesses | no hit; "Five Kindly Witnesses" is Wyndlewood's own folklore |

## Regions (day and night)

Fifteen regions plus the Southern Reaches. Each has a day theme (warm, melodic, about 100 s)
and a night variant (sparse and mysterious, about 70 s). Night falls by the shared day/night
cycle; see "How the game plays it".

| Region | Day | Night |
|---|---|---|
| Proving Shore | Seaside morning on a small starter island. Gentle fiddle and tin whistle melody over plucked lute and soft frame drum, G major, light 6/8 lilt, about 96 bpm, sea-breeze optimism and a sense of first steps. | Night on a quiet island shore. Solo harp arpeggios, a low flute melody, soft string pad, slow, E minor, calm and a little lonely, distant lantern light on the water. |
| Eastbrook Vale | Pastoral home-valley theme. Rolling green hills, watermills, farm fields under a golden sky. Acoustic guitar-like lute and harp picking, a singing fiddle melody answered by wooden flute, light hand percussion, warm cello bass, G major, 6/8, about 100 bpm. Friendly, open and unhurried, with a gentle middle section on solo oboe. | The same green valley at night. Slow, hushed: harp and celesta-like bell tones, a low alto flute melody, soft sustained strings, crickets-quiet texture, E minor with a gentle Dorian lift, about 66 bpm. Peaceful but with a faint unease at the edges. |
| Farshore Isle | Island exploration with maritime mystery. Concertina-like reed, fiddle and low whistle over a rolling 6/8 hand drum, A Dorian, about 92 bpm. Salt wind, rope and timber, curiosity with a hint of old shipwreck sorrow in the middle section. | Foggy island night. Distant low horn calls, slow solo cello, soft bowed string harmonics, a tolling deep bell-like tone, A minor, about 60 bpm, mysterious and wide. |
| Mirefen Marsh | Haunted wetlands of stilt houses and misty walkways. Low clarinet and bass clarinet melody, plucked double bass, muted strings, soft wooden clicks and a slow frame drum, D Phrygian, about 76 bpm. Eccentric, damp, slightly comic but uneasy, as if the marsh remembers things that never happened. | Marsh at night. Sparse and eerie: glassy bowed string harmonics, a breathy low flute, slow detuned-sounding harp notes, distant soft choir hum, D minor, very slow, about 56 bpm. Pale lights over black water. |
| Thornpeak Heights | Mountain mining highlands with ancient forges. Strong low strings and horns, steady anvil-like metallic percussion on the off beat, a proud fiddle melody, E minor Aeolian, 4/4 marching, about 104 bpm. Hardy, industrious, wind on high stone. | Mountains at night. Low horn and cello duet, slow, distant wind-like flute, sparse low drum heartbeat, E minor, about 62 bpm, cold stars over quiet mine lamps. |
| Veiled Hollow | A sealed, forgotten kingdom reached through a portal. Shimmering harp glissandi, muted strings, soft celesta and glass-like bell tones, a wistful oboe melody, B Lydian, about 72 bpm. Dreamlike, faded royal grandeur, beauty under dust. | Night in a faded portal kingdom. Very soft wordless choir, slow string chords that drift between major and minor, solo harp, about 58 bpm, haunting and still. |
| Drakelands | Volcanic dragon lands. Deep low brass and low strings, large frame drums in a slow heavy pulse, a fierce fiddle and horn melody, C Phrygian dominant colour, about 88 bpm. Heat shimmer, ash, awe and danger, but still adventurous rather than grim. | Volcanic land at night. Low bowed strings, rumbling soft timpani rolls, a lonely bass flute line, embers glowing, C minor, about 60 bpm. |
| Frostveil | Frozen wilderness of ancient pacts. Crystalline harp and bell tones, high violins in long notes, a solemn low flute melody, soft tapped frame drum, A Aeolian, about 70 bpm. Vast, cold, pure, a sense of old oaths in the ice. | Snowbound night. Glassy string harmonics, slow solo cello, wind-soft flute breath, very sparse bells, A minor, about 54 bpm, hushed and endless. |
| Amberfall | Ancient autumn forest of falling amber leaves. Warm harp, nylon-string-like lute and cello, a nostalgic English horn melody, light brushed hand percussion, F major with gentle minor turns, about 84 bpm. Golden, bittersweet, deep old trees. | Autumn forest night. Soft low strings, slow harp, an alto flute melody, faint wooden creaks of percussion, D minor, about 60 bpm, leaves drifting in moonlight. |
| Willowfen | Magical willow wetlands. Flowing harp arpeggios, soft clarinet and flute in thirds, gentle pizzicato strings, small chimes, E-flat major, 6/8, about 80 bpm. Graceful, enchanted, green light through hanging branches. | Willow wetland night. Twinkling small bells, slow harp, very soft choir pad, a gentle flute lullaby line, C minor, about 58 bpm, glowing insects over still water. |
| Nightbloom | Moonlit supernatural land of glowing flowers. Ethereal wordless female choir, celesta, harp, slow string chords, a floating solo violin, F-sharp Lydian, about 64 bpm. Beautiful and strange, memories drifting like pollen. | Deep moonlit night among glowing flowers. Barely there: high string harmonics, soft glass bells, a distant hummed choir chord, about 50 bpm, otherworldly calm. |
| Wraithwood | Ancient haunted forest of guardian spirits. Low strings in slow tremolo, a solemn cello melody, distant soft choir, hollow wooden percussion, B minor, about 68 bpm. Reverent and eerie, ghosts of old heroes among enormous trees. | Haunted forest at night. Whispering bowed textures, a slow bass clarinet, one lonely high violin line, faint low choir, B minor, about 52 bpm, chilling but quiet. |
| Palmreach | Tropical coast with ancient ruins and trading ports. Marimba and plucked strings, bright flute melody, hand drums and shakers in a relaxed groove, A major with a Mixolydian lift, about 100 bpm. Sun, surf, adventure and treasure. | Tropical night. Soft marimba, gentle hand drum, a mellow wooden flute, warm string pad, F-sharp minor, about 70 bpm, warm breeze and distant ruins. |
| Evergarden | An unnaturally perfect paradise garden. Sweet music-box-like celesta, harp and flutes in simple, too-perfect C major phrases, soft strings, about 76 bpm. Pleasant on the surface, with subtle harmonic wrongness creeping in: a repeated phrase that never resolves, a held note slightly out of place. | Paradise garden at night. A slow music-box melody that gradually slows, soft strings holding unresolved chords, C major turning ambiguous, about 56 bpm, serene and unsettling. |
| Galecrest | Storm highlands with ancient structures suspended over valleys. Driving low strings ostinato, soaring horns and violins, powerful frame drums, D Dorian, about 108 bpm. Wind, height and old engineering marvels, heroic and exhilarating. | Storm highlands at night. Low rumbling drums far away, sustained horns, a solo fiddle melody in the wind, D minor, about 64 bpm, lightning over distant ruins. |
| Southern Reaches | Warm southern frontier of open grasslands and dusty roads. Plucked lute, bowed fiddle, low whistle and a steady walking hand drum, A Mixolydian, about 96 bpm. Wide horizons, caravans and far travel. | Southern frontier night. Campfire-quiet solo lute, soft cello, distant flute, A minor, about 62 bpm, stars over open plains. |

## Towns

| Town | Day | Night |
|---|---|---|
| Eastbrook | Village town theme for a welcoming market village of crooked cottages, an inn, workshops and cobbled streets. Bouncy fiddle melody with accordion-like reed and tin whistle, plucked lute rhythm, light frame drum and wooden spoons-like clicks, D major, 2/4 polka-like lilt, about 112 bpm. Cheerful bustle, merchants and bakers, a little humour, with a warm, slower middle section on cello and harp. | The same village at night, lanterns in windows. Slow solo fiddle playing a gentle version of a cheerful village tune, harp chords, soft cello, a low whistle answer, D major turning to B minor, about 72 bpm. Cozy, quiet, safe behind shutters. |
| Fenbridge | Marsh town of stilt houses and wooden walkways. Lazy swaying clarinet and button accordion-like reed melody, plucked double bass, brushed frame drum, a banjo-like plucked lute, G minor with major lifts, 3/4, about 92 bpm. Cheerfully gloomy, eccentric locals, welcoming once they trust you. | Marsh town at night. Slow clarinet, soft accordion-like reed chords, quiet plucked bass, lantern glow over mist, G minor, about 66 bpm. |
| Highwatch | Mountain mining town with forges and stone halls. Sturdy low strings, horn melody, rhythmic hammer-on-anvil metallic percussion, fiddle counter-melody, E minor turning to G major, 4/4, about 100 bpm. Proud, hard-working, warm hearths. | Mountain town at night. Low horn and cello, soft distant anvil taps, warm harp, E minor, about 64 bpm, embers of forges cooling. |
| Goldcrest Harbor | Grand harbor capital city of merchants and guilds. Stately strings and brass, bright woodwinds, harpsichord-like plucked keyboard, tambourine and frame drum, B-flat major, 4/4, about 108 bpm. Prosperous, busy docks, banners and gulls. | Harbor capital at night. Soft strings, gentle plucked keyboard, a lyrical oboe melody, lapping-water calm, G minor, about 68 bpm, lamplit quays. |

## Combat layers

One battle layer per region family plus the Pale Accord. A fight crossfades from the
exploration theme to its family's layer in about a third of a second and hands back at the
zone fade when it ends; the layer loops without a gap for as long as the fight lasts.

| Layer | Plays in | Sound |
|---|---|---|
| pastoral | Proving Shore, Eastbrook Vale and town, Farshore, Amberfall, Evergarden | Exciting field battle in green countryside. Fast driving fiddles and low strings ostinato, punchy frame drums and taiko-like low drums, horn stabs, D minor, about 140 bpm. Energetic and adventurous, not grim. |
| marsh | Mirefen, Willowfen, Fenbridge, the Sunken Bastion | Battle in a misty marsh. Urgent low clarinets and plucked double bass ostinato, rattling wooden percussion, staccato strings, D Phrygian, about 132 bpm, tense and murky but energetic. |
| highland | Thornpeak, Drakelands, Galecrest, Highwatch, the forge approach | Mountain and forge battle. Heavy anvil-like metal percussion, big frame drums, low brass riffs, fierce fiddles, E minor, about 138 bpm, powerful and heroic. |
| frost | Frostveil, frost rifts | Battle in frozen wilds. Icy tremolo strings, sharp bell accents, pounding low drums, horn calls, A minor, about 136 bpm, cold and urgent. |
| eerie | Veiled Hollow, Wraithwood, Nightbloom, the crypts, bone and void rifts | Battle against spirits and haunted things. Agitated tremolo strings, low choir stabs, eerie glassy harmonics, pounding drums, B minor, about 132 bpm, frightening but exciting. |
| wild | Palmreach, Goldcrest Harbor, venom rifts | Battle in tropical and wild lands. Rapid hand drums and marimba ostinato, bold brass, fast flute runs, F-sharp minor, about 140 bpm, wild and thrilling. |
| pale_accord | any fight against a Pale Accord foe (mob templates `pale_accord_*`) | Battle against a secretive cult of scholars. Dark low woodwinds (bassoons, bass clarinet, contrabassoon), cold string clusters, a stern low choir chant on vowels, relentless timpani, C minor with chromatic menace, about 128 bpm. Sinister and driven. |

A place outside every family (the storm, brute and tide rifts, the raid set pieces) keeps the
remastered battle themes.

## Dungeons and bosses

| Cue | Sound |
|---|---|
| wyn_dungeon_hollow_crypt | Exploring a dusty crypt under a village. Slow low strings, distant tolling bell, muted horn, dripping harp notes, soft low choir hum, D minor, about 64 bpm, spooky but storybook rather than horror. |
| wyn_dungeon_sunken_bastion | A drowned sea fortress full of bells beneath the tide. Underwater-feeling slow string swells, muffled deep bells, low horn, harp ripples, F minor, about 60 bpm. |
| wyn_dungeon_drowned_temple | A flooded marsh temple of forgotten shrines. Soft chant-like choir on vowels, slow bass clarinet, dripping celesta, low drone, D Phrygian, about 58 bpm, sacred and eerie. |
| wyn_dungeon_last_keep | A ruined iron fortress of an empty crown. Martial low snare-like frame drum, sombre brass chorale, low strings, E minor, about 72 bpm, faded glory and steel. |
| wyn_dungeon_dawnhold_castle | A misty castle of a hidden kingdom. Melancholic royal strings, harp, a noble horn theme in minor, soft choir, B minor, about 70 bpm, beautiful decay. |
| wyn_dungeon_gravewyrm_sanctum | An ash and ice sanctum where a sleeping crown lies. Deep low brass drones, cold string tremolo, slow heavy drums, distant choir, C minor, about 62 bpm, dread. |
| wyn_dungeon_wildheart_basin | The heart of the old wild, final campaign dungeon. Living, breathing textures: hand drums like a heartbeat, swelling strings, wooden flutes, warm choir, A minor rising to C major, about 76 bpm, primal and hopeful. |
| wyn_dungeon_ancient_forge | The ancient forge raid halls. Rhythmic hammer and anvil percussion, enormous low brass, molten-slow low strings, choir, C Phrygian, about 84 bpm, colossal. |
| wyn_boss_dungeon | Dungeon boss battle. Powerful full orchestra with choir: pounding timpani and big drums, low brass riffs, fierce fast strings, a heroic horn countermelody, D minor, about 150 bpm, climactic and exciting. |
| wyn_boss_pale_accord | Boss battle against the leader of a secret cult who broke an ancient promise. Dark low choir chanting on vowels, chromatic low woodwinds, hammering timpani, stabbing strings, organ-free, C minor, about 144 bpm, sinister grandeur. |
| wyn_boss_raid_dragon | Raid battle against a great dragon. Massive brass, thunderous drums, full choir, racing strings, E minor, about 152 bpm, epic and overwhelming but heroic. |
| wyn_boss_final | Final campaign battle to restore an ancient binding promise. Begins dark and driving, full orchestra and choir, then the hopeful main title melody bursts through in the horns over the battle rhythm, D minor to D major, about 146 bpm. |

Every dungeon id maps to its own cue in `SCORE_INSTANCE_DUNGEONS` (the Last Keep and Dawnhold
Castle included, though they share the crypt's music zone). The Drowned Temple and the
Wildheart Basin rows wait for those dungeons' ids to ship.

A boss with its own bespoke fight track (`BOSS_TRACK_URLS`, the boss remasters) keeps it.
Every other boss fights to `wyn_boss_dungeon`; the raid dragon (the Thornpeak raid arena and
Korzul the Gravewyrm) to `wyn_boss_raid_dragon`; a Pale Accord leader to
`wyn_boss_pale_accord`. `wyn_boss_final` is the finale of the first campaign: it is generated
and waits for the campaign's last boss template to be named in `SCORE_BOSS_TEMPLATES`.

## Title, home and stingers

| Cue | Sound |
|---|---|
| wyn_title | Main title theme. Opens with a lone wooden flute over a soft harp, a hopeful rising melody in D major with a Mixolydian lowered seventh that gives it an old-world folk colour. Warm strings enter, then a gentle hand drum and a hammered dulcimer; the theme grows into a broad, heartfelt full statement with horns and a wordless light choir, like the first sight of a green valley at sunrise. Middle section turns briefly to a hushed minor-key reflection with low clarinet hinting at danger beyond the lanterns, then returns to the main melody, fuller and brighter. Moderate tempo, about 84 bpm, 3/4 swaying feel. Ends on a sustained warm chord. |
| wyn_charselect | Calm character selection music. The main melody of a hopeful D Mixolydian folk theme played quietly by solo harp and cello, with soft sustained strings and an occasional wooden flute answer. Intimate, patient, like a fire in an inn before a journey. Slow tempo, about 70 bpm. |
| wyn_home_day | Cozy music for inside your own cottage. Warm solo acoustic lute and harp, soft cello, a gentle wooden flute melody, light brushed percussion, F major, about 78 bpm. Homely, content, a kettle on the hearth and sunlight through the window. |
| wyn_home_night | Your cottage at night by the fire. Very soft solo harp and celesta, warm low strings, slow flute, F major, about 60 bpm, sleepy and safe. |
| wyn_sting_quest_complete | Short triumphant folk fanfare: bright fiddle and flute flourish with a harp glissando and a warm major chord on strings and horn, ending cleanly. |
| wyn_sting_level_up | Short rising celebratory fanfare: ascending harp and bells, horns and strings swelling to a bright D major chord with a soft choir "ah", ending cleanly. |
| wyn_sting_discovery | Short wonder sting for discovering a new place: soft shimmering harp and celesta rising, a gentle horn phrase, an open warm chord, ending cleanly. |
| wyn_sting_death | Short sombre sting for a fallen hero: low cello and soft choir descending to a quiet minor chord, a single distant bell, ending in silence. |
| wyn_sting_deed | Short proud accomplishment sting: two bright horn notes and a quick fiddle run over a frame drum roll, a warm major chord, ending cleanly. |
| wyn_sting_home_key | Short heart-warming sting for receiving the key to your own home: gentle harp, solo flute and warm strings, a tender major cadence, ending cleanly. |

The title theme states the main melody (a hopeful D Mixolydian folk tune); the character
select cue, the home cues and the campaign finale all quote it. The title and character
select cues are generated and shipped in the table, but the front end (login and character
select) does not play them yet: that screen has no music player of its own, and wiring one is
a follow-up for the front-end owner.

Stingers ring over a short duck of the score (to 40 percent) and never stack: at most one,
and none within 4 s of the last. They read the world, not the HUD:

- **Quest complete:** the finished quest count goes up by one to three.
- **Level up:** the player's level goes up.
- **Discovery:** the score arrives in a region not heard yet this session (the first region
  after logging in is not a discovery).
- **Death:** the player dies.
- **Deed:** a Book of Deeds entry is earned.
- **Home key:** the player comes to own a house.

A first reading, or a jump of more than three (the login snapshot filling the mirror), only
re-baselines. The highest of the list wins when two land together (a turn-in that levels you
rings the level fanfare). The interface cues (`audio.levelUp()` and friends) still play on
the Sound Effects bus; the musical sting sits over them on the Music bus.

## In-world songs

Sung by the people of Wyndlewood, with lyrics written for the game. They play where they
are sung, through the score's own slot (they are music, not positional sound effects).

| Song | Where it is sung | Style |
|---|---|---|
| Kettle Before the Candle (`wyn_song_kettle_before_the_candle`) | The Copper Kettle Inn, Eastbrook | lively tavern folk singalong; fiddle, button accordion, tin whistle, plucked lute, frame drum, stomping feet; warm mixed tavern voices, a cheerful female lead with a group chorus |
| It Usually Is (`wyn_song_usually_is`) | The Mirefen tavern on the Fenbridge road | swaying comic-gloomy tavern waltz; button accordion, clarinet, plucked upright bass, brushed frame drum; gravelly cheerful male baritone lead, a few patrons humming along |
| Raise the Beam (`wyn_song_raise_the_beam`) | Hearthwright work crews, housing and building sites | call and response work song; steady mallet and hammer percussion on the beat, fiddle drone, low hand drum; strong male lead caller with a group of workers answering |
| The Muddlecap Lullaby (`wyn_song_muddlecap_lullaby`) | A lullaby: the inn late at night, and your home at night | gentle folk lullaby; solo harp, soft wooden flute, a little warm cello; soft, tender solo female voice, close and intimate |
| Keep to the Road (`wyn_song_keep_to_the_road`) | A wandering bard at any inn; the ballad of the Lanternwardens | storytelling folk ballad; fingerpicked lute, fiddle, soft frame drum, low whistle; clear warm female storyteller voice, a few voices on the chorus |
| Hymn of the Five Witnesses (`wyn_song_five_witnesses`) | Shrines and the sacred places of the Five Kindly Witnesses | gentle sacred folk hymn; light mixed choir, soft strings, harp; slow, reverent, warm, spacious hall |

- **The Mirefen tavern** (the walk-in inn on the Fenbridge road): inside the common room the
  town or marsh theme gives way to the house repertoire. By day: It Usually Is, Kettle Before
  the Candle, Keep to the Road. By night the Muddlecap Lullaby joins them. The songs play in
  turn with a short breath of silence between them, like a bard between numbers. Kettle
  Before the Candle is the Copper Kettle's own song; Eastbrook's inn is not a walk-in yet, so
  until it is, the Mirefen house sings it as a song from up the road. When the Copper Kettle
  opens its doors, give it a `SCORE_VENUES` row of its own.
- **Home:** inside a house, Raise the Beam alternates with the home theme by day and the
  Muddlecap Lullaby with it by night.
- **The Hymn of the Five Witnesses** is generated and waits for the shrines: the sacred
  places have no world positions yet. When they land, add them as `SCORE_VENUES` rows.

## How the game plays it

The score rides the existing streamed soundtrack (`MusicDirector`, `src/game/music.ts`)
instead of replacing it. One rule decides everything: a place resolves to a **slot** (one
stream, keyed `score:...`) holding a pool of cues. If no cue of the pool has been generated,
the slot is null and the director plays the remastered zone stream exactly as before, so the
procedural score and its remasters stay the fallback for anything the score does not cover.

- **Where:** the music zone the HUD already resolves (`instanceMusicDecision`), refined by the
  zone id (a region of its own such as the Southern Reaches), the instance id (every dungeon
  gets its own cue, including the ones that share a music zone), a house lot's walk-in
  interior, and the venue rectangles. The ambience crew's region readout
  (`src/render/region_ambience_core.ts`) and the score agree because both follow the same
  zone table; the score borrows its day signal, `dayWeightForPhase`.
- **Day and night:** `dayWeightForPhase(currentDayNightPhase())` with hysteresis (night below
  0.35, day again above 0.65), so a dusk never flips a theme twice. While the world's
  `DAY_ONLY` pin holds noon, the night variants are heard only through `/daynight` in dev.
- **Crossfades:** every slot change crossfades on the director's own fades (exploration in
  about 0.7 s, out in 0.35 s; the battle layer in 0.35 s). An arrival plays from the top.
- **Silence gaps:** exploration, town, home, dungeon and song slots do not loop. When a cue
  ends the slot rests in silence, then plays its next pool cue: regions 45 to 110 s, towns 25
  to 60 s, homes 30 to 75 s, dungeons 15 to 35 s (their ambience beds carry the room), songs
  12 to 30 s. Battle layers loop without a gap.
- **Volume and mute:** every score stream and stinger routes through the director's master
  gain, so the music toggle, the music volume slider, the menu fade and the boss duck apply
  unchanged. A muted player downloads nothing (elements are made on first audible use).
- **Streaming residency:** cues stream as progressive media elements, never decoded whole.
  At most four score streams stay resident: a silent one is released (its buffered media
  dropped) once it has been silent 30 s and newer ones need the room.
- **The procedural score:** `music.ts` stays the authoring source of the remasters and the
  music editor; nothing about it changed (it is a monolith ratchet target: the score lives
  in sibling modules and `music.ts` did not grow by a line).

The layer switches on only on the HUD path (the input carries the day phase), so the editor,
the RL env and every existing test of the director hear exactly the old behaviour.

## Track list and cost

Requested lengths by group (the shipped lengths, per take, are in the generated ledger):

| Group | Cues | Minutes | Credits at 825 per minute |
|---|---|---|---|
| title | 2 | 4.0 | 3300 |
| region | 32 | 46.0 | 37950 |
| town | 8 | 13.4 | 11069 |
| combat | 7 | 8.2 | 6737 |
| dungeon | 8 | 13.3 | 11000 |
| boss | 4 | 6.0 | 4950 |
| home | 2 | 3.2 | 2681 |
| stinger | 6 | 0.6 | 495 |
| song | 6 | 13.2 | 10890 |
| total | 75 | 108.0 | 89072 |

The rate was measured on the paid Creator plan (about 825 credits per output minute). The
ledger records each take's measured cost; a few read high or unknown because another crew
spent on the shared account in the same seconds.

## Adding or replacing a cue

1. Add or edit the cue in `scripts/music/wyndle_music_plan.mjs` (instrumentation, mood,
   tempo, mode and form only; fresh lyrics for a song; an exact-phrase check of a new title).
2. From a PC runner (the key loads from `.env` there and is never printed):
   `powershell -File scripts/music/run_music.ps1 -Mode generate -Extra "--only <key>"`. To
   replace a take, move its raw file out of `tmp/music-takes/` first.
3. `node scripts/music/eleven_music.mjs build` loudness-matches the take into
   `public/audio/music/wyn/`, regenerates `src/game/music_score_tracks.generated.ts` and the
   ledger. A new place needs its routing row in `src/game/music_score.ts`.
4. `npx vitest run tests/music_score.test.ts tests/music_score_layer.test.ts`.

## Asset rights: the inherited soundtrack is gone

Under the owner's asset-rights decision (docs/launch/asset-rights-inventory.md, music crew)
every inherited music file was removed: the upstream streamed remasters in
`public/audio/music/*.mp3` (zones, towns, dungeons, battle themes, minigames, the
Gourdlight Eve theme), the per-boss cues including Morthen's, the four Crucible floor
productions, the Ignivar raid suite, the Proving Shore island cue and its audition
candidates, the home-page `main-theme.mp3` and the shared `dungeon-boss-fight.mp3`.

- Every zone, rift, Ignivar room and battle theme streams a score cue
  (`ZONE_STREAM_CUES` and `COMBAT_STREAM_URLS` in `src/game/music_tracks.ts`).
- Every boss with a track of its own now fights to a score boss cue (`BOSS_TRACK_CUES` in
  `src/game/boss_music_loop.ts`): the risen dead to `wyn_boss_undead`, the old wild's
  beasts to `wyn_boss_wild`, Korzul to `wyn_boss_raid_dragon`, the rest to
  `wyn_boss_dungeon`.
- The Crucible floors (`CRUCIBLE_FLOOR_CUES`): the forge halls, `wyn_crucible_heart`,
  `wyn_crucible_assembly` and the campaign finale `wyn_boss_final`.
- The world-quest minigames (`MINIGAME_MUSIC_CUES`): `wyn_minigame_tense` for the quick,
  timed ones and `wyn_minigame_playful` for the careful ones.
- Gourdlight Eve plays `wyn_town_gourdlight`.
- The home page plays the title theme and the shared boss loop the dungeon boss cue, built
  in place over `public/audio/main-theme.mp3` and `public/audio/dungeon-boss-fight.mp3` so
  their stable paths and loaders did not change.
- The interface level-up chime now stands down while the score's level-up sting rings
  (`claimScoreStinger`), so the two never double; with music off the chime still plays.

The seven new cues were generated on the paid plan from original prompts (the ledger has
them), described by instrumentation, mood, tempo and mode only, with no reference to the
removed tracks.
