/**
 * The regimes, checked against the real world rather than against themselves.
 *
 * Every assertion here names a number an astrodynamicist would recognise
 * without being told which codebase it came from: 98.4 degrees, 11h58m,
 * 35,786 km, 92.6 minutes. That is deliberate. A test that asserts
 * `radiusForPeriod(T)` agrees with `period(r)` proves only that two functions
 * share a mistake - both are the same formula rearranged, so they agree on any
 * value of MU_EARTH including a wrong one.
 *
 * So the fixed points come from outside: the published GEO altitude, the
 * published GPS period, the inclination sun-synchronous missions actually fly.
 */
import { describe, expect, it } from 'vitest';
import {
  DAWN_LINE,
  J2,
  LOW_FIELD,
  REGIMES,
  RING,
  SHELL,
  SIDEREAL_DAY_S,
  eyebrow,
  mapFraction,
  nodalPrecession,
  radiusForPeriod,
  sunSynchronousInclination,
} from '../src/sim/regime';
import { R_EARTH } from '../src/sim/constants';

const DEG = Math.PI / 180;
const PER_DAY = 86400;

describe('the regimes: each is the physics it claims to be', () => {
  it('puts THE LOW FIELD on a 92.6 minute rev at 400 km', () => {
    expect(LOW_FIELD.altitudeKm).toBe(400);
    // The ISS number, and everybody knows it.
    expect(LOW_FIELD.periodSeconds / 60).toBeCloseTo(92.56, 1);
  });

  it('derives THE DAWN LINE inclination instead of typing 98 degrees', () => {
    // Sun-synchronous missions at this altitude fly 98.4 and change; Landsat 8
    // at 705 km flies 98.2. Nothing in src/ contains either figure.
    expect(DAWN_LINE.inclination / DEG).toBeCloseTo(98.39, 1);
    expect(DAWN_LINE.inclination).toBeGreaterThan(Math.PI / 2);
  });

  it('precesses THE DAWN LINE once per year, which is what makes it the dawn line', () => {
    // 360 degrees in 365.24 days is 0.9856 degrees a day, eastward. This is
    // the whole definition of the area, so it is checked as a rate rather
    // than inferred from the inclination that was solved to produce it.
    const perDay = (DAWN_LINE.nodalPrecession * PER_DAY) / DEG;
    expect(perDay).toBeCloseTo(0.9856, 3);
  });

  it('regresses THE LOW FIELD westward, with the same function and the same sign', () => {
    // The point STRUCTURE.md makes: one term, one sign, weather in one area and
    // the cure in another. At 400 km and 51.6 degrees this is about -5 deg/day,
    // which is why the ISS beta angle cycles roughly every two months.
    const perDay = (LOW_FIELD.nodalPrecession * PER_DAY) / DEG;
    expect(perDay).toBeCloseTo(-5.0, 0);
    expect(perDay).toBeLessThan(0);
  });

  it('puts THE SHELL two revolutions to the sidereal day, at the GPS altitude', () => {
    expect(SHELL.periodSeconds).toBeCloseTo(SIDEREAL_DAY_S / 2, 6);
    // 11 h 58 m, and 20,180 km - the published GPS semi-major axis is
    // 26,560 km, which is R_EARTH plus this.
    expect(SHELL.periodSeconds / 3600).toBeCloseTo(11.967, 2);
    expect(SHELL.altitudeKm).toBeCloseTo(20180, -2);
  });

  it('puts THE RING at 35 786 km, which nothing typed it as', () => {
    expect(RING.periodSeconds).toBeCloseTo(SIDEREAL_DAY_S, 6);
    // The most quoted altitude in spaceflight, arrived at from a period.
    expect(RING.altitudeKm).toBeCloseTo(35786, 0);
    expect(RING.inclination).toBe(0);
  });

  it('has no altitude typed into the two regimes defined by their tempo', () => {
    // Guards the property the file is built around: change MU_EARTH and these
    // move, because they were never written down.
    const source = SHELL.altitudeKm.toFixed(6);
    expect(source).not.toBe('20180.000000');
    expect(RING.altitudeKm.toFixed(6)).not.toBe('35786.000000');
  });

  it('refuses a sun-synchronous orbit where none exists', () => {
    // Past about 5,975 km altitude J2 cannot keep up with the sun at any
    // inclination. Returning a clamped angle would be inventing an orbit.
    expect(() => sunSynchronousInclination(R_EARTH + 12000)).toThrow(RangeError);
  });

  it('agrees with itself about period and radius', () => {
    // Weak on its own - both directions of one formula - so it is here as a
    // round-trip check and nothing more.
    expect(radiusForPeriod(SIDEREAL_DAY_S)).toBeCloseTo(RING.radiusKm, 6);
  });

  it('uses a J2 that is the published one', () => {
    expect(J2).toBeCloseTo(1.0826e-3, 7);
  });

  it('gives a polar orbit no nodal precession at all', () => {
    // cos(90 degrees) is zero, so the bulge has no lever arm. A model that
    // drifted a polar plane would be wrong in a way nothing on screen shows.
    expect(nodalPrecession(R_EARTH + 700, Math.PI / 2)).toBeCloseTo(0, 12);
  });
});

describe('the regimes: as a map', () => {
  it('runs strictly outward, so the ring order needs no sorting', () => {
    for (let i = 1; i < REGIMES.length; i += 1) {
      const inner = REGIMES[i - 1];
      const outer = REGIMES[i];
      expect(inner).toBeDefined();
      expect(outer).toBeDefined();
      if (inner === undefined || outer === undefined) continue;
      expect(outer.radiusKm).toBeGreaterThan(inner.radiusKm);
    }
  });

  it('separates every ring by more than the hairline that draws it', () => {
    // The reason the spacing is not linear, and then not purely logarithmic
    // either. Linear puts THE DAWN LINE 1% of the way out; log puts it 2.8%,
    // which on the plot table is 24 mm between two rings drawn 35 mm wide.
    const linear = (r: number): number =>
      (r - LOW_FIELD.radiusKm) / (RING.radiusKm - LOW_FIELD.radiusKm);
    expect(linear(DAWN_LINE.radiusKm)).toBeLessThan(0.02);

    const gaps = REGIMES.slice(1).map((r, i) => {
      const inner = REGIMES[i];
      return inner === undefined ? 0 : mapFraction(r) - mapFraction(inner);
    });
    for (const gap of gaps) expect(gap).toBeGreaterThan(0.15);
  });

  it('still says that geostationary is far, which is the point of a map', () => {
    // Legibility must not cost the scale entirely. The widest gap has to stay
    // clearly wider than the narrowest, or the map has become a list.
    const gaps = REGIMES.slice(1).map((r, i) => {
      const inner = REGIMES[i];
      return inner === undefined ? 0 : mapFraction(r) - mapFraction(inner);
    });
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(2);
  });

  it('pins the innermost at 0 and the outermost at 1', () => {
    expect(mapFraction(LOW_FIELD)).toBeCloseTo(0, 9);
    expect(mapFraction(RING)).toBeCloseTo(1, 9);
  });

  it('prints the eyebrow STRUCTURE.md specifies', () => {
    expect(eyebrow(LOW_FIELD)).toBe('LOW FIELD 400 KM');
    expect(eyebrow(RING)).toBe('THE RING 35786 KM');
  });

  it('carries a distinct weather and light for every area', () => {
    expect(new Set(REGIMES.map((r) => r.weather)).size).toBe(REGIMES.length);
    expect(new Set(REGIMES.map((r) => r.light)).size).toBe(REGIMES.length);
  });
});
