/**
 * THE PLOT - the flight deck, and the only room the game is actually played in.
 *
 * Every other compartment houses something you look at. This one houses the
 * exchange the whole design is built around: the flight computer solves the
 * transfer, prints twelve fields, fills eleven of them, and stops. A person
 * closes the last line. STRUCTURE.md calls that the PAD exchange and gives it to
 * this room by name, so the fittings here are not furniture - they are the
 * hardware that exchange physically needs, and nothing else is in here.
 *
 * WHAT THAT ACTUALLY REQUIRES, in order. Somewhere to stand, in one place,
 * repeatedly, so the room has a primary station rather than a general area. A
 * surface at working height to read a card on. A slot the card comes out of and
 * a ledge it lands on, because a card that materialises in the air is a HUD and
 * DIRECTION bans those. Something to hold while you type, since the answer takes
 * a few seconds and a body with nothing to brace against fidgets. And a bank of
 * panels above the desk that is plainly the machine doing the eleven fields, so
 * the one blank reads as the small human end of a large mechanical argument.
 * That is the entire fit-out. A flight deck with clutter in it would be saying
 * that the card is one of several things happening here.
 *
 * 4.60 BY 3.40, FLAT AT 2.85. Deliberately the plainest volume on the station,
 * and that is the point rather than a shortfall. THE CROSSING next door is 5.40
 * by 4.20 under a crown that climbs from 2.60 to 4.40 in nine facets, because a
 * hub's job is to be memorable from the middle. An operations room's job is the
 * opposite: you are meant to stop reading the room within about four seconds and
 * start reading the card. A level ceiling with 0.80 m of crown over the 2.05 m
 * horizon is legible in one glance and then finished with you - which is a
 * different reading from the corridor's 0.19 m, and from the limb deck's 1.20 m,
 * without needing a single feature to say so.
 *
 * IT HAS NO WINDOW, and it must not. Only the anchor room may carry one - space
 * is painted into the screen rectangle the panes cover and the corners of those
 * panes live in the anchor's own frame, so a second windowed compartment
 * scissors the exterior onto the wrong part of the screen (see `Painter`). That
 * constraint happens to be exactly right here. The card is a claim about an
 * orbit you cannot see from inside, and a room that let you check it against the
 * real limb would turn a computation into a look out of the window.
 *
 * THREE DOORS, NONE OF THEM SYMMETRICAL. `fore` is centred, back toward the hub,
 * and it is the door you arrive by. `aft` is 0.55 m off the centreline, onward -
 * far enough off that standing in one you are not looking down the throat of the
 * other, which is what stops the room reading as a piece of corridor that got
 * wider. `port` is a dead-end spur in the long wall, and it faces the console
 * across the room's full width: coming back out of the spur, the flight station
 * is the whole frame. That satisfies the depth rule for free - what is opposite
 * a doorway is a mass with structure on it, never a blank wall.
 *
 * THE GROOVES HAVE TO BE CLOSED, and this is the third time it has had to be
 * said in this codebase. The work band is recessed 0.08 m OUTBOARD of the
 * nominal wall plane, which makes it a groove; a groove that runs off the end of
 * a wall is not a detail, it is a slot through the pressure hull with outer
 * space behind it, because the exterior pass clears depth before any interior
 * draws. The two end walls close the long runs. The `port` doorway cuts the -z
 * wall into two runs and both of the new ends are capped here, per band, out to
 * the reveal depth - see `sideDoorway`, which draws every jamb twice, once
 * facing into the opening and once facing back along the wall it terminates.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import { CROWN_COLOUR, REVEAL_COLOUR, bands, deepestRelief } from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

const HALF_X = 2.3;
const HALF_Z = 1.7;
const FLOOR_Y = 0;
const CEILING_Y = 2.85;

/**
 * How far outboard of the nominal plane the deepest band face sits, and how far
 * inboard the proudest one stands.
 *
 * Both are read off `bands()` rather than typed, because both are the whole
 * reason the liner is hard: the deck may only run out as far as the proudest
 * band's face or it shares a plane with that band's own return, and the end
 * walls must run out past the deepest one or the recess is open to space.
 */
const OUTER_Z = HALF_Z + deepestRelief(FLOOR_Y, CEILING_Y);
const PROUDEST = Math.max(0, ...bands(FLOOR_Y, CEILING_Y).map((band) => band.relief));

