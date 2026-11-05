# Fab shortlist (budget: up to 300 USD)

Status: research only. NOTHING has been bought; the owner buys. Prices, tiers, engine versions,
AI flags and update dates were read from each Fab listing's own data on 2026-11-05 (the
listing JSON behind `https://www.fab.com/listings/<uid>`); prices change with sales, so re-check
at purchase and watch each listing's showcase video first.

## The brief

Fable as the reference: stylized shapes and a warm storybook palette with REALISTIC material
detail (stone, wood grain, moss, cloth, worn metal), dense foliage and ground cover, soft
shadows, Lumen GI, volumetric fog and light shafts. So: realistic-material medieval and nature
packs that grade warm (`asset-pipeline.md` section 1, rule 4: warmth from light and grade, not
albedo), not cartoon packs and not gritty desaturated ones, all supporting UE 5.8 with
Nanite and Lumen.

Unreal changes the budget split compared with the old Unity plan: water (Water plugin), sky and
clouds (Sky Atmosphere, Volumetric Clouds), volumetric fog and light shafts (Exponential Height
Fog) and terrain layering (Landscape with Runtime Virtual Texturing) are built into the engine,
so the whole 300 USD goes to content.

## Licensing facts that apply to every pick

- **Fab Standard License, Personal tier.** Personal is for buyers whose gross revenue from
  commercial activity over the last 12 months is at most 100,000 USD; above that the
  Professional tier applies ([Epic: licenses and pricing in Fab](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab)).
  The prices below are Personal. At Professional prices this shortlist costs about 800 USD,
  so the owner must re-buy (upgrade) before the studio's revenue passes the threshold.
- **Not per seat for content.** The Standard License lets the buyer "Share the asset (directly,
  via a private repository or in the Project) with your collaborators that are working on the
  Project with you" (quoted in [this Epic forum thread](https://forums.unrealengine.com/t/am-i-allowed-to-share-storebought-assets-with-coworkers/2712931));
  repositories must stay private. Code plugins can carry their own per-user terms; none is on
  this list.
