/** Earth's standard gravitational parameter, km^3/s^2 (EGM96). */
export const MU_EARTH = 398600.4418;

/** Earth's mean equatorial radius, km (WGS-84). */
export const R_EARTH = 6378.137;

/** Everything in the simulation is kilometres, seconds and radians. */
export const TWO_PI = Math.PI * 2;

/** Normalizes an angle into [0, 2*pi). */
export function wrapAngle(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}
