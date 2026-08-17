/**
 * THE AFT DOOR - a pressure door that lifts.
 *
 * Three leaves that rise into a pocket over the opening on a button press, hold,
 * and come back down. Not a swinging hatch: a hatch has to be reached past,
 * dogged, and left hanging in the room it opens into, and every one of those is
 * a thing between the player and the next compartment. A door that goes straight
 * up leaves a clean rectangle of floor to walk through and puts all its
 * mechanism overhead where nothing else lives.
 *
 * WHY THREE LEAVES. The opening has to be walked through, which given a 1.74 m
 * eye means about two metres of clear height - and a door has to go somewhere.
 * A one-piece slab needs its own height again above the lintel, which is 4 m of
 * headroom in a hull that has 3.2; the first version of this simply drew its
 * housing out through the roof, where no interior pose could see it. Two leaves
 * halve that and still do not fit at this height. Three do, with room to spare,
 * because the pocket only ever has to be one leaf tall.
 *
 * They are geared to arrive together: every leaf reaches the head at the same
 * moment, so the bottom one travels the whole opening while the top one travels
 * a third of it, and the lower a leaf sits the faster it visibly runs. That is
 * what a telescoping door looks like, and it is the reason this reads as a
 * mechanism rather than as a texture sliding upward.
 *
 * WHERE IT SITS. In the bulkhead's thickness, aft of the plane, not bolted to
 * the room side of it. That is how a pressure door is actually built, and here
 * it also keeps the whole assembly clear of the walkable deck.
 *
 * WHAT IS BEHIND IT. A sleeve running aft, capped at its far end. That cap is
 * temporary in the fiction and permanent in the rule: the interior has to stay
 * airtight from every reachable eye position, because the exterior pass clears
 * depth before the room is drawn and any hole shows space through the hull. When
 * there is a second compartment it attaches at the cap and the cap comes out -
 * which is also the seam the game will stream rooms across.
 *
 * HOW THIS FILE IS SHAPED, AND WHY. Every solid part is a record in one list,
 * `doorParts()`, rather than a `boxSpan` call buried in the build. That is not
 * tidiness. Two surfaces sharing a plane and facing the same way fight for every
 * pixel they cover, and that defect had to be found twice by eye in renders -
 * once where the pocket cheeks landed on the bulkhead, once where the frame and
 * the sleeve overlapped in solid material and their faces came out flush. Eye is
 * the wrong instrument: a door this size has hundreds of face pairs. As a list,
 * `tests/door.test.ts` can check all of them, which is why the numbers below are
 * full of deliberate few-millimetre offsets. Every one of them is a plane that
 * would otherwise be shared.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { Animated, Frame } from './contract';
import { AFT_DOORWAY } from './shell';

/** The bulkhead plane this door is fitted to. */
export const BULKHEAD_X = -3.2;

/** Clear opening, taken off the pressure vessel's own cut with a margin. */
const BORE_Z = AFT_DOORWAY.maxZ - 0.045;
const HEAD_Y = AFT_DOORWAY.maxY - 0.06;
/** The threshold plate stands this proud of the deck; the door lands on it. */
const SILL_Y = 0.016;
const OPENING_H = HEAD_Y - SILL_Y;

/** How far the frame laps the bulkhead cut, and how far it stands into the room. */
const COAMING_LAP = 0.24;
const COAMING_DEPTH = 0.05;
/** The head above the opening, and the guide rails up either side of it. */
const FASCIA_DEPTH = 0.055;
const FASCIA_H = 0.34;
const RAIL_DEPTH = 0.08;
const RAIL_W = 0.075;
/** How far the rails overhang the opening, capturing the leaf edges. */
const RAIL_LIP = 0.012;

const LAP_Y = SILL_Y - COAMING_LAP;
const LAP_Z = BORE_Z + COAMING_LAP;
const FACE_X = BULKHEAD_X + COAMING_DEPTH;
const FASCIA_Y = HEAD_Y + FASCIA_H;

