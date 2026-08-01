import { describe, expect, it } from 'vitest';
import {
  advance,
  apoapsisRadius,
  commitEntry,
  createMission,
  predictedElements,
  type MissionPhase,
  type MissionState,
  type PadCard,
} from '../src/sim';

const STEP_S = 5;

function advanceUntil(m: MissionState, phase: MissionPhase, maxSteps = 20000): MissionState {
  return advanceUntilOneOf(m, [phase], maxSteps);
}

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

function cardOf(m: MissionState): PadCard {
  if (m.card === null) throw new Error('no card up');
  return m.card;
}

/** The one division the card asks for - the whole game in a helper. */
function answerOf(card: PadCard): number {
  return card.deltaVMS / card.accelMS2;
}

describe('createMission', () => {
  it('starts coasting toward a card 45 sim-seconds out', () => {
    const m = createMission();
    expect(m.phase).toBe('coast');
    expect(m.satName).toBe('HERON-1');
    expect(m.propellantMS).toBe(400);
    expect(m.statusLine).toBe('COASTING · NEXT CARD T-45 S');
  });
});

describe('nominal flight', () => {
  it('flies card, burn, assess to complete inside the ring tolerance', () => {
    let m = createMission();
    m = advanceUntil(m, 'card');
    const card = cardOf(m);
    expect(m.statusLine).toContain('NODE');

    m = commitEntry(m, String(answerOf(card)));
    expect(m.phase).toBe('burning');
    expect(m.burn?.durationS).toBe(answerOf(card));
    expect(m.burn?.accelMS2).toBe(card.accelMS2);

    m = advanceUntil(m, 'assess');
    m = advanceUntil(m, 'complete');
    expect(Math.abs(apoapsisRadius(m.elements) - m.targetRaKm)).toBeLessThanOrEqual(m.toleranceKm);
    expect(m.statusLine).toMatch(/^BURN NOMINAL · APOAPSIS [\d\u2009]+ KM$/);
    expect(m.history).toHaveLength(1);
    expect(m.history[0]?.apoapsisKmAfter).toBeCloseTo(apoapsisRadius(m.elements), 6);
  });

  it('spends propellant at exactly accel times duration', () => {
    let m = createMission();
    m = advanceUntil(m, 'card');
    const card = cardOf(m);
    const seconds = answerOf(card);
    m = commitEntry(m, String(seconds));
    m = advanceUntil(m, 'assess');
    expect(m.propellantMS).toBeCloseTo(400 - card.accelMS2 * seconds, 9);
  });
});

describe('undershoot', () => {
  it('prints a smaller correction card and converges within 4 cards', () => {
    let m = createMission();
    m = advanceUntil(m, 'card');
    const first = cardOf(m);
    const shortAnswer = answerOf(first) - 2;
    m = commitEntry(m, String(shortAnswer));
    let spentMS = first.accelMS2 * shortAnswer;

    m = advanceUntilOneOf(m, ['card', 'complete']);
    expect(m.phase).toBe('card'); // an undershoot leaves a real remaining problem
    const correction = cardOf(m);
    expect(correction.deltaVMS).toBeLessThan(first.deltaVMS);

    let cardsUsed = 2;
    while (m.phase !== 'complete') {
      expect(cardsUsed).toBeLessThanOrEqual(4);
      const card = cardOf(m);
      m = commitEntry(m, String(answerOf(card)));
      spentMS += card.accelMS2 * answerOf(card);
      m = advanceUntilOneOf(m, ['card', 'complete']);
      cardsUsed += 1;
    }
    expect(Math.abs(apoapsisRadius(m.elements) - m.targetRaKm)).toBeLessThanOrEqual(m.toleranceKm);
    expect(m.propellantMS).toBeCloseTo(400 - spentMS, 9);
  });
});

