/**
 * THE LIMB DECK - the pressure shell.
 *
 * Everything the room is physically made of and none of what moves: the
 * half-cylinder hull, the deck, the two bulkheads, the four standoff channels,
 * and the cupola. It is also the single source of truth for the Apertures - the
 * lighting rig projects a shaft through every pane and the exterior pass
 * scissors to their union, and both read the pane corners from here rather than
 * deriving their own.
 *
 * Numbers come from docs/ENVIRONMENTS.md. Where that file's arithmetic does not
 * close, the reading taken is recorded at the constant.
 */
import * as THREE from 'three';
import { fbm } from '../../render/noise';
import { panelWear } from '../kit/bands';
import { PALETTE } from '../../render/palette';
import {
  facetColour,
  interiorMaterial as meshInteriorMaterial,
  nth,
  pushFacet,
  pushQuad,
  type Sink,
  toGeometry,
} from '../kit/mesh';
import { LIMB_DECK_ORBIT, sunDirection } from '../orbit';
import { LIGHT_INTENSITY, bakedParts } from '../blender/loader';
import type { Aperture, Frame, ShellHandle } from './contract';

const DEG = Math.PI / 180;

/** Inner radius of the pressure shell. */
const RADIUS = 2.1;
/** Height of the cylinder axis above the deck; the crown clears 3.25 m. */
const AXIS_Y = 1.15;
/** Bulkhead planes, aft and fore. */
const HALF_LENGTH = 3.2;

/**
 * Where the shell meets the deck plane: acos(-AXIS_Y / RADIUS), 123.199 deg
 * off zenith. The deck's z extent is the chord at that angle, +/-1.757 m, so
 * the deck edge and the hull edge are the same line and the room closes.
 * Theta is signed: positive to starboard (+Z), negative to port (-Z).
 */
const THETA_MAX = Math.acos(-AXIS_Y / RADIUS);
const HALF_CHORD = RADIUS * Math.sin(THETA_MAX);

/**
 * The hull facet grid. ENVIRONMENTS.md asks for "32 circumferential x 16 axial
 * = 384 quads", which does not close - 32 x 16 is 512. The total is the number
 * the spec leans on twice ("those 384 facets stepping in value in a slow arc
 * overhead are the point of the room"), so 384 and the 16 axial bays are held
 * and the circumferential count comes out at 24. That also lands the facets
 * near square, 0.376 x 0.400 m, which is what lets them read as separable
 * facets under a grazing sun instead of as long ribbons.
 */
const CIRC_SEGMENTS = 24;
const AXIAL_SEGMENTS = 16;

/** Ceiling arc down to the upper standoffs is HULL; below them, HULL_SHADOW. */
const STANDOFF_THETA = 45 * DEG;

/** Deck plate: the walkable 6.20 x 3.51 m, in a 16 x 8 panel grid. */
const DECK_HALF_X = 3.1;
const DECK_PANELS_X = 16;
const DECK_PANELS_Z = 8;
/** Half a hairline seam. The base plate below shows through as a HULL line. */
const DECK_SEAM = 0.003;
const DECK_WARP = 0.003;
/** The warp tapers out over this distance so the deck perimeter stays exactly
 *  on the chord; a 3 mm gap at the hull junction is a hole into space. */
const DECK_WARP_TAPER = 0.32;
/** The continuous plate under the panels, showing through the seams. */
const DECK_BASE_DROP = 0.006;

/**
 * Structural laps. The interior has to be airtight from every reachable eye
 * position: the exterior pass clears depth before the room is drawn, so any
 * seam a ray slips through shows space through the hull. Every lap here is
 * oriented so that an escaping ray meets a front face, never the back of one -
 * a back-facing lap is culled and seals nothing.
 */
const DECK_OVERHANG = 0.025;
const BULKHEAD_LAP = 0.03;
const BULKHEAD_SKIRT = 0.06;

/**
 * The hole in the aft bulkhead the lift door stands in.
 *
 * Owned here rather than by the door, because the pressure vessel decides where
 * it may be opened; the door is what gets fitted into the result. Exported so
 * the door's coaming, jamb and slab are all built off the same four numbers -
 * a doorway and a door sized independently is a doorway with a draught.
 */
export const AFT_DOORWAY = { minY: -0.02, maxY: 2.12, minZ: -0.59, maxZ: 0.59 } as const;

/*
 * THE CUPOLA
 *
 * A single pane aimed at the limb admits no sunlight, and that is geometry
 * rather than tuning. The sun rides a cone about +Z - cross-track - of
 * half-angle 90 - beta = 52 degrees (src/env/orbit.ts), so it is permanently to
 * port and it swings ram - zenith - aft - nadir once per revolution. A pane
 * canted down at the limb stands 64 to 67 degrees off that sun for most of the
 * pass, and half a metre of throat at that incidence walks the beam clean past
 * an aperture three quarters of a metre tall.
 *
 * The fix is the one the real Cupola is: a faceted dome. Six side facets are
 * placed with their normals ON the sun's own cone - each one is exactly
 * sun-normal at one orbital phase and its neighbours pick up the phases between
 * - so whatever the sun is doing, something in the dome is looking at it. The
 * phases below are spread over the sunlit pass with the sixth aimed at local
 * midnight, which is nadir, which is Earth: that facet is the earthshine face
 * and it is the one that carries eclipse.
 *
 * Measured over a full revolution: the best-facing facet never falls below
 * cos 0.94 anywhere in sunlight, five or six of the seven panes stand facing
 * the sun at any moment, together passing 0.83 to 1.35 square metres of
 * aperture through the dome's own throat, and the beams walk the aft bulkhead
 * down, the length of the deck, and the forward bulkhead up. That walk is the
 * room.
 */
const CUPOLA_CENTRE_X = -0.6;
/**
 * Where the dome meets the hull. The band is fenced above and below by hardware
 * this module does not own: the port standoff channel runs -41.3 to -48.7
 * degrees and the port handrails sit at -96, so the cut lives inside
 * [-92.6, -57] and the dome is sized to fit between them.
 */
const CUPOLA_CENTRE_THETA = -76 * DEG;
/**
 * Orbital phase each side facet faces dead-on. Sun direction at phase phi is
 * s(phi) = (-cos B sin phi, cos B cos phi, -sin B), and the facet normal IS
 * that vector - which is why these are phases and not angles off some axis.
 * 260/310/0/50/100 walk the sunlit pass at 50-degree steps; 180 is local
 * midnight, so it looks at nadir and sees Earth.
 */
const FACET_PHASES = [260, 310, 0, 50, 100, 180].map((d) => d * DEG);
/**
 * Distance from the dome's centre line to each facet plane, measured in the
 * collar plane. Wide fore and aft where the 6.4 m module has room, tight top
 * and bottom where the standoff and the handrails fence the arc in.
 */
