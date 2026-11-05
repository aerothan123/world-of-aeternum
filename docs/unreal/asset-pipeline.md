# Asset pipeline into Unity

Status: planning spec, written against `feature/player-housing` (merge `64d84727`). How the
existing assets get into a Unity client, what carries over, what must be re-authored for the
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
2. **Every material ships base colour, normal, metallic with smoothness in alpha (the URP Lit
   metallic map layout), occlusion, and an optional emissive.** A custom packed mask (metallic,
   occlusion, detail, smoothness in one texture) is allowed only with the project's own Lit
   variant shader.
3. **Texel density:** 512 px per metre for hero props and characters in the 2K to 4K range,
   256 px per metre for buildings with tiling trims and a detail normal, terrain layers tiled
   at 2 m to 4 m with a macro variation map. One density table, checked by an editor script.
4. **Warmth comes from light and grade, not from albedo.** Base colours stay physically
   plausible (sRGB albedo between about 30 and 240), and the storybook palette comes from the
   key light colour, the sky, fog tint and a colour grade LUT. This is what lets realistic
   Asset Store packs sit in the same frame as crew-made art (the shortlist depends on it).
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
crews already ship under. Every asset added in Unity still gets a `CREDITS.md` row (in the
Unity repo, see `vertical-slice-plan.md` section 3).

Glossary of glTF extensions found in `src/render` and `scripts` (`grep -rhoE`):
`EXT_meshopt_compression`, `KHR_mesh_quantization`, `KHR_texture_basisu`,
`KHR_materials_emissive_strength`, plus the in-house `WOC_lod` / `WOC_LOD` (LOD levels inside
one file, `src/render/assets/woc_lod_plugin.ts`) and several `WOC_*` head and morph markers used
by the modular characters.

## 3. Importing GLBs: glTFast versus UnityGLTF

| | glTFast (`com.unity.cloud.gltfast`) | UnityGLTF (Khronos) |
|---|---|---|
| Owner | Unity | Khronos and Prefrontal Cortex, open source |
| meshopt, Draco, KTX2 | yes, through the optional packages "meshoptimizer decompression for Unity", "Draco for Unity" and "KTX for Unity" ([install docs](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.15/manual/installation.html)) | meshopt and KTX2 through add-on packages |
| Custom extensions (`WOC_lod`) | limited extension hooks | plugin architecture for import extensions |
| Speed | fast runtime and editor import | slower, more complete material model |

Recommendation: **do not import the shipping GLBs directly.** Add a Node "unity normalize"
step in THIS repo (proposed `scripts/unity/normalize_glb.mjs`, built on the gltf-transform
toolchain the pipeline already uses in `scripts/asset_pipeline/lib/wizard.mjs`) that, per GLB:

1. decodes meshopt and quantization to plain float geometry;
2. decodes KTX2 back to lossless PNG (or, better, re-reads the pre-compression source texture
   when one exists);
3. splits `WOC_lod` levels into `name_LOD0.glb`, `name_LOD1.glb`, ... so Unity builds a
   `LODGroup` from file names;
4. writes the `WOC_*` character markers to a sidecar JSON next to the model.

Then glTFast imports the clean GLBs at editor time, and a Unity `AssetPostprocessor` makes the
prefab (LODGroup, colliders from the sidecar, URP Lit materials). Unity compresses textures to
BC7 (colour) and BC5 (normals) itself. Nothing glTF-specific ships in the player, and the build
never depends on runtime decoders.

Clip libraries: import as `AnimationClip` sets, keep the original clip names, and generate a
`ClipMap` ScriptableObject from `src/render/characters/manifest.ts` so the TS `BaseState`
names (`idle`, `walk`, `run`, `strafeLeft`, `cast`, `swim`, `sit`, `jump`, ...) map to the same
clips. Mark the KayKit and Quaternius rigs Humanoid where the bone set allows retargeting, so
one locomotion set can drive several bodies; keep Generic for creatures.

## 4. What carries over, what gets re-authored