/**
 * Where the frame's back face and the sleeve's front face sit, relative to the
 * bulkhead plane. Neither is ON it, and that is the entire point.
 *
 * The pocket's side cheeks used to run forward to exactly x = -3.2, which is
 * exactly where the bulkhead is, and the result was a fine comb of alternating
 * pixels stitched up the wall either side of the head. The frame now runs aft
 * THROUGH the plane and the sleeve dies inside it, so they overlap in solid
 * material - which also seals, leaving no slot for a grazing ray.
 *
 * That overlap is why the sleeve is inset from the frame on every other axis
 * too (SLEEVE_INSET): two boxes occupying the same space is fine, two boxes
 * whose faces land in the same plane is not.
 */
const BACK_X = BULKHEAD_X - 0.022;
const SLEEVE_X = BULKHEAD_X - 0.01;
const SLEEVE_INSET = 0.008;

/** Leaves: three, lapping each other, thin enough to stack in the reveal. */
const LEAF_COUNT = 3;
const LEAF_LAP = 0.1;
const LEAF_H = (OPENING_H + (LEAF_COUNT - 1) * LEAF_LAP) / LEAF_COUNT;
const LEAF_T = 0.055;
const LEAF_SIDE_GAP = 0.008;
const LEAF_BORDER_PROUD = 0.016;
/** Plane-to-plane, with clearance for one leaf's raised border to pass another. */
const LEAF_PITCH = LEAF_T + LEAF_BORDER_PROUD + 0.018;
/** How far the shut door sits behind the bulkhead plane. */
const REVEAL = 0.05;
const LEAF_FRONT_X = BULKHEAD_X - REVEAL - LEAF_T;

/**
 * How much of the door is left showing under the head when it is fully open.
 *
 * The pocket is behind the bulkhead, so a door that retracted flush would not go
 * anywhere the player can see - it would simply cease to exist, and the one
 * thing the room asks you to believe is that this is a door that went upward.
 * Every real overhead door parks with its bottom rail in the opening.
 */
const PARK_LIP = 0.05;
const PARK_Y = HEAD_Y - PARK_LIP;

/** The pocket the leaves stack in, aft of the bulkhead and over the opening. */
const POCKET_Y = PARK_Y + LEAF_H + 0.05;
const ROOF_Y = POCKET_Y + 0.07;
const POCKET_X = LEAF_FRONT_X - (LEAF_COUNT - 1) * LEAF_PITCH - 0.04;

/** Depth of the sleeve aft of the bulkhead, metres, and the cap that closes it. */
const JAMB_DEPTH = 1.15;
const CAP_X = BULKHEAD_X - JAMB_DEPTH;
const CAP_T = 0.09;

/**
 * The seam: where the next compartment's structure begins.
 *
 * Exported because the alternative is the next room reverse-deriving
 * `BULKHEAD_X - 1.15` by reading this file, which is a seam two files describe
 * independently and therefore a seam that agrees only until someone edits one of
 * them. The cap standing at this plane is temporary in the fiction - when a room
 * is attached here, that room's own end wall is what seals the station.
 */
export const SEAM_X = CAP_X;

/**
 * Travel time, seconds, and the reason it is not faster.
 *
 * A door is the one moment the player hands control to the room, and how long it
 * takes is how heavy it reads. Under a second and a two-metre pressure door
 * looks like cardboard; much over two and the player is standing waiting, which
 * is the failure mode every airlock in every game has. This is also DIRECTION's
 * camera law applied to something that is not the camera: nothing the eye
 * follows may snap.
 */
const TRAVEL_S = 1.55;
/**
 * Seconds of full travel, as a divisor for turning the door's rate of change
 * into a 0-to-1 motor level. Exported so the room and the door cannot disagree
 * about what "full speed" is.
 */
export const DOOR_FULL_RATE_S = TRAVEL_S;
/**
 * How long it stands open before closing itself, seconds.
 *
 * Asked for at "maybe 5 seconds", and 5 is right for a door this size: long
 * enough to press it and walk 9 m at a walk, short enough that you see it shut
 * behind you and the station reads as pressurised compartments rather than one
 * continuous space with holes in it.
 */
const DWELL_S = 5.0;
/** The lock releasing before anything moves, and re-seating after. */
const LATCH_S = 0.28;

/** Where the door's button sits, on the starboard jamb outboard of the rail. */
const BUTTON_Y = 1.28;
const BUTTON_Z = BORE_Z + 0.157;
const BUTTON_PLATE_T = 0.016;
const BUTTON_CAP_T = 0.024;

