# Fable foliage sources

Tripo-generated replacements (scripts/asset_pipeline prop lane, storybook style prompt) for public/models/foliage. Unfitted: the integration step splits bark and leaves and fits each to the old model.

| target | job name | job dir |
|---|---|---|
| oak_1 | fable_oak_1 | prop_fable_oak_1_mw1ujms9 |
| oak_2 | fable_oak_2 | prop_fable_oak_2_mw1uxbcp |
| oak_3 | fable_oak_3 | prop_fable_oak_3_mw1um0p0 |
| oak_4 | fable_oak_4 | prop_fable_oak_4_mw1unqn4 |
| oak_5 | fable_oak_5 | prop_fable_oak_5_mw1uphjc |
| pine_1 | fable_pine_1 | prop_fable_pine_1_mw1tsg7a |
| pine_2 | fable_pine_2 | prop_fable_pine_2_mw1tu3qc |
| pine_3 | fable_pine_3 | prop_fable_pine_3_mw1tw2tk |
| pine_4 | fable_pine_4 | prop_fable_pine_4_mw1uraey |
| pine_5 | fable_pine_5 | prop_fable_pine_5_mw1uzfwq |
| dead_1 | fable_dead_1 | prop_fable_dead_1_mw1v166l |
| dead_2 | fable_dead_2 | prop_fable_dead_2_mw1u37s5 |
| dead_3 | fable_dead_3 | prop_fable_dead_3_mw1v2xrz |
| bush | fable_bush | prop_fable_bush_mw1u6gu0 |
| bush_flowers | fable_bush_flowers | prop_fable_bush_flowers_mw1u855n |
| mushroom | env_mushroom_hifi | prop_env_mushroom_hifi_mw30qiht |
| fern | env_fern_hifi | prop_env_fern_hifi_mw30qiiq |
| rock_1 | env_rock_1_hifi | prop_env_rock_1_hifi_mw2wgl58 |
| rock_2 | env_rock_2_hifi | prop_env_rock_2_hifi_mw2wgl9j |
| rock_3 | env_rock_3_hifi | prop_env_rock_3_hifi_mw2wl9n3 |

The rocks are the detailed second set: original text-only Tripo text-to-image concepts (a tall mossy granite boulder, a wide split boulder, a compact four-stone mound; muted warm grey stone) built by the prop lane on the H-series model (`--model hifi --face-limit 8000 --max-texture 1024`). The fit keeps each one's own baked normal map and layers the painted relief over it (`blendTangentNormals`, `ROCK_RELIEF_OVER_BAKED`).

The mushroom and the fern are the second dressing set, built the same way (`--model hifi`, `--max-texture 1024`) from original text-only concepts: a cluster of four plump ochre and chestnut forest mushrooms on a mossy leaf-litter mound (`--face-limit 4000`), and a low clump of broad arching fronds on a small soil patch (`--face-limit 3000`, fitted down to `FERN_BUDGET` because ferns are the densest dressing).

## Leaf sheets

`leaf_sheets/` holds the painted sprite sheets the leaf-card atlases are cut from (Tripo text-to-image, original text-only prompts, stored as WEBP). `scripts/assets/fit_fable_foliage.mjs` keys each sheet off its flat background, finds its separate cluster islands, and packs the cells `LEAF_ATLASES` in `scripts/assets/fable_leaf_cards_core.mjs` names into one atlas per family.

| sheet | prompt subject |
|---|---|
| broadleaf_a | broad oval leaves on twigs, some drooping |
| broadleaf_b | rounded oak-like and linden-like leaves, drooping willow-like fronds |
| blossom | small shrub leaves with pink and white blossoms |
| pine_a | drooping fir bough sprays of fine needles |
| pine_b | layered pine branch tips with pale new growth |
| twig_dry | bare gnarled twigs with a few dry curled leaves |
