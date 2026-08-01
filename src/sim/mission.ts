import { stepBurn } from './burn';
import { MU_EARTH, wrapAngle } from './constants';
import { formatInt } from './format';
import {
  apoapsisRadius,
  applyDeltaV,
  elementsFromState,
  meanMotion,
  prograde,
  specificEnergy,
  stateAt,
  type Elements,
} from './orbit';
import { nextPeriapsisTime, planApogeeRaise, planCorrection } from './plan';
import type { ActiveBurn, EntryRecord, MissionState, PadCard } from './types';
import { scale } from './vec3';

/**
 * The mission state machine. Every function takes a state and returns a new
 * state; nothing here reads a clock, rolls a die or touches an engine. The
 * elements stored on the state are referenced to sim time zero, so
 * stateAt(m.elements, m.tSim) is always the current state vector.
 */

export interface MissionConfig {
  readonly satName?: string;
  readonly elements?: Elements;
  readonly targetRaKm?: number;
  readonly toleranceKm?: number;
  readonly propellantMS?: number;
}

/** The card prints this many sim-seconds ahead of its node. */
const CARD_LEAD_S = 45;
/** An untyped node is reprinted against the next passage this long after. */
const REPLAN_AFTER_NODE_S = 30;
/** Integration step for incremental thrust, seconds. */
const BURN_STEP_S = 0.25;
/**
 * Osculating-energy ceiling, the energy of an a = 120 000 km ellipse. The
 * Kepler propagator is elliptic-only, so thrust cuts off here rather than
 * letting the osculating orbit cross e = 1 into a shape the sim cannot
 * represent. A plant limit applied to every entry alike - not a judgement.
 */
const ENERGY_CEILING_KM2S2 = -MU_EARTH / (2 * 120000);

const DEFAULT_A_KM = 8700;
/** Puts the first periapsis passage about 90 sim-seconds out, so the first
 *  card prints 45 seconds after the mission starts. */
const FIRST_NODE_S = 90;

const DEFAULT_ELEMENTS: Elements = {
  a: DEFAULT_A_KM,
  e: 0.02,
  i: 0.52,
  raan: 0.7,
  argp: 1.1,
  m0: wrapAngle(-meanMotion(DEFAULT_A_KM) * FIRST_NODE_S),
};

export function createMission(config: MissionConfig = {}): MissionState {
  const m: MissionState = {
    phase: 'coast',
    satName: config.satName ?? 'HERON-1',
    elements: config.elements ?? DEFAULT_ELEMENTS,
    tSim: 0,
    targetRaKm: config.targetRaKm ?? 9400,
    toleranceKm: config.toleranceKm ?? 30,
    card: null,
    burn: null,
    propellantMS: config.propellantMS ?? 400,
    history: [],
    statusLine: '',
  };
  return { ...m, statusLine: coastLine(m) };
}

export function advance(m: MissionState, dtSim: number): MissionState {
  if (dtSim <= 0) return m;
  switch (m.phase) {
    case 'coast':
      return advanceCoast(m, dtSim);
    case 'card':
      return advanceCard(m, dtSim);
    case 'burning':
      return advanceBurning(m, dtSim);
    case 'assess':
      return advanceAssess(m, dtSim);
    case 'complete':
      return { ...m, tSim: m.tSim + dtSim };
  }
}

/**
 * Starts an ActiveBurn of exactly the typed number of seconds. The entry is
 * executed, never graded: whatever number arrived is the burn duration,
 * through this one path. Ignition holds for the node if it is still ahead; a
 * commit after the pass lights immediately.
 */
export function commitEntry(m: MissionState, digits: string): MissionState {
  if (m.phase !== 'card' || m.card === null) return m;
  const seconds = parseSeconds(digits);
  if (seconds === null) return m;
  const burn: ActiveBurn = {
    startTSim: Math.max(m.tSim, m.card.nodeTimeSim),
    durationS: seconds,
    accelMS2: m.card.accelMS2,
  };
  // apoapsisKmAfter is rewritten when the burn ends; until then the record
  // carries the pre-burn value so it is never half-empty.
  const record: EntryRecord = {
    digits,
    seconds,
    apoapsisKmAfter: apoapsisRadius(m.elements),
  };
  return {
    ...m,
    phase: 'burning',
    card: null,
    burn,
    history: [...m.history, record],
    statusLine: `IGNITION T-${formatInt(Math.max(0, Math.ceil(burn.startTSim - m.tSim)))} S`,
  };
}

