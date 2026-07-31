import { TWO_PI } from './constants';
import { formatCountdown, formatKm, formatMS } from './format';
import {
  apoapsisRadius,
  meanAnomalyAt,
  meanMotion,
  periapsisRadius,
  visViva,
  type Elements,
} from './orbit';
import type { PadCard, PadField } from './types';

/**
 * Card planning. Elements are referenced to sim time zero throughout the
 * mission layer: stateAt(el, t) is the state at sim time t, and every time
 * returned here is an absolute sim time.
 */

export interface PlanOptions {
  /**
   * Pins the burn duration. Otherwise the planner picks the whole number of
   * seconds in 4..9 whose acceleration lands nearest 8 m/s2.
   */
  readonly desiredSeconds?: number;
  /** Appears in the card title. */
  readonly satName?: string;
}

const MIN_SECONDS = 4;
const MAX_SECONDS = 9;
const PREFERRED_ACCEL_MS2 = 8;
/** Below this remaining need the residual already sits inside the ring. */
const MIN_CORRECTION_MS = 1;

/** Sim time of the first periapsis passage strictly after tNow. */
export function nextPeriapsisTime(el: Elements, tNow: number): number {
  const n = meanMotion(el.a);
  // wrapAngle keeps M in [0, 2pi), so the gap to the next M = 0 crossing is
  // in (0, 2pi] - sitting exactly on periapsis schedules the following pass.
  const gap = TWO_PI - meanAnomalyAt(el, tNow);
  return tNow + gap / n;
}

/**
 * Ideal prograde delta-v at periapsis, in m/s, for the transfer ellipse from
 * the current periapsis radius up to targetRaKm. Vis-viva on both orbits at
 * the shared periapsis. Negative when the apoapsis already stands above.
 */
export function idealDeltaVMS(el: Elements, targetRaKm: number): number {
  const rp = periapsisRadius(el);
  const transferA = (rp + targetRaKm) / 2;
  return (visViva(rp, transferA) - visViva(rp, el.a)) * 1000;
}

function chooseSeconds(idealMS: number, desired: number | undefined): number {
  if (desired !== undefined) {
    return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(desired)));
  }
  let best = MIN_SECONDS;
  let bestGap = Infinity;
  for (let s = MIN_SECONDS; s <= MAX_SECONDS; s += 1) {
    const gap = Math.abs(idealMS / s - PREFERRED_ACCEL_MS2);
    if (gap < bestGap) {
      best = s;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Plans an apogee-raise card at the next periapsis passage after tNow.
 *
 * Printed-arithmetic policy: the card must ask for one clean division, so the
 * printed delta-v is snapped to a whole multiple of a whole number of seconds
 * and the executor burns with exactly the printed acceleration. The few m/s
 * between the snapped value and the vis-viva ideal lands inside the ring
 * tolerance, and the correction loop absorbs any residual - real mechanics
 * holds at printed precision.
 */
export function planApogeeRaise(
  el: Elements,
  tNow: number,
  targetRaKm: number,
  options: PlanOptions = {}
): PadCard {
  const rp = periapsisRadius(el);
  const transferA = (rp + targetRaKm) / 2;
  const nodeTimeSim = nextPeriapsisTime(el, tNow);
  const idealMS = idealDeltaVMS(el, targetRaKm);

  const seconds = chooseSeconds(idealMS, options.desiredSeconds);
  // Floored at 1 m/s2 so a small residual still prints a live thruster line.
  const accelMS2 = Math.max(1, Math.round(idealMS / seconds));
  const deltaVMS = accelMS2 * seconds;

  const fields: readonly PadField[] = [
    { label: 'r periapsis', value: formatKm(rp), blank: false },
    { label: 'r apoapsis', value: formatKm(apoapsisRadius(el)), blank: false },
    { label: 'target apoapsis', value: formatKm(targetRaKm), blank: false },
    { label: 'semi-major (transfer)', value: formatKm(transferA), blank: false },
    { label: 'node', value: formatCountdown(nodeTimeSim - tNow), blank: false },
    { label: 'dv required', value: formatMS(deltaVMS), blank: false },
    { label: 'thruster', value: `${formatMS(accelMS2)} per s`, blank: false },
    { label: 'BURN DURATION', value: '', blank: true },
  ];

  return {
    title: `MANEUVER · APOGEE RAISE · ${options.satName ?? 'HERON-1'}`,
    fields,
    answerDigits: String(seconds).length,
    answerUnit: 's',
    deltaVMS,
    accelMS2,
    nodeTimeSim,
  };
}

/**
 * Plans a correction against the current orbit - which is how an off entry is
 * absorbed: the next card is simply the real remaining problem. Returns null
 * when there is nothing honest to print: the thruster in this slice only
 * pushes prograde at periapsis, which can only raise an apoapsis, so a need
 * under 1 m/s (already inside the ring tolerance) or a negative need (the
 * apoapsis standing above the target) yields no card at all.
 */
export function planCorrection(
  el: Elements,
  tNow: number,
  targetRaKm: number,
  options: PlanOptions = {}
): PadCard | null {
  const idealMS = idealDeltaVMS(el, targetRaKm);
  if (!(idealMS >= MIN_CORRECTION_MS)) return null;
  return planApogeeRaise(el, tNow, targetRaKm, options);
}