/**
 * Where the door's button sits, in room coordinates.
 *
 * A module constant rather than a field on the handle, because the room's list
 * of points of interest is built before anything is constructed - and the arm
 * has to be able to reach this the same way it reaches everything else.
 */
export const DOOR_BUTTON: readonly [number, number, number] = [
  FACE_X + BUTTON_PLATE_T + BUTTON_CAP_T,
  BUTTON_Y,
  BUTTON_Z,
];

/**
 * The same door's control on the OTHER side, in the sleeve near its aft mouth.
 *
 * A door with one button is a door that only opens from the room that owns it.
 * Walking back down the corridor you arrived through there was nothing to
 * press and no way to get in - and because the shot harness only ever
 * photographed this door from inside the room, every picture of it showed a
 * door that worked.
 *
 * It sits 0.24 m into the sleeve rather than on the bulkhead's aft face,
 * because the bulkhead is 1.15 m up the tunnel and a promise the hand cannot
 * keep is worse than no button at all.
 */
const AFT_BUTTON_X = CAP_X + 0.24;
export const DOOR_BUTTON_AFT: readonly [number, number, number] = [
  AFT_BUTTON_X,
  BUTTON_Y,
  BORE_Z + SLEEVE_INSET - BUTTON_PLATE_T - BUTTON_CAP_T,
];

/**
 * How tall the hole is right now, metres above the deck.
 *
 * The leaves are geared to arrive together, so the lowest one governs and the
 * clear opening is linear in travel: nothing at rest, the full DOOR_CLEAR.height
 * when parked.
 *
 * Published because the station has to decide when the floor may run through
 * this doorway, and the honest question is "is the hole tall enough to walk
 * through" rather than "is the travel past some number somebody typed". It was
 * a number somebody typed - 0.35 - on the reasoning that the leaves clear the
 * head long before they are parked. They do not: this door is 1.99 m clear
 * fully open against a 1.74 m eye, so a standing player does not clear it until
 * 87% of travel, and at 0.35 the hole is 0.71 m tall and the eye walks through
 * two leaves. Reported as "I can walk through the wall of the door sometimes",
 * and the sometimes was how far up the leaves had got.
 */
export function clearHeight(travel: number): number {
  return SILL_Y + (PARK_Y - SILL_Y) * travel;
}

/**
 * The face of the head panel over the opening, for anything mounted on it.
 *
 * The module's name plate used to sit at a height typed in beside the old round
 * hatch, and the moment the doorway grew past it the name of the module hung in
 * the hole. A door publishing its own head is how the placard stays over the
 * door rather than in it, whatever the opening becomes next.
 */
export const DOOR_FASCIA = {
  x: BULKHEAD_X + FASCIA_DEPTH,
  minY: HEAD_Y,
  maxY: FASCIA_Y,
} as const;

/**
 * What the player actually walks through, in metres, with the door fully open.
 *
 * Measured from the threshold to the parked leaf and between the rails - not the
 * doorway the bulkhead was cut to, which is bigger than all of those and is what
 * made an earlier version of this door look walkable on paper and duckable in
 * the room.
 */
export const DOOR_CLEAR = {
  height: PARK_Y - SILL_Y,
  width: 2 * (BORE_Z - RAIL_LIP),
} as const;

/** How far the frame laps the bulkhead's cut, for the test against `cutMargin()`. */
export const DOOR_COAMING_LAP = COAMING_LAP;
/** The frontmost point the door owns, for the test against the walkable deck. */
export const DOOR_PROUD_X = FACE_X + BUTTON_PLATE_T + BUTTON_CAP_T;

/** One solid box. Everything the door builds is one of these. */
export interface DoorPart {
  readonly name: string;
  readonly material: 'frame' | 'sleeve' | 'trim' | 'leaf';
  /** Index of the leaf this rides, or -1 for anything that does not move. */
  readonly leaf: number;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
}

function part(
  name: string,
  material: DoorPart['material'],
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  leaf = -1
): DoorPart {
  return { name, material, leaf, x0, x1, y0, y1, z0, z1 };
}

