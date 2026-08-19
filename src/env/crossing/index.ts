/**
 * THE CROSSING - the hub, and the first room with no symmetry left in it.
 *
 * It replaces THE NODE rather than fixing it, and the reason is in the shape.
 * The node is a regular octagon: symmetric under a quarter turn, four identical
 * doors on four identical faces. That reads instantly as deliberate, which was
 * the argument for it - but it also means the room cannot tell you anything.
 * Every direction out of it looks the same, so standing in it you learn nothing
 * about where you have been or where you are going, and a hub whose whole job is
 * to be the place you hold a map in your head is the one room that must not be
 * uniform.
 *
 * So: 5.40 by 4.20 m, and no two edges of it alike.
 *
 * THE CEILING IS NOT LEVEL. It is 2.60 m where you come in and 4.40 m at the far
 * end, in nine flat facets. That one decision does most of the work. It climbs
 * AWAY from the door you arrive through, so the room opens up as you walk into
 * it rather than behind you; you can see which way is "up the room" from
 * anywhere, including from inside a doorway with your back to everything else;
 * and because the facets are flat and the keys are low, the nine of them take
 * nine different values and the ceiling stops being a lid.
 *
 * FOUR PORTS, FOUR DIFFERENT KINDS. Centred and level, back to the corridor you
 * came from. Offset 0.45 m off the centreline at the far end, onward to the
 * bend. Raised 0.45 m onto a platform, and wide, into the tall room. Recessed
 * into a niche in the port wall, down to the racks. A player who has been here
 * twice can tell which door is which from the middle of the room without reading
 * anything, and that is the entire purpose of the compartment.
 *
 * THE TRUNK IS WHY. A 45-degree pressure trunk crosses the far port corner, and
 * every asymmetry above is that trunk's fault: the ceiling lifts to clear it, the
 * onward port slides off centre to miss it, the deck comes up over it as the
 * platform. The station is otherwise entirely orthogonal, so one diagonal mass
 * reads as structure rather than as styling. A room that is irregular for no
 * reason feels arbitrary; a room that is irregular for one visible reason feels
 * built.
 *
 * WHAT HAPPENS HERE. The offer queue - STRUCTURE.md's `SITUATIONS` block. Every
 * route in the station crosses this room, so this is where standing work is
 * posted: a board you pass on the way in, listing what is outstanding and never
 * once asking for it. Sites ask, they never plead.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { GALLERY_SEAM, SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import { CROWN_COLOUR, REVEAL_COLOUR, bands, deepestRelief } from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

const HALF_X = 2.7;
const HALF_Z = 2.1;
const FLOOR_Y = 0;

/**
 * Low where you come in (+x, toward the corridor), high at the far end.
 *
 * The station runs aft in -x from the limb deck, so +x is always "back the way
 * you came". Putting the low end there means the room grows in front of you.
 */
const CEIL_LOW = 2.6;
const CEIL_HIGH = 4.4;
/** Nine, so no facet is a half or a third of the run and the count is odd. */
const CEIL_FACETS = 9;

/**
 * How far inboard of a port plane the wall that carries the port is built.
 *
 * A flat wall only has to clear the seam by SEAM_INSET_M. A wall cut into the
 * station's three bands does not: the work band is a groove, and a groove is
 * cut OUTBOARD of the nominal plane, so on a wall with a port in it the whole
 * groove - face, both returns and all - stands in the next compartment, where
 * that room's own groove already is. Standing the wall off by its own deepest
 * relief as well puts the deepest face where the nominal plane used to be, one
 * seam inset short of the seam, and nothing this room draws crosses it. The
 * band a body actually looks at does not move; the two shallower ones come in.
 */
const PORT_WALL_SETBACK = deepestRelief(FLOOR_Y, CEIL_HIGH) + SEAM_INSET_M;
/** The ported long walls, at their own plane rather than the seam's. */
const WALL_Z = HALF_Z - PORT_WALL_SETBACK;

/** The trunk's chamfer across the far port corner, measured along each wall. */
const CHAMFER = 0.9;
/**
 * The chamfer plane, as the one number everything else tests against: inside is
 * `x + z >= CHAMFER_D`.
 *
 * Written once because three separate things need it - the liner that draws it,
 * `contains` which has to agree with the liner or the hull test lies, and the
 * floor rectangles which must not reach into it. Three hand-derived copies of
 * one diagonal is three chances to leave a hole in a wall.
 */
