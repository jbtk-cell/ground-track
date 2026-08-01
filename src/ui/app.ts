/**
 * The app loop: all mutable session state lives here. Wall time maps onto sim
 * time, the mission advances, and every visual is drawn from the returned
 * state - the renderer decides nothing. The typed buffer is the only thing
 * the player owns, and committing it hands the number to the simulation
 * unchanged.
 */
import * as THREE from 'three';
import {
  PALETTE,
  PRESETS,
  applyPreset,
  createOrbitTrace,
  createSatellite,
  createScene,
  createTargetRing,
  presetByName,
  sceneFromState,
  scenePointFromSim,
  setBurning,
} from '../render';
import { advance, commitEntry, createMission, predictedElements, stateAt } from '../sim';
import type { MissionPhase, MissionState, PadCard } from '../sim';
import { PROPELLANT_REFERENCE_MS, createPad, reduceTyped } from './pad';

declare global {
  interface Window {
    groundTrack?: {
      ready: boolean;
      presets: readonly string[];
      setPreset(name: string): boolean;
      /** Freezes animation so screenshots are deterministic. */
      setPaused(paused: boolean): void;
      setTime(seconds: number): void;
      mission: {
        state(): unknown;
        type(digits: string): void;
        commit(): void;
        warp(mult: number): void;
      };
    };
  }
}

/**
 * Wall-to-sim compression by phase. Tuning surface for the loop. A burn runs
 * at 1x because the card said 8 s and the player watches 8 real seconds of
 * integrated thrust, and a card runs at 1x because the node countdown is the
 * entry window - a human doing the division needs the T-45 lead in wall
 * seconds, not in frames. Everything else compresses; coast at 200x turns
 * the orbit between nodes (~8 000 sim s) into the direction's forty-second
 * beat, not a coffee break.
 */
const PACING: Record<MissionPhase, number> = {
  coast: 200,
  card: 1,
  burning: 1,
  assess: 30,
  complete: 20,
};

/**
 * Two stretches inside the 1x phases are dead time, not the beat itself, and
 * compress at coast rate: a card whose node is still further out than the
 * entry window (a replanned card prints a full orbit early), and the
 * pre-ignition hold of a burn committed ahead of its node. Both drop to 1x
 * on approach, so entry and ignition always play in real time.
 */
const ENTRY_WINDOW_S = 45;
const IGNITION_HOLD_S = 5;

function pacingFor(m: MissionState): number {
  if (m.phase === 'card' && m.card !== null && m.card.nodeTimeSim - m.tSim > ENTRY_WINDOW_S) {
    return PACING.coast;
  }
  if (m.phase === 'burning' && m.burn !== null && m.burn.startTSim - m.tSim > IGNITION_HOLD_S) {
    return PACING.coast;
  }
  return PACING[m.phase];
}

/** Caret blink half-period, wall milliseconds. */
const CARET_BLINK_MS = 530;

/**
 * A backgrounded tab hands the next frame a dt of minutes; clamped, the
 * mission resumes where it was rather than teleporting past its card.
 */
const MAX_WALL_DT_S = 0.1;

/**
 * The verifier presets are built by advancing a fresh mission in fixed steps
 * to fixed sim times - never from the live session - so a screenshot is a
 * function of the code alone.
 */
const DET_STEP_S = 0.5;
/** Bound on deterministic stepping; well past two full orbits. */
const DET_STEP_CAP = 60000;

/** The camera preset the live mission plays under. */
const MISSION_CAMERA = 'mission';

const MISSION_PRESET_NAMES = [
  'mission-card',
  'mission-ghost',
  'mission-burn',
  'mission-complete',
] as const;

/**
 * The card's blank asks for deltaVMS / accelMS2, a whole number by
 * construction (see plan.ts); this is the entry a nominal flight types.
 */
function trueAnswer(card: PadCard): string {
  return String(Math.round(card.deltaVMS / card.accelMS2));
}

/** A fresh mission advanced in fixed steps until its first card is up. */
function missionAtFirstCard(): MissionState {
  let m = createMission();
  let guard = 0;
  while (m.phase !== 'card' && guard < DET_STEP_CAP) {
    m = advance(m, DET_STEP_S);
    guard += 1;
  }
  return m;
}

interface MissionSnapshot {
  readonly mission: MissionState;
  readonly typed: string;
  /**
   * Card the PAD keeps showing in phases where MissionState.card is null.
   * Carried explicitly so a preset's card body comes from its own
   * deterministic flight, never from whatever the live session printed last.
   */
  readonly cardForPad: PadCard | null;
}

