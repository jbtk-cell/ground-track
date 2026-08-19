/**
 * THE CROWN - the room the whole station has been compressing you for.
 *
 * 6.60 by 5.00 m on the deck and 9.60 m to the underside of the aperture. That
 * is a 5.5:1 ratio against a standing eye, and it is the only place in the
 * station where the answer to "how big is this" is not "about a corridor".
 * Everything before it - the duct, the deck, the run, the hub - is between 2.35
 * and 4.40 m to the ceiling. This is more than twice the tallest of them, and it
 * is met immediately after the hub's own 2.60 m doorway, through the wide low
 * GALLERY_SEAM, which is the oldest trick there is: you get the volume by
 * squeezing the thing in front of it.
 *
 * THE VALUE STRUCTURE INVERTS HERE, and only here. Everywhere else in the
 * station the wall is dark at the top - the crown band is the darkest surface in
 * the room, because a dark ceiling is what makes a low room feel calm instead of
 * cramped. In this room the upper wall is the LIGHTEST surface in the whole
 * station, and it is crossed by three dark gallery bands. The reason is Skylab,
 * which had the same problem and solved it the same way: a tall volume lit from
 * the top reads as tall only if the top is bright, and the horizontal bands are
 * what give the eye something to count the height in. Without them you cannot
 * tell 9 m from 5 m; with them you can count three.
 *
 * THE GALLERIES ARE UNREACHABLE, and that is deliberate rather than unfinished.
 * They are at 3.20, 5.60 and 8.00 m above the deck with no ladder modelled,
 * because visible space you cannot get to is the cheapest way to make a station
 * feel bigger than the part of it you are allowed in. A room whose every surface
 * is reachable is a room whose size you have already measured.
 *
 * THE APERTURE IS NOT A HOLE. It reads as a canted six-pane skylight and it is
 * solid, because the exterior pass clears depth before an interior draws, so an
 * actual opening here would not be a view - it would be a hole to space, and the
 * airtight gate would fail it correctly. Only the anchor compartment may paint
 * an exterior. What this gets instead is the light: one hard key down through the
 * panes, which is what puts the value on the upper wall.
 *
 * WHAT HAPPENS HERE. The map. STRUCTURE.md's regime rings and the coverage
 * quilt - the slow win, the thing that is a little more your colour than it was
 * yesterday. It is a plot table in the middle of the floor with the regime
 * annuli standing proud of it as square rings, and it is in this room because
 * this is the only room with the height to pull the camera back in.
 *
 * IT STANDS ON THE UPPER DECK, at y = 0.45, reached over the hub's platform. The
 * seam check compares local deck heights across a join and refuses a step in the
 * middle of a doorway, so this room's floor genuinely is 0.45 m above the
 * station's main deck rather than pretending to be.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { GALLERY_SEAM, SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import { CROWN_COLOUR, REVEAL_COLOUR, WORK_TOP_M, bands, deepestRelief } from '../kit/bands';
import { REGIMES, mapFraction } from '../../sim';
import type { FloorRect, PointOfInterest } from '../types';

const HALF_X = 3.3;
const HALF_Z = 2.5;
/** The upper deck. Not zero, and the whole station is 0.45 m below this room. */
const FLOOR_Y = 0.45;
const HEIGHT = 9.6;
const CEILING_Y = FLOOR_Y + HEIGHT;

/**
 * How far inboard of a port plane the wall that carries the port is built.
 *
 * A flat wall only has to clear the seam by SEAM_INSET_M. A banded one does
 * not: the work band is a groove cut OUTBOARD of the nominal plane, so on a
 * wall with a port in it the groove - face, both returns and all - stands in
 * the next compartment, on top of that room's own groove. Standing the wall off
 * by this room's deepest relief as well puts the deepest face where the nominal
 * plane used to be, one seam inset short of the seam. Nothing this room draws
 * crosses into the magazine, and the band at eye level does not move.
 */