const FACET_APOTHEM = [1.05, 1.08, 0.82, 1.08, 1.05, 0.64];
/** How far the collar plane stands off the hull. The dome sits on a ring. */
const COLLAR_LIFT = 0.1;
/**
 * The view pane, cut across the dome. Its normal is 34 degrees below local
 * horizontal - past the limb's own 19.8 - because what has to land in the 30-40
 * per cent DIRECTION's compositional law asks for is not the pane's aim but its
 * OUTLINE against a standing eye a metre inboard, and a pane is a hole: leaning
 * the cutting plane over is what walks the opening down until the limb crosses
 * it a third of the way up. Rendered, Earth holds 36 per cent of the glass.
 * Forward is +X, the ram direction: the dome leans into what is coming.
 */
const VIEW_CANT_DOWN = 34 * DEG;
const VIEW_CANT_FORWARD = 4 * DEG;
/** How far out along its own normal the view pane cuts the dome. */
const VIEW_OFFSET = 0.52;
/** Half the frame between two panes. Adjacent facets each give this up. */
const MULLION = 0.05;
/** The bevel ringing the inner edge of every pane. That dark hairline is what
 *  makes a window read as a hole rather than as a picture. */
const BEVEL = 0.04;

/** Hull cut. Contains the collar hexagon with room for the coaming everywhere. */
const CUT_X_LOW = -1.8;
const CUT_X_HIGH = 0.6;
const CUT_THETA_LOW = -92.6 * DEG;
const CUT_THETA_HIGH = -57 * DEG;

/** Standoff channels. Face inset radially, half width along the arc. */
const CHANNEL_INSET = 0.1;
const CHANNEL_HALF_WIDTH = 0.13;
const CHANNEL_SEGMENTS = 8;
/** How far the deck-corner standoff intrudes on the deck at its toe. */
const CHANNEL_TOE = 0.077;
const TROUGH_DEPTH = 0.035;
const TROUGH_FROM = 0.06;
const TROUGH_TO = 0.42;
const TRAY_HEIGHT = 0.028;
const TRAY_FROM = 0.56;
const TRAY_TO = 0.9;
const DIFFUSER_DEPTH = 0.012;
const DIFFUSER_SPAN = 0.9;
/** Lamps are segments, not a 6.4 m strip; a module is lit in panels. */
const DIFFUSER_CENTRES = [-2.55, -0.85, 0.85, 2.55] as const;

const HULL_SEED = 4021;
const DECK_SEED = 811;
const FITTING_SEED = 1607;

/**
 * Interior materials floor on NIGHT_SIDE at full intensity, NOT the 0.62 that
 * earth.ts and satellite.ts carry. Outdoors the ambient, hemisphere and fill
 * terms add on top of the emissive everywhere; indoors an unlit facet has only
 * its emissive, and 0.62 lands at luma 21.3 - under the palette gate's floor of
 * 25.45. This helper is deliberately not shared with the exterior modules:
 * normalising the two numbers back together puts the room's unlit facets below
 * the darkest value in the game.
 */
function interiorMaterial(): THREE.MeshLambertMaterial {
  return meshInteriorMaterial(PALETTE.NIGHT_SIDE);
}

/**
 * Lamp diffusers. Bright because they are bright, not because they glow: a
 * flat Lambert face with a CLOUD emissive term and nothing else. No bloom, no
 * sprite, no transparency.
 *
 * The base colour is black so the panel takes no diffuse light at all, and the
 * whole value is carried by emissive at full intensity, which renders it as
 * exactly CLOUD. It used to be lit CLOUD plus a 0.55 emissive term, and that
 * clipped both red and green to 255 over roughly half the sunlit pass - about
 * ten thousand pixels a frame of flat blown panel. There are no shadows
 * indoors, so the interior sun reached these faces as though the hull were not
 * there; a lamp that brightens at orbital noon is wrong twice over. Held at its
 * own value it reads the same in sunlight as in eclipse, which is what a lamp
 * does, and it cannot clip from any pose at any point in the orbit.
 */
function diffuserMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x000000),
    flatShading: true,
    emissive: new THREE.Color(PALETTE.CLOUD),
    emissiveIntensity: 1,
    // The beam does not land on the lamps.
    //
    // A shaft patch is lifted off the surface it lands on, so where the deck
    // ran under a lamp strip the patch drew over the strip and added its beam
    // to CLOUD, which is already luma 214 - the one place in the room that went
    // pure white. Claiming the stencil here makes the rule geometric instead of
    // a tuned offset: these are opaque and the shaft is transparent, so they
    // draw first, and the shaft's Equal-0 test then fails across every pixel a
    // diffuser owns. A lamp is a source, not a receiver.
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

/** A point in the module's cross section, at some station along X. */
interface Section {
  readonly y: number;
  readonly z: number;
}

/** Stand-in for an index that cannot be out of range but is typed as if it can. */
const ORIGIN = new THREE.Vector3();

function cylPoint(x: number, theta: number): THREE.Vector3 {
  return new THREE.Vector3(x, AXIS_Y + RADIUS * Math.cos(theta), RADIUS * Math.sin(theta));
}

/** A place on the inside of the pressure shell, and the way it faces. */
export interface HullMount {
  /** The point on the inner skin, world space. */
  readonly position: THREE.Vector3;
  /** Unit normal into the room. */
  readonly inward: THREE.Vector3;
}

/**
 * Where the hull actually is at a given station and height.
 *
 * Exported because anything bolted to the wall has to be bolted to the WALL,
 * and the wall is a curve: the shell is a 2.1 m cylinder whose axis rides 1.15 m
 * over the deck, so the skin stands at z = 1.757 where it meets the floor and
 * bulges to 2.10 at axis height. A fitting placed by a hand-typed z is a fitting
 * hanging in the middle of the room - which is exactly what happened to the test
 * button - and it will drift again the first time the shell's radius changes.
 * This is the shell's own arithmetic, so it cannot.
 *
 * @param x    station along the module, metres. Fore is +X.
 * @param y    height above the deck, metres.
 * @param side +1 for the starboard skin (+Z), -1 for port.
 */
export function hullMountAt(x: number, y: number, side: 1 | -1): HullMount {
  const rise = y - AXIS_Y;
  const half = RADIUS * RADIUS - rise * rise;
  if (half <= 0) throw new Error(`limb deck: no hull at y=${y}`);
  const z = side * Math.sqrt(half);
  const position = new THREE.Vector3(x, y, z);
  const inward = new THREE.Vector3(0, -rise, -z).normalize();
  return { position, inward };
}

/**
 * How much room is left between a point in the cross section and the skin.
 *
 * Positive is inside the pressure vessel. Anything a fitting builds has to clear
 * this, and it is worth having as a function because the module's own cross
 * section is a curve nobody can check by eye: the aft door's header housing was
 * sized off the opening alone and stood 0.6 m out through the roof, which is
 * invisible from every interior pose and unmissable from outside.
 */
export function hullClearance(y: number, z: number): number {
  return RADIUS - Math.hypot(z, y - AXIS_Y);
}

function sectionPoint(x: number, s: Section): THREE.Vector3 {
  return new THREE.Vector3(x, s.y, s.z);
}

/**
 * Moves the nearest grid line onto `value` and returns its index. The bay cut
 * has to land on hull grid lines exactly or the coaming leaks. `taken` is the
 * line the opposite edge already claimed: without it a cut narrower than a
 * facet would snap both of its edges onto the same line and seal the window.
 */
