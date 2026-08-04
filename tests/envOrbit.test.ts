import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { R_EARTH, TWO_PI, dot, length, vec3, type Vec3 } from '../src/sim';
import {
  LIMB_DECK_GEOMETRY,
  LIMB_DECK_GEOMETRY_REDUCED,
  LIMB_DECK_ORBIT,
  REDUCED_MOTION_STEP_SECONDS,
  orbitGeometry,
  sampleOrbit,
  sunDirection,
} from '../src/env/orbit';

const DEG = Math.PI / 180;
const BETA = LIMB_DECK_ORBIT.beta;

/** Wall time at which the clock reaches a given phase, on its first approach. */
function timeAtPhase(phase: number, geometry = LIMB_DECK_GEOMETRY): number {
  let advance = phase - geometry.params.phase0;
  while (advance < 0) advance += TWO_PI;
  return advance / geometry.meanMotion / geometry.params.timeScale;
}

/** First t in [lo, hi] where a monotone predicate flips false to true. */
function crossing(predicate: (t: number) => boolean, lo: number, hi: number): number {
  expect(predicate(lo)).toBe(false);
  expect(predicate(hi)).toBe(true);
  let low = lo;
  let high = hi;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (predicate(mid)) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

/**
 * The right-handed angle of a vector in the plane perpendicular to an axis.
 * About +X the cycle is y to z, about +Y it is z to x, about +Z it is x to y.
 */
function bearingAbout(axis: 'x' | 'y' | 'z', v: Vec3): number {
  if (axis === 'x') return Math.atan2(v.z, v.y);
  if (axis === 'y') return Math.atan2(v.x, v.z);
  return Math.atan2(v.y, v.x);
}

function wrapToPi(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Signed turns the sun makes about an axis over one revolution of phase. */
function windingAbout(axis: 'x' | 'y' | 'z', beta: number, steps = 720): number {
  let total = 0;
  let previous = bearingAbout(axis, sunDirection(0, beta));
  for (let i = 1; i <= steps; i += 1) {
    const bearing = bearingAbout(axis, sunDirection((TWO_PI * i) / steps, beta));
    total += wrapToPi(bearing - previous);
    previous = bearing;
  }
  return total;
}

describe('the sun vector', () => {
  it('is a unit vector at every phase and every beta', () => {
    for (const beta of [0, 12 * DEG, BETA, 60 * DEG, 75 * DEG, -38 * DEG]) {
      for (let i = 0; i < 512; i += 1) {
        expect(length(sunDirection((TWO_PI * i) / 512, beta))).toBeCloseTo(1, 12);
      }
    }
  });

  it('holds a constant cross-track component of -sin(beta) across a revolution', () => {
    const zhat = vec3(0, 0, 1);
    const expected = -Math.sin(BETA);
    for (let i = 0; i < 512; i += 1) {
      expect(dot(sunDirection((TWO_PI * i) / 512, BETA), zhat)).toBeCloseTo(expected, 12);
    }
  });

  it('revolves exactly once about +Z per orbit, and not at all about +X or +Y', () => {
    // The judges caught the source design claiming the sun revolves about the
    // module's long axis. It does not: s_z is constant, so the sun rides a cone
    // about cross-track. This assertion is the whole reason the test exists.
    expect(windingAbout('z', BETA) / TWO_PI).toBeCloseTo(1, 9);
    expect(windingAbout('x', BETA)).toBeCloseTo(0, 9);
    expect(windingAbout('y', BETA)).toBeCloseTo(0, 9);
  });

  it('turns uniformly about +Z, a quarter turn ahead of the phase', () => {
    for (let i = 0; i < 64; i += 1) {
      const phase = (TWO_PI * i) / 64;
      const bearing = bearingAbout('z', sunDirection(phase, BETA));
      expect(wrapToPi(bearing - (phase + Math.PI / 2))).toBeCloseTo(0, 12);
    }
  });

  it('puts the sun at zenith at local noon and at nadir-ward at local midnight', () => {
    const noon = sunDirection(0, BETA);
    expect(noon.x).toBeCloseTo(0, 12);
    expect(noon.y).toBeCloseTo(Math.cos(BETA), 12);

    const midnight = sunDirection(Math.PI, BETA);
    expect(midnight.y).toBeCloseTo(-Math.cos(BETA), 12);
  });

  it('keeps the sun permanently to port at positive beta', () => {
    // The consequence that cost the design its starboard scuttle.
    for (let i = 0; i < 512; i += 1) {
      expect(sunDirection((TWO_PI * i) / 512, BETA).z).toBeLessThan(0);
    }
  });

  it('rises on the fore bulkhead side and sets on the aft side', () => {
    // Sunrise light arrives from +X and lands on the aft bulkhead; sunset light
    // arrives from -X and dies on the forward one, as the room is written.
    const entry = Math.PI - LIMB_DECK_GEOMETRY.eclipseHalfAngle;
    const exit = Math.PI + LIMB_DECK_GEOMETRY.eclipseHalfAngle;
    expect(sunDirection(entry, BETA).x).toBeLessThan(0);
    expect(sunDirection(exit, BETA).x).toBeGreaterThan(0);
  });
});

describe('derived constants', () => {
  it('derives the 5553 s period and the 277.7 s revolution at 20x', () => {
    expect(Math.abs(LIMB_DECK_GEOMETRY.periodSeconds - 5553)).toBeLessThan(1);
    expect(LIMB_DECK_GEOMETRY.revolutionWallSeconds).toBeCloseTo(277.7, 1);
  });

  it('derives the beta cutoff asin(6378/6778) = 70.2 deg', () => {
    expect(LIMB_DECK_GEOMETRY.betaCutoff / DEG).toBeCloseTo(70.2, 1);
    expect(LIMB_DECK_GEOMETRY.betaCutoff).toBeCloseTo(
      Math.asin(R_EARTH / (R_EARTH + LIMB_DECK_ORBIT.altitudeKm)),
      12
    );
  });

  it('derives the 19.8 deg horizon depression as the cutoff complement', () => {
    expect(LIMB_DECK_GEOMETRY.horizonDepression / DEG).toBeCloseTo(19.8, 1);
    expect(LIMB_DECK_GEOMETRY.horizonDepression + LIMB_DECK_GEOMETRY.betaCutoff).toBeCloseTo(
      Math.PI / 2,
      12
    );
  });

  it('derives the 0.359 eclipse fraction at beta 38 and 400 km', () => {
    expect(LIMB_DECK_GEOMETRY.eclipseFraction).toBeCloseTo(0.359, 3);
  });

  it('derives the dial wedge as 129 deg of shaded arc', () => {
    expect((2 * LIMB_DECK_GEOMETRY.eclipseHalfAngle) / DEG).toBeCloseTo(129, 0);
    expect(LIMB_DECK_GEOMETRY.eclipseFraction * 360).toBeCloseTo(129.1, 1);
  });

  it('agrees with the eclipse arc actually sampled around the orbit', () => {
    // The closed form and the per-frame umbra test are separate code paths and
    // a wrong beta rewrites the room's light story without saying so.
    const steps = 50000;
    let dark = 0;
    for (let i = 0; i < steps; i += 1) {
      const t = (i / steps) * LIMB_DECK_GEOMETRY.revolutionWallSeconds;
      if (sampleOrbit(t).eclipsed) dark += 1;
    }
    expect(dark / steps).toBeCloseTo(LIMB_DECK_GEOMETRY.eclipseFraction, 4);
  });

  it('shrinks the eclipse to nothing at the beta cutoff and stays there above it', () => {
    const cutoff = LIMB_DECK_GEOMETRY.betaCutoff;
    let previous = Infinity;
    for (const beta of [0, 20 * DEG, BETA, 55 * DEG, cutoff - 1e-6]) {
      const fraction = orbitGeometry({ ...LIMB_DECK_ORBIT, beta }).eclipseFraction;
      expect(fraction).toBeLessThan(previous);
      previous = fraction;
    }
    // At the cutoff itself the sqrt-and-asin round trip lands half an ulp short
    // of a grazing pass, which is zero eclipse to any measure the room can see.
    expect(orbitGeometry({ ...LIMB_DECK_ORBIT, beta: cutoff }).eclipseFraction).toBeLessThan(1e-8);
    for (const beta of [cutoff + 1e-9, 80 * DEG, Math.PI / 2]) {
      expect(orbitGeometry({ ...LIMB_DECK_ORBIT, beta }).eclipseFraction).toBe(0);
    }
  });

  it('puts the beta cutoff where the midnight sun ray just grazes the surface', () => {
    const grazing = orbitGeometry({ ...LIMB_DECK_ORBIT, beta: LIMB_DECK_GEOMETRY.betaCutoff });
    expect(sampleOrbit(timeAtPhase(Math.PI, grazing), grazing).tangentHeightKm).toBeCloseTo(0, 8);
  });
});

describe('the terminator grade', () => {
  const entry = Math.PI - LIMB_DECK_GEOMETRY.eclipseHalfAngle;

  it('spawns in full sun, twenty-five degrees short of local noon', () => {
    const spawn = sampleOrbit(0);
    expect(spawn.phase / DEG).toBeCloseTo(335, 9);
    expect(spawn.grade).toBe(0);
    expect(spawn.intensity).toBe(1);
    expect(spawn.eclipsed).toBe(false);
  });

  it('is unattenuated at local noon and fully out at local midnight', () => {
    const noon = sampleOrbit(timeAtPhase(0));
    expect(noon.intensity).toBeCloseTo(1, 12);
    expect(noon.grade).toBeCloseTo(0, 12);
    expect(noon.tangentHeightKm).toBeCloseTo(LIMB_DECK_ORBIT.altitudeKm, 9);

    const midnight = sampleOrbit(timeAtPhase(Math.PI));
    expect(midnight.eclipsed).toBe(true);
    expect(midnight.intensity).toBe(0);
    expect(midnight.grade).toBe(1);
  });

  it('never brightens on the way from noon into shadow', () => {
    const steps = 2000;
    const end = timeAtPhase(Math.PI);
    let previous = Infinity;
    for (let i = 0; i <= steps; i += 1) {
      const sample = sampleOrbit((end * i) / steps);
      expect(sample.intensity).toBeLessThanOrEqual(previous + 1e-12);
      previous = sample.intensity;
    }
  });

  it('grades for 4 s and steps for 0.2 s of wall time at 20x', () => {
    const dark = crossing((t) => sampleOrbit(t).eclipsed, 0, 200);
    const gradeOn = crossing((t) => sampleOrbit(t).grade > 0, 0, 200);
    const stepOn = crossing((t) => sampleOrbit(t).grade >= 1, 0, 200);

    expect(dark).toBeCloseTo(timeAtPhase(entry), 6);
    expect(dark - gradeOn).toBeCloseTo(LIMB_DECK_ORBIT.gradeWallSeconds, 4);
    expect(dark - stepOn).toBeCloseTo(LIMB_DECK_ORBIT.stepWallSeconds, 4);

    // The grade dims as it reddens, and the step does the rest of the work:
    // most of the light is still there when the colour has finished moving.
    expect(sampleOrbit(gradeOn).intensity).toBeCloseTo(1, 6);
    const atStep = sampleOrbit(stepOn).intensity;
    expect(atStep).toBeGreaterThan(0.3);
    expect(atStep).toBeLessThan(0.6);
  });

  it('stretches only the step, not the eclipse, under reduced motion', () => {
    const reduced = LIMB_DECK_GEOMETRY_REDUCED;
    const dark = crossing((t) => sampleOrbit(t, reduced).eclipsed, 0, 200);
    const stepOn = crossing((t) => sampleOrbit(t, reduced).grade >= 1, 0, 200);

    expect(dark - stepOn).toBeCloseTo(REDUCED_MOTION_STEP_SECONDS, 4);
    expect(dark).toBeCloseTo(
      crossing((t) => sampleOrbit(t).eclipsed, 0, 200),
      9
    );
    expect(reduced.eclipseFraction).toBe(LIMB_DECK_GEOMETRY.eclipseFraction);
  });

  it('mirrors sunrise against sunset about local midnight', () => {
    const midnight = timeAtPhase(Math.PI);
    const revolution = LIMB_DECK_GEOMETRY.revolutionWallSeconds;
    for (const offset of [1, 2, 3.5, 4.5, 20, 60]) {
      const before = sampleOrbit(midnight - offset);
      const after = sampleOrbit(midnight + offset);
      expect(after.tangentHeightKm).toBeCloseTo(before.tangentHeightKm, 8);
      expect(after.intensity).toBeCloseTo(before.intensity, 12);
      expect(after.grade).toBeCloseTo(before.grade, 12);
      // And the whole light story repeats one revolution later.
      expect(sampleOrbit(midnight + offset + revolution).intensity).toBeCloseTo(after.intensity, 9);
    }
  });

  it('keeps intensity and grade inside their normalised ranges all orbit', () => {
    for (let i = 0; i < 4000; i += 1) {
      const sample = sampleOrbit((i / 4000) * LIMB_DECK_GEOMETRY.revolutionWallSeconds);
      expect(sample.intensity).toBeGreaterThanOrEqual(0);
      expect(sample.intensity).toBeLessThanOrEqual(1);
      expect(sample.grade).toBeGreaterThanOrEqual(0);
      expect(sample.grade).toBeLessThanOrEqual(1);
      expect(sample.eclipsed).toBe(sample.intensity === 0);
    }
  });
});

describe('the sub-satellite point', () => {
  it('reaches the inclination in latitude and crosses the equator twice a revolution', () => {
    const steps = 4000;
    let peak = 0;
    let crossings = 0;
    let previous = sampleOrbit(0).latitude;
    for (let i = 1; i <= steps; i += 1) {
      const { latitude } = sampleOrbit((i / steps) * LIMB_DECK_GEOMETRY.revolutionWallSeconds);
      peak = Math.max(peak, Math.abs(latitude));
      if (Math.sign(latitude) !== Math.sign(previous)) crossings += 1;
      previous = latitude;
    }
    expect(peak).toBeCloseTo(LIMB_DECK_ORBIT.inclination, 3);
    expect(crossings).toBe(2);
  });

  it('regresses the ground track westward by one revolution of Earth rotation', () => {
    const revolution = LIMB_DECK_GEOMETRY.revolutionWallSeconds;
    const first = sampleOrbit(timeAtPhase(Math.PI / 2));
    const second = sampleOrbit(timeAtPhase(Math.PI / 2) + revolution);
    const drift = wrapToPi(second.longitude - first.longitude);
    expect(second.latitude).toBeCloseTo(first.latitude, 9);
    expect(drift).toBeLessThan(0);
    expect(-drift / DEG).toBeCloseTo(23.2, 1);
  });

  it('starts at the ascending node the epoch pins', () => {
    const start = sampleOrbit(0);
    expect(start.latitude).toBeCloseTo(0, 12);
    expect(start.longitude).toBeCloseTo(0, 12);
  });

  it('carries the node longitude through to the track', () => {
    const shifted = orbitGeometry({ ...LIMB_DECK_ORBIT, nodeLongitude0: 0.7 });
    expect(sampleOrbit(0, shifted).longitude).toBeCloseTo(0.7, 12);
  });
});

describe('determinism', () => {
  it('returns the identical sample for the identical time, in any order', () => {
    const times = [0, 3.25, 91.5, 138.25, 277.68, 1000];
    const forward = times.map((t) => sampleOrbit(t));
    const backward = [...times].reverse().map((t) => sampleOrbit(t));
    expect(backward.reverse()).toEqual(forward);
    // Interleaving other queries cannot move a later answer.
    for (const t of times) sampleOrbit(t * 1.37 + 11);
    expect(times.map((t) => sampleOrbit(t))).toEqual(forward);
  });

  it('holds no clock and no unseeded randomness in its source', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/env/orbit.ts', import.meta.url)), {
      encoding: 'utf8',
    });
    for (const banned of ['Date.now', 'performance.now', 'Math.random', 'new Date']) {
      expect(source).not.toContain(banned);
    }
  });
});