/**
 * The ghost conic while typing: the orbit an impulsive prograde burn of
 * accel * seconds at the node would leave. Cheap - applyDeltaV, no
 * integration - and null outside the card phase or for a non-entry.
 */
export function predictedElements(m: MissionState, digits: string): Elements | null {
  if (m.phase !== 'card' || m.card === null) return null;
  const seconds = parseSeconds(digits);
  if (seconds === null) return null;
  const state = stateAt(m.elements, m.card.nodeTimeSim);
  // m/s -> km/s, the same single conversion burn.ts makes.
  const deltaVKmS = (m.card.accelMS2 * seconds) / 1000;
  return applyDeltaV(m.elements, m.card.nodeTimeSim, scale(prograde(state), deltaVKmS));
}

/** Digits 0..999 as typed; anything else is not an entry and changes nothing. */
function parseSeconds(digits: string): number | null {
  if (!/^\d+$/.test(digits)) return null;
  return Math.min(999, Math.max(0, Number(digits)));
}

function advanceCoast(m: MissionState, dtSim: number): MissionState {
  const t = m.tSim + dtSim;
  const moved: MissionState = { ...m, tSim: t };
  const card = planNext(moved, t);
  if (card === null) {
    return { ...moved, statusLine: standingLine(m.elements) };
  }
  if (nextPeriapsisTime(m.elements, t) - t <= CARD_LEAD_S) {
    return { ...moved, phase: 'card', card, statusLine: nodeLine(card, t) };
  }
  return { ...moved, statusLine: coastLine(moved) };
}

function advanceCard(m: MissionState, dtSim: number): MissionState {
  const t = m.tSim + dtSim;
  if (m.card === null) return { ...m, tSim: t };
  // An untyped node is not an error: the world keeps moving, and 30 seconds
  // past the pass the computer reprints the same problem against the next one.
  if (t > m.card.nodeTimeSim + REPLAN_AFTER_NODE_S) {
    const card = planNext(m, t);
    if (card === null) {
      return { ...m, tSim: t, phase: 'coast', card: null, statusLine: standingLine(m.elements) };
    }
    return { ...m, tSim: t, card, statusLine: nodeLine(card, t) };
  }
  return { ...m, tSim: t, statusLine: nodeLine(m.card, t) };
}

function advanceBurning(m: MissionState, dtSim: number): MissionState {
  const t = m.tSim + dtSim;
  const burn = m.burn;
  if (burn === null) return { ...m, tSim: t };

  const burnEnd = burn.startTSim + burn.durationS;
  const thrustFrom = Math.max(m.tSim, burn.startTSim);
  const thrustTo = Math.min(t, burnEnd);

  let elements = m.elements;
  let propellantMS = m.propellantMS;
  let cutoff = false;

  if (thrustTo > thrustFrom) {
    const seg = thrustTo - thrustFrom;
    // The tank is physics: the remaining budget caps the integrable seconds
    // exactly like the energy ceiling - a plant limit applied to every entry
    // alike, never a judgement of the number that emptied it.
    const tankS = burn.accelMS2 > 0 ? m.propellantMS / burn.accelMS2 : Infinity;
    let state = stateAt(elements, thrustFrom);
    let burned = 0;
    while (burned < seg - 1e-9) {
      if (burned >= tankS - 1e-9) {
        cutoff = true;
        break;
      }
      const dt = Math.min(BURN_STEP_S, seg - burned, tankS - burned);
      const next = stepBurn(state, burn.accelMS2, dt);
      if (specificEnergy(next) >= ENERGY_CEILING_KM2S2) {
        cutoff = true;
        break;
      }
      state = next;
      burned += dt;
    }
    elements = rebaseToSimZero(elementsFromState(state), thrustFrom + burned);
    // The floor absorbs only float residue: burned never exceeds tankS.
    propellantMS = Math.max(0, propellantMS - burn.accelMS2 * burned);
  }

  if (cutoff || t >= burnEnd) {
    const ra = apoapsisRadius(elements);
    return {
      ...m,
      tSim: t,
      elements,
      propellantMS,
      phase: 'assess',
      burn: null,
      history: recordApoapsis(m.history, ra),
      statusLine: `${cutoff ? 'THRUST CUTOFF' : 'BURN COMPLETE'} · APOAPSIS ${formatInt(ra)} KM`,
    };
  }

  const statusLine =
    t < burn.startTSim
      ? `IGNITION T-${formatInt(Math.ceil(burn.startTSim - t))} S`
      : `BURNING · T-${formatInt(Math.max(0, Math.ceil(burnEnd - t)))} S`;
  return { ...m, tSim: t, elements, propellantMS, statusLine };
}

