/**
 * Two surfaces in the same plane, facing the same way, fighting for pixels.
 *
 * Reported as "for every place where the door meets the hallways it keeps
 * glitching as in it doesn't know which layer is on top". That is exactly what
 * it is: the depth buffer has no way to order two triangles at the same depth,
 * so which one wins is decided per pixel by float noise, and it changes as the
 * camera moves. It shimmers.
 *
 * The project already had a rule about this - door.ts is full of deliberate
 * few-millimetre offsets and says so at length - and a checker for it,
 * `planeClashes` in kit/solids.ts. Neither could see this. Two reasons, and
 * both are the point of this file:
 *
 *   1. `planeClashes` runs on `Solid` records - the x0..z1 box list a room
 *      publishes - and it runs on ONE ROOM AT A TIME. A door built by the limb
 *      deck landing in the same plane as a wall built by the corridor is not
 *      a fact about either room, so no room-scoped check can hold it.
 *   2. The corridor's and the node's end walls are not boxes at all. They are
 *      raw pushQuad triangles in a liner mesh, a different data shape that the
 *      box checker is structurally blind to - so even within one room those
 *      surfaces were never being checked against anything.
 *
 * So this works on the only thing that is guaranteed to be the truth: the
 * triangles actually in the buffers, in world space, with the whole station
 * built. It does not care how they were authored or which room made them.
 *
 * What it found the first time it ran is in the test below.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildStation } from '../src/env/station/index';
import { STATION } from '../src/env/station/plan';

/** Same tolerance the room-scoped box checker uses. */
const COPLANAR_M = 0.0015;

/**
 * Ignore slivers. Two faces overlapping by less than a 3 cm square are a corner
 * touching a corner, not a surface visibly fighting - and chasing those would
 * mean quantising every dimension in the build.
 */
const MIN_AREA_M2 = 1e-3;

interface Facet {
  readonly mesh: string;
  /** Unit normal, world space. */
  readonly n: THREE.Vector3;
  /** Plane offset along the normal. */
  readonly d: number;
  /** The triangle's three corners, world space. */
  readonly p: readonly THREE.Vector3[];
}

/** Every triangle the station would actually draw, in world space. */
function facetsOf(root: THREE.Object3D): Facet[] {
  root.updateMatrixWorld(true);
  const out: Facet[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // A hidden mesh draws nothing and so can fight with nothing. The door's
    // sleeve cap is hidden the moment a compartment is joined aft, and it sits
    // exactly on the seam plane, so counting it would be a permanent false
    // positive for the one part designed to disappear.
    for (let o: THREE.Object3D | null = object; o !== null; o = o.parent) {
      if (!o.visible) return;
    }
    const position = object.geometry.getAttribute('position');
    if (position === undefined) return;
    const index = object.geometry.getIndex();
    const count = index === null ? position.count : index.count;
    const name = object.name === '' ? 'unnamed' : object.name;

    for (let i = 0; i < count; i += 3) {
      const [i0, i1, i2] =
        index === null ? [i, i + 1, i + 2] : [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      a.fromBufferAttribute(position, i0).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, i1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, i2).applyMatrix4(object.matrixWorld);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const length = n.length();
      if (length < 1e-9) continue;
      n.divideScalar(length);
      out.push({ mesh: name, n, d: n.dot(a), p: [a.clone(), b.clone(), c.clone()] });
    }
  });
  return out;
}

/** Two basis vectors spanning a plane, for flattening triangles onto it. */
function basisFor(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const seed = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(n, seed).normalize();
  return [u, new THREE.Vector3().crossVectors(n, u).normalize()];
}

interface Point2 {
  readonly x: number;
  readonly y: number;
}

function shoelace(poly: readonly Point2[]): number {
  let total = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (p === undefined || q === undefined) continue;
    total += p.x * q.y - q.x * p.y;
  }
  return Math.abs(total) / 2;
}

/**
 * Area shared by two convex polygons, by clipping one against the other.
 *
 * Exact rather than a bounding-box guess, because a gate that cries wolf on
 * every pair of triangles whose boxes happen to straddle each other gets turned
 * off, and then it is not a gate.
 */
