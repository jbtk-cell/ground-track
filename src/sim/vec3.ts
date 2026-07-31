/** Minimal immutable 3-vector. Deliberately not three.js: this module must stay
 *  engine-independent so the simulation runs headlessly and ports cleanly. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export const ZERO: Vec3 = vec3(0, 0, 0);

export function add(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function scale(a: Vec3, k: number): Vec3 {
  return vec3(a.x * k, a.y * k, a.z * k);
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len === 0 ? ZERO : scale(a, 1 / len);
}

/** Rotation about the z axis, right-handed. */
export function rotateZ(a: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec3(a.x * c - a.y * s, a.x * s + a.y * c, a.z);
}

/** Rotation about the x axis, right-handed. */
export function rotateX(a: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec3(a.x, a.y * c - a.z * s, a.y * s + a.z * c);
}
