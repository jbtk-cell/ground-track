/**
 * THE GANTRY - the propellant column, standing up, and the only room lit from
 * underneath.
 *
 * STRUCTURE.md gives the game two currencies, and only one of them is ever
 * shown as a thing rather than as a number. Propellant is spent visibly when a
 * guess misses, and scavenged back off salvage as `RECOVERED · 40 M/S`, and in
 * every other room in the station that is a column of type on a card. Here it
 * is twenty-four tanks on a two-metre grid, and the level in them is the
 * resource. A player who has walked between them once reads the propellant
 * column afterwards as a picture of a place, which is worth more than any
 * amount of instrumentation would be.
 *
 * ELEVEN METRES BY SEVEN AND A HALF, AND THE CEILING AT 2.15. The largest deck
 * in the station by a wide margin, under the lowest ceiling anybody can stand
 * up straight beneath - 0.41 m over a standing eye, near enough to touch
 * without stretching. Wide and pressing down at once exists nowhere else, and
 * it is deliberately the room met after THE CROWN's 9.6 m shaft: the same body
 * measured against two opposite volumes inside a minute. A reveal is worth
 * exactly as much as the compression either side of it, and this is the
 * compression, which is why it is the larger room of the two on plan and the
 * smaller one to be in.
 *
 * IT IS LIT FROM BELOW AND FROM NOWHERE ELSE. Twelve fittings at knee height
 * in the aisles, an ambient whose bright hemisphere is the one underneath, and
 * no key, no downlight and nothing at all above 0.40 m. The tanks are therefore
 * brighter at their bases than at their tops, which inverts every other object
 * in the game, and the deck is the lightest large surface in the room while the
 * ceiling is the darkest, which inverts every other room in the station. One
 * overhead fitting anywhere in here and the whole inversion collapses into a
 * warehouse; if it ever reads too dark overhead the answer is more uplight, not
 * a lamp. That is not a preference, it is the room.
 *
 * THE CONTENT IS IN THE MIDDLE AND THE WALLS ARE PLAIN. Every other compartment
 * puts its identity on its walls - racks, panels, boards, glazing - and this one
 * puts it in the volume and leaves three bands of bare liner round the edge.
 * The inversion is worth as much as the lighting one: it is what makes the
 * doorway at the far end of the central aisle disappear behind three ranks of
 * tanks, so the way out is concealed by content rather than by a corner.
 *
 * THE ENTRY BAY IS COFFERED, AND IT HAD TO BE. The wide GALLERY_SEAM is 2.30 m
 * tall and this ceiling is 2.15, so the opening does not fit under the room it
 * opens into - the seam is taller than the compartment. Rather than shrink the
 * opening, which would spend the one thing the wide seam is for, the ceiling is
 * lifted to 2.50 m over the first 1.10 m of the room in a flat coffer as wide as
 * the central aisle and its two flanking ranks. So you come through the tall
 * wide hole into a tall wide bay, walk 1.1 m, and the ceiling drops 0.35 m onto
 * you as the room opens sideways. The compression arrives one step after the
 * threshold rather than at it, which is the better place for it.
 *
 * WHAT IS OUT OF PLACE. One tank is off its saddle and standing on the deck in
 * the cross-aisle beside its own empty cradle, 0.14 m shorter than every other
 * tank in the room because it is not on anything. In a grid of twenty-four
 * identical objects an empty cradle is visible from the far end of the room, and
 * that is the whole of the disorder: something with a defined stowed position,
 * not in it, and no story attached.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { GALLERY_SEAM, SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import {
  type Sink,
  facetColour,
  interiorMaterial,
  pushFacet,
  pushQuad,
  sink,
  toGeometry,
} from '../kit/mesh';
import { BAY_M, CROWN_COLOUR, REVEAL_COLOUR, bands, deepestRelief, panelWear } from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

const HALF_X = 5.5;
const HALF_Z = 3.8;
const FLOOR_Y = 0;
/** Flat, low, and level. The only relief is over the entry bay. */
const CEILING_Y = 2.15;

/**
 * The entry coffer: how the 2.30 m seam gets to exist in a 2.15 m room.
 *
 * Held to the width of the central aisle plus the two ranks flanking it, so its
 * edges land on the tank grid rather than on an arbitrary line, and deep enough
 * that the drop happens after the threshold instead of in it.
 */
const COFFER_Y = 2.5;
const COFFER_X0 = 4.4;
const COFFER_HALF_Z = 1.44;

