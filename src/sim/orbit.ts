import { MU_EARTH, TWO_PI, wrapAngle } from './constants';
import { eccentricFromTrue, meanFromEccentric, solveKepler, trueFromEccentric } from './kepler';
import {
  cross,
  dot,
  length,
  normalize,
  rotateX,
  rotateZ,
  scale,
  sub,
  vec3,
  type Vec3,
} from './vec3';

/** Classical orbital elements. Distances in km, angles in radians. */
export interface Elements {
  /** Semi-major axis. */
  readonly a: number;
  /** Eccentricity, 0 <= e < 1. */
  readonly e: number;
  /** Inclination. */
  readonly i: number;
  /** Right ascension of the ascending node. */
  readonly raan: number;
  /** Argument of periapsis. */
  readonly argp: number;
  /** Mean anomaly at epoch. */
  readonly m0: number;
}

export interface State {
  readonly position: Vec3;
  readonly velocity: Vec3;
}

export function meanMotion(a: number, mu = MU_EARTH): number {
  return Math.sqrt(mu / (a * a * a));
}

/** Orbital period in seconds. Kepler's third law. */
export function period(a: number, mu = MU_EARTH): number {
  return TWO_PI / meanMotion(a, mu);
}

export function apoapsisRadius(el: Elements): number {
  return el.a * (1 + el.e);
}

export function periapsisRadius(el: Elements): number {
  return el.a * (1 - el.e);
}

/** Mean anomaly at time t after epoch. */
export function meanAnomalyAt(el: Elements, t: number, mu = MU_EARTH): number {
  return wrapAngle(el.m0 + meanMotion(el.a, mu) * t);
}

export function trueAnomalyAt(el: Elements, t: number, mu = MU_EARTH): number {
  return trueFromEccentric(solveKepler(meanAnomalyAt(el, t, mu), el.e), el.e);
}

/**
 * The perifocal-to-inertial transform for an element set: rotate by argp
 * about z, by inclination about x, then by RAAN about z. Exported as the one
 * owner of the sim's rotation convention - the renderer consumes this rather
 * than re-deriving it, so a drawn conic can never skew off the propagated
 * satellite.
 */
export function perifocalToInertial(el: Elements): (v: Vec3) => Vec3 {
  return (v) => rotateZ(rotateX(rotateZ(v, el.argp), el.i), el.raan);
}

/**
 * Inertial position at eccentric anomaly E. Equal steps in E spread points
 * evenly around the ellipse, which is why trace sampling parameterizes by E
 * rather than by true anomaly.
 */
export function orbitPointAtE(el: Elements, E: number): Vec3 {
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  return perifocalToInertial(el)(vec3(el.a * (Math.cos(E) - el.e), b * Math.sin(E), 0));
}

/** Position and velocity at time t after epoch, in the inertial frame. */
export function stateAt(el: Elements, t: number, mu = MU_EARTH): State {
  const nu = trueAnomalyAt(el, t, mu);
  const p = el.a * (1 - el.e * el.e);
  const r = p / (1 + el.e * Math.cos(nu));
  const sqrtMuOverP = Math.sqrt(mu / p);

  const rPerifocal = vec3(r * Math.cos(nu), r * Math.sin(nu), 0);
  const vPerifocal = vec3(-sqrtMuOverP * Math.sin(nu), sqrtMuOverP * (el.e + Math.cos(nu)), 0);

  const toInertial = perifocalToInertial(el);

  return { position: toInertial(rPerifocal), velocity: toInertial(vPerifocal) };
}

/** Specific orbital energy, km^2/s^2. Constant along a coasting trajectory. */
export function specificEnergy(state: State, mu = MU_EARTH): number {
  const r = length(state.position);
  const v = length(state.velocity);
  return (v * v) / 2 - mu / r;
}

/** Specific angular momentum. Constant along a coasting trajectory. */
export function specificAngularMomentum(state: State): Vec3 {
  return cross(state.position, state.velocity);
}

/** Speed at radius r on an orbit of semi-major axis a. The vis-viva equation. */
export function visViva(r: number, a: number, mu = MU_EARTH): number {
  return Math.sqrt(mu * (2 / r - 1 / a));
}

const NEAR_ZERO = 1e-9;

/**
 * Classical elements from a state vector. Guards the degenerate cases
 * (equatorial, circular) by falling back to the conventional reference
 * directions rather than dividing by a vanishing vector.
 */
export function elementsFromState(state: State, mu = MU_EARTH): Elements {
  const { position: rVec, velocity: vVec } = state;
  const r = length(rVec);
  const v = length(vVec);

  const hVec = cross(rVec, vVec);
  const h = length(hVec);

  const nVec = cross(vec3(0, 0, 1), hVec);
  const n = length(nVec);

  const eVec = scale(sub(scale(rVec, v * v - mu / r), scale(vVec, dot(rVec, vVec))), 1 / mu);
  const e = length(eVec);

  const energy = (v * v) / 2 - mu / r;
  const a = -mu / (2 * energy);

  const i = Math.acos(Math.min(1, Math.max(-1, hVec.z / h)));

  let raan = 0;
  if (n > NEAR_ZERO) {
    raan = Math.acos(Math.min(1, Math.max(-1, nVec.x / n)));
    if (nVec.y < 0) raan = TWO_PI - raan;
  }

  let argp = 0;
  if (n > NEAR_ZERO && e > NEAR_ZERO) {
    argp = Math.acos(Math.min(1, Math.max(-1, dot(nVec, eVec) / (n * e))));
    if (eVec.z < 0) argp = TWO_PI - argp;
  }

  let nu: number;
  if (e > NEAR_ZERO) {
    nu = Math.acos(Math.min(1, Math.max(-1, dot(eVec, rVec) / (e * r))));
    if (dot(rVec, vVec) < 0) nu = TWO_PI - nu;
  } else if (n > NEAR_ZERO) {
    // Circular: measure from the ascending node instead of periapsis.
    nu = Math.acos(Math.min(1, Math.max(-1, dot(nVec, rVec) / (n * r))));
    if (rVec.z < 0) nu = TWO_PI - nu;
  } else {
    nu = Math.atan2(rVec.y, rVec.x);
  }

  return {
    a,
    e,
    i,
    raan: wrapAngle(raan),
    argp: wrapAngle(argp),
    m0: meanFromEccentric(eccentricFromTrue(wrapAngle(nu), e), e),
  };
}

/**
 * Applies an instantaneous velocity change and returns the resulting orbit,
 * with the new epoch at the burn point. This is the whole game: the player
 * supplies a burn duration, which becomes a delta-v, which becomes this.
 */
export function applyDeltaV(el: Elements, t: number, deltaV: Vec3, mu = MU_EARTH): Elements {
  const state = stateAt(el, t, mu);
  return elementsFromState(
    { position: state.position, velocity: { ...addVec(state.velocity, deltaV) } },
    mu
  );
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

/** Unit vector along the velocity, the prograde direction. */
export function prograde(state: State): Vec3 {
  return normalize(state.velocity);
}
