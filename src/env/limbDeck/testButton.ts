/**
 * A button that does nothing.
 *
 * It exists so the whole interaction loop can be felt end to end before there
 * is any game behind it: walk up, the arm reaches on its own, press space, the
 * cap goes in, the ring steps to a brighter value, a switch clicks, and it
 * springs back. Nothing else happens, on purpose. If that sequence feels right
 * the loop is right, and every real control can be built against it.
 *
 * It "lights up" the only way this project allows. DIRECTION bans glow at any
 * intensity and there is no bloom anywhere, so the ring is not a lamp - it is a
 * flat facet that changes VALUE, HULL_SHADOW at rest and MINT when live. That
 * reads as illumination for the same reason the rest of the room does: the
 * material stepped, not because light bled past its own edges.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { Animated, Frame } from './contract';
import { hullMountAt } from './shell';

/**
 * Station and height on the starboard skin. The z is NOT written down here:
 * the hull is a curve and the shell owns it, so the plate is seated by asking
 * where the wall is (hullMountAt) rather than by a number typed alongside it.
 * An earlier build did type it, and put the button half a metre out in the
 * middle of the deck with nothing behind it.
 */
const BUTTON_X = 2.15;
/**
 * Height above the deck. Set by where it lands in the frame, not by where a
 * control panel sits on a wall: the eye is at 1.74 m and a body stops about
 * 0.6 m off the skin, so a plate at chest height is 40 degrees down from the
 * horizon and the player is staring at their own feet to press it. At 1.5 m the
 * look-down is 22 degrees, which is a glance.
 */
const BUTTON_Y = 1.5;
const MOUNT = hullMountAt(BUTTON_X, BUTTON_Y, 1);

/**
 * How far the plate is let into the skin, metres.
 *
 * The plate is flat and the hull is not: across 0.21 m of a 2.1 m radius the
 * skin falls 2.6 mm away from the tangent plane, so a plate seated exactly on
 * the surface stands off it at the corners and the wall shows through behind.
 * Sinking the whole fitting past the worst of that buries the back face in
 * structure everywhere, which is how a real panel is let into a pressure wall.
 */
const SINK_M = 0.006;

/** Where the cap sits, metres. Read by the room for the point of interest. */
export const BUTTON_POSITION: readonly [number, number, number] = [
  MOUNT.position.x + MOUNT.inward.x * 0.03,
  MOUNT.position.y + MOUNT.inward.y * 0.03,
  MOUNT.position.z + MOUNT.inward.z * 0.03,
];

/** How far the cap travels when pressed, metres. */
const THROW_M = 0.011;

/** Press and release times, seconds. Down is fast, up is slower - like a real switch. */
const PRESS_S = 0.06;
const RELEASE_S = 0.22;

export interface TestButtonHandle extends Animated {
  /** Push it. Returns false if it is already down, so a held key cannot machine-gun. */
  press(): boolean;
  /** True while the cap is travelling or held in. */
  isDown(): boolean;
}