/**
 * Both end walls, held one seam inset inboard of their own port planes.
 *
 * SEAM_INSET_M rather than a number written here, because a room re-deriving
 * that distance is a room that will one day derive it differently, and both
 * neighbours build to the plane this room ends in. It is the flat-wall case and
 * so it is the whole setback: THE CROWN needs its own deepest relief on top
 * because its ported walls are banded and the work band's groove would stand in
 * the next compartment. Here the ported walls are the two SHORT ends and they
 * carry no bands at all - the banding is on the long walls, which have no port
 * in them - so there is no groove to hold back.
 */
const RUN_X = HALF_X - SEAM_INSET_M;

/**
 * How far the deck and the ceiling run PAST the two walls that carry no port.
 *
 * A deck that stops exactly in a wall's own plane leaves a ray at a grazing
 * angle nothing to hit at the junction, and what it finds instead is the
 * exterior pass, which has already cleared depth. Only the z walls get it: the
 * x walls are the seam planes, and material pushed past one of those is material
 * standing in the next compartment.
 */
const OVERRUN = 0.12;
/** The lowest band runs below the deck, for the same reason. */
const SKIRT = 0.08;

/** Twenty-four tanks, six by four, on the two-metre grid. */
const TANK_X = [-5, -3, -1, 1, 3, 5] as const;
const TANK_Z = [-3, -1, 1, 3] as const;

/**
 * A cylinder, as ten flat facets, phased 6 degrees off the axes.
 *
 * There are no curves in this game, so a tank is a prism - and the phase is the
 * part that matters rather than the count. Facet normals sit 36 degrees apart,
 * so a prism phased on an axis has facets square to the world, and twenty-four
 * of those on a regular grid is the largest coplanar-face risk in the station:
 * every tank carries a copy of the same ten planes, and any phase that is a
 * multiple of 18 degrees puts some of them exactly on the diagonals, where a
 * tank and its diagonal neighbour share a plane facing the same way. Six degrees
 * misses every axis and every diagonal, and the closest any two of the 24 tanks
 * then come to sharing a plane is 148 mm.
 */
const TANK_FACETS = 10;
const TANK_PHASE = Math.PI / 30;
const TANK_R = 0.35;
const TANK_H = 1.55;
const SADDLE_H = 0.14;
const CAP_R = 0.2;
const CAP_H = 0.11;
/** Half-width of a tank's keep-out on the deck: the prism plus a hand's width. */
const KEEP = 0.44;

/** The tank that is not where it should be, and the cradle it came off. */
const STRAY_FROM_X = 3;
const STRAY_Z = 1;
const STRAY_X = 2;

/** Uplights: knee height, in the two aisles between tank ranks. */
const LAMP_Y = 0.32;
const LAMP_Z = 2;
const LAMP_HALF = 0.1;
const LAMP_KEEP = 0.16;

/** Overhead runs, one over each rank, so the low ceiling has a rhythm in it. */
const PIPE_Y0 = 1.95;
const PIPE_Y1 = 2.1;
const PIPE_HALF = 0.08;

const WALK_X1 = 5 + KEEP;
const WALK_Z1 = HALF_Z - 0.08;

const SEED = 0x0d7;
const JITTER = 0.05;
const EYE_HEIGHT = 1.74;

/**
 * Two ports, both on the long axis, both centred, both on the deck.
 *
 * `fore` is the second and last GALLERY_SEAM in the station - the other is THE
 * CROWN - and it is spent here for the same reason it is spent there: a wide low
 * opening is what makes the volume beyond it read, whether that volume goes up
 * or out. Used a third time it would stop meaning anything.
 */