/** How far a doorway reveal is let into the wall before the collar takes over. */
const DOOR_DEPTH = 0.2;

/**
 * How far inboard of the seam the port wall - the one the spur leads off - is
 * built.
 *
 * The end walls are flat, so they only have to clear the seam by SEAM_INSET_M.
 * The long wall the spur cuts through is banded, and the work band is a groove
 * cut OUTBOARD of the nominal plane: built to the seam, its whole groove stands
 * in the crawlway, where that room's own liner already is. Standing the wall
 * off by this room's deepest relief as well puts the deepest face where the
 * nominal plane was, one seam inset short of the seam.
 */
const PORT_WALL_SETBACK = deepestRelief(FLOOR_Y, CEILING_Y) + SEAM_INSET_M;

/** A long wall's nominal plane. Only the port side carries a doorway. */
function wallHalfZ(side: -1 | 1): number {
  return side < 0 ? HALF_Z - PORT_WALL_SETBACK : HALF_Z;
}

const SEED = 0x91a;
const JITTER = 0.05;
const EYE_HEIGHT = 1.74;

/**
 * The console, as one set of numbers everything else is measured off.
 *
 * Two ISPR bays wide, because every repeating element in the station is a
 * division of the 1.05 m rack module and a desk that is 2.1 m rather than "about
 * two metres" is a desk the rest of the building agrees with. Shallow at 0.52 m,
 * and that is a reach calculation rather than a style: the limb only takes hold
 * within 0.95 m of the shoulder, the shoulder rides 0.30 m under the eye, and a
 * player held off by the walkable floor's own wall margin has to be able to
 * touch the card slot from where they are standing. A deeper desk puts the slot
 * out of the hand and the room stops working.
 */
const DESK_X0 = -1.75;
const DESK_X1 = 0.35;
/** Back of everything: 10 mm inside the nominal plane, so it laps the liner. */
const DESK_BACK_Z = 1.68;
const DESK_FRONT_Z = 1.16;
/** Working height, and the top of the panel bank - which lands on the horizon. */
const DESK_TOP_Y = 1.03;
const BANK_TOP_Y = 2.05;
/** Mouth of the card slot: the plane the printed card comes out of. */
const SLOT_Z = 1.48;
const SLOT_Y0 = 1.15;
const SLOT_Y1 = 1.29;

/**
 * Three ports, and the offsets are the information.
 *
 * `fore` is centred and `aft` is not, so a player standing in either one can
 * tell which is which without turning round: from the centred door the offset
 * one is visibly off to starboard, and from the offset one the centred door is
 * the only thing on the axis. `port` is in a long wall rather than an end, which
 * is the third kind of opening this room can offer without inventing a fourth
 * seam size.
 */
const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, SEAM.height / 2, 0.55], '-x', FLOOR_Y),
  port('port', [-0.4, SEAM.height / 2, -HALF_Z], '-z', FLOOR_Y),
] as const;

/** Where the `port` doorway's two jambs stand, in x. */
const SPUR_X = -0.4;
const SPUR_HALF = SEAM.width / 2;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  // Out to the doorway reveal rather than to the nominal plane. The room really
  // does own geometry that far out, and a neighbour placed against an understated
  // extent is a neighbour standing in this room's wall.
  // To the seam planes, not past them. A doorway reveal belongs in the collar -
  // that 1.24 m of structure between two compartments is exactly what it is for,
  // and the limb deck's door sleeve lives there too. An extent that reaches
  // beyond its own port plane is a room claiming the space its neighbour stands
  // in, and the overlap check refuses the layout.
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

/**
 * Every box the flight deck is made of.
 *
 * Declared as data so `tests/rooms.test.ts` can check the lot for shared planes
 * and for standing inside the hull. Two habits run through the list and both are
 * defects that have already shipped: anything sitting on top of something else
 * has its bottom face exactly at the other's top face, so the two are back to
 * back rather than fighting; and anything let into something else is pushed
 * bodily inside it rather than parked a few millimetres off, so there is no slot
 * for a grazing ray to find.
 */
function plotSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The console. Plinth, carcass, worktop, then the bank above it.
  //
  // The plinth is held back from the carcass front so there is a toe recess to
  // stand into; a desk you cannot get your feet under is a desk you lean at from
  // 100 mm too far away, and 100 mm is most of the reach budget.
  parts.push(
    solid('desk-plinth', 'trim', DESK_X0 + 0.04, DESK_X1 - 0.04, FLOOR_Y, 0.13, 1.26, DESK_BACK_Z),
    solid('desk-carcass', 'frame', DESK_X0, DESK_X1, 0.13, 0.97, DESK_FRONT_Z, DESK_BACK_Z),
    // Overhanging the carcass on both ends and at the front, so its side faces
    // never land in the carcass's side planes. A worktop flush with its own
    // cabinet is four coplanar face pairs down the length of the room.
    solid('desk-top', 'frame', DESK_X0 - 0.08, DESK_X1 + 0.08, 0.97, DESK_TOP_Y, 1.08, DESK_BACK_Z)
  );

  // --- The panel bank, and the card slot cut through it.
  //
  // Built as four pieces around a rectangle rather than as one slab with a hole,
  // for the same reason the corridor's end walls are: a doorway in a flat wall
  // needs no cutter, and every cutter this project has written has cost it a
  // hole to space. The slot is a genuine void 0.20 m deep with a dark back, so
  // it reads as somewhere a card comes FROM.
  parts.push(
    solid('bank-sill', 'frame', DESK_X0, DESK_X1, DESK_TOP_Y, SLOT_Y0, SLOT_Z, DESK_BACK_Z),
    solid('bank-left', 'frame', DESK_X0, -1.15, SLOT_Y0, SLOT_Y1, SLOT_Z, DESK_BACK_Z),
    solid('bank-right', 'frame', -0.15, DESK_X1, SLOT_Y0, SLOT_Y1, SLOT_Z, DESK_BACK_Z),
    solid('bank-head', 'frame', DESK_X0, DESK_X1, SLOT_Y1, BANK_TOP_Y, SLOT_Z, DESK_BACK_Z),
    solid('slot-back', 'trim', -1.15, -0.15, SLOT_Y0, SLOT_Y1, 1.6, DESK_BACK_Z)
  );

  // --- The print ledge. Where the card lands, and the reason the slot is not
  // simply a hole at eye height: a printed card has to come to rest somewhere a
  // hand can pick it up, and the tray under the slot is that somewhere.
  //
  // It stands ON the worktop rather than being let into it. A tray whose top is
  // level with the surface it sits in shares that surface's plane, and 0.14 m2
  // of two faces at one depth is the defect this file's neighbours have each
  // shipped once.
  parts.push(
    solid('ledge-tray', 'trim', -1.02, -0.22, DESK_TOP_Y, 1.05, 1.3, SLOT_Z),
    solid('ledge-lip', 'trim', -0.98, -0.26, 1.05, 1.1, 1.32, 1.36)
  );

  // --- The grab rail across the console front, and the two posts carrying it
  // back under the worktop's overhang. This is what a body holds while the other
  // hand types, and it is the only reason the primary station is a place to
  // stand rather than a place to stop.
  parts.push(solid('desk-rail', 'grip', -1.55, 0.15, 0.88, 0.92, 1.0, 1.04));
  for (const [n, x] of [-1.49, 0.03].entries()) {
    parts.push(solid(`rail-post-${n}`, 'frame', x, x + 0.06, 0.92, 0.97, 1.005, DESK_FRONT_Z));
  }

  // --- The primary station itself, stated on the deck.
  //
  // A raised plate with two toe bars on it. Nothing enforces where the player
  // stands - the floor is a union of rectangles and they may stand anywhere in
  // it - so this is not a restraint, it is a mark. A room whose one job is done
  // from one spot should say where that spot is without a placard, and a change
  // of material underfoot is the quietest way to say it.
  parts.push(solid('stand-plate', 'trim', -1.15, -0.25, FLOOR_Y, 0.025, 0.42, 0.9));
  for (const [n, x] of [-1.06, -0.54].entries()) {
    parts.push(solid(`stand-toe-${n}`, 'frame', x, x + 0.2, 0.025, 0.07, 0.5, 0.58));
  }

  // --- The perch. S9: one rest object, geometrically the same in every
  // compartment, within 2 m of the door the player arrives through and on the
  // left as they come in. It is the station's only wayfinding anchor besides the
  // datum, so it does not take on this room's identity and it does not move.
  //
  // Left, here, is +z: entering through `fore` you walk in -x, and the frame has
  // +z to starboard of +x, so a half turn puts starboard on your left hand.
  parts.push(
    solid('perch', 'trim', 1.1, 1.72, 0.58, 0.62, 1.32, 1.66),
    solid('perch-bracket', 'frame', 1.36, 1.46, FLOOR_Y, 0.58, 1.48, 1.64),
    solid('perch-loop', 'grip', 1.2, 1.62, 1.36, 1.4, 1.56, 1.6)
  );
  // The loop's two mounts reach back to 10 mm inside the nominal plane. They
  // cannot reach the work band's own face, which is 0.08 m further out again -
  // `contains` is the nominal vessel and anything past it is outside the room by
  // the only test that can see it. Standing in the recess is what a fitting at
  // eye height does anyway.
  for (const [n, x] of [1.22, 1.56].entries()) {
    parts.push(solid(`loop-mount-${n}`, 'frame', x, x + 0.04, 1.34, 1.42, 1.6, 1.69));
  }

  // --- S11: exactly one thing out of its stowed position, and one only.
  //
  // The card file under the worktop, standing 0.24 m out of its bay with its
  // pull still on it. Chosen over something smaller because the rule is that a
  // player notices the disorder within about four seconds of standing still, and
  // this room is one they stand still in on purpose. Its back is buried in the
  // carcass rather than parked against it, so the drawer is genuinely in its
  // opening and not a box floating in front of one.
  parts.push(
    solid('file-drawer', 'trim', -1.58, -0.88, 0.58, 0.86, 0.92, 1.2),
    solid('drawer-pull', 'grip', -1.34, -1.12, 0.7, 0.74, 0.88, 0.92)
  );

  // --- Three lamps, sized to the three things that happen here: one long one
  // over the console so the worktop is the brightest surface in the room, one
  // over the walk in from `fore`, one small one over the mouth of the spur so
  // the dead end is not a dark hole. Their material takes no diffuse light and
  // carries its whole value in emissive - the lamp-diffuser rule, without which
  // a lit surface plus a lit emissive term clips in a game with no white in it.
  parts.push(
    solid('lamp-station', 'lamp', -1.6, 0.2, 2.71, 2.79, 0.9, 1.24),
    solid('lamp-walk', 'lamp', 0.9, 2.0, 2.73, 2.79, -0.4, -0.1),
    solid('lamp-spur', 'lamp', -0.85, 0.05, 2.75, 2.79, -1.2, -1.0)
  );

  return parts;
}

