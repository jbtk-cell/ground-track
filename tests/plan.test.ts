import { describe, expect, it } from 'vitest';
import {
  apoapsisRadius,
  applyDeltaV,
  length,
  periapsisRadius,
  planApogeeRaise,
  planCorrection,
  prograde,
  scale,
  stateAt,
  type Elements,
  type PadCard,
} from '../src/sim';

/** The mission slice's starting orbit: rp 8 526 km, ra 8 874 km. */
const START: Elements = { a: 8700, e: 0.02, i: 0.52, raan: 0.7, argp: 1.1, m0: 5.9 };
const TARGET_RA = 9400;
const TOLERANCE = 30;

function fieldNumber(card: PadCard, label: string): number {
  const field = card.fields.find((f) => f.label === label);
  if (field === undefined) throw new Error(`no field labelled '${label}'`);
  return Number(field.value.replace(/\D/g, ''));
}

function fromApsides(rp: number, ra: number): Elements {
  return { a: (rp + ra) / 2, e: (ra - rp) / (ra + rp), i: 0.52, raan: 0.7, argp: 1.1, m0: 1 };
}

describe('planApogeeRaise', () => {
  const card = planApogeeRaise(START, 0, TARGET_RA, { satName: 'HERON-1' });
  const seconds = card.deltaVMS / card.accelMS2;

  it('prints exact arithmetic: dv = accel * seconds in whole numbers', () => {
    expect(Number.isInteger(card.deltaVMS)).toBe(true);
    expect(Number.isInteger(card.accelMS2)).toBe(true);
    expect(Number.isInteger(seconds)).toBe(true);
    expect(card.accelMS2 * seconds).toBe(card.deltaVMS);
  });

  it('round-trips the answer out of the printed fields', () => {
    const dv = fieldNumber(card, 'dv required');
    const accel = fieldNumber(card, 'thruster');
    expect(dv).toBe(card.deltaVMS);
    expect(accel).toBe(card.accelMS2);
    expect(dv / accel).toBe(seconds);
    expect(String(seconds)).toHaveLength(card.answerDigits);
  });

  it('keeps the answer inside the 4..9 second envelope', () => {
    expect(seconds).toBeGreaterThanOrEqual(4);
    expect(seconds).toBeLessThanOrEqual(9);
  });

  it('lets desiredSeconds pin the duration', () => {
    const pinned = planApogeeRaise(START, 0, TARGET_RA, { desiredSeconds: 6 });
    expect(pinned.deltaVMS / pinned.accelMS2).toBe(6);
  });

  it('schedules the node on a genuine periapsis passage', () => {
    expect(card.nodeTimeSim).toBeGreaterThan(0);
    const r = length(stateAt(START, card.nodeTimeSim).position);
    expect(Math.abs(r - periapsisRadius(START))).toBeLessThan(1);
  });

  it('lands the printed dv on the ring when applied impulsively at the node', () => {
    const state = stateAt(START, card.nodeTimeSim);
    const after = applyDeltaV(
      START,
      card.nodeTimeSim,
      scale(prograde(state), card.deltaVMS / 1000)
    );
    expect(Math.abs(apoapsisRadius(after) - TARGET_RA)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('prints the fields in card order with only BURN DURATION blank', () => {
    expect(card.fields.map((f) => f.label)).toEqual([
      'r periapsis',
      'r apoapsis',
      'target apoapsis',
      'semi-major (transfer)',
      'node',
      'dv required',
      'thruster',
      'BURN DURATION',
    ]);
    for (const field of card.fields) {
      expect(field.blank).toBe(field.label === 'BURN DURATION');
      if (field.blank) expect(field.value).toBe('');
      else expect(field.value.length).toBeGreaterThan(0);
    }
  });

  it('titles the card for the satellite', () => {
    expect(card.title).toBe('MANEUVER · APOGEE RAISE · HERON-1');
    expect(card.answerUnit).toBe('s');
  });
});

describe('planCorrection', () => {
  it('prints the real remaining problem when the apoapsis is short', () => {
    const first = planApogeeRaise(START, 0, TARGET_RA);
    const short = fromApsides(8526, 9290);
    const card = planCorrection(short, 0, TARGET_RA);
    expect(card).not.toBeNull();
    if (card !== null) {
      expect(card.deltaVMS).toBeLessThan(first.deltaVMS);
      expect(card.deltaVMS % card.accelMS2).toBe(0);
    }
  });

  it('returns null within a metre-per-second of the ring', () => {
    expect(planCorrection(fromApsides(8526, 9399), 0, TARGET_RA)).toBeNull();
  });

  it('returns null when the apoapsis stands above the target', () => {
    expect(planCorrection(fromApsides(8526, 9600), 0, TARGET_RA)).toBeNull();
  });
});
