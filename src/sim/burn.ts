import { MU_EARTH } from './constants';
import { elementsFromState, stateAt, type Elements, type State } from './orbit';
import { add, length, normalize, scale, type Vec3 } from './vec3';

/**
 * Finite burns: two-body gravity plus continuous thrust along the
 * instantaneous velocity direction, integrated with classical RK4. This is
 * where the typed number becomes physics - a six-second entry is six seconds
 * of this, through the same path as any other entry.
 */

interface Derivative {
  readonly dr: Vec3;
  readonly dv: Vec3;
}

function derivative(state: State, thrustKmS2: number, mu: number): Derivative {
  const r = length(state.position);
  const gravity = scale(state.position, -mu / (r * r * r));
  // Thrust follows the instantaneous velocity, not a frozen direction - a
  // finite burn is not an impulse, and this is where the difference lives.
  const thrust = scale(normalize(state.velocity), thrustKmS2);
  return { dr: state.velocity, dv: add(gravity, thrust) };
}

function rk4Step(state: State, thrustKmS2: number, dt: number, mu: number): State {
  const k1 = derivative(state, thrustKmS2, mu);
  const s2: State = {
    position: add(state.position, scale(k1.dr, dt / 2)),
    velocity: add(state.velocity, scale(k1.dv, dt / 2)),
  };
  const k2 = derivative(s2, thrustKmS2, mu);
  const s3: State = {
    position: add(state.position, scale(k2.dr, dt / 2)),
    velocity: add(state.velocity, scale(k2.dv, dt / 2)),
  };
  const k3 = derivative(s3, thrustKmS2, mu);
  const s4: State = {
    position: add(state.position, scale(k3.dr, dt)),
    velocity: add(state.velocity, scale(k3.dv, dt)),
  };
  const k4 = derivative(s4, thrustKmS2, mu);
  const sumDr = add(add(k1.dr, scale(add(k2.dr, k3.dr), 2)), k4.dr);
  const sumDv = add(add(k1.dv, scale(add(k2.dv, k3.dv), 2)), k4.dv);
  return {
    position: add(state.position, scale(sumDr, dt / 6)),
    velocity: add(state.velocity, scale(sumDv, dt / 6)),
  };
}

/**
 * One RK4 step under gravity and prograde thrust, for incremental animation.
 * accelMS2 arrives in m/s2 while the integrator works in km and km/s: the
 * division by 1000 at this boundary is the single unit conversion in the burn
 * path. Mixing the two scales is the classic silent bug in orbital code -
 * wrong by a factor of a thousand and green on every test that stays inside
 * one system - so it happens exactly once, here and in integrateBurn.
 */
export function stepBurn(state: State, accelMS2: number, dt: number, mu = MU_EARTH): State {
  return rk4Step(state, accelMS2 / 1000, dt, mu);
}

/**
 * Integrates a prograde burn of durationS seconds starting at tStart, in
 * fixed RK4 steps clamped to dtMax with a final partial step. Returns the
 * osculating elements at burn end via elementsFromState; as with applyDeltaV,
 * the returned epoch sits at the burn end - m0 is the mean anomaly there.
 */
export function integrateBurn(
  el: Elements,
  tStart: number,
  durationS: number,
  accelMS2: number,
  dtMax = 0.25,
  mu = MU_EARTH
): Elements {
  if (durationS <= 0) return el;
  // See stepBurn: the one m/s2 -> km/s2 conversion in the burn path.
  const thrustKmS2 = accelMS2 / 1000;
  let state = stateAt(el, tStart, mu);
  // Fixed-count stepping avoids accumulating a float remainder across steps.
  const fullSteps = Math.floor(durationS / dtMax);
  const tail = durationS - fullSteps * dtMax;
  for (let k = 0; k < fullSteps; k += 1) {
    state = rk4Step(state, thrustKmS2, dtMax, mu);
  }
  if (tail > 1e-9) {
    state = rk4Step(state, thrustKmS2, tail, mu);
  }
  return elementsFromState(state, mu);
}