function snapLine(lines: number[], value: number, taken = -1): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < lines.length; i += 1) {
    if (i === taken) continue;
    const distance = Math.abs((lines[i] ?? Infinity) - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  lines[best] = value;
  return best;
}

interface Grid {
  readonly x: number[];
  readonly theta: number[];
  /** Hull quads inside these index ranges are the window. */
  readonly cutX: readonly [number, number];
  readonly cutTheta: readonly [number, number];
}

function buildGrid(): Grid {
  const x: number[] = [];
  for (let i = 0; i <= AXIAL_SEGMENTS; i += 1) {
    x.push(-HALF_LENGTH + (2 * HALF_LENGTH * i) / AXIAL_SEGMENTS);
  }
  const theta: number[] = [];
  for (let k = 0; k <= CIRC_SEGMENTS; k += 1) {
    theta.push(-THETA_MAX + (2 * THETA_MAX * k) / CIRC_SEGMENTS);
  }

  // The cut edges become grid lines rather than crossing them: a coaming ring
  // that subdivides the arc differently from the hull leaves millimetre gaps
  // along a curve, and every one of them is a pinhole into the exterior pass.
  const aftLine = snapLine(x, CUT_X_LOW);
  const cutX: [number, number] = [aftLine, snapLine(x, CUT_X_HIGH, aftLine)];
  const lowLine = snapLine(theta, CUT_THETA_LOW);
  const cutTheta: [number, number] = [lowLine, snapLine(theta, CUT_THETA_HIGH, lowLine)];

  return { x, theta, cutX, cutTheta };
}

/**
 * The hull: 24 x 16 quads over the y >= 0 portion of the cylinder, less the
 * fifteen the cupola takes out. Non-indexed and flat shaded, one colour per facet,
 * built the way earth.ts builds the planet - the sun crossing 384 normals in
 * turn is the room's only real animation.
 */
function buildHull(sink: Sink, grid: Grid): void {
  const crown = new THREE.Color(PALETTE.HULL);
  const flank = new THREE.Color(PALETTE.HULL_SHADOW);

  for (let i = 0; i < AXIAL_SEGMENTS; i += 1) {
    const x0 = nth(grid.x, i);
    const x1 = nth(grid.x, i + 1);
    const insideX = i >= grid.cutX[0] && i < grid.cutX[1];

    for (let k = 0; k < CIRC_SEGMENTS; k += 1) {
      if (insideX && k >= grid.cutTheta[0] && k < grid.cutTheta[1]) continue;

      const t0 = nth(grid.theta, k);
      const t1 = nth(grid.theta, k + 1);
      const a = cylPoint(x0, t0);
      const b = cylPoint(x1, t0);
      const c = cylPoint(x1, t1);
      const d = cylPoint(x0, t1);

      const centroid = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
      const base = Math.abs((t0 + t1) / 2) <= STANDOFF_THETA ? crown : flank;
      const towards = new THREE.Vector3((x0 + x1) / 2, AXIS_Y, 0);
      pushQuad(sink, a, b, c, d, towards, facetColour(base, centroid, HULL_SEED, 0.07));
    }
  }
}

/** Sub-millimetre relief on the deck, tapering to nothing at the perimeter. */
function deckWarp(x: number, z: number): number {
  const edge = Math.min(DECK_HALF_X - Math.abs(x), HALF_CHORD - Math.abs(z));
  const taper = THREE.MathUtils.smoothstep(edge, 0, DECK_WARP_TAPER);
  // Averaging octaves pulls fbm's range well inside [0, 1]; stretching it back
  // is what makes the warp actually reach the 3 mm the deck is specified to
  // carry rather than two thirds of it.
  const field = THREE.MathUtils.clamp(
    (fbm(x * 1.45, 0, z * 1.45, DECK_SEED, 4) - 0.5) * 3.8,
    -1,
    1
  );
  return field * DECK_WARP * taper;
}

/**
 * The deck: a continuous HULL base plate, a 16 x 8 grid of HULL_SHADOW panels
 * floating 6 mm above it so the seams read as hairlines of the plate below, and
 * end closeouts to the bulkheads. The panels carry a +/-3 mm fbm warp so the
 * floor fractures faintly under a raking sun instead of reading as one dead
 * rectangle; the base plate overhangs the chord, which is what actually stops a
 * ray that slips through the deck-to-hull junction.
 */
function buildDeck(sink: Sink): void {
  const plate = new THREE.Color(PALETTE.HULL);
  const panel = new THREE.Color(PALETTE.HULL_SHADOW);

  const baseHalfX = HALF_LENGTH + DECK_OVERHANG;
  const baseHalfZ = HALF_CHORD + DECK_OVERHANG;
  for (let i = 0; i < 8; i += 1) {
    const x0 = -baseHalfX + (2 * baseHalfX * i) / 8;
    const x1 = -baseHalfX + (2 * baseHalfX * (i + 1)) / 8;
    for (let j = 0; j < 4; j += 1) {
      const z0 = -baseHalfZ + (2 * baseHalfZ * j) / 4;
      const z1 = -baseHalfZ + (2 * baseHalfZ * (j + 1)) / 4;
      const y = -DECK_BASE_DROP;
      const centroid = new THREE.Vector3((x0 + x1) / 2, y, (z0 + z1) / 2);
      pushQuad(
        sink,
        new THREE.Vector3(x0, y, z0),
        new THREE.Vector3(x1, y, z0),
        new THREE.Vector3(x1, y, z1),
        new THREE.Vector3(x0, y, z1),
        new THREE.Vector3(centroid.x, AXIS_Y, centroid.z),
        facetColour(plate, centroid, DECK_SEED, 0.04)
      );
    }
  }

  for (let i = 0; i < DECK_PANELS_X; i += 1) {
    const px0 = -DECK_HALF_X + (2 * DECK_HALF_X * i) / DECK_PANELS_X;
    const px1 = -DECK_HALF_X + (2 * DECK_HALF_X * (i + 1)) / DECK_PANELS_X;
    // Seams are cut on the inside of the grid only: the outer edges have to
    // stay exactly on the chord and exactly on the bulkhead closeouts.
    const x0 = i === 0 ? px0 : px0 + DECK_SEAM;
    const x1 = i === DECK_PANELS_X - 1 ? px1 : px1 - DECK_SEAM;

    for (let j = 0; j < DECK_PANELS_Z; j += 1) {
      const pz0 = -HALF_CHORD + (2 * HALF_CHORD * j) / DECK_PANELS_Z;
      const pz1 = -HALF_CHORD + (2 * HALF_CHORD * (j + 1)) / DECK_PANELS_Z;
      const z0 = j === 0 ? pz0 : pz0 + DECK_SEAM;
      const z1 = j === DECK_PANELS_Z - 1 ? pz1 : pz1 - DECK_SEAM;

      const a = new THREE.Vector3(x0, deckWarp(x0, z0), z0);
      const b = new THREE.Vector3(x1, deckWarp(x1, z0), z0);
      const c = new THREE.Vector3(x1, deckWarp(x1, z1), z1);
      const d = new THREE.Vector3(x0, deckWarp(x0, z1), z1);
      const centroid = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
      pushQuad(
        sink,
        a,
        b,
        c,
        d,
        new THREE.Vector3(centroid.x, AXIS_Y, centroid.z),
        facetColour(panel, centroid, DECK_SEED, 0.07)
      );
    }
  }

  for (const side of [-1, 1]) {
    const x0 = side * DECK_HALF_X;
    const x1 = side * baseHalfX;
    for (let j = 0; j < 4; j += 1) {
      const z0 = -baseHalfZ + (2 * baseHalfZ * j) / 4;
      const z1 = -baseHalfZ + (2 * baseHalfZ * (j + 1)) / 4;
      const centroid = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
      pushQuad(
        sink,
        new THREE.Vector3(x0, 0, z0),
        new THREE.Vector3(x1, 0, z0),
        new THREE.Vector3(x1, 0, z1),
        new THREE.Vector3(x0, 0, z1),
        new THREE.Vector3(centroid.x, AXIS_Y, centroid.z),
        facetColour(panel, centroid, DECK_SEED, 0.04)
      );
    }
  }
}

/**
 * An end closeout. Its rim is a lap over the hull and it carries on below the
 * deck plane, so a ray escaping either of those junctions meets the bulkhead's
 * front face instead of open space. The overlap sits outside the hull, where
 * back-face culling keeps it out of the window.
 */
/**
 * A rectangular hole to leave in a bulkhead, in world (y, z).
 *
 * The bulkhead is a polar fan and a doorway is a rectangle, so no whole cell
 * follows the edge. Cells that straddle the doorway are therefore SPLIT, four
 * ways, up to CUT_DEPTH times, and only cells that end up wholly inside the
 * rectangle are dropped.
 *
 * The rule this replaced dropped any cell whose bounding box touched the
 * doorway, which was not a near-enough approximation but a different shape
 * entirely: this doorway spans the fan's own hub, so every innermost triangle
 * met the test and went, and with them a 140-degree cone of bulkhead reaching
 * 1.28 m out - four holes to space around the door, well outside anything the
 * coaming could cover. A cell test cannot cut a hole smaller than a cell.
 */
export interface Doorway {
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * How many times a straddling bulkhead cell may be quartered.
 *
 * Four takes the widest cell here from 0.23 m across to 0.014 m, so the cut
 * follows the doorway to within a centimetre and a half. What is left over is
 * dropped rather than kept, which keeps the hole at least the size asked for: a
 * doorway narrower than its own door is a door that cannot open. Only cells on
 * the doorway's edge ever split, so the cost is a few hundred triangles along a
 * perimeter, not a subdivided bulkhead.
 */
const CUT_DEPTH = 4;

/**
 * The furthest a bulkhead cut can stray outside the doorway asked for, metres.
 *
 * The cut is a staircase; this is the height of its tallest step, which is
 * exactly what a door's frame has to lap in order to cover the seam. It is a
 * function rather than a comment because the last version of this number WAS a
 * comment - "the ragged margin reaches about 0.2 m" - and the real figure at the
 * time was a metre and a quarter. A frame sized off a sentence is a frame sized
 * off nothing.
 */
export function cutMargin(): number {
  const rim = RADIUS + BULKHEAD_LAP;
  // The widest cell in the fan: the outermost ring is 0.4 of the rim deep, and a
  // wedge is the full sweep over the circumferential count.
  const radial = 0.4 * rim;
  const arc = (2 * Math.acos(-AXIS_Y / rim) * rim) / CIRC_SEGMENTS;
  return Math.max(radial, arc) / 2 ** CUT_DEPTH;
}

function buildBulkhead(sink: Sink, x: number, inward: number, doorway?: Doorway): void {
  const base = new THREE.Color(PALETTE.HULL_SHADOW);
  const rim = RADIUS + BULKHEAD_LAP;
  const rimTheta = Math.acos(-AXIS_Y / rim);
  const towards = new THREE.Vector3(x + inward, AXIS_Y, 0);
  // Three rings, not one fan: 24 wedges reaching the full radius paint long
  // thin spokes converging on a point that means nothing.
  const rings = [0, 0.26, 0.6, 1];

  const at = (radius: number, theta: number) =>
    new THREE.Vector3(x, AXIS_Y + radius * Math.cos(theta), radius * Math.sin(theta));

  const inside = (p: THREE.Vector3): boolean =>
    doorway !== undefined &&
    p.y >= doorway.minY &&
    p.y <= doorway.maxY &&
    p.z >= doorway.minZ &&
    p.z <= doorway.maxZ;

  /**
   * True when this patch and the doorway actually intersect.
   *
   * Separating axes rather than overlapping bounding boxes, because a bounding
   * box says "touches" for a cell that only shares a corner region with the
   * rectangle, and a false touch at the finest depth is a notch cut out of the
   * bulkhead for nothing. Both shapes are convex, so testing the rectangle's two
   * axes and each of the patch's own edge normals is exact.
   */
  const touches = (points: readonly THREE.Vector3[]): boolean => {
    if (doorway === undefined) return false;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    if (maxY <= doorway.minY || minY >= doorway.maxY) return false;
    if (maxZ <= doorway.minZ || minZ >= doorway.maxZ) return false;

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i] ?? ORIGIN;
      const q = points[(i + 1) % points.length] ?? ORIGIN;
      const ny = -(q.z - p.z);
      const nz = q.y - p.y;
      let patchLow = Infinity;
      let patchHigh = -Infinity;
      for (const s of points) {
        const v = ny * s.y + nz * s.z;
        patchLow = Math.min(patchLow, v);
        patchHigh = Math.max(patchHigh, v);
      }
      let rectLow = Infinity;
      let rectHigh = -Infinity;
      for (const y of [doorway.minY, doorway.maxY]) {
        for (const z of [doorway.minZ, doorway.maxZ]) {
          const v = ny * y + nz * z;
          rectLow = Math.min(rectLow, v);
          rectHigh = Math.max(rectHigh, v);
        }
      }
      if (patchHigh <= rectLow || patchLow >= rectHigh) return false;
    }
    return true;
  };

  const emit = (r0: number, r1: number, t0: number, t1: number, depth: number): void => {
    // Outer corners, then the two inner ones - which coincide at the hub, where
    // the cell is a triangle rather than a quad.
    const a = at(r1, t0);
    const b = at(r1, t1);
    const c = at(r0, t1);
    const d = at(r0, t0);
    const corners = r0 === 0 ? [d, a, b] : [a, b, c, d];

    if (touches(corners)) {
      // Wholly inside the rectangle: this is the hole. Both shapes are convex,
      // so every corner inside means every point inside.
      if (corners.every(inside)) return;
      if (depth >= CUT_DEPTH) return;
      const rm = (r0 + r1) / 2;
      const tm = (t0 + t1) / 2;
      emit(r0, rm, t0, tm, depth + 1);
      emit(rm, r1, t0, tm, depth + 1);
      emit(r0, rm, tm, t1, depth + 1);
      emit(rm, r1, tm, t1, depth + 1);
      return;
    }

    const centroid = new THREE.Vector3();
    for (const corner of corners) centroid.add(corner);
    centroid.multiplyScalar(1 / corners.length);
    // facetColour's fbm clusters hard around its middle - measured on the
    // corridor liner, its 0.06 delivers real steps of one or two values - so
    // the fan takes a full-range hash on top, the way liner panels do. Without
    // it a player standing at the aft door (deck-press) had three quarters of
    // the frame inside one 8-value bucket, because every cell of this fan
    // rendered within a value of its neighbours.
    const colour = facetColour(base, centroid, FITTING_SEED, 0.06).multiplyScalar(
      panelWear(centroid.y * 2.7, centroid.z * 2.7, 0.05)
    );
    if (r0 === 0) pushFacet(sink, d, a, b, towards, colour);
    else pushQuad(sink, d, a, b, c, towards, colour);
  };

  // All the way round, in wedges of the width the visible arc has always used.
  //
  // The fan used to stop at +/-rimTheta, leaving a V-shaped notch under it that
  // three triangles fanned from the hub filled in - and those triangles were not
  // cut by the doorway, so with a hole in the bulkhead the notch fill showed
  // through it as a dark chevron rising a metre out of the floor. Closing the
  // circle deletes the special case rather than teaching it about doorways: one
  // shape, one cut, one tolerance. The wedges below the chord are under the deck
  // where nothing can see them, so the last one is allowed to be a short
  // remainder rather than forcing a count that would re-space the visible ones.
  const step = (2 * rimTheta) / CIRC_SEGMENTS;
  const wedges = Math.ceil((2 * Math.PI) / step);
  for (let k = 0; k < wedges; k += 1) {
    const t0 = -rimTheta + step * k;
    const t1 = Math.min(t0 + step, -rimTheta + 2 * Math.PI);
    if (t1 - t0 < 1e-6) continue;
    for (let r = 0; r < rings.length - 1; r += 1) {
      emit(nth(rings, r) * rim, nth(rings, r + 1) * rim, t0, t1, 0);
    }
  }

  // The disc reaches z = +/-1.793 at deck height and narrows below it, while the
  // deck's own overhang runs out to 1.783 - so a ray leaving through the seam
  // and heading down passes outside the bulkhead. This strip is what it meets
  // instead. It lives entirely under the floor, which is why it is exempt from
  // the doorway: a hole nobody can look through does not need cutting.
  //
  // It lies 6 mm OUTBOARD of the disc rather than in the disc's own plane. The
  // fan closes the full circle now, so the wedges under the chord cover the
  // same ground as this strip and face the same way - 0.35 m2 of two surfaces
  // at one depth. Behind the disc it still catches the ray, and the disc hides
  // it completely.
  const skirtX = x - inward * 0.006;
  const skirtZ = HALF_CHORD + DECK_OVERHANG + 0.018;
  const port = new THREE.Vector3(skirtX, -BULKHEAD_SKIRT, -skirtZ);
  const starboard = new THREE.Vector3(skirtX, -BULKHEAD_SKIRT, skirtZ);
  const chordPort = at(rim, -rimTheta).setX(skirtX);
  const chordStarboard = at(rim, rimTheta).setX(skirtX);
  const skirt = facetColour(base, new THREE.Vector3(x, -BULKHEAD_SKIRT / 2, 0), FITTING_SEED, 0.06);
  pushQuad(sink, chordPort, chordStarboard, starboard, port, towards, skirt);
}