const CHAMFER_D = -HALF_X - HALF_Z + CHAMFER;
/**
 * Where the trunk meets the port wall, along the wall's own run.
 *
 * The trunk is a diagonal, so the point it crosses that wall moves with the
 * wall: read it off the chamfer rather than off HALF_Z, or standing the wall
 * off the seam leaves an 86 mm slot from deck to crown in the corner, which is
 * a slot to space.
 */
const TRUNK_AT_WALL = CHAMFER_D + WALL_Z;

/** The platform in the far starboard quarter, and the tread onto it. */
const PLATFORM_Y = 0.45;
const TREAD_Y = 0.225;
/** Fore edge of both, i.e. the end nearer the door you came in by. */
const RISE_X1 = -0.2;
const TREAD_Z0 = 0.25;
const PLATFORM_Z0 = 0.55;

const SEED = 0x0c8;
const JITTER = 0.055;
const EYE_HEIGHT = 1.74;

/** Where the ceiling is at a given station along the room. */
function ceilingAt(x: number): number {
  const t = (HALF_X - x) / (2 * HALF_X);
  return CEIL_LOW + (CEIL_HIGH - CEIL_LOW) * Math.min(Math.max(t, 0), 1);
}

/**
 * Four ports, no two alike.
 *
 * `high` is the only one carrying GALLERY_SEAM and the only one off the main
 * deck. Its floor height is declared 0.45 because the seam check compares the
 * two sides' local deck heights and refuses a connection that would put a step
 * in the middle of a doorway - so THE CROWN beyond it stands on its own deck at
 * 0.45 too, and the station gets a genuine upper level rather than a lip.
 */