export function createTestButton(): TestButtonHandle {
  const root = new THREE.Object3D();
  root.name = 'test-button';
  // Seated in the skin and looking across the deck. Everything below is built
  // along local +Z, which lookAt aims down the inward normal - so the same code
  // seats a fitting anywhere on the shell without a hand-worked rotation.
  root.position.copy(MOUNT.position).addScaledVector(MOUNT.inward, -SINK_M);
  root.lookAt(root.position.clone().add(MOUNT.inward));

  /**
   * Lit fittings carry the same NIGHT_SIDE emissive floor as the rest of the
   * interior (interiorMaterial, shell.ts). Without it these four surfaces are
   * the only ones in the room with nothing under them, and they fall through
   * the palette's darkest value the moment the station enters eclipse.
   */
  const lit = (colour: string): THREE.MeshLambertMaterial =>
    new THREE.MeshLambertMaterial({
      color: new THREE.Color(colour),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    });

  const plateMaterial = lit(PALETTE.HULL_SHADOW);
  const capMaterial = lit(PALETTE.HULL);
  // The machined rim that separates the fitting from the panel it is let into.
  // Without it the plate is a HULL_SHADOW square on a HULL_SHADOW wall and the
  // whole control disappears into the hull from more than a metre away.
  const rimMaterial = lit(PALETTE.HULL);
  // Two flat materials, swapped. Not one material brightened: a value step is a
  // different surface, and that is the whole visual language of this room.
  //
  // Dark is a RECESS - materially below the plate around it, the same trick the
  // cupola's pane reveal uses - rather than the plate's own value. A state light
  // whose off state is invisible has one state.
  const ringDark = lit(
    `#${new THREE.Color(PALETTE.HULL_SHADOW).multiplyScalar(0.72).getHexString()}`
  );
  /**
   * The live ring takes no diffuse light at all.
   *
   * This is the lamp diffuser's rule (shell.ts) and it is here for the same
   * reason. Lit MINT plus a MINT emissive term rendered at 255,255,247 across
   * eight thousand pixels the moment the button was pressed in sunlight - blown
   * white, in a game whose palette has no white and no bloom. Held at black with
   * the whole value in emissive it renders as exactly MINT from every pose at
   * every point in the orbit, which is what a state light does: it does not get
   * brighter because the sun came up.
   *
   * The four pinned screenshots never caught it, because none of them is
   * standing at the button with it pressed. That is a hole in the gate, not a
   * reason to trust the gate.
   */
  const ringLive = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x000000),
    flatShading: true,
    emissive: new THREE.Color(PALETTE.MINT),
    emissiveIntensity: 1,
  });

  // Backplate, sunk into the hull.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.21, 0.022), plateMaterial);
  plate.position.z = 0.011;
  root.add(plate);

  // The rim. One value up from the plate, so the fitting has an edge.
  const rimGeometry = new THREE.RingGeometry(0.098, 0.118, 32);
  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.position.z = 0.0225;
  root.add(rim);

  // The ring is the state, and it is deliberately wider than the gripper that
  // presses the cap: a state light you cover with your own hand at the exact
  // moment you change it is not feedback. The hand spans 56 mm across the palm
  // and this sits outside 86, so the step is always in clear air.
  const ringGeometry = new THREE.RingGeometry(0.086, 0.104, 32);
  const ring = new THREE.Mesh(ringGeometry, ringDark);
  ring.position.z = 0.023;
  root.add(ring);

  // The cap. Eight sides, to sit with the rest of the room's faceting.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.041, 0.026, 8), capMaterial);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.03;
  root.add(cap);

  const capRestZ = cap.position.z;

  /** 0 fully out, 1 fully in. */
  let travel = 0;
  let pressing = false;
  let lastT = 0;
  let started = false;

  return {
    root,

    press() {
      if (pressing || travel > 0.001) return false;
      pressing = true;
      return true;
    },

    isDown() {
      return travel > 0.5;
    },

    update(frame: Frame) {
      // The room hands out absolute time; the spring needs an interval. Deriving
      // it here keeps update() a pure function of the Frame, which is what the
      // shot harness relies on.
      const dt = started ? Math.max(0, Math.min(0.1, frame.t - lastT)) : 0;
      lastT = frame.t;
      started = true;

      if (pressing) {
        travel += dt / PRESS_S;
        if (travel >= 1) {
          travel = 1;
          pressing = false;
        }
      } else if (travel > 0) {
        travel = Math.max(0, travel - dt / RELEASE_S);
      }

      cap.position.z = capRestZ - THROW_M * travel;
      ring.material = travel > 0.5 ? ringLive : ringDark;
    },

    dispose() {
      plate.geometry.dispose();
      rimGeometry.dispose();
      ringGeometry.dispose();
      cap.geometry.dispose();
      plateMaterial.dispose();
      rimMaterial.dispose();
      capMaterial.dispose();
      ringDark.dispose();
      ringLive.dispose();
    },
  };
}