/** Where leaf `i` sits when the door is shut, and how far it has to travel. */
function leafBottom(i: number): number {
  return SILL_Y + i * (LEAF_H - LEAF_LAP);
}
function leafPlane(i: number): number {
  return LEAF_FRONT_X - i * LEAF_PITCH;
}
export function leafLift(i: number): number {
  return PARK_Y - leafBottom(i);
}

/**
 * Every solid the door is made of, at rest.
 *
 * Read by `createDoor` to build the meshes and by the tests to check that no two
 * faces share a plane. Offsets that look arbitrary are not: see SLEEVE_INSET.
 */
export function doorParts(): readonly DoorPart[] {
  const parts: DoorPart[] = [];

  // --- The coaming: two jambs and a threshold, standing proud of the bulkhead.
  // No head piece - the fascia is the head, and one part doing one job is why
  // those two no longer overlap each other by a third of a metre.
  parts.push(
    part('jamb-port', 'frame', BACK_X, FACE_X, LAP_Y, HEAD_Y, -LAP_Z, -BORE_Z),
    part('jamb-starboard', 'frame', BACK_X, FACE_X, LAP_Y, HEAD_Y, BORE_Z, LAP_Z),
    part('threshold', 'frame', BACK_X, FACE_X, LAP_Y, SILL_Y, -BORE_Z, BORE_Z),
    // The head. The pocket is behind the bulkhead where nothing can see it, so
    // this panel is the only thing saying a mechanism lives up there.
    part('fascia', 'frame', BACK_X, DOOR_FASCIA.x, HEAD_Y, FASCIA_Y, -LAP_Z, LAP_Z)
  );

  // --- The guide rails: threshold to just under the head in one unbroken run,
  // overhanging the opening so they capture the leaf edges. They are the part
  // that ties the floor, the frame and the head together, and without them the
  // head reads as a slab hung above a hole.
  const railX0 = BULKHEAD_X + 0.01;
  const railX1 = BULKHEAD_X + RAIL_DEPTH;
  const railTop = FASCIA_Y - 0.04;
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'rail-port' : 'rail-starboard';
    const a = side * (BORE_Z - RAIL_LIP);
    const b = side * (BORE_Z + RAIL_W);
    const z0 = Math.min(a, b);
    const z1 = Math.max(a, b);
    parts.push(part(name, 'trim', railX0, railX1, SILL_Y, railTop, z0, z1));
  }

  // --- The sleeve: a rectangular sock aft of the bulkhead, opening out into the
  // pocket over the doorway. Inset from the frame on every axis they share.
  //
  // Split across two values, and not for decoration: nothing in here is lit - the
  // room's lamps are in the room and this is a hole in the wall behind them - so
  // every surface sits on the same emissive floor and a one-value tunnel renders
  // as a flat grey rectangle hung in the doorway. Walls one value, floor and
  // roof another, and the tunnel starts having a top and a bottom.
  const boreZ = BORE_Z + SLEEVE_INSET;
  const outerZ = LAP_Z - SLEEVE_INSET;
  const floorY = SILL_Y - SLEEVE_INSET;
  const capZ = boreZ + 0.007;
  const pocketTop = POCKET_Y + 0.05;
  parts.push(
    // One wall each side, running the full depth AND the full height - past the
    // tunnel's ceiling and up the pocket. Splitting it into a wall and a pocket
    // cheek was the obvious way to write it and put their faces in the same
    // plane as the jamb's top and the fascia's underside; one taller box has no
    // seam to fight over.
    part('sleeve-port', 'sleeve', CAP_X, SLEEVE_X, SILL_Y, ROOF_Y, -outerZ, -boreZ),
    part('sleeve-starboard', 'sleeve', CAP_X, SLEEVE_X, SILL_Y, ROOF_Y, boreZ, outerZ),
    part('sleeve-floor', 'frame', CAP_X, SLEEVE_X, LAP_Y + SLEEVE_INSET, floorY, -outerZ, outerZ),
    // Everything that caps the bore is only as wide as the bore, buried in the
    // walls at both ends. Anything reaching the walls' own outer face would be
    // flush with it.
    // Both run PAST the walls' ends rather than up to them: buried in the cap at
    // the far end, stopped short of the bulkhead at the near one, where solid
    // bulkhead is what seals in front of them.
    part('tunnel-roof', 'frame', CAP_X - 0.02, POCKET_X - 0.02, HEAD_Y, HEAD_Y + 0.08, -capZ, capZ),
    part('pocket-roof', 'sleeve', POCKET_X, SLEEVE_X - 0.008, POCKET_Y, pocketTop, -capZ, capZ),
    part('pocket-back', 'sleeve', POCKET_X - 0.02, POCKET_X, HEAD_Y - 0.01, pocketTop, -capZ, capZ),
    // The cap. Temporary in the fiction, load-bearing in the rule: without it the
    // room has a hole and the exterior pass shows space through the wall.
    part('cap', 'frame', CAP_X - CAP_T, CAP_X, LAP_Y + SLEEVE_INSET, ROOF_Y, -outerZ, outerZ)
  );

  // The mating flange on the cap: a square rib standing into the tunnel, which is
  // what the next compartment bolts to, and the only thing giving the far end of
  // an otherwise blank 1.15 m tunnel a scale.
  {
    const out = BORE_Z - 0.06;
    const inn = out - 0.05;
    const top = HEAD_Y - 0.09;
    const bottom = SILL_Y + 0.09;
    const x0 = CAP_X;
    const x1 = CAP_X + 0.03;
    parts.push(
      part('flange-bottom', 'trim', x0, x1, bottom, bottom + 0.05, -out, out),
      part('flange-top', 'trim', x0, x1, top - 0.05, top, -out, out),
      part('flange-port', 'trim', x0, x1, bottom + 0.05, top - 0.05, -out, -inn),
      part('flange-starboard', 'trim', x0, x1, bottom + 0.05, top - 0.05, inn, out)
    );
  }

  // Two frames standing into the bore, at thirds. A tunnel with nothing crossing
  // it has no scale and no distance: these are the only thing in the opening that
  // gets smaller, which is what makes it read as a passage rather than as a panel
  // painted on the back of the doorway. Buried a few millimetres into the liner
  // so no face of theirs shares a plane with it.
  //
  // Built as four boxes that ABUT rather than four that overlap at the corners -
  // the same shape either way, but overlapping ones share their end faces and
  // fight. The flange above is built the same way and always was.
  {
    const stand = 0.045;
    const buried = 0.005;
    for (const [n, at] of [
      [0, 1 / 3],
      [1, 2 / 3],
    ] as const) {
      const x0 = BULKHEAD_X - JAMB_DEPTH * at;
      const x1 = x0 + 0.055;
      const low = floorY + stand;
      const high = HEAD_Y - stand;
      const id = `tunnel-frame-${n}`;
      parts.push(
        part(`${id}-floor`, 'frame', x0, x1, floorY - buried, low, -boreZ, boreZ),
        part(`${id}-roof`, 'frame', x0, x1, high, HEAD_Y + buried, -boreZ, boreZ),
        part(`${id}-port`, 'frame', x0, x1, low, high, -boreZ - buried, -boreZ + stand),
        part(`${id}-starboard`, 'frame', x0, x1, low, high, boreZ - stand, boreZ + buried)
      );
    }
  }

  // --- The leaves. The lowest rides forward of the one above it, so it nests in
  // front in the pocket, and the step between planes at each seam is what makes
  // the stack legible as three before anything has moved. Each carries a raised
  // border, because three bordered panels read as three panels.
  const halfZ = BORE_Z - LEAF_SIDE_GAP;
  const inset = 0.055;
  const rib = 0.026;
  const bz = halfZ - inset;
  for (let i = 0; i < LEAF_COUNT; i += 1) {
    const x0 = leafPlane(i);
    const x1 = x0 + LEAF_T;
    const y0 = leafBottom(i);
    const y1 = y0 + LEAF_H;
    const b0 = y0 + inset;
    const b1 = y1 - inset;
    const face = x1 + LEAF_BORDER_PROUD;
    parts.push(
      part(`leaf-${i}`, 'leaf', x0, x1, y0, y1, -halfZ, halfZ, i),
      part(`leaf-${i}-border-bottom`, 'leaf', x1, face, b0, b0 + rib, -bz, bz, i),
      part(`leaf-${i}-border-top`, 'leaf', x1, face, b1 - rib, b1, -bz, bz, i),
      part(`leaf-${i}-border-port`, 'leaf', x1, face, b0 + rib, b1 - rib, -bz, -bz + rib, i),
      part(`leaf-${i}-border-starboard`, 'leaf', x1, face, b0 + rib, b1 - rib, bz - rib, bz, i)
    );
  }

  // --- The button plate, on the starboard jamb outboard of the rail.
  const plateX1 = FACE_X + BUTTON_PLATE_T;
  const plateY = [BUTTON_Y - 0.1, BUTTON_Y + 0.1] as const;
  const plateZ = [BUTTON_Z - 0.076, BUTTON_Z + 0.076] as const;
  parts.push(
    part('button-plate', 'frame', FACE_X, plateX1, plateY[0], plateY[1], plateZ[0], plateZ[1])
  );

  // --- The same control on the corridor side, on the sleeve's starboard wall.
  //
  // Its outer face lands in the sleeve wall's inner plane, which is legal and
  // deliberate: the two faces are back to back, pointing opposite ways, and only
  // SAME-facing coplanar pairs fight for pixels.
  const aftInnerZ = BORE_Z + SLEEVE_INSET;
  parts.push(
    part(
      'button-plate-aft',
      'frame',
      AFT_BUTTON_X - 0.1,
      AFT_BUTTON_X + 0.1,
      plateY[0],
      plateY[1],
      aftInnerZ - BUTTON_PLATE_T,
      aftInnerZ
    )
  );

  return parts;
}

