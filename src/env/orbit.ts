/**
 * The orbital clock every environment runs on.
 *
 * Pure: no three.js, no DOM, no wall clock, no randomness. Every animator in a
 * room is a function of one of these samples, so the shot harness can pin a
 * time and get the identical frame back forever - docs/ENVIRONMENTS.md,
 * invariant 1. Nothing downstream recomputes orbital geometry at draw time.
 *
 * Station frame: +X ram, +Y zenith, +Z starboard, origin on the deck. The
 * station holds LVLH nadir-hold attitude, so Earth is always at -Y.
 *
 * The sun revolves about +Z - cross-track - once per revolution. The source
 * design's prose claimed it revolves about the module's long axis; the formula
 * it shipped with does not do that, and the sun-vector's z component is flatly
 * constant. tests/envOrbit.test.ts pins the correct axis so the error cannot
 * come back in.
 */
import { R_EARTH, TWO_PI, period, vec3, wrapAngle, type Vec3 } from '../sim';

/** The design specifies a handful of angles in degrees; this is the only place they convert. */
const DEG = Math.PI / 180;

/**
 * Earth's sidereal rotation rate, rad/s. The ground track only regresses
 * because the planet turns under the orbit, and at 20x playback it has to turn
 * 20x as well or successive revolutions retrace the same continents.
 */
export const EARTH_ROTATION_RATE = 7.2921159e-5;

/**
 * How far the sun dims across the reddening grade, before the umbral step
 * takes the rest. Extinction reddens and dims together: the normalised grade
 * carries the hue for the renderer, this carries the value.
 */
const EXTINCTION_DIMMING = 0.55;

export interface OrbitParams {
  /** Circular orbit altitude above the mean equatorial radius, km. */
  readonly altitudeKm: number;
  /** Beta angle: the sun's elevation out of the orbit plane, radians. */
  readonly beta: number;
  /** Inclination, radians. Sets how far from the equator the ground track reaches. */
  readonly inclination: number;
  /** Orbital phase at t = 0, radians. Phase 0 is local noon - sun at zenith. */
  readonly phase0: number;
  /** Argument of latitude at t = 0, radians, measured from the ascending node. */
  readonly argLat0: number;
  /** Earth-fixed longitude of the ascending node at t = 0, radians. */
  readonly nodeLongitude0: number;
  /** Simulated seconds per wall second. */
  readonly timeScale: number;
  /** Wall seconds of graded sunset, from first extinction to umbra. */
  readonly gradeWallSeconds: number;
  /** Wall seconds of the umbral step, which ends at umbra with the grade. */
  readonly stepWallSeconds: number;
}

/**
 * THE LIMB DECK's orbit, from docs/ENVIRONMENTS.md. Only the four numbers the
 * design pins are pinned here - altitude, beta, playback and spawn phase. The
 * period, the eclipse and the terminator grade are all derived below, because
 * a beta typed in by hand next to a hand-computed eclipse fraction is a pair
 * that silently disagrees and nothing on screen announces it.
 */
export const LIMB_DECK_ORBIT: OrbitParams = {
  altitudeKm: 400,
  beta: 38 * DEG,
  // ISS-like, which is what a crewed station with this beta history flies.
  // Nothing but the ground track depends on it.
  inclination: 51.6 * DEG,
  // Twenty-five degrees short of local noon, so the first frame is the strong one.
  phase0: 335 * DEG,
  // Epoch at the ascending node on the prime meridian. Arbitrary, but pinned,
  // so the earthshine roll crosses the same coastlines in every session.
  argLat0: 0,
  nodeLongitude0: 0,
  timeScale: 20,
  gradeWallSeconds: 4,
  // 0.2 s at 20x works out to the last eight kilometres of tangent height -
  // one atmospheric density scale height, the troposphere closing. That is why
  // astronauts describe orbital sunset as a light switch.
  stepWallSeconds: 0.2,
};

/**
 * prefers-reduced-motion stretches the umbral step from 0.2 s to 1.5 s. It
 * stays a function of geometry: the step is widened in tangent height, not
 * eased in time, so the sample is still pure in t.
 */
export const REDUCED_MOTION_STEP_SECONDS = 1.5;

