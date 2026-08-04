/**
 * The environment viewer.
 *
 * rooms.html mounts exactly one environment, chosen by URL fragment, and
 * shares nothing with the game: no mission, no PAD, no session state, no
 * import of either. A room is walked and approved on its own here, and the
 * game later mounts the identical module.
 */
import './viewer.css';
import '@fontsource/ibm-plex-mono/400.css';

import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import { DEFAULT_ENVIRONMENT_ID, ENVIRONMENTS, environmentById } from '../registry';
import type { ArmHandle, ArmTarget } from '../player/arm';
import { createArm } from '../player/arm';
import { footfallVoice } from '../player/gait';
import type { SoundHandle } from '../player/sound';
import { createSound } from '../player/sound';
import type { EnvironmentHandle, PointOfInterest } from '../types';
import type { Pose, PoseRequest, ViewerController } from './controller';
import {
  CONTROL_LEGEND,
  NEAR_PLANE_M,
  TOUCH_LEGEND,
  coarsePointer,
  createController,
} from './controller';

/**
 * Interior field of view, degrees. Fixed, and never changed at runtime: the
 * bay's framing - Earth's lit surface across 30-40% of the aperture - is
 * verified at this number, and a zoom would quietly rewrite it.
 */
const INTERIOR_FOV = 62;

/** Metres. The far end of a module and the hardware parked outboard of it. */
const FAR_PLANE_M = 800;

/** A backgrounded tab hands the next frame minutes; the room would jump an orbit. */
const MAX_DT_S = 0.1;

/**
 * An environment that owns its own frame takes it.
 *
 * The window is two passes into one canvas and only the room knows where its
 * aperture is, so a room with a window renders itself: it clears, scissors the
 * exterior, clears depth and draws the interior (docs/ENVIRONMENTS.md). This
 * is structural rather than a change to EnvironmentHandle - a room without a
 * window implements nothing extra and gets the default single pass.
 */
interface SelfRendering {
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void;
}

function selfRendering(handle: EnvironmentHandle): SelfRendering | null {
  const candidate = handle as Partial<SelfRendering>;
  return typeof candidate.render === 'function' ? (candidate as SelfRendering) : null;
}

declare global {
  interface Window {
    groundTrackRooms?: {
      /** True once a mount attempt has settled, whether it built or failed. */
      ready: boolean;
      readonly environments: readonly string[];
      /** The mounted room, or null when nothing built. */
      environment: string | null;
      error: string | null;
      /** Freezes the room's clock so a screenshot is a function of the code. */
      setPaused(paused: boolean): void;
      setTime(seconds: number): void;
      /** Exempt from the camera easing law. Still clamped to the floor. */
      setPose(pose: PoseRequest): void;
      pose(): Pose;
      spawn(): Pose;
      poi(): readonly PointOfInterest[];
      /**
       * Where the eye actually ended up, gait and all.
       *
       * pose() is the stand point - the logical position the floor clamp and
       * the shot harness work in. The rendered camera is that plus the walk's
       * bob, sway and roll, and the two are deliberately different numbers.
       * This is the only way to see the walk from outside the render.
       */
      camera(): { x: number; y: number; z: number; roll: number };
      /** What the hand has hold of, or null. */
      holding(): string | null;
      /** Press what the hand is holding. Returns true if anything happened. */
      interact(): boolean;
      /**
       * Where the hand is, how committed the reach is, and how far the magnets
       * have opened. The reach is two beats that must happen in order and be
       * seen to happen; both are facts about screen position, and this is the
       * only way to check them from outside the render.
       */
      limb(): { x: number; y: number; z: number; open: number; reach: number } | null;
    };
  }
}

function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`Missing #${id}`);
  return found;
}

