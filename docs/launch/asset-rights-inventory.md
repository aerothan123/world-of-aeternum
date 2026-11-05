# Wyndlewood asset rights inventory

Base: `origin/feature/player-housing` at 64d84727 (2026-11-04). Machine-readable twin:
`docs/launch/asset-rights-inventory.json` (every CREDITS.md row with its class, matched files,
in-game use and replacement owner, plus the file-level 2D replacement list).

Owner decision (rights decision 1, 2026-11-04): replace every asset marked "No, permission
required", every CC BY-NC asset and every "With the project only" asset with original Wyndlewood
work. Nothing inherited and restricted ships. Ids stay stable: replacements land in place, at the
same paths, so no code path changes.

## Summary

| Class | CREDITS rows | Meaning |
|---|---|---|
| OK to ship | 41 | OK to ship (CC0, MIT, CC BY with attribution, OFL) |
| Wyndlewood original | 38 | made by the Wyndlewood fork (owner's accounts); OK to ship once provenance is recorded |
| Restricted: permission required | 140 | No, permission required (Levy Street rights reserved, CraftPix licence to Levy Street, owner-provided to Levy Street) |
| Restricted: CC BY-NC | 9 | CC BY-NC 4.0 (commercial grant to Levy Street only) |
| Restricted: with the project only | 174 | With the project only (upstream project art; replaced per owner decision) |
| Unlisted | see below | not listed in CREDITS.md (unrecorded, not free) |

Restricted files by replacement owner (file counts are from the tree; one file can be named by
several CREDITS rows, so the per-row counts in the JSON overlap and these are the de-duplicated
directory totals):

| Owner | What | Files |
|---|---|---|
| this crew (2D) | every icon, crest, painting, UI image, map plate, loading screen and website image listed in "2D replacement" | 3506 |
| weapons crew | Weapon portrait renders (public/ui/weapons/*.jpg), excluding the 25 fork-made gathering tool renders | 155 |
| creatures crew | Mob target portraits (public/ui/mobs/*.webp), renders of the shipped mob models | 360 |
| every 3D crew | Guide model stills (public/guide-stills/*.webp), renders of shipped models | 86 |
| core-systems crew (removal) | Claudium visual asset set and store art (public/claudium/, public/ui/store/) | 86 |
| steam-platform crew (rebrand) | World of ClaudeCraft logos and app icons (public/woc-logo*, public/worldofclaudecraft-logo*, favicons, icon-192/512, ... | 17 |
| ambience/audio crew (voices) | NPC voice lines with no CREDITS row (public/audio/voice/<npc>/, every folder except ignivar and varkhul) | 561 |
| characters crew | WOC player characters (all nine classes, both bodies, heads, armor, animation libraries) and the WOC skins and suits | see crew list |
| creatures crew | upstream creature, boss, mount and buddy models (Tripo, Meshy, contributor and Blender-built) | see crew list |
| weapons crew | starter, field, rare, epic, Lantern Hall, Armory and Claudium weapon models, held tomes | see crew list |
| props crew | Tidehold town kit and its looks, Eastbrook and Fenbridge kits, generated props, VFX kits, world textures, backdrops, sky HDRIs | see crew list |
| ambience/audio crew | @jamiecypher CC BY-NC sound effects (melee, footsteps, every mob voice, quest and level-up chimes, spells), upstream generated SFX, boss and NPC voice lines | see crew list |
| music crew | the upstream streamed soundtrack and boss cues | see crew list |

## Wyndlewood originals (keep, record provenance)

These rows were added by the fork, not inherited. They were written in the upstream template
("World of ClaudeCraft", "rights reserved"); this branch rewrites them as Wyndlewood rows.

| CREDITS row | AI provenance |
|---|---|
| Painted storybook ground textures (public/textures/terrain/Painted{Meadow,DryGrass,Dirt,Cobble,Sand, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Storybook world foliage models (public/models/foliage/{oak_1..oak_5,pine_1..pine_5,dead_1..dead_3,bu ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Storybook leaf-card atlases (Fable_LeafCards_Broadleaf, Fable_LeafCards_Conifer and ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Gathering strike sound effects (impact_gather_pick_{1,2}.mp3, impact_gather_axe_{1,2}.mp3, ... | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Outdoor reverb impulse responses (generated at runtime by src/game/outdoor_reverb_ir.ts) | deterministic |
| Generated weapon model + icon (sunpetal_sickle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (ironbark_axe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (mithril_mining_pick) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (arcanite_mining_pick) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (gathering_sickle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (handaxe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (ashwood_axe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (elderwood_axe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (garden_hoe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (clockreel_fishing_rod) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (bronze_hoe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (stormreel_fishing_rod) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (silverleaf_sickle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (tidewrought_fishing_rod) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (ironreel_fishing_rod) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (osmium_hoe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (felling_axe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (goldleaf_sickle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (evergarden_hoe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (thorium_mining_pick) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (bronze_sickle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (skysilver_hoe) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (copper_mining_pick) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (silverstream_fishing_rod) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (iron_mining_pick) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_ore_copper) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_ore_iron) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_ore_thorium) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_ore_depleted) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_herb_silverleaf) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_herb_goldleaf) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_herb_sunpetal) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated gather node model (node_herb_depleted) | AI-generated: Tripo under the owner's paid Tripo plan |

## AI-generated assets needing paid-plan provenance

- Tripo (models, text-to-image): the owner is on a paid Tripo plan (Max/Studio); every Tripo output
  the fork made, including this crew's 2D replacements, is owned under that plan. Record the task
  ids (this branch keeps them in `scripts/assets/wyndlewood_2d/ledger/`).
- ElevenLabs: the gathering strike sounds (`impact_gather_*`, `impact_tree_*`) and the
  `feature/ambience` and `feature/music` Phase A and B beds were generated while the account was on
  the FREE tier. ElevenLabs says free-tier output carries no commercial licence and upgrading does
  not cure it: regenerate them on the paid plan before release (ambience and music crews).
- OpenAI, Gemini and Meshy outputs in CREDITS.md were all made by upstream on upstream accounts:
  they are not ours and are in the restricted lists below.
- Steam content survey: disclose pre-generated AI content (Tripo, ElevenLabs).

## 2D replacement (this crew)

Replaced in place with original painted Wyndlewood art from Tripo text-to-image (original text
prompts only, no reference images), through each family's own converter (`npm run assets:items`,
`assets:skills`, `assets:deeds`, `assets:professions`, `assets:chrome`) and its `mapping.json`.

| Directory | What | Used in game | Files |
|---|---|---|---|
| `public/ui/skills/` | Class ability and talent icons (CraftPix set, WoC generated, owner-provided) | action bars, spellbook, talent tree, cast bars, tooltips | 495 |
| `public/ui/auras/` | Buff and debuff paintings | unit frame buff and debuff rows, tooltips | 130 |
| `public/ui/items/` | Item paintings (armor, weapons, consumables, reagents, quest items, bags) | bags, bank, character sheet, loot, vendors, mail, auction, tooltips | 2209 |
| `public/ui/deeds/` | Book of Deeds crests | Book of Deeds window, deed toasts | 356 |
| `public/ui/professions/` | Professions 2.0 art set | profession window, trainers, archetype picker | 26 |
| `public/ui/chrome/` | HUD launcher icons | HUD side rail and mobile bar | 20 |
| `public/ui/specs/` | Specialization emblems | talent spec picker, character sheet | 27 |
| `public/ui/crests/` | Creature family and status crests | target frame, tooltips, guide | 17 |
| `public/ui/map-markers/` | Map and minimap marker paintings | world map, minimap | 29 |
| `public/ui/currency/` | Currency paintings | money and token displays | 9 |
| `public/ui/ranks/` | Elite dragon rank emblem | elite target portrait frame | 1 |
| `public/ui/leaderboard/` | Podium medals | leaderboards | 3 |
| `public/ui/delve-affixes/` | Delve affix paintings | delve affix tooltips and aura row | 6 |
| `public/ui/status/` | Status paintings | aura row | 3 |
| `public/ui/procs/` | Proc paintings | proc alerts | 3 |
| `public/ui/fiesta/` | Fiesta augment and power-up paintings | Fiesta mode HUD | 24 |
| `public/ui/minigames/` | Minigame boards and hardware | Confection Cascade and Ley Beam minigames | 15 |
| `public/ui/weekly/` | Weekly activity paintings | weekly planner | 9 |
| `public/ui/weekly-vault/` | Weekly Vault doors | Weekly Vault window | 3 |
| `public/ui/world-quests/` | World quest leaderboard paintings | world quest leaderboard | 9 |
| `public/ui/dungeons/` | Dungeon finder paintings | dungeon finder | 28 |
| `public/ui/dungeon-scenes/` | Dungeon selection scenery | dungeon finder | 4 |
| `public/ui/emotes/` | Emote paintings | emote wheel | 13 |
| `public/ui/classes/` | Class crests | character creation, class picker | 9 |
| `public/ui/cursors/` | Cursor images | mouse cursor | 8 |
| `public/ui/portraits/` | Buddy portraits | buddy frame | 5 |
| `public/ui/daily-rewards/` | Daily reward painting | daily rewards window | 1 |
| `public/ui/courier/` | Courier painting | courier window | 1 |
| `public/ui/reliquary/` | Reliquary paintings | Reliquary window | 1 |
| `public/map_art/` | Zone map overlays and the continent plate | world map | 17 |
| `public/textures/loading/` | Loading-screen artwork | loading screens | 11 |
| `public/website-` | Website portal, gateway, scroll, hero and feature art | landing page and website (public/ is deployed verbatim) | 14 |
| total | | | 3506 |

Not repainted here (renders of models, they follow the model): `public/ui/weapons/` (weapons
crew re-renders), `public/ui/mobs/` (creatures crew re-renders), `public/guide-stills/` (every 3D
crew re-renders). Store and Claudium art goes with the store code (core-systems). Logos and app
icons are the rebrand (steam-platform). The upstream concept and turnaround sheets under `docs/`
are not loaded by the game; they must not ship in a build and should leave the repo.

## Restricted CREDITS rows by replacement owner

Line numbers are CREDITS.md lines at the base commit. "Files" is the number of tree files the
row's paths and ids match (the JSON lists them).

### Characters crew

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 99 | WOC player characters (all nine classes, both body types: public/models/chars/players/woc/ (a base and an ... | permission | 102 | `public/models/chars/players/woc/anims_female.glb` | every player character and NPC on the WOC rig |
| 317 | Generated class skin-suit set "Prismatic Vanguard" (suit_prismatic, all classes, ... | project only | 7 | `public/textures/skins/barbarian/alt_suit_prismatic.png` | see asset text |
| 318 | Generated class skin-suit set "Liquid Chrome" (suit_chrome, all classes, ... | project only | 7 | `public/textures/skins/barbarian/alt_suit_chrome.png` | see asset text |

### Creatures crew

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 125 | Laverock walking and running animation bank (public/models/creatures/temple_laverock_locomotion.glb) | project only | 1 | `public/models/creatures/temple_laverock_locomotion.glb` | mobs and bosses in the world and dungeons |
| 144 | Gourdlight Eve field boss and mount (public/models/creatures/gourdlight_{thatchgrin,strawling,swelling_gourd}. ... | project only | 4 | `public/models/creatures/gourdlight_strawling.glb` | mobs and bosses in the world and dungeons; rideable mounts |
| 202 | Meshy creature models (tolling_bell, spider_egg_sac from the Drowned Litany, yumi_cat from Protect Yumi, in ... | project only | 211 | `public/models/creatures/alpaca.glb` | mobs and bosses in the world and dungeons |
| 265 | Owner-provided Mage artwork (fireball_form.webp, counterspell.webp) | permission | 2 | `public/ui/skills/mage/counterspell.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 276 | Rideable mount models (valorsteed, grag_bear, stalkglider_snail, aether_hover_cycle, shadowjump_toad, ... | project only | 25 | `public/models/mounts/aether_hover_cycle.glb` | rideable mounts |
| 277 | Drakemaw Raptor mount (public/models/mounts/drakemaw_raptor.glb, also the Friendship Raptor's body) | project only | 1 | `public/models/mounts/drakemaw_raptor.glb` | rideable mounts |
| 278 | Dreadspark Groundshaker rideable mount model (public/models/mounts/terrorspark_groundshaker.glb) | permission | 1 | `public/models/mounts/terrorspark_groundshaker.glb` | rideable mounts |
| 281 | Lanternback Troll rideable mount model (public/models/mounts/lanternback_troll.glb) | permission | 1 | `public/models/mounts/lanternback_troll.glb` | rideable mounts |
| 290 | Wobbles the Slime rideable mount model (public/models/mounts/wobbles_slime.glb) | project only | 1 | `public/models/mounts/wobbles_slime.glb` | rideable mounts |
| 300 | Drowned Temple creatures (public/models/creatures/temple_*.glb except temple_ice_wraith.glb, credited in the ... | permission | 12 | `public/models/creatures/temple_acolyte.glb` | mobs and bosses in the world and dungeons |
| 301 | Drowned Temple Ice Wraith (public/models/creatures/temple_ice_wraith.glb) | project only | 1 | `public/models/creatures/temple_ice_wraith.glb` | mobs and bosses in the world and dungeons |
| 303 | Sunken Bastion spectral sailor (public/models/creatures/bastion_ghost_sailor.glb) and haunted brig ... | permission | 2 | `public/models/creatures/bastion_ghost_sailor.glb` | mobs and bosses in the world and dungeons; world props and town buildings |
| 304 | Enemy and dungeon boss bodies made through the designer's model guide (public/models/creatures/woc_*.glb, ... | permission | 36 | `public/models/creatures/woc_basin_beastmaster.glb` | mobs and bosses in the world and dungeons; world props and town buildings |
| 307 | Gravewyrm Sanctum Korgath maul clips (public/models/creatures/woc_sanctum_korgath_clips.glb: a clip donor, no ... | permission | 1 | `public/models/creatures/woc_sanctum_korgath_clips.glb` | mobs and bosses in the world and dungeons |
| 314 | Realm sky HDRIs (hollow_dusk, ember_storm, frost_twilight, amber_sunset, fen_day, nightbloom_dream, ... | project only | 0 |  | see asset text |
| 382 | Creature vocalizations, every mob family (mob_*) | CC BY-NC | 184 | `public/audio/sfx/mob_beast_aggro_1.mp3` | combat, UI and world sound effects |
| 407 | Generated creature model + animations (training_dummy) | project only | 2 | `public/models/creatures/training_dummy.glb` | mobs and bosses in the world and dungeons |
| 408 | Generated creature model + animations (gravewing) | project only | 1 | `public/models/creatures/gravewing.glb` | mobs and bosses in the world and dungeons |
| 409 | Generated character form + animations (lich_form) | project only | 0 |  | see asset text |
| 410 | Contributor-provided animated raid boss model and fire VFX (ignivar_herald) | project only | 1 | `public/models/creatures/ignivar_herald.glb` | mobs and bosses in the world and dungeons |
| 437 | Generated creature model + animations (emberkin) | project only | 3 | `public/models/creatures/emberkin.glb` | action bars, spellbook, talent tree, cast bars and tooltips; mobs and bosses in the world and dungeons |
| 438 | Generated creature model + animations (pyre_colossus) | project only | 2 | `public/models/creatures/pyre_colossus.glb` | mobs and bosses in the world and dungeons |
| 439 | Generated creature model + animations (gloomshade_abyssal_guardian) | project only | 1 | `public/models/creatures/gloomshade_abyssal_guardian.glb` | mobs and bosses in the world and dungeons |
| 440 | Generated creature models + animations (hoard_abyssal_maw, hoard_hoarfrost_warden) | project only | 2 | `public/models/creatures/hoard_abyssal_maw.glb` | mobs and bosses in the world and dungeons |
| 441 | Generated creature models (hoard_emberforge_tyrant, hoard_archon_nyxaris, hoard_tempest_vharok) | project only | 3 | `public/models/creatures/hoard_archon_nyxaris.glb` | mobs and bosses in the world and dungeons |
| 442 | Generated hoard room creatures (hoard_tide_thrall, hoard_frost_revenant, hoard_ember_fiend, ... | project only | 0 |  | see asset text |
| 443 | Generated cave boss models (hoard_boss_mushroom, hoard_bloat_cap) | project only | 4 | `public/models/creatures/hoard_bloat_cap.glb` | mobs and bosses in the world and dungeons |
| 444 | Generated cave boss models (hoard_boss_mole, hoard_boss_bat, hoard_boss_mimic) | project only | 6 | `public/models/creatures/hoard_boss_bat.glb` | mobs and bosses in the world and dungeons |
| 449 | Generated prop model (wildheart_canopy_platform) | project only | 1 | `public/models/props/wildheart_canopy_platform.glb` | world props and town buildings |
| 453 | Generated creature model + animations (wildheart_ravager) | project only | 3 | `public/models/creatures/wildheart_ravager.glb` | mobs and bosses in the world and dungeons |
| 454 | Generated creature model + animations (wildheart_hexcaller) | project only | 3 | `public/models/creatures/wildheart_hexcaller.glb` | mobs and bosses in the world and dungeons |
| 455 | Generated creature model + animations (wildheart_beastmaster) | project only | 3 | `public/models/creatures/wildheart_beastmaster.glb` | mobs and bosses in the world and dungeons |
| 456 | Generated creature model + animations (wildheart_high_priest) | project only | 3 | `public/models/creatures/wildheart_high_priest.glb` | mobs and bosses in the world and dungeons |
| 458 | Generated creature model + animations (wildheart_stalker) | project only | 3 | `public/models/creatures/wildheart_stalker.glb` | mobs and bosses in the world and dungeons |
| 471 | Generated prop model (streetlamp_wraithwood_ghost) | project only | 1 | `public/models/props/streetlamp_wraithwood_ghost.glb` | world props and town buildings |
| 477 | Generated creature model + animations (bear_form, the druid Bear Form quadruped) | project only | 0 |  | see asset text |
| 478 | Druid cat form model and animations (public/models/creatures/druid_cat_form.glb) | project only | 1 | `public/models/creatures/druid_cat_form.glb` | mobs and bosses in the world and dungeons |
| 479 | Ignivar Ashcaller creature model + animations (public/models/creatures/ignivar_ashcaller.glb) | project only | 1 | `public/models/creatures/ignivar_ashcaller.glb` | mobs and bosses in the world and dungeons |
| 496 | Buddy model, animations, faces and whistle icon (Flicker and Glimmer, the flame-sprite pair, ... | project only | 1 | `public/models/buddies/sprites.glb` | see asset text |
| 498 | Generated creature model + animations (balgath_foreman) | project only | 0 |  | see asset text |
| 499 | Generated creature model + animations (balgath_cyclops) | project only | 2 | `public/models/creatures/balgath_cyclops.glb` | mobs and bosses in the world and dungeons |
| 505 | Generated buddy model + animations (horse, the low-poly pony companion, public/models/buddies/horse.glb) | project only | 1 | `public/models/buddies/horse.glb` | see asset text |
| 506 | Generated buddy model, animations and whistle icon (sapling, public/models/buddies/sapling.glb) | project only | 1 | `public/models/buddies/sapling.glb` | see asset text |
| 507 | Generated creature model + animations (sporemender_form) | project only | 2 | `public/models/creatures/sporemender_form.glb` | action bars, spellbook, talent tree, cast bars and tooltips; mobs and bosses in the world and dungeons |

### Creatures crew (re-render with scripts/render_finder_portraits.mjs once the mob models are replaced)

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 259 | Deterministically corrected mob target portraits (public/ui/mobs/{bogtoad,breach_wretch,castaway_navigator,cin ... | project only | 18 | `public/ui/mobs/bogtoad.webp` | see asset text |
| 260 | Ignivar raid target portraits (public/ui/mobs/{ignivar_cinder_artificer,ignivar_crucible_warden,ignivar_ember_ ... | project only | 6 | `public/ui/mobs/ignivar_cinder_artificer.webp` | see asset text |

### Weapons crew

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 203 | Legacy Claudium prototype weapon models and source images (emberfang, Red Skull, and Purple sets, in ... | permission | 402 | `public/models/weapons/adv_dagger.glb` | held weapons, armory, character sheet previews |
| 204 | Starter weapon models (the five starting weapons, the starting shield, the hunter's crossbow and the ... | permission | 188 | `public/models/weapons/axe_starter.glb` | held weapons, armory, character sheet previews |
| 205 | Common and uncommon "field" weapon models (ten plain shapes in up to three painted looks, ... | permission | 203 | `public/models/weapons/axe_field_bronze.glb` | held weapons, armory, character sheet previews |
| 206 | Rare weapon models (two designs per weapon type in up to three painted finishes, and two rare shield designs: ... | permission | 230 | `public/models/weapons/axe_rare_a_ember.glb` | held weapons, armory, character sheet previews |
| 207 | Epic weapon models (one design per named weapon line in up to three painted finishes, and two epic shield ... | permission | 207 | `public/models/weapons/axe_epic_gravecleaver_fossil_gravegreen.glb` | held weapons, armory, character sheet previews |
| 228 | Season 1 Armory weapon models, source images, generated store thumbnails, and promotional card (Guildmark, ... | permission | 447 | `public/models/weapons/adv_dagger.glb` | held weapons, armory, character sheet previews |
| 279 | Masterwrought inscription tome held models (public/models/weapons/{tome_silverleaf,tome_goldleaf,tome_sunpetal ... | permission | 4 | `public/models/weapons/tome_goldleaf.glb` | held weapons, armory, character sheet previews |
| 313 | Drakelands rebuild kit props (public/models/drakelands_kit/*.glb: town buildings and bases, church, barracks, ... | project only | 20 | `public/models/drakelands_kit/barracks.glb` | see asset text |
| 431 | Generated Mirefen muster camp kit (muster_palisade, muster_barricade, muster_gate, muster_watchtower, ... | project only | 0 |  | see asset text |

### Weapons crew (model) + 2D crew (icon)

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 500 | Generated weapon model + icon (balgath_barrowmaul_hammer) | project only | 2 | `public/models/weapons/balgath_barrowmaul_hammer.glb` | held weapons, armory, character sheet previews |
| 501 | Generated weapon model + icon (shardpike_spear) | project only | 2 | `public/models/weapons/shardpike_spear.glb` | held weapons, armory, character sheet previews |

### Props crew

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 124 | Thornhollow wall tower (public/models/city/wall_tower.glb) | project only | 1 | `public/models/city/wall_tower.glb` | see asset text |
| 126 | Thornhollow ground decals (public/textures/battleground/decals/*.webp) | project only | 2 | `public/textures/battleground/decals/blood_pool.webp` | see asset text |
| 127 | Thornhollow Fields rune pad bodies (public/models/battleground/rune_damage.glb, rune_defense.glb, ... | project only | 3 | `public/models/battleground/rune_damage.glb` | see asset text |
| 129 | Ignivar perimeter lava (public/textures/encounters/ignivar/ignivar_lava_original.webp) | project only | 1 | `public/textures/encounters/ignivar/ignivar_lava_original.webp` | see asset text |
| 131 | Tree Generator leaf-card atlases (public/textures/foliage/leaves/*.png) | project only | 27 | `public/textures/foliage/leaves/acacia.png` | see asset text |
| 132 | Tree Generator foundation trunks (public/models/foliage/trunks/*.glb) | project only | 6 | `public/models/foliage/trunks/acacia.glb` | see asset text |
| 133 | Tidehold town kit (public/models/tidehold/{house_a..e,tavern,tavern_b,smithy,market,hall,shop_a,shop_b,bank}.g ... | project only | 13 | `public/models/tidehold/bank.glb` | world props and town buildings |
| 134 | Eastbrook Weekly Vault placeable model (public/models/tidehold/vault.glb, its .lod.glb far twin and .half / ... | project only | 1 | `public/models/tidehold/vault.glb` | world props and town buildings |
| 135 | Fenbridge's Fenrire look of the painted Tidehold buildings (public/models/tidehold/fenrire/{hall,house_a,shop_ ... | project only | 5 | `public/models/tidehold/fenrire/hall.glb` | world props and town buildings |
| 136 | Highwatch's Alpine slate look of the painted Tidehold buildings (public/models/tidehold/highwatch/{bank,hall,h ... | project only | 6 | `public/models/tidehold/highwatch/bank.glb` | world props and town buildings |
| 138 | The pantile town look of the painted Tidehold buildings (public/models/tidehold/pantile/{house_a,shop_a,tavern ... | project only | 3 | `public/models/tidehold/pantile/house_a.glb` | world props and town buildings |
| 139 | The shakes town look of the painted Tidehold buildings (public/models/tidehold/shakes/{hall,house_a,tavern}.gl ... | project only | 3 | `public/models/tidehold/shakes/hall.glb` | world props and town buildings |
| 140 | The diamond town look of the painted Tidehold buildings (public/models/tidehold/diamond/{hall,house_c,shop_a,s ... | project only | 5 | `public/models/tidehold/diamond/hall.glb` | world props and town buildings |
| 141 | The brick town look of the painted Tidehold buildings (public/models/tidehold/brick/{hall,house_a,shop_a,smith ... | project only | 5 | `public/models/tidehold/brick/hall.glb` | world props and town buildings |
| 142 | The thatch town look of the painted Tidehold buildings (public/models/tidehold/thatch/{hall,house_a,house_b,sm ... | project only | 5 | `public/models/tidehold/thatch/hall.glb` | world props and town buildings |
| 145 | WOC Terrain Textures and WOC Asset Textures packs (the source images under scripts/assets/blender_tidehold/, ... | project only | 200 | `scripts/assets/blender_tidehold/AUTHORING.md` | see asset text |
| 152 | Biome backdrop panoramas (vale_backdrop.webp, marsh_backdrop.webp, peaks_backdrop.webp and 4K variants) | project only | 0 |  | see asset text |
| 153 | Fel meteor POWERFUL VFX sprite (public/vfx/fel_meteor_impact.png) | project only | 1 | `public/vfx/fel_meteor_impact.png` | see asset text |
| 199 | Eastbrook shared surface atlas (public/textures/eastbrook_surface_atlas.webp; accepted source and comparison ... | project only | 3 | `docs/screenshots/eastbrook-vale-rebuild/materials/eastbrook-surface-atlas-comparison.png` | repo docs only (not loaded by the game) |
| 201 | Fenbridge shared surface maps (public/textures/fenbridge_surface_atlas.webp, fenbridge_surface_normal.webp, ... | project only | 4 | `docs/design/fenbridge-rebuild/materials/fenbridge-surface-atlas-source.png` | repo docs only (not loaded by the game) |
| 231 | Tripo3d vegetation prop models (public/models/props/reeds.glb) | permission | 1 | `public/models/props/reeds.glb` | world props and town buildings |
| 234 | Mirefen mudfin hut models (public/models/props/mudfin_hut_a.glb, mudfin_hut_b.glb) | permission | 2 | `public/models/props/mudfin_hut_a.glb` | world props and town buildings |
| 292 | Rift dimensional gate model (public/models/props/rift_portal.glb) | project only | 1 | `public/models/props/rift_portal.glb` | world props and town buildings |
| 293 | Rift arcane flame + rune monolith props (public/models/props/rift_flame.glb, rift_rune.glb) | project only | 2 | `public/models/props/rift_flame.glb` | world props and town buildings |
| 295 | Harbor route marker signpost (public/models/props/harbor_route_marker.glb: post, arrow board, anchor roundel, ... | permission | 1 | `public/models/props/harbor_route_marker.glb` | world props and town buildings |
| 296 | Wyrmwatch cliff harbor (public/models/props/wyrmwatch_harbor.glb: the Drakelands ferry berth's quays, ... | permission | 1 | `public/models/props/wyrmwatch_harbor.glb` | world props and town buildings |
| 297 | Wickharbor ferry wharf (public/models/props/wickharbor_wharf.glb: the Wickharbor ferry berth's plank wharf, ... | permission | 1 | `public/models/props/wickharbor_wharf.glb` | world props and town buildings |
| 298 | Wickharbor harbor (public/models/props/wickharbor_harbor.glb: Wickharbor's shore boardwalk, the great quay ... | permission | 1 | `public/models/props/wickharbor_harbor.glb` | world props and town buildings |
| 299 | Mirefen tavern (public/models/props/mirefen_tavern.glb: the walk-in inn on the Fenbridge road, its common ... | permission | 3 | `public/models/props/mirefen_tavern.glb` | world props and town buildings |
| 302 | Drowned Temple kit (public/models/props/drowned_temple_kit.glb: the pearl-stone columns, the drowned choir ... | permission | 1 | `public/models/props/drowned_temple_kit.glb` | world props and town buildings |
| 305 | Gravewyrm Sanctum Seal Gate (public/models/props/sanctum_seal_gate.glb, sanctum_seal_gate_props.glb, ... | permission | 3 | `public/models/props/sanctum_seal_gate.glb` | world props and town buildings |
| 306 | Gravewyrm Sanctum interior kit (public/models/props/gravewyrm_sanctum_interior.glb: the Lock Terrace's slate ... | permission | 1 | `public/models/props/gravewyrm_sanctum_interior.glb` | world props and town buildings |
| 308 | Sunken Bastion Drowned Gate Tower (public/models/props/sunken_bastion_entrance.glb, ... | permission | 3 | `public/models/props/sunken_bastion_entrance.glb` | world props and town buildings |
| 309 | Hollow Crypt Fallen Chapel (public/models/props/hollow_crypt_entrance.glb, hollow_crypt_entrance_walls.glb, ... | permission | 4 | `public/models/props/hollow_crypt_entrance.glb` | world props and town buildings |
| 310 | Drowned Temple Moon Stair (public/models/props/drowned_temple_entrance.glb, ... | permission | 3 | `public/models/props/drowned_temple_entrance.glb` | world props and town buildings |
| 311 | Wildheart Basin Jaguar Maw (public/models/props/wildheart_basin_entrance.glb, ... | permission | 3 | `public/models/props/wildheart_basin_entrance.glb` | world props and town buildings |
| 312 | Ignivar raid forge-mech dressing props (public/models/dungeon/ignivar_prop_*.glb: beams, pillars, the rusty ... | project only | 50 | `public/models/dungeon/ignivar_prop_anvil.glb` | see asset text |
| 316 | Infernal Citadel props (public/models/props/infernal_brazier.glb, infernal_altar.glb, demon_idol.glb, ... | project only | 10 | `public/models/props/bone_pile.glb` | world props and town buildings |
| 379 | Magic-school impact and casting-support one-shots (impact_*, heal_impact, buff_apply, debuff_apply, ... | CC BY-NC | 102 | `public/audio/sfx/buff_apply.mp3` | combat, UI and world sound effects |
| 380 | Magic-school projectile launches (proj_*) | CC BY-NC | 7 | `public/audio/sfx/proj_arcane.mp3` | combat, UI and world sound effects |
| 388 | Generated prop model (marsh_plank_bridge) | project only | 1 | `public/models/props/marsh_plank_bridge.glb` | world props and town buildings |
| 389 | Generated prop model (marsh_shrine_fragment) | project only | 1 | `public/models/props/marsh_shrine_fragment.glb` | world props and town buildings |
| 390 | Generated prop model (marsh_corpse_candle) | project only | 1 | `public/models/props/marsh_corpse_candle.glb` | world props and town buildings |
| 391 | Generated prop model (marsh_bell_gallows) | project only | 1 | `public/models/props/marsh_bell_gallows.glb` | world props and town buildings |
| 392 | Generated prop model (marsh_sluice_post) | project only | 1 | `public/models/props/marsh_sluice_post.glb` | world props and town buildings |
| 393 | Generated prop model (marsh_dead_tree) | project only | 1 | `public/models/props/marsh_dead_tree.glb` | world props and town buildings |
| 394 | Generated prop model (marsh_reed_cluster) | project only | 1 | `public/models/props/marsh_reed_cluster.glb` | world props and town buildings |
| 395 | Generated prop model (yumi_brazier_stand) | project only | 1 | `public/models/props/yumi_brazier_stand.glb` | world props and town buildings |
| 396 | Generated prop model (yumi_torch_handle) | project only | 1 | `public/models/props/yumi_torch_handle.glb` | world props and town buildings |
| 397 | Generated prop model (dungeon_door_arch) | project only | 1 | `public/models/props/dungeon_door_arch.glb` | world props and town buildings |
| 398 | Generated prop model (crypt_ritual_circle) | project only | 1 | `public/models/quest/crypt_ritual_circle.glb` | see asset text |
| 399 | Generated prop model (delve_module_exit) | project only | 1 | `public/models/props/delve_module_exit.glb` | world props and town buildings |
| 400 | Generated prop model (delve_surface_exit) | project only | 2 | `public/models/props/delve_surface_exit.glb` | world map and minimap; world props and town buildings |
| 401 | Generated prop model (delve_rite_shrine_bell) | project only | 1 | `public/models/props/delve_rite_shrine_bell.glb` | world props and town buildings |
| 402 | Generated prop model (delve_rite_shrine_candle) | project only | 1 | `public/models/props/delve_rite_shrine_candle.glb` | world props and town buildings |
| 403 | Generated prop model (delve_rite_shrine_reed) | project only | 1 | `public/models/props/delve_rite_shrine_reed.glb` | world props and town buildings |
| 404 | Generated prop model (delve_rite_shrine_skull) | project only | 1 | `public/models/props/delve_rite_shrine_skull.glb` | world props and town buildings |
| 405 | Generated prop model (delve_pressure_plate) | project only | 1 | `public/models/props/delve_pressure_plate.glb` | world props and town buildings |
| 406 | Generated prop model (marsh_root_wall) | project only | 1 | `public/models/props/marsh_root_wall.glb` | world props and town buildings |
| 411 | Contributor-provided animated raid add models (cinder_artificer, crucible_warden, ember_sentinel) | project only | 3 | `public/models/creatures/cinder_artificer.glb` | mobs and bosses in the world and dungeons |
| 412 | Generated prop model (engineering_workbench) | project only | 1 | `public/models/props/engineering_workbench.glb` | world props and town buildings |
| 413 | Generated prop model (alchemy_cauldron) | project only | 1 | `public/models/props/alchemy_cauldron.glb` | world props and town buildings |
| 414 | Generated prop model (cooking_spit) | project only | 1 | `public/models/props/cooking_spit.glb` | world props and town buildings |
| 415 | Generated prop model (leatherworking_rack) | project only | 1 | `public/models/props/leatherworking_rack.glb` | world props and town buildings |
| 416 | Generated prop model (tailoring_loom) | project only | 1 | `public/models/props/tailoring_loom.glb` | world props and town buildings |
| 417 | Generated prop model (inscription_lectern) | project only | 1 | `public/models/props/inscription_lectern.glb` | world props and town buildings |
| 418 | Generated prop model (enchanting_altar) | project only | 1 | `public/models/props/enchanting_altar.glb` | world props and town buildings |
| 419 | Generated prop model (jewelcrafting_bench) | project only | 1 | `public/models/props/jewelcrafting_bench.glb` | world props and town buildings |
| 420 | Great Maze prop models (public/models/props/maze_hedge_wall.glb, maze_hedge_arch.glb, leafy_fox_statue.glb) | project only | 3 | `public/models/props/leafy_fox_statue.glb` | world props and town buildings |
| 421 | Evergarden flower bed models (public/models/props/flower_bed_square_a.glb, flower_bed_square_b.glb, ... | project only | 3 | `public/models/props/flower_bed_round.glb` | world props and town buildings |
| 422 | Galecrest monument models (public/models/props/ship_monument.glb, golden_horse_statue.glb) | project only | 2 | `public/models/props/golden_horse_statue.glb` | world props and town buildings |
| 423 | Generated prop model (mining_ore_cart) | project only | 1 | `public/models/props/mining_ore_cart.glb` | world props and town buildings |
| 424 | Generated prop model (herbalism_drying_rack) | project only | 1 | `public/models/props/herbalism_drying_rack.glb` | world props and town buildings |
| 425 | Generated prop model (banker_chest) | project only | 1 | `public/models/props/banker_chest.glb` | world props and town buildings |
| 426 | Generated landmark model (eastbrook_grand_armoury) | project only | 1 | `public/models/props/eastbrook_grand_armoury.glb` | world props and town buildings |
| 427 | Generated Eastbrook town kit (eastbrook_bank, eastbrook_smithy, eastbrook_inn, eastbrook_chapel, ... | project only | 0 |  | see asset text |
| 428 | Generated Eastbrook Realm Builder monument (eastbrook_realm_builder_monument, plus its 8-view impostor atlas) | project only | 0 |  | see asset text |
| 429 | Generated Eastbrook Ravenpost mailbox (mailbox_pillar) | project only | 0 |  | see asset text |
| 430 | Generated Eastbrook public noticeboard (eastbrook_noticeboard) | project only | 0 |  | see asset text |
| 432 | Generated muster training effigy and stake mallet (muster_effigy, muster_mallet) | project only | 0 |  | see asset text |
| 433 | Generated Balgath Boulder Toss VFX kit (public/models/vfx/balgath_boulder.glb: boulder, chunk_0 to chunk_5, ... | project only | 1 | `public/models/vfx/balgath_boulder.glb` | see asset text |
| 434 | Generated Balgath Starwake VFX kit (public/models/vfx/balgath_starwake.glb: star_crystal_0 to star_crystal_5, ... | project only | 1 | `public/models/vfx/balgath_starwake.glb` | see asset text |
| 435 | Generated farming prop set (public/models/props/farm_bed.glb, farm_sprout.glb, farm_grain_stage2.glb, ... | project only | 17 | `public/models/props/farm_bed.glb` | world props and town buildings |
| 436 | Generated prop model (maledict_eye) | project only | 1 | `public/models/props/maledict_eye.glb` | world props and town buildings |
| 445 | Generated Fenbridge town kit (fenbridge_warden_gatehouse, fenbridge_crooked_reed_inn, ... | project only | 0 |  | see asset text |
| 447 | Generated prop model (wildheart_jaguar_gate) | project only | 1 | `public/models/props/wildheart_jaguar_gate.glb` | world props and town buildings |
| 448 | Generated prop model (wildheart_ritual_pyramid) | project only | 1 | `public/models/props/wildheart_ritual_pyramid.glb` | world props and town buildings |
| 450 | Generated prop model (wildheart_rope_bridge) | project only | 1 | `public/models/props/wildheart_rope_bridge.glb` | world props and town buildings |
| 451 | Generated prop model (wildheart_beast_den) | project only | 1 | `public/models/props/wildheart_beast_den.glb` | world props and town buildings |
| 452 | Generated prop model (wildheart_mask_totem) | project only | 1 | `public/models/props/wildheart_mask_totem.glb` | world props and town buildings |
| 457 | Generated prop model (wildheart_limestone_cliff) | project only | 1 | `public/models/props/wildheart_limestone_cliff.glb` | world props and town buildings |
| 459 | Generated prop model (wildheart_giant_fern) | project only | 1 | `public/models/props/wildheart_giant_fern.glb` | world props and town buildings |
| 460 | Generated prop model (wildheart_ancestor_ruin) | project only | 1 | `public/models/props/wildheart_ancestor_ruin.glb` | world props and town buildings |
| 461 | Generated prop model (wildheart_jungle_canopy_tree) | project only | 1 | `public/models/props/wildheart_jungle_canopy_tree.glb` | world props and town buildings |
| 462 | Generated prop model (streetlamp_eastbrook_civic) | project only | 1 | `public/models/props/streetlamp_eastbrook_civic.glb` | world props and town buildings |
| 463 | Generated prop model (streetlamp_mirefen_witchflame) | project only | 1 | `public/models/props/streetlamp_mirefen_witchflame.glb` | world props and town buildings |
| 464 | Generated prop model (streetlamp_thornpeak_beacon) | project only | 1 | `public/models/props/streetlamp_thornpeak_beacon.glb` | world props and town buildings |
| 465 | Generated prop model (streetlamp_veiled_crystal) | project only | 1 | `public/models/props/streetlamp_veiled_crystal.glb` | world props and town buildings |
| 466 | Generated prop model (streetlamp_drakelands_brazier) | project only | 1 | `public/models/props/streetlamp_drakelands_brazier.glb` | world props and town buildings |
| 467 | Generated prop model (streetlamp_frostveil_icicle) | project only | 1 | `public/models/props/streetlamp_frostveil_icicle.glb` | world props and town buildings |
| 468 | Generated prop model (streetlamp_amberfall_crystal) | project only | 1 | `public/models/props/streetlamp_amberfall_crystal.glb` | world props and town buildings |
| 469 | Generated prop model (streetlamp_willowfen_reed) | project only | 1 | `public/models/props/streetlamp_willowfen_reed.glb` | world props and town buildings |
| 470 | Generated prop model (streetlamp_nightbloom_moonflower) | project only | 1 | `public/models/props/streetlamp_nightbloom_moonflower.glb` | world props and town buildings |
| 472 | Generated prop model (streetlamp_palmreach_totem) | project only | 1 | `public/models/props/streetlamp_palmreach_totem.glb` | world props and town buildings |
| 473 | Generated prop model (streetlamp_evergarden_flower) | project only | 1 | `public/models/props/streetlamp_evergarden_flower.glb` | world props and town buildings |
| 474 | Generated prop model (frostveil_ice_spire) | project only | 1 | `public/models/props/frostveil_ice_spire.glb` | world props and town buildings |
| 475 | Generated prop model (streetlamp_galecrest_mast) | project only | 1 | `public/models/props/streetlamp_galecrest_mast.glb` | world props and town buildings |
| 476 | Generated prop model (streetlamp_farshore_coral) | project only | 1 | `public/models/props/streetlamp_farshore_coral.glb` | world props and town buildings |
| 480 | Generated prop model (varkhul_grand_forge) | project only | 1 | `public/models/props/varkhul_grand_forge.glb` | world props and town buildings |
| 481 | Generated prop model (wreckage_broken_planks) | project only | 1 | `public/models/props/wreckage_broken_planks.glb` | world props and town buildings |
| 482 | Generated prop model (wreckage_waterlogged_barrel) | project only | 1 | `public/models/props/wreckage_waterlogged_barrel.glb` | world props and town buildings |
| 483 | Generated prop model (wreckage_damaged_crate) | project only | 1 | `public/models/props/wreckage_damaged_crate.glb` | world props and town buildings |
| 484 | Generated prop model (wreckage_fallen_anchor) | project only | 1 | `public/models/props/wreckage_fallen_anchor.glb` | world props and town buildings |
| 485 | Generated prop model (wreckage_hull_fragment) | project only | 1 | `public/models/props/wreckage_hull_fragment.glb` | world props and town buildings |
| 486 | Generated prop model (wreckage_capsized_rowboat) | project only | 1 | `public/models/props/wreckage_capsized_rowboat.glb` | world props and town buildings |
| 487 | World Quests shipwreck placement kit (public/models/world_quests/shipwreck/) | project only | 7 | `public/models/world_quests/shipwreck/broken_planks.glb` | see asset text |
| 494 | Generated prop model (nythraxis_bone_spike) | project only | 2 | `public/models/props/nythraxis_bone_spike.glb` | world props and town buildings |
| 495 | Generated prop model (nythraxis_binding_cage) | project only | 1 | `public/models/props/nythraxis_binding_cage.glb` | world props and town buildings |
| 497 | Generated prop model (windrider_glider_flight) | project only | 1 | `public/models/props/windrider_glider_flight.glb` | world props and town buildings |
| 538 | Generated prop model (spore_burster) | project only | 1 | `public/models/props/spore_burster.glb` | world props and town buildings |

### Ambience/audio crew (sound effects)

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 236 | Sampled interface and event sound effects (public/audio/sfx/ui_*.mp3, except ui_level_up.mp3 and ... | project only | 123 | `public/audio/sfx/ui_achievement.mp3` | combat, UI and world sound effects |
| 267 | Temporal clock sound effect (public/audio/sfx/temporal_clock.mp3) | permission | 1 | `public/audio/sfx/temporal_clock.mp3` | combat, UI and world sound effects |
| 287 | Nightwing Chimaera rideable mount model (public/models/mounts/nightwing_chimera.glb) and reins icon ... | project only | 2 | `public/models/mounts/nightwing_chimera.glb` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips; rideable mounts |
| 288 | Chimeglass Tortoise rideable mount model (public/models/mounts/chimeglass_tortoise.glb) | permission | 1 | `public/models/mounts/chimeglass_tortoise.glb` | rideable mounts |
| 289 | Chimeglass Tortoise reins icon (public/ui/items/reins_chimeglass_tortoise.webp) | permission | 1 | `public/ui/items/reins_chimeglass_tortoise.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 358 | Remaining generated world, interface, event, and ambience sound effects not attributed below ... | project only | 747 | `public/audio/sfx/amb_birds.mp3` | combat, UI and world sound effects |
| 361 | Lantern Hall Destrier whinny takes (mount_neigh_lantern_hall_destrier_1.mp3, ... | project only | 2 | `public/audio/sfx/mount_neigh_lantern_hall_destrier_1.mp3` | combat, UI and world sound effects |
| 368 | Dreadspark Groundshaker movement layer (mount_run_terrorspark_groundshaker.mp3) | project only | 1 | `public/audio/sfx/mount_run_terrorspark_groundshaker.mp3` | combat, UI and world sound effects |
| 369 | Mirefen tavern room bed (amb_tavern.mp3) | project only | 1 | `public/audio/sfx/amb_tavern.mp3` | combat, UI and world sound effects |
| 370 | Gourdlight Eve sound effects (proj_gourdfall_whistle.mp3, impact_gourdfall.mp3, ... | project only | 13 | `public/audio/sfx/gurglegreen_bubble_loop.mp3` | combat, UI and world sound effects |
| 373 | Cluckwork Mech Bird take set (mount_run_mech_bird.mp3, mount_idle_mech_bird.mp3, mount_jump_mech_bird.mp3, ... | project only | 4 | `public/audio/sfx/mount_idle_mech_bird.mp3` | combat, UI and world sound effects |
| 374 | Bonebound Rickshaw rolling loop (mount_loop_rickshaw_mount.mp3) | CC BY-NC | 1 | `public/audio/sfx/mount_loop_rickshaw_mount.mp3` | combat, UI and world sound effects |
| 375 | Quest event sounds (quest_accept, quest_ready, quest_complete) | CC BY-NC | 3 | `public/audio/sfx/quest_accept_1.mp3` | combat, UI and world sound effects |
| 376 | Lockpick minigame sounds (lockpick_*) | CC BY-NC | 14 | `public/audio/sfx/lockpick_advanced_1.mp3` | combat, UI and world sound effects |
| 377 | Wand auto-attack sounds (wand_*) | CC BY-NC | 9 | `public/audio/sfx/wand_arcane_1.mp3` | combat, UI and world sound effects |
| 378 | Level-up and Book of Deeds achievement chimes (ui_level_up, ui_achievement) | CC BY-NC | 2 | `public/audio/sfx/ui_achievement.mp3` | Book of Deeds window, deed toasts; combat, UI and world sound effects |
| 381 | Melee, footstep, movement, combat-reaction, and player-state sounds (melee_*, foot_*, move_*, combat_*, ... | CC BY-NC | 166 | `public/audio/music/combat_1.mp3` | combat, UI and world sound effects; streamed soundtrack |

### Ambience/audio crew (voices)

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 359 | Ignivar encounter voice lines (public/audio/voice/ignivar/*.mp3) | permission | 12 | `public/audio/voice/ignivar/yell__another_spark_extinguished.mp3` | boss encounter voice lines |
| 360 | Varkhul encounter voice lines (public/audio/voice/varkhul/*.mp3) | permission | 5 | `public/audio/voice/varkhul/yell__every_blow_will_feed_the_furnace_in_my_chest_by_ember_stone_.mp3` | boss encounter voice lines |

### Music crew

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 268 | Remastered streamed soundtrack (public/audio/music/*.mp3: town, overworld, dungeon, and battle themes) | project only | 58 | `public/audio/music/a_fate_still_unwritten.mp3` | streamed soundtrack |
| 269 | Original Ignivar raid ambient suite retained for authoring (ignivar_forge_approach, ignivar_raid_arena, ... | project only | 3 | `public/audio/music/ignivar_forge_approach.mp3` | streamed soundtrack |
| 270 | Crucible floor soundtrack (final assets listed in the [floor soundtrack source ... | project only | 0 |  | see asset text |
| 271 | Proving Shore candidate cues (docs/music/proving-shore-candidates/*.mp3, the audition decision record) | project only | 3 | `docs/music/proving-shore-candidates/proving-shore-a-first-light-at-dawnrest.mp3` | repo docs only (not loaded by the game) |
| 272 | Proving Shore island cue (public/audio/music/proving_shore.mp3, "Welcome to Adventure") | project only | 1 | `public/audio/music/proving_shore.mp3` | streamed soundtrack |
| 273 | Morthen the Gravecaller boss-fight cue (public/audio/music/boss_morthen.mp3) | project only | 1 | `public/audio/music/boss_morthen.mp3` | streamed soundtrack |
| 274 | Dungeon boss-fight cues (public/audio/music/boss_*.mp3, excluding Morthen) | project only | 18 | `public/audio/music/boss_cantor_ilvane.mp3` | streamed soundtrack |

### This crew (2D)

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 95 | Hunter Bear Trap and Phosphor Flask ability icons (public/ui/skills/hunter/bear_trap.webp, ... | permission | 2 | `public/ui/skills/hunter/bear_trap.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 96 | Hunter Play Dead and Tactical Camo ability icons (public/ui/skills/hunter/) | permission | 46 | `public/ui/skills/hunter/aimed_shot.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 97 | Hunter Scatterbolt ability icon (public/ui/skills/hunter/scatterbolt.webp) | permission | 1 | `public/ui/skills/hunter/scatterbolt.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 137 | Highwatch adventurers' guild, Lantern Hall (public/models/tidehold/highwatch/guild.glb, and its ... | permission | 3 | `public/models/tidehold/highwatch/guild.glb` | world props and town buildings |
| 143 | Gourdlight Eve seasonal kit (public/models/props/gourdlight_decor.glb: the carved pumpkins, gourds, lanterns, ... | project only | 6 | `public/models/props/gourdlight_decor.glb` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips; world props and town buildings |
| 154 | Loading-screen artwork (public/textures/loading/*.webp) | project only | 11 | `public/textures/loading/crystal-delve.webp` | see asset text |
| 155 | Website fractured portal (public/website-fractured-portal-v1.svg, public/website-fractured-portal-v2.svg, ... | permission | 5 | `public/website-fractured-portal-v1.svg` | website and landing pages (also bundled into the desktop build) |
| 156 | Website feature icons (public/website-feature-classes-v1.webp, public/website-feature-open-v1.webp) | permission | 2 | `public/website-feature-classes-v1.webp` | website and landing pages (also bundled into the desktop build) |
| 157 | Website stone gateway (public/website-stone-gateway-v2.svg) | permission | 1 | `public/website-stone-gateway-v2.svg` | website and landing pages (also bundled into the desktop build) |
| 158 | Website parchment scroll (public/website-parchment-scroll-v1.svg, public/website-parchment-scroll-v2.svg) | permission | 2 | `public/website-parchment-scroll-v1.svg` | website and landing pages (also bundled into the desktop build) |
| 159 | Eastbrook website hero (public/website-hero-eastbrook-v1.webp) | permission | 1 | `public/website-hero-eastbrook-v1.webp` | website and landing pages (also bundled into the desktop build) |
| 160 | Galecrest website hero (public/website-hero-galecrest-v1.webp) | permission | 1 | `public/website-hero-galecrest-v1.webp` | website and landing pages (also bundled into the desktop build) |
| 161 | Drakelands website hero (public/website-hero-drakelands-v1.webp) | permission | 1 | `public/website-hero-drakelands-v1.webp` | website and landing pages (also bundled into the desktop build) |
| 162 | Thornpeak website hero (public/website-hero-thornpeak-v1.webp) | permission | 1 | `public/website-hero-thornpeak-v1.webp` | website and landing pages (also bundled into the desktop build) |
| 163 | Elite dragon rank emblem (public/ui/ranks/elite-dragon-frame.webp) | permission | 1 | `public/ui/ranks/elite-dragon-frame.webp` | see asset text |
| 164 | Warfare Season 2 Warrior item icons (public/ui/items/vanguard_warrior_*.webp) | permission | 15 | `public/ui/items/vanguard_warrior_arms_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 165 | Warfare Season 2 Rogue item icons (public/ui/items/vanguard_rogue_*.webp) | permission | 15 | `public/ui/items/vanguard_rogue_assassination_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 166 | Warfare Season 2 Druid item icons (public/ui/items/vanguard_druid_*.webp) | permission | 15 | `public/ui/items/vanguard_druid_balance_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 167 | Buried Hoards arcane icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 168 | Buried Hoards frost icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 169 | Buried Hoards ember icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 170 | Buried Hoards storm icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 171 | Buried Hoards brute icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 172 | Buried Hoards venom icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 173 | Buried Hoards necro icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 174 | Buried Hoards tide icons (four objects, three tiers) | permission | 0 |  | see asset text |
| 175 | Faction rift vendor icons | permission | 0 |  | see asset text |
| 176 | Faction church vendor icons | permission | 0 |  | see asset text |
| 177 | Faction automaton vendor icons | permission | 0 |  | see asset text |
| 178 | Clue item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 179 | Rewards item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 180 | Bastion dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 181 | Temple dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 182 | Wildheart dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 183 | Gravewyrm dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 184 | Crypt dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 185 | Bastion-blues dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 186 | Temple-blues dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 187 | Crypt-blues dungeon item icons | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 188 | Friendship referral reward icons (five former temporary aliases) | permission | 0 |  | see asset text |
| 189 | Warfare Season 2 Warlock item icons (public/ui/items/vanguard_warlock_*.webp) | permission | 15 | `public/ui/items/vanguard_warlock_affliction_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 190 | Warfare Season 2 Mage item icons (public/ui/items/vanguard_mage_*.webp) | permission | 15 | `public/ui/items/vanguard_mage_arcane_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 191 | Warfare Season 2 Shaman item icons (public/ui/items/vanguard_shaman_*.webp) | permission | 15 | `public/ui/items/vanguard_shaman_elemental_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 192 | Warfare Season 2 Priest item icons (public/ui/items/vanguard_priest_*.webp) | permission | 15 | `public/ui/items/vanguard_priest_discipline_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 193 | Warfare Season 2 Hunter item icons (public/ui/items/vanguard_hunter_*.webp) | permission | 15 | `public/ui/items/vanguard_hunter_beast_mastery_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 194 | Warfare Season 2 Paladin item icons (public/ui/items/vanguard_paladin_*.webp) | permission | 15 | `public/ui/items/vanguard_paladin_holy_chest.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 195 | Leaderboard podium medals (public/ui/leaderboard/medal_{gold,silver,bronze}.webp) | permission | 3 | `public/ui/leaderboard/medal_bronze.webp` | see asset text |
| 208 | Bag icons (public/ui/items/{backpack,linen_pouch,travelers_knapsack,wolfhide_satchel,gravewoven_bag,mistcaller ... | project only | 7 | `public/ui/items/backpack.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 209 | Historical CraftPix item identity references for the item-art consistency replacements (255 pre-task icons, ... | permission | 0 |  | see asset text |
| 210 | Professions 2.0 commissioned art set (public/ui/professions/*.webp except gather_farming.webp, the ... | permission | 27 | `public/ui/items/mapping.json` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips; profession windows and trainers |
| 211 | Masterwrought art-completion wave (181 painted assets across public/ui/items/, public/ui/deeds/, ... | permission | 2571 | `public/ui/auras/well_fed.webp` | buff and debuff frames; Book of Deeds window, deed toasts; HUD side rail and mobile bar launchers |
| 212 | Bank-storage painted bag catalog (public/ui/items/{wayfarers_backpack,burlap_reagent_pouch,necromancers_reagen ... | permission | 8 | `public/ui/items/burlap_reagent_pouch.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 213 | Field Kit gathering-tool icon (public/ui/items/field_kit.webp, batch ... | permission | 2 | `public/ui/items/field_kit.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 214 | Generated item icon rebrand (public/ui/items/*.webp, exact IDs under generatedBatches in ... | permission | 2210 | `public/ui/items/abyssal_loop.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 215 | Item-art consistency replacement paintings (public/ui/items/*.webp, exact IDs in the ... | permission | 2210 | `public/ui/items/abyssal_loop.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 216 | Class ability icons (public/ui/skills/<class>/*.webp, excluding entries with an explicit project-generated or ... | permission | 496 | `public/ui/skills/druid/barkskin.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 217 | v0.29 Hunter, Shaman, and Priest class rework ability icons (31 files recorded as project-generated in the ... | permission | 11 | `public/ui/skills/druid/mapping.json` | action bars, spellbook, talent tree, cast bars and tooltips |
| 218 | Generated class ability additions (public/ui/skills/<class>/*.webp, exact ... | permission | 506 | `public/ui/skills/druid/barkskin.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 219 | v0.29 Hunter, Shaman, and Priest class rework ability icons (31 files recorded as project-generated in the ... | permission | 11 | `public/ui/skills/druid/mapping.json` | action bars, spellbook, talent tree, cast bars and tooltips |
| 220 | Paladin overhaul and talent ability icons (entries marked as OpenAI-generated original project artwork in ... | permission | 1 | `public/ui/skills/paladin/mapping.json` | action bars, spellbook, talent tree, cast bars and tooltips |
| 221 | Generated Warlock spell and talent icons (exact IDs under generatedBatches in ... | permission | 1 | `public/ui/skills/warlock/mapping.json` | action bars, spellbook, talent tree, cast bars and tooltips |
| 222 | Warlock pet signature action icons (emberkin_felbolt, gloomshade_abyssal_chain) | permission | 0 |  | see asset text |
| 223 | Shared pet action-bar command icons (public/ui/skills/pet/*.webp) | permission | 8 | `public/ui/skills/pet/pet_aggressive.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 224 | Exact runtime aura paintings (public/ui/auras/*.webp) | permission | 130 | `public/ui/auras/affliction_doom.webp` | buff and debuff frames |
| 225 | v0.39 second-pass legacy class-icon replacements (58 exact entries in the Druid, Hunter, Mage, Priest, Rogue, ... | permission | 11 | `public/ui/skills/druid/mapping.json` | action bars, spellbook, talent tree, cast bars and tooltips |
| 226 | v0.39 second-pass gameplay UI paintings (public/ui/currency/*.webp, public/ui/delve-affixes/*.webp, ... | permission | 40 | `public/ui/currency/automaton_cog.webp` | see asset text |
| 227 | Collective Reversal and Hourglass of Suspension ability icons (public/ui/skills/mage/collective_reversal.webp, ... | permission | 2 | `public/ui/skills/mage/collective_reversal.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 229 | Membership and Refer a Friend promotional cards (public/ui/store/membership-promo.webp, ... | permission | 2 | `public/ui/store/membership-promo.webp` | see asset text |
| 235 | Claudium visual asset set (public/claudium/: coin, UI icons, and denomination stacks; excludes the two ... | permission | 44 | `public/claudium/ASSETS.md` | see asset text |
| 237 | Integration 45 foundations deed crests (exp_the_last_keep, exp_dawnhold_castle, soc_strongbox_outfitter, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 238 | Integration 45 crucible deed crests (dgn_ignivar, dgn_ignivar_heroic, dgn_varkhul, dgn_varkhul_heroic, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 239 | Integration 45 worldquests deed crests (exp_arcane_calligraphy, exp_arcane_calligraphy_gold, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 240 | Integration 45 factions deed crests (prog_rift_watch_trusted, prog_church_order_trusted, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 241 | Integration 45 adventures deed crests (exp_clue_first_casket, exp_clue_ten_caskets, cmb_coinsack_caught, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 242 | Integration 45 bastion deed crests (dgn_olen_buttress, dgn_ossick_moored, dgn_vael_beacon, dgn_turretback, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 243 | Integration 45 temple deed crests (dgn_selthe_pitch, dgn_colossus_mirror, dgn_ysolei_high_and_dry, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 244 | Integration 45 crypt deed crests (dgn_crypt_knellwyrm, dgn_marrow_tidy, dgn_lady_nobody_hanging, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 245 | Integration 45 wildheart deed crests (dgn_beastmaster_apart, dgn_gorgebloom_clean, dgn_zulgar_uncaught, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 246 | Integration 45 gravewyrm deed crests (dgn_korgath_all_chains, dgn_korgath_still_bound, dgn_velkhar_cold, ... | permission | 0 |  | Book of Deeds window, deed toasts |
| 247 | Book of Deeds achievement icons (public/ui/deeds/*.webp, excluding the project-generated additions credited ... | permission | 357 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 248 | Generated Book of Deeds additions (chr_peaks_gatherer, chr_marsh_rares_ii, chr_peaks_rares_ii, chr_gleamstag, ... | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 249 | v0.36 placeholder-art completion Book of Deeds additions (chr_amberfall_first_cast, chr_amberfall_gatherer, ... | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 250 | v0.36 release-audit Reliquary Book of Deeds additions (col_reliquary_rank_2, col_reliquary_rank_3, ... | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 251 | Masterwrought jewelcrafting Book of Deeds addition (prog_jewelcrafting_rare under public/ui/deeds/) | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 252 | Gourdlight Eve Book of Deeds addition (feat_gourdlight_guise under public/ui/deeds/) | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 253 | Masterwrought jewelcrafting milestone crests (prog_jewelcrafting_50, prog_grandmaster_jewelcrafting under ... | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 254 | Masterwrought inscription milestone crests (prog_inscription_rare, prog_inscription_50, ... | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 255 | Masterwrought farming, fishing, and promotion deed crests (col_deepest_cast, prog_first_planting, ... | permission | 356 | `public/ui/deeds/chr_amberfall_first_cast.webp` | Book of Deeds window, deed toasts |
| 256 | Historical v0.36 painted per-item weapon inventory wave (119 base-weapon paintings recorded by ... | permission | 0 |  | see asset text |
| 257 | v0.36 generated specialization emblems (public/ui/specs/{paladin,hunter,rogue,priest,shaman,warlock,druid}/*.w ... | permission | 21 | `public/ui/specs/druid/balance.webp` | see asset text |
| 258 | v0.36 generated creature-family and status crests (public/ui/crests/families/*.webp and ... | permission | 17 | `public/ui/crests/families/beast.webp` | see asset text |
| 261 | HUD chrome launcher icons (public/ui/chrome/*.webp, one per primary destination in the side rail and mobile ... | permission | 21 | `public/ui/chrome/arena.webp` | HUD side rail and mobile bar launchers |
| 262 | Map and minimap marker paintings (public/ui/map-markers/*.webp) | permission | 29 | `public/ui/map-markers/delve_entrance.webp` | world map and minimap |
| 263 | World-map continent overview plate (public/map_art/world_overview.webp, the painted backdrop of the ... | permission | 1 | `public/map_art/world_overview.webp` | world map and minimap |
| 266 | Owner-provided Druid artwork (public/ui/skills/druid/cat_form.webp, the Cat Form lynx head) | permission | 1 | `public/ui/skills/druid/cat_form.webp` | action bars, spellbook, talent tree, cast bars and tooltips |
| 280 | Goblin Rocket Sled mount (public/models/mounts/goblin_rocket_sled.glb) and item painting ... | permission | 2 | `public/models/mounts/goblin_rocket_sled.glb` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips; rideable mounts |
| 282 | Lanternback Troll reins icon (public/ui/items/reins_lanternback_troll.webp) | permission | 1 | `public/ui/items/reins_lanternback_troll.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 284 | Lantern Hall Destrier reins icon (public/ui/items/reins_lantern_hall_destrier.webp) | permission | 1 | `public/ui/items/reins_lantern_hall_destrier.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 285 | Blade of Lantern Hall sword appearance (public/models/weapons/lantern_hall_sword.glb, ... | permission | 3 | `public/models/weapons/lantern_hall_sword.glb` | held weapons, armory, character sheet previews |
| 286 | Lantern Hall elemental weapon appearances: Hearthbrand, Squallcrest, Rimelight Staff, Duskwick Staff ... | permission | 188 | `public/models/weapons/duskwick_staff.glb` | held weapons, armory, character sheet previews |
| 291 | Wobbles the Slime reins icon (public/ui/items/reins_wobbles_slime.webp) | permission | 1 | `public/ui/items/reins_wobbles_slime.webp` | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 294 | Eastbrook ferry transport ship (public/models/props/eastbrook_ferry.glb: hull, sails, sea-serpent figurehead, ... | permission | 1 | `public/models/props/eastbrook_ferry.glb` | world props and town buildings |
| 315 | Zone map overlays (public/map_art/*.png) | project only | 16 | `public/map_art/amberfall.png` | world map and minimap |
| 488 | Confection Cascade candy atlas (public/ui/minigames/confection-candies.webp) | project only | 1 | `public/ui/minigames/confection-candies.webp` | see asset text |
| 489 | Confection Cascade walnut coffer material (public/ui/minigames/confection-walnut.webp) | project only | 1 | `public/ui/minigames/confection-walnut.webp` | see asset text |
| 490 | Confection Cascade artisan frame, brass hardware and result seals (public/ui/minigames/*-v4.webp) | project only | 6 | `public/ui/minigames/confection-clasp-v4.webp` | see asset text |
| 491 | Confection Cascade symmetrical emerald ornament (public/ui/minigames/confection-jewels-v5.webp) | project only | 1 | `public/ui/minigames/confection-jewels-v5.webp` | see asset text |
| 492 | Confection Cascade solid emerald and winged lock hardware (public/ui/minigames/*-v6.webp) | project only | 2 | `public/ui/minigames/confection-jewels-v6.webp` | see asset text |
| 493 | Confection Cascade polished gold hardware mounts (public/ui/minigames/*-v7.webp) | project only | 2 | `public/ui/minigames/confection-jewels-v7.webp` | see asset text |
| 502 | Shardpike world-boss item and mechanic icons (skerrits_shardpike, lance_brace, lance_thrust, lance_release) | permission | 0 |  | see asset text |
| 503 | Balgath eye-ward world-boss status badges (eye_ward_sealed, eye_ward_open, eye_ward_blinded) | permission | 0 |  | see asset text |
| 504 | Foreman's Wage world-boss item icons (foremans_wage_band, mirelight_locket, fenwright_grips) | permission | 0 |  | bags, bank, character sheet, loot, vendors, mail, auction, tooltips |
| 537 | Ley Beam Alignment celestial frame and crystal heart (public/ui/minigames/ley-*-v1.webp) | project only | 2 | `public/ui/minigames/ley-frame-v1.webp` | see asset text |

### Docs-only evidence (not shipped in the game; 2D crew removes it from the build and repo)

| Line | Asset | Class | Files | Example path | Used in |
|---|---|---|---|---|---|
| 196 | Eastbrook Vale rebuild master concept, nine turnaround sheets, full-color surface-atlas source, and ... | permission | 1 | `docs/screenshots/eastbrook-vale-rebuild/concepts/master-concept.png` | repo docs only (not loaded by the game) |
| 197 | Eastbrook finishing-pass master concept and Ravenpost mailbox / noticeboard turnaround sheets ... | permission | 1 | `docs/screenshots/eastbrook-vale-rebuild/polish/concepts/master-concept.png` | repo docs only (not loaded by the game) |
| 198 | Ignivar raid expansion automata, Forgefather, warhammer, and grand-forge concepts ... | permission | 9 | `docs/screenshots/ignivar-raid-expansion/concepts/ignivar_cinder_artificer.png` | repo docs only (not loaded by the game) |
| 200 | Fenbridge rebuild master concept and fourteen isolated turnaround sheets ... | permission | 15 | `docs/design/fenbridge-rebuild/references/boardwalk-turnaround.png` | repo docs only (not loaded by the game) |

### Restricted assets with no CREDITS row

| Owner | Asset | Files | Note |
|---|---|---|---|
| weapons crew | Weapon portrait renders (public/ui/weapons/*.jpg), excluding the 25 fork-made gathering tool renders | 155 | re-render from the replacement weapon models with scripts/render_weapon_icons.mjs |
| creatures crew | Mob target portraits (public/ui/mobs/*.webp), renders of the shipped mob models | 360 | license follows the model; CC0 models (KayKit, Quaternius) are fine, portraits of replaced models must be re-rendered with scripts/render_finder_portraits.mjs |
| every 3D crew | Guide model stills (public/guide-stills/*.webp), renders of shipped models | 86 | re-render after the underlying models are replaced |
| core-systems crew (removal) | Claudium visual asset set and store art (public/claudium/, public/ui/store/) | 86 | the store, Claudium and crypto are being removed; delete with that code rather than repaint |
| steam-platform crew (rebrand) | World of ClaudeCraft logos and app icons (public/woc-logo*, public/worldofclaudecraft-logo*, favicons, icon-192/512, ... | 17 | brand marks of Levy Street; a Wyndlewood brand set is needed |
| ambience/audio crew (voices) | NPC voice lines with no CREDITS row (public/audio/voice/<npc>/, every folder except ignivar and varkhul) | 561 | unlisted means unrecorded, not free; treat as rights reserved upstream work |

## Unlisted files to verify

CREDITS.md says an unlisted asset is unrecorded, not free. These tree folders hold files no row
path matches. Most are probably the CC0 packs whose rows carry no paths; each owner confirms per
file and adds the row, or replaces the file.

| Folder | Likely source | Action |
|---|---|---|
| `public/models/dungeon/` | probably the KayKit Dungeon Remastered, Kenney and Quaternius modular dungeon kits (CC0); a few are project props | props crew verifies per file |
| `public/models/medieval_village_v2/` | probably the Quaternius Medieval Village MegaKit (CC0) | props crew verifies |
| `public/models/biome/` | probably the Quaternius Stylized Nature MegaKit (CC0) | props crew verifies |
| `public/models/resources/` | gather and resource props, mixed sources | props crew verifies |
| `public/models/chars/` | KayKit adventurers and skeletons (CC0) beside the WOC player set | characters crew verifies |
| `public/textures/terrain/` | ambientCG (CC0) plus the fork's painted ground (Wyndlewood) | OK, spot-check |
| `public/textures/skins/` | WOC class skins and suits | characters crew (restricted with the WOC set) |
| `public/models/tools/` | fork-made Tripo gathering tools (owner's paid Tripo plan) | OK (Wyndlewood original) |
| `public/env/` | realm sky HDRIs (Poly Haven CC0 plus project-made realm skies) | props crew verifies the project-made ones |

## Tests that pin upstream art

Many icon tests pin upstream provenance (accepted-art manifests, shipping sha256, CraftPix
lineage). Replacing art in place retires those pins: each replaced family moves its pins to the
Wyndlewood provenance manifest in the same change that replaces the files, so the suite keeps
guarding every file (presence, size, opacity, one provenance owner) without pinning art that no
longer ships.