| Asset class | Carries over as-is | Needs re-authoring for "detailed stylized" |
|---|---|---|
| Music (58 tracks) | yes; import MP3 or, better, re-render WAV from `scripts/render_music.mjs` and let Unity encode Vorbis | no |
| SFX (747) and voice (578) | yes; import, and generate the volume and pitch table from `scripts/sfx/sfx_gain_map.json` and `sfx_speed_map.json` | no; add 3D spatial settings per category |
| Item icons and UI art (WebP) | yes as sprites for the slice | the HUD frame art is redesigned (it is part of the "mobile look" complaint) |
| Animation clips | yes | add-on clips later for the new bodies (the `blender-anim-pipeline` skill) |
| Creature models (211) | yes for the slice | hero creatures re-textured to PBR first, zone by zone |
| Weapons and tools (291) | geometry mostly yes | full PBR texture pass (metal, leather, wood) |
| Props (274) and resources (143) | geometry often yes | PBR texture pass; gather nodes keep their tier sizes |
| Buildings (`medieval_village_v2` 349, `tidehold`, `dungeon`) | blockout only | most re-authored as a modular PBR kit or replaced by an Asset Store kit |
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

Export pipeline (proposed `scripts/unity/export_world.mjs`, run in Node against `src/sim` with
the realm seed from `hello.seed`):

- **Heightfield:** sample `terrainHeight(x, z, seed)` on a 0.5 yd grid per zone into 16-bit RAW
  tiles plus a JSON header (origin, spacing, min and max). Unity builds Terrain tiles or meshes
  from them. A Vitest asserts the baked tile reproduces `terrainHeight` within 1 cm at random
  points, so feet planting in Unity matches the server.
- **Water bodies, roads and splat regions:** export the lake circles, shore curves and paint
  regions the render terrain reads (`terrain_paint_layers.ts`, `terrain_region_core.ts`).
- **Placements:** export every collider-backed placement from `src/sim` directly. For the
  render-only dressing, the fastest exact source is the running client: a puppeteer script
  (the `scripts/*.mjs` E2E pattern) walks the renderer's scene graph through `window.__game`
  and dumps `{ asset url, position, rotation, scale }` per instance to JSON. Unity places
  prefabs by asset key from that file with a C# editor importer.
- **Rule:** the exported JSON is the source of truth for WHERE things are; Unity scenes are
  generated from it by code, never hand-placed, so crews do not edit binary scene files
  (`cost-and-risk.md`, risk 6). Hand-authored Unity dressing goes in prefabs and additive
  "dressing" data files that the generator merges.

## 6. Producing PBR maps from the Tripo and Blender pipeline

Today `scripts/asset_pipeline/pipeline.mjs` already asks Tripo for PBR output
(`createTask('/generation/text-to-model' | '/generation/image-to-model', { texture: true,
pbr: true })`). The maps are then shrunk for the web: `scripts/asset_pipeline/lib/wizard.mjs`
re-encodes metallicRoughness, occlusion and emissive as 512 px JPEG and the normal map as a
256 px PNG, and the shipped GLB carries KTX2. That is fine for WebGL budgets and far too small
for the Unity target.

Unity lane changes (all additive, the web lane stays as it is):

1. **Keep the raw Tripo output.** Save `raw.glb` maps at the native resolution Tripo returned
   into an asset-source folder in the Unity repo, never into `public/`.
2. **Blender pass** (headless: `blender --background --python <script> -- <args>`, the same
   invocation shape the `blender-anim-pipeline` skill defines):
   - retopology or decimation to the poly budget, a clean UV layout, and a high-to-low bake
     where the Tripo mesh has the detail but the UVs are poor;
   - bake or derive: base colour (delit: remove baked shading with a high-pass and AO divide),
     a tangent-space normal in the OpenGL Y+ convention (what both glTF and Unity expect),
     roughness, metallic, ambient occlusion;
   - pack the URP Lit metallic map (RGB metallic, A smoothness = 1 - roughness) and keep
     occlusion as its own map;
   - export FBX or GLB plus the PNG set at 2K (hero) or 1K (common).
3. **Material review gate:** an editor script renders each prefab on a neutral turntable under
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

## 7. Render pipeline: URP, not HDRP

The coordinator asked to plan for HDRP unless there was a strong reason otherwise. There is
one, and it is decisive:

- **HDRP is in maintenance mode.** Unity's February 2026 render pipelines strategy says no new
  features are planned for HDRP, development priority is URP, and "Users are strongly
  encouraged to use URP when starting any new project" ([80.lv summary of the Unity
  announcement](https://80.lv/articles/unity-unveils-2026-render-pipelines-strategy/),
  [gamefromscratch, same announcement](https://gamefromscratch.com/the-unity-hdrp-is-dead/)).
  A Unity staff post in the official thread says HDRP is not deprecated and will be maintained
  "as long as necessary", while URP gets the investment, naming dynamic lighting as the biggest
  gap and listing shadow caching, shadow quality and volumetric fog as future URP work
  ([Unity Discussions, post 219](https://discussions.unity.com/t/render-pipelines-strategy-for-2026/1710004/219)).
  A game that will live for years on a live-service cadence should not start on the pipeline
  that stopped growing.
- **Min-spec and Steam Deck.** URP scales from integrated GPUs and the Deck to RTX cards in one
  project; HDRP's floor is high. Unity's March 2026 GDC announcement adds native Linux and Steam
  Deck work to the engine ([PCGH](https://www.pcgameshardware.de/Linux-Software-26761/News/Unity-baut-Support-fuer-Steam-Deck-und-Steam-Machine-aus-1521791/)).
- **Asset Store fit.** The water, fog and terrain packs best suited to the look are URP-first or
  URP-only (`asset-store-shortlist.md`).

What URP gives the Fable target on an RTX-class PC, and what it does not:

| Need | URP answer |
|---|---|
| Soft shadows | URP soft shadows, 4 cascades, high resolution, contact shadows via screen-space shadows; shadow cascades tuned per tier |
| GI approximation | Adaptive Probe Volumes (supported in URP since Unity 6, [Unity manual](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/probevolumes-streaming.html)) with lighting scenarios blended across the day, plus SSAO and reflection probes |
| Many lights (torches, lamps, windows) | Forward+ rendering path |
| Volumetric fog and light shafts | NOT built into URP today (Unity lists volumetric fog as future URP work, post 219 above); use an Asset Store volumetric fog (shortlist) |
| Colour and warmth | URP post-processing Volume: tonemapping, colour grading LUT, bloom, vignette, film grain off |
| Dense foliage | GPU instancing or terrain details, with the URP depth prepass and a wind shader |

Reasons HDRP would still be tempting, recorded honestly: built-in volumetric fog and clouds,
physical sky and better area lights out of the box. Those are bought back in URP with two
packs (fog and sky) for under 100 USD, and URP's roadmap is closing the rest.

Version: start on the current LTS (Unity 6.3 LTS, supported into late 2027 per
[StraySpark's roadmap summary](https://www.strayspark.studio/blog/unity-6-4-to-6-8-roadmap-indie-developers-2026)),
and move only to the next LTS.

### Quality tiers

| Tier | Target | Shadows | GI | Fog | Foliage | Render scale |
|---|---|---|---|---|---|---|
| Ultra | RTX 3070 class, 1440p 60 | 4 cascades 4096, soft high | APV plus SSAO high | volumetric, full res | full density, far grass | 1.0 |
| High | RTX 2060 class, 1080p 60 | 4 cascades 2048 | APV plus SSAO medium | volumetric, half res | full density near, thinned far | 1.0 |
| Medium | GTX 1060 or Steam Deck docked | 2 cascades 2048 | APV, SSAO low | volumetric, quarter res | thinned far | 0.85 |
| Low (min-spec, Steam Deck handheld) | integrated GPU, 800p 30 to 40 | 1 cascade 1024 | APV only | height fog (non-volumetric) | near only | 0.7 with FSR or STP upscaling |

## 8. The graphics-tier fairness rule (binding on every tier above)

From `docs/design/graphics-settings-fairness.md` and the root `CLAUDE.md` invariant: a
graphics or performance preset may shed COSMETIC richness but never ACTIONABLE information.
Actionable, identical on every tier: your own debuffs, party and raid HP, the target and boss
cast bar, target HP granularity, enemy and aggro positions, the fishing bobber and bite state,
minimap and map gather-node markers, and the node tier ladder expressed as size. Tier knobs
read the STATIC preset (`src/game/ui_effects_profile.ts`), never an FPS governor.

Unity-specific consequences, to be pinned by Unity play-mode tests the way
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
   `shadow_cadence_core.ts`).
5. **Darkness:** night exposure and the minimum ambient level are the same on every tier, so a
   Low player never sees better at night because a light was culled.