const PORTS = [
  port('fore', [HALF_X, GALLERY_SEAM.height / 2, 0], '+x', FLOOR_Y, GALLERY_SEAM),
  port('aft', [-HALF_X, SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.25,
  maxY: COFFER_Y + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

/** How high the pressure vessel is over a point: the coffer, or the flat lid. */
function ceilingAt(x: number, z: number): number {
  return x >= COFFER_X0 && Math.abs(z) <= COFFER_HALF_Z ? COFFER_Y : CEILING_Y;
}

/** Where a tank's body starts: on its saddle, or on the deck if it is the stray. */
function tankBase(onSaddle: boolean): number {
  return onSaddle ? FLOOR_Y + SADDLE_H : FLOOR_Y;
}

/** A run split into facets about one bay long, so no surface is a single sheet. */
function spans(a0: number, a1: number): readonly (readonly [number, number])[] {
  const n = Math.max(1, Math.round(Math.abs(a1 - a0) / BAY_M));
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push([a0 + ((a1 - a0) * i) / n, a0 + ((a1 - a0) * (i + 1)) / n]);
  }
  return out;
}

function gantrySolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The cradles. Two rails under each tank, short of the tank in both
  // directions so the prism overhangs them and the tank reads as SET DOWN on
  // something rather than as continuous with it. Rails rather than a plinth
  // because a plinth's top is a horizontal plane at one height under every tank
  // in the room, and twenty-four of those is twenty-four chances to line one up
  // with something else at 0.14 m.
  for (const x of TANK_X) {
    for (const z of TANK_Z) {
      for (const [n, side] of [-1, 1].entries()) {
        parts.push(
          solid(
            `cradle-${x}-${z}-${n}`,
            'frame',
            x - 0.26,
            x + 0.26,
            FLOOR_Y,
            FLOOR_Y + SADDLE_H,
            z + side * 0.16,
            z + side * 0.28
          )
        );
      }
    }
  }

  // --- The overhead runs, one over each rank. Held below the crown band's
  // underside and above a standing eye, so they are felt rather than ducked,
  // and run into both end walls rather than stopping short of them: a service
  // line that ends in mid-air two hand's widths from a bulkhead reads as
  // unfinished, and one of the two ends is framed by the wide doorway.
  for (const [n, z] of TANK_Z.entries()) {
    parts.push(
      solid(`run-${n}`, 'pipe', -RUN_X, RUN_X, PIPE_Y0, PIPE_Y1, z - PIPE_HALF, z + PIPE_HALF)
    );
  }
  // And a drop off each run onto each tank's cap. The one over the empty cradle
  // hangs onto nothing, which is what makes the empty cradle read as empty
  // rather than as a gap in the grid.
  for (const x of TANK_X) {
    for (const z of TANK_Z) {
      parts.push(
        solid(
          `drop-${x}-${z}`,
          'pipe',
          x - 0.035,
          x + 0.035,
          FLOOR_Y + SADDLE_H + TANK_H + CAP_H,
          PIPE_Y0,
          z - 0.035,
          z + 0.035
        )
      );
    }
  }

  // --- The twelve uplights. A pan on the deck and a head above it, and the head
  // is wider than the pan so the two never share a face - the whole room is this
  // fitting repeated, and a defect in it would be a defect twelve times.
  for (const x of TANK_X) {
    for (const side of [-1, 1] as const) {
      const z = side * LAMP_Z;
      parts.push(
        solid(
          `uplight-pan-${x}-${side}`,
          'frame',
          x - 0.06,
          x + 0.06,
          FLOOR_Y,
          FLOOR_Y + 0.22,
          z - 0.06,
          z + 0.06
        ),
        solid(
          `uplight-${x}-${side}`,
          'lamp',
          x - LAMP_HALF,
          x + LAMP_HALF,
          FLOOR_Y + 0.22,
          FLOOR_Y + 0.34,
          z - LAMP_HALF,
          z + LAMP_HALF
        )
      );
    }
  }

  // --- The perch. S9: one identical rest object in every compartment, on the
  // wall to the left as you come in by the port you are most likely to arrive
  // through. Entering a '+x' port you walk in -x, so +z is your left, and this
  // is the first thing past your shoulder - in the gap between the entry rank
  // and the next one, which is the only piece of wall near that door not already
  // occupied by tanks.
  parts.push(
    solid('perch', 'trim', 4.976, 5.496, 0.5, 0.58, 1.55, 2.17),
    solid('perch-leg', 'frame', 5.4, 5.48, FLOOR_Y, 0.5, 1.82, 1.9)
  );

  // --- The transfer board, opposite the perch. The propellant column, as a
  // thing on a wall you can put a hand on: what this room is for, at the one
  // place in it a player is guaranteed to stand.
  parts.push(
    solid('board', 'frame', 5.396, 5.496, 1.0, 1.52, -2.17, -1.55),
    solid('board-shelf', 'trim', 5.3, 5.4, 0.96, 1.0, -2.13, -1.59)
  );

  return parts;
}

/** One tank: ten facets in courses, with a cap on top and two straps round it. */
function pushTank(target: Sink, cx: number, cz: number, base: number, seed: number): void {
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const towards = new THREE.Vector3();
  const shell = new THREE.Color(PALETTE.HULL);
  const strap = new THREE.Color(CROWN_COLOUR);
  const upper = shell.clone().multiplyScalar(0.84);
  const cap = new THREE.Color(PALETTE.CLOUD);

  /**
   * The courses, bottom to top, and their values.
   *
   * The light does most of the inversion - a fitting 0.32 m off the deck falls
   * off by more than three to one over a tank's own height - but the courses
   * step down as well, so the tanks still read bright-footed in a frame where
   * the nearest uplight is behind the camera. Same trick as the crown's
   * alternating courses: a value change AT a joint, never across one.
   */
  const courses: readonly (readonly [number, number, THREE.Color])[] = [
    [0, 0.55, shell],
    [0.55, 0.62, strap],
    [0.62, 1.25, shell.clone().multiplyScalar(0.93)],
    [1.25, 1.32, strap],
    [1.32, TANK_H, upper],
  ];

  const at = (angle: number, radius: number): { x: number; z: number } => ({
    x: cx + radius * Math.cos(angle),
    z: cz + radius * Math.sin(angle),
  });

  for (const [t0, t1, colour] of courses) {
    for (let i = 0; i < TANK_FACETS; i += 1) {
      const a0 = TANK_PHASE + (i * Math.PI * 2) / TANK_FACETS;
      const a1 = TANK_PHASE + ((i + 1) * Math.PI * 2) / TANK_FACETS;
      const p0 = at(a0, TANK_R);
      const p1 = at(a1, TANK_R);
      const mid = v((p0.x + p1.x) / 2, base + (t0 + t1) / 2, (p0.z + p1.z) / 2);
      // Outward: away from the tank's own axis, so the prism is solid from
      // outside and no facet of it is culled from inside the room.
      towards.set(mid.x + (mid.x - cx), mid.y, mid.z + (mid.z - cz));
      pushQuad(
        target,
        v(p0.x, base + t0, p0.z),
        v(p1.x, base + t0, p1.z),
        v(p1.x, base + t1, p1.z),
        v(p0.x, base + t1, p0.z),
        towards,
        facetColour(colour, mid, seed + i, JITTER)
      );
    }
  }

  // Floor and lid of the prism, as fans. The lid is drawn whole and the cap sits
  // on it back to back: two horizontal faces in one plane pointing opposite ways
  // are a sealed joint, which is how everything in this station is put together.
  for (const [y, up, radius, colour] of [
    [base, false, TANK_R, shell],
    [base + TANK_H, true, TANK_R, upper],
    [base + TANK_H, false, CAP_R, cap],
    [base + TANK_H + CAP_H, true, CAP_R, cap],
  ] as const) {
    const centre = v(cx, y, cz);
    towards.set(cx, up ? y + 1 : y - 1, cz);
    for (let i = 0; i < TANK_FACETS; i += 1) {
      const a0 = TANK_PHASE + (i * Math.PI * 2) / TANK_FACETS;
      const a1 = TANK_PHASE + ((i + 1) * Math.PI * 2) / TANK_FACETS;
      const p0 = at(a0, radius);
      const p1 = at(a1, radius);
      pushFacet(
        target,
        centre,
        v(p0.x, y, p0.z),
        v(p1.x, y, p1.z),
        towards,
        facetColour(colour, centre, seed + 31 + i, JITTER)
      );
    }
  }

  // The cap's own sides, in the brightest value in the room's palette - and
  // still dark, because nothing up here is lit. That is the acceptance
  // criterion, not a compromise.
  for (let i = 0; i < TANK_FACETS; i += 1) {
    const a0 = TANK_PHASE + (i * Math.PI * 2) / TANK_FACETS;
    const a1 = TANK_PHASE + ((i + 1) * Math.PI * 2) / TANK_FACETS;
    const p0 = at(a0, CAP_R);
    const p1 = at(a1, CAP_R);
    const mid = v((p0.x + p1.x) / 2, base + TANK_H + CAP_H / 2, (p0.z + p1.z) / 2);
    towards.set(mid.x + (mid.x - cx), mid.y, mid.z + (mid.z - cz));
    pushQuad(
      target,
      v(p0.x, base + TANK_H, p0.z),
      v(p1.x, base + TANK_H, p1.z),
      v(p1.x, base + TANK_H + CAP_H, p1.z),
      v(p0.x, base + TANK_H + CAP_H, p0.z),
      towards,
      facetColour(cap, mid, seed + 37 + i, JITTER)
    );
  }
}

/** The tank farm, as its own mesh so a failure names it. */
function buildFarm(): THREE.BufferGeometry {
  const target = sink();
  let n = 0;
  for (const x of TANK_X) {
    for (const z of TANK_Z) {
      n += 1;
      if (x === STRAY_FROM_X && z === STRAY_Z) continue;
      pushTank(target, x, z, tankBase(true), SEED + n * 13);
    }
  }
  // S11: the one object out of its stowed position. Standing on the deck in the
  // cross-aisle beside its own cradle, and therefore 0.14 m shorter than the
  // twenty-three around it, which is what makes it read at a distance.
  pushTank(target, STRAY_X, STRAY_Z, tankBase(false), SEED + 401);
  return toGeometry(target);
}

/** Deck, the flat lid and its coffer, two banded walls, two end walls. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deck = new THREE.Color(PALETTE.HULL);
  const lid = new THREE.Color(CROWN_COLOUR);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const inward = new THREE.Vector3();
  /** Where a single-sided surface is looked at FROM, when not the room centre. */
  const seen = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  /** A horizontal panel, faceted both ways, seen from above or from below. */
  const flat = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    up: boolean,
    colour: THREE.Color
  ): void => {
    for (const [xa, xb] of spans(x0, x1)) {
      for (const [za, zb] of spans(z0, z1)) {
        const mid = v((xa + xb) / 2, y, (za + zb) / 2);
        inward.set(mid.x, up ? y + 2 : y - 2, mid.z);
        pushQuad(
          target,
          v(xa, y, za),
          v(xb, y, za),
          v(xb, y, zb),
          v(xa, y, zb),
          inward,
          facetColour(colour, mid, SEED + 3, JITTER)
        );
      }
    }
  };

  /** A run of one of the long walls, faceted along its length. */
  const along = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z: number,
    side: -1 | 1,
    colour: THREE.Color
  ): void => {
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return;
    for (const [xa, xb] of spans(x0, x1)) {
      const mid = v((xa + xb) / 2, (y0 + y1) / 2, z);
      inward.set(mid.x, mid.y, z - side * 1);
      pushQuad(
        target,
        v(xa, y0, z),
        v(xb, y0, z),
        v(xb, y1, z),
        v(xa, y1, z),
        inward,
        // Full-range per-span wear on top of the fbm jitter, which clusters
        // around its middle - the corridor liner's lesson, applied here.
        facetColour(colour, mid, SEED + 7, JITTER).multiplyScalar(panelWear(xa, side))
      );
    }
  };

  /** A run of one of the end walls, faceted across the room. */
  const across = (
    x: number,
    sign: -1 | 1,
    z0: number,
    z1: number,
    y0: number,
    y1: number
  ): void => {
    if (z1 - z0 < 1e-6 || y1 - y0 < 1e-6) return;
    for (const [za, zb] of spans(z0, z1)) {
      const mid = v(x, (y0 + y1) / 2, (za + zb) / 2);
      inward.set(x - sign * 1, mid.y, mid.z);
      pushQuad(
        target,
        v(x, y0, za),
        v(x, y0, zb),
        v(x, y1, zb),
        v(x, y1, za),
        inward,
        facetColour(hull, mid, SEED + 11, JITTER)
      );
    }
  };

  // --- The deck, and it is the LIGHTEST large surface in the room. Everywhere
  // else in the station the floor is HULL_SHADOW and the wall is HULL; here they
  // swap, because twelve fittings 0.32 m off the deck put more light on the deck
  // than on anything else and a floor painted dark under them would only fight
  // its own lighting.
  flat(-HALF_X, HALF_X, -HALF_Z - OVERRUN, HALF_Z + OVERRUN, FLOOR_Y, true, deck);

  // --- The lid: flat at 2.15 everywhere but the entry bay, in three panels
  // around the coffer so nothing is drawn twice.
  flat(-HALF_X, COFFER_X0, -HALF_Z - OVERRUN, HALF_Z + OVERRUN, CEILING_Y, false, lid);
  flat(COFFER_X0, HALF_X, -HALF_Z - OVERRUN, -COFFER_HALF_Z, CEILING_Y, false, lid);
  flat(COFFER_X0, HALF_X, COFFER_HALF_Z, HALF_Z + OVERRUN, CEILING_Y, false, lid);
  flat(COFFER_X0, HALF_X, -COFFER_HALF_Z, COFFER_HALF_Z, COFFER_Y, false, lid);
  // The coffer's three downstands: the header you walk under, and its two
  // cheeks. This is where the 0.35 m of relief is spent and felt.
  along(COFFER_X0, HALF_X, CEILING_Y, COFFER_Y, -COFFER_HALF_Z, -1, lid);
  along(COFFER_X0, HALF_X, CEILING_Y, COFFER_Y, COFFER_HALF_Z, 1, lid);
  // Seen from the room, which is on the -x side of it: the header you walk
  // under one pace in, and the whole of the 0.35 m the ceiling drops.
  across(COFFER_X0, 1, -COFFER_HALF_Z, COFFER_HALF_Z, CEILING_Y, COFFER_Y);

  /**
   * One of the two long walls, in the station's three bands.
   *
   * A 2.15 m ceiling truncates nothing and leaves a 0.10 m crown, which is the
   * point of the band system: the horizon at 2.05 is at the same height in every
   * compartment, so how much crown sits above it is how a player reads a ceiling
   * at a glance. A hand's width of it here against 7.55 m of it in THE CROWN.
   */
  const longWall = (side: -1 | 1): void => {
    const lip = side * HALF_Z;
    const deepest = side * (HALF_Z + deepestRelief(FLOOR_Y, CEILING_Y));

    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const z = side * (HALF_Z - band.relief);
      // The lowest band runs BELOW the deck rather than stopping on it. Two
      // surfaces that merely share an edge leave that edge to floating point,
      // and at a grazing angle a ray finds neither of them - which is not a
      // hairline crack, it is a hairline of outer space.
      const y0 = Math.abs(band.y0 - FLOOR_Y) < 1e-6 ? FLOOR_Y - SKIRT : band.y0;
      along(-RUN_X, RUN_X, y0, band.y1, z, side, new THREE.Color(band.colour));
      if (Math.abs(band.relief) < 1e-6) continue;

      for (const y of [band.y0, band.y1]) {
        // Never in a plane the deck or the lid already owns. A return landing in
        // one of those, facing the same way, is two surfaces fighting for every
        // pixel they cover - and it is invisible to the room-scoped checker,
        // which reads solids, and a liner is not solids.
        if (Math.abs(y - FLOOR_Y) < 1e-6) continue;
        if (Math.abs(y - CEILING_Y) < 1e-6) continue;
        // A horizontal return is seen from ONE side, and which side depends on
        // BOTH which end of the band it is AND which way the band is relieved:
        // a proud band's top is a shelf you look down onto, a recessed band's is
        // a soffit you look up at. Backwards does not draw a dark surface, it
        // draws nothing, and nothing is the exterior pass showing through.
        const above = (y === band.y1) === band.relief > 0;
        seen.set(0, above ? y + 1 : y - 1, 0);
        for (const [xa, xb] of spans(-RUN_X, RUN_X)) {
          pushQuad(
            target,
            v(xa, y, lip),
            v(xb, y, lip),
            v(xb, y, z),
            v(xa, y, z),
            seen,
            facetColour(reveal, v((xa + xb) / 2, y, (lip + z) / 2), SEED + 13, JITTER)
          );
        }
      }
    }

    // The back of the wall, in the two heights the recessed band does not cover.
    //
    // The work band is cut 0.08 m OUTBOARD of the nominal plane and the bands
    // above and below it stand proud of it, so between the two there is a pocket
    // running the length of the room whose outboard side is nothing at all.
    // Nothing is not shadow: the exterior pass has already cleared depth, so it
    // is open space, and it is only invisible from inside because the band in
    // front of it happens to be opaque. Closed here rather than trusted.
    for (const [y0, y1] of [
      [FLOOR_Y - SKIRT, FLOOR_Y + 0.95],
      [FLOOR_Y + 2.05, CEILING_Y],
    ] as const) {
      along(-RUN_X, RUN_X, y0, y1, deepest, side, hull);
    }
  };
  longWall(1);
  longWall(-1);

  /**
   * An end wall, with a real hole in it for the doorway.
   *
   * Out to the deepest band face rather than to the nominal plane: the work band
   * is a groove 0.08 m past HALF_Z running the full 11 m, and an end wall built
   * to HALF_Z leaves that groove open where the room ends - a slot to space,
   * edge-on from the centre line and wide open from anywhere else. The end wall
   * IS the cap on both grooves; a separate cap drawn in the same plane facing
   * the same way would be the defect it was meant to prevent.
   */
  const endWall = (sign: -1 | 1, seamW: number, seamH: number): void => {
    const x = sign * RUN_X;
    const outer = HALF_Z + deepestRelief(FLOOR_Y, CEILING_Y);
    const half = seamW / 2;
    const tall = sign > 0 ? COFFER_HALF_Z : 0;
    across(x, sign, -outer, -Math.max(half, tall), FLOOR_Y - SKIRT, CEILING_Y);
    across(x, sign, Math.max(half, tall), outer, FLOOR_Y - SKIRT, CEILING_Y);
    if (tall > half) {
      // The strip each side of the opening that is inside the coffer, and so
      // 0.35 m taller than the wall beyond it.
      across(x, sign, -tall, -half, FLOOR_Y - SKIRT, COFFER_Y);
      across(x, sign, half, tall, FLOOR_Y - SKIRT, COFFER_Y);
    }
    across(x, sign, -half, half, FLOOR_Y + seamH, sign > 0 ? COFFER_Y : CEILING_Y);
  };
  endWall(1, GALLERY_SEAM.width, GALLERY_SEAM.height);
  endWall(-1, SEAM.width, SEAM.height);

  return toGeometry(target);
}