function sharedArea(subject: readonly Point2[], clip: readonly Point2[]): number {
  let output: Point2[] = [...subject];
  const wind = (poly: readonly Point2[]): readonly Point2[] => {
    let sum = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if (p === undefined || q === undefined) continue;
      sum += p.x * q.y - q.x * p.y;
    }
    return sum < 0 ? [...poly].reverse() : poly;
  };
  const clipper = wind(clip);
  output = [...wind(output)];

  for (let e = 0; e < clipper.length; e += 1) {
    const a = clipper[e];
    const b = clipper[(e + 1) % clipper.length];
    if (a === undefined || b === undefined) continue;
    const inside = (p: Point2): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      if (current === undefined || previous === undefined) continue;
      const dCurrent = inside(current);
      const dPrevious = inside(previous);
      if (dCurrent >= 0) {
        if (dPrevious < 0) {
          const t = dPrevious / (dPrevious - dCurrent);
          output.push({
            x: previous.x + (current.x - previous.x) * t,
            y: previous.y + (current.y - previous.y) * t,
          });
        }
        output.push(current);
      } else if (dPrevious >= 0) {
        const t = dPrevious / (dPrevious - dCurrent);
        output.push({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
        });
      }
    }
    if (output.length === 0) return 0;
  }
  return shoelace(output);
}

describe('the station: nothing fights for pixels with anything else', () => {
  it('has no two surfaces in one plane, facing one way, covering the same ground', () => {
    // What this found the first time it ran, all of it invisible to every other
    // check in the suite:
    //
    //   the door's sleeve walls and floor, which stop exactly ON the seam plane
    //   at x = -4.35, against the corridor's fore end wall, which is built to
    //   exactly the same plane and faces the same way - 0.42 m2 up each side of
    //   the doorway, at eye height;
    //
    //   and the same defect again at the other end of the corridor, where the
    //   node's door-frame trim lands in the plane of the corridor's aft wall.
    //
    // Six pairs, both seams, "every place where the door meets the hallways".
    const station = buildStation(STATION);
    try {
      const facets = facetsOf(station.root);
      expect(facets.length, 'no geometry at all, so this proves nothing').toBeGreaterThan(1000);

      // Bucket by facing. Only surfaces pointing the SAME way fight - two faces
      // back to back in one plane are a sealed joint, which is how the whole
      // station is put together.
      const byNormal = new Map<string, Facet[]>();
      for (const facet of facets) {
        const key = `${facet.n.x.toFixed(3)},${facet.n.y.toFixed(3)},${facet.n.z.toFixed(3)}`;
        const bucket = byNormal.get(key);
        if (bucket === undefined) byNormal.set(key, [facet]);
        else bucket.push(facet);
      }

      /** Total fighting area per pair of meshes, so one seam is one line. */
      const fights = new Map<string, number>();

      for (const bucket of byNormal.values()) {
        // Sorted by plane offset, so only a short run of each has to be
        // compared against any given facet.
        bucket.sort((p, q) => p.d - q.d);
        for (let i = 0; i < bucket.length; i += 1) {
          const one = bucket[i];
          if (one === undefined) continue;
          const [u, v] = basisFor(one.n);
          const flat = (f: Facet): Point2[] =>
            f.p.map((point) => ({ x: point.dot(u), y: point.dot(v) }));
          const here = flat(one);
          for (let j = i + 1; j < bucket.length; j += 1) {
            const other = bucket[j];
            if (other === undefined) continue;
            if (other.d - one.d > COPLANAR_M) break;
            // Within one mesh this is already covered, by `planeClashes` on the
            // room's own boxes. Across meshes nothing was covering it.
            if (other.mesh === one.mesh) continue;
            const area = sharedArea(here, flat(other));
            if (area < MIN_AREA_M2) continue;
            const pair = [one.mesh, other.mesh].sort().join(' vs ');
            fights.set(pair, (fights.get(pair) ?? 0) + area);
          }
        }
      }

      const report = [...fights.entries()]
        .sort((p, q) => q[1] - p[1])
        .map(([pair, area]) => `${pair}: ${area.toFixed(3)} m2 of shared plane`);
      expect(report.join('\n')).toBe('');
    } finally {
      station.dispose();
    }
  });
});
