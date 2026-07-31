import { TWO_PI, wrapAngle } from './constants';

export class ConvergenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConvergenceError';
  }
}

const DEFAULT_TOLERANCE = 1e-12;
const MAX_ITERATIONS = 80;

/**
 * Solves Kepler's equation M = E - e*sin(E) for the eccentric anomaly, by
 * Newton's method. Elliptic orbits only (0 <= e < 1).
 */
export function solveKepler(
  meanAnomaly: number,
  eccentricity: number,
  tolerance = DEFAULT_TOLERANCE
): number {
  if (eccentricity < 0 || eccentricity >= 1) {
    throw new RangeError(`solveKepler expects 0 <= e < 1, got ${eccentricity}`);
  }

  const M = wrapAngle(meanAnomaly);

  // Near-parabolic orbits converge poorly from M; this seed is the standard fix.
  let E = eccentricity < 0.8 ? M : Math.PI;

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const f = E - eccentricity * Math.sin(E) - M;
    const fPrime = 1 - eccentricity * Math.cos(E);
    const step = f / fPrime;
    E -= step;
    if (Math.abs(step) < tolerance) return wrapAngle(E);
  }

  throw new ConvergenceError(
    `Kepler's equation did not converge for M=${meanAnomaly}, e=${eccentricity}`
  );
}

/** Mean anomaly from eccentric anomaly. The easy direction. */
export function meanFromEccentric(eccentricAnomaly: number, eccentricity: number): number {
  return wrapAngle(eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly));
}

export function trueFromEccentric(eccentricAnomaly: number, eccentricity: number): number {
  const halfE = eccentricAnomaly / 2;
  return wrapAngle(
    2 *
      Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(halfE),
        Math.sqrt(1 - eccentricity) * Math.cos(halfE)
      )
  );
}

export function eccentricFromTrue(trueAnomaly: number, eccentricity: number): number {
  const halfNu = trueAnomaly / 2;
  return wrapAngle(
    2 *
      Math.atan2(
        Math.sqrt(1 - eccentricity) * Math.sin(halfNu),
        Math.sqrt(1 + eccentricity) * Math.cos(halfNu)
      )
  );
}

export { TWO_PI };
