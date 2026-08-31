/**
 * BAKED/TRACE - the baker's ray caster, over the geometry a room already owes.
 *
 * The occluders are the room's declared Solid boxes (kit/solids.ts) - the same
 * data the coplanar and containment checks run on - plus the room's own vessel
 * as an axis-aligned box the rays live inside. That is deliberately NOT the
 * rendered mesh: the solids are the subset of a room that is box-shaped, which
 * is where shadows worth casting come from (a console, a perch, a lamp
 * housing), and a baker that traced the full triangle soup would spend most of
 * its time shadowing reveals with their own lips. The cost of the
 * approximation is that curved or slotted fittings shadow as their bounding
 * declaration; nothing in a rebuilt room is curved enough to notice.
 *
 * Everything here is scalar math on flat arrays. No THREE types cross this
 * boundary: the baker runs the same on a build machine as in the browser.
 */
import type { Solid } from '../solids';

/** The occluder set, flattened once so the hot loop reads a Float64Array. */
export interface TraceSet {
  /** minX,minY,minZ,maxX,maxY,maxZ per box. */
  readonly boxes: Float64Array;
  readonly count: number;
  /** The vessel the rays live inside: the room's own inner AABB. */
  readonly vessel: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
}

export function traceSet(
  solids: readonly Solid[],
  vessel: TraceSet['vessel'],
  exclude: readonly string[] = []
): TraceSet {
  const kept = solids.filter((s) => !exclude.includes(s.name));
  const boxes = new Float64Array(kept.length * 6);
  for (const [i, s] of kept.entries()) {
    boxes[i * 6] = Math.min(s.x0, s.x1);
    boxes[i * 6 + 1] = Math.min(s.y0, s.y1);
    boxes[i * 6 + 2] = Math.min(s.z0, s.z1);
    boxes[i * 6 + 3] = Math.max(s.x0, s.x1);
    boxes[i * 6 + 4] = Math.max(s.y0, s.y1);
    boxes[i * 6 + 5] = Math.max(s.z0, s.z1);
  }
  return { boxes, count: kept.length, vessel };
}

/**
 * Does the segment from (ox,oy,oz) along (dx,dy,dz), for tMax, hit any box?
 *
 * Slab test, branch-light, early-out. The origin is expected to sit ON a
 * surface, so callers pass a small tMin to step off it rather than nudging
 * the origin and accumulating float drift.
 */
export function occluded(
  set: TraceSet,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  tMin: number,
  tMax: number
): boolean {
  const ix = 1 / dx;
  const iy = 1 / dy;
  const iz = 1 / dz;
  const boxes = set.boxes;
  for (let b = 0; b < set.count; b += 1) {
    const o = b * 6;
    const bx0 = boxes[o] ?? 0;
    const by0 = boxes[o + 1] ?? 0;
    const bz0 = boxes[o + 2] ?? 0;
    const bx1 = boxes[o + 3] ?? 0;
    const by1 = boxes[o + 4] ?? 0;
    const bz1 = boxes[o + 5] ?? 0;

    let t0 = (bx0 - ox) * ix;
    let t1 = (bx1 - ox) * ix;
    let lo = Math.min(t0, t1);
    let hi = Math.max(t0, t1);

    t0 = (by0 - oy) * iy;
    t1 = (by1 - oy) * iy;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    if (hi < lo) continue;

    t0 = (bz0 - oz) * iz;
    t1 = (bz1 - oz) * iz;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));

    if (hi >= lo && hi >= tMin && lo <= tMax) return true;
  }
  return false;
}

/**
 * Distance from a point along a direction to the vessel's own inside - the
 * "how far can this ray fly before the room itself stops it" term the
 * ambient-occlusion estimator needs. The point is inside the box, so exactly
 * one exit distance exists and it is positive.
 */
export function vesselExit(
  set: TraceSet,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number
): number {
  const v = set.vessel;
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (v.x1 - ox) / dx);
  else if (dx < -1e-9) t = Math.min(t, (v.x0 - ox) / dx);
  if (dy > 1e-9) t = Math.min(t, (v.y1 - oy) / dy);
  else if (dy < -1e-9) t = Math.min(t, (v.y0 - oy) / dy);
  if (dz > 1e-9) t = Math.min(t, (v.z1 - oz) / dz);
  else if (dz < -1e-9) t = Math.min(t, (v.z0 - oz) / dz);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

/**
 * Nearest hit distance along a ray against the boxes, capped at tMax; tMax
 * when nothing is hit. Used by the occlusion estimator, which wants distance
 * rather than a boolean.
 */
export function nearestHit(
  set: TraceSet,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  tMin: number,
  tMax: number
): number {
  const ix = 1 / dx;
  const iy = 1 / dy;
  const iz = 1 / dz;
  const boxes = set.boxes;
  let best = tMax;
  for (let b = 0; b < set.count; b += 1) {
    const o = b * 6;
    const bx0 = boxes[o] ?? 0;
    const by0 = boxes[o + 1] ?? 0;
    const bz0 = boxes[o + 2] ?? 0;
    const bx1 = boxes[o + 3] ?? 0;
    const by1 = boxes[o + 4] ?? 0;
    const bz1 = boxes[o + 5] ?? 0;

    let t0 = (bx0 - ox) * ix;
    let t1 = (bx1 - ox) * ix;
    let lo = Math.min(t0, t1);
    let hi = Math.max(t0, t1);

    t0 = (by0 - oy) * iy;
    t1 = (by1 - oy) * iy;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    if (hi < lo) continue;

    t0 = (bz0 - oz) * iz;
    t1 = (bz1 - oz) * iz;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));

    if (hi >= lo && hi >= tMin) {
      const entry = lo >= tMin ? lo : hi;
      if (entry < best) best = entry;
    }
  }
  return best;
}