interface Channel {
  /** Face ends. The lamp trough sits at the `a` end, washing the surface the
   *  standoff is meant to light: the ceiling arc up top, the deck down low. */
  readonly a: Section;
  readonly b: Section;
  /** Where each face end ties back into structure. Equal to the face end when
   *  the face already lands on the hull or the deck. */
  readonly backA: Section;
  readonly backB: Section;
}

/** The two overhead standoffs, on the +/-45 degree radials. */
function overheadChannel(theta: number): Channel {
  const side = Math.sign(theta);
  const radial = { y: Math.cos(theta), z: Math.sin(theta) };
  const tangent = { y: -Math.sin(theta), z: Math.cos(theta) };
  const face = RADIUS - CHANNEL_INSET;
  const centre = { y: AXIS_Y + face * radial.y, z: face * radial.z };
  const spread = Math.atan(CHANNEL_HALF_WIDTH / face);

  const offset = (sign: number): Section => ({
    y: centre.y + sign * side * CHANNEL_HALF_WIDTH * tangent.y,
    z: centre.z + sign * side * CHANNEL_HALF_WIDTH * tangent.z,
  });
  const hull = (sign: number): Section => {
    const at = theta + sign * side * spread;
    return { y: AXIS_Y + RADIUS * Math.cos(at), z: RADIUS * Math.sin(at) };
  };

  return { a: offset(-1), b: offset(1), backA: hull(-1), backB: hull(1) };
}

