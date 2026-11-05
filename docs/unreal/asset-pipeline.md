# Asset pipeline into Unreal Engine 5.8

Status: planning spec, written against `feature/player-housing` (merge `64d84727`). How the
existing assets get into an Unreal Engine 5.8 client, what carries over, what must be re-authored for the
"detailed stylized" target, which render pipeline to use, and how the graphics tiers stay fair.

## 1. The art target, restated as rules a crew can check

The owner's reference is Fable: stylized shapes and proportions, a warm storybook palette, and
REALISTIC material detail (stone, wood grain, moss, cloth weave, worn metal), dense foliage and
ground cover, and high-end lighting (soft shadows, GI or a good approximation, volumetric fog
and light shafts). Characters have slightly stylized faces and proportions with realistic
armor and clothing materials; no photoreal humans.

Checkable rules for every new or re-authored asset:

1. **Shape is stylized, surface is physical.** Silhouettes stay chunky and readable (the
   current "chunky readable shapes" brief in the shared crew rules); the material is a full PBR
   set with real micro detail. No painted-in lighting, no baked highlights or shadows in the
   base colour.
2. **Every material ships base colour, normal, and one packed ORM texture (R ambient occlusion,
   G roughness, B metallic, the Unreal and Megascans convention), plus an optional emissive.**
   Materials are instances of a small set of project master materials, never one-off graphs.
3. **Texel density:** 512 px per metre for hero props and characters in the 2K to 4K range,
   256 px per metre for buildings with tiling trims and a detail normal, terrain layers tiled
   at 2 m to 4 m with a macro variation map. One density table, checked by an editor script.
4. **Warmth comes from light and grade, not from albedo.** Base colours stay physically
   plausible (sRGB albedo between about 30 and 240), and the storybook palette comes from the
   key light colour, the sky, fog tint and a colour grade LUT. This is what lets realistic
   Fab packs sit in the same frame as crew-made art (the shortlist depends on it).
5. **Readability first:** gameplay-relevant objects (gather nodes, quest objects, interactables,
   enemies) keep a value contrast against their background in a greyscale check.

## 2. Inventory: what exists today

Counted with `git ls-tree -r --name-only origin/feature/player-housing public`:

| Asset class | Count | Where | Notes |
|---|---|---|---|
| GLB models | 2380 | `public/models/` (dungeon 439, medieval_village_v2 349, props 274, weapons 222, creatures 211, biome 208, tidehold 186, resources 143, chars 139, tools 69, foliage 38, mounts 25, others) | meshopt and quantized, KTX2 textures, custom `WOC_lod` extension |
| Animation clip libraries | dozens of `*_anims.glb` | `public/models/chars/` (for example `barbarian_hit_variety_anims.glb`, `druid_ability_anims.glb`, `bow_anims.glb`) | KayKit and Quaternius rigs, clip names per rig in `src/render/characters/manifest.ts` |
| KTX2 textures | 128 | `public/env/` (sky and environment maps at 512, 1k, 2k) and inside GLBs | Basis Universal; the HDR sources are 30 `.hdr` files |
| WebP | 4083 | item icons `public/ui/items/`, UI art, map backgrounds | 2D |
| MP3 | 1385 | `public/audio/sfx` 747, `public/audio/voice` 578, `public/audio/music` 58 | the SFX and music sources are rendered by `scripts/sfx/` and `scripts/render_music.mjs` |
| Total `public/` | about 1.5 GB | | |

Provenance: `CREDITS.md` lists KayKit, Quaternius, Kenney, ambientCG, Poly Haven and about 190
Tripo-generated rows. CC0 sources carry over freely; Tripo outputs follow the Tripo terms the
crews already ship under. Every asset added in Unreal still gets a `CREDITS.md` row (in the
Unreal project repo, see `vertical-slice-plan.md` section 3).

Glossary of glTF extensions found in `src/render` and `scripts` (`grep -rhoE`):
`EXT_meshopt_compression`, `KHR_mesh_quantization`, `KHR_texture_basisu`,
`KHR_materials_emissive_strength`, plus the in-house `WOC_lod` / `WOC_LOD` (LOD levels inside
one file, `src/render/assets/woc_lod_plugin.ts`) and several `WOC_*` head and morph markers used
by the modular characters.

## 3. Importing GLBs: Interchange glTF, then Nanite