function advanceAssess(m: MissionState, dtSim: number): MissionState {
  const t = m.tSim + dtSim;
  const moved: MissionState = { ...m, tSim: t };
  const ra = apoapsisRadius(m.elements);
  if (Math.abs(ra - m.targetRaKm) <= m.toleranceKm) {
    return {
      ...moved,
      phase: 'complete',
      statusLine: `BURN NOMINAL · APOAPSIS ${formatInt(ra)} KM`,
    };
  }
  const card = planNext(moved, t);
  if (card === null) {
    // The apoapsis stands off the ring on the side this thruster cannot
    // reach; no card is scheduled and no propellant goes to an impossible
    // correction.
    return { ...moved, phase: 'coast', statusLine: standingLine(m.elements) };
  }
  const wait = Math.max(0, Math.ceil(cardPrintTime(m.elements, t) - t));
  return {
    ...moved,
    phase: 'coast',
    statusLine: `APOAPSIS ${formatInt(ra)} KM · NEXT CARD T-${formatInt(wait)} S`,
  };
}

/**
 * The first card is the mission plan; every later one is a correction
 * recomputed from the current orbit, which is how an off entry is absorbed:
 * the next card is simply the real remaining problem.
 */
function planNext(m: MissionState, tNow: number): PadCard | null {
  return m.history.length === 0
    ? planApogeeRaise(m.elements, tNow, m.targetRaKm, { satName: m.satName })
    : planCorrection(m.elements, tNow, m.targetRaKm, { satName: m.satName });
}

function cardPrintTime(el: Elements, t: number): number {
  return nextPeriapsisTime(el, t) - CARD_LEAD_S;
}

/**
 * elementsFromState sets the epoch at the state it was handed; the mission
 * keeps every element set referenced to sim time zero instead, so shift m0
 * back by the mean motion accumulated since epoch.
 */
function rebaseToSimZero(el: Elements, tEpoch: number): Elements {
  return { ...el, m0: wrapAngle(el.m0 - meanMotion(el.a) * tEpoch) };
}

function recordApoapsis(
  history: readonly EntryRecord[],
  apoapsisKm: number
): readonly EntryRecord[] {
  const last = history[history.length - 1];
  if (last === undefined) return history;
  return [...history.slice(0, -1), { ...last, apoapsisKmAfter: apoapsisKm }];
}

function coastLine(m: MissionState): string {
  const prefix =
    m.history.length === 0 ? 'COASTING' : `APOAPSIS ${formatInt(apoapsisRadius(m.elements))} KM`;
  const wait = Math.max(0, Math.ceil(cardPrintTime(m.elements, m.tSim) - m.tSim));
  return `${prefix} · NEXT CARD T-${formatInt(wait)} S`;
}

function standingLine(el: Elements): string {
  return `APOAPSIS ${formatInt(apoapsisRadius(el))} KM · NO FURTHER CARD`;
}

function nodeLine(card: PadCard, t: number): string {
  return `CARD UP · NODE T-${formatInt(Math.max(0, Math.ceil(card.nodeTimeSim - t)))} S`;
}