- **Any engine.** Fab Standard content may be used in any engine or tool
  ([Epic forum, Megascans update](https://forums.unrealengine.com/t/megascans-update-march-2025/2419561)).
- **AI flags.** Every Fab listing states whether it was "Generated with AI" and whether it allows
  use with AI. All picks are "Generated with AI: No". Most picks forbid AI use (the NoAI tag:
  the asset "must not be used for generative AI data collection", Fab page above). Crews must
  never feed bought content to Tripo or any generator, which the crew IP rule already forbids.
  The "Large Medieval Market 3D Environment" by Sector Zero Publishing declares "Generated with
  AI: Yes" and is EXCLUDED on originality and quality grounds
  ([listing](https://www.fab.com/listings/c6a56707-5182-44d5-b14b-363d8ccdeac5)).
- Never commit purchased packs to the public `world-of-aeternum` repo; they live in the private
  Unreal repo (`vertical-slice-plan.md` section 3). Each gets a `CREDITS.md` row there.

## The shortlist

| # | Pack (Fab listing) | Seller | Personal (USD) | UE versions | Last update | Rating | AI | Covers |
|---|---|---|---|---|---|---|---|---|
| 1 | [Modular Medieval Town, Docks](https://www.fab.com/listings/9bec871e-2d9b-4261-aa26-868d4300f81a) | Hivemind | 79.99 | 5.3 to 5.8 | 2026-06-21 | 4.8 (24) | not AI-made; AI use forbidden | 323 meshes, fully enterable and furnished buildings, docks, 2K and 4K textures, built for Lumen and Nanite landscapes |
| 2 | [Broadleaf Poplar Forest, PCG Biome](https://www.fab.com/listings/61f2b0fc-5656-46b7-86ef-3c2100cebcb4) | EasyBiomes | 79.99 | 5.6 to 5.8 | 2026-10-09 | 4.8 (65) | not AI-made; AI use forbidden | PCG forest generation (clearings, riverside woodland, ground cover), Nanite photoscanned foliage with full geometry |
| 3 | [Procedural Oak Forest](https://www.fab.com/listings/266e838b-9832-4e25-b8dd-13e82a9d9181) | FreshCan | 59.99 | 5.0 to 5.8 | 2026-07-20 | 4.8 (20) | not AI-made; AI use forbidden | 90+ photoscanned forest assets, Landscape Grass Types, wind on all plants, spring, autumn and winter variants, Niagara leaves |
| 4 | [Modular Character System, Fantasy RPG](https://www.fab.com/listings/be5710bf-a34b-41de-bb41-5cdd38d46710) | Hivemind | 49.99 | 5.0 to 5.8 | 2026-06-21 | 4.9 (12) | not AI-made; AI use forbidden | modular fantasy armor and clothing sets on the Epic skeleton, 15k to 22k vertices, 2K textures, mix-and-match pieces |
| 5 | [Medieval Village, Rustic Fantasy Settlement](https://www.fab.com/listings/c56bdf43-b670-46eb-bab2-bf787025a984) (optional) | No Mad Studios | 29.99 | 5.0 to 5.8 | 2026-07-21 | 5.0 (1) | not AI-made; AI use forbidden | 226 meshes, rustic farm and settlement dressing, 1K to 4K textures |
| | **Total** | | **299.95** (269.96 without #5) | | | | | |

### Why each one

1. **Town kit.** The first thing every player sees is Eastbrook. Hivemind's docks town has the
   best review record of the realistic modular kits checked, enterable interiors (useful for the
   inn, the bank, and later for player housing interiors), and 5.8 support. Its buildings will be
   graded warm and re-proportioned where needed (chunkier roofs and trims).
2. **PCG forest biome.** Dense, realistic-material Nanite foliage scattered by PCG is the headline
   of the new look and the most expensive thing to make by hand. EasyBiomes is the best-reviewed
   PCG biome found, and deterministic from a seed, which suits a world whose layout is code.
3. **Oak forest and ground cover.** Broadleaf oak and the Landscape grass carpet fit Eastbrook
   Vale's meadows and the Wolf Run, with seasonal variants for later events.
4. **Character armor.** The only modular pack found at this budget that is on the Epic skeleton,
   current for 5.8 and not low-poly; its realistic cloth and metal materials suit "slightly
   stylized faces, realistic armor". The faces and body base remain an open item
   (`cost-and-risk.md`, risk 9).
5. **Settlement dressing (optional).** Farm and rustic props for the Vale between the town and
   the lake; only one review, so view the showcase first. Skip it to keep 30 USD in reserve.

### Alternates

| Pack | Seller | Personal (USD) | UE versions | Note |
|---|---|---|---|---|
| [Riverside European Village Environment](https://www.fab.com/listings/bc721ab3-c974-4ed4-91c8-e3011bd0295d) | Befour Studios | 79.99 | 5.6 to 5.8 | realistic half-timbered town, tavern interior, docks; new (May 2026) with no reviews yet; allows AI use |
| [Medieval Castle Village Environment](https://www.fab.com/listings/69e1b46a-c035-4a4a-b270-099534cedfc0) | Leartes Studios | 69.99 | 5.0 to 5.8 | 300 meshes, enterable buildings, 1K and 2K textures (lighter on min-spec), 4.9 (17) |
| [Modular Medieval Village](https://www.fab.com/listings/51440323-edc3-404d-97ed-dfe8f82664f4) | Hivemind | 79.99 | 5.3 to 5.8 | sister kit to pick 1, inland village |
| [Medieval Village, Slavic Huts environment](https://www.fab.com/listings/02fe849e-f57c-4c98-9cbb-b05d65614278) | Scans Factory | 129.99 | 5.2 to 5.8 | 990+ assets with day, sunset and night lighting scenarios; high quality but takes most of the budget |
| [Stylized Environment, Meadow Pack](https://www.fab.com/listings/6a8a8c3b-e6e7-4ccc-8a11-82bca55e7c6c) | ANGRY MESH | 79.99 | 5.4 to 5.8 | well reviewed (4.7) but stylized foliage; check it is not too cartoon for the brief |

### Not bought

- **Water, sky, fog, terrain shading:** engine features.
- **UI kit:** the popular fantasy GUI kits speak the casual mobile visual language the owner
  wants to leave; the HUD is designed once to `DESIGN.md` and the new look (slice M6).
- **Megascans:** no longer free since 2025 ([80.lv](https://80.lv/articles/megascans-no-longer-free-after-2024/));
  first check whether the owner's Epic account claimed the library during the 2024 free window,
  in which case those scans are already licensed.

## How the packs are used safely

- Packs stay untouched under `Content/Fab/`; project material instances and Level Instances that
  adapt them live under `Content/Wyndlewood/`, so a pack update never overwrites crew work.
- Every pack material is re-parented to the project master materials or instanced from them and
  passes the material review gate (`asset-pipeline.md` section 6, step 3) under the three fixed
  lighting rigs before it appears in a zone.