/** Deck, flat crown, the banded long walls, two end walls and one side doorway. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const roof = new THREE.Color(CROWN_COLOUR);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const inward = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  // --- The deck, in plates. Out to the nominal plane on all four sides, which
  // is 0.06 m behind the kick band's own face - so the last strip of it is
  // hidden under the band rather than sharing a plane with the band's bottom
  // return. That return is therefore not drawn at all: see `wallBands`.
  const deckPlates = 6;
  const deckRows = 4;
  for (let i = 0; i < deckPlates; i += 1) {
    for (let j = 0; j < deckRows; j += 1) {
      const x0 = -HALF_X + (2 * HALF_X * i) / deckPlates;
      const x1 = -HALF_X + (2 * HALF_X * (i + 1)) / deckPlates;
      const z0 = -HALF_Z + (2 * HALF_Z * j) / deckRows;
      const z1 = -HALF_Z + (2 * HALF_Z * (j + 1)) / deckRows;
      const mid = v((x0 + x1) / 2, FLOOR_Y, (z0 + z1) / 2);
      inward.set(mid.x, FLOOR_Y + 2, mid.z);
      pushQuad(
        target,
        v(x0, FLOOR_Y, z0),
        v(x1, FLOOR_Y, z0),
        v(x1, FLOOR_Y, z1),
        v(x0, FLOOR_Y, z1),
        inward,
        facetColour(deck, mid, SEED, JITTER)
      );
    }
  }

  // --- The crown. Flat, and held to the proudest band's face for the same
  // reason the deck is held to the nominal plane: the crown band's top return
  // already occupies the strip between the two, facing the same way. Measured
  // off each wall's OWN plane, since the port wall stands 86 mm inboard of the
  // other one and a crown run to the wrong side's face reopens exactly the
  // clash the setback closed.
  const roofZ0 = -wallHalfZ(-1) + PROUDEST;
  const roofZ1 = wallHalfZ(1) - PROUDEST;
  const roofPlates = 5;
  const roofRows = 3;
  for (let i = 0; i < roofPlates; i += 1) {
    for (let j = 0; j < roofRows; j += 1) {
      const x0 = -HALF_X + (2 * HALF_X * i) / roofPlates;
      const x1 = -HALF_X + (2 * HALF_X * (i + 1)) / roofPlates;
      const z0 = roofZ0 + ((roofZ1 - roofZ0) * j) / roofRows;
      const z1 = roofZ0 + ((roofZ1 - roofZ0) * (j + 1)) / roofRows;
      const mid = v((x0 + x1) / 2, CEILING_Y, (z0 + z1) / 2);
      inward.set(mid.x, FLOOR_Y, mid.z);
      pushQuad(
        target,
        v(x0, CEILING_Y, z0),
        v(x1, CEILING_Y, z0),
        v(x1, CEILING_Y, z1),
        v(x0, CEILING_Y, z1),
        inward,
        facetColour(roof, mid, SEED + 7, JITTER)
      );
    }
  }

  /**
   * One run of long wall, in the station's three bands, from a given height up.
   *
   * `yFrom` is what lets the wall carry on OVER a doorway: above the seam the
   * crown band runs unbroken across the opening, which is why the head of the
   * `port` door reads as a soffit rather than as a lintel stuck on afterwards.
   *
   * The return at the deck is deliberately skipped. It is a horizontal strip at
   * y = 0 facing up, which is the deck's own plane and the deck's own direction,
   * and 0.06 m by the length of the room of that is two surfaces the depth
   * buffer has to choose between per pixel.
   */
  const wallBands = (x0: number, x1: number, side: -1 | 1, yFrom: number): void => {
    inward.set((x0 + x1) / 2, CEILING_Y / 2, 0);
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const y0 = Math.max(band.y0, yFrom);
      const y1 = band.y1;
      if (y1 - y0 < 1e-6) continue;
      const z = side * (wallHalfZ(side) - band.relief);
      const lip = side * wallHalfZ(side);
      pushQuad(
        target,
        v(x0, y0, z),
        v(x1, y0, z),
        v(x1, y1, z),
        v(x0, y1, z),
        inward,
        facetColour(
          new THREE.Color(band.colour),
          v((x0 + x1) / 2, (y0 + y1) / 2, z),
          SEED + 3,
          JITTER
        )
      );
      if (Math.abs(band.relief) < 1e-6) continue;
      for (const y of [y0, y1]) {
        if (Math.abs(y - FLOOR_Y) < 1e-6) continue;
        pushQuad(
          target,
          v(x0, y, lip),
          v(x1, y, lip),
          v(x1, y, z),
          v(x0, y, z),
          inward,
          facetColour(reveal, v((x0 + x1) / 2, y, (lip + z) / 2), SEED + 5, JITTER)
        );
      }
    }
  };

  // Starboard runs the whole length. Port is cut in two by the spur.
  wallBands(-HALF_X, HALF_X, 1, FLOOR_Y);
  wallBands(-HALF_X, SPUR_X - SPUR_HALF, -1, FLOOR_Y);
  wallBands(SPUR_X + SPUR_HALF, HALF_X, -1, FLOOR_Y);
  wallBands(SPUR_X - SPUR_HALF, SPUR_X + SPUR_HALF, -1, SEAM.height);

  /**
   * The spur's doorway: two jambs and a head, drawn per band.
   *
   * Per band, because the wall it is cut through is not one plane. The kick
   * stands 0.06 m proud, the work is recessed 0.08 m and the crown stands 0.14 m
   * proud, so a jamb built to a single depth either floats in front of the kick
   * or leaves the work groove open at both of its new ends - which is a slot
   * through the pressure hull, 0.08 m wide and 1.10 m tall, at eye height, and
   * it has now been shipped twice.
   *
   * Each jamb is drawn TWICE, facing opposite ways. It is a zero-thickness
   * partition doing two jobs at once: seen from inside the opening it is the
   * reveal, and seen from along the wall it is the cap on the band run that dies
   * here. One quad would do exactly one of those and cull for the other, and a
   * culled facet in a pressure hull is a hole with space behind it.
   */
  const sideDoorway = (atX: number, side: -1 | 1): void => {
    const outZ = side * (HALF_Z + DOOR_DEPTH);
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const y0 = band.y0;
      const y1 = Math.min(band.y1, SEAM.height);
      if (y1 - y0 < 1e-6) continue;
      const faceZ = side * (wallHalfZ(side) - band.relief);
      for (const jx of [atX - SPUR_HALF, atX + SPUR_HALF]) {
        for (const towards of [atX, 2 * jx - atX]) {
          inward.set(towards, (y0 + y1) / 2, (faceZ + outZ) / 2);
          pushQuad(
            target,
            v(jx, y0, faceZ),
            v(jx, y0, outZ),
            v(jx, y1, outZ),
            v(jx, y1, faceZ),
            inward,
            facetColour(hull, v(jx, (y0 + y1) / 2, (faceZ + outZ) / 2), SEED + 13, JITTER)
          );
        }
      }
    }
    // The head runs from the nominal plane outward only. Inboard of that, the
    // crown band's own bottom return is already the soffit, and the two tile
    // edge to edge instead of overlapping.
    const lip = side * wallHalfZ(side);
    inward.set(atX, SEAM.height - 0.6, lip);
    pushQuad(
      target,
      v(atX - SPUR_HALF, SEAM.height, lip),
      v(atX + SPUR_HALF, SEAM.height, lip),
      v(atX + SPUR_HALF, SEAM.height, outZ),
      v(atX - SPUR_HALF, SEAM.height, outZ),
      inward,
      facetColour(hull, v(atX, SEAM.height, (lip + outZ) / 2), SEED + 17, JITTER)
    );
  };
  sideDoorway(SPUR_X, -1);

  /**
   * An end wall, with its doorway cut out as three panels around a rectangle.
   *
   * Run out to the deepest band face rather than to the nominal plane. This is
   * what closes both long walls' work grooves at this end of the room, and an
   * end wall stopping at its own half-width is the version that put 886 pixels
   * of exact VOID_SLATE up the side of a corridor door.
   */
  const endWall = (x: number, sign: -1 | 1, openZ: number): void => {
    inward.set(x - sign, CEILING_Y / 2, 0);
    const halfW = SEAM.width / 2;
    const panel = (z0: number, z1: number, y0: number, y1: number): void => {
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
    panel(-OUTER_Z, openZ - halfW, FLOOR_Y, CEILING_Y);
    panel(openZ + halfW, OUTER_Z, FLOOR_Y, CEILING_Y);
    panel(openZ - halfW, openZ + halfW, SEAM.height, CEILING_Y);
  };
  endWall(HALF_X - SEAM_INSET_M, 1, 0);
  endWall(-(HALF_X - SEAM_INSET_M), -1, 0.55);

  return toGeometry(target);
}

