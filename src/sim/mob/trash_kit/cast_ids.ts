// The dungeon trash kit's shared cue ids, as a dependency-free leaf: the kit
// driver and the renderer key on these strings. Each dungeon's own casts live
// in its sibling file (bastion_cast_ids.ts, temple_cast_ids.ts,
// sanctum_cast_ids.ts, wildheart_cast_ids.ts). The ids keep their first
// dungeon's prefix: they ship on the wire and are frozen.

/** Presentation cue ids (never casts): the `windup` spellfx a perched mob
 *  sends as it dives off its perch, and a flier as it breaks off its flight
 *  to land. The renderer keys the awaken and the sky roar on them. */
export const CRYPT_PERCH_DIVE = 'crypt_perch_dive';
export const CRYPT_SKY_LANDING = 'crypt_sky_landing';
