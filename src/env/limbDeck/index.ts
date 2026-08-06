/**
 * THE LIMB DECK.
 *
 * A 6.4 m pressurised module with a faceted cupola in the port hull. The
 * station keeps its belly to Earth, so the sun walks the length of the deck once
 * per revolution: beams born on the aft bulkhead at orbital sunrise, walking it
 * down, crossing the deck, and dying up the forward bulkhead ninety-three
 * minutes later. That is the game's existing grazing-key rig - the one that
 * fractures the low-poly Earth into separable facet values - pointed at a
 * ceiling.
 *
 * This module only assembles. The shell, the fixtures, the light rig and the
 * window each own their own geometry and their own reasons; what happens here
 * is that one orbital sample per frame is turned into one Frame and handed to
 * every animator, so nothing in the room can be looking at a different second
 * than anything else. See docs/ENVIRONMENTS.md for the specification.
 */
import * as THREE from 'three';
import { LIMB_DECK_GEOMETRY, LIMB_DECK_GEOMETRY_REDUCED, sampleOrbit } from '../orbit';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, port } from '../station/ports';
import { solid } from '../kit/solids';
import { BUTTON_POSITION, createTestButton } from './testButton';
import { createMotes } from './motes';
import {
  BULKHEAD_X,
  DOOR_BUTTON,
  DOOR_BUTTON_AFT,
  DOOR_FULL_RATE_S,
  SEAM_X,
  createDoor,
  doorParts,
  leafLift,
} from './door';
import type { Frame } from './contract';
import { buildExterior } from './exterior';
import { IMPELLER_BLADES, IMPELLER_HZ, IMPELLER_VISUAL_GEARING, buildFixtures } from './fixtures';
import { buildLighting } from './light';
import { buildShell, hullClearance } from './shell';

/**
 * Eye height above the deck, metres.
 *
 * Chosen by the framing, not by anthropometry, because the framing is the thing
 * DIRECTION.md legislates. The perch and the hull's own curve stop the player
 * about a metre off the glass, and from there the view pane spans elevations
 * that put the limb, which sits a fixed 19.8 degrees below horizontal at
 * 400 km, some fraction of the way up the opening. At 1.74 m Earth holds 36 per
 * cent of the view pane, inside the 30-40 docs/ENVIRONMENTS.md asks for; drop
 * the eye and the pane rises until the limb leaves the bottom of it altogether.
 * It is a tall crew member and it is the number that makes the window a window.
 */
const EYE_HEIGHT = 1.74;

/**
 * The walkable deck. docs/ENVIRONMENTS.md: x in [-3.10, +3.10], z in the exact
 * chord at deck height, +/-1.757. The viewer holds a margin of twice the near
 * plane off every outer edge (controller.ts), which is what guarantees the eye
 * can never cross a hull facet and let the exterior pass show through the wall.
 */
const DECK: FloorRect = { minX: -3.1, maxX: 3.1, minZ: -1.757, maxZ: 1.757, floorY: 0 };

/**
 * Spawn: x = -2.6 on the centreline, facing forward and to port so the cupola
 * sits left of centre and the beams are a metre aft of the perch, moving toward
 * it. Yaw 0 looks down -Z (port), and -90 degrees looks along +X (fore), so 30
 * degrees to port of fore is -60. The orbital phase is pinned 25 seconds short
 * of local noon in orbit.ts, which is why the first frame is the strong one.
 */
const SPAWN_YAW = -60 * (Math.PI / 180);
/** Just off the horizon: the deck and its shaft in the lower frame, the arc above. */
const SPAWN_PITCH = -0.08;

const POINTS_OF_INTEREST: readonly PointOfInterest[] = [
  { id: 'bay', label: 'the cupola', position: [-0.58, 1.42, -2.55] },
  { id: 'perch', label: 'the perch', position: [-0.6, 0.72, -1.82] },
  // The door itself is not operable; its BUTTON is. Reaching for a two-metre
  // pressure slab and having it open is a different and worse promise than
  // pressing the thing that opens it.
  { id: 'door-button', label: 'the aft door control', position: DOOR_BUTTON, operable: true },
  // The same door, from the corridor. A door you can only open from one side is
  // a door that works in every screenshot and strands you in the run outside it.
  {
    id: 'door-button-aft',
    label: 'the aft door control',
    position: DOOR_BUTTON_AFT,
    operable: true,
  },
  { id: 'dial', label: 'the sun-bearing dial', position: [-3.19, 1.05, -0.85] },
  { id: 'grille', label: 'the ventilation grille', position: [3.16, 1.05, -1.62] },
  // Wired to nothing, and the only operable thing in the room: the hand reaches
  // for this and for nothing else, because it is the only place a reach could
  // be honoured. See testButton.ts, and `operable` in types.ts.
  { id: 'test-button', label: 'the test button', position: BUTTON_POSITION, operable: true },
];