describe('overshoot', () => {
  // A prograde burn at periapsis can only raise an apoapsis. The honest
  // behaviour when the entry carries the apoapsis above the ring is a
  // standing report and no further card - no propellant chases a correction
  // this thruster cannot fly.
  it('stands above the ring with no further card and no propellant spent', () => {
    let m = createMission();
    m = advanceUntil(m, 'card');
    m = commitEntry(m, String(answerOf(cardOf(m)) + 2));
    m = advanceUntil(m, 'assess');
    m = advance(m, STEP_S);

    expect(m.phase).toBe('coast');
    expect(m.statusLine).toMatch(/^APOAPSIS [\d\u2009]+ KM · NO FURTHER CARD$/);
    expect(apoapsisRadius(m.elements)).toBeGreaterThan(m.targetRaKm + m.toleranceKm);

    const propellant = m.propellantMS;
    const elements = m.elements;
    for (let k = 0; k < 4000; k += 1) m = advance(m, STEP_S); // over two orbits
    expect(m.phase).toBe('coast');
    expect(m.card).toBeNull();
    expect(m.propellantMS).toBe(propellant);
    expect(m.elements).toEqual(elements);
  });
});

describe('commitEntry', () => {
  it('ignores empty and unparseable digits', () => {
    let m = createMission();
    m = advanceUntil(m, 'card');
    for (const digits of ['', 'abc', '1a', ' 12', '1.5', '-3']) {
      expect(commitEntry(m, digits)).toBe(m);
    }
  });

  it('is a no-op outside the card phase', () => {
    const m = createMission();
    expect(commitEntry(m, '8')).toBe(m);
  });

  it('never throws for any digit entry 0..999, and no entry overdraws the tank', () => {
    let base = createMission();
    base = advanceUntil(base, 'card');
    for (let d = 0; d <= 999; d += 1) {
      let m = commitEntry(base, String(d));
      m = advance(m, 60);
      m = advance(m, 60);
      expect(Number.isFinite(m.tSim)).toBe(true);
      expect(m.propellantMS).toBeGreaterThanOrEqual(0);
    }
  });

  it('cuts thrust when the tank runs dry - the budget is a plant limit', () => {
    let m = createMission();
    m = advanceUntil(m, 'card');
    m = commitEntry(m, '999');
    m = advanceUntil(m, 'assess');
    // 999 s would deliver kilometres per second; a 400 m/s tank cannot. The
    // cutoff is the same shape as the energy ceiling: physics, not a verdict.
    expect(m.statusLine).toMatch(/^THRUST CUTOFF · APOAPSIS [\d\u2009]+ KM$/);
    expect(m.propellantMS).toBeGreaterThanOrEqual(0);
    expect(m.propellantMS).toBeCloseTo(0, 6);
    // 400 m/s prograde at this periapsis lands the apoapsis near 11 000 km;
    // the unconstrained 999 s entry used to reach past 228 000 km.
    expect(apoapsisRadius(m.elements)).toBeLessThan(13000);
  });

  it('cuts thrust at the elliptic energy ceiling for a maximal entry', () => {
    // A tank deep enough that the ceiling binds before the propellant does.
    let m = createMission({ propellantMS: 5000 });
    m = advanceUntil(m, 'card');
    m = commitEntry(m, '999');
    // 999 s at the printed accel would escape; the propagator is
    // elliptic-only, so the burn cuts off and the mission stands.
    for (let k = 0; k < 400 && m.phase !== 'coast'; k += 1) m = advance(m, STEP_S);
    expect(m.phase).toBe('coast');
    expect(m.elements.e).toBeLessThan(1);
    expect(m.statusLine).toContain('NO FURTHER CARD');
  });
});

describe('predictedElements', () => {
  it('ghosts the conic for typed digits, only in the card phase', () => {
    let m = createMission();
    expect(predictedElements(m, '8')).toBeNull();
    m = advanceUntil(m, 'card');
    expect(predictedElements(m, '')).toBeNull();
    expect(predictedElements(m, 'x')).toBeNull();

    const card = cardOf(m);
    const ghost = predictedElements(m, String(answerOf(card)));
    expect(ghost).not.toBeNull();
    if (ghost !== null) {
      expect(Math.abs(apoapsisRadius(ghost) - m.targetRaKm)).toBeLessThanOrEqual(m.toleranceKm);
    }
    // The ghost is a prediction; the mission itself is untouched.
    expect(m.card).toBe(card);
    expect(m.phase).toBe('card');
  });
});

describe('determinism', () => {
  it('produces identical states for identical advance sequences', () => {
    const run = (): MissionState => {
      let m = createMission();
      for (let k = 0; k < 9; k += 1) m = advance(m, STEP_S);
      m = commitEntry(m, '7');
      for (let k = 0; k < 400; k += 1) m = advance(m, STEP_S);
      return m;
    };
    expect(run()).toEqual(run());
  });
});