const PORT_WALL_SETBACK = deepestRelief(FLOOR_Y, FLOOR_Y + WORK_TOP_M) + SEAM_INSET_M;
/** The two ported walls, at their own plane rather than at the seam. */
const WALL_X = HALF_X - PORT_WALL_SETBACK;

/** Galleries, measured above this room's own deck. */
const GALLERY_YS = [3.2, 5.6, 8.0] as const;
const GALLERY_W = 0.85;
const GALLERY_T = 0.12;

/** The aperture: six canted panes, and none of them a hole. */
const PANES = 6;
const APERTURE_HALF_X = 1.5;
const APERTURE_HALF_Z = 1.1;
const APERTURE_RISE = 0.55;

const SEED = 0x0cf;
const JITTER = 0.05;
const EYE_HEIGHT = 1.74;

const PORTS = [
  port('fore', [HALF_X, FLOOR_Y + GALLERY_SEAM.height / 2, 0], '+x', FLOOR_Y, GALLERY_SEAM),
  port('aft', [-HALF_X, FLOOR_Y + SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: FLOOR_Y - 0.25,
  maxY: CEILING_Y + APERTURE_RISE + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

function crownSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The three galleries. Four walks each, ABUTTING at the corners rather
  // than overlapping: overlapping boxes share their end faces, and two faces in
  // one plane pointing one way fight for every pixel they cover.
  const inset = 0.06;
  for (const [n, above] of GALLERY_YS.entries()) {
    const y0 = FLOOR_Y + above;
    const y1 = y0 + GALLERY_T;
    const xa = -HALF_X + inset;
    const xb = HALF_X - inset;
    const za = -HALF_Z + inset;
    const zb = HALF_Z - inset;
    parts.push(
      solid(`gallery-${n}-port`, 'gallery', xa, xb, y0, y1, za, za + GALLERY_W),
      solid(`gallery-${n}-starboard`, 'gallery', xa, xb, y0, y1, zb - GALLERY_W, zb),
      solid(
        `gallery-${n}-aft`,
        'gallery',
        xa,
        xa + GALLERY_W,
        y0,
        y1,
        za + GALLERY_W,
        zb - GALLERY_W
      ),
      solid(
        `gallery-${n}-fore`,
        'gallery',
        xb - GALLERY_W,
        xb,
        y0,
        y1,
        za + GALLERY_W,
        zb - GALLERY_W
      )
    );
    // A rail on the inner edge of each walk, standing on top of it so the two
    // never share a plane. Four bars, abutting, same rule as the walks.
    const ri = 0.07;
    const rx0 = xa + GALLERY_W;
    const rx1 = xb - GALLERY_W;
    const rz0 = za + GALLERY_W;
    const rz1 = zb - GALLERY_W;
    const rail = y1 + 0.42;
    parts.push(
      solid(`rail-${n}-port`, 'trim', rx0, rx1, rail, rail + 0.05, rz0 - ri, rz0),
      solid(`rail-${n}-starboard`, 'trim', rx0, rx1, rail, rail + 0.05, rz1, rz1 + ri),
      solid(`rail-${n}-aft`, 'trim', rx0 - ri, rx0, rail, rail + 0.05, rz0, rz1),
      solid(`rail-${n}-fore`, 'trim', rx1, rx1 + ri, rail, rail + 0.05, rz0, rz1)
    );
  }

  // --- The plot table, and the regime rings standing proud of it.
  //
  // Square rings rather than circles, for the same reason the junction's ring
  // light was built as four bars: a made object reads as made, and a circle
  // approximated in flat facets reads as a failed circle. Three of them, because
  // three is what the station can currently reach.
  const TABLE_TOP = FLOOR_Y + 0.92;
  const FOOT_TOP = FLOOR_Y + 0.06;
  parts.push(
    // The table STANDS ON its foot rather than starting at the same deck height.
    // Two boxes whose undersides are both on the floor share that plane facing
    // the same way, and the larger one is 3.36 m2 of two surfaces fighting.
    solid('table', 'frame', -1.05, 1.05, FOOT_TOP, TABLE_TOP, -0.8, 0.8),
    solid('table-foot', 'trim', -1.12, 1.12, FLOOR_Y, FOOT_TOP, -0.87, 0.87)
  );
  // Four rings now, not three, and their radii are not typed here any more.
  //
  // They were [0.34, 0.58, 0.86] with a comment saying "three is what the
  // station can currently reach", which was true and is not any more: THE DAWN
  // LINE, THE SHELL and THE RING exist in src/sim/regime.ts, derived from
  // their own defining physics. A map of the areas that does not change when
  // the areas do is a decoration of a map.
  //
  // mapFraction carries the whole argument about scale - THE RING is 90 times
  // further out than THE LOW FIELD, so the spacing is part logarithmic and
  // part ordinal, for reasons set out where it is defined. Here it is only
  // stretched onto the table: the innermost ring at 0.30 m and the outermost
  // at 0.86, which is as far as the top will take one.
  const INNER_M = 0.3;
  const OUTER_M = 0.86;
  /**
   * The rings are SIMILAR rectangles - z scales with x - and the third one is
   * why.
   *
   * The old code clamped the short side to 0.72 m so the outermost ring fitted
   * the table. With three rings nothing reached the clamp but the last, so it
   * never showed. With four, THE SHELL lands at 0.694 and THE RING at 0.720,
   * and the clamp squeezed both onto the same short side: two rings 26 mm
   * apart, drawn 35 mm wide, which is 0.045 m2 of two surfaces in one plane
   * facing one way. A clamp is a collision waiting for a fourth item.
   */
  const Z_RATIO = 0.72 / OUTER_M;
  for (const regime of REGIMES) {
    const r = INNER_M + (OUTER_M - INNER_M) * mapFraction(regime);
    const t = 0.035;
    const rz = r * Z_RATIO;
    const top = TABLE_TOP + 0.012;
    parts.push(
      solid(`ring-${regime.id}-a`, 'trim', -r, r, TABLE_TOP, top, -rz, -rz + t),
      solid(`ring-${regime.id}-b`, 'trim', -r, r, TABLE_TOP, top, rz - t, rz),
      solid(`ring-${regime.id}-c`, 'trim', -r, -r + t, TABLE_TOP, top, -rz + t, rz - t),
      solid(`ring-${regime.id}-d`, 'trim', r - t, r, TABLE_TOP, top, -rz + t, rz - t)
    );
  }

  // --- The perch, on the left as you come in through the wide opening.
  parts.push(
    solid('perch', 'trim', 1.5, 2.12, FLOOR_Y + 0.5, FLOOR_Y + 0.58, -2.44, -1.92),
    solid('perch-leg', 'frame', 1.54, 1.62, FLOOR_Y, FLOOR_Y + 0.5, -2.08, -2.0)
  );

  // --- S11: one thing out of its stowed position, and one only. A survey plate
  // left flat on the table instead of racked under it.
  parts.push(solid('plate', 'trim', 0.24, 0.78, TABLE_TOP + 0.012, TABLE_TOP + 0.026, -0.32, 0.1));

  return parts;
}

/** Deck, the tall walls with their inversion, the galleries' shadows, the aperture. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  /** The lightest wall in the station, and the whole reason for this room. */
  const upper = new THREE.Color(PALETTE.HULL);
  const pane = new THREE.Color(PALETTE.CLOUD);
  const inward = new THREE.Vector3();
  /** Where a single surface is looked at FROM, when that is not the room centre. */
  const seen = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  // --- Deck, run PAST the two walls that carry no port.
  //
  // A deck that stops exactly in a wall's own plane leaves a ray at a grazing
  // angle nothing to hit at the junction, and what it finds instead is the
  // exterior pass, which has already cleared depth. Only the +/-z walls get the
  // overrun: the +/-x walls are the seam planes, and material pushed past one of
  // those is material inside the next compartment.
  const OVERRUN = 0.12;
  inward.set(0, FLOOR_Y + 2, 0);
  pushQuad(
    target,
    v(-HALF_X, FLOOR_Y, -HALF_Z - OVERRUN),
    v(HALF_X, FLOOR_Y, -HALF_Z - OVERRUN),
    v(HALF_X, FLOOR_Y, HALF_Z + OVERRUN),
    v(-HALF_X, FLOOR_Y, HALF_Z + OVERRUN),
    inward,
    facetColour(deck, v(0, FLOOR_Y, 0), SEED, JITTER)
  );

  /**
   * One wall.
   *
   * Below the work band's top it is the station's ordinary three-band structure,
   * so the room joins the building at the height a body actually touches. Above
   * it the rule inverts: one tall light field, in courses, crossed by the dark
   * galleries.
   *
   * Two things here are the scars of getting it wrong. The band runs span the
   * room's OWN extent and no further - an earlier version over-spanned each wall
   * to cover its neighbours' grooves, which on the two walls carrying doorways
   * meant poking 80 mm through the seam plane and into the next compartment. And
   * a groove is closed by a return at each END of its run rather than by the
   * adjacent wall reaching across it, which is the same fix, stated locally.
   */
  const wall = (axis: 'x' | 'z', side: -1 | 1): void => {
    // Both ports are in the x walls, so those are the two that stand off the
    // seam - and the blind z walls run only as far as they do, or they would
    // carry their own grooves out past the plane the x walls have vacated.
    const halfAt = axis === 'x' ? WALL_X : HALF_Z;
    const halfRun = axis === 'x' ? HALF_Z : WALL_X;
    const at = side * halfAt;
    inward.set(
      axis === 'x' ? at - side * 1 : 0,
      (FLOOR_Y + CEILING_Y) / 2,
      axis === 'z' ? at - side * 1 : 0
    );
    /** A point on this wall: `s` along the run, `y` up, `n` off the wall plane. */
    const P = (sAlong: number, y: number, n: number): THREE.Vector3 =>
      axis === 'x' ? v(n, y, sAlong) : v(sAlong, y, n);
    /**
     * The doorway in this wall, if this wall has one.
     *
     * Both ports are on the x walls; the z walls are blind. Cutting a hole in
     * all four - which is what the first version did, because the cut was
     * written into the shared wall builder without asking which wall - opened
     * two doorway-shaped holes onto nothing and took 233 000 pixels of space
     * with them.
     */
    const holed = axis === 'x';
    const hole = side > 0 ? GALLERY_SEAM : SEAM;
    const holeHalf = holed ? hole.width / 2 : 0;
    const holeTop = holed ? FLOOR_Y + hole.height : FLOOR_Y;

    const panel = (
      s0: number,
      s1: number,
      y0: number,
      y1: number,
      n: number,
      colour: THREE.Color
    ): void => {
      if (s1 - s0 < 1e-6 || y1 - y0 < 1e-6) return;
      pushQuad(
        target,
        P(s0, y0, n),
        P(s1, y0, n),
        P(s1, y1, n),
        P(s0, y1, n),
        inward,
        facetColour(colour, P((s0 + s1) / 2, (y0 + y1) / 2, n), SEED + (side > 0 ? 3 : 7), JITTER)
      );
    };

    /**
     * A course of wall, cut around the doorway.
     *
     * Every wall in this room carries a port, and a wall drawn straight across
     * its own opening is a room you can walk into and cannot see out of - the
     * seam floor runs through, so the player passes through what looks like
     * solid hull. Split into the piece each side of the opening, plus whatever
     * is above and below it.
     */
    const face = (y0: number, y1: number, n: number, colour: THREE.Color): void => {
      if (y1 <= FLOOR_Y || y0 >= holeTop) {
        panel(-halfRun, halfRun, y0, y1, n, colour);
        return;
      }
      if (y0 < FLOOR_Y) panel(-halfRun, halfRun, y0, FLOOR_Y, n, colour);
      const mid0 = Math.max(y0, FLOOR_Y);
      const mid1 = Math.min(y1, holeTop);
      panel(-halfRun, -holeHalf, mid0, mid1, n, colour);
      panel(holeHalf, halfRun, mid0, mid1, n, colour);
      if (y1 > holeTop) panel(-halfRun, halfRun, holeTop, y1, n, colour);
    };

    for (const band of bands(FLOOR_Y, FLOOR_Y + WORK_TOP_M)) {
      // Negative relief is recessed, which means FURTHER OUT from the room.
      const n = side * (halfAt - band.relief);
      // The lowest band runs BELOW the deck rather than stopping on it. Two
      // surfaces that merely share an edge leave that edge to floating point,
      // and at a grazing angle the ray finds neither of them - which is not a
      // hairline crack, it is a hairline of outer space, and it drew itself
      // down both wall-to-deck junctions of this room.
      const y0 = Math.abs(band.y0 - FLOOR_Y) < 1e-6 ? FLOOR_Y - 0.08 : band.y0;
      face(y0, band.y1, n, new THREE.Color(band.colour));
      if (Math.abs(band.relief) < 1e-6) continue;
      for (const y of [band.y0, band.y1]) {
        // The return at the deck itself would lie in the deck's own plane, which
        // is a horizontal surface facing up in the same plane as the neighbouring
        // compartment's floor. Skip it; there is nothing to reveal at the floor.
        if (Math.abs(y - FLOOR_Y) < 1e-6) continue;
        // A horizontal return is seen from ONE side, and which side depends on
        // BOTH which end of the band it is and which way the band is relieved.
        // A proud band's top is a shelf you look down onto; a recessed band's
        // top is a soffit you look up at. Getting that backwards does not draw a
        // dark surface, it draws nothing, and nothing is the exterior pass
        // showing through - 5 906 pixels of it down both wall-to-deck junctions
        // in this room, which survived three separate attempts to fix it as a
        // geometry gap because it was never a gap.
        const above = (y === band.y1) === band.relief > 0;
        seen.set(0, above ? y + 1 : y - 1, 0);
        // Four walls, four returns at the same height, and where a proud band
        // turns a corner both of them cover that square facing the same way.
        // The x walls stop short by the relief and the z walls own the corner
        // outright, which is the same abutting rule the galleries are built to.
        const shy = axis === 'x' ? Math.max(band.relief, 0) : 0;
        pushQuad(
          target,
          P(-halfRun + shy, y, at),
          P(halfRun - shy, y, at),
          P(halfRun - shy, y, n),
          P(-halfRun + shy, y, n),
          seen,
          facetColour(reveal, P(0, y, (at + n) / 2), SEED + 5, JITTER)
        );
      }
      // And the two ends of the groove, closed here rather than by the wall
      // round the corner reaching across.
      for (const sEnd of [-halfRun, halfRun]) {
        pushQuad(
          target,
          P(sEnd, band.y0, at),
          P(sEnd, band.y0, n),
          P(sEnd, band.y1, n),
          P(sEnd, band.y1, at),
          inward,
          facetColour(reveal, P(sEnd, (band.y0 + band.y1) / 2, (at + n) / 2), SEED + 9, JITTER)
        );
      }
    }

    // The inversion above body height: courses of the lightest value in the
    // station, divided at the gallery heights, so the divisions in the wall are
    // caused by the things crossing it rather than laid over them.
    const stops = [FLOOR_Y + WORK_TOP_M, ...GALLERY_YS.map((g) => FLOOR_Y + g), CEILING_Y];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const y0 = stops[i] ?? FLOOR_Y;
      const y1 = stops[i + 1] ?? CEILING_Y;
      // Every other course a shade down, so nine metres of one value never
      // happens - the exact failure the whole station was reviewed for.
      const shade = i % 2 === 0 ? upper : new THREE.Color(PALETTE.HULL).multiplyScalar(0.84);
      face(y0, y1, at, shade);
    }
  };
  wall('x', 1);
  wall('x', -1);
  wall('z', 1);
  wall('z', -1);

  // --- The aperture: six canted panes rising to a flat centre, and solid. The
  // ceiling around it is the darkest thing up there, so the panes read as the
  // source even though the light is a lamp somewhere else.
  const capY = CEILING_Y + APERTURE_RISE;
  inward.set(0, FLOOR_Y, 0);
  for (let i = 0; i < PANES; i += 1) {
    const a0 = (i * Math.PI * 2) / PANES;
    const a1 = ((i + 1) * Math.PI * 2) / PANES;
    const p0 = v(APERTURE_HALF_X * Math.cos(a0), CEILING_Y, APERTURE_HALF_Z * Math.sin(a0));
    const p1 = v(APERTURE_HALF_X * Math.cos(a1), CEILING_Y, APERTURE_HALF_Z * Math.sin(a1));
    pushQuad(
      target,
      p0,
      p1,
      v(p1.x * 0.32, capY, p1.z * 0.32),
      v(p0.x * 0.32, capY, p0.z * 0.32),
      inward,
      facetColour(pane, v((p0.x + p1.x) / 2, capY, (p0.z + p1.z) / 2), SEED + i * 11, JITTER * 1.6)
    );
  }
  // The flat ceiling around the aperture, as four panels clear of it.
  const ceilPanel = (x0: number, x1: number, z0: number, z1: number): void => {
    inward.set(0, FLOOR_Y, 0);
    pushQuad(
      target,
      v(x0, CEILING_Y, z0),
      v(x1, CEILING_Y, z0),
      v(x1, CEILING_Y, z1),
      v(x0, CEILING_Y, z1),
      inward,
      facetColour(
        new THREE.Color(CROWN_COLOUR),
        v((x0 + x1) / 2, CEILING_Y, (z0 + z1) / 2),
        SEED + 23,
        JITTER
      )
    );
  };
  ceilPanel(-HALF_X, HALF_X, -HALF_Z - OVERRUN, -APERTURE_HALF_Z);
  ceilPanel(-HALF_X, HALF_X, APERTURE_HALF_Z, HALF_Z + OVERRUN);
  ceilPanel(-HALF_X, -APERTURE_HALF_X, -APERTURE_HALF_Z, APERTURE_HALF_Z);
  ceilPanel(APERTURE_HALF_X, HALF_X, -APERTURE_HALF_Z, APERTURE_HALF_Z);
  // And the annulus between the aperture's own outline and that bounding
  // rectangle. The aperture is a HEXAGON inscribed in an ellipse - six flat
  // panes, not a curve - so filling this to the ellipse leaves six slivers of
  // nothing at the top of a nine-metre room, and nothing at the top of a room is
  // not shadow, it is open space. Walked round the hexagon's own edges instead,
  // each sample projected straight out onto the rectangle, so the two outlines
  // tile exactly whatever either of them is.
  {
    const PER_EDGE = 4;
    const ring: THREE.Vector2[] = [];
    for (let i = 0; i < PANES; i += 1) {
      const a0 = (i * Math.PI * 2) / PANES;
      const a1 = ((i + 1) * Math.PI * 2) / PANES;
      for (let k = 0; k < PER_EDGE; k += 1) {
        const t = k / PER_EDGE;
        ring.push(
          new THREE.Vector2(
            APERTURE_HALF_X * (Math.cos(a0) * (1 - t) + Math.cos(a1) * t),
            APERTURE_HALF_Z * (Math.sin(a0) * (1 - t) + Math.sin(a1) * t)
          )
        );
      }
    }
    const onBox = (p: THREE.Vector2): THREE.Vector2 => {
      const k = Math.max(Math.abs(p.x) / APERTURE_HALF_X, Math.abs(p.y) / APERTURE_HALF_Z);
      return k < 1e-9 ? p.clone() : p.clone().multiplyScalar(1 / k);
    };
    inward.set(0, FLOOR_Y, 0);
    for (let i = 0; i < ring.length; i += 1) {
      const p0 = ring[i];
      const p1 = ring[(i + 1) % ring.length];
      if (p0 === undefined || p1 === undefined) continue;
      const q0 = onBox(p0);
      const q1 = onBox(p1);
      pushQuad(
        target,
        v(p0.x, CEILING_Y, p0.y),
        v(p1.x, CEILING_Y, p1.y),
        v(q1.x, CEILING_Y, q1.y),
        v(q0.x, CEILING_Y, q0.y),
        inward,
        facetColour(
          new THREE.Color(CROWN_COLOUR),
          v((p0.x + q0.x) / 2, CEILING_Y, (p0.y + q0.y) / 2),
          SEED + 29,
          JITTER
        )
      );
    }
  }

  return toGeometry(target);
}