function buildPlot(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'plot';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'plot-shell';
  root.add(shell);

  const parts = plotSolids();
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
    // MINT, and only on the two things a hand closes round plus the one pull on
    // the drawer that is out. DIRECTION gives mint to instruments, and the
    // temptation in an operations room is to put it on the panel bank - which
    // would be an emissive interface by another name and is exactly what is
    // banned. Held to hardware you touch, it stays a material rather than a
    // signal, and it is small enough not to become the brightest thing in a
    // deliberately quiet room.
    grip: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.MINT),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.CLOUD),
      emissiveIntensity: 0.38,
    }),
  };
  for (const key of Object.keys(materials)) {
    const solids = parts.filter((p) => p.material === key).map((p) => boxOf(p));
    const material = materials[key];
    if (solids.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `plot-${key}`;
    root.add(mesh);
  }

  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    1.05
  );
  root.add(ambient);

  // The console is the brightest thing in the room and everything else falls off
  // from it. That is not decoration either: with a level ceiling and no window
  // there is nothing else to tell a player where the room wants them, and light
  // is the only instruction this game is willing to give.
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.55);
  key.position.set(-0.7, CEILING_Y - 0.2, 1.05);
  key.target.position.set(-0.7, DESK_TOP_Y, DESK_BACK_Z);
  root.add(key, key.target);

  // A weaker one over the walk in, aimed down the room, so arriving through
  // `fore` you are walking from a dimmer place into a brighter one.
  const along = new THREE.DirectionalLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.4);
  along.position.set(1.5, CEILING_Y - 0.2, -0.2);
  along.target.position.set(-1.0, FLOOR_Y, 0.4);
  root.add(along, along.target);

  // And one wash across the port wall. A vertical surface takes nothing from a
  // light directly above it - its normal is horizontal and the dot product is
  // zero - so a room keyed only from its own ceiling has two walls that fall to
  // the emissive floor and vanish, taking the spur's doorway with them.
  const wash = new THREE.DirectionalLight(new THREE.Color(PALETTE.HULL).getHex(), 0.26);
  wash.position.set(0, CEILING_Y * 0.7, 0.6);
  wash.target.position.set(-0.4, 1.0, -HALF_Z * 2);
  root.add(wash, wash.target);

  /**
   * The walkable deck, as five strips that tile in x without overlapping.
   *
   * They touch exactly at their shared edges rather than merely coming close,
   * because the controller only skips its wall margin where a probe just outside
   * one rectangle lands inside another - so a gap of any size between two strips
   * is a pair of invisible walls in the middle of the floor.
   *
   * The cuts in x are the console and the perch: in front of each, the strip
   * stops short of the fitting, and either side of it the floor runs the full
   * width. That is why the strips are cut this way round rather than as one big
   * rectangle with holes, which rectangles cannot express.
   */
  const floor: readonly FloorRect[] = [
    { minX: -HALF_X + 0.08, maxX: -1.83, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
    { minX: -1.83, maxX: 0.43, minZ: -1.62, maxZ: 1.0, floorY: FLOOR_Y },
    { minX: 0.43, maxX: 1.02, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
    { minX: 1.02, maxX: 1.8, minZ: -1.62, maxZ: 1.24, floorY: FLOOR_Y },
    { minX: 1.8, maxX: HALF_X - 0.08, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
  ];

  const points: readonly PointOfInterest[] = [
    // The card slot, and the only operable thing in the room. The hand is the
    // whole interface - there is no cursor, no highlight and no prompt - so a
    // reach is a promise, and the promise here is the one the game is made of.
    { id: 'pad', label: 'the card slot', position: [-0.6, 1.22, SLOT_Z], operable: true },
    { id: 'perch', label: 'the perch', position: [1.41, 0.62, 1.49] },
    { id: 'bank', label: 'the flight computer', position: [-0.6, 1.7, SLOT_Z] },
  ];

  let printed = 0;

  return {
    root,
    // Just inside the door you arrive by, turned far enough toward the console
    // that it is already in frame. Square down the axis would put the room's
    // whole point in peripheral vision and a blank end wall in the middle of it.
    spawn: {
      position: [1.9, FLOOR_Y + EYE_HEIGHT, 0],
      yaw: Math.PI / 2 + 0.3,
      pitch: -0.04,
    },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    // Distinct from every other compartment's, so a player who cannot see a
    // doorway can still tell which side of the station they woke up on. Lower
    // than the hub next door: an operations room hums, it does not whirr.
    machineryHz: 58,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * A plain box, measured to the NOMINAL wall plane rather than to the work
     * band's recessed face.
     *
     * Understating the vessel by the depth of the recess is deliberate: it means
     * a fitting can never be authored into the groove, where it would be
     * invisible from every standing pose and 0.08 m outside the pressure
     * boundary as far as the only check that can see it is concerned.
     */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    interact(id: string): boolean {
      if (id !== 'pad') return false;
      printed += 1;
      return true;
    },

    update(): void {
      // Nothing in here moves, and in this room that is a rule rather than an
      // omission. The one thing that changes is the card, and the card belongs
      // to the game: an environment may not import game state, so a room that
      // animated the exchange would be animating a story it cannot be told. What
      // the player watches move is the orbit, and the orbit is not in this room.
      void printed;
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

export const PLOT: CompartmentDefinition = {
  id: 'plot',
  name: 'THE PLOT',
  description: 'The flight deck, 4.6 by 3.4 m, flat at 2.85. Where the card prints.',
  ports: PORTS,
  extent: EXTENT,
  build: buildPlot,
};

export const PLOT_SOLO = {
  id: 'plot',
  name: 'THE PLOT',
  description: 'The flight deck, 4.6 by 3.4 m, flat at 2.85. Where the card prints.',
  build: () => soloStation(PLOT),
};

export default PLOT_SOLO;
