/**
 * THE SILL - the salvage register, and the only room whose subject is under the
 * floor.
 *
 * STRUCTURE.md's collection engine is THE CATCH: a derelict coasts on a
 * neighbouring orbit, the servicer chases it down from a lower and faster
 * phasing orbit, and a caught frame is "towed in, refit over a session, and
 * joins the fleet - flyable, kid-named, with a register plate". That sentence
 * has a gap in it the size of a room. Between the catch and the fleet the thing
 * is neither: it is aboard, it is yours, it is named, and it does not fly. This
 * is where it waits, and the whole compartment is built to hold exactly that
 * state - you can see your collection, you can read its plate, and you cannot
 * reach it.
 *
 * SO THE COLLECTION IS UNDER A GRATING. Not in a case, not on a shelf, not on a
 * board: in a sump 4.50 m below the deck you are standing on, lit, with three
 * frames on the old pump foundations and no way down. A pet collection displayed
 * at eye level is a menu. A pet collection you look DOWN into is a workshop with
 * your things in it, and the distance is the refit. There is no ladder and no
 * hatch, and neither is missing - the room is finished.
 *
 * THE MIRROR OF THE CROWN, AT A QUARTER THE SIZE. That room gives the player
 * three galleries overhead that no stair reaches, because visible space you
 * cannot get to is the cheapest way to make a station feel bigger than the part
 * you are allowed in. This does the same thing downward in a 6.00 by 4.00 m room
 * with a flat 3.00 m lid, and downward is not the same idea: overhead volume
 * reads as architecture and reads as generous, while a hole in the floor reads
 * as a drop. Standing on the walkway with 3.00 m over your head and 4.50 m of
 * lit air under the bars, you are the middle of a seven and a half metre
 * section of a station that is nowhere else more than four metres tall.
 *
 * THE ONLY LIGHT BELOW ANYBODY'S FEET. Every other compartment is lit from its
 * own ceiling, from a window, or from the planet. This one has a warm lamp in
 * the sump, tucked under the lip where you cannot see the fitting, so the light
 * arrives without a visible source and the room below reads as somewhere rather
 * than as a shaft. Above it, the two coves run over the two walking lines and
 * NOTHING crosses the middle of the ceiling. That is the room's whole value
 * structure and it is arranged in plan rather than in section: the dark is a
 * rectangle in the middle of the floor and the light is round the edges, which
 * is the reverse of every other room on the station. Light the grating from
 * above and the drop becomes a dark panel in a small ordinary room, which is the
 * one way to ruin this.
 *
 * THE SUMP IS A CLOSED BOX, and that is a correctness rule rather than a
 * flourish. The exterior pass clears depth before any interior draws, so a hole
 * in a floor with nothing built under it is not a hole - it is a rectangle of
 * outer space in the middle of the deck. Four walls, a floor, and a soffit ring
 * under the deck between the opening and those walls: six surfaces, all facing
 * inward, and the room is airtight with a 4.50 m void in it.
 *
 * THE SUB-VOLUME IS WIDER THAN THE OPENING - 3.40 by 2.40 against 3.00 by 1.60 -
 * so the first thing the drop tells you is that the room down there is bigger
 * than the way into it. The lip that produces is also what hides the lamp.
 *
 * THE WALKING LINE SPLITS. Both ports are centred on the short ends, so the
 * route through this compartment arrives pointed straight at the hole and has to
 * choose a side. That is the opposite of the usual advice and it is the point:
 * every other room can be crossed without a decision, and in this one the
 * building makes you commit to a side before you have seen what is in the pit.
 * The two sides are not the same. Port is the working side - the rail carries
 * the register, the blanked suction flanges are in the kick band behind it, and
 * the pipes those flanges belonged to are visible running down the sump wall
 * below them. Starboard is the passing side, with the perch on the left as you
 * come in through `fore` and the pump control bank filling its work band.
 *
 * THE GRATING IS 1.60 M ACROSS AND NOT THE 2.00 IT WANTS TO BE. A 0.10 m kerb
 * rings the opening and the walkable rectangles stand 0.10 m off the wall line,
 * so at 2.00 m of opening each walkway would have been 0.80 m of rectangle - and
 * the walk clamp holds the eye 0.20 m off every outer edge, which leaves 0.40 m
 * of standable strip over a 3.20 m run. That is narrower than the deliberate
 * pinch in THE RACKS, which is that room's one body moment and is 0.44 m for a
 * metre. Two squeeze rooms is no squeeze room, so the hole gave up 0.40 m and
 * the walkways came out at 0.60 m of standable strip each. The drop is the drama
 * here; the corridor is not.
 *
 * A PUMP ROOM OVER ITS OWN SUMP, WITH THE PUMP GONE. Nothing about the salvage
 * register is in the structure - the structure is a stripped plant space, and
 * the register is what somebody bolted to it afterwards. Four foundation blocks
 * on the sump floor, two cradle beams across them, three capped suction pipes
 * down the port wall, and a control bank upstairs for a machine that is not
 * there. The frames are laid across the foundations because the foundations were
 * the only flat thing left, which is exactly how a real workshop gets used and
 * is Prey's second architectural register (S10) at the cost of nothing.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { GALLERY_SEAM, SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import {
  CROWN_COLOUR,
  DATUM_COLOUR,
  DATUM_T_M,
  DATUM_Y_M,
  REVEAL_COLOUR,
  bands,
  deepestRelief,
} from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

const HALF_X = 3.0;
const HALF_Z = 2.0;
const FLOOR_Y = 0;
const CEILING_Y = 3.0;
const EYE_HEIGHT = 1.74;

/** The opening in the deck. Narrowed in z from the brief's 2.00 - see above. */
const OPEN_HALF_X = 1.5;
const OPEN_HALF_Z = 0.8;

