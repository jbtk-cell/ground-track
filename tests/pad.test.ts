import { describe, expect, it } from 'vitest';
import type { MissionState, PadCard } from '../src/sim/types';
import type { Elements } from '../src/sim';
import { padViewModel, reduceTyped, type PadViewModel } from '../src/ui/pad';

// The transfer ellipse from the DIRECTION.md grade-3 card.
const ELEMENTS: Elements = {
  a: 6938,
  e: 0.0317,
  i: 0.9,
  raan: 0.4,
  argp: 1.1,
  m0: 0.2,
};

const CARD: PadCard = {
  title: 'MANEUVER · APOGEE RAISE · HERON-1',
  fields: [
    { label: 'r periapsis', value: '6 718 km', blank: false },
    { label: 'r apoapsis', value: '7 158 km', blank: false },
    { label: 'semi-major (transfer)', value: '6 938 km', blank: false },
    { label: 'delta-v required', value: '48 m/s', blank: false },
    { label: 'thruster', value: '6 m/s per s', blank: false },
    { label: 'burn duration', value: '', blank: true },
  ],
  answerDigits: 2,
  answerUnit: 's',
  deltaVMS: 48,
  accelMS2: 6,
  nodeTimeSim: 410,
};

function mission(overrides: Partial<MissionState> = {}): MissionState {
  return {
    phase: 'card',
    satName: 'HERON-1',
    elements: ELEMENTS,
    tSim: 369,
    targetRaKm: 7158,
    toleranceKm: 25,
    card: CARD,
    burn: null,
    propellantMS: 400,
    history: [],
    statusLine: 'NODE T-41 S',
    ...overrides,
  };
}

function blankRow(vm: PadViewModel) {
  return vm.rows.find((row) => row.blank);
}

describe('padViewModel', () => {
  it('sizes the blank to answerDigits and leaves untyped cells empty', () => {
    const vm = padViewModel(mission(), '');
    expect(blankRow(vm)?.cells).toEqual(['', '']);
  });

  it('places typed digits into the cells in order', () => {
    expect(blankRow(padViewModel(mission(), '4'))?.cells).toEqual(['4', '']);
    expect(blankRow(padViewModel(mission(), '48'))?.cells).toEqual(['4', '8']);
  });

  it('keeps machine rows as preformatted values without cells', () => {
    const vm = padViewModel(mission(), '');
    const machine = vm.rows.filter((row) => !row.blank);
    expect(machine).toHaveLength(5);
    for (const row of machine) expect(row.cells).toBeUndefined();
    expect(machine[1]?.value).toBe('7 158 km');
  });

  it('advances the caret to the next empty cell and retires it when full', () => {
    expect(padViewModel(mission(), '').caretIndex).toBe(0);
    expect(padViewModel(mission(), '4').caretIndex).toBe(1);
    expect(padViewModel(mission(), '48').caretIndex).toBeNull();
  });

  it('carries the title and status line through unchanged', () => {
    const vm = padViewModel(mission(), '');
    expect(vm.title).toBe('MANEUVER · APOGEE RAISE · HERON-1');
    expect(vm.statusLine).toBe('NODE T-41 S');
  });

  it('hides the card while coasting but keeps the status line', () => {
    const m = mission({
      phase: 'coast',
      card: null,
      statusLine: 'APOAPSIS 6 990 KM · NEXT CARD T-38 S',
    });
    const vm = padViewModel(m, '');
    expect(vm.cardVisible).toBe(false);
    expect(vm.statusLine).toBe('APOAPSIS 6 990 KM · NEXT CARD T-38 S');
  });

  it('during a burn shows the executed digits as a plain value, no caret, and the accent', () => {
    const m = mission({
      phase: 'burning',
      card: null,
      burn: { startTSim: 410, durationS: 8, accelMS2: 6 },
      statusLine: 'BURN IN PROGRESS · T+2 S',
    });
    const vm = padViewModel(m, '', { lastCard: CARD });
    expect(vm.cardVisible).toBe(true);
    expect(vm.accentBurning).toBe(true);
    expect(vm.caretIndex).toBeNull();
    // Entry is closed: no cells, no underline - the committed line renders
    // through the same value path as every machine row.
    expect(blankRow(vm)?.cells).toBeUndefined();
    expect(blankRow(vm)?.value).toBe('8');
  });

  it('after the burn fills the blank from the history, accent gone', () => {
    const m = mission({
      phase: 'assess',
      card: null,
      history: [{ digits: '6', seconds: 6, apoapsisKmAfter: 7042 }],
      statusLine: 'APOAPSIS 7 042 KM · NEXT CARD T-38 S',
    });
    const vm = padViewModel(m, '', { lastCard: CARD });
    expect(vm.cardVisible).toBe(true);
    expect(vm.accentBurning).toBe(false);
    expect(blankRow(vm)?.cells).toBeUndefined();
    expect(blankRow(vm)?.value).toBe('6');
  });

  it('formats entered records with thin-space digit groups, newest last', () => {
    const m = mission({
      history: [
        { digits: '6', seconds: 6, apoapsisKmAfter: 9112.4 },
        { digits: '2', seconds: 2, apoapsisKmAfter: 9421 },
      ],
    });
    expect(padViewModel(m, '').entered).toEqual(['6 s -> 9\u2009112 km', '2 s -> 9\u2009421 km']);
  });

  it('scales propellant against the reference and clamps at full', () => {
    expect(padViewModel(mission({ propellantMS: 300 }), '').propellantFraction).toBeCloseTo(0.75);
    expect(padViewModel(mission({ propellantMS: 500 }), '').propellantFraction).toBe(1);
    expect(padViewModel(mission({ propellantMS: 0 }), '').propellantFraction).toBe(0);
    const scaled = padViewModel(mission({ propellantMS: 120 }), '', { referenceMS: 480 });
    expect(scaled.propellantFraction).toBeCloseTo(0.25);
  });

  it('never grades: no output string praises, judges, or exclaims', () => {
    const states = [
      padViewModel(mission(), '48'),
      padViewModel(mission({ phase: 'coast', card: null }), ''),
      padViewModel(
        mission({
          phase: 'assess',
          card: null,
          history: [{ digits: '6', seconds: 6, apoapsisKmAfter: 7042 }],
          statusLine: 'APOAPSIS 7 042 KM · NEXT CARD T-38 S',
        }),
        '',
        { lastCard: CARD }
      ),
      padViewModel(
        mission({
          phase: 'burning',
          card: null,
          burn: { startTSim: 410, durationS: 8, accelMS2: 6 },
        }),
        '',
        { lastCard: CARD }
      ),
    ];
    for (const vm of states) {
      const text = JSON.stringify(vm).toLowerCase();
      for (const banned of ['correct', 'wrong', 'great', '!']) {
        expect(text).not.toContain(banned);
      }
    }
  });
});

describe('reduceTyped', () => {
  it('appends digits up to answerDigits and no further', () => {
    expect(reduceTyped('', '4', 2)).toBe('4');
    expect(reduceTyped('4', '8', 2)).toBe('48');
    expect(reduceTyped('48', '3', 2)).toBe('48');
  });

  it('removes the last digit on Backspace', () => {
    expect(reduceTyped('48', 'Backspace', 2)).toBe('4');
    expect(reduceTyped('', 'Backspace', 2)).toBe('');
  });

  it('ignores non-digit keys', () => {
    for (const key of ['Enter', 'e', '.', '-', ' ', 'ArrowUp', 'Escape']) {
      expect(reduceTyped('4', key, 2)).toBe('4');
    }
  });
});
