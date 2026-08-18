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
 */
function standingPoint(floor: readonly FloorRect[], x: number, z: number): Standing {
  let best: Standing | null = null;
  let bestDistance = Infinity;

  for (const rect of floor) {
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

    const qx = clamp(x, lowX, highX);
    const qz = clamp(z, lowZ, highZ);
    const distance = (qx - x) * (qx - x) + (qz - z) * (qz - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: qx, z: qz, floorY: rect.floorY };
    }
  }

  // An environment with no floor at all still has to be walkable enough to
  // look around from, so the player stays where they were put.
  return best ?? { x, z, floorY: 0 };
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
      if (locked() || lookPointer !== null) return;

      // A mouse takes the lock on the first press and keeps it. Looking is then
      // just moving the mouse, with no button held and no cursor on screen,
      // which is how a first-person game has worked since Quake. Drag-look used
      // to be reachable here and it taught the wrong habit - hold to turn - so
      // it is now only what happens when the lock is genuinely unavailable.
      if (event.pointerType === 'mouse' && !lockRefused) {
        const request = surface.requestPointerLock() as unknown;
        if (request instanceof Promise) {
          request.catch(() => {
            lockRefused = true;
          });
        }
        return;
      }

      lookPointer = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      surface.setPointerCapture(event.pointerId);
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
      if (ease !== null) return;
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
      if (locked()) lockRefused = false;
      onLockChange?.(locked());
    },
    { signal }
  );

  // --- Keys. Codes, not characters, so WASD stays under the same fingers on
  // a layout where those keys carry different letters. ---

  const typingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.tagName === 'BUTTON' || target.tagName === 'A' || target.isContentEditable);

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

  const update = (dtRaw: number): void => {
    const dt = clamp(dtRaw, 0, MAX_DT_S);
    const input = walkInput();

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

    const stepX = velocityX * dt;
    const stepZ = velocityZ * dt;
    const stand = standingPoint(floor, x + stepX, z + stepZ);
    const stepLength = Math.hypot(stepX, stepZ);
    const resolved = Math.hypot(stand.x - x, stand.z - z);
    // Disjoint rectangles can put the nearest legal point across a gap. A walk
    // may be blocked; it may never teleport.
    const fromX = x;
    const fromZ = z;
    if (resolved <= stepLength + 1e-6) {
      x = stand.x;
      z = stand.z;
      floorY = stand.floorY;
    } else {
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
