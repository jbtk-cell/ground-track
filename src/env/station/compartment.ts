/**
 * COMPARTMENT - a room that knows it is part of a station.
 *
 * An `EnvironmentHandle` (env/types.ts) is a place you can stand in on its own.
 * A compartment is that plus the four things the station needs in order to place
 * it, stream it, and check it: where its seams are, what it is made of, what
 * shape its pressure vessel is, and how big it is.
 *
 * The first three exist to be TESTED, and that is most of the point of this file.
 * A single room can be reviewed by looking at it. Eight rooms cannot: the defects
 * that shipped in room one - a hole to space where a doorway was cut, parts
 * standing outside the hull, surfaces fighting for pixels - are each a question
 * about geometry that a person answers by rendering a picture and squinting, and
 * that a machine answers exactly, for every room, in a millisecond. `solids` and
 * `contains` are how a room makes itself answerable.
 *
 * The rule that follows: a room may build any geometry it likes, but everything
 * box-shaped goes through `solids`, and anything a room owns must satisfy its own
 * `contains`. A room that declares nothing passes every check and deserves none
 * of the credit, so `tests/rooms.test.ts` also holds a floor on how much of a
 * room is declared.
 */
import type * as THREE from 'three';
import type { EnvironmentHandle } from '../types';
import type { Solid } from '../kit/solids';
import type { Port } from './ports';

export interface CompartmentHandle extends EnvironmentHandle {
  /**
   * Every box this room is built from, in room-local coordinates.
   *
   * Checked for coplanar same-facing overlaps (which fight for pixels) and for
   * staying inside `contains`. Curved geometry is exempt because no box
   * describes it, which is a real hole in the coverage and the reason the
   * airtight pixel gate still exists.
   */
  readonly solids: readonly Solid[];
  /**
   * Height of each moving group at full travel, so checks can be run against the
   * open state as well as the shut one. Empty when nothing in the room moves.
   */
  readonly lifts?: readonly number[];
  /** Where this room can attach to another. */
  readonly ports: readonly Port[];
  /**
   * Clearance from a point to the pressure vessel, metres, positive inside.
   *
   * Every room's hull is a different shape and none of them is a shape you can
   * check by eye: the first room's is a cylinder, so "is this fitting inside the
   * wall" is a question about a curve at a given z, and the answer was no for a
   * header that stood 0.6 m out through the roof and looked perfect from every
   * pose a person would think to stand in.
   */
  contains(point: THREE.Vector3): number;
  /**
   * Told, once after building, whether each of its ports leads anywhere.
   *
   * A room is built not knowing: whether a seam is a doorway or the end of the
   * station is a fact about the STATION, and it changes when a compartment is
   * added. Rooms that carry their own closure at a port - the limb deck's aft
   * sleeve has a cap, because it had to be airtight long before there was
   * anything behind it - implement this and take it out when the answer is yes.
   */
  sealPort?(portId: string, sealed: boolean): void;
  /**
   * The room's own bounding box, local. Used to decide what is worth building
   * and to place the station's rooms without overlapping them.
   */
  readonly extent: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
}

/**
 * A room that has to own the frame, because it has a window.
 *
 * Space is drawn before the room is, into the rectangle the window covers on
 * screen, and that pass begins by clearing the whole canvas. Two rooms doing
 * that in one frame and the second erases the first. So a windowed room does not
 * draw ITSELF - it is handed the scene to draw, which is the whole station, and
 * paints space behind all of it.
 *
 * CONSTRAINT, and it is a real one: a windowed room must be the station's anchor,
 * so that its placement is the identity. The screen rectangle is computed from
 * where the window's corners land, and those corners are stored in the room's own
 * frame. Placing a windowed room anywhere else would scissor space to a rectangle
 * on the wrong part of the screen. `tests/rooms.test.ts` holds this rather than
 * leaving it as a comment nobody reads, and lifting it means transforming the
 * apertures at build time.
 */
export interface Painter {
  paint(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
}

export function isPainter(handle: object): handle is Painter {
  return typeof (handle as { paint?: unknown }).paint === 'function';
}

/**
 * What a room is, before it is built.
 *
 * Kept separate from the built handle so the station can reason about the whole
 * layout - what connects to what, how big everything is, where the player will
 * end up - without constructing a single triangle. That is what makes streaming
 * possible: you cannot decide whether to build a room using information that
 * only exists once you have built it.
 */
export interface CompartmentDefinition {
  readonly id: string;
  /** ALL CAPS, the station's own name for the place. */
  readonly name: string;
  /** One line, the machine's voice. */
  readonly description: string;
  /**
   * The ports this room will have, known without building it.
   *
   * Duplicated with the built handle's `ports` on purpose, and a test holds the
   * two identical: the station lays out the whole graph from these, so if the
   * built room disagreed the layout would be right about a station that does not
   * exist.
   */
  readonly ports: readonly Port[];
  /** Roughly how much room it takes, for layout. Refined from the built handle. */
  readonly extent: CompartmentHandle['extent'];
  build(): CompartmentHandle;
}
