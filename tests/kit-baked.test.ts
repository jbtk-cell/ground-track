/**
 * The baked-light kit, held to its own determinism claim.
 *
 * docs/INTERIORS.md sells the bake on one sentence: deterministic BY
 * CONSTRUCTION. That is a testable sentence. Two bakes of the same room must
 * hash identically; the atlas must never overlap two patches or leak a vertex
 * without an allocation; and the solver must behave like light - nearer is
 * brighter, corners are darker, a box between a lamp and a wall throws a
 * shadow. None of this needs a GPU, which is the point of the architecture.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  bakedSink,
  patchedVertexCount,
  pushLitBox,
  pushPatchQuad,
} from '../src/env/kit/baked/atlas';
import { bake, type AreaLamp, type BakeOptions } from '../src/env/kit/baked/bake';
import { cosineHemisphere, lcg } from '../src/env/kit/baked/random';
import { occluded, traceSet } from '../src/env/kit/baked/trace';
import { solid } from '../src/env/kit/solids';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('random', () => {
  it('lcg streams are reproducible and in range', () => {
    const a = lcg(1234);
    const b = lcg(1234);
    for (let i = 0; i < 1000; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('the hemisphere set is unit-length, upper, and cosine-weighted', () => {
    const set = cosineHemisphere(64);
    let meanZ = 0;
    for (let i = 0; i < 64; i += 1) {
      const x = set[i * 3] ?? 0;
      const y = set[i * 3 + 1] ?? 0;
      const z = set[i * 3 + 2] ?? 0;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(z).toBeGreaterThanOrEqual(0);
      meanZ += z / 64;
    }
    // Cosine weighting puts the mean z at 2/3.
    expect(meanZ).toBeGreaterThan(0.6);
    expect(meanZ).toBeLessThan(0.73);
  });
});

describe('atlas', () => {
  it('allocates disjoint patches with uv1 inside them', () => {
    const sink = bakedSink(256);
    for (let i = 0; i < 12; i += 1) {
      pushPatchQuad(
        sink,
        v(0, 0, 0),
        v(1.5, 0, 0),
        v(1.5, 1, 0),
        v(0, 1, 0),
        v(0.75, 0.5, 1),
        new THREE.Color(0.5, 0.5, 0.5),
        32
      );
    }
    expect(sink.patches.length).toBe(12);
    for (const a of sink.patches) {
      expect(a.x).toBeGreaterThanOrEqual(2);
      expect(a.y).toBeGreaterThanOrEqual(2);
      expect(a.x + a.w).toBeLessThanOrEqual(256);
      expect(a.y + a.h).toBeLessThanOrEqual(256);
      for (const b of sink.patches) {
        if (a === b) continue;
        const apart =
          a.x + a.w + 1 < b.x || b.x + b.w + 1 < a.x || a.y + a.h + 1 < b.y || b.y + b.h + 1 < a.y;
        expect(apart).toBe(true);
      }
    }
    for (let i = 0; i < sink.uv1.length; i += 2) {
      const u = sink.uv1[i] ?? -1;
      const w = sink.uv1[i + 1] ?? -1;
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(1);
    }
    expect(patchedVertexCount(sink)).toBe(12 * 6);
  });

  it('throws on overflow instead of wrapping silently', () => {
    const sink = bakedSink(64);
    expect(() => {
      for (let i = 0; i < 100; i += 1) {
        pushPatchQuad(
          sink,
          v(0, 0, 0),
          v(1, 0, 0),
          v(1, 1, 0),
          v(0, 1, 0),
          v(0.5, 0.5, 1),
          new THREE.Color(1, 1, 1),
          20
        );
      }
    }).toThrow(/atlas/);
  });
});

describe('trace', () => {
  it('sees a box in the way and not one beside the way', () => {
    const set = traceSet([solid('block', 'test', -0.5, 0.5, -0.5, 0.5, -0.5, 0.5)], {
      x0: -5,
      x1: 5,
      y0: -5,
      y1: 5,
      z0: -5,
      z1: 5,
    });
    expect(occluded(set, -2, 0, 0, 1, 0, 0, 0.01, 4)).toBe(true);
    expect(occluded(set, -2, 2, 0, 1, 0, 0, 0.01, 4)).toBe(false);
    expect(occluded(set, -2, 0, 0, -1, 0, 0, 0.01, 4)).toBe(false);
  });
});

/** A 4 x 3 x 4 test room: one lamp overhead, one crate on the floor. */
function testScene() {
  const sink = bakedSink(512);
  const grey = new THREE.Color(0.5, 0.5, 0.5);
  const inward = v(0, 1.5, 0);
  // Floor, with the lamp above its centre.
  pushPatchQuad(sink, v(-2, 0, -2), v(2, 0, -2), v(2, 0, 2), v(-2, 0, 2), inward, grey, 24);
  // One wall, to give the corner AO something to darken against.
  pushPatchQuad(sink, v(-2, 0, -2), v(2, 0, -2), v(2, 3, -2), v(-2, 3, -2), inward, grey, 24);
  // A vertex-lit crate near the wall.
  const crate = solid('crate', 'test', 0.8, 1.4, 0, 0.6, -1.9, -1.3);
  pushLitBox(sink, crate, grey);

  const set = traceSet([crate], { x0: -2, x1: 2, y0: 0, y1: 3, z0: -2, z1: 2 });
  const lamp: AreaLamp = {
    name: 'over',
    origin: [-0.5, 2.9, -0.15],
    edgeU: [1, 0, 0],
    edgeV: [0, 0, 0.3],
    colour: [1, 0.95, 0.85],
    intensity: 9,
    samplesU: 6,
    samplesV: 2,
  };
  const opts: BakeOptions = {
    seed: 7,
    ambient: [0.05, 0.05, 0.06],
    aoSamples: 16,
    aoRange: 1.1,
    aoStrength: 0.85,
    directAoMix: 0.7,
    bounce: 0.5,
    exposure: 1,
    knee: 0.8,
    ceiling: 2,
  };
  return { sink, set, lamp, opts };
}

