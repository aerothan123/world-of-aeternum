# ElevenLabs provenance ledger

Every sound this fork generated with the ElevenLabs Sound Effects API, with the date and the
account plan tier it was generated on. ElevenLabs' terms give free-tier output no commercial
rights, and upgrading later does not cure it, so **every shipped file must be paid-plan output**.
As of 2026-11-04 it is: all 36 ElevenLabs files this branch ships (28 region ambience beds and
the 8 gathering clips) were generated on the paid Creator plan.

Dates are the generating machine's local date (America/Denver). Each take is also stamped
automatically, with the tier the API reported at the time, in the `takes.json` beside it:
`scripts/sfx/sources/ambience/takes.json` and `scripts/sfx/sources/gather/takes.json`.

Assets inherited from upstream World of ClaudeCraft (the original `scripts/sfx/sfx_prompts.mjs`
catalog and the other rows in `CREDITS.md`) were generated on the upstream maintainers' own
accounts and are out of scope here. Soundtrack and song renders made by the music crew live on
their own branch and are ledgered there; add their rows here when the branches meet.

## Shipped files (all paid plan)

| Asset (shipped file) | Raw take | Prompt source | Generated | Plan tier |
|---|---|---|---|---|
| `amb_bed_{shore,town_day,town_night,meadow,forest,marsh}.mp3` (Phase A beds) | `scripts/sfx/sources/ambience/<key>.source.mp3` | `scripts/sfx/ambience_bed_prompts.mjs` via `scripts/sfx/ambience_beds_sfx.mjs` | 2026-11-04 (regenerated) | Creator |
| `amb_bed_{night_wild,peaks,harbor,cave,crypt,temple,jungle,frost,ember,haunt,garden,amber,gale,dusk}.mp3` (Phase B beds) | same folder | same | 2026-11-04 (regenerated) | Creator |
| `amb_bed_{wildheart,castle,palace,bastion,forge,lair,mine,house}.mp3` (Phase C interiors) | same folder | same | 2026-11-04 | Creator |
| `impact_gather_pick_{1,2}.mp3` (the layered rock pick) | `scripts/sfx/sources/gather/variants/quarry/impact_gather_pick_cand_{1,5}.mp3`, `variants/rock/impact_gather_pick_cand_4.mp3` (attack and body layers, built per `GATHER_STRIKE_PROMPTS` `layers`) | `scripts/sfx/gather_strike_prompts.mjs` (the `quarry` and `rock` styles) via `scripts/sfx/gather_strike_sfx.mjs` | 2026-11-04 (regenerated) | Creator |
| `impact_gather_axe_{1,2}.mp3` (the heavy axe) | `scripts/sfx/sources/gather/impact_gather_axe_{1,2}.source.mp3` | same (the `heavy` axe prompt) | 2026-11-04 (regenerated) | Creator |
| `impact_tree_creak_{1,2}.mp3`, `impact_tree_crash_{1,2}.mp3` | `scripts/sfx/sources/gather/impact_tree_{creak,crash}_{1,2}.source.mp3` | same | 2026-11-04 (regenerated) | Creator |

How the regenerated files were chosen:
- **Ambience beds:** one take per bed with the unchanged prompt, delivered at 192 kbps. A take
  that came back near silent was retried once (dusk). Each bed's runtime gain
  (`REGION_BED_GAINS`) was rescaled by the change in its master's loudness, so the in-game mix
  holds.
- **Gathering clips:** the same prompts and durations, with a few more candidates per pool than
  the free-tier audition (quarry 8, rock 10, heavy axe 6, creak 6, crash 6). Each master is the
  candidate measured closest to the take it replaces. Closeness is a mean log-band
  spectro-temporal distance. The pick layers were compared master to master. The axe, creak
  and crash were compared on their built, shipped form, so trims and lengths match too. The
  distances are recorded per file in the gather `takes.json`. The gain-map trims
  (`scripts/sfx/sfx_gain_map.json`) are unchanged, except the pick: its +5 dB trim drops to
  +4.9 dB to stay under the gain ceiling recomputed from the new, slightly hotter takes.

## Retired free-tier output (not shipped)

These were generated on the free tier on 2026-11-04 and are no longer in the tree. Copies are
kept outside the repository on the build PC
(`C:\Users\cdero\Apps\woa-ambience-work\free_tier_archive\`), for reference only, never to ship.

| What | Count |
|---|---|
| Ambience beds, Phase A and B (raw takes and the shipped loops they built) | 20 beds (21 raw takes, counting one discarded near-silent take) |
| Gathering clips (shipped) and the raw generations behind them: 6 masters and 47 audition candidates (crunchy, heavy, punchy, quarry, ringing, rock) | 8 clips, 53 raw takes |

They remain in this branch's git history (feature/ambience a84576ca and 207f052c,
feature/gather-audio 0ce6a049 to 0199c17c). Removing them from history as well would need a
history rewrite, which is a maintainer decision. The audition records
`scripts/sfx/sources/gather/variants/{kept,layered,rock}.json` now name only the three paid
layer masters the shipped pick is built from. The other `styles-*` audition modes need a fresh
`styles-generate` before they can run again.

## Adding or regenerating a take

From a PC runner that loads the key from `.env` without printing it:
- **Ambience:** move the raw take out of `scripts/sfx/sources/ambience/`, then run
  `node scripts/sfx/ambience_beds_sfx.mjs generate --only <key>`. It stamps `takes.json`.
  Then run `build --only <key>` and `npm run sfx:manifest`, and re-check the bed's
  `REGION_BED_GAINS` entry against the build log's final loudness.
- **Gathering:** use `gather_strike_sfx.mjs` (generate, select, build), then record the new
  master in `scripts/sfx/sources/gather/takes.json`.
