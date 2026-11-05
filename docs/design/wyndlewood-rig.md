# Wyndlewood humanoid rig (WYN-H1): replacing the WOC rig and clips

Status: plan (2026-11-05). Owner decision from the Early Access audit
(`docs/launch/early-access-readiness.md` on `docs/early-access-readiness`): the WOC
player characters, their rig and their clips are third-party assets marked "permission
required", and every restricted asset is replaced before Early Access. The stylized bodies
on `feature/stylized-chars` are original meshes, but they are skinned to the WOC skeleton
and play the WOC clip library, so they still ship restricted data. This document plans a
Wyndlewood-owned skeleton and clip library that every humanoid the game draws uses, with
the renderer's dispatch seams unchanged.

## What is restricted today (humanoid scope)

- The WOC skeleton: every `models/chars/players/woc/*` base and armor file, and every
  stylized file refit onto it (`models/chars/players/woc_stylized/*`,
  `models/chars/test_stylized/*`), carry its joint hierarchy and inverse bind matrices.
- The WOC clip library: `anims_male.glb`, `anims_female.glb` (the `animationNames` list in
  `src/render/characters/woc_character_manifest.ts`).
- Derived clips: every `scripts/build_*_anims.mjs` output that samples WOC poses
  (pose-sample-and-blend inherits the donor's data, so it is restricted too).
- Tooling target: `scripts/assets/stylized_char_test/fit_woc_rig.mjs` fits onto the WOC rig.

The asset-rights crew owns the full inventory (`feature/asset-rights`); this plan covers the
humanoid rig and clips only and will be reconciled with that list through the coordinator.

## Seams that must not change

The renderer keys characters on `visualKeyFor` / `VisualDef` / `ClipMap`
(`src/render/characters/manifest.ts`). WYN-H1 lands behind exactly those seams:

1. **Clip names.** Every clip a `ClipMap` names keeps its name (`Idle`, `Walk`, `Run`,
   `1H_Chop`, `Cast_Raise`, ...), so no `ClipMap`, `attackByAbility` or `castByAbility`
   entry changes.
2. **Attachment points.** Weapons, offhands, shields, mounts and VFX attach to named bones
   (`handslot.l`, `handslot.r`, `head`, `armor_shoulder.l/r`, `root`). WYN-H1 provides a
   bone of each name with the same meaning (the grip point of the hand, the crown, the
   shoulder cap), so weapon layouts and VFX anchors are re-tuned by offset only, never
   re-plumbed.
3. **Bind by name.** WOC armor binds pieces to the body's skeleton by bone name
   (`woc_armor_bind.ts`). WYN-H1 armor files are skinned to WYN-H1 itself, so the bind
   path is reused unchanged.

Bone names are plain anatomical words (hips, spine, chest, neck, head, upperarm, lowerarm,
hand, upperleg, lowerleg, foot, toes) plus the engine's slot names; the hierarchy, joint
placement, rest pose, roll and the extra bones are ours. Reusing generic names is a
compatibility choice flagged for the asset-rights review: if names alone are judged
restricted, a one-module rename table (`wyn_rig_names.ts`) maps seam names to new ones and
the attach lookups read it.

## The skeleton

- **Authored by script, not by copying.** `scripts/rig/build_wyn_skeleton.mjs` builds the
  joint tree from a checked-in spec (`scripts/rig/wyn_h1.json`): per joint, a parent, a rest
  head position and a roll. Positions are measured from landmarks on our own stylized base
  meshes (pelvis centre, hip sockets, knees, ankles, ball of foot, shoulder sockets, elbows,
  wrists, grip centre, neck base, skull base, crown), one spec per body fit, never read
  from the WOC GLB.
- **Layout.** root, hips, spine_01, spine_02, chest, neck, head, head_end; per side:
  clavicle, upperarm, upperarm_twist, lowerarm, lowerarm_twist, hand, handslot, finger
  groups (thumb 2, index 2, grip 3 for the closed fist), armor_shoulder; upperleg,
  upperleg_twist, lowerleg, foot, toes; cloth bones for skirts and tabards (front, back,
  side per side). About 60 joints, inside the WOC body's joint budget so skinning cost does
  not rise. Twist bones are new and fix the candy-wrapper forearm the stylized bodies show.
- **Fits.** Male and female share one tree with fit-specific rest positions (two specs).
  Stout NPCs (Jorren, Della) use the male tree with a wider rest pose spec, not arm dials.

## The clip library

All clips are authored from scratch as keyframe pose specs on WYN-H1. No clip samples a WOC
or any other third-party clip.

- **Tool.** `scripts/anim/wyn/` (new): a pose spec format (named key poses as per-joint
  rotations in degrees, keyed at times, with easing), procedural helpers (two-bone IK for
  foot plants and hand targets, a gait generator for walk/run/strafe/back cycles from stride,
  cadence and bounce, overlap and follow-through for cloth bones and the head), and a baker
  that writes a mesh-free clip GLB with gltf-transform (the same output shape as
  `scripts/anim/pose_blend.mjs bakeClip`, whose math is project code and is reused).
  Headless Blender is the escalation path for clips that need hand-tuned arcs; Blender is
  authoring-time only, never a build dependency.
- **Coverage (every clip the ClipMaps use):**
  - Locomotion: Idle, Idle_Look, Combat_Idle, Combat_Idle_Single, Combat_Idle_Dual, Walk,
    Walk_Back, Run, Strafe_Left, Strafe_Right, Jump, Jump_Loop, Fall, Land, Climb.
  - Water: Swim, Swim_Idle (surface and wade reuse them through the ClipMap as today).
  - Melee: 1H_Chop, 1H_Chop_Single, 1H_Slash, 1H_Slash_Single, 2H_Chop, Dual_Chop,
    Dual_Cross, Dual_Stab, Block, Sheathe.
  - Ranged and magic: Bow, Ranged_Shoot, Cast_Raise, Cast_Loop, Cast_Shoot.
  - Reactions: Hit, Hit_Single, Hit_Dual, Death.
  - Social: Wave, Cheer, Clap, Laugh, Cry, Dance, Salute, Point, Question, Flex, Roar, Kneel,
    Sit_Down, Sit_Idle, Lie_Idle.
  - Mounted and gathering ride existing ClipMap fields (`seat`, `gatherSwing`) and get
    their own authored clips (Mount_Idle, Gather_Swing) wired through those fields.
  - The class extras (bow draw, mage and other ability casts) are re-authored on WYN-H1 as
    their own batches, replacing the pose-sampled WOC derivatives.
- **Quality bar** (the blender-anim-pipeline review list): no foot sliding (IK-planted
  contacts, measured), no root drift on loops, no T-pose pops, loop seams matched, hand
  grips aligned to `handslot` for every weapon type, contact timings (`contacts`) re-timed
  per clip so hit frames still land on the sim's swing events.

## Retargeting bodies and armor

- `fit_woc_rig.mjs` generalises to `fit_rig.mjs --target wyn_h1` (bind any Tripo-rigged
  source onto a target skeleton by landmark). The stylized bases, the ten sets and the
  fourteen townsfolk are rebuilt from their Tripo sources, which stay in the crew work
  folder, onto WYN-H1 with `build_stylized_kit.mjs --rig wyn_h1`.
- Output lands in new directories (`models/chars/wyn/`), so the WOC-rig files stay
  untouched until the cutover and both can be compared side by side under the dev flag.

## Engine cutover

1. Dev flag first (`?wynrig=1`): the stylized defs point at WYN-H1 bases, armor and clips;
   everything else unchanged. Side-by-side turntables, strips and in-world shots against
   the WOC-rig versions.
2. Default for every player class and every named NPC body once the review passes.
3. Every other humanoid the game draws (KayKit-rig townsfolk, humanoid mobs, the creation
   screen, portraits) moves to WYN-H1 bodies, family by family, so no WOC rig or clip
   remains in any shipped def.
4. Removal of the WOC files from the shipped `public/` tree and the media manifest is the
   last step and is handed to the owner (it changes every existing character's look; no
   saved data changes, appearance ids map onto the new kit).

## Tests

- `tests/wyn_rig.test.ts`: the skeleton GLB has every seam bone name; joint count inside
  the budget; male and female trees identical in topology.
- `tests/wyn_clips.test.ts`: every clip name any ClipMap of a WYN def references exists in
  the WYN clip GLBs; every clip's channels target only WYN-H1 joints; loops return to their
  first pose within tolerance; foot contacts slide less than a set distance.
- `tests/no_restricted_rig.test.ts` (with the asset-rights crew): after cutover, no
  `VisualDef` URL or `animUrls` entry resolves into a restricted directory.
- The existing guards: `character_clipmaps`, `woc_character`, `stylized_char_test`,
  `architecture`, `monolith_budget`.

## Phases

- **P0:** skeleton spec and builder, the male stylized base refit onto it, Idle, Walk and
  Run authored, shown under `?wynrig=1` beside the WOC-rig body.
- **P1:** the rest of locomotion, jumps, swim, climb; female fit.
- **P2:** melee per weapon type, block, sheathe, bow, casts, hits, death; contact timings.
- **P3:** social and emote clips, sit, lie, kneel, mounted, gather.
- **P4:** retarget every stylized set and the townsfolk; class extras re-authored.
- **P5:** default cutover and the remaining humanoid families; WOC removal handed to the
  owner.

## Risks

- Hand-authored clips are a large body of work (about 55 base clips plus class extras); P2
  and P3 are the long poles. Procedural gait and IK keep locomotion cheap; combat and emotes
  need per-clip key poses.
- Weapon grips and VFX anchors need re-tuning per weapon type on the new hand.
- Contact timings drive hit sounds and VFX; a re-timed swing must keep its contact inside
  the sim's swing window (render-only, the sim never reads clips).