function buildMissionPreset(name: string): MissionSnapshot | null {
  switch (name) {
    case 'mission-card': {
      const m = missionAtFirstCard();
      return { mission: m, typed: '', cardForPad: m.card };
    }
    case 'mission-ghost': {
      const m = missionAtFirstCard();
      // One digit of the true answer: enough for the ghost conic to show and
      // for the target ring to be suppressed, which is the shot's subject.
      return {
        mission: m,
        typed: m.card === null ? '' : trueAnswer(m.card).charAt(0),
        cardForPad: m.card,
      };
    }
    case 'mission-burn': {
      let m = missionAtFirstCard();
      const card = m.card;
      if (card !== null) m = commitEntry(m, trueAnswer(card));
      const burn = m.burn;
      if (burn !== null) {
        const tHalf = burn.startTSim + burn.durationS / 2;
        while (m.tSim < tHalf - 1e-9) m = advance(m, DET_STEP_S);
      }
      return { mission: m, typed: '', cardForPad: card };
    }
    case 'mission-complete': {
      // The nominal flight end to end: every card that prints gets its own
      // true answer, through the same commit path as a player.
      let m = missionAtFirstCard();
      let card = m.card;
      let guard = 0;
      while (m.phase !== 'complete' && guard < DET_STEP_CAP) {
        if (m.phase === 'card' && m.card !== null) {
          card = m.card;
          m = commitEntry(m, trueAnswer(m.card));
        }
        m = advance(m, DET_STEP_S);
        guard += 1;
      }
      return { mission: m, typed: '', cardForPad: card };
    }
    default:
      return null;
  }
}

