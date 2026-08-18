/**
 * First-person controller for the environment viewer.
 *
 * One hand walks, one hand looks. WASD and the mouse, and nothing else on the
 * keyboard: a second look binding on the arrows only splits the habit, and
 * Obra Dinn - which this movement is modelled on - never needed one.
 *
 * Pointer lock is the good path but browsers refuse it silently in embedded
 * views and iframes, so drag-look works with no lock at all and needs no key.
 * A stick and a drag area cover a phone.
 *
 * The walk itself lives in ../player/gait.ts and is driven by ground covered
 * rather than by a clock.
 *
 * Movement is clamped to the union of the environment's FloorRects. Exact
 * rectangle clamping, no collider stack: there is no penetration solver to
 * jitter, no way to fall out of the world, and a doorway between two rooms is
 * just an overlap between two rectangles. The margin held off every outer edge
 * is twice the camera's near plane, because the room draws in two passes and
 * the interior pass clears depth over the whole frame - an eye nearer a hull
 * facet than the near plane clips through it and the exterior shows through
 * the wall (docs/ENVIRONMENTS.md).
 */
import * as THREE from 'three';
import type { FloorRect, Spawn } from '../types';
import type { Foot } from '../player/gait';
import { footfallBetween, gaitOffsets } from '../player/gait';

/**
 * Camera near plane, metres. Exported so the viewer builds its camera with the
 * same number the wall clamp is sized against; the two drifting apart is how
 * a hole appears in the hull.
 */
export const NEAR_PLANE_M = 0.1;

/** Held off every outer floor edge. Twice the near plane, so the hull is sealed. */
const WALL_MARGIN_M = NEAR_PLANE_M * 2;

/**
 * Ground speed, metres per second. A 6.2 m deck crosses in three and a third.
 *
 * Raised from 1.4 with the STRIDE lengthened to match (gait.ts), NOT with the
 * cadence. Speed over a fixed stride is the same walk played faster - the feet
 * patter, the bob buzzes, and it reads as a small person hurrying rather than
 * as covering ground. Speed and stride together keep 2.26 footfalls a second,
 * exactly what it was, and the robot simply takes longer steps.
 */
const WALK_SPEED_MS = 1.85;

/** Velocity smoothing, seconds. Short enough to feel direct, long enough not to jolt. */
const WALK_TAU_S = 0.08;

/** Radians per pixel of raw mouse travel under pointer lock. */
const LOOK_LOCKED = 0.0022;
/** Drag has a screen's worth of travel rather than a desk's, so it is faster. */
const LOOK_DRAG = 0.0032;
const LOOK_TOUCH = 0.0042;

/** Radians per second of turn on the arrow keys. A half-turn in about two seconds. */
const KEY_LOOK_RATE = 1.6;

/** 85 degrees. Short of vertical, where yaw and pitch stop being separable. */
const PITCH_LIMIT = 1.4835;

/** Eye settle onto a new floor height, seconds. */
const EYE_TAU_S = 0.12;

/** How fast the gait spins up and winds down, seconds. */
const GAIT_TAU_S = 0.14;

/**
 * DIRECTION's camera law: every reposition the player can trigger is a 2.5-4 s
 * cubic ease, never a snap. Reduced motion takes the long end - a longer ease
 * is a lower peak rate of optical flow, which is what the preference asks for,
 * and cutting to the destination is the one thing the law forbids outright.
 */
const RECENTRE_S = 3.0;
const RECENTRE_REDUCED_S = 4.0;

/** Frame clamp, so a backgrounded tab does not resume with a metre-long step. */
const MAX_DT_S = 0.1;

/** Probe distance used to tell a doorway from a wall, metres. */
const EDGE_PROBE_M = 1e-3;

/** Spacing of the floor-continuity probe along a proposed correction. */
const SEGMENT_PROBE_M = 0.05;

/**
 * Two proposed steps this close in forward progress are the same step, and the
 * one that lands nearest what the player aimed at wins. A tenth of a
 * millimetre: far below anything a body could feel, far above float noise.
 */
const TIE_M = 1e-4;

/** Stick radius in CSS pixels; matches .rooms-stick in viewer.css. */
const STICK_RADIUS_PX = 40;

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** A pose asked for from outside. Eye height is the environment's unless overridden. */
export interface PoseRequest {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly y?: number;
}

