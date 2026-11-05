# ElevenLabs provenance ledger

Every sound this fork generated with the ElevenLabs Sound Effects API, with the date and the
account plan tier it was generated on. The account was on the FREE tier (no commercial-use
rights) through the evening of 2026-11-04, then moved to the paid Creator plan. Anything listed
under the free tier must be regenerated on the paid plan (or its terms confirmed to cover it)
before a commercial release. Regeneration is reproducible: every prompt lives in the script
named per row, and each script skips takes that already exist, so move the raw take aside and
rerun.

Dates are the generating machine's local date (America/Denver). Ambience takes from Phase C on
are also stamped automatically, with the tier the API reported at the time, in
`scripts/sfx/sources/ambience/takes.json`.

Assets inherited from upstream World of ClaudeCraft (the original `scripts/sfx/sfx_prompts.mjs`
catalog and the other rows in `CREDITS.md`) were generated on the upstream maintainers' own
accounts and are out of scope here. Soundtrack and song renders made by the music crew live on
their own branch and are ledgered there; add their rows here when the branches meet.

## Free-tier count

**28 shipped files are free-tier output**: the 8 gathering strike clips and 20 region ambience
beds below. Behind them sit 74 raw generations (53 gathering takes and candidates, 21 ambience
takes including one discarded near-silent take). Regenerating all 20 beds costs one 30 s
request each; the gathering clips need a fresh audition round, since the picks were chosen by
ear and the rock pick is a layered build of two candidates.

## Free tier

| Asset (shipped file) | Raw take or candidates | Prompt source | Generated | Plan tier |
|---|---|---|---|---|
| `impact_gather_pick_{1,2}.mp3`, `impact_gather_axe_{1,2}.mp3`, `impact_tree_creak_{1,2}.mp3`, `impact_tree_crash_{1,2}.mp3` (branch feature/gather-audio, merged into feature/player-housing) | `scripts/sfx/sources/gather/`: 6 masters (`*.source.mp3`) and 47 audition candidates under `variants/` (crunchy, heavy, punchy, quarry, ringing, rock; the pick picks in `variants/kept.json`, `layered.json`, `rock.json`) | `scripts/sfx/gather_strike_prompts.mjs` via `scripts/sfx/gather_strike_sfx.mjs` | 2026-11-04 | Free |
| `amb_bed_shore.mp3` | `scripts/sfx/sources/ambience/amb_bed_shore.source.mp3` | `scripts/sfx/ambience_bed_prompts.mjs` via `scripts/sfx/ambience_beds_sfx.mjs` | 2026-11-04 | Free |
| `amb_bed_town_day.mp3` | `scripts/sfx/sources/ambience/amb_bed_town_day.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_town_night.mp3` | `scripts/sfx/sources/ambience/amb_bed_town_night.source.mp3` (second take; the first, near silent, was discarded) | same | 2026-11-04 | Free |
| `amb_bed_meadow.mp3` | `scripts/sfx/sources/ambience/amb_bed_meadow.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_forest.mp3` | `scripts/sfx/sources/ambience/amb_bed_forest.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_marsh.mp3` | `scripts/sfx/sources/ambience/amb_bed_marsh.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_night_wild.mp3` | `scripts/sfx/sources/ambience/amb_bed_night_wild.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_peaks.mp3` | `scripts/sfx/sources/ambience/amb_bed_peaks.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_harbor.mp3` | `scripts/sfx/sources/ambience/amb_bed_harbor.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_cave.mp3` | `scripts/sfx/sources/ambience/amb_bed_cave.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_crypt.mp3` | `scripts/sfx/sources/ambience/amb_bed_crypt.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_temple.mp3` | `scripts/sfx/sources/ambience/amb_bed_temple.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_jungle.mp3` | `scripts/sfx/sources/ambience/amb_bed_jungle.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_frost.mp3` | `scripts/sfx/sources/ambience/amb_bed_frost.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_ember.mp3` | `scripts/sfx/sources/ambience/amb_bed_ember.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_haunt.mp3` | `scripts/sfx/sources/ambience/amb_bed_haunt.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_garden.mp3` | `scripts/sfx/sources/ambience/amb_bed_garden.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_amber.mp3` | `scripts/sfx/sources/ambience/amb_bed_amber.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_gale.mp3` | `scripts/sfx/sources/ambience/amb_bed_gale.source.mp3` | same | 2026-11-04 | Free |
| `amb_bed_dusk.mp3` | `scripts/sfx/sources/ambience/amb_bed_dusk.source.mp3` | same | 2026-11-04 | Free |

## Paid plan (Creator)

Delivered at 192 kbps (`mp3_44100_192`, a paid-tier format), mastered and shipped at 128 kbps
like the rest of the beds.

| Asset (shipped file) | Raw take | Prompt source | Generated | Plan tier |
|---|---|---|---|---|
| `amb_bed_wildheart.mp3` | `scripts/sfx/sources/ambience/amb_bed_wildheart.source.mp3` | `scripts/sfx/ambience_bed_prompts.mjs` via `scripts/sfx/ambience_beds_sfx.mjs` | 2026-11-04 | Creator |
| `amb_bed_castle.mp3` | `scripts/sfx/sources/ambience/amb_bed_castle.source.mp3` | same | 2026-11-04 | Creator |
| `amb_bed_palace.mp3` | `scripts/sfx/sources/ambience/amb_bed_palace.source.mp3` | same | 2026-11-04 | Creator |
| `amb_bed_bastion.mp3` | `scripts/sfx/sources/ambience/amb_bed_bastion.source.mp3` | same | 2026-11-04 | Creator |
| `amb_bed_forge.mp3` | `scripts/sfx/sources/ambience/amb_bed_forge.source.mp3` | same | 2026-11-04 | Creator |
| `amb_bed_lair.mp3` | `scripts/sfx/sources/ambience/amb_bed_lair.source.mp3` | same | 2026-11-04 | Creator |
| `amb_bed_mine.mp3` | `scripts/sfx/sources/ambience/amb_bed_mine.source.mp3` | same | 2026-11-04 | Creator |
| `amb_bed_house.mp3` | `scripts/sfx/sources/ambience/amb_bed_house.source.mp3` | same | 2026-11-04 | Creator |

## Regenerating a free-tier bed on the paid plan

Move its raw take out of `scripts/sfx/sources/ambience/`, then from a PC runner that loads the
key from `.env` without printing it run `node scripts/sfx/ambience_beds_sfx.mjs generate --only
<key>` (it stamps `takes.json` with the date and tier), then `build --only <key>`,
`npm run sfx:manifest`, and move the row above to the paid table. A bed's runtime gain
(`REGION_BED_GAINS` in `src/render/region_ambience_core.ts`) follows its master's measured
loudness, so re-check it against the build log.
