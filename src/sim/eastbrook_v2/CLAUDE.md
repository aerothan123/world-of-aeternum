# src/sim/eastbrook_v2: the Eastbrook Vale v2 design on the server

The Unreal world crew designs Eastbrook Vale in the editor (branch `world/v2-aura`,
`WorldDesign/EastbrookVale`). This directory lays that design into the eastbrook_vale
slot of the built-in world so the server agrees with what the Unreal client draws.

## Files
| File | What it is |
|---|---|
| `field.generated.ts` | the design heightfield, server frame, int16 cm, clipped to the slot, plus the blend settings and corridors |
| `layout.generated.ts` | the design's solids (OBB rows), points by id, gather/fishing nodes, wild trees, roads |
| `ground.ts` | decode + bilinear sample + blend weight; `ebv2Ground` is applied LAST in `world.ts` terrain pads |
| `decorations.ts` | one design tree per 10 yd decoration anchor (choppable, stable tree ids); procedural scatter off in the field |
| `colliders.ts` | the design boxes plus trunks for unanchored trees; `ebv2StandDown` retires shipped props on design ground |
| `points.ts` | `ebv2Point(id)` / `ebv2Xz(id)` / `ebv2Nodes(kind)` for content tables |

## Rules
- The two `*.generated.ts` files come ONLY from
  `npx tsx scripts/eastbrook_v2/import_eastbrook_v2.ts --src <WorldDesign/EastbrookVale>`.
  Never hand-edit them. Settings (y offset, clip, edge band, corridors, collider filters)
  live in `data/eastbrook_v2/import_config.json`; `data/eastbrook_v2/manifest.json` records
  the source commit and input hashes.
- Built-in world only: every entry point checks `isBuiltinWorldActive()` (or is gated by its
  caller), so authored and custom maps never see the design.
- Frames: design x/z pass through unchanged; heights are design y + yOffset (-8.3, so the
  design sea at 4.0 lands on WATER_LEVEL -4.3). The Unreal client draws sim y + 8.3 m on
  the v2 map.
- Content reads design places by id through `points.ts`; a dropped or renamed point throws
  at module load. Tests: `tests/eastbrook_v2_import.test.ts`, `tests/eastbrook_v2_world.test.ts`.
- Pure leaves: no rng draws, no clock, no DOM.
