export type Vec3 = [number, number, number] | number[];
export type Quat = [number, number, number, number] | number[];
export interface PoseJoint {
  name: string;
  parent: number;
  pos: Vec3;
}
export interface Pose {
  rot: Quat[];
  pos: Vec3[];
}
export function wocJointForTripo(name: string): string | null;
export const ALIGN_CHAINS: [string, string, string, string][];
export const WOC_POSITION_SOURCE: Record<string, string>;
export function sub(a: Vec3, b: Vec3): number[];
export function add(a: Vec3, b: Vec3): number[];
export function scale(a: Vec3, s: number): number[];
export function dot(a: Vec3, b: Vec3): number;
export function cross(a: Vec3, b: Vec3): number[];
export function len(a: Vec3): number;
export function norm(a: Vec3): number[];
export const QI: number[];
export function qmul(a: Quat, b: Quat): number[];
export function qrot(q: Quat, v: Vec3): number[];
export function qFromTo(from: Vec3, to: Vec3): number[];
export function poseSkeleton(
  joints: PoseJoint[],
  align: Map<string, { child: string; dir: Vec3 }>,
): Pose;
export function reskinVertex(
  v: Vec3,
  n: Vec3 | null,
  idx: number[],
  wts: number[],
  restPos: Vec3[],
  pose: Pose,
): { v: number[]; n: number[] | null };
export function remapInfluences(
  idx: number[],
  wts: number[],
  map: number[],
  fallback: number,
): { idx: number[]; wts: number[] };