export interface ControllerOptions {
  readonly camera: THREE.PerspectiveCamera;
  /** Look input and pointer lock bind here. */
  readonly surface: HTMLCanvasElement;
  /** Where the on-screen stick mounts, on coarse pointers only. */
  readonly overlay: HTMLElement;
  readonly floor: readonly FloorRect[];
  readonly spawn: Spawn;
  readonly eyeHeight: number;
  readonly reducedMotion: boolean;
  /** A foot landed. Distance is total ground covered, for choosing the sample. */
  readonly onFootfall?: (distanceM: number, foot: Foot) => void;
  /**
   * The player pressed the action key.
   *
   * There is no click-to-use and no cursor to aim: whatever the hand is already
   * reaching for is what this acts on. The arm is the aim.
   */
  readonly onInteract?: () => void;
  /** Any real user input. Web Audio needs a gesture before it will make sound. */
  readonly onGesture?: () => void;
  /** Pointer lock came or went, so the page can show or hide its hint. */
  readonly onLockChange?: (locked: boolean) => void;
}

export interface ViewerController {
  update(dtSeconds: number): void;
  /** The quiet reset. Eased, per the camera law. */
  recentre(): void;
  /**
   * Put the camera somewhere directly. Exempt from the easing law - the shot
   * harness is not a player - but not from the floor clamp: a frame shot from
   * a pose no one can stand in is not evidence about the room, and the hull is
   * only airtight from inside.
   */
  setPose(pose: PoseRequest): void;
  pose(): Pose;
  spawnPose(): Pose;
  dispose(): void;
}

/** The legend the page prints, kept beside the bindings so it cannot drift. */
export const CONTROL_LEGEND: readonly { readonly keys: string; readonly action: string }[] = [
  { keys: 'W A S D', action: 'walk' },
  { keys: 'mouse', action: 'look - click once, then just move it' },
  { keys: 'arrows', action: 'look, if the mouse will not' },
  { keys: 'space', action: 'use what you are reaching for' },
  { keys: 'R', action: 'recentre' },
  { keys: 'Esc', action: 'release the pointer' },
];

/** Printed instead of the mouse and key lines when the stick is up. */
export const TOUCH_LEGEND: readonly { readonly keys: string; readonly action: string }[] = [
  { keys: 'stick', action: 'walk' },
  { keys: 'drag', action: 'look' },
  { keys: 'tap', action: 'use what you are reaching for' },
];

/**
 * A coarse pointer means a finger, which means no hardware keyboard behind it
 * either. ?touch=1 forces the stick up for harnesses that cannot fake it.
 */
export function coarsePointer(env: Window): boolean {
  if (new URLSearchParams(env.location.search).get('touch') === '1') return true;
  return typeof env.matchMedia === 'function' && env.matchMedia('(pointer: coarse)').matches;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function insideUnion(floor: readonly FloorRect[], x: number, z: number): boolean {
  return floor.some((rect) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ);
}

/**
 * Whether the straight line between two points stays on the floor throughout.
 *
 * This is the honest form of "may the player be moved there": a correction is
 * a slide if the floor is continuous under it and a teleport if it is not.
 * Comparing distance against the step length only ever approximated that, and
 * it got the doorway case backwards.
 */
function walkable(
  floor: readonly FloorRect[],
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): boolean {
  const span = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.max(2, Math.ceil(span / SEGMENT_PROBE_M));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (!insideUnion(floor, fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t)) return false;
  }
  return true;
}

interface Standing {
  readonly x: number;
  readonly z: number;
  readonly floorY: number;
}

/**
 * The nearest point the player may stand, with a wall margin that yields at
 * doorways.
 *
 * Insetting every rectangle by the margin would be wrong: two rooms joined by
 * a 0.2 m overlap would inset into a gap, and the door would stop opening. So
 * each edge is tested before it is inset - if the union continues past it, it
 * is a doorway and keeps its full width; if nothing is beyond it, it is a wall
 * and the margin applies. Clamping x and z independently inside the winning
 * rectangle is what produces the slide along a wall, for free and without a
 * solver.
 *
 * A rectangle that already accepts the point wins outright, and that is not an
 * optimisation. Picking by nearest-clamped-point lets a rectangle the player is
 * LEAVING beat the one they are entering: approaching a seam off the centre
 * line, the wide room behind returns a point 0.2 m back down the corridor, the
 * anti-teleport guard below sees a resolution longer than the step and refuses
 * it, and the player stops dead inside the door recess with the far room in
 * plain sight. Nothing in a screenshot can show this, because setPose does not
 * go through here.
 */
