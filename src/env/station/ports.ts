/**
 * PORTS - where one compartment attaches to the next, and the promise that makes.
 *
 * A port is a seam: a rectangular opening in a pressure vessel, at a stated place,
 * facing a stated way, of a stated size. Two compartments are connected by naming
 * a port on each. Everything about where a room ends up in the station falls out
 * of that - a room never knows its own world position, and no room contains a
 * coordinate belonging to another room.
 *
 * WHY THIS EXISTS AT ALL. The first room was authored as if it were the only one,
 * which is correct for one room and load-bearing nonsense for eight. Its aft
 * doorway is a rectangle whose height and width live in `shell.ts`; the door built
 * to fit it lives in `door.ts` and reads those numbers; and had a second room been
 * written the same way, the two would have agreed about the size of the hole
 * between them only for as long as nobody edited either. A seam that two files
 * describe independently is a seam with a draught.
 *
 * So the size lives HERE, once, and both sides read it. `agree()` is what a test
 * calls to prove a connection is real, and it exists because "check for congruency
 * between builds" is not a thing anyone can do by looking.
 *
 * COORDINATES. Every room is authored in its own local frame: origin on its own
 * deck, +X along its own long axis, +Y up. The station composes those frames by
 * matching ports. This is the only reason a room can be built, looked at, and
 * approved on its own and then placed in a station without touching a line of it.
 */

/** The standard pressure seam. Every port in the station is this size. */
export const SEAM = {
  /** Clear width and height of the opening, metres. */
  width: 1.18,
  height: 2.06,
  /**
   * How far the mating flange stands aft of the seam plane.
   *
   * Two compartments do not touch: they are joined by this much structure on each
   * side, which is where the door, its pocket and the tunnel live. It also keeps
   * one room's geometry from ever landing in the same plane as another's, which is
   * the multi-room form of the defect that cost this project three rounds of
   * z-fighting inside a single door.
   */
  collar: 1.24,
} as const;

/** Which way a port faces, in its own room's local frame. */
export type Facing = '+x' | '-x' | '+z' | '-z';

export interface Port {
  /** Unique within its room. */
  readonly id: string;
  /**
   * The seam plane's centre in room-local coordinates: the middle of the opening
   * at the point the two collars meet.
   */
  readonly at: readonly [number, number, number];
  /** The direction you are walking when you leave the room through this port. */
  readonly facing: Facing;
  /** Deck height on this side of the seam, room-local. Floors must agree. */
  readonly floorY: number;
}

export function port(
  id: string,
  at: readonly [number, number, number],
  facing: Facing,
  floorY = 0
): Port {
  return { id, at, facing, floorY };
}

/** Unit vector for a facing, in the room's own frame. */
export function facingVector(facing: Facing): readonly [number, number, number] {
  switch (facing) {
    case '+x':
      return [1, 0, 0];
    case '-x':
      return [-1, 0, 0];
    case '+z':
      return [0, 0, 1];
    case '-z':
      return [0, 0, -1];
  }
}

/** Yaw, radians, that rotates +x onto this facing. */
export function facingYaw(facing: Facing): number {
  switch (facing) {
    case '+x':
      return 0;
    case '-z':
      return Math.PI / 2;
    case '-x':
      return Math.PI;
    case '+z':
      return -Math.PI / 2;
  }
}

/** A join between two compartments, named by room id and port id. */
export interface Connection {
  readonly from: readonly [string, string];
  readonly to: readonly [string, string];
}

export function connect(
  fromRoom: string,
  fromPort: string,
  toRoom: string,
  toPort: string
): Connection {
  return { from: [fromRoom, fromPort], to: [toRoom, toPort] };
}

/**
 * Why two ports cannot be joined, or null if they can.
 *
 * The floor check is the one that matters and the one nobody would think to
 * write: two rooms whose decks differ by 40 mm across a seam produce a step in a
 * station that has no steps, and it is invisible in a screenshot of either room.
 * You find it by walking through and feeling the camera hitch, which means you
 * find it late or never.
 */
export function disagreement(a: Port, b: Port): string | null {
  if (a.floorY !== b.floorY) {
    return `deck heights differ across the seam: ${a.id} at ${a.floorY}, ${b.id} at ${b.floorY}`;
  }
  const [, ay] = a.at;
  const [, by] = b.at;
  if (Math.abs(ay - a.floorY - (by - b.floorY)) > 1e-6) {
    return `opening sits at a different height above the deck: ${a.id} vs ${b.id}`;
  }
  return null;
}