const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, SEAM.height / 2, -0.45], '-x', FLOOR_Y),
  port(
    'high',
    [-1.4, PLATFORM_Y + GALLERY_SEAM.height / 2, HALF_Z],
    '+z',
    PLATFORM_Y,
    GALLERY_SEAM
  ),
  port('low', [0.9, SEAM.height / 2, -HALF_Z], '-z', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.2,
  maxY: CEIL_HIGH + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

function crossingSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The platform and its tread. Real boxes, so the edge has a thickness you
  // can see, rather than the floor height simply changing with nothing between
  // the two levels.
  parts.push(
    solid(
      'platform',
      'frame',
      -HALF_X + 0.02,
      RISE_X1,
      FLOOR_Y,
      PLATFORM_Y,
      PLATFORM_Z0,
      HALF_Z - 0.02
    ),
    solid('tread', 'frame', -HALF_X + 0.02, RISE_X1, FLOOR_Y, TREAD_Y, TREAD_Z0, PLATFORM_Z0),
    // A nosing on each riser: the one place in the station a foot lands on an
    // edge. It sits entirely ON TOP of the tread rather than flush into its
    // face, and is held short of the tread in x. Both of those are the
    // coplanar-face rule: a lip whose top is level with the deck it edges shares
    // that deck's plane and the two fight for every pixel they cover.
    solid(
      'nose-low',
      'trim',
      -HALF_X + 0.08,
      RISE_X1 - 0.06,
      TREAD_Y,
      TREAD_Y + 0.02,
      TREAD_Z0,
      TREAD_Z0 + 0.08
    ),
    solid(
      'nose-high',
      'trim',
      -HALF_X + 0.08,
      RISE_X1 - 0.06,
      PLATFORM_Y,
      PLATFORM_Y + 0.02,
      PLATFORM_Z0,
      PLATFORM_Z0 + 0.08
    )
  );

  // --- The offer board: where the standing situations print. On the starboard
  // wall by the door you come in through, so it is the first thing in the room
  // on the way in and in nobody's way on the way out.
  parts.push(
    solid('board', 'frame', 1.32, 2.5, 0.95, 1.85, 2.0, 2.06),
    solid('board-lip', 'trim', 1.32, 2.5, 0.95, 0.99, 1.94, 2.0)
  );

  // --- The perch. S9: one identical rest object in every compartment, within
  // 2 m of the primary entry and on the left as you come in, so the player has
  // one fixed thing to orient off in a station with no signage.
  parts.push(
    solid('perch', 'trim', 1.28, 1.9, 0.5, 0.58, -2.06, -1.54),
    solid('perch-leg', 'frame', 1.32, 1.4, FLOOR_Y, 0.5, -1.7, -1.62)
  );

  // --- The trunk's brackets: axis-aligned steel where the diagonal meets the
  // orthogonal station. The diagonal itself is liner, because a Solid is a box
  // and a box cannot sit at 45 degrees - but the thing has to be BOLTED to
  // something or it reads as a fold in the wallpaper.
  // Stood off the diagonal by more than their own half-width, because a box
  // centred ON a 45-degree plane puts its nearest CORNER through it - the same
  // arithmetic that once pushed four equipment stacks 144 mm through a wall.
  const BRACKET_HALF = 0.08;
  for (const [n, t] of [0.28, 0.62].entries()) {
    const x = -HALF_X + CHAMFER * t + 0.12;
    const z = CHAMFER_D - x + 2 * BRACKET_HALF + 0.04;
    parts.push(
      solid(
        `trunk-bracket-${n}`,
        'frame',
        x - BRACKET_HALF,
        x + BRACKET_HALF,
        0.62 + n * 1.15,
        0.78 + n * 1.15,
        z - BRACKET_HALF,
        z + BRACKET_HALF
      )
    );
  }

  // --- Two lamps at two heights, because the ceiling is at two heights: one low
  // over the near end, one high over the far, so the slope is lit rather than
  // merely present.
  parts.push(
    solid('lamp-near', 'lamp', 0.7, 2.1, CEIL_LOW - 0.16, CEIL_LOW - 0.08, -0.34, 0.34),
    // Hung off the LOWEST ceiling it spans, not the ceiling at its middle. Under
    // a sloping crown those are 0.5 m apart, and sizing to the middle put this
    // fitting 53 mm through the roof at its low end - which no interior pose can
    // see and the hull check caught immediately.
    solid(
      'lamp-far',
      'lamp',
      -2.2,
      -0.8,
      ceilingAt(-0.8) - 0.18,
      ceilingAt(-0.8) - 0.1,
      -0.34,
      0.34
    )
  );

  // --- S11: exactly one thing out of its stowed position, and one only. A
  // restraint strap hanging off the perch instead of clipped back to it.
  parts.push(solid('strap', 'trim', 1.42, 1.5, 0.16, 0.5, -1.86, -1.82));

  return parts;
}