function clampInto(floor: readonly FloorRect[], rect: FloorRect, x: number, z: number): Standing {
  // Never more than half the span, so a narrow rectangle collapses onto its
  // centre line rather than inverting.
  const marginX = Math.min(WALL_MARGIN_M, (rect.maxX - rect.minX) / 2);
  const marginZ = Math.min(WALL_MARGIN_M, (rect.maxZ - rect.minZ) / 2);
  const nearX = clamp(x, rect.minX, rect.maxX);
  const nearZ = clamp(z, rect.minZ, rect.maxZ);

  const lowX = insideUnion(floor, rect.minX - EDGE_PROBE_M, nearZ)
    ? rect.minX
    : rect.minX + marginX;
  const highX = insideUnion(floor, rect.maxX + EDGE_PROBE_M, nearZ)
    ? rect.maxX
    : rect.maxX - marginX;
  const lowZ = insideUnion(floor, nearX, rect.minZ - EDGE_PROBE_M)
    ? rect.minZ
    : rect.minZ + marginZ;
  const highZ = insideUnion(floor, nearX, rect.maxZ + EDGE_PROBE_M)
    ? rect.maxZ
    : rect.maxZ - marginZ;

  return { x: clamp(x, lowX, highX), z: clamp(z, lowZ, highZ), floorY: rect.floorY };
}

function standingPoint(floor: readonly FloorRect[], x: number, z: number): Standing {
  let best: Standing | null = null;
  let bestDistance = Infinity;

  for (const rect of floor) {
    const q = clampInto(floor, rect, x, z);
    // Already legal here: no other rectangle gets to move it.
    if (q.x === x && q.z === z) return q;
    const distance = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = q;
    }
  }

  // An environment with no floor at all still has to be walkable enough to
  // look around from, so the player stays where they were put.
  return best ?? { x, z, floorY: 0 };
}

/** Where one step of a walk actually lands, and whether anything stopped it. */
export interface Advance extends Standing {
  readonly blocked: boolean;
}

/**
 * Resolve one step of a walk against the floor.
 *
 * Exported and pure so a walk can be simulated without a browser. That is not
 * a convenience: the shot harness teleports with setPose, which does not come
 * through here at all, so every defect that only appears while WALKING was
 * invisible to every gate the project had. A test that calls this at 60 Hz is
 * the cheapest honest walk there is.
 */
