import { describe, expect, it } from 'vitest';
import {
  PLANE_SPACING_SEED_COUNTS,
  commitPlaneSpacing,
  meanMotion,
  period,
  planPlaneSpacing,
  specificEnergy,
  stateAt,
  wrapAngle,
  type Elements,
} from '../src/sim';

/** A representative shared orbit: any a/e/i/raan/argp works, only m0 varies per slot. */
const SHELL: Elements = { a: 7200, e: 0.001, i: 0.9, raan: 0.4, argp: 1.1, m0: 0.2 };

const RAD_PER_DEG = Math.PI / 180;

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
}

describe('planPlaneSpacing', () => {
  it.each(PLANE_SPACING_SEED_COUNTS)('prints one clean division for %d satellites', (count) => {
    expect(360 % count).toBe(0);
    const card = planPlaneSpacing(count);
    const ideal = 360 / count;
    expect(card.count).toBe(count);
    expect(card.answerUnit).toBe('deg');
    expect(card.answerDigits).toBe(String(ideal).length);
  });

  it('prints the satellite count and the full circle, with only SPACING blank', () => {
    const card = planPlaneSpacing(6);
    expect(card.fields.map((f) => f.label)).toEqual(['satellites', 'full circle', 'SPACING']);
    expect(at(card.fields, 0).value).toBe('6');
    expect(at(card.fields, 1).value).toBe('360°');
    for (const field of card.fields) {
      expect(field.blank).toBe(field.label === 'SPACING');
      if (field.blank) expect(field.value).toBe('');
      else expect(field.value.length).toBeGreaterThan(0);
    }
  });
});

describe('commitPlaneSpacing', () => {
  it.each([
    [6, 70],
    [6, 60],
    [8, 45],
    [8, 40],
    [9, 30],
  ])('spaces %d satellites %d degrees apart, with an honest closing gap', (count, spacingDeg) => {
    const slots = commitPlaneSpacing(SHELL, count, spacingDeg);
    expect(slots).toHaveLength(count);

    for (let k = 1; k < count; k += 1) {
      const gap = wrapAngle(at(slots, k).m0 - at(slots, k - 1).m0);
      expect(gap / RAD_PER_DEG).toBeCloseTo(spacingDeg, 9);
    }
    const closingGap = wrapAngle(at(slots, 0).m0 - at(slots, count - 1).m0);
    expect(closingGap / RAD_PER_DEG).toBeCloseTo(360 - (count - 1) * spacingDeg, 9);
  });

  it.each([
    ['clean', 60],
    ['messy', 70],
  ])(
    'runs the identical slot formula for a %s typed spacing - no special-casing',
    (_label, spacingDeg) => {
      const slots = commitPlaneSpacing(SHELL, 6, spacingDeg as number);
      const spacingRad = (spacingDeg as number) * RAD_PER_DEG;
      slots.forEach((el, k) => {
        expect(el.m0).toBeCloseTo(wrapAngle(SHELL.m0 + k * spacingRad), 9);
      });
    }
  );

  it('keeps period and energy invariant across every slot on the shared orbit', () => {
    const slots = commitPlaneSpacing(SHELL, 6, 70);
    const expectedPeriod = period(SHELL.a);
    const expectedMotion = meanMotion(SHELL.a);
    for (const el of slots) {
      expect(el.a).toBe(SHELL.a);
      expect(el.e).toBe(SHELL.e);
      expect(period(el.a)).toBeCloseTo(expectedPeriod, 9);
      expect(meanMotion(el.a)).toBeCloseTo(expectedMotion, 9);
      expect(specificEnergy(stateAt(el, 0))).toBeCloseTo(specificEnergy(stateAt(SHELL, 0)), 6);
    }
  });

  it('leaves every other element untouched - only mean anomaly differs by slot', () => {
    const slots = commitPlaneSpacing(SHELL, 9, 40);
    for (const el of slots) {
      expect(el.i).toBe(SHELL.i);
      expect(el.raan).toBe(SHELL.raan);
      expect(el.argp).toBe(SHELL.argp);
    }
  });
});
