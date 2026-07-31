import { describe, expect, it } from 'vitest';
import {
  ConvergenceError,
  eccentricFromTrue,
  meanFromEccentric,
  solveKepler,
  trueFromEccentric,
  wrapAngle,
} from '../src/sim';

describe('wrapAngle', () => {
  it('brings negative angles into [0, 2pi)', () => {
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('leaves an in-range angle alone', () => {
    expect(wrapAngle(1)).toBeCloseTo(1, 12);
  });
});

describe('solveKepler', () => {
  it('is the identity at zero eccentricity', () => {
    expect(solveKepler(1.2, 0)).toBeCloseTo(1.2, 10);
  });

  it('rejects parabolic and hyperbolic eccentricities', () => {
    expect(() => solveKepler(1, 1)).toThrow(RangeError);
    expect(() => solveKepler(1, 1.5)).toThrow(RangeError);
  });

  it('exports a convergence error type for pathological inputs', () => {
    expect(ConvergenceError.prototype).toBeInstanceOf(Error);
  });

  // The defining property: solving M -> E then substituting back must reproduce M.
  it('inverts Kepler equation across the eccentricity range', () => {
    for (const e of [0, 0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.95]) {
      for (let k = 0; k < 24; k += 1) {
        const M = (k / 24) * 2 * Math.PI;
        const E = solveKepler(M, e);
        expect(meanFromEccentric(E, e)).toBeCloseTo(M, 9);
      }
    }
  });
});

describe('anomaly conversions', () => {
  it('round-trips true and eccentric anomaly', () => {
    for (const e of [0, 0.05, 0.2, 0.6, 0.9]) {
      for (let k = 1; k < 20; k += 1) {
        const nu = (k / 20) * 2 * Math.PI;
        const E = eccentricFromTrue(nu, e);
        expect(trueFromEccentric(E, e)).toBeCloseTo(nu, 9);
      }
    }
  });

  it('agrees with true anomaly at periapsis and apoapsis', () => {
    expect(trueFromEccentric(0, 0.4)).toBeCloseTo(0, 12);
    expect(trueFromEccentric(Math.PI, 0.4)).toBeCloseTo(Math.PI, 12);
  });
});