/**
 * Every extreme (y, z) corner the door owns, for the test that holds the whole
 * assembly inside the pressure hull. Derived from the parts list, including the
 * leaves at the top of their travel - the state no interior pose can see, and
 * therefore exactly the one that shipped 0.6 m outside the hull once already.
 */
export function doorEnvelope(): readonly (readonly [number, number])[] {
  const corners: (readonly [number, number])[] = [];
  for (const p of doorParts()) {
    const lift = p.leaf >= 0 ? leafLift(p.leaf) : 0;
    for (const y of [p.y0 + lift, p.y1 + lift]) {
      for (const z of [p.z0, p.z1]) corners.push([y, z]);
    }
  }
  return corners;
}

export interface DoorHandle extends Animated {
  /** Run the cycle. False if it is already doing something. */
  press(): boolean;
  /**
   * Somebody is standing IN the opening, so the dwell must not run out on them.
   *
   * This is not what opens the door - the button is, and that is the whole
   * point of it. An earlier version had this open the door on approach from
   * 3.4 m, which read as an automatic door and quietly killed both buttons: the
   * hand only takes hold inside 1.6 m, so a player near enough to press one
   * always found a door already running. It also meant the door never shut,
   * because standing anywhere on a 6.2 m deck was standing inside the trigger.
   *
   * So the range here is the collar and nothing more. It cannot open a door. It
   * can only refuse to let one close on somebody walking through it, which is
   * the same defect as walking into a closed slab, pointed the other way.
   */
  hold(inDoorway: boolean): void;
  /** 0 shut, 1 fully lifted. */
  travel(): number;
  /**
   * Whether the far end of the sleeve is closed off.
   *
   * True while nothing is attached aft - the cap is what keeps the interior
   * airtight, and without it the room has a doorway-shaped hole to space. False
   * once a compartment is joined there, and then it MUST come out: this file has
   * said since it was written that "when there is a second compartment it
   * attaches at the cap and the cap comes out", and until this existed it never
   * did. The door opened onto a flat plate, which is the one thing a door must
   * never do.
   */
  seal(closed: boolean): void;
}

