/**
 * SOLIDS - the declarative box, and why every room owes one.
 *
 * A room may build whatever geometry it likes, but the parts of it that are BOXES
 * have to be declared as data first and turned into meshes second. That is a rule
 * with a history rather than a preference.
 *
 * Three defect classes were found in the first room by eye, in renders, one at a
 * time, over several rounds:
 *
 *   - Two surfaces sharing a plane and facing the same way. The depth buffer
 *     cannot choose between them, so it chooses per pixel and per frame: a comb
 *     of alternating values, or a seam that crawls when the camera moves. Found
 *     three times. The third was caused by the fix for the second.
 *   - Parts floating off the surface they are bolted to, because an inset was
 *     measured to a part's centre and read as its back face.
 *   - Parts standing outside the pressure hull, invisible from every interior
 *     pose and unmissable from outside.
 *
 * Eye caught all three eventually. Eye does not scale: one room's door has
 * several hundred face pairs, and a station has rooms. As data, all of it is
 * checkable in milliseconds by `tests/rooms.test.ts`, over every room at once,
 * for ever.
 *
 * WHAT THIS IS NOT. It is not a scene graph, a physics representation, or a
 * complete description of a room - hulls are curved and no box will describe
 * them. It is the subset of a room that is box-shaped, which is where these
 * particular mistakes live.
 */
import * as THREE from 'three';

/** An axis-aligned box, in room coordinates, metres. */
export interface Solid {
  /** Unique within a room. Appears verbatim in failure output, so name it well. */
  readonly name: string;
  /** Which material bucket this belongs to. Rooms define their own vocabulary. */
  readonly material: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
  /**
   * Index of the moving group this rides, or -1 for structure.
   *
   * Checks run over the moved state as well as the rest state, because a door
   * that is clean shut and fighting itself open is a door that was only ever
   * looked at shut.
   */
  readonly moves?: number;
}

export function solid(
  name: string,
  material: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  moves = -1
): Solid {
  return { name, material, x0, x1, y0, y1, z0, z1, moves };
}

/** Box geometry for one solid, already positioned. */
export function boxOf(part: Solid, lift = 0): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(
    Math.abs(part.x1 - part.x0),
    Math.abs(part.y1 - part.y0),
    Math.abs(part.z1 - part.z0)
  );
  geometry.translate(
    (part.x0 + part.x1) / 2,
    (part.y0 + part.y1) / 2 + lift,
    (part.z0 + part.z1) / 2
  );
  return geometry;
}

/**
 * One geometry from many, positions only, normals recomputed.
 *
 * Deliberately not `BufferGeometryUtils.mergeGeometries`: that preserves every
 * attribute the inputs carry, and these carry uv and normal sets that nothing
 * downstream reads. Flat shading recomputes normals anyway.
 */
export function merged(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
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

/** Below this, two planes are the same plane as far as a depth buffer cares. */
export const COPLANAR_M = 0.0015;

type Axis = 'x' | 'y' | 'z';

interface Face {
  readonly part: string;
  readonly axis: Axis;
  /** +1 for the face whose outward normal points along +axis, -1 for the other. */
  readonly facing: 1 | -1;
  readonly at: number;
  /** Extent on the two axes the face spans, as [lo, hi, lo, hi]. */
  readonly span: readonly [number, number, number, number];
}

const OTHERS: Record<Axis, readonly [Axis, Axis]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
};

function facesOf(part: Solid, lift: number): readonly Face[] {
  const lo = { x: part.x0, y: part.y0 + lift, z: part.z0 };
  const hi = { x: part.x1, y: part.y1 + lift, z: part.z1 };
  const faces: Face[] = [];
  for (const axis of ['x', 'y', 'z'] as const) {
    const [a, b] = OTHERS[axis];
    const span = [lo[a], hi[a], lo[b], hi[b]] as const;
    faces.push({ part: part.name, axis, facing: -1, at: lo[axis], span });
    faces.push({ part: part.name, axis, facing: 1, at: hi[axis], span });
  }
  return faces;
}

function sharedArea(a: Face, b: Face): number {
  const w = Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]);
  const h = Math.min(a.span[3], b.span[3]) - Math.max(a.span[2], b.span[2]);
  return w > 1e-6 && h > 1e-6 ? w * h : 0;
}

/**
 * Every pair of faces that will fight for pixels, as readable lines.
 *
 * Coplanar, facing the SAME way, and overlapping. Faces pointing opposite ways
 * in one plane are fine and are everywhere - a box resting on a box shares a
 * plane, but only one of the two is front-facing from any given eye, so there is
 * nothing to choose between. Requiring real overlap rather than a touching
 * bounding box keeps parts that merely share an edge out of the report.
 *
 * @param lifts height of each moving group, so the open state can be checked too
 */
export function planeClashes(
  parts: readonly Solid[],
  lifts: readonly number[] = []
): readonly string[] {
  const faces = parts.flatMap((part) =>
    facesOf(part, part.moves !== undefined && part.moves >= 0 ? (lifts[part.moves] ?? 0) : 0)
  );
  const clashes: string[] = [];
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      const a = faces[i];
      const b = faces[j];
      if (a === undefined || b === undefined) continue;
      if (a.part === b.part) continue;
      if (a.axis !== b.axis || a.facing !== b.facing) continue;
      if (Math.abs(a.at - b.at) > COPLANAR_M) continue;
      const area = sharedArea(a, b);
      if (area > 1e-5) {
        clashes.push(
          `${a.part} / ${b.part}: ${a.axis}=${a.at.toFixed(4)} ` +
            `facing ${a.facing > 0 ? '+' : '-'}, ${(area * 1e4).toFixed(1)} cm2`
        );
      }
    }
  }
  return clashes;
}

/** Every extreme corner of a set of solids, for containment checks. */
export function corners(
  parts: readonly Solid[],
  lifts: readonly number[] = []
): readonly THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const part of parts) {
    const lift = part.moves !== undefined && part.moves >= 0 ? (lifts[part.moves] ?? 0) : 0;
    for (const x of [part.x0, part.x1]) {
      for (const y of [part.y0 + lift, part.y1 + lift]) {
        for (const z of [part.z0, part.z1]) out.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return out;
}