/**
 * The two deck-corner standoffs. ENVIRONMENTS.md puts them on the +/-135 degree
 * radials, which on a shell truncated at the deck plane (123.2 deg) is not a
 * point on the hull at all but the corner between the hull and the deck. So the
 * channel is built as the chamfer across that corner, with its face normal on
 * the 135 degree radial exactly as specified - and it closes the sharpest
 * junction in the room while it is there.
 */
function cornerChannel(side: number): Channel {
  const toe = HALF_CHORD - CHANNEL_TOE;
  // Run up and outboard at 45 degrees from the toe until the hull is met:
  // s^2 + 2k(toe - AXIS_Y)s + AXIS_Y^2 + toe^2 - RADIUS^2 = 0, k = cos 45.
  const k = Math.SQRT1_2;
  const b = 2 * k * (toe - AXIS_Y);
  const c = AXIS_Y * AXIS_Y + toe * toe - RADIUS * RADIUS;
  const run = (-b + Math.sqrt(b * b - 4 * c)) / 2;

  const deckEnd: Section = { y: 0, z: side * toe };
  const hullEnd: Section = { y: run * k, z: side * (toe + run * k) };
  return { a: deckEnd, b: hullEnd, backA: deckEnd, backB: hullEnd };
}

/**
 * A standoff channel: a HULL_SHADOW chase carrying an ARRAY cable tray and a
 * lamp trough, extruded the length of the module. The trough is a recess with
 * CLOUD diffuser panels seated in it; the panels go in the lamp sink because
 * they are the one interior surface that does not floor on NIGHT_SIDE.
 */
