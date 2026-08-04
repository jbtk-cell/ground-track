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
const CLEAR_HALF_Z = AFT_DOORWAY.maxZ - 0.045;
const CLEAR_TOP_Y = AFT_DOORWAY.maxY - 0.06;
/** The threshold plate stands this proud of the deck; the door lands on it. */
const SILL_Y = 0.016;
const OPENING_H = CLEAR_TOP_Y - SILL_Y;

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

const LAP_MIN_Y = SILL_Y - COAMING_LAP;
const LAP_HALF_Z = CLEAR_HALF_Z + COAMING_LAP;
const FACE_X = BULKHEAD_X + COAMING_DEPTH;
const FASCIA_TOP_Y = CLEAR_TOP_Y + FASCIA_H;

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
const FRAME_BACK_X = BULKHEAD_X - 0.022;
const SLEEVE_FRONT_X = BULKHEAD_X - 0.01;
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
const PARK_Y = CLEAR_TOP_Y - PARK_LIP;

/** The pocket the leaves stack in, aft of the bulkhead and over the opening. */
const POCKET_TOP_Y = PARK_Y + LEAF_H + 0.05;
const POCKET_ROOF_Y = POCKET_TOP_Y + 0.07;
const POCKET_BACK_X = LEAF_FRONT_X - (LEAF_COUNT - 1) * LEAF_PITCH - 0.04;

/** Depth of the sleeve aft of the bulkhead, metres, and the cap that closes it. */
const JAMB_DEPTH = 1.15;
const CAP_X = BULKHEAD_X - JAMB_DEPTH;
const CAP_T = 0.09;

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
/** How long it stands open before closing itself. */
const DWELL_S = 6.0;
/** The lock releasing before anything moves, and re-seating after. */
const LATCH_S = 0.28;

/** Where the door's button sits, on the starboard jamb outboard of the rail. */
const BUTTON_Y = 1.28;
const BUTTON_Z = CLEAR_HALF_Z + 0.157;
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
 * The face of the head panel over the opening, for anything mounted on it.
 *
 * The module's name plate used to sit at a height typed in beside the old round
 * hatch, and the moment the doorway grew past it the name of the module hung in
 * the hole. A door publishing its own head is how the placard stays over the
 * door rather than in it, whatever the opening becomes next.
 */