/** The coaming round the opening: what your foot finds before the drop does. */
const KERB_W = 0.1;
const KERB_H = 0.14;
const KERB_X = OPEN_HALF_X + KERB_W;
const KERB_Z = OPEN_HALF_Z + KERB_W;

/** The sump. Wider than the hole in both directions, so the pit reads as a room. */
const SUMP_HALF_X = 1.7;
const SUMP_HALF_Z = 1.2;
const SUMP_FLOOR_Y = -4.5;
/** Courses down the sump wall, so 4.5 m of drop is countable rather than deep. */
const SUMP_COURSES = 4;

/**
 * How far a surface runs PAST the one it meets, metres.
 *
 * Two quads that merely share an edge leave that edge to floating point, and at
 * a grazing angle a ray finds neither of them - which is not a hairline crack,
 * it is a hairline of the exterior pass, because that pass has already cleared
 * depth. Every junction in this file is lapped rather than mitred.
 */
const LAP = 0.08;
const DECK_OUT_Z = HALF_Z + LAP + 0.04;
const SUMP_OUT_X = SUMP_HALF_X + LAP;
const SUMP_OUT_Z = SUMP_HALF_Z + LAP;

/**
 * How far inboard of its own port plane this room holds its end walls.
 *
 * Imported rather than declared. It was declared here, with a correct comment
 * and the correct value, which is precisely the arrangement ports.ts warns
 * about: every room agreeing on a number they each keep their own copy of
 * agrees only until one of them is edited.
 */
const END_INSET = SEAM_INSET_M;

/** How far the walkable rectangles stand off the nominal wall line. */
const WALL_STANDOFF = 0.1;

/** The grating: bars along x, so the run of them crosses the way you look down. */
const BAR_PITCH = 0.1;
const BAR_T = 0.03;
const BAR_D = 0.09;
const BAR_COUNT = Math.round((2 * OPEN_HALF_Z) / BAR_PITCH);

/** The two coves, over the two walking lines and over nothing else. */
const COVE_Z = 1.7;
const COVE_HALF_W = 0.08;
const COVE_HALF_X = 2.6;

const SEED = 0x5c1;
const JITTER = 0.05;

/**
 * Two ports, centred, on the short ends.
 *
 * Centred is the awkward choice and it is the one that makes the room work: a
 * route offset to one side would let a player cross without ever standing over
 * the drop, and standing over the drop is the only thing this compartment has to
 * say. Arriving square to the hole means choosing a side, and the sides differ.
 */
/**
 * The way out is the wide one, and it is wide because of what it opens into.
 *
 * You arrive through a standard 1.18 m seam and leave through a 2.10 m one.
 * THE GANTRY beyond is the largest deck in the station under its lowest
 * ceiling, and passing into it through something wide is the whole of that
 * room's first impression - the second of exactly two places the gallery seam
 * is spent. It also gives this compartment a direction: the register is read
 * on the way to the tanks, never on the way back from them.
 */
const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, GALLERY_SEAM.height / 2, 0], '-x', FLOOR_Y, GALLERY_SEAM),
] as const;

/** The opening in each end wall: fore is standard, aft is the gallery seam. */
const seamOf = (side: -1 | 1) => (side === 1 ? SEAM : GALLERY_SEAM);

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: SUMP_FLOOR_Y - 0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z - 0.2,
  maxZ: HALF_Z + 0.2,
} as const;

/** Centre of grating bar k, across the opening. */
function barZ(k: number): number {
  return -OPEN_HALF_Z + BAR_PITCH * (k + 0.5);
}

function sillSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The kerb, as four bars ABUTTING rather than overlapping at the corners.
  // Two boxes that share a corner square also share its faces, and two faces in
  // one plane pointing one way fight for every pixel they cover. The long bars
  // own the full run and the short ones stop against them.
  parts.push(
    solid('kerb-port', 'steel', -KERB_X, KERB_X, FLOOR_Y, KERB_H, -KERB_Z, -OPEN_HALF_Z),
    solid('kerb-starboard', 'steel', -KERB_X, KERB_X, FLOOR_Y, KERB_H, OPEN_HALF_Z, KERB_Z),
    solid('kerb-fore', 'steel', OPEN_HALF_X, KERB_X, FLOOR_Y, KERB_H, -OPEN_HALF_Z, OPEN_HALF_Z),
    solid('kerb-aft', 'steel', -KERB_X, -OPEN_HALF_X, FLOOR_Y, KERB_H, -OPEN_HALF_Z, OPEN_HALF_Z)
  );

  // --- The grating itself. The bars hang UNDER the deck line rather than
  // standing on it, so their tops and the deck are one surface and the opening
  // reads as a cut in the floor instead of as a tray laid into it. There is no
  // floor rectangle over any of this: the bars are what you see through, not
  // what you stand on, and the kerb is what tells a foot so.
  for (let k = 0; k < BAR_COUNT; k += 1) {
    const z = barZ(k);
    parts.push(
      solid(
        `bar-${k}`,
        'plant',
        -OPEN_HALF_X,
        OPEN_HALF_X,
        FLOOR_Y - BAR_D,
        FLOOR_Y,
        z - BAR_T / 2,
        z + BAR_T / 2
      )
    );
  }

  // --- A rail down each long edge. Both sides get one because the hole has to
  // read as a hole from the doorway, before anybody is close enough to see the
  // depth; the ends are left open so the first view of the room is straight down
  // into it over a kerb. The rails are the darkest fittings in the compartment,
  // which is HK-3's rule about near-camera dressing: the thing nearest the eye
  // is never the brightest thing in the frame.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'port' : 'starboard';
    const zc = side * (OPEN_HALF_Z + KERB_W / 2);
    for (const [n, cx] of [-1.4, 0, 1.4].entries()) {
      parts.push(
        solid(
          `rail-${tag}-post-${n}`,
          'trim',
          cx - 0.035,
          cx + 0.035,
          KERB_H,
          1.02,
          zc - 0.035,
          zc + 0.035
        )
      );
    }
    // The top bar is wider across than the posts on purpose. Sized to match,
    // its two long faces would be coplanar with theirs and pointing the same
    // way, which is 48 cm2 of two surfaces fighting per post.
    parts.push(solid(`rail-${tag}-bar`, 'trim', -1.48, 1.48, 1.02, 1.08, zc - 0.045, zc + 0.045));
  }

  // --- The register. One plate on the port rail, and the only operable thing in
  // the room: the frames themselves are four and a half metres away and the
  // whole compartment exists to say you cannot touch them. Hung on the walkway
  // face of the rail so it is read from the standable strip rather than from
  // over the void.
  parts.push(solid('register', 'steel', -0.45, 0.45, 0.84, 1.28, -0.94, -0.895));

  // --- S11: exactly one thing out of its stowed position. A tool tray left on
  // the starboard kerb with half of it over the drop, which is the one object in
  // the room that makes the void feel like a place things fall into.
  parts.push(solid('tray', 'trim', 0.34, 0.78, KERB_H, 0.2, 0.7, 0.92));

  // --- S9: the perch. The station's one repeated object, on the LEFT of the
  // door you came in by - entering through a '+x' port you walk in -x, so
  // starboard is your left - and inside 2 m of the seam.
  parts.push(
    solid('perch', 'trim', 2.1, 2.72, 0.5, 0.58, 1.42, 1.94),
    solid('perch-leg', 'steel', 2.14, 2.22, FLOOR_Y, 0.5, 1.62, 1.7)
  );

  // --- The pump control bank, filling the starboard work band exactly: 2.40 by
  // 1.10, between the same two heights every wall on the station is cut at. Its
  // face lands in the plane of the crown band above it, so wall and bank read as
  // one surface broken only by the reveal, and the crown's own bottom return
  // meets the bank's top back to back rather than crossing it.
  parts.push(
    solid('bank', 'steel', -1.2, 1.2, 0.95, 2.05, 1.9, 2.0),
    solid('bank-lip', 'trim', -1.2, 1.2, 0.91, 0.95, 1.86, 1.9)
  );
  for (const [n, cx] of [-0.92, -0.46, 0, 0.46, 0.92].entries()) {
    parts.push(solid(`bank-panel-${n}`, 'trim', cx - 0.2, cx + 0.2, 1.3, 1.72, 1.87, 1.9));
  }

  // --- Three blanked suction flanges in the port kick band, where the pipes
  // used to come through the wall. They are low, they are small, and they are
  // the upper half of one fact: the pipes themselves are still there, four
  // metres down the sump wall directly below them, capped. A detail that is
  // visible in two places at two depths is what makes a room read as built
  // rather than as decorated.
  for (const [n, cx] of [-0.9, 0, 0.9].entries()) {
    parts.push(
      solid(`flange-${n}`, 'steel', cx - 0.15, cx + 0.15, 0.4, 0.7, -1.94, -1.89),
      solid(`flange-boss-${n}`, 'trim', cx - 0.09, cx + 0.09, 0.46, 0.64, -1.89, -1.86)
    );
  }

  // --- The two coves. Hung from the ceiling rather than floated under it, so
  // their tops and the ceiling meet back to back; the diffuser is a separate
  // narrower strip under each housing, because a fitting whose whole body is
  // emissive is a light with no lamp in it.
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'port' : 'starboard';
    const zc = side * COVE_Z;
    parts.push(
      solid(
        `cove-${tag}`,
        'steel',
        -COVE_HALF_X,
        COVE_HALF_X,
        2.86,
        CEILING_Y,
        zc - COVE_HALF_W,
        zc + COVE_HALF_W
      ),
      solid(
        `cove-${tag}-lamp`,
        'lamp',
        -COVE_HALF_X + 0.04,
        COVE_HALF_X - 0.04,
        2.82,
        2.86,
        zc - COVE_HALF_W + 0.02,
        zc + COVE_HALF_W - 0.02
      )
    );
  }

  // --- Down in the sump: the pump's own foundations, and the two cradle beams
  // somebody laid across them once the pump was out. Nothing here was built for
  // salvage; salvage is simply what a flat surface four metres down gets used
  // for.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.push(
        solid(
          `foundation-${sx < 0 ? 'a' : 'f'}${sz < 0 ? 'p' : 's'}`,
          'plant',
          sx < 0 ? -1.5 : 0.95,
          sx < 0 ? -0.95 : 1.5,
          SUMP_FLOOR_Y,
          -3.65,
          sz < 0 ? -0.95 : 0.4,
          sz < 0 ? -0.4 : 0.95
        )
      );
    }
    parts.push(
      solid(
        `cradle-${sx < 0 ? 'aft' : 'fore'}`,
        'plant',
        sx < 0 ? -1.4 : 1.05,
        sx < 0 ? -1.05 : 1.4,
        -3.65,
        -3.53,
        -0.95,
        0.95
      )
    );
  }

  // --- Three capped suction pipes down the port wall of the sump, running from
  // just under the deck to a blanking flange short of the foundations. They are
  // the vertical lines that let an eye count the drop; four courses of wall
  // alone measure it, but a pipe running the whole way is what makes the
  // measurement felt.
  //
  // Their tops stop 40 mm short of the deck rather than meeting it. A box top
  // at exactly the deck's own height is a face in the deck's plane pointing the
  // same way as the deck, and these three sit under the soffit where nothing
  // can see either of them - which is precisely how 0.13 m2 of two surfaces
  // fighting for every pixel gets into a room and stays there.
  for (const [n, cz] of [-0.9, 0, 0.9].entries()) {
    parts.push(
      solid(`pipe-${n}`, 'plant', cz - 0.11, cz + 0.11, -3.56, FLOOR_Y - 0.04, -SUMP_HALF_Z, -1.0),
      solid(`pipe-cap-${n}`, 'steel', cz - 0.14, cz + 0.14, -3.62, -3.56, -SUMP_HALF_Z, -0.98)
    );
  }

  // --- The collection. One frame up on the cradle mid-refit, two still on the
  // floor waiting for it, and no plates on any of them that a player could read
  // from up here - the register on the rail is where the names live, which is
  // the point of having a register at all.
  parts.push(
    solid('frame-stage', 'salvage', -1.3, 1.3, -3.53, -3.09, -0.3, 0.3),
    solid('frame-stage-skirt', 'salvage', -1.48, -1.3, -3.48, -3.14, -0.2, 0.2),
    // S12: one small warm element at the far end of the room's one long
    // sightline, and in this compartment that sightline points straight down.
    // A foil blanket half off the stage, warm in a cold frame, 4 m under the
    // player's feet and lit by the only lamp below them.
    solid('frame-stage-blanket', 'foil', -0.4, 0.6, -3.09, -3.04, -0.33, 0.33),
    solid('frame-bird', 'salvage', -0.7, 0.1, SUMP_FLOOR_Y, -4.1, 0.62, 1.06),
    solid('frame-bird-wing', 'salvage', -0.6, 0, -4.1, -4.06, 0.8, 1.18),
    solid('frame-cube', 'salvage', 0.55, 0.83, SUMP_FLOOR_Y, -4.22, -1.02, -0.74)
  );

  // --- The sump lamp, and the only fitting on the station below anybody's feet.
  // Mounted on the port wall under the deck lip, so from every standable point
  // in the room the light is visible and the lamp is not. A source you cannot
  // see reads as a room down there; a source you can see reads as a torch in a
  // hole.
  parts.push(
    solid('sump-lamp', 'lamp', -0.6, -0.28, -4.36, -4.22, -SUMP_HALF_Z, -1.04),
    solid('sump-lamp-hood', 'plant', -0.64, -0.24, -4.22, -4.16, -1.19, -1.0)
  );

  return parts;
}