/**
 * Whether the viewer is honouring prefers-reduced-motion.
 *
 * Read once, at build time, and never at frame time: an animator that asked a
 * media query per frame would be reading something outside the Frame, and a
 * preference that changed mid-session would break the harness's promise that
 * the same time renders the same pixels.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A room that owns its own frame. Declared structurally on both sides rather
 * than added to EnvironmentHandle - the viewer looks for exactly this shape
 * (SelfRendering, viewer/main.ts) and a room without a window implements
 * nothing extra and gets the default single pass.
 */
interface SelfRenderingHandle extends CompartmentHandle {
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void;
  paint(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
}

/**
 * The one seam this room offers, aft, where the lift door already is.
 *
 * The door, its pocket and its capped sleeve were built for this before there
 * was anything to put behind them, so the port sits at the sleeve's far end
 * rather than at the bulkhead: everything between the two belongs to this room
 * and always did.
 */
const PORTS = [port('aft', [SEAM_X, SEAM.height / 2, 0], '-x', 0)] as const;

/**
 * Where the room ends, for layout. The hull is a 2.1 m cylinder about y = 1.15,
 * plus the aft sleeve, plus the cupola standing off the port skin.
 */
const EXTENT = {
  minX: SEAM_X,
  maxX: 3.35,
  minY: -0.1,
  maxY: 3.3,
  minZ: -2.85,
  maxZ: 2.25,
} as const;

function buildLimbDeck(): SelfRenderingHandle {
  const reducedMotion = prefersReducedMotion();
  // Reduced motion stretches the umbral step from 0.2 s to 1.5 s. It stays a
  // function of geometry - the step is widened in tangent height, not eased in
  // time - so the clock is picked here once rather than branched on per frame.
  const geometry = reducedMotion ? LIMB_DECK_GEOMETRY_REDUCED : LIMB_DECK_GEOMETRY;

  /**
   * The room is its own scene, and that is structural rather than tidy.
   *
   * The window is two passes into one canvas and the interior is the second of
   * them. three.js clears the colour buffer for any scene carrying a background
   * - autoClear or not - so an interior drawn into the viewer's scene would
   * repaint VOID_SLATE over the exterior pass before laying down a triangle.
   * A Scene with a null background is the object that does not do that.
   */
  const root = new THREE.Scene();
  root.name = 'limb-deck';
  root.background = null;

  const shell = buildShell();
  const fixtures = buildFixtures();
  const lighting = buildLighting(shell.apertures, shell.throat, shell.deckY);
  const exterior = buildExterior(shell.apertures, geometry);
  const testButton = createTestButton();
  // Dust hangs in whatever the lighting rig says the beam is doing, so it is
  // built from the same throat the shaft is projected through.
  const motes = createMotes(shell.throat);
  const door = createDoor();
  /** Published for the audio layer; see `mechanism` in env/types.ts. */
  const mechanism = { travel: 0, speed: 0 };
  let lastTravel = 0;
  let lastTime = 0;
  root.add(shell.root, fixtures.root, lighting.root, testButton.root, motes.root, door.root);

  return {
    root,
    spawn: {
      position: [-2.6, DECK.floorY + EYE_HEIGHT, 0],
      yaw: SPAWN_YAW,
      pitch: SPAWN_PITCH,
    },
    floor: [DECK],
    pointsOfInterest: POINTS_OF_INTEREST,
    eyeHeight: EYE_HEIGHT,
    ports: PORTS,
    extent: EXTENT,
    /**
     * The door, as boxes, for the geometry checks in tests/rooms.test.ts.
     *
     * An honest partial: the hull, the deck, the cupola and the fixtures are not
     * declared, because they are curves, lathes and instanced dot matrices that
     * no box describes. The door is here because the door is where every one of
     * this project's geometry defects actually happened, and because it is the
     * piece that moves - `lifts` is what lets the checks run against the open
     * state, which no screenshot had ever shown.
     */
    solids: doorParts().map((part) =>
      solid(
        `door/${part.name}`,
        part.material,
        part.x0,
        part.x1,
        part.y0,
        part.y1,
        part.z0,
        part.z1,
        part.leaf
      )
    ),
    lifts: [0, 1, 2].map(leafLift),
    /**
     * The pressure vessel: a 2.1 m cylinder about y = 1.15, open aft into the
     * door's sleeve. Anything the room builds has to be inside this, and the
     * sleeve has to be exempt because it is deliberately outside the cylinder -
     * it is the tunnel through the bulkhead.
     */
    contains(point: THREE.Vector3): number {
      if (point.x < -3.15) return 1;
      return hullClearance(point.y, point.z);
    },

    /** The aft sleeve's cap comes out when something is attached behind it. */
    sealPort(portId: string, sealed: boolean): void {
      if (portId === 'aft') door.seal(sealed);
    },

    /**
     * The aft door, so the station knows not to let anyone walk through it
     * while it is shut. The plane sits BULKHEAD_X, and the port is at the far
     * end of the sleeve at SEAM_X, so the door is that much inside the room.
     */
    portDoor(portId: string) {
      if (portId !== 'aft') return undefined;
      return { open: door.travel(), inset: BULKHEAD_X - SEAM_X };
    },

    summonPort(portId: string, near: boolean): void {
      if (portId === 'aft') door.summon(near);
    },
    // Blade pass: speed x blades, at the impeller's REAL rate rather than the
    // geared-down one it is drawn at (see IMPELLER_VISUAL_GEARING). 117.6 Hz -
    // a low hum, which is what a ventilation duct sounds like.
    machineryHz: IMPELLER_HZ * IMPELLER_BLADES * IMPELLER_VISUAL_GEARING,
    mechanism,

    update(tSeconds: number): void {
      // One clock read per frame, shared by everything that moves. The orbital
      // sample is the expensive half and the only half that could disagree
      // with itself: two animators sampling the same second separately is how
      // the shaft ends up lit by a sun the dial is not pointing at.
      const frame: Frame = { t: tSeconds, orbit: sampleOrbit(tSeconds, geometry), reducedMotion };
      shell.update(frame);
      fixtures.update(frame);
      lighting.update(frame);
      // After the lighting, never before: the beam it publishes is this frame's.
      motes.setBeam(lighting.beam.travel, lighting.beam.strength);
      motes.update(frame);
      exterior.update(frame);
      testButton.update(frame);
      door.update(frame);
      // Speed from the slab's own travel rather than from the clock, so the
      // motor cannot be heard running while the door is standing still.
      const dt = Math.max(1e-4, Math.min(0.1, frame.t - lastTime));
      lastTime = frame.t;
      const now = door.travel();
      mechanism.speed = Math.min(1, (Math.abs(now - lastTravel) / dt) * DOOR_FULL_RATE_S);
      mechanism.travel = now;
      lastTravel = now;
    },

    interact(id: string): boolean {
      // One operable thing in this room so far, and it is deliberately inert.
      if (id === 'test-button') return testButton.press();
      if (id === 'door-button' || id === 'door-button-aft') return door.press();
      return false;
    },

    /**
     * The room draws itself, because only the room knows where its hole is.
     * The viewer calls this instead of its own single pass when a mounted
     * environment offers it - see SelfRendering in viewer/main.ts.
     */
    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
      exterior.render(renderer, root, camera);
    },

    /**
     * The same two passes, painting space behind a scene that is not this room.
     *
     * Inside a station this room is not the only thing on screen, but it is the
     * only thing with a window, and the exterior pass begins by clearing the
     * whole canvas. So it paints space and then draws whatever it was handed -
     * the entire station - rather than drawing itself and erasing its
     * neighbours. See `Painter` in station/compartment.ts.
     */
    paint(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera
    ): void {
      exterior.render(renderer, scene, camera);
    },

    dispose(): void {
      exterior.dispose();
      lighting.dispose();
      motes.dispose();
      fixtures.dispose();
      shell.dispose();
      testButton.dispose();
      door.dispose();
      root.clear();
    },
  };
}

export const LIMB_DECK: EnvironmentDefinition = {
  id: 'limb-deck',
  name: 'THE LIMB DECK',
  description: 'A 6.4 m module with a faceted cupola in the port hull.',
  build: buildLimbDeck,
};

/**
 * The same room, as a piece of the station.
 *
 * Two exports rather than one because both uses are real and neither is a
 * subset of the other: `LIMB_DECK` is what `rooms.html` mounts to look at this
 * place on its own, which is how environments get reviewed and approved, and
 * this is what the station lays out. They build the identical handle.
 */
export const LIMB_DECK_COMPARTMENT: CompartmentDefinition = {
  id: 'limb-deck',
  name: 'THE LIMB DECK',
  description: 'A 6.4 m module with a faceted cupola in the port hull.',
  ports: PORTS,
  extent: EXTENT,
  build: buildLimbDeck,
};

export default LIMB_DECK;
