/**
 * LAYOUT - turning a graph of "this port joins that port" into world positions.
 *
 * Rooms are authored in their own local frames and know nothing about each other.
 * The station is a graph: an anchor room at the origin, and connections naming a
 * port on each side. This module walks that graph and produces one rigid
 * transform per room.
 *
 * The whole thing is deliberately restricted to yaw and translation - no pitch,
 * no roll, no scale. Two reasons, and the second is the real one:
 *
 *   1. Gravity points one way in this station, so a room rotated about anything
 *      but the vertical axis is a room whose floor is not the floor.
 *   2. A rigid yaw-only transform keeps axis-aligned boxes axis-aligned, which is
 *      what lets every geometry check in `tests/rooms.test.ts` stay exact. Allow
 *      an arbitrary rotation and the coplanar-face test - the one that finally
 *      caught the z-fighting that three rounds of looking at renders did not -
 *      degrades into approximate plane comparisons with a tolerance to tune. A
 *      test with a tunable tolerance is a test that will one day be tuned until
 *      it passes.
 *
 * The curved room (THE DRUM) is the exception that proves this: its floor rises,
 * but it rises inside its own local frame, and it presents flat seams at both
 * ports like everything else. The station never learns that it is curved.
 */
import * as THREE from 'three';
import type { CompartmentDefinition } from './compartment';
import { type Connection, type Port, disagreement, facingYaw } from './ports';

export type { Connection } from './ports';

/** Where a room ended up, and everything needed to move points into world space. */
export interface Placement {
  readonly id: string;
  /** Yaw about +Y, radians. */
  readonly yaw: number;
  readonly position: THREE.Vector3;
  readonly matrix: THREE.Matrix4;
  /** Inverse, for asking which room a world point is in. */
  readonly inverse: THREE.Matrix4;
}

function matrixOf(yaw: number, position: THREE.Vector3): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(position);
}

/**
 * A port's seam centre and outward direction in world space, given a placement.
 */
function seamInWorld(
  port: Port,
  placement: { yaw: number; position: THREE.Vector3 }
): { at: THREE.Vector3; yaw: number } {
  const at = new THREE.Vector3(port.at[0], port.at[1], port.at[2])
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw)
    .add(placement.position);
  return { at, yaw: placement.yaw + facingYaw(port.facing) };
}

export class LayoutError extends Error {}

/**
 * Place every room, or explain exactly why the station does not close.
 *
 * Throws rather than returning a partial layout: a station with one room in the
 * wrong place is not a station that is nearly right, it is a station with a room
 * inside another room, and the failure needs to be loud at build time rather than
 * discovered by walking into it.
 */
export function layOut(
  rooms: readonly CompartmentDefinition[],
  connections: readonly Connection[],
  anchorId: string
): ReadonlyMap<string, Placement> {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  if (!byId.has(anchorId)) throw new LayoutError(`anchor room "${anchorId}" is not in the list`);

  const portOf = (roomId: string, portId: string): Port => {
    const room = byId.get(roomId);
    if (room === undefined) throw new LayoutError(`no such room: ${roomId}`);
    const found = room.ports.find((p) => p.id === portId);
    if (found === undefined) {
      const had = room.ports.map((p) => p.id).join(', ') || 'none';
      throw new LayoutError(`room ${roomId} has no port "${portId}" (has: ${had})`);
    }
    return found;
  };

  // Adjacency, both ways: a connection is a join, not a direction of travel.
  const edges = new Map<string, { room: string; here: Port; there: Port }[]>();
  const add = (from: string, to: string, here: Port, there: Port): void => {
    const list = edges.get(from) ?? [];
    list.push({ room: to, here, there });
    edges.set(from, list);
  };
  for (const link of connections) {
    const [fromRoom, fromPort] = link.from;
    const [toRoom, toPort] = link.to;
    const a = portOf(fromRoom, fromPort);
    const b = portOf(toRoom, toPort);
    const why = disagreement(a, b);
    if (why !== null) {
      throw new LayoutError(`${fromRoom}.${fromPort} cannot join ${toRoom}.${toPort}: ${why}`);
    }
    add(fromRoom, toRoom, a, b);
    add(toRoom, fromRoom, b, a);
  }

  const placed = new Map<string, Placement>();
  const anchor = { yaw: 0, position: new THREE.Vector3() };
  placed.set(anchorId, {
    id: anchorId,
    ...anchor,
    matrix: matrixOf(anchor.yaw, anchor.position),
    inverse: matrixOf(anchor.yaw, anchor.position).invert(),
  });

  // Breadth-first from the anchor, so every room is placed relative to something
  // already placed and the order is deterministic.
  const queue = [anchorId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) continue;
    const current = placed.get(currentId);
    if (current === undefined) continue;

    for (const edge of edges.get(currentId) ?? []) {
      if (placed.has(edge.room)) continue;

      // Walking out of `here` and in through `there` means the two seams are the
      // same plane and the two facings are opposite. Yaw follows directly; the
      // position is whatever puts the far room's seam on top of this one's.
      const seam = seamInWorld(edge.here, current);
      const yaw = seam.yaw + Math.PI - facingYaw(edge.there.facing);
      const localSeam = new THREE.Vector3(
        edge.there.at[0],
        edge.there.at[1],
        edge.there.at[2]
      ).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const position = seam.at.clone().sub(localSeam);

      const matrix = matrixOf(yaw, position);
      placed.set(edge.room, {
        id: edge.room,
        yaw,
        position,
        matrix,
        inverse: matrix.clone().invert(),
      });
      queue.push(edge.room);
    }
  }

  const orphans = rooms.filter((room) => !placed.has(room.id)).map((room) => room.id);
  if (orphans.length > 0) {
    throw new LayoutError(
      `not reachable from ${anchorId} - a room nobody can walk to is a room nobody will see: ${orphans.join(', ')}`
    );
  }

  return placed;
}

/** World-space axis-aligned box a placed room occupies. */
export function worldExtent(room: CompartmentDefinition, placement: Placement): THREE.Box3 {
  const box = new THREE.Box3();
  const { minX, maxX, minY, maxY, minZ, maxZ } = room.extent;
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      for (const z of [minZ, maxZ]) {
        box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(placement.matrix));
      }
    }
  }
  return box;
}

/**
 * Pairs of rooms whose volumes intersect, as readable lines.
 *
 * Two compartments in the same cubic metre is the multi-room version of every
 * geometry bug this project has had, and it is the one you cannot see: the far
 * room is not resident when you are standing in the near one, so it never appears
 * in a screenshot until the day it does. Seams touch by construction, so the
 * boxes are shrunk by the collar depth before testing - rooms that merely meet
 * are not overlapping.
 */
export function overlaps(
  rooms: readonly CompartmentDefinition[],
  placed: ReadonlyMap<string, Placement>,
  margin = 0.05
): readonly string[] {
  const boxes = rooms
    .map((room) => {
      const placement = placed.get(room.id);
      return placement === undefined
        ? null
        : { id: room.id, box: worldExtent(room, placement).expandByScalar(-margin) };
    })
    .filter((entry): entry is { id: string; box: THREE.Box3 } => entry !== null);

  const found: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a === undefined || b === undefined) continue;
      if (!a.box.intersectsBox(b.box)) continue;
      const shared = a.box.clone().intersect(b.box).getSize(new THREE.Vector3());
      found.push(
        `${a.id} and ${b.id} occupy the same space: ` +
          `${shared.x.toFixed(2)} x ${shared.y.toFixed(2)} x ${shared.z.toFixed(2)} m`
      );
    }
  }
  return found;
}