export function advance(
  floor: readonly FloorRect[],
  x: number,
  z: number,
  stepX: number,
  stepZ: number
): Advance {
  const stepLength = Math.hypot(stepX, stepZ);
  if (stepLength <= 0) return { ...standingPoint(floor, x, z), blocked: false };

  const dirX = stepX / stepLength;
  const dirZ = stepZ / stepLength;
  const aimX = x + stepX;
  const aimZ = z + stepZ;

  // How far a rectangle's clamp may move the aim before it stops being a slide.
  //
  // A wall can stop you and it can hold you off by its margin. It cannot carry
  // you. If the aim is already inside the rectangle the clamp moves it by at
  // most the margin; if the aim is outside but the body was inside, the aim is
  // at most one step out, so the clamp moves it by at most a step plus the
  // margin. Anything beyond that is not a wall acting on this step - it is some
  // other rectangle, somewhere else, projecting the aim onto itself.
  const reach = stepLength + WALL_MARGIN_M;

  // Every rectangle gets to propose where this step lands, and the winner is
  // the one that gets the body FURTHEST FORWARD, not the one whose point is
  // nearest. Nearest is what shipped, and nearest is why a doorway could not be
  // walked through off its centre line: pinned against the end edge of the room
  // behind, that room proposes "stay exactly here", which is a resolution of
  // almost zero and beats every alternative on distance while making no
  // progress at all. The player stands in the recess with the far compartment
  // in plain sight and the key held down. Scoring by progress instead, the
  // doorway's own rectangle proposes a point 0.1 m to the side and a whole step
  // forward, and wins - which is the body turning its shoulders to fit.
  //
  // But progress is only the component along the way you asked to go, and on
  // its own it does not care where the rest of the proposal points. That was
  // the next defect, reported as "in the corridor when I press D I just move
  // back": strafing at the middle of the corridor, the limb deck's rectangle
  // 4.9 m fore clamps the aim onto its own edge, keeps every millimetre of the
  // sideways progress while doing it, ties the corridor's own honest proposal
  // and wins on array order. The cap below then rescaled that 4.9 m vector to
  // one step's length - still pointing fore. Measured: one second of strafing
  // moved the body 1.85 m along the corridor and 0.02 m sideways. Capped, so
  // never a teleport, so never caught by the test that looks for one.
  //
  // `reach` is what makes a proposal a slide rather than a projection.
  let best: Standing | null = null;
  let bestProgress = 1e-6;
  let bestOffset = Infinity;

  for (const rect of floor) {
    const q = clampInto(floor, rect, aimX, aimZ);
    const offset = Math.hypot(q.x - aimX, q.z - aimZ);
    if (offset > reach) continue;
    const progress = (q.x - x) * dirX + (q.z - z) * dirZ;
    if (progress < bestProgress - TIE_M) continue;
    // Ties used to go to whichever rectangle the station happened to push into
    // the array first, which is not a decision anybody made. The proposal that
    // lands nearest what was actually aimed at is.
    if (progress < bestProgress + TIE_M && offset >= bestOffset) continue;
    // A correction is a slide if the floor is continuous under it and a
    // teleport if it is not. Disjoint rectangles can otherwise put a legal
    // point across a gap: a walk may be blocked, it may never teleport.
    if (!walkable(floor, x, z, q.x, q.z)) continue;
    bestProgress = Math.max(bestProgress, progress);
    bestOffset = offset;
    best = q;
  }

  if (best === null) return { ...standingPoint(floor, x, z), blocked: true };

  // The step may be REDIRECTED into the opening but never lengthened by it.
  // Letting the sideways correction ride on top of the forward one is what a
  // teleport looks like when it is small enough to get away with: it covered
  // 17.3 m of a walk that eight seconds of legs can only cover 14.8 m of.
  // Capping the whole displacement at the step means funnelling costs forward
  // progress, which is what turning your shoulders to fit through a door
  // actually costs.
  const span = Math.hypot(best.x - x, best.z - z);
  const t = span > stepLength ? stepLength / span : 1;
  return {
    x: x + (best.x - x) * t,
    z: z + (best.z - z) * t,
    floorY: best.floorY,
    blocked: false,
  };
}

/** Cubic in-out. DIRECTION's ease, the same curve the exterior camera uses. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Shortest signed angle from a to b, so a recentre never takes the long way. */
function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

interface Ease {
  readonly from: Pose;
  readonly to: Pose;
  readonly duration: number;
  elapsed: number;
}