/**
 * The deck, minus the twenty-four tanks standing on it.
 *
 * Built rather than written out, because the tiling is the load-bearing part: a
 * lattice of aisles that must cover every square metre of deck a foot can land
 * on, must not overlap anywhere, and must touch exactly at shared edges or the
 * walk refuses at a rectangle boundary in the middle of an open floor. Bands
 * across the room in z, each with the pieces of itself that are occupied cut out
 * of it, which is the one construction that cannot double-count.
 */
function floorPlan(): readonly FloorRect[] {
  const rects: FloorRect[] = [];
  const band = (z0: number, z1: number, blocks: readonly (readonly [number, number])[]): void => {
    let x = -WALK_X1;
    for (const [b0, b1] of [...blocks].sort((p, q) => p[0] - q[0])) {
      if (b0 > x) rects.push({ minX: x, maxX: b0, minZ: z0, maxZ: z1, floorY: FLOOR_Y });
      x = Math.max(x, b1);
    }
    if (x < WALK_X1) rects.push({ minX: x, maxX: WALK_X1, minZ: z0, maxZ: z1, floorY: FLOOR_Y });
  };

  const lamps = TANK_X.map((x) => [x - LAMP_KEEP, x + LAMP_KEEP] as const);
  const tanks = TANK_X.map((x) => [x - KEEP, x + KEEP] as const);

  /**
   * An aisle between two ranks, cut around the uplights if it carries any.
   *
   * Two of the five do. A fitting standing 0.34 m off the deck in the middle of
   * a walking line is the one thing in this room a player would put a shin
   * through, and the floor is the only collider there is.
   */
  const aisle = (z0: number, z1: number): void => {
    const mid = (z0 + z1) / 2;
    if (Math.abs(Math.abs(mid) - LAMP_Z) > 1e-6) {
      band(z0, z1, []);
      return;
    }
    band(z0, mid - LAMP_KEEP, []);
    band(mid - LAMP_KEEP, mid + LAMP_KEEP, lamps);
    band(mid + LAMP_KEEP, z1, []);
  };

  let z0 = -WALK_Z1;
  for (const z of TANK_Z) {
    aisle(z0, z - KEEP);
    const blocks: (readonly [number, number])[] = [...tanks];
    // The stray tank stands in a cross-aisle, and a cross-aisle with a tank in
    // it is not a cross-aisle. Blocked whole rather than left as two 120 mm
    // slots either side of it - floor a player could squeeze through, which
    // would look exactly like walking through the tank.
    if (z === STRAY_Z) blocks.push([STRAY_X - 1 + KEEP, STRAY_X + 1 - KEEP]);
    band(z - KEEP, z + KEEP, blocks);
    z0 = z + KEEP;
  }
  aisle(z0, WALK_Z1);
  return rects;
}

