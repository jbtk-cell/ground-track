/**
 * The three-band wall, and the one dimension every room is built from.
 *
 * An outside review measured the station and found that its three defining
 * surfaces - ceiling, wall, floor - came in at 44/43/45 out of 255 in the
 * corridor, 44/44/76 on the limb deck, 47/44/60 in the node. Ceiling and wall
 * across the entire station spanned four values. A single 8-value luminance
 * bucket covered 60.5% of the average frame and 83.6% of the corridor's. That
 * is why the rooms felt like one room: they WERE one value.
 *
 * A room cannot be fixed by picking nicer colours for it, because the problem
 * is not the hue, it is that nothing divides the wall. So every vertical wall in
 * the station is divided the same way, at the same heights, and the three parts
 * get different values, different fittings and different depths off the plane.
 *
 * WHERE 2.05 COMES FROM, and why it is not a taste. An International Standard
 * Payload Rack - the unit every ISS laboratory wall is actually made of - is
 * 2.00 m tall, 1.05 m wide and 0.86 m deep. The work band is one rack plus a
 * 0.05 m curb. Every rack, locker, panel bank and window frame in this station
 * is therefore a division of a real dimension rather than an invented one, and
 * BAY_M is the module for every repeating element anywhere in the build.
 *
 * The two reveals are the only continuous element in the station. They run the
 * full length of every wall in every room at the same two heights, and they are
 * what makes eight differently shaped compartments read as one building.
 */
import { PALETTE } from '../../render/palette';

/** Top of the kick band, metres above the local deck. */
export const KICK_TOP_M = 0.95;

/**
 * Top of the work band: one 2.00 m ISPR plus a 0.05 m curb.
 *
 * This is a HORIZON. It is at the same height in every room, so how much crown
 * sits above it is how a player reads a ceiling height at a glance - 0.30 m of
 * it in a crawlway, 7.55 m of it in a tall bay.
 */
export const WORK_TOP_M = 2.05;

/** Thickness of the dark reveal cut at each band boundary. */
export const REVEAL_T_M = 0.03;

/** ISPR width. The module for every repeating element in the station. */
export const BAY_M = 1.05;

/** ISPR height, and the reason WORK_TOP_M is 2.05 and not 2.00. */
export const RACK_H_M = 2.0;

/** ISPR depth. A rack recess is this deep; anything shallower is a panel. */
export const RACK_D_M = 0.86;

/** The rust datum: a hairline at a fixed height on pressure-boundary walls only. */
export const DATUM_Y_M = 1.1;
export const DATUM_T_M = 0.012;

export type BandName = 'kick' | 'work' | 'crown';

export interface Band {
  readonly name: BandName;
  /** Bottom and top of the band, metres above the local deck. */
  readonly y0: number;
  readonly y1: number;
  /** Base colour before per-facet jitter and before any light touches it. */
  readonly colour: string;
  /**
   * How far the band's fittings stand off the wall plane. Positive is proud,
   * negative is recessed. The work band is the only one that goes inward, which
   * is what stops a room reading as a box with things stuck to it.
   */
  readonly relief: number;
}

/**
 * The bands of a wall running from a deck to a ceiling.
 *
 * A ceiling below WORK_TOP_M truncates the work band and drops the crown
 * entirely rather than producing an inverted one, so a crawlway is legal.
 */
export function bands(floorY: number, ceilingY: number): readonly Band[] {
  const out: Band[] = [];
  const kickTop = Math.min(floorY + KICK_TOP_M, ceilingY);
  const workTop = Math.min(floorY + WORK_TOP_M, ceilingY);

  if (kickTop > floorY) {
    out.push({
      name: 'kick',
      y0: floorY,
      y1: kickTop,
      colour: PALETTE.HULL_SHADOW,
      relief: 0.06,
    });
  }
  if (workTop > kickTop) {
    // The room's identity lives here, at eye level, which is where a standing
    // player actually looks. It is also the lightest surface in the room.
    out.push({ name: 'work', y0: kickTop, y1: workTop, colour: PALETTE.HULL, relief: -0.08 });
  }
  if (ceilingY > workTop) {
    // Services overhead, and the darkest value in the room. A player reads
    // height off how much of this there is.
    out.push({ name: 'crown', y0: workTop, y1: ceilingY, colour: CROWN_COLOUR, relief: 0.14 });
  }
  return out;
}

/**
 * How far OUTBOARD of the nominal wall plane the deepest band face sits.
 *
 * A recessed band is a groove cut into the wall, and a groove has to be closed
 * off wherever the wall ends or it is not a groove, it is a slot through the
 * pressure hull. The corridor's end walls were built to the nominal plane -
 * which is the obvious thing to build them to, and which the work band's 0.08 m
 * recess quietly runs straight past.
 *
 * Measured: 886 pixels of exact VOID_SLATE, open space seen through the wall,
 * in a 0.08 m by 1.10 m slot up each side of the doorway at eye height, running
 * the full 11 m of the room. Reported as "I can see through holes on either
 * side of the door which should of course be walls".
 *
 * It survived the airtight gate because every pose in that gate stands on the
 * centre line, where a slot in the side wall is exactly edge-on and covers no
 * pixels at all. Step off the centre line and it opens up. There is now a pose
 * in that gate which does.
 *
 * Any room that cuts its walls into bands has to close them out to this, not to
 * its own half-width.
 */
export function deepestRelief(floorY: number, ceilingY: number): number {
  return Math.max(0, ...bands(floorY, ceilingY).map((band) => -band.relief));
}

/**
 * Crown value. Darker than HULL_SHADOW and lighter than VOID_SLATE, which is
 * the floor of the whole game - the crown is the darkest thing in a room and
 * still never the darkest thing on screen.
 */
export const CROWN_COLOUR = '#202C38';

/** The reveal itself: the darkest legal value in the game, used as a hairline. */
export const REVEAL_COLOUR = PALETTE.VOID_SLATE;

/**
 * The heights at which a wall is cut, for a room of a given ceiling.
 *
 * Returned rather than assumed so a room that is too short for both reveals
 * gets only the one it has room for.
 */
export function reveals(floorY: number, ceilingY: number): readonly number[] {
  return [floorY + KICK_TOP_M, floorY + WORK_TOP_M].filter(
    (y) => y > floorY + REVEAL_T_M && y < ceilingY - REVEAL_T_M
  );
}

/** Which band a height falls in, or null above the ceiling. */
export function bandAt(floorY: number, ceilingY: number, y: number): Band | null {
  return bands(floorY, ceilingY).find((b) => y >= b.y0 && y <= b.y1) ?? null;
}

/**
 * The rust datum, as a fact rather than a decoration.
 *
 * CAUTION_RUST appears in exactly one place in the whole station: a 12 mm
 * hairline at 1.10 m on a wall with vacuum on the other side, and nowhere else.
 * That is the entire wayfinding system. Standing anywhere, a player can tell
 * which walls are the outside of the station, and in a junction the exit
 * without a stripe is the one that leads deeper in.
 *
 * It does a second job for free: at a fixed height it is a ruler. On a level
 * deck it is dead straight, and where the deck steps it steps with it.
 */
export const DATUM_COLOUR = PALETTE.CAUTION_RUST;
