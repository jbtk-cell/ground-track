import { TWO_PI, wrapAngle } from './constants';
import { formatDeg, formatInt } from './format';
import type { Elements } from './orbit';
import type { PadField, SpacingCard } from './types';

/**
 * Constellation plane spacing: DIRECTION.md's grade-7 example - "six
 * satellites, 360 degrees, spacing blank. You type 60" - with Walker delta
 * phasing behind it. Printed-arithmetic policy copied from plan.ts: the card
 * prints the two fields the blank is derived from, and the executor runs
 * whatever was typed, not the derivation.
 */

const FULL_CIRCLE_DEG = 360;

/** Satellite counts whose spacing is a whole number of degrees. */
export const PLANE_SPACING_SEED_COUNTS: readonly number[] = [6, 8, 9];

/**
 * Plans a plane-spacing card for `count` satellites sharing one orbit. The
 * blank is 360 / count, printed nowhere - one division on the two printed
 * fields, same as the grade-7 example.
 */
export function planPlaneSpacing(count: number): SpacingCard {
  const fields: readonly PadField[] = [
    { label: 'satellites', value: formatInt(count), blank: false },
    { label: 'full circle', value: formatDeg(FULL_CIRCLE_DEG), blank: false },
    { label: 'SPACING', value: '', blank: true },
  ];
  return {
    title: 'CONSTELLATION · PLANE SPACING',
    fields,
    answerDigits: String(Math.round(FULL_CIRCLE_DEG / count)).length,
    answerUnit: 'deg',
    count,
  };
}

/**
 * Executes a committed spacing: one copy of the shared orbit per satellite,
 * slot k assigned mean anomaly k * spacingDeg. No verdict branch - whatever
 * was typed is what every slot gets, through this one path; typing 70 with
 * six satellites genuinely spaces them 70 degrees apart and leaves the
 * 10-degree closing bunch between the last slot and the first visible.
 */
export function commitPlaneSpacing(
  el: Elements,
  count: number,
  spacingDeg: number
): readonly Elements[] {
  const spacingRad = (spacingDeg * TWO_PI) / FULL_CIRCLE_DEG;
  return Array.from({ length: count }, (_, slot) => ({
    ...el,
    m0: wrapAngle(el.m0 + slot * spacingRad),
  }));
}
