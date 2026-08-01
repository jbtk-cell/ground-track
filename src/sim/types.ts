/**
 * Shared contracts for the mission vertical slice.
 *
 * Written by hand before the foundation build; every layer imports from here.
 * Builders may add new types but must not change or remove existing fields -
 * three modules are built against this file in parallel.
 */
import type { Elements } from './orbit';

/** Phases of a single maneuver mission. */
export type MissionPhase =
  | 'coast' // falling around the planet, next card scheduled
  | 'card' // PAD is up, one field blank, input open
  | 'burning' // thruster firing; the typed number is being executed
  | 'assess' // burn done; the world states what happened, next card if needed
  | 'complete'; // apoapsis settled on the ring

export interface PadField {
  /** Row label, lower case, e.g. 'r apoapsis'. */
  readonly label: string;
  /** Preformatted value with thin-space digit groups, e.g. '7 158 km'. */
  readonly value: string;
  /** Exactly one field per card is blank; its value is the empty string. */
  readonly blank: boolean;
}

export interface PadCard {
  /** e.g. 'MANEUVER · APOGEE RAISE · HERON-1' */
  readonly title: string;
  readonly fields: readonly PadField[];
  /** Width of the blank, in digits. The underscore cell is sized to this. */
  readonly answerDigits: number;
  readonly answerUnit: 's';
  /**
   * Ground truth the executor runs. deltaVMS / accelMS2 is a whole number of
   * seconds, and that division is THE arithmetic the card asks for. Both
   * values appear on the card exactly as used - if a number is printed, the
   * simulation genuinely runs it.
   */
  readonly deltaVMS: number;
  readonly accelMS2: number;
  /** Sim time at which the node passes. */
  readonly nodeTimeSim: number;
}

/**
 * A constellation plane-spacing card. Same field/blank shape as PadCard, but
 * the entry is a spacing in degrees, not a burn duration in seconds - kept as
 * its own type rather than widening PadCard.answerUnit.
 */
export interface SpacingCard {
  /** e.g. 'CONSTELLATION · PLANE SPACING' */
  readonly title: string;
  readonly fields: readonly PadField[];
  /** Width of the blank, in digits. */
  readonly answerDigits: number;
  readonly answerUnit: 'deg';
  /** Ground truth the executor runs: how many satellites share this shell. */
  readonly count: number;
}

/** One committed entry: what was typed, what the world did with it. */
export interface EntryRecord {
  readonly digits: string;
  readonly seconds: number;
  readonly apoapsisKmAfter: number;
}

export interface ActiveBurn {
  readonly startTSim: number;
  readonly durationS: number;
  readonly accelMS2: number;
}

export interface MissionState {
  readonly phase: MissionPhase;
  readonly satName: string;
  /** Current osculating elements. During a burn these change every step. */
  readonly elements: Elements;
  /** Sim seconds since epoch. The app maps wall time onto this. */
  readonly tSim: number;
  readonly targetRaKm: number;
  readonly toleranceKm: number;
  /** Non-null exactly in the 'card' phase. */
  readonly card: PadCard | null;
  /** Non-null exactly in the 'burning' phase. */
  readonly burn: ActiveBurn | null;
  /** Remaining delta-v budget, m/s. Decrements as thrust is spent. */
  readonly propellantMS: number;
  readonly history: readonly EntryRecord[];
  /**
   * The mint instrument line. States what the mission did, never judges the
   * operator: 'APOAPSIS 6 990 KM · NEXT CARD T-38 S', never
   * 'wrong' and never second person.
   */
  readonly statusLine: string;
}
