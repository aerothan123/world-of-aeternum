// Sim space to Unreal space: the ONE place the export frame change lives (the
// TypeScript twin of the Unreal client's FSimSpace). The sim is right-handed,
// +Y up, 1 unit = 1 yard treated as 1 metre; Unreal is left-handed, +Z up,
// 1 uu = 1 cm. The mapping is ue = (x, z, y) * 100: the swap of Y and Z is
// the handedness flip, so no axis needs negating.
//
//   sim (x, y, z)  ->  UE (X = x*100, Y = z*100, Z = y*100)
//
// Yaw: a sim rotation `rotY` about +Y carries local +X to (cos, 0, -sin) in
// (x, y, z), which is (cos, -sin) in UE (X, Y). Unreal yaw psi carries +X to
// (cos psi, sin psi), so psi = -rotY. Every exporter record goes through these
// functions; nothing else in the exporter multiplies by 100 or negates a yaw.

export const UE_UNITS_PER_SIM_UNIT = 100;

export interface UeVec3 {
  x: number;
  y: number;
  z: number;
}

const RAD_TO_DEG = 180 / Math.PI;

/** Round to 0.001 uu so records are stable across platforms and diff cleanly. */
export function roundUu(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function simToUe(x: number, y: number, z: number): UeVec3 {
  return {
    x: roundUu(x * UE_UNITS_PER_SIM_UNIT),
    y: roundUu(z * UE_UNITS_PER_SIM_UNIT),
    z: roundUu(y * UE_UNITS_PER_SIM_UNIT),
  };
}

export function ueToSim(p: UeVec3): { x: number; y: number; z: number } {
  return {
    x: p.x / UE_UNITS_PER_SIM_UNIT,
    y: p.z / UE_UNITS_PER_SIM_UNIT,
    z: p.y / UE_UNITS_PER_SIM_UNIT,
  };
}

/** A length in sim units (yards) as Unreal units. */
export function simLengthToUu(v: number): number {
  return roundUu(v * UE_UNITS_PER_SIM_UNIT);
}

/** Sim yaw about +Y (radians) as Unreal yaw about +Z (degrees, -180..180]). */
export function simYawToUeYawDeg(rotY: number): number {
  let d = -rotY * RAD_TO_DEG;
  d = ((((d + 180) % 360) + 360) % 360) - 180;
  if (d === -180) d = 180;
  return Math.round(d * 1e4) / 1e4;
}

export function ueYawDegToSimYaw(deg: number): number {
  return -deg / RAD_TO_DEG;
}