export function startApp(): void {
  const canvas = document.getElementById('viewport');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #viewport canvas');
  const padRoot = document.getElementById('pad-root');
  if (!(padRoot instanceof HTMLElement)) throw new Error('Missing #pad-root');
  const masthead = document.querySelector('.masthead');

  // Touch input is a seeded issue, not this slice: a future touch pad mounts
  // here, and pointer taps already focus nothing (the pad ignores pointers).
  padRoot.dataset.touchPad = '';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Colours are authored, not photographed. No tone mapping, and no bloom anywhere.
  renderer.toneMapping = THREE.NoToneMapping;

  const handle = createScene();

  const satellite = createSatellite();
  const trace = createOrbitTrace({ colour: PALETTE.MINT, opacity: 0.8 });
  // The projected conic while typing: dotted, 22%, per the direction.
  const ghost = createOrbitTrace({ colour: PALETTE.MINT, opacity: 0.22, ghost: true });
  ghost.object.visible = false;
  const ring = createTargetRing();
  handle.scene.add(satellite, trace.object, ghost.object, ring.object);

  const pad = createPad(padRoot);

  // --- Mutable session state. Everything below is owned by this closure. ---
  let mission = createMission();
  let typed = '';
  let paused = false;
  let warpMult = 1;
  /** Drives the planet's slow turn; wall rate, so compression never spins it. */
  let sceneTime = 0;
  let caretBlink = false;
  let lastFrame = performance.now();
  let lastElements: MissionState['elements'] | null = null;
  let lastCardRef: PadCard | null = mission.card;
  let ghostKey = '';

  const PLUS_X = new THREE.Vector3(1, 0, 0);
  const progradeDir = new THREE.Vector3();

  /** Swaps in a mission without the card-change check wiping its typed buffer. */
  const adoptMission = (snapshot: MissionSnapshot): void => {
    mission = snapshot.mission;
    typed = snapshot.typed;
    lastCardRef = mission.card;
    caretBlink = false;
    ghostKey = '';
    // Every preset flight starts on the default budget; pinning the column's
    // full scale to it keeps the shot a function of the code alone.
    pad.reset(snapshot.cardForPad, PROPELLANT_REFERENCE_MS);
  };

  const syncAndRender = (): void => {
    // A reprinted card is a new problem; stale digits must not carry onto it.
    if (mission.card !== lastCardRef) {
      lastCardRef = mission.card;
      if (mission.card !== null) typed = '';
    }

    const state = stateAt(mission.elements, mission.tSim);
    satellite.position.copy(sceneFromState(state));
    const v = scenePointFromSim(state.velocity);
    progradeDir.set(v.x, v.y, v.z);
    if (progradeDir.lengthSq() > 0) {
      // Nose prograde, so the nozzle (and a live plume) trails the motion.
      satellite.quaternion.setFromUnitVectors(PLUS_X, progradeDir.normalize());
    }
    setBurning(satellite, mission.phase === 'burning');

    // Elements are replaced immutably, so a reference check is a change check.
    if (mission.elements !== lastElements) {
      trace.update(mission.elements);
      ring.update(mission.elements, mission.targetRaKm);
      lastElements = mission.elements;
    }

    const typedSeconds = /^\d+$/.test(typed) ? Number(typed) : 0;
    const wantGhost = mission.phase === 'card' && mission.card !== null && typedSeconds > 0;
    if (wantGhost && mission.card !== null) {
      const key = `${typed}|${mission.card.nodeTimeSim}`;
      if (key !== ghostKey) {
        const predicted = predictedElements(mission, typed);
        if (predicted !== null) ghost.update(predicted);
        ghostKey = key;
      }
      ghost.object.visible = true;
    } else {
      ghost.object.visible = false;
      ghostKey = '';
    }

    // The direction suppresses the ring during entry so the answer cannot be
    // converged by eye; it returns the moment the buffer empties or commits.
    ring.setVisible(!(mission.phase === 'card' && typed.length > 0));
    ring.setSolid(mission.phase === 'complete');

    pad.update(mission, typed, caretBlink && !paused);

    // Once the first card is up the PAD owns the left edge; the wordmark
    // recedes rather than competing with an instrument.
    if (masthead !== null) {
      masthead.classList.toggle(
        'masthead-quiet',
        mission.phase !== 'coast' || mission.history.length > 0
      );
    }

    // A pure function of sceneTime, which is itself frozen under setPaused and
    // pinned by setTime - the crawl inherits both for free.
    trace.setDashTime(sceneTime);
    ghost.setDashTime(sceneTime);

    handle.update(sceneTime);
    renderer.render(handle.scene, handle.camera);
  };

  const resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    handle.resize(width, height);
  };

  const frame = (now: number): void => {
    const wallDt = Math.min(MAX_WALL_DT_S, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (!paused) {
      sceneTime += wallDt;
      mission = advance(mission, wallDt * pacingFor(mission) * warpMult);
    }
    syncAndRender();
    requestAnimationFrame(frame);
  };

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (mission.phase !== 'card' || mission.card === null) return;
    if (event.key === 'Enter') {
      const next = commitEntry(mission, typed);
      if (next !== mission) {
        mission = next;
        typed = '';
      }
      return;
    }
    typed = reduceTyped(typed, event.key, mission.card.answerDigits);
  });

  window.setInterval(() => {
    caretBlink = paused ? false : !caretBlink;
  }, CARET_BLINK_MS);

  window.addEventListener('resize', resize);
  resize();

  const missionCamera = presetByName(MISSION_CAMERA);
  if (missionCamera === undefined) throw new Error('Missing mission camera preset');
  applyPreset(handle.camera, missionCamera, handle.setSunDirection);

  requestAnimationFrame(frame);

  window.groundTrack = {
    ready: true,
    // The four landing framings plus the four deterministic mission states.
    // The raw 'mission' camera preset is not listed: it is a framing, not a
    // reproducible shot, and the shot harness screenshots this list.
    presets: [
      ...PRESETS.filter((preset) => preset.name !== MISSION_CAMERA).map((preset) => preset.name),
      ...MISSION_PRESET_NAMES,
    ],
    setPreset(name: string) {
      const snapshot = buildMissionPreset(name);
      if (snapshot !== null) {
        applyPreset(handle.camera, missionCamera, handle.setSunDirection);
        adoptMission(snapshot);
        sceneTime = 0;
        syncAndRender();
        return true;
      }
      const preset = presetByName(name);
      if (preset === undefined) return false;
      applyPreset(handle.camera, preset, handle.setSunDirection);
      // Landing baselines now include the pad and satellite, so the mission
      // pins to its fixed start; the shot stays a function of the code alone.
      adoptMission({ mission: createMission(), typed: '', cardForPad: null });
      sceneTime = 0;
      syncAndRender();
      return true;
    },
    setPaused(value: boolean) {
      paused = value;
      if (paused) caretBlink = false;
    },
    setTime(seconds: number) {
      sceneTime = seconds;
      syncAndRender();
    },
    mission: {
      state() {
        return JSON.parse(JSON.stringify({ ...mission, typed })) as unknown;
      },
      type(digits: string) {
        for (const key of digits) {
          if (mission.phase === 'card' && mission.card !== null) {
            typed = reduceTyped(typed, key, mission.card.answerDigits);
          }
        }
        syncAndRender();
      },
      commit() {
        const next = commitEntry(mission, typed);
        if (next !== mission) {
          mission = next;
          typed = '';
        }
        syncAndRender();
      },
      warp(mult: number) {
        if (Number.isFinite(mult) && mult > 0) warpMult = mult;
      },
    },
  };
}