function buildCrown(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'crown';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'crown-shell';
  root.add(shell);

  const parts = crownSolids();
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
    // The galleries are the dark crossings the height is counted in, so they get
    // their own value rather than borrowing the frame's.
    gallery: new THREE.MeshLambertMaterial({
      color: new THREE.Color(CROWN_COLOUR),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
  };
  for (const key of Object.keys(materials)) {
    const solids = parts.filter((p) => p.material === key).map((p) => boxOf(p));
    const material = materials[key];
    if (solids.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `crown-${key}`;
    root.add(mesh);
  }

  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    0.92
  );
  root.add(ambient);
  // One hard key straight down through the aperture. This is the light that puts
  // the value on the upper wall, and it is the only reason the inversion reads.
  const sky = new THREE.DirectionalLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.86);
  sky.position.set(0.4, CEILING_Y, 0.2);
  sky.target.position.set(-0.6, FLOOR_Y, -0.4);
  root.add(sky, sky.target);
  // And a weak fill at deck level, so the bottom two metres do not go to one
  // value while the top eight carry the whole frame.
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.HULL).getHex(), 0.3);
  fill.position.set(HALF_X, FLOOR_Y + 1.6, 0);
  fill.target.position.set(-HALF_X, FLOOR_Y + 0.4, 0);
  root.add(fill, fill.target);

  // The table is in the middle, so the walkable floor is the ring around it.
  const floor: readonly FloorRect[] = [
    {
      minX: -HALF_X + 0.08,
      maxX: HALF_X - 0.08,
      minZ: -HALF_Z + 0.08,
      maxZ: -0.95,
      floorY: FLOOR_Y,
    },
    { minX: -HALF_X + 0.08, maxX: HALF_X - 0.08, minZ: 0.95, maxZ: HALF_Z - 0.08, floorY: FLOOR_Y },
    { minX: -HALF_X + 0.08, maxX: -1.2, minZ: -0.95, maxZ: 0.95, floorY: FLOOR_Y },
    { minX: 1.2, maxX: HALF_X - 0.08, minZ: -0.95, maxZ: 0.95, floorY: FLOOR_Y },
  ];

  const points: readonly PointOfInterest[] = [
    { id: 'map', label: 'the plot table', position: [0, FLOOR_Y + 0.95, -0.86], operable: true },
    { id: 'perch', label: 'the perch', position: [1.8, FLOOR_Y + 0.58, -2.18] },
    { id: 'galleries', label: 'the galleries', position: [0, FLOOR_Y + 5.6, 0] },
  ];

  let pulled = 0;

  return {
    root,
    // Standing at the table, looking up the room and into the height.
    spawn: { position: [2.2, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.18 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 27,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y + APERTURE_RISE - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    interact(id: string): boolean {
      if (id !== 'map') return false;
      pulled += 1;
      return true;
    },

    update(): void {
      void pulled;
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

export const CROWN: CompartmentDefinition = {
  id: 'crown',
  name: 'THE CROWN',
  description: 'A 9.6 m shaft with three galleries, on the upper deck.',
  ports: PORTS,
  extent: EXTENT,
  build: buildCrown,
};

export const CROWN_SOLO = {
  id: 'crown',
  name: 'THE CROWN',
  description: 'A 9.6 m shaft with three galleries, on the upper deck.',
  build: () => soloStation(CROWN),
};

export default CROWN_SOLO;
