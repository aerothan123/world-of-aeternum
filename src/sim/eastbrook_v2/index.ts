// Eastbrook Vale v2: the Unreal design's ground, solids, trees and places laid into
// the eastbrook_vale slot of the built-in world. See ./CLAUDE.md.

export {
  ebv2Colliders,
  ebv2DropOwned,
  ebv2OwnsGround,
  ebv2RetiresShippedCollider,
  ebv2StandDown,
  ebv2StandingColliderIndexes,
} from './colliders';
export {
  ebv2AnchorOf,
  ebv2Decoration,
  ebv2OwnsAnchor,
  ebv2TreeForAnchor,
  ebv2UnanchoredTreeIndexes,
} from './decorations';
export {
  EBV2_OWNED,
  ebv2FieldHeight,
  ebv2Ground,
  ebv2Owns,
  ebv2OwnsBuiltin,
  ebv2Weight,
  inEbv2Field,
} from './ground';
export {
  ebv2Nodes,
  ebv2Point,
  ebv2RoadClearance,
  ebv2RoadPolylines,
  ebv2Xz,
} from './points';
export { EBV2_REST_PADDING, ebv2RestsAt } from './rest';