export interface OrbitGeometry {
  readonly params: OrbitParams;
  /** Orbit radius from Earth's centre, km. */
  readonly radiusKm: number;
  /** Period in simulated seconds. Kepler's third law, not a literal. */
  readonly periodSeconds: number;
  /** One revolution in wall seconds at the configured playback rate. */
  readonly revolutionWallSeconds: number;
  /** Radians of phase per simulated second. */
  readonly meanMotion: number;
  /** Beta above which the orbit never enters shadow: asin(R / r), 70.2 deg here. */
  readonly betaCutoff: number;
  /** How far the limb sits below local horizontal: pi/2 - betaCutoff, 19.8 deg here. */
  readonly horizonDepression: number;
  /**
   * Half the eclipse arc, radians, measured about local midnight. The
   * sun-bearing dial's shaded wedge is twice this - 129 deg at beta 38.
   */
  readonly eclipseHalfAngle: number;
  /** Fraction of a revolution spent in umbra. 0.359 at beta 38, 400 km. */
  readonly eclipseFraction: number;
  /** Tangent height at which extinction first bites, km. */
  readonly gradeTopKm: number;
  /** Tangent height at which the umbral step starts, km. */
  readonly stepTopKm: number;
}

/**
 * Unit sun direction in the station frame at a given orbital phase.
 *
 * s(phi) = (-cos B sin phi, cos B cos phi, -sin B)
 *
 * The z component does not depend on phase, so the sun rides a cone about the
 * cross-track axis and stays permanently to port at positive beta. That is why
 * the design's starboard scuttle was cut rather than built on geometry that
 * cannot light it.
 */
export function sunDirection(phase: number, beta: number): Vec3 {
  const cosBeta = Math.cos(beta);
  return vec3(-cosBeta * Math.sin(phase), cosBeta * Math.cos(phase), -Math.sin(beta));
}

/**
 * Height above the solid Earth of the closest approach of the deck-to-sun ray,
 * km. This is the one quantity the whole light story hangs off: positive and
 * large in full sun, falling through the atmosphere at the terminator,
 * negative in umbra.
 *
 * On the sunward half the ray leaves the planet immediately, so its closest
 * approach is the deck's own altitude - finite, continuous at the terminator,
 * and far above any extinction band.
 */
function rayHeightKm(phase: number, radiusKm: number, beta: number): number {
  // Component of the position vector (r * zenith) along the sun direction.
  const alongSun = radiusKm * Math.cos(beta) * Math.cos(phase);
  if (alongSun >= 0) return radiusKm - R_EARTH;
  const miss = Math.sqrt(Math.max(0, radiusKm * radiusKm - alongSun * alongSun));
  return miss - R_EARTH;
}

/** Everything derivable from the parameters alone. Built once, not per frame. */
export function orbitGeometry(params: OrbitParams = LIMB_DECK_ORBIT): OrbitGeometry {
  const radiusKm = R_EARTH + params.altitudeKm;
  const periodSeconds = period(radiusKm);
  const meanMotion = TWO_PI / periodSeconds;

  const betaCutoff = Math.asin(R_EARTH / radiusKm);

  // Umbra whenever the ray misses Earth's centre by less than a radius on the
  // anti-sun side, which reduces to |cos phase| > sqrt(r^2 - R^2) / (r cos B).
  // Above the beta cutoff that bound exceeds one, acos clamps to zero, and the
  // orbit is in permanent sunlight with no arithmetic special case.
  const shadowCos =
    Math.sqrt(radiusKm * radiusKm - R_EARTH * R_EARTH) / (radiusKm * Math.cos(params.beta));
  const eclipseHalfAngle = Math.acos(clamp(shadowCos, -1, 1));

  // Both bands are measured backwards in time from umbra entry, so the grade
  // and the step last exactly as long as the design specifies without
  // linearising the crossing rate.
  const entryPhase = Math.PI - eclipseHalfAngle;
  const stepWallSeconds = Math.min(params.stepWallSeconds, params.gradeWallSeconds);
  const toPhase = (wallSeconds: number): number => meanMotion * wallSeconds * params.timeScale;

  return {
    params,
    radiusKm,
    periodSeconds,
    revolutionWallSeconds: periodSeconds / params.timeScale,
    meanMotion,
    betaCutoff,
    horizonDepression: Math.PI / 2 - betaCutoff,
    eclipseHalfAngle,
    eclipseFraction: eclipseHalfAngle / Math.PI,
    gradeTopKm: rayHeightKm(entryPhase - toPhase(params.gradeWallSeconds), radiusKm, params.beta),
    stepTopKm: rayHeightKm(entryPhase - toPhase(stepWallSeconds), radiusKm, params.beta),
  };
}

