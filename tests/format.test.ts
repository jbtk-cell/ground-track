import { describe, expect, it } from 'vitest';
import { formatCountdown, formatInt, formatKm, formatMS } from '../src/sim';

const THIN = '\u2009';

describe('formatInt', () => {
  it('groups digits in threes with a thin space', () => {
    expect(formatInt(7158)).toBe(`7${THIN}158`);
    expect(formatInt(1234567)).toBe(`1${THIN}234${THIN}567`);
  });

  it('leaves values under one thousand ungrouped', () => {
    expect(formatInt(315)).toBe('315');
    expect(formatInt(0)).toBe('0');
  });

  it('rounds to the nearest integer', () => {
    expect(formatInt(6989.7)).toBe(`6${THIN}990`);
    expect(formatInt(96.4)).toBe('96');
  });

  it('keeps the sign ahead of the grouping', () => {
    expect(formatInt(-7158)).toBe(`-7${THIN}158`);
  });
});

describe('formatKm and formatMS', () => {
  it('appends the unit after an ordinary space', () => {
    expect(formatKm(7158)).toBe(`7${THIN}158 km`);
    expect(formatMS(315)).toBe('315 m/s');
  });

  it('rounds before grouping', () => {
    expect(formatKm(7157.6)).toBe(`7${THIN}158 km`);
    expect(formatMS(96.6)).toBe('97 m/s');
  });
});

describe('formatCountdown', () => {
  it('formats seconds as T-MM:SS', () => {
    expect(formatCountdown(41)).toBe('T-00:41');
    expect(formatCountdown(90)).toBe('T-01:30');
    expect(formatCountdown(600)).toBe('T-10:00');
  });

  it('rounds fractional seconds', () => {
    expect(formatCountdown(41.4)).toBe('T-00:41');
    expect(formatCountdown(0.4)).toBe('T-00:00');
  });

  it('reads T+ once the moment has passed', () => {
    expect(formatCountdown(-12)).toBe('T+00:12');
    expect(formatCountdown(-90)).toBe('T+01:30');
    expect(formatCountdown(-0.4)).toBe('T-00:00');
  });
});