function boxOf(p: DoorPart): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(
    Math.abs(p.x1 - p.x0),
    Math.abs(p.y1 - p.y0),
    Math.abs(p.z1 - p.z0)
  );
  geometry.translate((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
  return geometry;
}

function merged(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flattened = parts.map((piece) => (piece.index ? piece.toNonIndexed() : piece));
  let total = 0;
  for (const piece of flattened) {
    total += (piece.getAttribute('position') as THREE.BufferAttribute).count;
  }
  const positions = new Float32Array(total * 3);
  let offset = 0;
  for (const piece of flattened) {
    const attribute = piece.getAttribute('position') as THREE.BufferAttribute;
    positions.set(attribute.array as Float32Array, offset);
    offset += attribute.array.length;
    piece.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Interior surfaces carry the room's emissive floor, or they die in eclipse. */
function lit(colour: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(colour),
    flatShading: true,
    emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
    emissiveIntensity: 1,
  });
}

export function createDoor(): DoorHandle {
  const root = new THREE.Object3D();
  root.name = 'aft-door';

  const materials = {
    frame: lit(PALETTE.HULL_SHADOW),
    sleeve: lit(PALETTE.HULL),
    leaf: lit(PALETTE.HULL),
    trim: lit(PALETTE.ARRAY),
  } as const;

  const parts = doorParts();

  // The cap is its own mesh, not merged with the rest of the frame, because it
  // is the one piece that has to disappear when a compartment is attached aft.
  const sleeveCapPart = parts.find((p) => p.name === 'cap');
  const sleeveCap =
    sleeveCapPart === undefined ? null : new THREE.Mesh(boxOf(sleeveCapPart), materials.frame);
  if (sleeveCap !== null) {
    sleeveCap.name = 'door-sleeve-cap';
    root.add(sleeveCap);
  }

  // Static geometry, one mesh per value.
  for (const key of ['frame', 'sleeve', 'trim', 'leaf'] as const) {
    const solids = parts
      .filter((p) => p.leaf < 0 && p.material === key && p.name !== 'cap')
      .map(boxOf);
    if (solids.length === 0) continue;
    const mesh = new THREE.Mesh(merged(solids), materials[key]);
    mesh.name = `door-${key}`;
    root.add(mesh);
  }

  // One group per leaf, so each can be given its own share of the travel.
  const leaves: THREE.Object3D[] = [];
  for (let i = 0; i < LEAF_COUNT; i += 1) {
    const solids = parts.filter((p) => p.leaf === i).map(boxOf);
    const group = new THREE.Object3D();
    group.name = `door-leaf-${i}`;
    group.add(new THREE.Mesh(merged(solids), materials.leaf));
    root.add(group);
    leaves.push(group);
  }

  // --- The button cap and its state ring, which are not boxes.
  const capGeometry = new THREE.CylinderGeometry(0.036, 0.039, BUTTON_CAP_T, 8);
  capGeometry.rotateZ(Math.PI / 2);
  const cap = new THREE.Mesh(capGeometry, materials.trim);
  cap.position.set(FACE_X + BUTTON_PLATE_T + BUTTON_CAP_T / 2, BUTTON_Y, BUTTON_Z);
  root.add(cap);
  const capRestX = cap.position.x;

  // The state ring, wide of the cap so a hand on the button cannot cover it.
  const ringGeometry = new THREE.RingGeometry(0.05, 0.062, 24);
  ringGeometry.rotateY(Math.PI / 2);
  const ringShut = lit(
    `#${new THREE.Color(PALETTE.HULL_SHADOW).multiplyScalar(0.72).getHexString()}`
  );
  // Takes no diffuse light and carries its whole value in emissive: the lamp
  // diffuser's rule, and the reason the test button's live ring stopped clipping
  // to white the moment it was pressed in sunlight.
  const ringLive = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x000000),
    flatShading: true,
    emissive: new THREE.Color(PALETTE.MINT),
    emissiveIntensity: 1,
  });
  const ring = new THREE.Mesh(ringGeometry, ringShut);
  ring.position.set(FACE_X + BUTTON_PLATE_T + 0.001, BUTTON_Y, BUTTON_Z);
  root.add(ring);

  // The corridor-side cap and ring, turned to face across the tunnel rather
  // than along it. Same door, same press, so it gets the same two pieces - a
  // control that reads differently from the one on the other side would be a
  // second mechanism as far as a player is concerned.
  const aftFaceZ = BORE_Z + SLEEVE_INSET - BUTTON_PLATE_T;
  const aftCapGeometry = new THREE.CylinderGeometry(0.036, 0.039, BUTTON_CAP_T, 8);
  aftCapGeometry.rotateX(Math.PI / 2);
  const aftCap = new THREE.Mesh(aftCapGeometry, materials.trim);
  aftCap.position.set(AFT_BUTTON_X, BUTTON_Y, aftFaceZ - BUTTON_CAP_T / 2);
  root.add(aftCap);
  const aftCapRestZ = aftCap.position.z;

  const aftRingGeometry = new THREE.RingGeometry(0.05, 0.062, 24);
  const aftRing = new THREE.Mesh(aftRingGeometry, ringShut);
  aftRing.position.set(AFT_BUTTON_X, BUTTON_Y, aftFaceZ - 0.001);
  aftRing.rotation.y = Math.PI;
  root.add(aftRing);

  /** 0 shut, 1 lifted. */
  let travel = 0;
  /** Seconds into the cycle, or null when the door is at rest and shut. */
  let elapsed: number | null = null;
  /** Somebody is standing in the opening, so the dwell may not run out. */
  let occupied = false;
  let lastT = 0;
  let started = false;

  const smooth = (t: number): number => t * t * (3 - 2 * t);

  return {
    root,

    press() {
      if (elapsed !== null) return false;
      elapsed = 0;
      return true;
    },

    /**
     * Somebody is standing in the opening. Holds it, never opens it.
     *
     * Deliberately does nothing at all to a door at rest: a shut door with
     * somebody standing in its doorway is not a thing that can happen, because
     * a shut door is a wall and the floor does not run through it.
     */
    hold(inDoorway: boolean) {
      occupied = inDoorway;
    },

    travel() {
      return travel;
    },

    seal(closed: boolean) {
      if (sleeveCap !== null) sleeveCap.visible = closed;
    },

    update(frame: Frame) {
      // The room hands out absolute time; a mechanism needs an interval.
      // Deriving it here keeps update() a pure function of the Frame, which is
      // what the shot harness relies on.
      const dt = started ? Math.max(0, Math.min(0.1, frame.t - lastT)) : 0;
      lastT = frame.t;
      started = true;

      if (elapsed !== null) {
        elapsed += dt;
        const opening = LATCH_S + TRAVEL_S;
        const holding = opening + DWELL_S;
        const closing = holding + LATCH_S + TRAVEL_S;
        // While somebody is standing in the opening the dwell does not run out:
        // the clock is pinned to the moment the leaves finished rising. A door
        // that shut on the person walking through it would be the same defect
        // as the one that let them walk into it, pointed the other way.
        //
        // And if the leaves are already coming down when somebody steps back
        // into the opening, they REVERSE from where they are. Pinning the clock
        // to `opening` in that case is what this used to do on its own, and it
        // teleported the door: half shut on one frame, fully open on the next,
        // which is the one thing DIRECTION's motion law forbids outright.
        // Smoothstep is symmetric about its midpoint, so the opening time that
        // puts the leaves exactly where the closing time has them is its mirror.
        if (occupied && elapsed > opening && elapsed < closing) {
          const shutFor = (elapsed - holding - LATCH_S) / TRAVEL_S;
          elapsed = shutFor <= 0 ? opening : LATCH_S + TRAVEL_S * (1 - shutFor);
        }
        if (elapsed < LATCH_S) {
          travel = 0;
        } else if (elapsed < opening) {
          travel = smooth((elapsed - LATCH_S) / TRAVEL_S);
        } else if (elapsed < holding + LATCH_S) {
          travel = 1;
        } else if (elapsed < closing) {
          travel = 1 - smooth((elapsed - holding - LATCH_S) / TRAVEL_S);
        } else {
          travel = 0;
          elapsed = null;
        }
      }

      // Geared, not equal: every leaf reaches the head together, so the lower a
      // leaf sits the further it has to go and the faster it visibly runs.
      for (let i = 0; i < leaves.length; i += 1) {
        const group = leaves[i];
        if (group !== undefined) group.position.y = leafLift(i) * travel;
      }
      // The cap is in while the latch is working and out once it is moving, so
      // the press has a physical consequence at the button as well.
      const pressed = elapsed !== null && travel < 0.02 ? 0.011 : 0;
      cap.position.x = capRestX - pressed;
      ring.material = travel > 0.02 ? ringLive : ringShut;
      // The corridor-side control depresses into its own wall, which is +z, so
      // it moves the other way. Both report the same door.
      aftCap.position.z = aftCapRestZ + pressed;
      aftRing.material = ring.material;
    },

    dispose() {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of Object.values(materials)) material.dispose();
      ringShut.dispose();
      ringLive.dispose();
    },
  };
}
