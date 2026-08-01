import { describe, expect, it } from 'vitest';
import {
  advance,
  apoapsisRadius,
  commitEntry,
  createMission,
  predictedElements,
  type Elements,
  type MissionPhase,
  type MissionState,
} from '../src/sim';

/**
 * The ghost conic while typing is one impulsive prograde delta-v
 * (predictedElements); execution integrates finite thrust in 0.25 s RK4
 * steps (stepBurn via advanceBurning). This sweeps missions and typed
 * durations and asserts the two agree, so a units slip or a wrong-direction
 * burn in the prediction path fails loudly instead of quietly lying to the
 * child mid-entry.
 */

const STEP_S = 5;

function advanceUntilOneOf(
  m: MissionState,
  phases: readonly MissionPhase[],
  maxSteps = 20000
): MissionState {
  let cur = m;
  for (let k = 0; k < maxSteps; k += 1) {
    if (phases.includes(cur.phase)) return cur;
    cur = advance(cur, STEP_S);
  }
  throw new Error(`never reached ${phases.join('/')}; stuck in ${cur.phase} (${cur.statusLine})`);
}

const DEFAULT_A_KM = 8700;
const BASE: Elements = { a: DEFAULT_A_KM, e: 0.02, i: 0.52, raan: 0.7, argp: 1.1, m0: 0 };

// Modest spread around mission.ts's DEFAULT_ELEMENTS / default targetRaKm
// (9400, about 6% above the default apoapsis 8874). Kept close enough to
// "plausible" that the printed accel stays near the planner's 8 m/s2
// preference and no entry in 1..12 s ever runs the 400 m/s tank dry - a
// propellant cutoff is a separate, deliberate physical limit (covered in
// mission.test.ts), not the impulsive-vs-finite divergence this test targets.
const A_FACTORS = [0.85, 1, 1.15];
const E_VALUES = [0, 0.02, 0.08];
const TARGET_FACTORS = [1.02, 1.08, 1.15];
const DURATIONS_S = Array.from({ length: 12 }, (_, k) => k + 1);

// Measured spread across the sweep below tops out around 0.016 km (16 m),
// growing with accel and duration as expected of a finite-burn integration
// vs. an impulsive prediction. 1 km is ~60x that measured peak: comfortably
// tight against real divergence, while a units slip in predictedElements
// (dropping the /1000 m/s -> km/s conversion) throws the predicted apoapsis
// tens of thousands of km off and fails immediately.
const TOLERANCE_KM = 1;

describe('ghost conic vs executed burn', () => {
  it('agrees with the executed apoapsis within measured finite-burn tolerance', () => {
    let checked = 0;
    for (const aFactor of A_FACTORS) {
      for (const e of E_VALUES) {
        for (const targetFactor of TARGET_FACTORS) {
          const a = DEFAULT_A_KM * aFactor;
          const elements: Elements = { ...BASE, a, e };
          const targetRaKm = a * (1 + e) * targetFactor;

          let cardState = createMission({ elements, targetRaKm });
          cardState = advanceUntilOneOf(cardState, ['card']);
          const card = cardState.card;
          if (card === null) continue;

          for (const seconds of DURATIONS_S) {
            const digits = String(seconds);
            const ghost = predictedElements(cardState, digits);
            expect(ghost).not.toBeNull();
            if (ghost === null) continue;
            const predictedRa = apoapsisRadius(ghost);

            let executed = commitEntry(cardState, digits);
            executed = advanceUntilOneOf(executed, ['assess', 'complete', 'coast']);
            // A tank cutoff would make the comparison meaningless (the
            // executor stops delivering the requested delta-v entirely);
            // the swept range above is chosen to never hit one, so treat it
            // as a setup error rather than silently skip.
            expect(executed.statusLine).not.toContain('CUTOFF');
            const executedRa = apoapsisRadius(executed.elements);

            expect(Math.abs(executedRa - predictedRa)).toBeLessThan(TOLERANCE_KM);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(
      A_FACTORS.length * E_VALUES.length * TARGET_FACTORS.length * DURATIONS_S.length
    );
  });
});