/** Deck, the sloped crown, four walls, and the diagonal across the far corner. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const roof = new THREE.Color(CROWN_COLOUR);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const inward = new THREE.Vector3();
  /** Where a single-sided surface is looked at from, when not the room centre. */
  const seen = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  const deckQuad = (x0: number, x1: number, z0: number, z1: number, y: number): void => {
    inward.set((x0 + x1) / 2, y + 2, (z0 + z1) / 2);
    pushQuad(
      target,
      v(x0, y, z0),
      v(x1, y, z0),
      v(x1, y, z1),
      v(x0, y, z1),
      inward,
      facetColour(deck, v((x0 + x1) / 2, y, (z0 + z1) / 2), SEED, JITTER)
    );
  };

  // --- Deck. Stepped in x across the chamfer so no quad crosses the diagonal,
  // then the two raised levels.
  // One continuous deck at y = 0 across the whole footprint. The two raised
  // levels are the platform and tread SOLIDS standing on it, and they are not
  // drawn again here: a liner quad at the platform's own top height is the same
  // plane facing the same way as the box's lid, which is 4.5 m2 of two surfaces
  // fighting for every pixel. Their undersides sit ON the deck rather than 20 mm
  // above it, so the two meet back to back and neither is exposed.
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const x0 = -HALF_X + (CHAMFER * i) / steps;
    const x1 = -HALF_X + (CHAMFER * (i + 1)) / steps;
    // Clipped to the strip's FAR edge, where the diagonal has cut deepest.
    // Clipping to the near edge leaves a triangle of missing deck against the
    // trunk on every strip, and missing deck is not a gap in the floor - the
    // exterior pass has already cleared depth, so it is open space.
    deckQuad(x0, x1, CHAMFER_D - x1, HALF_Z, FLOOR_Y);
  }
  deckQuad(-HALF_X + CHAMFER, RISE_X1, -HALF_Z, HALF_Z, FLOOR_Y);
  deckQuad(RISE_X1, HALF_X, -HALF_Z, HALF_Z, FLOOR_Y);

  // --- The crown, in nine flat facets running up the room.
  for (let i = 0; i < CEIL_FACETS; i += 1) {
    const x0 = -HALF_X + (2 * HALF_X * i) / CEIL_FACETS;
    const x1 = -HALF_X + (2 * HALF_X * (i + 1)) / CEIL_FACETS;
    const y0 = ceilingAt(x0);
    const y1 = ceilingAt(x1);
    inward.set((x0 + x1) / 2, 0, 0);
    pushQuad(
      target,
      v(x0, y0, -HALF_Z),
      v(x1, y1, -HALF_Z),
      v(x1, y1, HALF_Z),
      v(x0, y0, HALF_Z),
      inward,
      facetColour(roof, v((x0 + x1) / 2, (y0 + y1) / 2, 0), SEED + i * 7, JITTER)
    );
  }

  // --- The two long walls, in the station's three bands, split per ceiling
  // facet so the crown band's top follows the slope.
  /** Where a wall is opened, in the wall's own run coordinate and in height. */
  interface Opening {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  }
  const OPENINGS: Record<'-1' | '1', Opening> = {
    '1': {
      x0: -1.4 - GALLERY_SEAM.width / 2,
      x1: -1.4 + GALLERY_SEAM.width / 2,
      y0: PLATFORM_Y,
      y1: PLATFORM_Y + GALLERY_SEAM.height,
    },
    '-1': {
      x0: 0.9 - SEAM.width / 2,
      x1: 0.9 + SEAM.width / 2,
      y0: FLOOR_Y,
      y1: FLOOR_Y + SEAM.height,
    },
  };

  /**
   * A run of wall, in the station's three bands, cut around its own doorway.
   *
   * The cut is the part that was missing. Both side walls were drawn straight
   * across their openings and a three-plane recess painted on top, which looks
   * right only for as long as neither port is connected - the station blanks an
   * unjoined port, so nothing showed. Join one and the player walks through what
   * is still, as far as the geometry is concerned, solid hull.
   */
  const wallBands = (x0: number, x1: number, side: -1 | 1): void => {
    const top0 = ceilingAt(x0);
    const top1 = ceilingAt(x1);
    const open = OPENINGS[side > 0 ? '1' : '-1'];
    inward.set((x0 + x1) / 2, Math.min(top0, top1) / 2, 0);

    for (const band of bands(FLOOR_Y, Math.min(top0, top1))) {
      const z = side * (WALL_Z - band.relief);
      const lip = side * WALL_Z;
      const isCrown = band.name === 'crown';
      const topAt = (x: number): number => (isCrown ? ceilingAt(x) : band.y1);
      const colour = new THREE.Color(band.colour);

      /** One trapezoid of wall: flat at the bottom, following the crown on top. */
      const slab = (xa: number, xb: number, ya: number, yb0: number, yb1: number): void => {
        if (xb - xa < 1e-6 || (yb0 - ya < 1e-6 && yb1 - ya < 1e-6)) return;
        pushQuad(
          target,
          v(xa, ya, z),
          v(xb, ya, z),
          v(xb, Math.max(yb1, ya), z),
          v(xa, Math.max(yb0, ya), z),
          inward,
          facetColour(colour, v((xa + xb) / 2, ya + 0.4, z), SEED + 3, JITTER)
        );
      };

      /** The same run, with the doorway taken out of it. */
      const cut = (xa: number, xb: number): void => {
        if (open.y0 > band.y0) {
          slab(xa, xb, band.y0, Math.min(open.y0, topAt(xa)), Math.min(open.y0, topAt(xb)));
        }
        slab(xa, xb, Math.max(open.y1, band.y0), topAt(xa), topAt(xb));
      };

      const a = Math.max(x0, open.x0);
      const b = Math.min(x1, open.x1);
      if (b <= a) {
        slab(x0, x1, band.y0, topAt(x0), topAt(x1));
      } else {
        slab(x0, a, band.y0, topAt(x0), topAt(a));
        cut(a, b);
        slab(b, x1, band.y0, topAt(b), topAt(x1));
      }

      // The returns that close each band's depth back to the nominal plane. A
      // band floating at a depth with no return is a hole in the hull.
      if (Math.abs(band.relief) > 1e-6) {
        for (const [ya, yb, top] of [
          [band.y0, band.y0, false],
          [topAt(x0), topAt(x1), true],
        ] as const) {
          // Not in the deck's plane or the crown's. A return landing in a plane
          // the deck or the ceiling already owns, facing the same way, is two
          // surfaces fighting for every pixel - 2.05 m2 of it here, invisible to
          // the room-scoped checker, which reads solids rather than liner.
          if (Math.abs(ya - FLOOR_Y) < 1e-6) continue;
          if (top && isCrown) continue;
          // Seen from one side, and which side depends on both which end of the
          // band it is and which way it is relieved: a proud band's top is a
          // shelf you look down onto, a recessed band's is a soffit.
          const above = top === band.relief > 0;
          seen.set((x0 + x1) / 2, above ? ya + 1 : ya - 1, 0);
          pushQuad(
            target,
            v(x0, ya, lip),
            v(x1, yb, lip),
            v(x1, yb, z),
            v(x0, ya, z),
            seen,
            facetColour(reveal, v((x0 + x1) / 2, ya, (lip + z) / 2), SEED + 5, JITTER)
          );
        }
      }
    }
  };
  for (let i = 0; i < CEIL_FACETS; i += 1) {
    const x0 = -HALF_X + (2 * HALF_X * i) / CEIL_FACETS;
    const x1 = -HALF_X + (2 * HALF_X * (i + 1)) / CEIL_FACETS;
    // The port wall stops where the trunk takes over; starboard runs the length.
    if (x1 > TRUNK_AT_WALL) wallBands(Math.max(x0, TRUNK_AT_WALL), x1, -1);
    wallBands(x0, x1, 1);
  }

  // --- The end walls, each with its own doorway cut out.
  const endWall = (x: number, sign: -1 | 1, openZ: number): void => {
    inward.set(x - sign * 1, ceilingAt(x) / 2, 0);
    const top = ceilingAt(x);
    const halfW = SEAM.width / 2;
    // Out to the deepest band face, not to the nominal wall plane. The work band
    // is recessed 0.08 m past HALF_Z, and an end wall stopping at HALF_Z leaves
    // that groove open where the room ends - a slot straight through to space,
    // 22 px wide and 220 tall in the first frame that was rendered of this room.
    const outerZ = HALF_Z + deepestRelief(FLOOR_Y, top);
    const near = sign < 0 ? CHAMFER_D - x : -outerZ;
    const wall = (z0: number, z1: number, y0: number, y1: number): void => {
      if (z1 - z0 < 1e-6 || y1 - y0 < 1e-6) return;
      pushQuad(
        target,
        v(x, y0, z0),
        v(x, y0, z1),
        v(x, y1, z1),
        v(x, y1, z0),
        inward,
        facetColour(hull, v(x, (y0 + y1) / 2, (z0 + z1) / 2), SEED + 11, JITTER)
      );
    };
    wall(near, openZ - halfW, FLOOR_Y, top);
    wall(openZ + halfW, outerZ, FLOOR_Y, top);
    wall(openZ - halfW, openZ + halfW, SEAM.height, top);
  };
  endWall(HALF_X - SEAM_INSET_M, 1, 0);
  endWall(-(HALF_X - SEAM_INSET_M), -1, -0.45);

  // --- The two side doorways, as three-plane recesses rather than holes, so an
  // opening reads as a thickness instead of a rectangle painted on a wall (S5).
  const sideDoor = (
    atX: number,
    side: -1 | 1,
    sillY: number,
    seamW: number,
    seamH: number
  ): void => {
    // The reveal covers the wall's whole THICKNESS, not just the strip outboard
    // of the nominal plane. The doorway is cut in the BAND FACES and the crown
    // band stands 0.14 m proud of the plane, so a reveal that starts at the
    // plane leaves an open slot over the head: a ray in through the doorway
    // climbs through it and out of the station, 1 168 pixels of it from a pose
    // 1.3 m off the centre line. It ends one seam inset short of the seam,
    // because a jamb carried into the next compartment meets the jamb that room
    // built for the same doorway - and it is still shallower than the 0.12 the
    // station's blank plate is thick, so a solo review cannot see past the
    // plate and out along the reveal.
    const proudest = Math.max(0, ...bands(FLOOR_Y, ceilingAt(atX)).map((b) => b.relief));
    const z = side * (WALL_Z - proudest);
    const depth = proudest + PORT_WALL_SETBACK - SEAM_INSET_M;
    const halfW = seamW / 2;
    inward.set(atX, sillY + seamH / 2, 0);
    for (const a of [atX - halfW, atX + halfW]) {
      pushQuad(
        target,
        v(a, sillY, z),
        v(a, sillY, z + side * depth),
        v(a, sillY + seamH, z + side * depth),
        v(a, sillY + seamH, z),
        inward,
        facetColour(hull, v(a, sillY + seamH / 2, z), SEED + 13, JITTER)
      );
    }
    pushQuad(
      target,
      v(atX - halfW, sillY + seamH, z),
      v(atX + halfW, sillY + seamH, z),
      v(atX + halfW, sillY + seamH, z + side * depth),
      v(atX - halfW, sillY + seamH, z + side * depth),
      inward,
      facetColour(hull, v(atX, sillY + seamH, z), SEED + 17, JITTER)
    );
  };
  sideDoor(-1.4, 1, PLATFORM_Y, GALLERY_SEAM.width, GALLERY_SEAM.height);
  sideDoor(0.9, -1, FLOOR_Y, SEAM.width, SEAM.height);

  // --- And the same groove, capped where the port wall's run stops against the
  // trunk. The end walls close both ends of the starboard run and the fore end
  // of this one; this is the fourth and last open end of a recessed band.
  {
    const x = TRUNK_AT_WALL;
    const top = ceilingAt(x);
    inward.set(x + 0.5, top / 2, 0);
    for (const band of bands(FLOOR_Y, top)) {
      if (band.relief >= 0) continue;
      const z = -(WALL_Z - band.relief);
      pushQuad(
        target,
        v(x, band.y0, -WALL_Z),
        v(x, band.y0, z),
        v(x, band.y1, z),
        v(x, band.y1, -WALL_Z),
        inward,
        facetColour(hull, v(x, (band.y0 + band.y1) / 2, z), SEED + 23, JITTER)
      );
    }
  }

  // --- The trunk: one diagonal plane across the far port corner, deck to crown,
  // and the only surface in the station that is not square to something.
  {
    const ax = -HALF_X;
    const az = CHAMFER_D + HALF_X;
    const bx = CHAMFER_D + HALF_Z;
    const bz = -HALF_Z;
    inward.set(0, CEIL_HIGH / 2, 0);
    pushQuad(
      target,
      v(ax, FLOOR_Y, az),
      v(bx, FLOOR_Y, bz),
      v(bx, ceilingAt(bx), bz),
      v(ax, ceilingAt(ax), az),
      inward,
      facetColour(
        new THREE.Color(PALETTE.HULL),
        v((ax + bx) / 2, 1.2, (az + bz) / 2),
        SEED + 19,
        JITTER
      )
    );
  }

  return toGeometry(target);
}