function main(): void {
  const canvas = element('viewport', HTMLCanvasElement);
  const list = element('rooms-list', HTMLUListElement);
  const legend = element('rooms-legend', HTMLDListElement);
  const status = element('rooms-status', HTMLParagraphElement);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // stencil: three defaults it off since r163. An environment that projects
  // light analytically needs it to guarantee a pixel is lit once and only once
  // - see the shaft material in limbDeck/light.ts. Without it the room still
  // draws, it just double-adds where two patches meet.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Colours are authored, not photographed. No tone mapping, and no bloom.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(PALETTE.VOID_SLATE), 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.VOID_SLATE);

  const camera = new THREE.PerspectiveCamera(INTERIOR_FOV, 16 / 9, NEAR_PLANE_M, FAR_PLANE_M);

  let handle: EnvironmentHandle | null = null;
  let painter: SelfRendering | null = null;
  let controller: ViewerController | null = null;
  /**
   * The player's arm, and the room's points of interest resolved to world
   * vectors once at mount. The arm is parented into the room's own root rather
   * than the viewer's scene, because a self-rendering room draws its root and
   * nothing else - and because the arm should be lit by the room it is in.
   */
  let arm: ArmHandle | null = null;
  let armTargets: ArmTarget[] = [];
  /** Footsteps and the switch click. Silent until the player gestures at the page. */
  const sound: SoundHandle = createSound();
  /** How many footstep samples there are, for choosing one per step. */
  const FOOTSTEP_SAMPLES = 10;

  /**
   * Pose the arm against wherever the camera now is.
   *
   * Called from every path that moves the eye, not just the frame loop: a shot
   * sets a pose and draws immediately, and an arm left over from the previous
   * pose would be reaching at nothing. dt of 0 snaps the reach rather than
   * ramping it, which is what a pinned frame wants.
   */
  const poseArm = (dt: number): void => {
    arm?.update(camera, armTargets, dt);
  };
  /**
   * How far open the limb's couplings were last frame.
   *
   * Both limb sounds are edge-triggered off this with hysteresis - fire the
   * release on the way up past OPENING, the seat on the way down past SEATED -
   * because the reach ramps continuously and a single threshold would chatter
   * every time the player stood at the edge of range. Only the frame loop reads
   * it: setPose snaps the arm outright, and a screenshot must not click.
   */
  let limbOpen = 0;
  const LIMB_OPENING = 0.1;
  const LIMB_SEATED = 0.04;
  /** Last room tone started, so it is only restarted when it actually changes. */
  let roomToneHz: number | undefined;
  /**
   * The `poiRevision` the arm's target list was built from.
   *
   * A single room's points of interest are a fact and can be read once. A
   * station's are a snapshot: rooms come and go under the player, and without
   * this the hand would spend the whole game reaching for controls in the
   * compartment it spawned in - including ones that no longer exist.
   */
  let targetsFrom = -1;

  /**
   * Tell the environment where the eye is, so a station can stream to it.
   *
   * Called from the frame loop AND from setPose and setTime, and that is not
   * belt-and-braces: the screenshot harness pins the clock and drives poses with
   * the loop PAUSED. With this only in the loop, residency stayed wherever the
   * player spawned, and a pinned shot deep in the corridor rendered with the
   * compartment beyond it never built - 18,360 pixels of open space through a
   * doorway, which the airtight gate caught and no amount of walking would have.
   */
  const syncStreaming = (): void => {
    handle?.observe?.(camera.position);
  };

  const refreshTargets = (): void => {
    const revision = (handle as { poiRevision?: number } | null)?.poiRevision;
    if (revision === undefined || revision === targetsFrom) return;
    targetsFrom = revision;
    armTargets =
      handle?.pointsOfInterest
        .filter((poi) => poi.operable === true)
        .map((poi) => ({ id: poi.id, position: new THREE.Vector3(...poi.position) })) ?? [];
  };
  /**
   * The door, edge-triggered the same way. The release fires as the slab starts
   * to move and the seat as it arrives at either end - a door that clunks only
   * when it shuts sounds like it is falling rather than being driven.
   */
  let doorMoving = false;
  let mounted: string | null = null;
  let elapsed = 0;
  let paused = false;
  let last = 0;

  // --- Chrome. Quiet, and printed once. ---

  const setStatus = (line: string): void => {
    status.textContent = line;
  };

  const printLegend = (): void => {
    legend.replaceChildren();
    // A finger has no keyboard behind it and no pointer to lock; printing the
    // key bindings there would be printing a legend for controls that are not
    // in the room. They still work if a keyboard turns up.
    const lines = coarsePointer(window) ? TOUCH_LEGEND : CONTROL_LEGEND;
    for (const line of lines) {
      const keys = document.createElement('dt');
      keys.textContent = line.keys;
      const action = document.createElement('dd');
      action.textContent = line.action;
      legend.append(keys, action);
    }
  };

  const printList = (): void => {
    list.replaceChildren();
    for (const entry of ENVIRONMENTS) {
      const item = document.createElement('li');
      item.className = 'rooms-item';
      if (entry.id === mounted) item.classList.add('is-current');

      const link = document.createElement('a');
      link.href = `#${entry.id}`;
      link.className = 'rooms-link';
      if (entry.id === mounted) link.setAttribute('aria-current', 'page');

      const name = document.createElement('span');
      name.className = 'rooms-name';
      name.textContent = entry.name;
      const note = document.createElement('span');
      note.className = 'rooms-note';
      note.textContent = entry.description;

      link.append(name, note);
      item.append(link);
      list.append(item);
    }
  };

  // --- Mounting. One room at a time, and a broken one takes only itself down. ---

  const unmount = (): void => {
    controller?.dispose();
    controller = null;
    if (arm !== null) {
      arm.root.removeFromParent();
      arm.dispose();
      arm = null;
    }
    armTargets = [];
    if (handle !== null) {
      scene.remove(handle.root);
      handle.dispose();
      handle = null;
    }
    painter = null;
    mounted = null;
  };

  const mount = async (id: string): Promise<void> => {
    unmount();
    printList();
    const entry = environmentById(id);
    if (entry === undefined) {
      setStatus(`${id} · no such environment`);
      if (window.groundTrackRooms !== undefined) {
        window.groundTrackRooms.environment = null;
        window.groundTrackRooms.error = 'unknown environment';
        window.groundTrackRooms.ready = true;
      }
      return;
    }

    setStatus(`${entry.id} · building`);
    try {
      const definition = await entry.load();
      const built = definition.build();
      handle = built;
      painter = selfRendering(built);
      scene.add(built.root);
      controller = createController({
        camera,
        surface: canvas,
        overlay: document.body,
        floor: built.floor,
        spawn: built.spawn,
        eyeHeight: built.eyeHeight,
        reducedMotion,
        onGesture: () => {
          sound.unlock();
          // The room tone can only start once the context is actually running,
          // which is after the gesture, not before it.
          const hz = handle?.machineryHz;
          if (hz !== undefined) sound.roomTone(hz);
        },
        onLockChange: (isLocked) => {
          canvas.classList.toggle('is-looking', isLocked);
          setStatus(isLocked ? `${entry.id} \u00b7 mounted` : `${entry.id} \u00b7 click to look`);
        },
        onFootfall: (distanceM) => {
          // Sample, pitch and level all come from which step it is, so the walk
          // sounds the same on every run and never repeats over a short loop.
          const voice = footfallVoice(distanceM, FOOTSTEP_SAMPLES);
          sound.footstep(voice.index, { rate: voice.rate, gain: voice.gain });
        },
        onInteract: () => {
          // No cursor, no ray, no aiming. Whatever the hand already has hold of
          // is the thing - the arm is the selection.
          const held = arm?.held() ?? null;
          if (held === null) return;
          if (handle?.interact?.(held) === true) sound.switchClick();
        },
      });
      // The arm goes into the room, not into the viewer: a self-rendering room
      // draws its own root, and an arm outside it would simply never appear.
      arm = createArm(reducedMotion);
      built.root.add(arm.root);
      // Operable points only. The hand is the entire interface - no cursor, no
      // highlight, no prompt - so a reach is a promise that pressing space will
      // do something. Feeding it everything the room lists made it drift out and
      // touch the window and the perch in passing, which spends that promise on
      // nothing at all. See `operable` in env/types.ts.
      armTargets = built.pointsOfInterest
        .filter((poi) => poi.operable === true)
        .map((poi) => ({
          id: poi.id,
          position: new THREE.Vector3(...poi.position),
        }));

      mounted = entry.id;
      elapsed = 0;
      built.update(elapsed);
      poseArm(0);
      setStatus(`${entry.id} · mounted`);
      printList();
      if (window.groundTrackRooms !== undefined) {
        window.groundTrackRooms.environment = entry.id;
        window.groundTrackRooms.error = null;
        window.groundTrackRooms.ready = true;
      }
    } catch (error) {
      unmount();
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`${entry.id} · ${message}`);
      console.error(error);
      printList();
      if (window.groundTrackRooms !== undefined) {
        window.groundTrackRooms.environment = null;
        window.groundTrackRooms.error = message;
        window.groundTrackRooms.ready = true;
      }
    }
  };

  // --- The loop. ---

  const draw = (): void => {
    if (painter !== null) {
      painter.render(renderer, camera);
      return;
    }
    // Restored every frame: a room that renders itself will have set these to
    // whatever its two passes needed.
    renderer.autoClear = true;
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
  };

  const frame = (now: number): void => {
    const dt = last === 0 ? 0 : Math.min(MAX_DT_S, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) {
      elapsed += dt;
      syncStreaming();
      // Absolute, never accumulated inside the room: the same time always
      // produces the same frame, and a dropped frame cannot drift the orbit.
      handle?.update(elapsed);
      controller?.update(dt);
      refreshTargets();
      poseArm(dt);
      // The room tone belongs to the compartment the player is standing in, so
      // it is polled rather than set once at mount: walking through a door
      // changes what the station sounds like.
      const hz = handle?.machineryHz;
      if (hz !== roomToneHz) {
        roomToneHz = hz;
        sound.roomTone(hz ?? 0);
      }
      const mechanism = handle?.mechanism;
      if (mechanism !== undefined) {
        sound.doorMotor(mechanism.speed);
        const moving = mechanism.speed > 0.02;
        if (moving && !doorMoving) sound.doorClunk('release');
        if (!moving && doorMoving) sound.doorClunk('seat');
        doorMoving = moving;
      }
      const limb = arm?.state();
      if (limb !== undefined) {
        const before = limbOpen;
        limbOpen = limb.open;
        if (before <= LIMB_OPENING && limbOpen > LIMB_OPENING) sound.limbRelease();
        else if (before > LIMB_SEATED && limbOpen <= LIMB_SEATED) sound.limbSeat();
      }
    }
    draw();
    requestAnimationFrame(frame);
  };

  const resize = (): void => {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  window.addEventListener('resize', resize);
  window.addEventListener('hashchange', () => {
    const id = window.location.hash.replace(/^#/, '') || DEFAULT_ENVIRONMENT_ID;
    if (id !== mounted) void mount(id);
  });

  window.groundTrackRooms = {
    ready: false,
    environments: ENVIRONMENTS.map((entry) => entry.id),
    environment: null,
    error: null,
    setPaused(value: boolean) {
      paused = value;
    },
    setTime(seconds: number) {
      elapsed = seconds;
      syncStreaming();
      handle?.update(elapsed);
      refreshTargets();
      poseArm(0);
      draw();
    },
    setPose(pose: PoseRequest) {
      controller?.setPose(pose);
      // Residency follows the eye, not the clock, so a pinned pose has to settle
      // the station before anything is drawn from it.
      syncStreaming();
      handle?.update(elapsed);
      refreshTargets();
      poseArm(0);
      draw();
    },
    pose() {
      return controller?.pose() ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    },
    spawn() {
      return controller?.spawnPose() ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    },
    poi() {
      return handle?.pointsOfInterest ?? [];
    },
    camera() {
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      return { x: camera.position.x, y: camera.position.y, z: camera.position.z, roll: euler.z };
    },
    holding() {
      return arm?.held() ?? null;
    },
    interact() {
      const held = arm?.held() ?? null;
      if (held === null) return false;
      const acted = handle?.interact?.(held) === true;
      if (acted) sound.switchClick();
      return acted;
    },
    limb() {
      const state = arm?.state();
      if (state === undefined) return null;
      return {
        x: state.hand.x,
        y: state.hand.y,
        z: state.hand.z,
        open: state.open,
        reach: state.reach,
      };
    },
  };

  printLegend();
  printList();
  resize();
  requestAnimationFrame(frame);

  const initial = window.location.hash.replace(/^#/, '') || DEFAULT_ENVIRONMENT_ID;
  void mount(initial);
}

main();
