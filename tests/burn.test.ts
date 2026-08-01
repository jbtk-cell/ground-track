import { describe, expect, it } from 'vitest';
import {
  MU_EARTH,
  apoapsisRadius,
  applyDeltaV,
  integrateBurn,
  periapsisRadius,
  prograde,
  scale,
  specificEnergy,
  stateAt,
  stepBurn,
  type Elements,
  type State,
} from '../src/sim';

/** Periapsis passage at t = 0, matching how the mission burns at a node. */
const EL: Elements = { a: 8700, e: 0.02, i: 0.52, raan: 0.7, argp: 1.1, m0: 0 };
const ACCEL_MS2 = 11;
const DURATION_S = 8;

describe('integrateBurn', () => {
  it('matches the impulsive prediction closely for a short burn', () => {
    const finite = integrateBurn(EL, 0, DURATION_S, ACCEL_MS2);
    const state = stateAt(EL, 0);
    const impulse = applyDeltaV(EL, 0, scale(prograde(state), (ACCEL_MS2 * DURATION_S) / 1000));
    expect(Math.abs(apoapsisRadius(finite) - apoapsisRadius(impulse))).toBeLessThan(5);
  });

  it('leaves the periapsis nearly untouched by a burn at periapsis', () => {
    const after = integrateBurn(EL, 0, DURATION_S, ACCEL_MS2);
    expect(Math.abs(periapsisRadius(after) - periapsisRadius(EL))).toBeLessThan(3);
  });

  it('converges: dtMax 0.25 and 0.05 agree', () => {
    const coarse = integrateBurn(EL, 0, DURATION_S, ACCEL_MS2, 0.25);
    const fine = integrateBurn(EL, 0, DURATION_S, ACCEL_MS2, 0.05);
    expect(coarse.a).toBeCloseTo(fine.a, 3);
    expect(coarse.e).toBeCloseTo(fine.e, 8);
    expect(apoapsisRadius(coarse)).toBeCloseTo(apoapsisRadius(fine), 3);
  });

  it('returns the input orbit for a zero-length burn', () => {
    expect(integrateBurn(EL, 0, 0, ACCEL_MS2)).toEqual(EL);
    expect(integrateBurn(EL, 0, -5, ACCEL_MS2)).toEqual(EL);
  });
});

describe('stepBurn', () => {
  it('raises energy monotonically under prograde thrust', () => {
    let state: State = stateAt(EL, 0);
    let energy = specificEnergy(state);
    for (let k = 0; k < 64; k += 1) {
      state = stepBurn(state, ACCEL_MS2, 0.25);
      const next = specificEnergy(state);
      expect(next).toBeGreaterThan(energy);
      energy = next;
    }
  });

  it('agrees with integrateBurn when stepped to the same end time', () => {
    let state: State = stateAt(EL, 0);
    for (let k = 0; k < DURATION_S / 0.25; k += 1) {
      state = stepBurn(state, ACCEL_MS2, 0.25);
    }
    const viaIntegrate = integrateBurn(EL, 0, DURATION_S, ACCEL_MS2, 0.25);
    expect(specificEnergy(state)).toBeCloseTo(-MU_EARTH / (2 * viaIntegrate.a), 9);
  });
});
