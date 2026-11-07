// Player housing (Project H): placed house chairs, stools and benches as SEATS.
// The built-in seats are static building data (seat_registry.ts); a house seat
// is derived on demand from a placed-furniture entity standing in a claimed
// house copy (furniture_objects.ts), so it needs no registry row, no stored
// occupancy and no save data: the seat exists exactly while its piece stands.
//
// Seat id: `house:<entityId>` (the wire token of the sit command). The seat's
// anchor is the piece's own spot, its facing the piece's facing, and the stand
// spot is HOUSE_SEAT_STAND yards in front of it, on the floor. Furniture is
// walk-through (cottage_layout.ts), so the stand spot never fights a collider.
// Everything else (alive, out of combat, reach, nobody holding it) is the
// generic seatRefusal in seating.ts.
//
// A pure function over SimContext: no rng, no clock.

import { furnitureDefFor } from '../content/furniture';
import type { SeatAnchor, SeatKind, SeatPose } from '../seat_anchor';
import { SEAT_CHAIR_HEIGHT } from '../seat_anchor';
import type { SimContext } from '../sim_context';
import { furnitureItemOf } from './furniture_template';

export const HOUSE_SEAT_PREFIX = 'house:';

/** How far in front of a seat piece its stand spot lies (yards). */
export const HOUSE_SEAT_STAND = 0.7;

/** The furniture items a body can sit on, with the seat kind and clip pose. */
export const HOUSE_SEAT_PIECES: Readonly<Record<string, { kind: SeatKind; pose: SeatPose }>> =
  Object.freeze({
    furn_wooden_chair: { kind: 'chair', pose: 'relaxed' },
    furn_wooden_stool: { kind: 'stool', pose: 'upright' },
    furn_oak_bench: { kind: 'bench', pose: 'upright' },
  });

export function houseSeatId(entityId: number): string {
  return `${HOUSE_SEAT_PREFIX}${entityId}`;
}

/** True for a furniture item a body can sit on. */
export function isHouseSeatPiece(itemId: string | null | undefined): boolean {
  return !!itemId && HOUSE_SEAT_PIECES[itemId] !== undefined && !!furnitureDefFor(itemId);
}

/** The seat a placed piece offers, from its position and facing (pure, for the
 *  sim and the clients alike). */
export function houseSeatFromPiece(
  entityId: number,
  itemId: string,
  pos: { x: number; y: number; z: number },
  facing: number,
): SeatAnchor | null {
  const piece = HOUSE_SEAT_PIECES[itemId];
  if (!piece) return null;
  const standX = pos.x + Math.sin(facing) * HOUSE_SEAT_STAND;
  const standZ = pos.z + Math.cos(facing) * HOUSE_SEAT_STAND;
  return {
    id: houseSeatId(entityId),
    group: houseSeatId(entityId),
    kind: piece.kind,
    pose: piece.pose,
    x: pos.x,
    z: pos.z,
    seatY: pos.y + SEAT_CHAIR_HEIGHT * 0.5,
    floorY: pos.y,
    facing,
    standX,
    standZ,
    presit: HOUSE_SEAT_STAND,
    pick: { x: pos.x, z: pos.z, hw: 0.4, hd: 0.4, rot: facing, y0: pos.y, y1: pos.y + 1.2 },
  };
}

/** The seat behind a `house:<entityId>` id, or null when the id is not a house
 *  seat or its piece no longer stands (a stale or forged command). */
export function houseSeatFor(ctx: SimContext, seatId: string): SeatAnchor | null {
  if (!seatId.startsWith(HOUSE_SEAT_PREFIX)) return null;
  const raw = seatId.slice(HOUSE_SEAT_PREFIX.length);
  if (!/^\d{1,15}$/.test(raw)) return null;
  const e = ctx.entities.get(Number(raw));
  if (!e || e.kind !== 'object') return null;
  const itemId = furnitureItemOf(e.templateId);
  if (!isHouseSeatPiece(itemId)) return null;
  return houseSeatFromPiece(e.id, itemId as string, e.pos, e.facing);
}