export const DOOR_FASCIA = {
  x: BULKHEAD_X + FASCIA_DEPTH,
  minY: CLEAR_TOP_Y,
  maxY: FASCIA_TOP_Y,
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
  width: 2 * (CLEAR_HALF_Z - RAIL_LIP),
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
    part('jamb-port', 'frame', FRAME_BACK_X, FACE_X, LAP_MIN_Y, CLEAR_TOP_Y, -LAP_HALF_Z, -CLEAR_HALF_Z),
    part('jamb-starboard', 'frame', FRAME_BACK_X, FACE_X, LAP_MIN_Y, CLEAR_TOP_Y, CLEAR_HALF_Z, LAP_HALF_Z),
    part('threshold', 'frame', FRAME_BACK_X, FACE_X, LAP_MIN_Y, SILL_Y, -CLEAR_HALF_Z, CLEAR_HALF_Z),
    // The head. The pocket is behind the bulkhead where nothing can see it, so
    // this panel is the only thing saying a mechanism lives up there.
    part('fascia', 'frame', FRAME_BACK_X, DOOR_FASCIA.x, CLEAR_TOP_Y, FASCIA_TOP_Y, -LAP_HALF_Z, LAP_HALF_Z)
  );

  // --- The guide rails: threshold to just under the head in one unbroken run,
  // overhanging the opening so they capture the leaf edges. They are the part
  // that ties the floor, the frame and the head together, and without them the
  // head reads as a slab hung above a hole.
  for (const side of [-1, 1]) {
    const inner = side * (CLEAR_HALF_Z - RAIL_LIP);
    const outer = side * (CLEAR_HALF_Z + RAIL_W);
    parts.push(
      part(
        side < 0 ? 'rail-port' : 'rail-starboard',
        'trim',
        BULKHEAD_X + 0.01,
        BULKHEAD_X + RAIL_DEPTH,
        SILL_Y,
        FASCIA_TOP_Y - 0.04,
        Math.min(inner, outer),
        Math.max(inner, outer)
      )
    );
  }

  // --- The sleeve: a rectangular sock aft of the bulkhead, opening out into the
  // pocket over the doorway. Inset from the frame on every axis they share.
  //
  // Split across two values, and not for decoration: nothing in here is lit - the
  // room's lamps are in the room and this is a hole in the wall behind them - so
  // every surface sits on the same emissive floor and a one-value tunnel renders
  // as a flat grey rectangle hung in the doorway. Walls one value, floor and
  // roof another, and the tunnel starts having a top and a bottom.
  const boreZ = CLEAR_HALF_Z + SLEEVE_INSET;
  const outerZ = LAP_HALF_Z - SLEEVE_INSET;
  const floorY = SILL_Y - SLEEVE_INSET;
  const capZ = boreZ + 0.007;
  parts.push(
    // One wall each side, running the full depth AND the full height - past the
    // tunnel's ceiling and up the pocket. Splitting it into a wall and a pocket
    // cheek was the obvious way to write it and put their faces in the same
    // plane as the jamb's top and the fascia's underside; one taller box has no
    // seam to fight over.
    part('sleeve-port', 'sleeve', CAP_X, SLEEVE_FRONT_X, SILL_Y, POCKET_ROOF_Y, -outerZ, -boreZ),
    part('sleeve-starboard', 'sleeve', CAP_X, SLEEVE_FRONT_X, SILL_Y, POCKET_ROOF_Y, boreZ, outerZ),
    part('sleeve-floor', 'frame', CAP_X, SLEEVE_FRONT_X, LAP_MIN_Y + SLEEVE_INSET, floorY, -outerZ, outerZ),
    // Everything that caps the bore is only as wide as the bore, buried in the
    // walls at both ends. Anything reaching the walls' own outer face would be
    // flush with it.
    // Both run PAST the walls' ends rather than up to them: buried in the cap at
    // the far end, stopped short of the bulkhead at the near one, where solid
    // bulkhead is what seals in front of them.
    part('tunnel-roof', 'frame', CAP_X - 0.02, POCKET_BACK_X - 0.02, CLEAR_TOP_Y, CLEAR_TOP_Y + 0.08, -capZ, capZ),
    part('pocket-roof', 'sleeve', POCKET_BACK_X, SLEEVE_FRONT_X - 0.008, POCKET_TOP_Y, POCKET_TOP_Y + 0.05, -capZ, capZ),
    part('pocket-back', 'sleeve', POCKET_BACK_X - 0.02, POCKET_BACK_X, CLEAR_TOP_Y - 0.01, POCKET_TOP_Y + 0.05, -capZ, capZ),
    // The cap. Temporary in the fiction, load-bearing in the rule: without it the
    // room has a hole and the exterior pass shows space through the wall.
    part('cap', 'frame', CAP_X - CAP_T, CAP_X, LAP_MIN_Y + SLEEVE_INSET, POCKET_ROOF_Y, -outerZ, outerZ)
  );

  // The mating flange on the cap: a square rib standing into the tunnel, which is
  // what the next compartment bolts to, and the only thing giving the far end of
  // an otherwise blank 1.15 m tunnel a scale.
  {
    const out = CLEAR_HALF_Z - 0.06;
    const inn = out - 0.05;
    const top = CLEAR_TOP_Y - 0.09;
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
      const high = CLEAR_TOP_Y - stand;
      parts.push(
        part(`tunnel-frame-${n}-floor`, 'frame', x0, x1, floorY - buried, low, -boreZ, boreZ),
        part(`tunnel-frame-${n}-roof`, 'frame', x0, x1, high, CLEAR_TOP_Y + buried, -boreZ, boreZ),
        part(`tunnel-frame-${n}-port`, 'frame', x0, x1, low, high, -boreZ - buried, -boreZ + stand),
        part(`tunnel-frame-${n}-starboard`, 'frame', x0, x1, low, high, boreZ - stand, boreZ + buried)
      );
    }
  }

  // --- The leaves. The lowest rides forward of the one above it, so it nests in
  // front in the pocket, and the step between planes at each seam is what makes
  // the stack legible as three before anything has moved. Each carries a raised
  // border, because three bordered panels read as three panels.
  const halfZ = CLEAR_HALF_Z - LEAF_SIDE_GAP;
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
  parts.push(
    part(
      'button-plate',
      'frame',
      FACE_X,
      FACE_X + BUTTON_PLATE_T,
      BUTTON_Y - 0.1,
      BUTTON_Y + 0.1,
      BUTTON_Z - 0.076,
      BUTTON_Z + 0.076
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
  /** 0 shut, 1 fully lifted. */
  travel(): number;
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

  // Static geometry, one mesh per value.
  for (const key of ['frame', 'sleeve', 'trim', 'leaf'] as const) {
    const solids = parts.filter((p) => p.leaf < 0 && p.material === key).map(boxOf);
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

  /** 0 shut, 1 lifted. */
  let travel = 0;
  /** Seconds into the cycle, or null when the door is at rest and shut. */
  let elapsed: number | null = null;
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

    travel() {
      return travel;
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
      cap.position.x = capRestX - (elapsed !== null && travel < 0.02 ? 0.011 : 0);
      ring.material = travel > 0.02 ? ringLive : ringShut;
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
