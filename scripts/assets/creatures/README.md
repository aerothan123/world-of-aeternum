# Wildlife creatures

WYNDLEWOOD's painted four-legged wildlife (`src/render/characters/wildlife_looks.ts`):
original concept, Tripo model, a skeleton of its own and a full clip set authored in
Blender. Nothing here is a runtime or build dependency; it runs when a body is made.

## Why not the Tripo rig

The first painted wolf came back standing on two legs. The creature lane defaulted
to a biped body, which sends a four-legged animal through Tripo's `t_pose` image
template and the "T-pose, arms out" concept language (so the concept, then the
model, stands up), and then asks for a biped skeleton. Tripo's quadruped rig is no
cure either: its quadruped library is a single walk preset. So:

- `pipeline.mjs creature` now refuses to run without `--rig-type`
  (`creatureBodyPlan` in `scripts/asset_pipeline/lib/families.mjs`), a quadruped
  concept never gets the T-pose template or language (`conceptTemplate`,
  `conceptPrompt` in `lib/prompts.mjs`), and a quadruped stops after the textured
  model instead of buying a rig.
- The body is rigged and animated here, on the hoard rigger
  (`scripts/assets/hoard_mobs/quadruped_rig.py`), which authors Idle, Walk, Run,
  Attack, Cast, Hit and Death from a bone spec.

## Making one

All paths from the repo root. Blender 5.x.

1. Concept first (about 5 credits each, pick one): a side or three-quarter view of
   the animal standing on all four legs, original design, painted style.
2. Model: `node scripts/asset_pipeline/pipeline.mjs creature --name <key>
   --rig-type quadruped --image <concept.png> --model hifi --face-limit 7000`.
   It stops after `raw.glb` (about 50 credits).
3. Measure: `blender -b --factory-startup --python scripts/assets/creatures/measure_quadruped.py --
   <raw.glb> <spec.json> --name <Name> --key wildlife_<model> --auto-align [--neck] [--jaw]
   --png <prefix>`. It squares a slanted body onto +X head first, finds the four
   leg columns, the trunk, the head and the tail, and writes a first spec plus a
   side and top overlay of the proposed bones. Read the overlays; fix the spec
   where the body needs it (`--flip-head` if the head came out at -X).
4. Tune the motion in the spec (all optional, see the rigger's header): a dog or
   a boar walks `"walkGait": "lateral"` and gallops `"runGait": "gallop"`
   (`spineFlex` is the gallop's back flex in degrees), `walkStride`/`runStride`
   in degrees, `walkSeconds`/`runSeconds`, `deathDrop` (how far the hips fall
   when it lies on its side), `neckShare` (how much of a head turn the Neck takes).
5. Rig, bake, assemble:
   ```
   blender -b --factory-startup --python scripts/assets/hoard_mobs/quadruped_rig.py -- <raw.glb> <dir> --spec <spec.json> --blend <dir>/<key>.blend
   node scripts/assets/hoard_mobs/assemble.mjs <key> <dir> public/models/creatures/<key>.glb
   ```
6. Review: `blender -b <dir>/<key>.blend --python scripts/assets/creatures/review_render.py --
   <out prefix>` writes a turntable and one frame strip per clip. Look for feet
   through the floor, popped joints, a tail or a head tearing away from the body.
7. Wire: add the model to `WILDLIFE_MODELS` and its templates to `WILDLIFE_MOB_KEYS`
   (`src/render/characters/wildlife_looks.ts`), a `CREDITS.md` row, then
   `node scripts/build_media_manifest.mjs generate`, the portrait re-render for
   every remapped template (`scripts/render_finder_portraits.mjs`, see
   `scripts/assets/wolf_rig/README.md` step 4) and `npm run wiki:content`.
   Checks: `tests/wildlife_looks.test.ts`, `tests/character_clipmaps.test.ts`,
   `tests/visual_manifest.test.ts`, `tests/asset_pipeline.test.ts`.

## Model ids

A body is addressed by its model id (`wolf`, `boar`); its visual key is
`wildlife_<model>`. Another branch wires a mob to it by naming that key in its
`MOB_KEYS` row. A template nobody maps keeps its family body, and a model only
joins `WILDLIFE_MODELS` once its file ships, so no default ever points at a
missing GLB.
