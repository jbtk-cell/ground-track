/**
 * BAKED/RANDOM - every number the baker draws, and why none of them is random.
 *
 * The interior direction (docs/INTERIORS.md) stands on one engineering claim:
 * the bake is deterministic BY CONSTRUCTION. That holds only if every sample
 * direction, every jitter and every texture texel comes from seeded arithmetic
 * - the same LCG idiom as starfield.ts, never Math.random(), never a Canvas.
 * This module is the single source of those numbers so a reviewer can audit
 * the claim in one place.
 */

/** The starfield LCG, as a factory. Same constants, same >>> discipline. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * A fixed cosine-weighted hemisphere about +Z, as a flat xyz array.
 *
 * Fibonacci-spiralled so the set is well spread at any count, cosine-weighted
 * by construction (z = sqrt(1 - r^2) of an equal-area disc mapping) so the
 * ambient-occlusion estimator needs no per-ray weight. The set is generated
 * once and REUSED for every texel; texels decorrelate by rotating it around Z
 * with a hash of their own coordinates, which trades the look of independent
 * noise for bit-stable output and an edge-aware blur cleans up the rest.
 */
export function cosineHemisphere(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    // Equal-area radial strata: disc radius from the strata midpoint.
    const r = Math.sqrt((i + 0.5) / count);
    const theta = i * golden;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sqrt(Math.max(0, 1 - r * r));
  }
  return out;
}

/**
 * A small integer hash for per-texel decorrelation. Deterministic, cheap, and
 * good enough for rotating a sample set - it is not a statistical PRNG and
 * nothing here asks it to be one.
 */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ (seed >>> 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Smooth value noise on a 2D lattice, for the texture generator. Pure math -
 * this is the replacement for the Canvas 2D rasterisation the interior
 * direction forbids (Skia differs across Chromium versions; arithmetic does
 * not).
 */
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** A few octaves of the above, normalised to roughly 0..1. */
export function fbm2(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoise2(x * (1 << o), y * (1 << o), seed + o * 101) * amp;
    total += amp;
    amp *= 0.5;
  }
  return total > 0 ? sum / total : 0;
}