function buildChannel(structure: Sink, lamps: Sink, channel: Channel): void {
  const shadow = new THREE.Color(PALETTE.HULL_SHADOW);
  const tray = new THREE.Color(PALETTE.ARRAY);
  const glass = new THREE.Color(PALETTE.CLOUD);

  const dy = channel.b.y - channel.a.y;
  const dz = channel.b.z - channel.a.z;
  const width = Math.hypot(dy, dz);
  const midY = (channel.a.y + channel.b.y) / 2;
  const midZ = (channel.a.z + channel.b.z) / 2;
  // Of the two face normals, the one that looks toward the module axis is the
  // one that looks into the room.
  let ny = dz / width;
  let nz = -dy / width;
  if (ny * (AXIS_Y - midY) + nz * -midZ < 0) {
    ny = -ny;
    nz = -nz;
  }

  const on = (p: number, lift: number): Section => ({
    y: channel.a.y + dy * p + ny * lift,
    z: channel.a.z + dz * p + nz * lift,
  });

  const strip = (
    x0: number,
    x1: number,
    from: Section,
    to: Section,
    towards: Section,
    base: THREE.Color
  ): void => {
    const centroid = new THREE.Vector3((x0 + x1) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    pushQuad(
      structure,
      sectionPoint(x0, from),
      sectionPoint(x1, from),
      sectionPoint(x1, to),
      sectionPoint(x0, to),
      sectionPoint((x0 + x1) / 2, towards),
      facetColour(base, centroid, FITTING_SEED, 0.05)
    );
  };

  const axis: Section = { y: AXIS_Y, z: 0 };
  const troughCore = on((TROUGH_FROM + TROUGH_TO) / 2, -TROUGH_DEPTH / 2);

  for (let j = 0; j < CHANNEL_SEGMENTS; j += 1) {
    const x0 = -HALF_LENGTH + (2 * HALF_LENGTH * j) / CHANNEL_SEGMENTS;
    const x1 = -HALF_LENGTH + (2 * HALF_LENGTH * (j + 1)) / CHANNEL_SEGMENTS;

    strip(x0, x1, on(0, 0), on(TROUGH_FROM, 0), axis, shadow);
    strip(x0, x1, on(TROUGH_TO, 0), on(1, 0), axis, shadow);

    strip(x0, x1, on(TROUGH_FROM, 0), on(TROUGH_FROM, -TROUGH_DEPTH), troughCore, shadow);
    strip(x0, x1, on(TROUGH_FROM, -TROUGH_DEPTH), on(TROUGH_TO, -TROUGH_DEPTH), axis, shadow);
    strip(x0, x1, on(TROUGH_TO, -TROUGH_DEPTH), on(TROUGH_TO, 0), troughCore, shadow);

    strip(x0, x1, on(TRAY_FROM, 0), on(TRAY_FROM, TRAY_HEIGHT), on(TRAY_FROM - 0.06, 0), tray);
    strip(x0, x1, on(TRAY_FROM, TRAY_HEIGHT), on(TRAY_TO, TRAY_HEIGHT), axis, tray);
    strip(x0, x1, on(TRAY_TO, TRAY_HEIGHT), on(TRAY_TO, 0), on(TRAY_TO + 0.06, 0), tray);

    if (Math.hypot(channel.backA.y - channel.a.y, channel.backA.z - channel.a.z) > 1e-4) {
      strip(x0, x1, on(0, 0), channel.backA, on(-0.25, 0), shadow);
    }
    if (Math.hypot(channel.backB.y - channel.b.y, channel.backB.z - channel.b.z) > 1e-4) {
      strip(x0, x1, on(1, 0), channel.backB, on(1.25, 0), shadow);
    }
  }

  for (const centre of DIFFUSER_CENTRES) {
    const x0 = centre - DIFFUSER_SPAN / 2;
    const x1 = centre + DIFFUSER_SPAN / 2;
    const from = on(TROUGH_FROM + 0.015, -DIFFUSER_DEPTH);
    const to = on(TROUGH_TO - 0.015, -DIFFUSER_DEPTH);
    pushQuad(
      lamps,
      sectionPoint(x0, from),
      sectionPoint(x1, from),
      sectionPoint(x1, to),
      sectionPoint(x0, to),
      sectionPoint(centre, axis),
      glass
    );
  }
}

interface CutPoint {
  readonly x: number;
  readonly theta: number;
}

/** The cut's perimeter, walked once, on the hull's own grid lines. */
function cutLoop(xs: readonly number[], thetas: readonly number[]): CutPoint[] {
  const x0 = nth(xs, 0);
  const x1 = nth(xs, xs.length - 1);
  const t0 = nth(thetas, 0);
  const t1 = nth(thetas, thetas.length - 1);
  const point = (x: number, theta: number): CutPoint => ({ x, theta });

  const loop: CutPoint[] = [];
  for (let i = 0; i < xs.length - 1; i += 1) loop.push(point(nth(xs, i), t0));
  for (let k = 0; k < thetas.length - 1; k += 1) loop.push(point(x1, nth(thetas, k)));
  for (let i = xs.length - 1; i > 0; i -= 1) loop.push(point(nth(xs, i), t1));
  for (let k = thetas.length - 1; k > 0; k -= 1) loop.push(point(x0, nth(thetas, k)));
  return loop;
}

/** A bounding plane of the dome. The cavity is where n . p <= d. */
interface Plane {
  readonly n: THREE.Vector3;
  readonly d: number;
}

/**
 * The one point common to three planes. Every vertex of the dome is one of
 * these, which is what keeps its faces exactly planar however the facet normals
 * are aimed - and they are aimed at the sun, not at each other.
 */
function threePlanes(a: Plane, b: Plane, c: Plane): THREE.Vector3 {
  const bc = new THREE.Vector3().crossVectors(b.n, c.n);
  const ca = new THREE.Vector3().crossVectors(c.n, a.n);
  const ab = new THREE.Vector3().crossVectors(a.n, b.n);
  const det = a.n.dot(bc);
  if (Math.abs(det) < 1e-9) throw new Error('limb deck: degenerate cupola facet');
  return new THREE.Vector3()
    .addScaledVector(bc, a.d)
    .addScaledVector(ca, b.d)
    .addScaledVector(ab, c.d)
    .multiplyScalar(1 / det);
}

/**
 * A convex planar polygon pulled in by `by` all round, in its own plane.
 *
 * Every edge line is moved inboard and the corners re-cut on the moved lines,
 * so two facets sharing an edge each give up the same width and the mullion
 * between them is the same thickness whatever angle they meet at.
 */
function insetPolygon(
  polygon: readonly THREE.Vector3[],
  normal: THREE.Vector3,
  by: number
): THREE.Vector3[] {
  const centre = new THREE.Vector3();
  for (const p of polygon) centre.add(p);
  centre.multiplyScalar(1 / polygon.length);

  // Each edge becomes a half-plane in 3D whose normal lies in the face.
  const edges = polygon.map((p, i) => {
    const q = polygon[(i + 1) % polygon.length] ?? p;
    const inward = new THREE.Vector3().crossVectors(normal, new THREE.Vector3().subVectors(q, p));
    inward.normalize();
    if (inward.dot(new THREE.Vector3().subVectors(centre, p)) < 0) inward.multiplyScalar(-1);
    return { inward, offset: inward.dot(p) + by };
  });

  const face: Plane = { n: normal, d: normal.dot(centre) };
  return edges.map((edge, i) => {
    const previous = edges[(i + edges.length - 1) % edges.length] ?? edge;
    return threePlanes(
      face,
      { n: previous.inward, d: previous.offset },
      { n: edge.inward, d: edge.offset }
    );
  });
}

/** Signed area of a polygon about `normal`; negative means clockwise. */
function windingArea(polygon: readonly THREE.Vector3[], normal: THREE.Vector3): number {
  const cross = new THREE.Vector3();
  const total = new THREE.Vector3();
  const origin = polygon[0] ?? new THREE.Vector3();
  for (let i = 1; i + 1 < polygon.length; i += 1) {
    const a = new THREE.Vector3().subVectors(polygon[i] ?? origin, origin);
    const b = new THREE.Vector3().subVectors(polygon[i + 1] ?? origin, origin);
    total.add(cross.crossVectors(a, b));
  }
  return total.dot(normal) / 2;
}

/**
 * One glazed facet: the frame you see from inside, the 4 cm bevelled reveal,
 * and the hole itself.
 *
 * The mullion band lies in the facet's own plane, and the glass sits BEVEL
 * outboard of it, so the ring of reveal reads as a hairline of shadow round a
 * hole rather than as a moulding round a picture. Both come out of the same
 * outline, so the reveal is a clean prism whatever shape the facet is.
 *
 * The frame is taken out of the facet plane rather than out of a second shell
 * offset behind it. A 4 cm thickness costs a short facet its whole slant once
 * the dihedral is shallow, and two of the six here are short by design.
 */
function buildPane(
  sink: Sink,
  face: readonly THREE.Vector3[],
  normal: THREE.Vector3,
  towards: THREE.Vector3
): Aperture {
  const frame = new THREE.Color(PALETTE.HULL_SHADOW);
  // The reveal is materially darker than the frame it cuts and the glass it
  // leads to, so the ring holds as a hairline whatever the sun is doing.
  const lip = new THREE.Color(PALETTE.HULL_SHADOW).multiplyScalar(0.78);

  const opening = insetPolygon(face, normal, MULLION);
  const glass = opening.map((p) => p.clone().addScaledVector(normal, BEVEL));
  const centre = new THREE.Vector3();
  for (const p of glass) centre.add(p);
  centre.multiplyScalar(1 / glass.length);
  const revealTowards = centre.clone().addScaledVector(normal, -BEVEL / 2);

  for (let i = 0; i < face.length; i += 1) {
    const j = (i + 1) % face.length;
    const a0 = face[i] ?? centre;
    const a1 = face[j] ?? centre;
    const b0 = opening[i] ?? centre;
    const b1 = opening[j] ?? centre;
    const c0 = glass[i] ?? centre;
    const c1 = glass[j] ?? centre;

    const frameCentroid = new THREE.Vector3().add(a0).add(a1).add(b1).add(b0).multiplyScalar(0.25);
    pushQuad(sink, a0, a1, b1, b0, towards, facetColour(frame, frameCentroid, HULL_SEED, 0.05));

    const lipCentroid = new THREE.Vector3().add(b0).add(b1).add(c1).add(c0).multiplyScalar(0.25);
    pushQuad(sink, b0, b1, c1, c0, revealTowards, facetColour(lip, lipCentroid, HULL_SEED, 0.03));
  }

  // The Aperture contract wants the corners counter-clockwise seen from inside,
  // which puts (c1 - c0) x (c2 - c0) on the inboard side of the glass.
  const corners = windingArea(glass, normal) > 0 ? glass.slice().reverse() : glass;
  return { corners, normal: normal.clone(), centre };
}

/**
 * The cupola: a collar off the hull cut, six sun-aimed side facets and a view
 * pane cut across their top.
 *
 * The panes are not drawn - they are holes, and the exterior pass is what is
 * behind them - so everything else has to close. The collar walks the hull cut
 * out to the dome's base hexagon along the hull's own radials, which is what
 * lets a rectangle of hull facets open onto a six-sided dome without leaving a
 * gap: every millimetre of the rectangle that is not dome is collar.
 */
function buildCupola(sink: Sink, grid: Grid): { apertures: Aperture[]; throat: Aperture } {
  const xs = grid.x.slice(grid.cutX[0], grid.cutX[1] + 1);
  const thetas = grid.theta.slice(grid.cutTheta[0], grid.cutTheta[1] + 1);

  const centre = cylPoint(CUPOLA_CENTRE_X, CUPOLA_CENTRE_THETA);
  const radial = new THREE.Vector3(0, Math.cos(CUPOLA_CENTRE_THETA), Math.sin(CUPOLA_CENTRE_THETA));
  const collarPlane: Plane = { n: radial.clone().multiplyScalar(-1), d: -radial.dot(centre) };

  const viewNormal = new THREE.Vector3(
    Math.cos(VIEW_CANT_DOWN) * Math.sin(VIEW_CANT_FORWARD),
    -Math.sin(VIEW_CANT_DOWN),
    -Math.cos(VIEW_CANT_DOWN) * Math.cos(VIEW_CANT_FORWARD)
  );

  // Six facet normals straight off the sun's cone, and the apothem measured in
  // the collar plane, so the dome's footprint is set independently of where the
  // facets look. Aiming and fitting are different jobs and this keeps them so.
  const sides: Plane[] = FACET_PHASES.map((phase, k) => {
    // Straight out of the orbital clock rather than re-derived here: a facet
    // aimed by a second copy of the sun formula is a facet that stops facing
    // the sun the day anyone corrects the first copy.
    const aim = sunDirection(phase, LIMB_DECK_ORBIT.beta);
    const n = new THREE.Vector3(aim.x, aim.y, aim.z).normalize();
    const along = n
      .clone()
      .addScaledVector(radial, -n.dot(radial))
      .normalize()
      .multiplyScalar(nth(FACET_APOTHEM, k));
    return { n, d: n.dot(centre.clone().add(along)) };
  });

  // Every vertex of the dome: the collar hexagon where the side planes meet the
  // hull's own tangent plane, and the top hexagon where they meet the view pane.
  const collar: Plane = { n: collarPlane.n, d: collarPlane.d - COLLAR_LIFT };
  const view: Plane = { n: viewNormal, d: viewNormal.dot(centre) + VIEW_OFFSET };
  const base: THREE.Vector3[] = [];
  const top: THREE.Vector3[] = [];
  for (let k = 0; k < sides.length; k += 1) {
    const previous = sides[(k + sides.length - 1) % sides.length];
    const here = sides[k];
    if (previous === undefined || here === undefined) continue;
    base.push(threePlanes(collar, previous, here));
    top.push(threePlanes(view, previous, here));
  }

  const roomward = centre.clone().addScaledVector(radial, -0.6);

  const apertures: Aperture[] = [];
  // The view pane is first: the contract promises the exterior pass can take
  // apertures[0] and be looking at the limb.
  apertures.push(buildPane(sink, top, viewNormal, roomward));
  /**
   * True where the collar has already come out past the view plane.
   *
   * The view plane is canted 48 degrees off the collar, so the dome is a wedge
   * rather than a drum, and at the low fore corner the wedge has closed: the
   * glass passes UNDER the collar ring. A facet drawn corner to corner across
   * that point turns itself inside out, and a folded facet paints its own
   * mullion twice - two frames at one depth, which is the whole complaint this
   * file's offsets exist to answer.
   */
  const shut = (p: THREE.Vector3 | undefined): boolean => p !== undefined && view.n.dot(p) > view.d;

  for (let k = 0; k < sides.length; k += 1) {
    const j = (k + 1) % sides.length;
    const here = sides[k];
    if (here === undefined) continue;
    // The wedge edge on this facet: where its collar edge and its glass edge
    // are the same line. A facet that reaches the shut end ends in that point
    // rather than carrying on past it.
    const shutAt = threePlanes(here, collar, view);
    const face = [
      shut(base[k]) ? shutAt : base[k],
      shut(base[j]) ? shutAt : base[j],
      shut(base[j]) ? shutAt : top[j],
      shut(base[k]) ? shutAt : top[k],
    ].filter((p): p is THREE.Vector3 => p !== undefined);
    // Consecutive duplicates are the collapsed end, and a polygon carrying one
    // has a zero-length edge, which has no direction to inset a mullion along.
    const corners = face.filter((p, i) => !p.equals(face[(i + 1) % face.length] ?? p));
    if (corners.length < 3) continue;
    apertures.push(buildPane(sink, corners, here.n, roomward));
  }

  // --- the collar ----------------------------------------------------------
  // Hull cut and dome base are walked in the same chart - metres along the hull
  // from the cut centre, fore-aft against around - and matched by bearing, so
  // each hull grid point ties to the base hexagon directly outboard of it.
  const chart = (point: THREE.Vector3): THREE.Vector2 =>
    new THREE.Vector2(
      point.x - CUPOLA_CENTRE_X,
      RADIUS * (Math.atan2(point.z, point.y - AXIS_Y) - CUPOLA_CENTRE_THETA)
    );
  const hexagon = base;
  const hexChart = hexagon.map(chart);

  /** Where a bearing from the cut centre crosses the base hexagon. */
  const onHexagon = (bearing: number): THREE.Vector3 => {
    const dx = Math.cos(bearing);
    const dy = Math.sin(bearing);
    for (let i = 0; i < hexChart.length; i += 1) {
      const a = hexChart[i];
      const b = hexChart[(i + 1) % hexChart.length];
      const pa = hexagon[i];
      const pb = hexagon[(i + 1) % hexChart.length];
      if (a === undefined || b === undefined || pa === undefined || pb === undefined) continue;
      // Solve s * (dx, dy) = a + t * (b - a) for the ray parameter s and the
      // edge parameter t. Cramer, on the 2x2 with columns (d, -e).
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const det = -dx * ey + ex * dy;
      if (Math.abs(det) < 1e-9) continue;
      const t = (dx * a.y - dy * a.x) / det;
      const along = (-a.x * ey + ex * a.y) / det;
      if (t >= -1e-6 && t <= 1 + 1e-6 && along > 0) {
        return new THREE.Vector3().lerpVectors(pa, pb, THREE.MathUtils.clamp(t, 0, 1));
      }
    }
    return hexagon[0] ?? centre;
  };

  const loop = cutLoop(xs, thetas);
  const hull = loop.map((p) => cylPoint(p.x, p.theta));
  const seat = hull.map((p) => {
    const c = chart(p);
    return onHexagon(Math.atan2(c.y, c.x));
  });
  const collarColour = new THREE.Color(PALETTE.HULL_SHADOW);
  for (let i = 0; i < loop.length; i += 1) {
    const j = (i + 1) % loop.length;
    const h0 = hull[i] ?? centre;
    const h1 = hull[j] ?? centre;
    const s1 = seat[j] ?? centre;
    const s0 = seat[i] ?? centre;
    const centroid = new THREE.Vector3().add(h0).add(h1).add(s1).add(s0).multiplyScalar(0.25);
    pushQuad(sink, h0, h1, s1, s0, roomward, facetColour(collarColour, centroid, HULL_SEED, 0.05));
  }

  const throatCentre = new THREE.Vector3();
  for (const p of hexagon) throatCentre.add(p);
  throatCentre.multiplyScalar(1 / hexagon.length);
  const throat: Aperture = {
    corners: windingArea(hexagon, radial) > 0 ? hexagon.slice().reverse() : hexagon,
    normal: radial.clone(),
    centre: throatCentre,
  };

  return { apertures, throat };
}

export function buildShell(): ShellHandle {
  const structure: Sink = { position: [], colour: [] };
  const lamps: Sink = { position: [], colour: [] };

  const grid = buildGrid();
  buildHull(structure, grid);
  buildDeck(structure);
  buildBulkhead(structure, -HALF_LENGTH, 1, AFT_DOORWAY);
  buildBulkhead(structure, HALF_LENGTH, -1);

  for (const theta of [STANDOFF_THETA, -STANDOFF_THETA]) {
    buildChannel(structure, lamps, overheadChannel(theta));
  }
  for (const side of [1, -1]) {
    buildChannel(structure, lamps, cornerChannel(side));
  }

  const { apertures, throat } = buildCupola(structure, grid);
  const viewAperture = apertures[0];
  if (viewAperture === undefined) throw new Error('limb deck: cupola built no view pane');

  const structureMaterial = interiorMaterial();
  const lampMaterial = diffuserMaterial();
  let structureGeometry = toGeometry(structure);
  let lampGeometry = toGeometry(lamps);

  // THE HYBRID (owner direction, 2026-09-05): when the Cycles bake of this
  // exact geometry is on hand, use its .glb copies instead - the same two
  // meshes to the millimetre (scripts/export-limbdeck-shell.ts exports them,
  // tools/blender/build_limbdeck.py re-imports them), but carrying lightmap
  // UVs. The materials stay THESE materials, so the orbital rig lights the
  // room exactly as before; the map adds only the indirect term - the lamp
  // troughs' bounce filling the hull crown - that the rig's ambient backstop
  // could only guess at. Direct light is never in the map, so nothing is
  // counted twice and nothing goes stale when the orbit turns.
  const baked = bakedParts('limbdeck');
  if (baked !== null) {
    for (const part of baked.parts) {
      if (part.materialName === 'STRUCTURE') {
        structureGeometry.dispose();
        structureGeometry = part.geometry;
      } else if (part.materialName === 'LAMPS') {
        lampGeometry.dispose();
        lampGeometry = part.geometry;
      } else {
        part.geometry.dispose();
      }
    }
    structureMaterial.lightMap = baked.lightMap;
    structureMaterial.lightMapIntensity = LIGHT_INTENSITY;
    structureMaterial.needsUpdate = true;
  }

  const hull = new THREE.Mesh(structureGeometry, structureMaterial);
  hull.name = 'shell-structure';
  const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
  lamp.name = 'shell-lamps';

  const root = new THREE.Group();
  root.name = 'limb-deck-shell';
  root.add(hull, lamp);

  return {
    root,
    apertures,
    viewAperture,
    throat,
    deckY: 0,

    /**
     * Nothing here is a function of time. The terminator re-values all 384 hull
     * facets every frame, but it does it through one sun vector against 384
     * normals - the vertex colours are albedo and the light does the work. A
     * shell that re-wrote its colour buffer per frame would be re-deriving
     * orbital geometry at draw time, which is the thing the renderer is not
     * allowed to do.
     */
    update(_frame: Frame) {},

    dispose() {
      structureGeometry.dispose();
      lampGeometry.dispose();
      structureMaterial.dispose();
      lampMaterial.dispose();
    },
  };
}
