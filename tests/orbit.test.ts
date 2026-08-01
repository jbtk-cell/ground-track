import { describe, expect, it } from 'vitest';
import {
  MU_EARTH,
  R_EARTH,
  apoapsisRadius,
  applyDeltaV,
  elementsFromState,
  length,
  meanAnomalyAt,
  normalize,
  orbitPointAtE,
  perifocalToInertial,
  period,
  periapsisRadius,
  prograde,
  scale,
  solveKepler,
  specificAngularMomentum,
  specificEnergy,
  stateAt,
  vec3,
  visViva,
  type Elements,
} from '../src/sim';

/** A representative low Earth orbit: 500 km circular-ish, inclined. */
const LEO: Elements = {
  a: R_EARTH + 500,
  e: 0.001,
  i: 0.9,
  raan: 0.4,
  argp: 1.1,
  m0: 0.2,
};

/** A deliberately eccentric transfer orbit, to exercise the hard cases. */
const TRANSFER: Elements = {
  a: R_EARTH + 3000,
  e: 0.35,
  i: 0.5,
  raan: 2.0,
  argp: 0.3,
  m0: 1.7,
};

const ORBITS: ReadonlyArray<readonly [string, Elements]> = [
  ['LEO', LEO],
  ['transfer', TRANSFER],
];

describe('period', () => {
  it("obeys Kepler's third law: T^2 is proportional to a^3", () => {
    const a1 = R_EARTH + 500;
    const a2 = R_EARTH + 20000;
    const ratio = (period(a1) / period(a2)) ** 2 / (a1 / a2) ** 3;
    expect(ratio).toBeCloseTo(1, 10);
  });

  it('matches the known ~94 minute period of a 500 km orbit', () => {
    expect(period(R_EARTH + 500) / 60).toBeCloseTo(94.6, 0);
  });
});

describe.each(ORBITS)('conservation along a coasting %s orbit', (_name, el) => {
  const samples = Array.from({ length: 48 }, (_, k) => (k / 48) * period(el.a));

  it('conserves specific orbital energy', () => {
    const expected = -MU_EARTH / (2 * el.a);
    for (const t of samples) {
      expect(specificEnergy(stateAt(el, t))).toBeCloseTo(expected, 8);
    }
  });

  it('conserves the magnitude of specific angular momentum', () => {
    const expected = Math.sqrt(MU_EARTH * el.a * (1 - el.e * el.e));
    for (const t of samples) {
      expect(length(specificAngularMomentum(stateAt(el, t)))).toBeCloseTo(expected, 6);
    }
  });

  it('keeps the radius between periapsis and apoapsis', () => {
    const rp = periapsisRadius(el);
    const ra = apoapsisRadius(el);
    for (const t of samples) {
      const r = length(stateAt(el, t).position);
      expect(r).toBeGreaterThanOrEqual(rp - 1e-6);
      expect(r).toBeLessThanOrEqual(ra + 1e-6);
    }
  });

  it('agrees with the vis-viva equation', () => {
    for (const t of samples) {
      const state = stateAt(el, t);
      expect(length(state.velocity)).toBeCloseTo(visViva(length(state.position), el.a), 8);
    }
  });

  it('returns to its starting state after exactly one period', () => {
    const start = stateAt(el, 0);
    const after = stateAt(el, period(el.a));
    expect(after.position.x).toBeCloseTo(start.position.x, 6);
    expect(after.position.y).toBeCloseTo(start.position.y, 6);
    expect(after.position.z).toBeCloseTo(start.position.z, 6);
  });
});

describe.each(ORBITS)('state and elements round-trip for %s', (_name, el) => {
  it('recovers the elements it was built from', () => {
    for (let k = 0; k < 12; k += 1) {
      const t = (k / 12) * period(el.a);
      const recovered = elementsFromState(stateAt(el, t));

      expect(recovered.a).toBeCloseTo(el.a, 6);
      expect(recovered.e).toBeCloseTo(el.e, 9);
      expect(recovered.i).toBeCloseTo(el.i, 9);
      expect(recovered.raan).toBeCloseTo(el.raan, 8);
      expect(recovered.argp).toBeCloseTo(el.argp, 7);
    }
  });

  it('recovers a position identical to the one it was derived from', () => {
    const t = period(el.a) * 0.31;
    const original = stateAt(el, t);
    const reflown = stateAt(elementsFromState(original), 0);
    expect(reflown.position.x).toBeCloseTo(original.position.x, 6);
    expect(reflown.position.y).toBeCloseTo(original.position.y, 6);
    expect(reflown.position.z).toBeCloseTo(original.position.z, 6);
  });
});

// The renderer consumes these two instead of re-deriving the rotation
// convention, so the drawn conic and the propagated satellite must be pinned
// to the same frame here.
describe.each(ORBITS)('perifocalToInertial and orbitPointAtE for %s', (_name, el) => {
  it('passes through the propagated position at every sampled time', () => {
    for (let k = 0; k < 12; k += 1) {
      const t = (k / 12) * period(el.a);
      const E = solveKepler(meanAnomalyAt(el, t), el.e);
      const sampled = orbitPointAtE(el, E);
      const flown = stateAt(el, t).position;
      expect(sampled.x).toBeCloseTo(flown.x, 6);
      expect(sampled.y).toBeCloseTo(flown.y, 6);
      expect(sampled.z).toBeCloseTo(flown.z, 6);
    }
  });

  it('sends the perifocal z axis to the angular momentum direction', () => {
    const n = perifocalToInertial(el)(vec3(0, 0, 1));
    const h = normalize(specificAngularMomentum(stateAt(el, 100)));
    expect(n.x).toBeCloseTo(h.x, 8);
    expect(n.y).toBeCloseTo(h.y, 8);
    expect(n.z).toBeCloseTo(h.z, 8);
  });
});

describe('applyDeltaV', () => {
  // This is the game's central promise under test: the number the player
  // supplies and the number the world obeys must be the same number.
  it('raises apoapsis to the value a prograde burn predicts', () => {
    const start: Elements = { ...LEO, e: 0, m0: 0 };
    const burnTime = 0;
    const state = stateAt(start, burnTime);

    const r = length(state.position);
    const targetApoapsis = r + 440;

    // Vis-viva for the transfer ellipse whose periapsis is here.
    const transferA = (r + targetApoapsis) / 2;
    const requiredSpeed = visViva(r, transferA);
    const deltaVMagnitude = requiredSpeed - length(state.velocity);

    const after = applyDeltaV(start, burnTime, scale(prograde(state), deltaVMagnitude));

    expect(apoapsisRadius(after)).toBeCloseTo(targetApoapsis, 5);
    expect(periapsisRadius(after)).toBeCloseTo(r, 5);
  });

  it('leaves the orbit unchanged for a zero burn', () => {
    const after = applyDeltaV(TRANSFER, 1000, { x: 0, y: 0, z: 0 });
    expect(after.a).toBeCloseTo(TRANSFER.a, 6);
    expect(after.e).toBeCloseTo(TRANSFER.e, 9);
  });

  it('lowers apoapsis for a retrograde burn', () => {
    const state = stateAt(TRANSFER, 0);
    const before = apoapsisRadius(TRANSFER);
    const after = applyDeltaV(TRANSFER, 0, scale(prograde(state), -0.05));
    expect(apoapsisRadius(after)).toBeLessThan(before);
  });
});