/** Deck, ceiling, four banded walls, two end bulkheads, and the closed sump. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const roof = new THREE.Color(CROWN_COLOUR);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const rust = new THREE.Color(DATUM_COLOUR);
  const soffit = new THREE.Color(CROWN_COLOUR);
  /** The darkest large surface in the room, and it is in the floor. */
  const pit = new THREE.Color(CROWN_COLOUR);
  const pitAlt = new THREE.Color(CROWN_COLOUR).multiplyScalar(0.86);
  const pitFloor = new THREE.Color(PALETTE.HULL_SHADOW);
  const inward = new THREE.Vector3();
  /** Where a single-sided surface is looked at from, when not the room centre. */
  const seen = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  const outerZ = HALF_Z + deepestRelief(FLOOR_Y, CEILING_Y);

  // --- The deck, as a ring round the opening and in strips about a metre wide
  // so the facet jitter has something to act on. It runs PAST both long walls:
  // a deck that stops in a wall's own plane leaves a grazing ray nothing to hit
  // at the junction, and what it finds instead has already cleared depth. Only
  // the long walls get the overrun - the ends are seam planes, and material
  // pushed past one of those is material inside the next compartment.
  const deckPanel = (x0: number, x1: number, z0: number, z1: number): void => {
    const steps = Math.max(1, Math.round(x1 - x0));
    for (let i = 0; i < steps; i += 1) {
      const a = x0 + ((x1 - x0) * i) / steps;
      const b = x0 + ((x1 - x0) * (i + 1)) / steps;
      const mid = v((a + b) / 2, FLOOR_Y, (z0 + z1) / 2);
      inward.set(mid.x, FLOOR_Y + 2, mid.z);
      pushQuad(
        target,
        v(a, FLOOR_Y, z0),
        v(b, FLOOR_Y, z0),
        v(b, FLOOR_Y, z1),
        v(a, FLOOR_Y, z1),
        inward,
        facetColour(deck, mid, SEED, JITTER)
      );
    }
  };
  deckPanel(KERB_X, HALF_X, -DECK_OUT_Z, DECK_OUT_Z);
  deckPanel(-HALF_X, -KERB_X, -DECK_OUT_Z, DECK_OUT_Z);
  deckPanel(-KERB_X, KERB_X, KERB_Z, DECK_OUT_Z);
  deckPanel(-KERB_X, KERB_X, -DECK_OUT_Z, -KERB_Z);

  // --- The ceiling, flat, full width. Drawn out past the crown band's face
  // rather than stopping at it, because the crown's TOP return is not drawn at
  // all: it would land in the plane the ceiling already owns, facing the same
  // way, which is two surfaces fighting over every pixel they cover. One of the
  // two has to go and the ceiling is the one a player looks at.
  for (let i = 0; i < 6; i += 1) {
    const x0 = -HALF_X + (2 * HALF_X * i) / 6;
    const x1 = -HALF_X + (2 * HALF_X * (i + 1)) / 6;
    inward.set((x0 + x1) / 2, FLOOR_Y, 0);
    pushQuad(
      target,
      v(x0, CEILING_Y, -DECK_OUT_Z),
      v(x1, CEILING_Y, -DECK_OUT_Z),
      v(x1, CEILING_Y, DECK_OUT_Z),
      v(x0, CEILING_Y, DECK_OUT_Z),
      inward,
      facetColour(roof, v((x0 + x1) / 2, CEILING_Y, 0), SEED + i * 7, JITTER)
    );
  }

  /**
   * One long wall, in the station's three bands with its reveal returns.
   *
   * Three rules are being held here and every one of them is a defect somebody
   * shipped. The lowest band runs BELOW the deck rather than stopping on it, so
   * the wall-to-deck junction is a lap and not an edge left to floating point.
   * No return is drawn in the deck's plane or the ceiling's, because those two
   * surfaces already own them. And which side a horizontal return is seen from
   * depends on BOTH which end of the band it is and which way the band is
   * relieved: a proud band's top is a shelf you look down onto, a recessed
   * band's top is a soffit you look up at. Get that backwards and nothing draws
   * at all, and nothing is not a dark surface - it is the exterior showing
   * through the wall.
   */
  const longWall = (side: -1 | 1): void => {
    const lip = side * HALF_Z;
    inward.set(0, CEILING_Y / 2, 0);
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const z = side * (HALF_Z - band.relief);
      const y0 = Math.abs(band.y0 - FLOOR_Y) < 1e-6 ? FLOOR_Y - LAP : band.y0;
      const colour = new THREE.Color(band.colour);
      const face = (ya: number, yb: number, c: THREE.Color): void => {
        if (yb - ya < 1e-6) return;
        pushQuad(
          target,
          v(-HALF_X, ya, z),
          v(HALF_X, ya, z),
          v(HALF_X, yb, z),
          v(-HALF_X, yb, z),
          inward,
          facetColour(c, v(0, (ya + yb) / 2, z), SEED + (side > 0 ? 3 : 7), JITTER)
        );
      };

      if (band.name === 'work') {
        // The rust datum, authored INTO the wall rather than laid over it: a
        // 12 mm hairline at 1.10 m, and the only place CAUTION_RUST appears in
        // the station. Both long walls here have vacuum behind them and both
        // end walls have a compartment, so a player standing in the middle of
        // this room can tell which two walls are the outside of the station
        // without reading anything. It does a second job for free - at a fixed
        // height it is a ruler, dead straight over a floor with a hole in it.
        const d0 = DATUM_Y_M - DATUM_T_M / 2;
        const d1 = DATUM_Y_M + DATUM_T_M / 2;
        face(y0, d0, colour);
        face(d0, d1, rust);
        face(d1, band.y1, colour);
      } else {
        face(y0, band.y1, colour);
      }

      if (Math.abs(band.relief) < 1e-6) continue;
      for (const y of [band.y0, band.y1]) {
        if (Math.abs(y - FLOOR_Y) < 1e-6 || Math.abs(y - CEILING_Y) < 1e-6) continue;
        const above = (y === band.y1) === band.relief > 0;
        seen.set(0, above ? y + 1 : y - 1, 0);
        pushQuad(
          target,
          v(-HALF_X, y, lip),
          v(HALF_X, y, lip),
          v(HALF_X, y, z),
          v(-HALF_X, y, z),
          seen,
          facetColour(reveal, v(0, y, (lip + z) / 2), SEED + 5, JITTER)
        );
      }
    }
  };
  longWall(1);
  longWall(-1);

  /**
   * One end bulkhead, with its doorway cut out of it as real geometry.
   *
   * Flat - it carries the three band VALUES at the three band heights, so the
   * station's two horizons run right round the room, but it has no relief and no
   * fittings. An end wall is a bulkhead between two compartments rather than a
   * fitted-out face, and giving it relief would also mean mitring four proud
   * corners against the long walls' returns, which is four squares of two
   * surfaces facing one way for no gain a player can see.
   *
   * It runs out to the deepest band face rather than to the nominal wall plane.
   * The work band is recessed 0.08 m past HALF_Z, and a bulkhead stopping at
   * HALF_Z leaves that groove open where the room ends - a slot through the
   * pressure hull, which shipped once as 886 measured pixels of open space at
   * eye height down the whole length of a corridor.
   */
  const endWall = (side: -1 | 1): void => {
    const x = side * (HALF_X - END_INSET);
    const seam = seamOf(side);
    const halfW = seam.width / 2;
    inward.set(x - side * 1, CEILING_Y / 2, 0);
    const panel = (z0: number, z1: number, y0: number, y1: number, c: THREE.Color): void => {
      if (z1 - z0 < 1e-6 || y1 - y0 < 1e-6) return;
      pushQuad(
        target,
        v(x, y0, z0),
        v(x, y0, z1),
        v(x, y1, z1),
        v(x, y1, z0),
        inward,
        facetColour(c, v(x, (y0 + y1) / 2, (z0 + z1) / 2), SEED + 11, JITTER)
      );
    };
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const y0 = Math.abs(band.y0 - FLOOR_Y) < 1e-6 ? FLOOR_Y - LAP : band.y0;
      const colour = new THREE.Color(band.colour);
      panel(-outerZ, -halfW, y0, band.y1, colour);
      panel(halfW, outerZ, y0, band.y1, colour);
      panel(-halfW, halfW, Math.max(y0, seam.height), band.y1, colour);
    }
  };
  endWall(1);
  endWall(-1);

  // --- The soffit: the underside of the deck between the kerb and the sump
  // wall, and the surface that makes the room below wider than the way into it.
  // At the deck's own height and facing DOWN, so it and the deck meet back to
  // back - the one arrangement of two coplanar quads that cannot fight, because
  // only one of them is front-facing from any eye.
  const soffitPanel = (x0: number, x1: number, z0: number, z1: number): void => {
    const mid = v((x0 + x1) / 2, FLOOR_Y, (z0 + z1) / 2);
    inward.set(mid.x, SUMP_FLOOR_Y / 2, mid.z);
    pushQuad(
      target,
      v(x0, FLOOR_Y, z0),
      v(x1, FLOOR_Y, z0),
      v(x1, FLOOR_Y, z1),
      v(x0, FLOOR_Y, z1),
      inward,
      facetColour(soffit, mid, SEED + 13, JITTER)
    );
  };
  soffitPanel(-SUMP_OUT_X, SUMP_OUT_X, KERB_Z, SUMP_OUT_Z);
  soffitPanel(-SUMP_OUT_X, SUMP_OUT_X, -SUMP_OUT_Z, -KERB_Z);
  soffitPanel(KERB_X, SUMP_OUT_X, -KERB_Z, KERB_Z);
  soffitPanel(-SUMP_OUT_X, -KERB_X, -KERB_Z, KERB_Z);

  // --- The four sump walls, in courses. The alternation is the only reason
  // 4.5 m reads as 4.5 m: THE CROWN counts its nine metres in three galleries,
  // and a shaft with no divisions in it could be any depth at all. The z walls
  // run past the x walls in both directions so the corners are lapped, and every
  // course runs past the sump floor at the bottom for the same reason.
  const sumpWall = (axis: 'x' | 'z', side: -1 | 1): void => {
    const at = side * (axis === 'x' ? SUMP_HALF_X : SUMP_HALF_Z);
    const halfRun = axis === 'x' ? SUMP_HALF_Z : SUMP_OUT_X;
    const P = (s: number, y: number): THREE.Vector3 => (axis === 'x' ? v(at, y, s) : v(s, y, at));
    inward.set(0, SUMP_FLOOR_Y / 2, 0);
    for (let i = 0; i < SUMP_COURSES; i += 1) {
      const y0 = (SUMP_FLOOR_Y * i) / SUMP_COURSES;
      const y1 =
        i === SUMP_COURSES - 1 ? SUMP_FLOOR_Y - LAP : (SUMP_FLOOR_Y * (i + 1)) / SUMP_COURSES;
      pushQuad(
        target,
        P(-halfRun, y0),
        P(halfRun, y0),
        P(halfRun, y1),
        P(-halfRun, y1),
        inward,
        facetColour(i % 2 === 0 ? pit : pitAlt, P(0, (y0 + y1) / 2), SEED + 19 + i * 3, JITTER)
      );
    }
  };
  sumpWall('x', 1);
  sumpWall('x', -1);
  sumpWall('z', 1);
  sumpWall('z', -1);

  // --- And the bottom. Lapped past all four walls, in strips, and the lightest
  // thing below the deck because the lamp is 1.2 m over it.
  for (let i = 0; i < 4; i += 1) {
    const x0 = -SUMP_OUT_X + (2 * SUMP_OUT_X * i) / 4;
    const x1 = -SUMP_OUT_X + (2 * SUMP_OUT_X * (i + 1)) / 4;
    inward.set((x0 + x1) / 2, SUMP_FLOOR_Y + 2, 0);
    pushQuad(
      target,
      v(x0, SUMP_FLOOR_Y, -SUMP_OUT_Z),
      v(x1, SUMP_FLOOR_Y, -SUMP_OUT_Z),
      v(x1, SUMP_FLOOR_Y, SUMP_OUT_Z),
      v(x0, SUMP_FLOOR_Y, SUMP_OUT_Z),
      inward,
      facetColour(pitFloor, v((x0 + x1) / 2, SUMP_FLOOR_Y, 0), SEED + 29 + i, JITTER)
    );
  }

  return toGeometry(target);
}

