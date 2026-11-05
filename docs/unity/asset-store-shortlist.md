# Asset Store shortlist (budget: up to 300 USD)

Status: research only. NOTHING has been bought; the owner buys. Prices, pipeline support and
dates were read from each Asset Store listing on 2026-11-05 and change often (sales, VAT,
new versions), so re-check each listing at purchase. Listing descriptions on the Asset Store
render client-side and were often empty to our fetcher, so "what it covers" below comes from
the listing title, tags and file size where the page gave nothing else; the owner should look
at each listing's screenshots and video before buying.

## The brief the packs were chosen for

Fable as the reference: stylized shapes and a warm storybook palette, with REALISTIC material
detail (stone, wood grain, moss, cloth, worn metal), dense foliage and ground cover, soft
shadows, GI approximation, volumetric fog and light shafts. So: realistic-material medieval and
nature packs that can be graded warm (`asset-pipeline.md` section 1, rule 4: warmth comes from
light and grade, not albedo), not cartoon or low-poly packs, and not gritty desaturated ones.
Render pipeline: URP (`asset-pipeline.md` section 7), Unity 6.3 LTS.

## Licensing facts that apply to every pack

- Commercial use in a shipped game is allowed "as long as the asset is embedded and integrated
  into your game" and you hold enough licenses ([Asset Store EULA
  FAQ](https://assetstore.unity.com/browse/eula-faq)).
- **Every pick below is listed as an "Extension Asset"** under the Standard Unity Asset Store
  EULA. The FAQ says an Extension license "requires one seat per person on your project where
  the asset is installed", assigned in the Cloud Dashboard. So these are PER SEAT, not per
  company: one seat covers the owner; every additional HUMAN collaborator who opens the Unity
  project needs their own seat. OWNER DECISION: confirm with Unity support how seats apply to
  AI crews running on the owner's own machines under the owner's account (our reading: they
  act as the owner, one seat, but this is not stated in the FAQ).
- Single Entity is the right tier (individuals and small businesses); Multi Entity is for
  affiliates and contractors.
- The EULA forbids shipping assets in a form users can extract separately, so purchased packs
  must never be committed to the public `world-of-aeternum` repo (`vertical-slice-plan.md`
  section 3) and must not be exposed to add-ons or a modding SDK.
- **AI-generated content:** none of the picks discloses AI-generated content on its listing.
  One candidate, "Modular Medieval Village Kit" by Lix300 (15 USD), shows a "Created with AI"
  heading ([listing](https://assetstore.unity.com/packages/3d/environments/historic/modular-medieval-village-kit-410014))
  and is EXCLUDED: it carries IP and quality uncertainty this project's originality rules
  (`src/sim/content/CLAUDE.md`, "Naming originality") exist to avoid. Check the AI disclosure
  block on every listing again at purchase.
- Every purchased asset gets a `CREDITS.md` row in the Unity repo (publisher, listing URL,
  license: Standard Unity Asset Store EULA, Extension Asset, seats).

## The shortlist

| # | Pack | Publisher | Price (USD) | Pipelines | Unity 6 | Last update | Covers |
|---|---|---|---|---|---|---|---|
| 1 | [Medieval Village - A Middle Ages Environment Pack, Buildings Kit](https://assetstore.unity.com/packages/3d/environments/historic/medieval-village-a-middle-ages-environment-pack-buildings-kit-322104) | PolyGo Studios | 69.99 | Built-in, URP, HDRP | not listed (tested 2022.3.62f1) | 1.0, 2025-06-09 | barns, blacksmith, thatched buildings, farm, forest and town dressing; tagged photorealistic; 2.8 GB |
| 2 | Meadow Environment - Dynamic Nature | NatureManufacture | 60.00 (price from the dependency list of [this listing](https://assetstore.unity.com/packages/slug/304118)) | NatureManufacture states Built-in, URP and HDRP support for its tools ([Unity blog](https://blog.unity.com/en/games/create-high-fidelity-worlds-with-naturemanufacture)); verify on the pack's own listing | verify | verify | realistic meadow foliage, grass, flowers, trees, rocks with wind (Dynamic Nature) |
| 3 | [Stylized Water 3](https://assetstore.unity.com/packages/vfx/shaders/stylized-water-3-287769) | Staggart Creations | 50.00 | URP only | yes (6000.0.68f1) | 3.3.3, 2026-10-15 | rivers, lakes, ocean, waterfalls, buoyancy, underwater (extensions) |
| 4 | [Buto - Volumetric Fog and Volumetric Lighting for URP](https://assetstore.unity.com/packages/vfx/shaders/fullscreen-camera-effects/buto-2022-volumetric-fog-and-volumetric-lighting-258881) | OccaSoftware | 40.00 | URP | not stated (origin 2022.3.0); actively updated | 7.13.1, 2026-08-19 | volumetric fog, height fog, volumetric lights and shafts |
| 5 | [COZY: Stylized Weather 3](https://assetstore.unity.com/packages/tools/utilities/cozy-stylized-weather-3-271742) | Distant Lands | 50.00 | Built-in, URP, HDRP | not listed (tested 2022.3.62f1); actively updated | 3.6.23, 2026-09-04 | time of day, sky, clouds, weather, seasons, fog colour, ambience |
| 6 | [MicroSplat URP for Unity 6](https://assetstore.unity.com/packages/tools/terrain/microsplat-urp-for-unity-6-280883) (needs the free MicroSplat core) | Jason Booth | 20.00 | URP only | yes (6000.0.23f1) | 1.06, 2025-03-01 | terrain shading: many PBR layers, height blending, per-texture controls |
| | **Total** | | **289.99** before VAT | | | | |

### Why each one

1. **Village kit (PolyGo).** The town is the first thing every player sees, and a modular PBR
   kit gives Eastbrook real timber, plaster, stone and thatch materials in days instead of
   weeks. Chosen over the cheaper Hivemind kit because it is newer (2025 versus 2023) and
   tagged photorealistic; chosen over Leartes' Camelot because of price. Its buildings will be
   regraded warm and re-proportioned where needed (chunkier roofs and trims) to fit the
   stylized shape language. Risk: Unity 6 is not on the listing; the slice's M4 verifies the
   import.
2. **Meadow foliage (NatureManufacture).** Dense, realistic-material grass, flowers and trees
   with wind are the headline of the new look and the most expensive thing to make by hand.
   NatureManufacture is the long-running realistic nature publisher; its materials take a warm
   grade well. Verify URP and Unity 6 on the listing before buying; if it fails that check, take
   the alternate below.
3. **Water (Stylized Water 3).** URP-only, built for Unity 6, updated last month, and covers
   every water case Eastbrook Vale has (Mirror Lake, streams, the starter sea, waterfalls).
   "Stylized" here means art-directable rather than cartoon: colour, foam, depth and reflections
   are tunable toward the storybook look.
4. **Volumetric fog and light shafts (Buto).** URP has no built-in volumetric fog today (Unity
   lists it as future URP work), and fog plus shafts are a core part of the Fable atmosphere.
   Actively maintained in 2026. Fairness: its density must stay identical on every tier
   (`asset-pipeline.md` section 8, rule 2).
5. **Sky and time of day (COZY 3).** Gives a sky, clouds, sun and moon, and fog colour that can
   be DRIVEN by the server clock instead of its own (the slice ports
   `src/render/day_night_core.ts` and feeds COZY the time), so every client sees the same hour.
6. **Terrain shading (MicroSplat URP).** The terrain heightfield comes from the sim export; what
   makes it look detailed is many PBR layers with height blending and anti-tiling. MicroSplat's
   core is free and this module is the Unity 6 URP path.

### Categories deliberately left at 0 USD

- **Character base with modular armor.** No listing matched "slightly stylized faces, realistic
  armor materials" at this budget. Candidates checked and rejected: Dungeon Mason "Modular RPG
  Hero PBR" (25 USD, last updated 2022 with only Unity 2019.4 listed, tagged Mobile and low-poly,
  [listing](https://marketplace.unity.com/packages/3d/characters/humanoids/fantasy/modular-rpg-hero-pbr-124718))
  and Zerin Labs "Character Set Fantasy RPG" (13.99 USD, a PS1 retro style,
  [listing](https://assetstore.unity.com/packages/3d/characters/character-set-fantasy-rpg-185676)).
  Recommendation: keep the existing modular rigs and clips for the slice, and budget a
  commissioned or separately sourced base mesh for faces and bodies after the slice
  (`cost-and-risk.md`, risk 9).
- **UI kit.** The owner's complaint is that the game looks like a mobile game, and the popular
  fantasy GUI kits (for example Layer Lab's "GUI Pro" line) are built in that casual mobile
  language. The HUD should be designed once to the project's own `DESIGN.md` language and the
  new material look (M6 in the slice), not bought.

### Alternates (if a pick fails its check)

| Pack | Publisher | Price | Pipelines and Unity 6 | Note |
|---|---|---|---|---|
| [Modular Medieval Town - Medieval Village - Medieval City](https://assetstore.unity.com/packages/3d/environments/fantasy/modular-medieval-town-medieval-village-medieval-city-260551) | Hivemind | 49.99 | URP and HDRP; only 2021.3.6f1 listed; 2.1, 2023-09-01 | cheaper town kit; older |
| [Medieval Village Environment / Camelot](https://assetstore-fallback.unity.com/packages/3d/environments/historic/medieval-village-environment-camelot-244394) | Leartes Studios | 159.99 | Built-in, URP, HDRP; only 2021.3.6f1 listed; 2.0, 2024-05-07 | highest-end realistic option; would take most of the budget |
| [Medieval Nordic Village Environment](https://marketplace.unity.com/packages/3d/environments/historic/medieval-nordic-village-environment-279881) | BEFOUR STUDIOS | 64.99 | URP and HDRP; only 2021.3.30f1 listed; 1.0, 2024-11-23 | Nordic look; tagged AAA, detailed; 4.4 GB |
| [Castle Ruins Environment PBR, medieval props and vegetation](https://marketplace.unity.com/packages/3d/environments/historic/castle-ruins-environment-pbr-medieval-props-and-vegetation-122663) | Lugia 3D | 60.00 | Built-in, URP, HDRP; only 2021.3.30f1 listed; 1.1.1, 2024-05-08 | ruins and overgrowth for the Vale's edges |
| [Pure Nature 2: Meadows](https://assetstore.unity.com/packages/3d/environments/pure-nature-2-meadows-269085) | BK | 50.00 | URP (Unity 6000.0.34f1 listed); 2.2, 2026-07-31 | the foliage alternate: Unity 6 verified and current, but more stylized (tags say Pixar and Disney), so check it is not too cartoon for the brief |

## How the packs are used safely

- Packs live under `Assets/ThirdParty/` untouched; project materials and prefabs that adapt them
  live under `Assets/Wyndlewood/`, so a pack update never overwrites crew work.
- Every pack material is converted to the project's URP Lit variant and passed through the
  material review gate (`asset-pipeline.md` section 6, step 3) under the three fixed lighting
  rigs before it appears in a zone.
- No pack content is ever fed to an AI generator as a reference image (the crew IP rule).