function buildGantry(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'gantry';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'gantry-shell';
  root.add(shell);
  const farm = new THREE.Mesh(buildFarm(), liner);
  farm.name = 'gantry-tanks';
  root.add(farm);

  const parts = gantrySolids();
  const materials: Record<string, THREE.MeshLambertMaterial> = {
    frame: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    trim: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.ARRAY),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // Overhead runs take the crown's value. They are the darkest thing in the
    // room along with the lid they hang off, and they are 0.2 m over a standing
    // eye - near-camera dressing is never the brightest thing in a frame.
    pipe: new THREE.MeshLambertMaterial({
      color: new THREE.Color(CROWN_COLOUR),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The lamp-diffuser rule: no diffuse term, the whole value in emissive, or
    // it clips the moment anything bright lands on it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.DAWN_CREAM),
      emissiveIntensity: 0.44,
    }),
  };
  for (const key of Object.keys(materials)) {
    const solids = parts.filter((p) => p.material === key).map((p) => boxOf(p));
    const material = materials[key];
    if (solids.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `gantry-${key}`;
    root.add(mesh);
  }

  // --- The rig, and there is nothing above 0.40 m in it.
  //
  // The hemisphere's two terms are SWAPPED against every other room: the bright
  // half is the one underneath, so even the ambient arrives from below and the
  // lid takes the dimmest term in the room. A downward-facing surface is the one
  // that collects a ground term, so the ceiling would be the brightest thing in
  // here if the ground half were HULL - it is HULL_SHADOW instead, and the lid's
  // own value carries the rest.
  // 0.44, up from 0.34, and the uplight alone could not have done it. The lid
  // is 1.81 m above the fittings and takes the ground term because it faces
  // down, so almost all of its value comes from here; raising the fittings
  // twice over moved it by less than two luma. The inversion is a RATIO, not a
  // pair of absolutes - the deck still reads far brighter - and a ceiling four
  // values off the colour of open space is not a dark ceiling, it is a missing
  // one.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.NIGHT_SIDE).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    0.44
  );
  root.add(ambient);
  // Twelve fittings at knee height in the aisles, and that is the entire look.
  // Decay 1 rather than 2, so a tank two metres away is still lit at its base
  // and the room does not become twelve puddles - and a hard range, so no
  // fitting reaches the wall behind the rank it is lighting.
  for (const x of TANK_X) {
    for (const side of [-1, 1] as const) {
      // 0.56 over 4.2 m, raised from 0.42 over 3.2, and raised the way this
      // room's own rule says to raise it: more uplight, never a lamp.
      //
      // At the original numbers the lid measured luma 28.3 across the pinned
      // frame, in four distinct colours - 2.8 above VOID_SLATE, which is the
      // value of empty space. It was not a dim ceiling, it was no ceiling: the
      // room whose entire claim is that its roof is 0.41 m over your head read
      // as having no roof at all. A ceiling nobody can see cannot press down on
      // anybody.
      //
      // The extra metre of range is what actually does it - the fittings sit at
      // 0.34 m and the lid is 1.81 m above them, so at a 3.2 m cutoff the lid
      // was catching the very end of the falloff. The inversion is untouched:
      // the deck is still much the brighter surface, and nothing in this room
      // is above 0.40 m.
      const lamp = new THREE.PointLight(new THREE.Color(PALETTE.DAWN_CREAM).getHex(), 0.56, 4.2, 1);
      lamp.position.set(x, LAMP_Y, side * LAMP_Z);
      root.add(lamp);
    }
  }

  const floor = floorPlan();

  const points: readonly PointOfInterest[] = [
    // The propellant column, as a thing rather than as a number. Operable,
    // because the hand reaching for it is the only signal in this game that says
    // a thing can be used at all - and it is reachable from the aisle it faces,
    // 0.49 m from a standing eye against a grip that closes at 0.95.
    {
      id: 'propellant',
      label: 'the transfer board',
      position: [5.34, 1.26, -1.86],
      operable: true,
    },
    { id: 'perch', label: 'the perch', position: [5.2, 0.58, 1.86] },
    { id: 'stray', label: 'the tank off its saddle', position: [STRAY_X, 0.9, STRAY_Z] },
    { id: 'farm', label: 'the tank farm', position: [0, 0.9, 0] },
  ];

  let read = 0;

  return {
    root,
    // Standing one pace inside the wide opening, in the central aisle, looking
    // the length of the room. The aft doorway is 11 m away down that aisle and
    // three ranks of tanks stand between the eye and every other part of the
    // floor, which is the whole first impression: a forest, receding, with the
    // light coming up between the trunks.
    spawn: { position: [4.8, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: -0.02 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 88,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * A flat box with one raised bay over the entry.
     *
     * The coffer is in here as well as in the liner because the two have to
     * agree: a hull test that reports 2.15 everywhere would pass a fitting
     * hanging through a lid that is actually at 2.50, and fail one that is
     * legitimately inside the bay.
     */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        ceilingAt(point.x, point.z) - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    interact(id: string): boolean {
      if (id !== 'propellant') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Still. A tank farm is a place where nothing has happened for a long
      // time, and the only thing in here that moves is the player.
      void read;
    },

    dispose(): void {
      shell.geometry.dispose();
      farm.geometry.dispose();
      liner.dispose();
      for (const material of Object.values(materials)) material.dispose();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      root.clear();
    },
  };
}

export const GANTRY: CompartmentDefinition = {
  id: 'gantry',
  name: 'THE GANTRY',
  description: 'Twenty-four propellant tanks, 11.0 by 7.6 m, lit from the deck up.',
  ports: PORTS,
  extent: EXTENT,
  build: buildGantry,
};

export const GANTRY_SOLO = {
  id: 'gantry',
  name: 'THE GANTRY',
  description: 'Twenty-four propellant tanks, 11.0 by 7.6 m, lit from the deck up.',
  build: () => soloStation(GANTRY),
};

export default GANTRY_SOLO;