Unreal 5.8 imports `.gltf` and `.glb` through the Interchange framework
([Epic: importing glTF](https://dev.epicgames.com/documentation/unreal-engine/importing-gltf-files-into-unreal-engine)),
scriptable from Python through `InterchangeGLTFTranslator` and the Interchange pipeline classes
([Python API](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/InterchangeGLTFTranslator?application_version=5.7)).
Epic's page does not list which glTF extensions are supported, and the shipping GLBs here use
`EXT_meshopt_compression`, `KHR_mesh_quantization`, `KHR_texture_basisu` and the in-house
`WOC_lod`, which a general importer cannot be expected to decode. So:

**Do not import the shipping GLBs directly.** Add a Node "unreal normalize" step in THIS repo
(proposed `scripts/unreal/normalize_glb.mjs`, built on the gltf-transform toolchain the pipeline
already uses in `scripts/asset_pipeline/lib/wizard.mjs`) that, per GLB:

1. decodes meshopt and quantization to plain float geometry;
2. decodes KTX2 back to lossless PNG (or, better, re-reads the pre-compression source texture
   when one exists);
3. splits `WOC_lod` levels into `name_LOD0.glb`, `name_LOD1.glb`, ... (static meshes that become
   Nanite need only LOD0; skeletal meshes keep their LOD chain);
4. writes the `WOC_*` character markers and collision hints to a sidecar JSON.

Then an editor Python script (`unreal` module, run headless as a commandlet, see
`vertical-slice-plan.md` section 4) imports each clean GLB through Interchange with a project
pipeline asset that: enables Nanite on static meshes, builds simple collision from the sidecar,
assigns material instances of the project master materials, and sets texture groups and
compression (BC7 colour, BC5 normal). Imports are reproducible from the script and a manifest,
so a re-import never depends on someone clicking dialogs.

Nanite: virtualized geometry removes most manual LOD work for static meshes (buildings, rocks,
props, and Nanite foliage), which suits dense ground cover and stone detail. Skinned characters,
translucent materials and some masked foliage cases still need traditional LODs; check each
category in the slice (M4).

Clip libraries: import as `UAnimSequence` sets on a shared skeleton per rig family, keep the
original clip names, and generate a `ClipMap` data asset from
`src/render/characters/manifest.ts` so the TS `BaseState` names (`idle`, `walk`, `run`,
`strafeLeft`, `cast`, `swim`, `sit`, `jump`, ...) map to the same clips. Use IK Retargeter to
share one locomotion set across the KayKit and Quaternius humanoid rigs; keep creature rigs
separate.

### Fab and Megascans licensing

- Fab sells under the Fab Standard License in two tiers: Personal for buyers whose gross
  revenue from commercial activity in the last 12 months is at most 100,000 USD, Professional
  above that ([Epic: licenses and pricing in Fab](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab)).
  The owner buys the tier that matches the studio's revenue and must upgrade before crossing
  the threshold.
- Fab Standard licensed assets may be used in any engine or tool, a broader grant than the
  old Epic Content License ([Epic forum, Megascans update March 2025](https://forums.unrealengine.com/t/megascans-update-march-2025/2419561)).
- Megascans stopped being free from 2025 ([80.lv](https://80.lv/articles/megascans-no-longer-free-after-2024/));
  anything claimed during the free period keeps its license. Check whether the owner's Epic
  account claimed the library in 2024 before paying for scans.
- Each Fab listing carries two AI flags: "Generated with AI" and whether it allows use with AI
  (the NoAI tag means it "must not be used for generative AI data collection", same Fab page).
  The crews must never feed NoAI-flagged content to a generator (and never feed ANY bought
  content to Tripo as a reference, the existing IP rule).

### MetaHuman

MetaHuman is free under the standard Unreal license for anyone under 1 million USD revenue
and can be used with any engine ([metahuman.com license](https://www.metahuman.com/license)).
Two constraints matter here:

- The Unreal EULA forbids using MetaHuman characters and animation curves "to build or enhance
  any database or training or testing any artificial intelligence"
  ([Unreal EULA section 6(e)](https://www.unrealengine.com/eula)). Crews must not export
  MetaHuman meshes or curves into Tripo or any generative tool.
- MetaHumans are realistic humans by design, while the target is slightly stylized faces. A
  MetaHuman can still be the BASE (topology, rig, facial controls) with stylized proportions and
  hand-painted-to-PBR skin, but that is a look-development question for the slice (M4). The
  cheaper default remains a stylized base mesh on the UE5 Manny/Quinn skeleton.

## 4. What carries over, what gets re-authored

| Asset class | Carries over as-is | Needs re-authoring for "detailed stylized" |
|---|---|---|
| Music (58 tracks) | yes; import MP3 or, better, re-render WAV from `scripts/render_music.mjs` and let Unreal compress it (Bink Audio or ADPCM) | no |
| SFX (747) and voice (578) | yes; import, and generate the volume and pitch table from `scripts/sfx/sfx_gain_map.json` and `sfx_speed_map.json` | no; add 3D spatial settings per category |
| Item icons and UI art (WebP) | yes as sprites for the slice | the HUD frame art is redesigned (it is part of the "mobile look" complaint) |
| Animation clips | yes | add-on clips later for the new bodies (the `blender-anim-pipeline` skill) |
| Creature models (211) | yes for the slice | hero creatures re-textured to PBR first, zone by zone |
| Weapons and tools (291) | geometry mostly yes | full PBR texture pass (metal, leather, wood) |
| Props (274) and resources (143) | geometry often yes | PBR texture pass; gather nodes keep their tier sizes |
| Buildings (`medieval_village_v2` 349, `tidehold`, `dungeon`) | blockout only | most re-authored as a modular PBR kit or replaced by a Fab kit |
| Terrain | heights carry over as DATA (section 5) | all ground materials re-authored as PBR terrain layers |
| Foliage and trees (`foliage`, `biome`) | no | re-authored: dense PBR foliage with wind, the biggest visual upgrade |
| Characters (139 in `chars`) | rigs and clips yes | bodies, faces and armor re-authored to the stylized-face, realistic-material target |
| Sky and environment maps (KTX2, HDR) | no | replaced by the sky and weather system |

## 5. World data: export the layout, do not redraw it

The terrain and the town layout are code today, not scene files: heights come from
`terrainHeight` and `groundHeight` (`src/sim/world.ts`), Eastbrook's layout from
`EASTBROOK_LAYOUT` (`src/sim/eastbrook_layout.ts`), colliders and placements from
`src/sim/colliders.ts` readouts (`bankerChestSpots`, `streetlampPlacements`, ...), and the rest of
the dressing from the render placement modules (`src/render/placed_assets.ts`).

Export pipeline (proposed `scripts/unreal/export_world.mjs`, run in Node against `src/sim` with
the realm seed from `hello.seed`):

- **Heightfield:** sample `terrainHeight(x, z, seed)` on a 0.5 yd grid per zone into 16-bit RAW
  tiles plus a JSON header (origin, spacing, min and max). Unreal imports them as Landscape heightmaps (16-bit PNG or RAW per World Partition
  region). A Vitest asserts the baked tile reproduces `terrainHeight` within 1 cm at random
  points, so feet planting in Unreal matches the server.
- **Water bodies, roads and splat regions:** export the lake circles, shore curves and paint
  regions the render terrain reads (`terrain_paint_layers.ts`, `terrain_region_core.ts`).
- **Placements:** export every collider-backed placement from `src/sim` directly. For the
  render-only dressing, the fastest exact source is the running client: a puppeteer script
  (the `scripts/*.mjs` E2E pattern) walks the renderer's scene graph through `window.__game`
  and dumps `{ asset url, position, rotation, scale }` per instance to JSON. An editor Python
  script places actors and Packed Level Actors by asset key from that file.
- **Rule:** the exported JSON is the source of truth for WHERE things are; Unreal levels are
  generated from it by code, never hand-placed, so crews do not edit binary `.umap` files
  (`cost-and-risk.md`, risk 6). Hand-authored dressing goes in Level Instances and additive
  "dressing" data files that the generator merges.

## 6. Producing PBR maps from the Tripo and Blender pipeline

Today `scripts/asset_pipeline/pipeline.mjs` already asks Tripo for PBR output
(`createTask('/generation/text-to-model' | '/generation/image-to-model', { texture: true,
pbr: true })`). The maps are then shrunk for the web: `scripts/asset_pipeline/lib/wizard.mjs`
re-encodes metallicRoughness, occlusion and emissive as 512 px JPEG and the normal map as a
256 px PNG, and the shipped GLB carries KTX2. That is fine for WebGL budgets and far too small
for the Unreal target.

Unreal lane changes (all additive, the web lane stays as it is):

1. **Keep the raw Tripo output.** Save `raw.glb` maps at the native resolution Tripo returned
   into an asset-source folder in the Unreal project repo, never into `public/`.
2. **Blender pass** (headless: `blender --background --python <script> -- <args>`, the same
   invocation shape the `blender-anim-pipeline` skill defines):
   - retopology or decimation to the poly budget, a clean UV layout, and a high-to-low bake
     where the Tripo mesh has the detail but the UVs are poor;
   - bake or derive: base colour (delit: remove baked shading with a high-pass and AO divide),
     a tangent-space normal in the OpenGL Y+ convention (glTF's convention; Unreal uses DirectX Y-, so the import flips green, or set Flip Green Channel on the texture),
     roughness, metallic, ambient occlusion;
   - pack the ORM texture (R occlusion, G roughness, B metallic);
   - export FBX or GLB plus the PNG set at 2K (hero) or 1K (common).
3. **Material review gate:** an editor Python script renders each asset on a neutral turntable under
   three fixed lighting rigs (noon, golden hour, night torch) and saves the sheet. The owner
   approves sheets, not files.
4. **Tiling materials** (stone, plaster, thatch, wood planks, cobbles, terrain layers): author or
   source as seamless 2K sets (ambientCG and Poly Haven are CC0 and already in `CREDITS.md`),
   then warm them through the grade, not the albedo.
5. **Characters:** Tripo for blockout and accessories only; faces and bodies need a proper base
   mesh (purchased or commissioned) because Tripo topology does not deform well around faces.
   This is called out as a risk in `cost-and-risk.md`.

Prompting rule carried over from the crew rules: original text prompts only, never another
game's reference images.

## 7. Rendering features for the target

Unreal has one renderer; the decisions are which features to lean on.

| Need | Unreal 5.8 answer |
|---|---|
| GI | Lumen (software ray tracing by default; hardware ray tracing on RTX for higher quality). Epic: the High scalability level targets 60 fps on current consoles, Epic targets 30 fps, Medium uses the cheaper Irradiance Field Gather aimed at low-end PC and Switch 2, and Low turns Lumen off ([Lumen performance guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-performance-guide-for-unreal-engine)) |
| Soft shadows | Virtual Shadow Maps (high resolution, soft penumbra); contact shadows on hero lights |
| Many lights | MegaLights where stable, otherwise a light budget with shadow-casting limits |
| Volumetric fog and light shafts | built in: Exponential Height Fog with volumetric fog, light shafts on the directional light, local fog volumes |
| Sky and day and night | Sky Atmosphere, Volumetric Clouds, Sky Light (real-time capture), driven by the server clock |
| Dense foliage and ground cover | Nanite foliage plus PCG scattering; Landscape grass for the near carpet |
| Terrain | Landscape with Runtime Virtual Texturing (or 5.8's new Mesh Terrain, evaluated in M4), layer blending with height |
| Colour and warmth | Post Process Volume: filmic tonemapper, LUT grade, bloom, local exposure |
| Streaming | World Partition with Data Layers and HLODs |

Version: build on 5.8.4 and stay on 5.8 for the slice. 5.8 is described as the last big
update before UE6 ([FeedBagel](https://feedbagel.com/post/unreal-engine-58)), so plan one
deliberate upgrade to UE6 after launch rather than tracking every release.

### Quality tiers (Scalability groups)

| Tier | Target | GI | Shadows | Fog | Foliage | Resolution |
|---|---|---|---|---|---|---|
| Epic | RTX 3070 class, 1440p 60 | Lumen High, hardware RT | VSM, high | volumetric, full | full density | TSR 75 percent |
| High | RTX 2060 class, 1080p 60 | Lumen High, software RT | VSM | volumetric | full near, thinned far | TSR 67 percent |
| Medium | GTX 1060 class, Steam Deck docked | Lumen Medium (Irradiance Field Gather) | VSM low or cascaded | volumetric, low | thinned far | TSR 58 percent |
| Low (min-spec, Steam Deck handheld) | 800p 30 | Lumen off, baked sky light fallback | cascaded shadow maps | height fog, non-volumetric | near only | TSR 50 percent |

The Low tier is the hard one: Lumen off changes the whole look, so the warm palette must hold
up under a plain sky light, and the fairness rules below must still hold.

## 8. The graphics-tier fairness rule (binding on every tier above)

From `docs/design/graphics-settings-fairness.md` and the root `CLAUDE.md` invariant: a
graphics or performance preset may shed COSMETIC richness but never ACTIONABLE information.
Actionable, identical on every tier: your own debuffs, party and raid HP, the target and boss
cast bar, target HP granularity, enemy and aggro positions, the fishing bobber and bite state,
minimap and map gather-node markers, and the node tier ladder expressed as size. Tier knobs
read the STATIC preset (`src/game/ui_effects_profile.ts`), never an FPS governor.

Unreal-specific consequences, to be pinned by Unreal automation tests the way
`tests/professions_graphics_fairness.test.ts` pins the web client:

1. **Foliage density must never change concealment.** Dense grass and ground cover are the
   headline of the new look, and they are also the first thing that could hide a creature or a
   player on Ultra but not on Low (a disadvantage for the Ultra player) or the reverse. Rule:
   grass that can occlude a character renders at the SAME height and density inside a radius of
   60 yd around the camera on every tier, or characters, nameplates and selection rings draw
   with an occlusion-independent outline. Tiers may only thin foliage BEYOND that radius, where
   nameplates carry the information.
2. **Volumetric fog density is identical on every tier;** tiers change only its resolution and
   noise. A thicker fog on Ultra must not hide an enemy that Low shows.
3. **Telegraphs, cast VFX and ground AoE markers are never tiered** (they are actionable).
4. **Shadows may change quality but not existence** (the web client's rule for
   `shadow_cadence_core.ts`); Low's cascaded shadows still cast from every character.
5. **Darkness:** night exposure and the minimum ambient level are the same on every tier, so a
   Low player never sees better at night because a light was culled.