describe('bake', () => {
  it('is bit-identical across two runs', () => {
    const a = testScene();
    const b = testScene();
    const bakeA = bake(a.sink, a.set, [a.lamp], a.opts);
    const bakeB = bake(b.sink, b.set, [b.lamp], b.opts);
    expect(bakeA.hash).toBe(bakeB.hash);
    expect(a.sink.colour).toEqual(b.sink.colour);
  });

  it('behaves like light: nearer brighter, corners darker, shadows real', () => {
    const scene = testScene();
    const result = bake(scene.sink, scene.set, [scene.lamp], scene.opts);
    const data = result.texture.image.data as unknown as Uint16Array;
    const size = scene.sink.size;
    const floor = scene.sink.patches[0];
    const wall = scene.sink.patches[1];
    expect(floor).toBeDefined();
    expect(wall).toBeDefined();
    if (floor === undefined || wall === undefined) return;

    const luma = (patch: typeof floor, fu: number, fv: number): number => {
      const i = patch.x + Math.round(fu * (patch.w - 1));
      const j = patch.y + Math.round(fv * (patch.h - 1));
      const at = (j * size + i) * 4;
      return (
        THREE.DataUtils.fromHalfFloat(data[at] ?? 0) * 0.2126 +
        THREE.DataUtils.fromHalfFloat(data[at + 1] ?? 0) * 0.7152 +
        THREE.DataUtils.fromHalfFloat(data[at + 2] ?? 0) * 0.0722
      );
    };

    // Floor spans x -2..2 (u) and z -2..2 (v); the lamp hangs over its centre.
    const under = luma(floor, 0.5, 0.5);
    const corner = luma(floor, 0.02, 0.02);
    expect(under).toBeGreaterThan(corner * 2);

    // The crate sits at x 0.8..1.4, z -1.9..-1.3: the floor DIRECTLY beneath
    // it cannot see the lamp, so it must be darker than open floor at the
    // same distance from the lamp on the other side.
    const shadowed = luma(floor, (1.1 + 2) / 4, (-1.6 + 2) / 4);
    const open = luma(floor, (-1.1 + 2) / 4, (-1.6 + 2) / 4);
    expect(open).toBeGreaterThan(shadowed * 1.35);

    // Wall base near the corner darker than wall centre (AO).
    const wallMid = luma(wall, 0.5, 0.55);
    const wallFoot = luma(wall, 0.5, 0.02);
    expect(wallMid).toBeGreaterThan(wallFoot);

    // The white texel the vertex-lit tier parks on is exactly 1.
    expect(THREE.DataUtils.fromHalfFloat(data[0] ?? 0)).toBe(1);
  });

  it('feeds the probe grid something lamp-shaped', () => {
    const scene = testScene();
    const result = bake(scene.sink, scene.set, [scene.lamp], scene.opts);
    const near = { r: 0, g: 0, b: 0, dx: 0, dy: 0, dz: 0 };
    const far = { r: 0, g: 0, b: 0, dx: 0, dy: 0, dz: 0 };
    result.probe(0, 2.2, 0, near);
    result.probe(-1.8, 0.4, 1.8, far);
    expect(near.r).toBeGreaterThan(far.r);
    // Under the lamp the mean incoming direction points up.
    expect(near.dy).toBeGreaterThan(0);
    for (const value of [near.r, near.g, near.b, far.r, far.g, far.b]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