export function createController(options: ControllerOptions): ViewerController {
  const {
    camera,
    surface,
    overlay,
    floor,
    spawn,
    eyeHeight,
    reducedMotion,
    onFootfall,
    onInteract,
    onGesture,
    onLockChange,
  } = options;

  const spawnStand = standingPoint(floor, spawn.position[0], spawn.position[2]);
  const spawnPose: Pose = {
    x: spawnStand.x,
    y: spawnStand.floorY + eyeHeight,
    z: spawnStand.z,
    yaw: spawn.yaw,
    pitch: clamp(spawn.pitch, -PITCH_LIMIT, PITCH_LIMIT),
  };

  let x = spawnPose.x;
  let z = spawnPose.z;
  let floorY = spawnStand.floorY;
  // Derived rather than taken from spawn.position[1]: a pinned screenshot at
  // t = 0 must not land part-way through the eye settling onto the deck.
  let eyeY = spawnPose.y;
  let yaw = spawnPose.yaw;
  let pitch = spawnPose.pitch;

  let velocityX = 0;
  let velocityZ = 0;
  let ease: Ease | null = null;

  const held = new Set<string>();
  let stickX = 0;
  let stickY = 0;

  /** Ground covered on foot, metres. The only thing that drives the gait. */
  let walkDistance = 0;
  /** 0 standing, 1 walking. Eased, so the walk starts and stops like a body. */
  let gaitWeight = 0;
  /**
   * Seconds on the idle clock, for the standing drift.
   *
   * Separate from the walk's distance because breathing happens while the feet
   * are still. Reset by setPose so a pinned frame is reproducible.
   */
  let breathTime = 0;

  const abort = new AbortController();
  const { signal } = abort;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  const applyLook = (dYaw: number, dPitch: number): void => {
    yaw += dYaw;
    pitch = clamp(pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
  };

  /**
   * Fold the walk into the eye.
   *
   * The sway rides the camera's own right vector - (cos yaw, 0, -sin yaw), the
   * same basis the movement above uses - so the body leans across its line of
   * travel no matter which way the head is turned.
   */
  const writeCamera = (): void => {
    const gait = gaitOffsets(walkDistance, gaitWeight, breathTime);
    // Yaw and pitch drift are added to the player's aim rather than replacing
    // it, so the noise never fights the mouse - it rides on top of wherever the
    // player is actually looking.
    euler.set(pitch + gait.pitch, yaw + gait.yaw, gait.roll, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    camera.position.set(
      x + gait.lateral * cosYaw - gait.surge * sinYaw,
      eyeY + gait.bobY,
      z - gait.lateral * sinYaw - gait.surge * cosYaw
    );
  };

  /**
   * Ease the gait in and out with speed.
   *
   * Because rest is the apex of the pendulum, fading the weight out raises the
   * head to standing rather than dropping it - which is the whole point of
   * measuring the bob downward. Stopping settles up.
   */
  const settleGait = (dt: number, speed: number): void => {
    // Head bob is the classic motion-sickness trigger in a first-person game,
    // and Obra Dinn ships a switch for it for that reason. Here the preference
    // the player already set does the asking: reduced motion walks with the eye
    // held level. It still eases rather than snapping, so turning it on
    // mid-stride does not jolt.
    const wanted = reducedMotion ? 0 : clamp(speed / WALK_SPEED_MS, 0, 1);
    gaitWeight += (wanted - gaitWeight) * (dt > 0 ? 1 - Math.exp(-dt / GAIT_TAU_S) : 0);
  };

  // --- Pointer lock, and the drag that works when it is refused. ---

  const locked = (): boolean => document.pointerLockElement === surface;

  document.addEventListener(
    'mousemove',
    (event) => {
      if (!locked() || ease !== null) return;
      applyLook(-event.movementX * LOOK_LOCKED, -event.movementY * LOOK_LOCKED);
    },
    { signal }
  );

  let lookPointer: number | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  /** Set only when the browser has actually refused the lock. */
  let lockRefused = false;

  surface.addEventListener(
    'pointerdown',
    (event) => {
      onGesture?.();
      // Take focus off whatever had it - a rail link, most likely - so the
      // keyboard belongs to the game again. Belt and braces beside the
      // typingTarget fix: even with keys no longer swallowed, focus sitting on
      // a link means space activates the link instead of the player's hand.
      if (document.activeElement instanceof HTMLElement && document.activeElement !== surface) {
        document.activeElement.blur();
      }
      surface.focus({ preventScroll: true });
      if (locked() || lookPointer !== null) return;

      // A mouse takes the lock on the first press and keeps it. Looking is then
      // just moving the mouse, with no button held and no cursor on screen,
      // which is how a first-person game has worked since Quake.
      if (event.pointerType === 'mouse' && !lockRefused) {
        const request = surface.requestPointerLock() as unknown;
        if (request instanceof Promise) {
          request.catch(() => {
            lockRefused = true;
          });
        }
        // AND FALL THROUGH TO START THE DRAG. This used to return here, so
        // drag-look was reachable only once `lockRefused` had been set - and
        // that is set only when requestPointerLock returns a promise AND that
        // promise rejects. Safari returns undefined. Chrome resolves it but can
        // still decline the lock silently, notably during the cooldown right
        // after the player presses Escape, which the legend tells them to do.
        // In any of those cases `locked()` stayed false, `lookPointer` stayed
        // null, and BOTH look paths were dead - permanently, with no way back.
        // Measured: click the canvas, move the mouse 400 px, yaw changes by 0.
        //
        // Reported as "I can't look around", and it is also why the door could
        // not be walked through: the spawn faces 60 degrees off the bow, the one
        // door is behind you, and a player who cannot turn can never reach it.
        // If the lock does arrive, pointerlockchange below drops this drag.
      }

      lookPointer = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      // Capturing while the lock is being granted throws InvalidStateError, and
      // an uncaught throw in a pointerdown handler is a click that half ran.
      // The capture only matters for the drag fallback anyway - under the lock
      // there is no pointer to capture.
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety - it keeps pointermove coming if the cursor
        // leaves the canvas mid-drag. Dragging works without it, so losing the
        // capture must NOT stand the drag down: in the browser where this
        // actually throws, drag-look was the only look the player had left.
      }
    },
    { signal }
  );

  surface.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== lookPointer) return;
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      // The lock owns the look when it is held; this is only the fallback, and
      // applying both would turn at double rate.
      if (locked() || ease !== null) return;
      const rate = event.pointerType === 'mouse' ? LOOK_DRAG : LOOK_TOUCH;
      applyLook(-dx * rate, -dy * rate);
    },
    { signal }
  );

  const endDrag = (event: PointerEvent): void => {
    if (event.pointerId !== lookPointer) return;
    lookPointer = null;
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  };

  surface.addEventListener('pointerup', endDrag, { signal });
  surface.addEventListener('pointercancel', endDrag, { signal });
  // A refused lock is not an error worth showing anyone, but it does mean the
  // next press should fall through to dragging instead of asking again.
  document.addEventListener(
    'pointerlockerror',
    () => {
      lockRefused = true;
    },
    { signal }
  );
  document.addEventListener(
    'pointerlockchange',
    () => {
      if (locked()) {
        lockRefused = false;
        // The lock won; stand the fallback down so the two cannot both turn.
        if (lookPointer !== null) {
          if (surface.hasPointerCapture(lookPointer)) surface.releasePointerCapture(lookPointer);
          lookPointer = null;
        }
      }
      onLockChange?.(locked());
    },
    { signal }
  );
  // The browser said no out loud. Stop asking and leave drag-look to it - one
  // refusal is cheap, one refusal per click is a page that never looks anywhere.
  document.addEventListener(
    'pointerlockerror',
    () => {
      lockRefused = true;
    },
    { signal }
  );

  // --- Keys. Codes, not characters, so WASD stays under the same fingers on
  // a layout where those keys carry different letters. ---

  /**
   * Whether the keyboard belongs to something the player is typing into.
   *
   * This used to include BUTTON and A, and that is the bug that made the game
   * unplayable. The left rail is a list of real <a> links, one per compartment,
   * and clicking one is the most natural first thing anybody does on the page -
   * it is how you pick a room. A clicked link keeps DOM focus, so from that
   * moment every keydown arrived with `event.target` set to the link and was
   * dropped here before it reached `held`. WASD did nothing. The arrow keys did
   * nothing. Drag-look still worked, because that hangs off the canvas's own
   * pointer events and does not care about focus - which is exactly the reported
   * symptom: "I can't look around and I physically can not walk", with the mouse
   * half working.
   *
   * Silent, too. No error, no console output, nothing to see.
   *
   * A link owns ENTER and SPACE. It has never owned W.
   */
  const typingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable);

  /** A focused link or button does own SPACE, and pressing it must not also act. */
  const activatable = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'A');

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingTarget(event.target)) return;
      onGesture?.();
      if (event.code === 'KeyR') {
        recentre();
        return;
      }
      if (event.code === 'Space') {
        // A focused link or button gets its own space bar; taking it here would
        // break the rail for anybody navigating by keyboard.
        if (activatable(event.target)) return;
        // Whatever the hand is already reaching for is what this acts on -
        // there is no cursor and nothing to aim. The page scrolls on space by
        // default, which would move the canvas out from under the player.
        event.preventDefault();
        if (!event.repeat) onInteract?.();
        return;
      }
      held.add(event.code);
      if (event.code.startsWith('Arrow')) event.preventDefault();
    },
    { signal }
  );

  window.addEventListener('keyup', (event) => held.delete(event.code), { signal });
  // A key held across a tab switch never gets its keyup, and a player who
  // comes back walking into a wall is a player who is stuck.
  window.addEventListener('blur', () => held.clear(), { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) held.clear();
    },
    { signal }
  );

  // --- The stick. Mounted only where there is a finger to drive it. ---

  const touch = coarsePointer(window);
  let stick: HTMLElement | null = null;
  let knob: HTMLElement | null = null;

  if (touch) {
    stick = document.createElement('div');
    stick.className = 'rooms-stick';
    stick.setAttribute('aria-hidden', 'true');
    knob = document.createElement('div');
    knob.className = 'rooms-stick-knob';
    stick.appendChild(knob);
    overlay.appendChild(stick);

    let stickPointer: number | null = null;

    const moveKnob = (event: PointerEvent): void => {
      if (stick === null || knob === null) return;
      const box = stick.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const length = Math.hypot(dx, dy);
      const scale = length > STICK_RADIUS_PX ? STICK_RADIUS_PX / length : 1;
      const kx = dx * scale;
      const ky = dy * scale;
      knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      stickX = kx / STICK_RADIUS_PX;
      stickY = -ky / STICK_RADIUS_PX;
    };

    const releaseStick = (event: PointerEvent): void => {
      if (event.pointerId !== stickPointer) return;
      stickPointer = null;
      stickX = 0;
      stickY = 0;
      stick?.classList.remove('is-live');
      if (knob !== null) knob.style.transform = 'translate(-50%, -50%)';
    };

    stick.addEventListener(
      'pointerdown',
      (event) => {
        // The look drag owns the rest of the canvas; both run at once.
        event.stopPropagation();
        event.preventDefault();
        stickPointer = event.pointerId;
        stick?.classList.add('is-live');
        stick?.setPointerCapture(event.pointerId);
        moveKnob(event);
      },
      { signal }
    );
    stick.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerId === stickPointer) moveKnob(event);
      },
      { signal }
    );
    stick.addEventListener('pointerup', releaseStick, { signal });
    stick.addEventListener('pointercancel', releaseStick, { signal });
  }

  // --- The loop. ---

  function recentre(): void {
    ease = {
      from: { x, y: eyeY, z, yaw, pitch },
      to: spawnPose,
      duration: reducedMotion ? RECENTRE_REDUCED_S : RECENTRE_S,
      elapsed: 0,
    };
  }

  const walkInput = (): { forward: number; right: number } => {
    let forward = stickY;
    let right = stickX;
    if (held.has('KeyW')) forward += 1;
    if (held.has('KeyS')) forward -= 1;
    if (held.has('KeyD')) right += 1;
    if (held.has('KeyA')) right -= 1;
    const length = Math.hypot(forward, right);
    if (length > 1) {
      forward /= length;
      right /= length;
    }
    return { forward, right };
  };

  /**
   * Turning on the arrow keys, which nothing can take away.
   *
   * This file used to argue that a second look binding "only splits the habit".
   * That argument assumed the first one works. Pointer lock is a permission, and
   * when a browser declines it there is no mouse look at all - at which point a
   * player is standing in a room unable to turn round, which is what happened.
   * A keyboard path cannot be refused by a policy, an iframe, or an Escape
   * keypress, so it is the one that is always there.
   */
  const lookInput = (): { yaw: number; pitch: number } => {
    let yaw = 0;
    let pitch = 0;
    if (held.has('ArrowLeft')) yaw += 1;
    if (held.has('ArrowRight')) yaw -= 1;
    if (held.has('ArrowUp')) pitch += 1;
    if (held.has('ArrowDown')) pitch -= 1;
    return { yaw, pitch };
  };

  const update = (dtRaw: number): void => {
    const dt = clamp(dtRaw, 0, MAX_DT_S);
    const input = walkInput();

    const look = lookInput();
    if (look.yaw !== 0 || look.pitch !== 0) {
      // Turning cancels a recentre for the same reason walking does: the player
      // asked for the camera, so they get it.
      ease = null;
      applyLook(look.yaw * KEY_LOOK_RATE * dt, look.pitch * KEY_LOOK_RATE * dt);
    }

    if (ease !== null) {
      // Any attempt to walk hands control straight back. Stopping where the
      // camera already is continues the motion; it does not cut.
      if (input.forward !== 0 || input.right !== 0) {
        ease = null;
      } else {
        ease.elapsed += dt;
        const k = easeInOutCubic(clamp(ease.elapsed / ease.duration, 0, 1));
        const stand = standingPoint(
          floor,
          ease.from.x + (ease.to.x - ease.from.x) * k,
          ease.from.z + (ease.to.z - ease.from.z) * k
        );
        x = stand.x;
        z = stand.z;
        floorY = stand.floorY;
        eyeY = ease.from.y + (ease.to.y - ease.from.y) * k;
        yaw = ease.from.yaw + angleDelta(ease.from.yaw, ease.to.yaw) * k;
        pitch = ease.from.pitch + (ease.to.pitch - ease.from.pitch) * k;
        if (ease.elapsed >= ease.duration) ease = null;
        // The recentre glides; nobody is walking it. Let the gait wind down so
        // the eye arrives standing rather than mid-step.
        settleGait(dt, 0);
        breathTime += dt;
        writeCamera();
        return;
      }
    }

    // Yaw 0 looks down -Z; +yaw turns to port of that. Movement is level -
    // pitch aims the eye, never the feet.
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const wantX = (-sinYaw * input.forward + cosYaw * input.right) * WALK_SPEED_MS;
    const wantZ = (-cosYaw * input.forward - sinYaw * input.right) * WALK_SPEED_MS;
    const blend = dt > 0 ? 1 - Math.exp(-dt / WALK_TAU_S) : 0;
    velocityX += (wantX - velocityX) * blend;
    velocityZ += (wantZ - velocityZ) * blend;

    const fromX = x;
    const fromZ = z;
    const advanced = advance(floor, x, z, velocityX * dt, velocityZ * dt);
    x = advanced.x;
    z = advanced.z;
    floorY = advanced.floorY;
    if (advanced.blocked) {
      velocityX = 0;
      velocityZ = 0;
    }

    const settle = dt > 0 ? 1 - Math.exp(-dt / EYE_TAU_S) : 0;
    eyeY += (floorY + eyeHeight - eyeY) * settle;

    // The gait is rolled by ground actually covered, not by the ground asked
    // for. Walk into a wall and the legs stop, which is what a body does; a
    // timed bob would keep marching on the spot.
    const moved = Math.hypot(x - fromX, z - fromZ);
    const before = walkDistance;
    walkDistance += moved;
    settleGait(dt, dt > 0 ? moved / dt : 0);
    breathTime += dt;

    // The step sound is fired by the same number that moved the legs, so it can
    // never drift out of time with them.
    const foot = footfallBetween(before, walkDistance);
    if (foot !== null) onFootfall?.(walkDistance, foot);

    writeCamera();
  };

  writeCamera();

  return {
    update,
    recentre,
    setPose(pose: PoseRequest) {
      ease = null;
      velocityX = 0;
      velocityZ = 0;
      // A shot is taken standing. Zeroing the walk puts the eye at the apex of
      // the gait, which is both the standing pose and the one state that does
      // not depend on how far the harness happened to walk to get here - the
      // frames stay byte-identical run to run.
      walkDistance = 0;
      gaitWeight = 0;
      breathTime = 0;
      const stand = standingPoint(floor, pose.x, pose.z);
      x = stand.x;
      z = stand.z;
      floorY = stand.floorY;
      // A shot may crouch or stand tall; it may not leave the standing band,
      // which is the band the hull was checked airtight over.
      const standingY = floorY + eyeHeight;
      eyeY = pose.y === undefined ? standingY : clamp(pose.y, floorY + 0.3, standingY + 0.6);
      yaw = pose.yaw;
      pitch = clamp(pose.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      writeCamera();
    },
    pose() {
      return { x, y: eyeY, z, yaw, pitch };
    },
    spawnPose() {
      return spawnPose;
    },
    dispose() {
      abort.abort();
      held.clear();
      if (locked()) document.exitPointerLock();
      stick?.remove();
    },
  };
}