function buildCrossing(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'crossing';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'crossing-shell';
  root.add(shell);

  const parts = crossingSolids();
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
    // The lamp-diffuser rule: no diffuse term, the whole value in emissive, or
    // it clips the moment anything bright lands on it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.CLOUD),
      emissiveIntensity: 0.42,
    }),
  };
  for (const key of Object.keys(materials)) {
    const solids = parts.filter((p) => p.material === key).map((p) => boxOf(p));
    const material = materials[key];
    if (solids.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `crossing-${key}`;
    root.add(mesh);
  }

  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    // 0.80, down from 1.05. The hub's whole claim is a ceiling that climbs
    // from 2.6 to 4.4 m, and a climbing ceiling is only legible as a value
    // gradient - which an ambient term this strong was washing flat. The keys
    // below do the work instead, and they have a direction to do it with.
    0.8
  );
  root.add(ambient);
  // Two keys at the two lamp heights, so the low end and the high end are lit by
  // different fittings and read as different amounts of space.
  for (const [x, y, strength] of [
    [1.4, CEIL_LOW - 0.2, 0.58],
    [-1.5, ceilingAt(-1.5) - 0.2, 0.5],
  ] as const) {
    const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.CLOUD).getHex(), strength);
    key.position.set(x, y, 0);
    key.target.position.set(x - 0.6, FLOOR_Y, 0.8);
    root.add(key, key.target);
  }
  // One wash up the sloping crown, because a ceiling nobody lights is a ceiling
  // nobody sees, and the slope is the whole room.
  const up = new THREE.DirectionalLight(new THREE.Color(PALETTE.HULL).getHex(), 0.34);
  up.position.set(-0.5, 1.0, 0);
  up.target.position.set(-2.2, CEIL_HIGH, 0);
  root.add(up, up.target);

  /**
   * Two levels, and the rectangles held clear of the diagonal.
   *
   * The tread and the platform touch their neighbours exactly at their shared
   * edge rather than overlapping. That is what lets the walk cross between deck
   * heights: the union stays continuous, so the step is a step, and the eye
   * settles onto the new height over its own time constant instead of the walk
   * being refused at a rectangle boundary.
   */
  const floor: readonly FloorRect[] = [
    { minX: -HALF_X + 0.08, maxX: -2.2, minZ: -1.28, maxZ: TREAD_Z0, floorY: FLOOR_Y },
    { minX: -2.2, maxX: -1.8, minZ: -1.7, maxZ: TREAD_Z0, floorY: FLOOR_Y },
    { minX: -1.8, maxX: RISE_X1, minZ: -HALF_Z + 0.08, maxZ: TREAD_Z0, floorY: FLOOR_Y },
    {
      minX: RISE_X1,
      maxX: HALF_X - 0.08,
      minZ: -HALF_Z + 0.08,
      maxZ: HALF_Z - 0.08,
      floorY: FLOOR_Y,
    },
    { minX: -HALF_X + 0.08, maxX: RISE_X1, minZ: TREAD_Z0, maxZ: PLATFORM_Z0, floorY: TREAD_Y },
    {
      minX: -HALF_X + 0.08,
      maxX: RISE_X1,
      minZ: PLATFORM_Z0,
      maxZ: HALF_Z - 0.08,
      floorY: PLATFORM_Y,
    },
  ];

  const points: readonly PointOfInterest[] = [
    // The offer queue. Operable, because reading the board is a thing the player
    // does - and because the arm reaching for it is the only signal in this game
    // that says a thing can be used at all.
    { id: 'board', label: 'the situations board', position: [1.9, 1.4, 1.94], operable: true },
    { id: 'perch', label: 'the perch', position: [1.6, 0.58, -1.8] },
    { id: 'trunk', label: 'the pressure trunk', position: [-2.2, 1.3, -1.5] },
  ];

  let read = 0;

  return {
    root,
    // Standing just inside the door you arrive by, facing up the room, so the
    // slope is the first thing in frame.
    spawn: { position: [1.9, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.05 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 46,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * A box with a sloping lid and one corner cut off.
     *
     * The chamfer term uses the same CHAMFER_D the liner is drawn from. If those
     * two ever disagree the hull test passes while the wall has a hole in it,
     * which is the failure this function exists to catch.
     */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        ceilingAt(point.x) - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z),
        (point.x + point.z - CHAMFER_D) / Math.SQRT2
      );
    },

    interact(id: string): boolean {
      if (id !== 'board') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Still, like the corridor either side of it. The hub is where the player
      // stops to decide, and a room that moves is a room that hurries you.
      void read;
    },

    dispose(): void {
      shell.geometry.dispose();
      liner.dispose();
      for (const material of Object.values(materials)) material.dispose();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      root.clear();
    },
  };
}

export const CROSSING: CompartmentDefinition = {
  id: 'crossing',
  name: 'THE CROSSING',
  description: 'The hub, 5.4 by 4.2 m, its ceiling climbing 2.6 to 4.4.',
  ports: PORTS,
  extent: EXTENT,
  build: buildCrossing,
};

export const CROSSING_SOLO = {
  id: 'crossing',
  name: 'THE CROSSING',
  description: 'The hub, 5.4 by 4.2 m, its ceiling climbing 2.6 to 4.4.',
  build: () => soloStation(CROSSING),
};

export default CROSSING_SOLO;