/** THE LIMB DECK's clock. */
export const LIMB_DECK_GEOMETRY = orbitGeometry(LIMB_DECK_ORBIT);

/** The same clock with the umbral step stretched for prefers-reduced-motion. */
export const LIMB_DECK_GEOMETRY_REDUCED = orbitGeometry({
  ...LIMB_DECK_ORBIT,
  stepWallSeconds: REDUCED_MOTION_STEP_SECONDS,
});

export interface OrbitSample {
  /** Wall seconds since the environment was built. */
  readonly t: number;
  /** Simulated seconds, t * timeScale. */
  readonly simSeconds: number;
  /** Orbital phase in [0, 2pi). 0 is local noon, pi local midnight. */
  readonly phase: number;
  /** Unit sun direction in the station frame. */
  readonly sun: Vec3;
  /** True while the solid Earth stands between the deck and the sun. */
  readonly eclipsed: boolean;
  /** Closest approach of the deck-to-sun ray above the surface, km. Negative in umbra. */
  readonly tangentHeightKm: number;
  /**
   * Sunlight throughput: 1 in full sun, 0 in umbra. A scalar, so the renderer
   * multiplies rather than reasoning about the crossing.
   */
  readonly intensity: number;
  /**
   * Extinction along the grazing line of sight, normalised 0 (unattenuated) to
   * 1 (fully reddened). This is the colour ramp's key - SUN_COLOUR at 0,
   * DAWN_SAND through the middle, FOIL at 1 - and the colours deliberately
   * live in the renderer, not here.
   */
  readonly grade: number;
  /** Sub-satellite latitude, radians. */
  readonly latitude: number;
  /** Sub-satellite Earth-fixed longitude, radians in (-pi, pi]. */
  readonly longitude: number;
}

/**
 * The clock at an absolute wall time. Pure: the same t always returns the same
 * sample, whatever was asked for in between.
 */
export function sampleOrbit(t: number, geometry: OrbitGeometry = LIMB_DECK_GEOMETRY): OrbitSample {
  const { params } = geometry;
  const simSeconds = t * params.timeScale;
  const phase = wrapAngle(params.phase0 + geometry.meanMotion * simSeconds);
  const tangentHeightKm = rayHeightKm(phase, geometry.radiusKm, params.beta);

  // Guard the degenerate band - a step as long as the whole grade - so the
  // ramp stays finite. No room configures it that way.
  const gradeSpan = Math.max(geometry.gradeTopKm - geometry.stepTopKm, 1e-6);
  const grade = clamp01((geometry.gradeTopKm - tangentHeightKm) / gradeSpan);
  const step = smoothstep01(tangentHeightKm / Math.max(geometry.stepTopKm, 1e-6));

  // Argument of latitude runs off unwrapped time; the wrapped phase would jump
  // the ground track a revolution backwards once per orbit.
  const argLat = params.argLat0 + geometry.meanMotion * simSeconds;
  const nodeAngle = Math.atan2(Math.cos(params.inclination) * Math.sin(argLat), Math.cos(argLat));

  return {
    t,
    simSeconds,
    phase,
    sun: sunDirection(phase, params.beta),
    eclipsed: tangentHeightKm < 0,
    tangentHeightKm,
    // The hue tracks the geometry linearly; the value eases in, so the sunset
    // starts by drifting rather than by kicking into a constant dimming rate.
    intensity: (1 - EXTINCTION_DIMMING * smoothstep01(grade)) * step,
    grade,
    latitude: Math.asin(clamp(Math.sin(params.inclination) * Math.sin(argLat), -1, 1)),
    longitude: wrapSigned(params.nodeLongitude0 + nodeAngle - EARTH_ROTATION_RATE * simSeconds),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Hermite ease over [0, 1], clamped. C1 at both ends, so no facet pops. */
function smoothstep01(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

/** Signed longitude in (-pi, pi]. */
function wrapSigned(angle: number): number {
  const wrapped = wrapAngle(angle);
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped;
}
