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
| OK to ship | 0 | OK to ship (CC0, MIT, CC BY with attribution, OFL) |
| Wyndlewood original | 402 | made by the Wyndlewood fork (owner's accounts); OK to ship once provenance is recorded |
| Restricted: permission required | 0 | No, permission required (Levy Street rights reserved, CraftPix licence to Levy Street, owner-provided to Levy Street) |
| Restricted: CC BY-NC | 0 | CC BY-NC 4.0 (commercial grant to Levy Street only) |
| Restricted: with the project only | 0 | With the project only (upstream project art; replaced per owner decision) |
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
| Hunter Bear Trap and Phosphor Flask ability icons (public/ui/skills/hunter/bear_trap.webp, ... | AI-generated |
| Hunter Play Dead and Tactical Camo ability icons (public/ui/skills/hunter/) | AI-generated |
| Hunter Scatterbolt ability icon (public/ui/skills/hunter/scatterbolt.webp) | AI-generated |
| Character models + animations (knight, mage, rogue, barbarian, hooded rogue), weapons/shields | deterministic |
| WOC player characters (all nine classes, both body types: public/models/chars/players/woc/ (a base ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Skeleton character models + animations, bone weapons | deterministic |
| Skeleton minion rig + FREE-tier animations (rebuilt as skeleton_minion_free.glb, backing the ... | deterministic |
| Dungeon modular kit (walls, floors, pillars, torches, banners, chests, furniture; also the ... | deterministic |
| Graveyard/crypt props, dead trees, lanterns | deterministic |
| Extra character animation library (Rig_Medium) | deterministic |
| Animated creatures (wolf, bull, fox, stag, alpaca, spider, frog, goblin, orc, yeti, giant, demon, ... | deterministic |
| Stylized Nature MegaKit (trees, rocks, bushes, mushrooms, grass) | deterministic |
| Medieval Village Pack (houses, inn, blacksmith, well, market, cart) | deterministic |
| Fantasy Props MegaKit (barrels, crates, lanterns, furniture, smithy) | deterministic |
| Nature Kit (modular cliffs), Graveyard Kit, Pirate Kit (docks/boats), Fantasy Town Kit, Castle Kit, ... | deterministic |
| Pirate Kit (palm trees, docks, ship, chests, cannon, anchor, beach rocks, beach house) | deterministic |
| LowPoly Animated Fish (dolphin, shark, manta ray, whale, clownfish, blue tang, puffer, swordfish, ... | deterministic |
| Modular Dungeons Pack (stone walls, arches, pillar, floor tile, wall banner, trap door, horse ... | deterministic |
| Medieval Village MegaKit (wagon, crate, fences, vines, arch, exterior stairs, castle bases, castle ... | deterministic |
| Survival Kit (tents, bedrolls, campfires, signpost, sand rocks) | deterministic |
| Watercraft Kit (sail boats, fishing boat, rowboat, buoys) | deterministic |
| Modular Dungeon Kit (corridor and room tiles, stairs, gates) | deterministic |
| Mini Dungeon (trap, wood structure, supports, column, banner) | deterministic |
| Medieval Hexagon Pack (hex buildings, hex tiles, walls, bridge) | deterministic |
| Canyon Terrain Asset (cacti, desert tree, canyon rock formations, boulders, mesas) | deterministic |
| Mines and Cave Modular Set (mine carts, rails, ladder, cave rocks, entrances, supports, platforms) | deterministic |
| Terrain PBR textures (Grass001, Ground023, Rock026, Rock051, Rock060, Ground071, Ground080, ... | deterministic |
| Terrain PBR textures, biome set (Ground054, Ground095A, Ground093A, Rock029, Lava004, Gravel024, ... | deterministic |
| Thornhollow battleground terrain textures (public/textures/battleground/*.jpg) | deterministic |
| Thornhollow wall tower (public/models/city/wall_tower.glb) | deterministic |
| Laverock walking and running animation bank (public/models/creatures/temple_laverock_locomotion.glb) | deterministic |
| Thornhollow ground decals (public/textures/battleground/decals/*.webp) | deterministic |
| Thornhollow Fields rune pad bodies (public/models/battleground/rune_damage.glb, rune_defense.glb, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Surface-detail PBR textures for the triplanar material families (Bark012, Bricks076A/B, Fabric030, ... | deterministic |
| Ignivar perimeter lava (public/textures/encounters/ignivar/ignivar_lava_original.webp) | AI-generated |
| Canopy clump-detail textures (Moss002; NormalGL/AmbientOcclusion under public/textures/foliage/) | deterministic |
| Tree Generator leaf-card atlases (public/textures/foliage/leaves/*.png) | deterministic |
| Tree Generator foundation trunks (public/models/foliage/trunks/*.glb) | deterministic |
| Tidehold town kit (public/models/tidehold/{house_a..e,tavern,tavern_b,smithy,market,hall,shop_a,shop ... | AI-generated |
| Eastbrook Weekly Vault placeable model (public/models/tidehold/vault.glb, its .lod.glb far twin and ... | deterministic |
| Fenbridge's Fenrire look of the painted Tidehold buildings (public/models/tidehold/fenrire/{hall,hou ... | AI-generated |
| Highwatch's Alpine slate look of the painted Tidehold buildings ... | AI-generated |
| Highwatch adventurers' guild, Lantern Hall (public/models/tidehold/highwatch/guild.glb, and its ... | AI-generated: Tripo under the owner's paid Tripo plan |
| The pantile town look of the painted Tidehold buildings (public/models/tidehold/pantile/{house_a,sho ... | AI-generated |
| The shakes town look of the painted Tidehold buildings (public/models/tidehold/shakes/{hall,house_a, ... | AI-generated |
| The diamond town look of the painted Tidehold buildings (public/models/tidehold/diamond/{hall,house_ ... | deterministic |
| The brick town look of the painted Tidehold buildings (public/models/tidehold/brick/{hall,house_a,sh ... | deterministic |
| The thatch town look of the painted Tidehold buildings (public/models/tidehold/thatch/{hall,house_a, ... | deterministic |
| Gourdlight Eve seasonal kit (public/models/props/gourdlight_decor.glb: the carved pumpkins, gourds, ... | AI-generated |
| Gourdlight Eve field boss and mount (public/models/creatures/gourdlight_{thatchgrin,strawling,swelli ... | AI-generated |
| WOC Terrain Textures and WOC Asset Textures packs (the source images under ... | deterministic |
| Worn-metal surface-detail PBR texture (RustCoarse01, from rust_coarse_01; ... | deterministic |
| Medieval wood surface-detail PBR texture (MedievalWood, from medieval_wood; ... | deterministic |
| HDRI environment maps (kloofendal_48d_partly_cloudy_puresky, belfast_open_field, kiara_1_dawn, ... | deterministic |
| Vale Cup practice-pitch skybox (env/space_galaxy.jpg, the 360 degree Milky Way panorama) | deterministic |
| Water normal maps (waternormals.jpg, Water_1/2_M_Normal.jpg) | deterministic |
| Basis Universal KTX2 transcoder (public/basis/basis_transcoder.js/.wasm, copied from three r165 ... | deterministic |
| Biome backdrop panoramas (vale_backdrop.webp, marsh_backdrop.webp, peaks_backdrop.webp and 4K ... | deterministic |
| Fel meteor POWERFUL VFX sprite (public/vfx/fel_meteor_impact.png) | AI-generated |
| Loading-screen artwork (public/textures/loading/*.webp) | AI-generated |
| Website fractured portal (public/website-fractured-portal-v1.svg, ... | AI-generated |
| Website feature icons (public/website-feature-classes-v1.webp, public/website-feature-open-v1.webp) | AI-generated |
| Website stone gateway (public/website-stone-gateway-v2.svg) | AI-generated |
| Website parchment scroll (public/website-parchment-scroll-v1.svg, ... | AI-generated |
| Eastbrook website hero (public/website-hero-eastbrook-v1.webp) | AI-generated |
| Galecrest website hero (public/website-hero-galecrest-v1.webp) | AI-generated |
| Drakelands website hero (public/website-hero-drakelands-v1.webp) | AI-generated |
| Thornpeak website hero (public/website-hero-thornpeak-v1.webp) | AI-generated |
| Elite dragon rank emblem (public/ui/ranks/elite-dragon-frame.webp) | AI-generated |
| Warfare Season 2 Warrior item icons (public/ui/items/vanguard_warrior_*.webp) | AI-generated |
| Warfare Season 2 Rogue item icons (public/ui/items/vanguard_rogue_*.webp) | AI-generated |
| Warfare Season 2 Druid item icons (public/ui/items/vanguard_druid_*.webp) | AI-generated |
| Buried Hoards arcane icons (four objects, three tiers) | AI-generated |
| Buried Hoards frost icons (four objects, three tiers) | AI-generated |
| Buried Hoards ember icons (four objects, three tiers) | AI-generated |
| Buried Hoards storm icons (four objects, three tiers) | AI-generated |
| Buried Hoards brute icons (four objects, three tiers) | AI-generated |
| Buried Hoards venom icons (four objects, three tiers) | AI-generated |
| Buried Hoards necro icons (four objects, three tiers) | AI-generated |
| Buried Hoards tide icons (four objects, three tiers) | AI-generated |
| Faction rift vendor icons | AI-generated |
| Faction church vendor icons | AI-generated |
| Faction automaton vendor icons | AI-generated |
| Clue item icons | AI-generated |
| Rewards item icons | AI-generated |
| Bastion dungeon item icons | AI-generated |
| Temple dungeon item icons | AI-generated |
| Wildheart dungeon item icons | AI-generated |
| Gravewyrm dungeon item icons | AI-generated |
| Crypt dungeon item icons | AI-generated |
| Bastion-blues dungeon item icons | AI-generated |
| Temple-blues dungeon item icons | AI-generated |
| Crypt-blues dungeon item icons | AI-generated |
| Friendship referral reward icons (five former temporary aliases) | AI-generated |
| Warfare Season 2 Warlock item icons (public/ui/items/vanguard_warlock_*.webp) | AI-generated |
| Warfare Season 2 Mage item icons (public/ui/items/vanguard_mage_*.webp) | AI-generated |
| Warfare Season 2 Shaman item icons (public/ui/items/vanguard_shaman_*.webp) | AI-generated |
| Warfare Season 2 Priest item icons (public/ui/items/vanguard_priest_*.webp) | AI-generated |
| Warfare Season 2 Hunter item icons (public/ui/items/vanguard_hunter_*.webp) | AI-generated |
| Warfare Season 2 Paladin item icons (public/ui/items/vanguard_paladin_*.webp) | AI-generated |
| Leaderboard podium medals (public/ui/leaderboard/medal_{gold,silver,bronze}.webp) | AI-generated |
| Eastbrook Vale rebuild master concept, nine turnaround sheets, full-color surface-atlas source, and ... | AI-generated |
| Eastbrook finishing-pass master concept and Ravenpost mailbox / noticeboard turnaround sheets ... | AI-generated |
| Ignivar raid expansion automata, Forgefather, warhammer, and grand-forge concepts ... | AI-generated |
| Eastbrook shared surface atlas (public/textures/eastbrook_surface_atlas.webp; accepted source and ... | AI-generated |
| Fenbridge rebuild master concept and fourteen isolated turnaround sheets ... | AI-generated |
| Fenbridge shared surface maps (public/textures/fenbridge_surface_atlas.webp, ... | AI-generated |
| Meshy creature models (tolling_bell, spider_egg_sac from the Drowned Litany, yumi_cat from Protect ... | AI-generated |
| Legacy Claudium prototype weapon models and source images (emberfang, Red Skull, and Purple sets, ... | deterministic |
| Starter weapon models (the five starting weapons, the starting shield, the hunter's crossbow and ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Common and uncommon "field" weapon models (ten plain shapes in up to three painted looks, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Rare weapon models (two designs per weapon type in up to three painted finishes, and two rare ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Epic weapon models (one design per named weapon line in up to three painted finishes, and two epic ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Bag icons (public/ui/items/{backpack,linen_pouch,travelers_knapsack,wolfhide_satchel,gravewoven_bag, ... | deterministic |
| Historical CraftPix item identity references for the item-art consistency replacements (255 ... | deterministic |
| Professions 2.0 commissioned art set (public/ui/professions/*.webp except gather_farming.webp, the ... | deterministic |
| Masterwrought art-completion wave (181 painted assets across public/ui/items/, public/ui/deeds/, ... | AI-generated |
| Bank-storage painted bag catalog (public/ui/items/{wayfarers_backpack,burlap_reagent_pouch,necromanc ... | AI-generated |
| Field Kit gathering-tool icon (public/ui/items/field_kit.webp, batch ... | AI-generated |
| Generated item icon rebrand (public/ui/items/*.webp, exact IDs under generatedBatches in ... | AI-generated |
| Item-art consistency replacement paintings (public/ui/items/*.webp, exact IDs in the ... | AI-generated |
| Class ability icons (public/ui/skills/<class>/*.webp, excluding entries with an explicit ... | deterministic |
| v0.29 Hunter, Shaman, and Priest class rework ability icons (31 files recorded as project-generated ... | AI-generated |
| Generated class ability additions (public/ui/skills/<class>/*.webp, exact ... | AI-generated |
| v0.29 Hunter, Shaman, and Priest class rework ability icons (31 files recorded as project-generated ... | AI-generated |
| Paladin overhaul and talent ability icons (entries marked as OpenAI-generated original project ... | AI-generated |
| Generated Warlock spell and talent icons (exact IDs under generatedBatches in ... | AI-generated |
| Warlock pet signature action icons (emberkin_felbolt, gloomshade_abyssal_chain) | AI-generated |
| Shared pet action-bar command icons (public/ui/skills/pet/*.webp) | AI-generated |
| Exact runtime aura paintings (public/ui/auras/*.webp) | AI-generated |
| v0.39 second-pass legacy class-icon replacements (58 exact entries in the Druid, Hunter, Mage, ... | AI-generated |
| v0.39 second-pass gameplay UI paintings (public/ui/currency/*.webp, public/ui/delve-affixes/*.webp, ... | AI-generated |
| Collective Reversal and Hourglass of Suspension ability icons ... | deterministic |
| Season 1 Armory weapon models, source images, generated store thumbnails, and promotional card ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Membership and Refer a Friend promotional cards (public/ui/store/membership-promo.webp, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Painted storybook ground textures (public/textures/terrain/Painted{Meadow,DryGrass,Dirt,Cobble,Sand, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Tripo3d vegetation prop models (public/models/props/reeds.glb) | AI-generated: Tripo under the owner's paid Tripo plan |
| Storybook world foliage models (public/models/foliage/{oak_1..oak_5,pine_1..pine_5,dead_1..dead_3,bu ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Storybook leaf-card atlases (Fable_LeafCards_Broadleaf, Fable_LeafCards_Conifer and ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Mirefen mudfin hut models (public/models/props/mudfin_hut_a.glb, mudfin_hut_b.glb) | AI-generated: Tripo under the owner's paid Tripo plan |
| Claudium visual asset set (public/claudium/: coin, UI icons, and denomination stacks; excludes the ... | deterministic |
| Sampled interface and event sound effects (public/audio/sfx/ui_*.mp3, except ui_level_up.mp3 and ... | deterministic |
| Integration 45 foundations deed crests (exp_the_last_keep, exp_dawnhold_castle, ... | AI-generated |
| Integration 45 crucible deed crests (dgn_ignivar, dgn_ignivar_heroic, dgn_varkhul, ... | AI-generated |
| Integration 45 worldquests deed crests (exp_arcane_calligraphy, exp_arcane_calligraphy_gold, ... | AI-generated |
| Integration 45 factions deed crests (prog_rift_watch_trusted, prog_church_order_trusted, ... | AI-generated |
| Integration 45 adventures deed crests (exp_clue_first_casket, exp_clue_ten_caskets, ... | AI-generated |
| Integration 45 bastion deed crests (dgn_olen_buttress, dgn_ossick_moored, dgn_vael_beacon, ... | AI-generated |
| Integration 45 temple deed crests (dgn_selthe_pitch, dgn_colossus_mirror, dgn_ysolei_high_and_dry, ... | AI-generated |
| Integration 45 crypt deed crests (dgn_crypt_knellwyrm, dgn_marrow_tidy, dgn_lady_nobody_hanging, ... | AI-generated |
| Integration 45 wildheart deed crests (dgn_beastmaster_apart, dgn_gorgebloom_clean, ... | AI-generated |
| Integration 45 gravewyrm deed crests (dgn_korgath_all_chains, dgn_korgath_still_bound, ... | AI-generated |
| Book of Deeds achievement icons (public/ui/deeds/*.webp, excluding the project-generated additions ... | deterministic |
| Generated Book of Deeds additions (chr_peaks_gatherer, chr_marsh_rares_ii, chr_peaks_rares_ii, ... | AI-generated |
| v0.36 placeholder-art completion Book of Deeds additions (chr_amberfall_first_cast, ... | AI-generated |
| v0.36 release-audit Reliquary Book of Deeds additions (col_reliquary_rank_2, col_reliquary_rank_3, ... | AI-generated |
| Masterwrought jewelcrafting Book of Deeds addition (prog_jewelcrafting_rare under public/ui/deeds/) | AI-generated |
| Gourdlight Eve Book of Deeds addition (feat_gourdlight_guise under public/ui/deeds/) | AI-generated |
| Masterwrought jewelcrafting milestone crests (prog_jewelcrafting_50, prog_grandmaster_jewelcrafting ... | AI-generated |
| Masterwrought inscription milestone crests (prog_inscription_rare, prog_inscription_50, ... | AI-generated |
| Masterwrought farming, fishing, and promotion deed crests (col_deepest_cast, prog_first_planting, ... | AI-generated |
| Historical v0.36 painted per-item weapon inventory wave (119 base-weapon paintings recorded by ... | AI-generated |
| v0.36 generated specialization emblems (public/ui/specs/{paladin,hunter,rogue,priest,shaman,warlock, ... | AI-generated |
| v0.36 generated creature-family and status crests (public/ui/crests/families/*.webp and ... | AI-generated |
| Deterministically corrected mob target portraits (public/ui/mobs/{bogtoad,breach_wretch,castaway_nav ... | deterministic |
| Ignivar raid target portraits (public/ui/mobs/{ignivar_cinder_artificer,ignivar_crucible_warden,igni ... | deterministic |
| HUD chrome launcher icons (public/ui/chrome/*.webp, one per primary destination in the side rail ... | AI-generated |
| Map and minimap marker paintings (public/ui/map-markers/*.webp) | AI-generated |
| World-map continent overview plate (public/map_art/world_overview.webp, the painted backdrop of the ... | AI-generated |
| Guide webfonts (public/fonts/*.woff2: Cinzel by Natanael Gama; Alegreya and Alegreya Sans by Juan ... | deterministic |
| Owner-provided Mage artwork (fireball_form.webp, counterspell.webp) | deterministic |
| Owner-provided Druid artwork (public/ui/skills/druid/cat_form.webp, the Cat Form lynx head) | deterministic |
| Temporal clock sound effect (public/audio/sfx/temporal_clock.mp3) | deterministic |
| Remastered streamed soundtrack (public/audio/music/*.mp3: town, overworld, dungeon, and battle ... | deterministic |
| Original Ignivar raid ambient suite retained for authoring (ignivar_forge_approach, ... | deterministic |
| Crucible floor soundtrack (final assets listed in the [floor soundtrack source ... | deterministic |
| Proving Shore candidate cues (docs/music/proving-shore-candidates/*.mp3, the audition decision ... | deterministic |
| Proving Shore island cue (public/audio/music/proving_shore.mp3, "Welcome to Adventure") | deterministic |
| Morthen the Gravecaller boss-fight cue (public/audio/music/boss_morthen.mp3) | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Dungeon boss-fight cues (public/audio/music/boss_*.mp3, excluding Morthen) | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Rideable mount models (valorsteed, grag_bear, stalkglider_snail, aether_hover_cycle, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Drakemaw Raptor mount (public/models/mounts/drakemaw_raptor.glb, also the Friendship Raptor's body) | AI-generated: Tripo under the owner's paid Tripo plan |
| Dreadspark Groundshaker rideable mount model (public/models/mounts/terrorspark_groundshaker.glb) | deterministic |
| Masterwrought inscription tome held models (public/models/weapons/{tome_silverleaf,tome_goldleaf,tom ... | deterministic |
| Goblin Rocket Sled mount (public/models/mounts/goblin_rocket_sled.glb) and item painting ... | AI-generated |
| Lanternback Troll rideable mount model (public/models/mounts/lanternback_troll.glb) | deterministic |
| Lanternback Troll reins icon (public/ui/items/reins_lanternback_troll.webp) | deterministic |
| Lantern Hall Destrier rideable mount model (public/models/mounts/lantern_hall_destrier.glb) | deterministic |
| Lantern Hall Destrier reins icon (public/ui/items/reins_lantern_hall_destrier.webp) | deterministic |
| Blade of Lantern Hall sword appearance (public/models/weapons/lantern_hall_sword.glb, ... | deterministic |
| Lantern Hall elemental weapon appearances: Hearthbrand, Squallcrest, Rimelight Staff, Duskwick ... | deterministic |
| Nightwing Chimaera rideable mount model (public/models/mounts/nightwing_chimera.glb) and reins icon ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Chimeglass Tortoise rideable mount model (public/models/mounts/chimeglass_tortoise.glb) | deterministic |
| Chimeglass Tortoise reins icon (public/ui/items/reins_chimeglass_tortoise.webp) | deterministic |
| Wobbles the Slime rideable mount model (public/models/mounts/wobbles_slime.glb) | AI-generated: Tripo under the owner's paid Tripo plan |
| Wobbles the Slime reins icon (public/ui/items/reins_wobbles_slime.webp) | deterministic |
| Rift dimensional gate model (public/models/props/rift_portal.glb) | AI-generated |
| Rift arcane flame + rune monolith props (public/models/props/rift_flame.glb, rift_rune.glb) | AI-generated: Tripo under the owner's paid Tripo plan |
| Eastbrook ferry transport ship (public/models/props/eastbrook_ferry.glb: hull, sails, sea-serpent ... | deterministic |
| Harbor route marker signpost (public/models/props/harbor_route_marker.glb: post, arrow board, ... | deterministic |
| Wyrmwatch cliff harbor (public/models/props/wyrmwatch_harbor.glb: the Drakelands ferry berth's ... | deterministic |
| Wickharbor ferry wharf (public/models/props/wickharbor_wharf.glb: the Wickharbor ferry berth's ... | deterministic |
| Wickharbor harbor (public/models/props/wickharbor_harbor.glb: Wickharbor's shore boardwalk, the ... | deterministic |
| Mirefen tavern (public/models/props/mirefen_tavern.glb: the walk-in inn on the Fenbridge road, its ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Drowned Temple creatures (public/models/creatures/temple_*.glb except temple_ice_wraith.glb, ... | deterministic |
| Drowned Temple Ice Wraith (public/models/creatures/temple_ice_wraith.glb) | AI-generated: Tripo under the owner's paid Tripo plan |
| Drowned Temple kit (public/models/props/drowned_temple_kit.glb: the pearl-stone columns, the ... | deterministic |
| Sunken Bastion spectral sailor (public/models/creatures/bastion_ghost_sailor.glb) and haunted brig ... | deterministic |
| Enemy and dungeon boss bodies made through the designer's model guide ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Gravewyrm Sanctum Seal Gate (public/models/props/sanctum_seal_gate.glb, ... | deterministic |
| Gravewyrm Sanctum interior kit (public/models/props/gravewyrm_sanctum_interior.glb: the Lock ... | deterministic |
| Gravewyrm Sanctum Korgath maul clips (public/models/creatures/woc_sanctum_korgath_clips.glb: a clip ... | deterministic |
| Sunken Bastion Drowned Gate Tower (public/models/props/sunken_bastion_entrance.glb, ... | deterministic |
| Hollow Crypt Fallen Chapel (public/models/props/hollow_crypt_entrance.glb, ... | deterministic |
| Drowned Temple Moon Stair (public/models/props/drowned_temple_entrance.glb, ... | deterministic |
| Wildheart Basin Jaguar Maw (public/models/props/wildheart_basin_entrance.glb, ... | deterministic |
| Ignivar raid forge-mech dressing props (public/models/dungeon/ignivar_prop_*.glb: beams, pillars, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Drakelands rebuild kit props (public/models/drakelands_kit/*.glb: town buildings and bases, church, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Realm sky HDRIs (hollow_dusk, ember_storm, frost_twilight, amber_sunset, fen_day, nightbloom_dream, ... | deterministic |
| Zone map overlays (public/map_art/*.png) | deterministic |
| Infernal Citadel props (public/models/props/infernal_brazier.glb, infernal_altar.glb, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated class skin-suit set "Prismatic Vanguard" (suit_prismatic, all classes, ... | deterministic |
| Generated class skin-suit set "Liquid Chrome" (suit_chrome, all classes, ... | deterministic |
| Remaining generated world, interface, event, and ambience sound effects not attributed below ... | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Ignivar encounter voice lines (public/audio/voice/ignivar/*.mp3) | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Varkhul encounter voice lines (public/audio/voice/varkhul/*.mp3) | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Lantern Hall Destrier whinny takes (mount_neigh_lantern_hall_destrier_1.mp3, ... | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Valorsteed gallop layer (mount_run_valorsteed.mp3) | deterministic |
| Mount footfall layers (mount_run_grag_bear.mp3, mount_run_shadowjump_toad.mp3, ... | deterministic |
| Stalk-Glider slime layer (mount_run_stalkglider_snail.mp3) | deterministic |
| Shadow-Jump Toad slime layer (mount_run_shadowjump_toad.mp3) | deterministic |
| Hover-Cycle movement layer (mount_run_aether_hover_cycle.mp3) | deterministic |
| Stormfeather and Grand Gobbler wing layers (mount_run_stormfeather_griffin.mp3, ... | deterministic |
| Dreadspark Groundshaker movement layer (mount_run_terrorspark_groundshaker.mp3) | deterministic |
| Mirefen tavern room bed (amb_tavern.mp3) | deterministic |
| Gourdlight Eve sound effects (proj_gourdfall_whistle.mp3, impact_gourdfall.mp3, ... | deterministic |
| Gathering strike sound effects (impact_gather_pick_{1,2}.mp3, impact_gather_axe_{1,2}.mp3, ... | AI-generated: ElevenLabs, generated 2026-11-04 while the account was on the FREE tier; regenerate on the paid plan before release |
| Outdoor reverb impulse responses (generated at runtime by src/game/outdoor_reverb_ir.ts) | deterministic |
| Cluckwork Mech Bird take set (mount_run_mech_bird.mp3, mount_idle_mech_bird.mp3, ... | deterministic |
| Bonebound Rickshaw rolling loop (mount_loop_rickshaw_mount.mp3) | deterministic |
| Quest event sounds (quest_accept, quest_ready, quest_complete) | deterministic |
| Lockpick minigame sounds (lockpick_*) | deterministic |
| Wand auto-attack sounds (wand_*) | deterministic |
| Level-up and Book of Deeds achievement chimes (ui_level_up, ui_achievement) | deterministic |
| Magic-school impact and casting-support one-shots (impact_*, heal_impact, buff_apply, debuff_apply, ... | deterministic |
| Magic-school projectile launches (proj_*) | deterministic |
| Melee, footstep, movement, combat-reaction, and player-state sounds (melee_*, foot_*, move_*, ... | deterministic |
| Creature vocalizations, every mob family (mob_*) | deterministic |
| Generated prop model (marsh_plank_bridge) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (marsh_shrine_fragment) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (marsh_corpse_candle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (marsh_bell_gallows) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (marsh_sluice_post) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (marsh_dead_tree) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (marsh_reed_cluster) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (yumi_brazier_stand) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (yumi_torch_handle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (dungeon_door_arch) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (crypt_ritual_circle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (delve_module_exit) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (delve_surface_exit) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (delve_rite_shrine_bell) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (delve_rite_shrine_candle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (delve_rite_shrine_reed) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (delve_rite_shrine_skull) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (delve_pressure_plate) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (marsh_root_wall) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (training_dummy) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (gravewing) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated character form + animations (lich_form) | AI-generated: Tripo under the owner's paid Tripo plan |
| Contributor-provided animated raid boss model and fire VFX (ignivar_herald) | deterministic |
| Contributor-provided animated raid add models (cinder_artificer, crucible_warden, ember_sentinel) | deterministic |
| Generated prop model (engineering_workbench) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (alchemy_cauldron) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (cooking_spit) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (leatherworking_rack) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (tailoring_loom) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (inscription_lectern) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (enchanting_altar) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (jewelcrafting_bench) | AI-generated: Tripo under the owner's paid Tripo plan |
| Great Maze prop models (public/models/props/maze_hedge_wall.glb, maze_hedge_arch.glb, ... | deterministic |
| Evergarden flower bed models (public/models/props/flower_bed_square_a.glb, flower_bed_square_b.glb, ... | deterministic |
| Galecrest monument models (public/models/props/ship_monument.glb, golden_horse_statue.glb) | deterministic |
| Generated prop model (mining_ore_cart) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (herbalism_drying_rack) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (banker_chest) | deterministic |
| Generated landmark model (eastbrook_grand_armoury) | deterministic |
| Generated Eastbrook town kit (eastbrook_bank, eastbrook_smithy, eastbrook_inn, eastbrook_chapel, ... | deterministic |
| Generated Eastbrook Realm Builder monument (eastbrook_realm_builder_monument, plus its 8-view ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated Eastbrook Ravenpost mailbox (mailbox_pillar) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated Eastbrook public noticeboard (eastbrook_noticeboard) | deterministic |
| Generated Mirefen muster camp kit (muster_palisade, muster_barricade, muster_gate, ... | deterministic |
| Generated muster training effigy and stake mallet (muster_effigy, muster_mallet) | deterministic |
| Generated Balgath Boulder Toss VFX kit (public/models/vfx/balgath_boulder.glb: boulder, chunk_0 to ... | deterministic |
| Generated Balgath Starwake VFX kit (public/models/vfx/balgath_starwake.glb: star_crystal_0 to ... | deterministic |
| Generated farming prop set (public/models/props/farm_bed.glb, farm_sprout.glb, ... | deterministic |
| Generated prop model (maledict_eye) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (emberkin) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (pyre_colossus) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (gloomshade_abyssal_guardian) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature models + animations (hoard_abyssal_maw, hoard_hoarfrost_warden) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature models (hoard_emberforge_tyrant, hoard_archon_nyxaris, hoard_tempest_vharok) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated hoard room creatures (hoard_tide_thrall, hoard_frost_revenant, hoard_ember_fiend, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated cave boss models (hoard_boss_mushroom, hoard_bloat_cap) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated cave boss models (hoard_boss_mole, hoard_boss_bat, hoard_boss_mimic) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated Fenbridge town kit (fenbridge_warden_gatehouse, fenbridge_crooked_reed_inn, ... | deterministic |
| Generated prop model (wildheart_jaguar_gate) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_ritual_pyramid) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_canopy_platform) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_rope_bridge) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_beast_den) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_mask_totem) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (wildheart_ravager) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (wildheart_hexcaller) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (wildheart_beastmaster) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (wildheart_high_priest) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_limestone_cliff) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (wildheart_stalker) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_giant_fern) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_ancestor_ruin) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wildheart_jungle_canopy_tree) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_eastbrook_civic) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_mirefen_witchflame) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_thornpeak_beacon) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_veiled_crystal) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_drakelands_brazier) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_frostveil_icicle) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_amberfall_crystal) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_willowfen_reed) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_nightbloom_moonflower) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_wraithwood_ghost) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_palmreach_totem) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_evergarden_flower) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (frostveil_ice_spire) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_galecrest_mast) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (streetlamp_farshore_coral) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (bear_form, the druid Bear Form quadruped) | AI-generated: Tripo under the owner's paid Tripo plan |
| Druid cat form model and animations (public/models/creatures/druid_cat_form.glb) | AI-generated: Tripo under the owner's paid Tripo plan |
| Ignivar Ashcaller creature model + animations (public/models/creatures/ignivar_ashcaller.glb) | deterministic |
| Generated prop model (varkhul_grand_forge) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wreckage_broken_planks) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wreckage_waterlogged_barrel) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wreckage_damaged_crate) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wreckage_fallen_anchor) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wreckage_hull_fragment) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (wreckage_capsized_rowboat) | AI-generated: Tripo under the owner's paid Tripo plan |
| World Quests shipwreck placement kit (public/models/world_quests/shipwreck/) | AI-generated: Tripo under the owner's paid Tripo plan |
| Confection Cascade candy atlas (public/ui/minigames/confection-candies.webp) | AI-generated |
| Confection Cascade walnut coffer material (public/ui/minigames/confection-walnut.webp) | AI-generated |
| Confection Cascade artisan frame, brass hardware and result seals (public/ui/minigames/*-v4.webp) | AI-generated |
| Confection Cascade symmetrical emerald ornament (public/ui/minigames/confection-jewels-v5.webp) | AI-generated |
| Confection Cascade solid emerald and winged lock hardware (public/ui/minigames/*-v6.webp) | AI-generated |
| Confection Cascade polished gold hardware mounts (public/ui/minigames/*-v7.webp) | AI-generated |
| Generated prop model (nythraxis_bone_spike) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated prop model (nythraxis_binding_cage) | AI-generated: Tripo under the owner's paid Tripo plan |
| Buddy model, animations, faces and whistle icon (Flicker and Glimmer, the flame-sprite pair, ... | deterministic |
| Generated prop model (windrider_glider_flight) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (balgath_foreman) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (balgath_cyclops) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (balgath_barrowmaul_hammer) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated weapon model + icon (shardpike_spear) | AI-generated: Tripo under the owner's paid Tripo plan |
| Shardpike world-boss item and mechanic icons (skerrits_shardpike, lance_brace, lance_thrust, ... | AI-generated |
| Balgath eye-ward world-boss status badges (eye_ward_sealed, eye_ward_open, eye_ward_blinded) | AI-generated |
| Foreman's Wage world-boss item icons (foremans_wage_band, mirelight_locket, fenwright_grips) | AI-generated |
| Generated buddy model + animations (horse, the low-poly pony companion, ... | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated buddy model, animations and whistle icon (sapling, public/models/buddies/sapling.glb) | AI-generated: Tripo under the owner's paid Tripo plan |
| Generated creature model + animations (sporemender_form) | AI-generated: Tripo under the owner's paid Tripo plan |
| Ley Beam Alignment celestial frame and crystal heart (public/ui/minigames/ley-*-v1.webp) | AI-generated |
| Generated prop model (spore_burster) | AI-generated: Tripo under the owner's paid Tripo plan |
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