function buildSill(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'sill';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'sill-shell';
  root.add(shell);

  const parts = sillSolids();
  const materials: Record<string, THREE.MeshLambertMaterial> = {
    // The kerb, the bank and the register: the light structural value, and the
    // reason the hole reads as a hole is that it is ringed by the brightest
    // thing on the deck.
    steel: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // Everything within reach of the walking line, and deliberately darker than
    // the surfaces behind it.
    trim: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.ARRAY),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The pump's own ironwork, above and below: grating bars, foundations,
    // cradles, pipes. All one value because it is all one machine's leavings.
    plant: new THREE.MeshLambertMaterial({
      color: new THREE.Color(CROWN_COLOUR),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The collection. Lighter than the pit it sits in, so the frames are objects
    // in a dark room rather than shapes cut out of one.
    salvage: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL_SHADOW),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // One blanket, and the only warm surface in the compartment.
    foil: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.FOIL),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The lamp-diffuser rule: no diffuse term at all and the whole value in
    // emissive, or the fitting clips the moment anything bright lands on it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.MINT),
      emissiveIntensity: 0.4,
    }),
  };
  for (const key of Object.keys(materials)) {
    const boxes = parts.filter((part) => part.material === key).map((part) => boxOf(part));
    const material = materials[key];
    if (boxes.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(boxes), material);
    mesh.name = `sill-${key}`;
    root.add(mesh);
  }

  // --- The light rig, and the one thing about this room nobody may quietly
  // undo.
  //
  // The hemisphere's ground term is NIGHT_SIDE rather than a hull value, which
  // is not a taste: the ground term is bounced light off the floor, and a third
  // of this floor is not a floor. Nothing bounces out of a hole.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    new THREE.Color(PALETTE.NIGHT_SIDE).getHex(),
    0.62
  );
  root.add(ambient);

  // Four lamps, all of them over a walking line and none of them over the
  // grating. Decay 1 rather than the physical 2, so the two coves overlap into
  // an even wash down each side instead of four bright patches with dark gaps
  // between them; the rhythm in this room belongs to the bars, not the ceiling.
  //
  // 0.55 over 5.4 m, raised from 0.30 over 4.2. The room was not moody, it was
  // unlit: the pinned frame measured luma 26 to 41 across its whole width, a
  // fifteen-value range in a picture that has 230 to work with, and space
  // itself is 25.5. Every surface in view sat within sixteen values of the
  // void. The coves stay over the aisles and the grating stays the darkest
  // walkable strip in the station - that contrast is the room - but the walls
  // it throws the contrast against now have something on them to see.
  for (const z of [-COVE_Z, COVE_Z]) {
    for (const x of [-1.35, 1.35]) {
      const lamp = new THREE.PointLight(new THREE.Color(PALETTE.MINT).getHex(), 0.55, 5.4, 1);
      lamp.position.set(x, 2.78, z);
      root.add(lamp);
    }
  }

  // The sump lamp. Warm, 3 m below the deck, and the only source under anybody's
  // feet on the whole station. Placed out in the middle of the pit rather than
  // at the fitting on the wall - a point source 0.2 m off a surface clips it
  // white, and there is no white in this game - so the fitting reads as the
  // thing the light comes from without the light actually starting there.
  const sump = new THREE.PointLight(new THREE.Color(PALETTE.SETTLEMENT).getHex(), 1.1, 7.0, 1);
  sump.position.set(0.3, -2.95, 0.3);
  root.add(sump);

  // One weak cross-key so the kerb, the rail and the perch have a light side and
  // the room is not lit purely from directly above and directly below.
  const cross = new THREE.DirectionalLight(new THREE.Color(PALETTE.HULL).getHex(), 0.24);
  cross.position.set(-4, 3, 3);
  cross.target.position.set(1, FLOOR_Y, -1);
  root.add(cross, cross.target);

  /**
   * A ring of deck, and the grating across the middle of it.
   *
   * This room was authored twice over and disagreed with itself. The ports say
   * standing over the drop is the only thing the compartment has to say; the
   * deck said the bars are what you see through, not what you stand on. Both
   * cannot be true, and the station settles it: a centred doorway with an
   * unwalkable hole 1.6 m inside it is a wall you cannot see, put exactly where
   * a player is walking fastest, and the floor-continuity gate found it the
   * moment the room was joined to anything.
   *
   * So the bars carry you. That is also what a grating IS - the reason to build
   * one over a hole rather than a plate is that it holds a person up and still
   * lets them see through, and 4.5 m of lit sump directly beneath your own feet
   * is worth more than the same drop viewed over a kerb from the end of it.
   *
   * The two rails keep their job and get a better one: they are no longer a
   * label on a hazard, they are the thing between you and it. They stand at
   * 0.85 m, outside the grating rectangle and inside the aisle rectangles, so
   * there is no floor at all along the line they occupy - you cannot cross from
   * an aisle onto the bars, only walk on from either open end. The route through
   * this compartment is therefore still a choice, which is what the ports wanted:
   * straight out over the drop, or round the side of it.
   *
   * The rectangles tile without overlapping and touch exactly at their shared
   * edges, which is what lets a walk cross between them. The grating runs out to
   * the kerb line rather than to its own edge so that it MEETS the end landings:
   * a rectangle that stops 0.10 m short of the next one is an island, and an
   * island is unreachable no matter how solid it looks.
   */
  const floor: readonly FloorRect[] = [
    {
      minX: KERB_X,
      maxX: HALF_X - WALL_STANDOFF,
      minZ: -HALF_Z + WALL_STANDOFF,
      maxZ: HALF_Z - WALL_STANDOFF,
      floorY: FLOOR_Y,
    },
    {
      minX: -HALF_X + WALL_STANDOFF,
      maxX: -KERB_X,
      minZ: -HALF_Z + WALL_STANDOFF,
      maxZ: HALF_Z - WALL_STANDOFF,
      floorY: FLOOR_Y,
    },
    { minX: -KERB_X, maxX: KERB_X, minZ: KERB_Z, maxZ: HALF_Z - WALL_STANDOFF, floorY: FLOOR_Y },
    { minX: -KERB_X, maxX: KERB_X, minZ: -HALF_Z + WALL_STANDOFF, maxZ: -KERB_Z, floorY: FLOOR_Y },
    { minX: -KERB_X, maxX: KERB_X, minZ: -OPEN_HALF_Z, maxZ: OPEN_HALF_Z, floorY: FLOOR_Y },
  ];

  const points: readonly PointOfInterest[] = [
    // The register, and the only operable thing in the compartment.
    { id: 'salvage', label: 'the salvage register', position: [0, 1.06, -0.95], operable: true },
    { id: 'perch', label: 'the perch', position: [2.41, 0.58, 1.68] },
    { id: 'sump', label: 'the sump', position: [0, -3.3, 0] },
    { id: 'bank', label: 'the pump controls', position: [0, 1.5, 1.88] },
  ];

  let read = 0;

  return {
    root,
    // Just inside the fore door, square to the room, with the eye tipped far
    // enough down that the dark rectangle in the floor is in frame from the
    // first instant and the depth of it is not.
    spawn: { position: [2.6, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: -0.12 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    // Distinct from every neighbour. A stripped plant space still has the
    // station's own air handling running through it and nothing of its own.
    machineryHz: 64,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * Two boxes, one under the other, and the reason this is a `max` rather than
     * a `min`.
     *
     * Every other room's hull is one convex volume, so its clearance is the
     * nearest of a handful of planes. This one is a room with a smaller room
     * hung beneath it, and a point is inside if it is inside EITHER. Taking the
     * larger of the two clearances gets that exactly, including the shared
     * plane at the deck, where both terms go to zero and neither is negative -
     * which is right, because the deck is where the two volumes meet and the
     * grating bars have corners sitting in it.
     */
    contains(point: THREE.Vector3): number {
      const above = Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
      const below = Math.min(
        FLOOR_Y - point.y,
        point.y - SUMP_FLOOR_Y,
        SUMP_HALF_X - Math.abs(point.x),
        SUMP_HALF_Z - Math.abs(point.z)
      );
      return Math.max(above, below);
    },

    interact(id: string): boolean {
      if (id !== 'salvage') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Nothing in this room moves, and the frames below least of all. A refit
      // takes a session; a winch running while you watch would say the station
      // is doing the work, and the whole reason the collection is behind a
      // grating is that it is waiting on the player rather than on a clock.
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

export const SILL: CompartmentDefinition = {
  id: 'sill',
  name: 'THE SILL',
  description: 'The salvage register, 6 by 4 m over a lit 4.5 m sump.',
  ports: PORTS,
  extent: EXTENT,
  build: buildSill,
};

export const SILL_SOLO = {
  id: 'sill',
  name: 'THE SILL',
  description: 'The salvage register, 6 by 4 m over a lit 4.5 m sump.',
  build: () => soloStation(SILL),
};

export default SILL_SOLO;
