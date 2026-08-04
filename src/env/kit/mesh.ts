/**
 * MESH - the flat-shaded facet primitives every room is built out of.
 *
 * Lifted verbatim out of the first room's shell, where they were written, once
 * there was a second room to use them. Nothing here knows anything about a
 * cylinder, a deck or a window: it is a vertex sink, three ways to push a facet
 * into it with the winding worked out rather than trusted, and the per-facet
 * value jitter that keeps a flat-shaded surface from reading as one ribbon.
 *
 * WINDING IS DERIVED, NOT DECLARED. `pushFacet` and `pushQuad` take a point the
 * facet should face and flip the triangle if it came out backwards. That costs a
 * dot product per facet and removes an entire class of defect: a back-facing
 * facet is culled, and a culled facet in a pressure hull is a hole with outer
 * space behind it. Across eight rooms and some thousands of facets, nobody is
 * going to get every call site's vertex order right by hand.
 */
import * as THREE from 'three';
import { fbm } from '../../render/noise';

/** Flat arrays a room fills as it builds, turned into geometry once at the end. */
export interface Sink {
  readonly position: number[];
  readonly colour: number[];
}

export function sink(): Sink {
  return { position: [], colour: [] };
}

/** `noUncheckedIndexedAccess` makes every array read optional; this is for the
 *  reads whose index is derived from the array's own length. */
export function nth(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

const EDGE_A = new THREE.Vector3();
const EDGE_B = new THREE.Vector3();
const NORMAL = new THREE.Vector3();
const CENTROID = new THREE.Vector3();
const FACET = new THREE.Color();

/**
 * Per-facet value, sampled at the centroid the way earth.ts samples the planet.
 *
 * The light does the loud work - one sun vector re-values every facet in the
 * room each frame - but a distant directional hands every facet at the same
 * angle the identical term, so a bare wall steps around an arc and reads as one
 * long ribbon along it. This is what separates two facets that share a normal,
 * and it is held to a few per cent: any more and it stops being a facet edge and
 * starts being a texture, which DIRECTION.md does not allow at any strength.
 */
export function facetColour(
  base: THREE.Color,
  centroid: THREE.Vector3,
  seed: number,
  amount: number
): THREE.Color {
  const n = fbm(centroid.x * 1.6, centroid.y * 1.6, centroid.z * 1.6, seed, 3);
  return FACET.copy(base).multiplyScalar(1 + (n - 0.5) * 2 * amount);
}

export function pushTriangle(
  target: Sink,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  colour: THREE.Color
): void {
  target.position.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let v = 0; v < 3; v += 1) target.colour.push(colour.r, colour.g, colour.b);
}

/** One triangle, wound so its normal points at `towards`. */
export function pushFacet(
  target: Sink,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  towards: THREE.Vector3,
  colour: THREE.Color
): void {
  EDGE_A.subVectors(b, a);
  EDGE_B.subVectors(c, a);
  NORMAL.crossVectors(EDGE_A, EDGE_B);
  CENTROID.copy(a)
    .add(b)
    .add(c)
    .multiplyScalar(1 / 3);
  CENTROID.subVectors(towards, CENTROID);

  if (NORMAL.dot(CENTROID) >= 0) pushTriangle(target, a, b, c, colour);
  else pushTriangle(target, a, c, b, colour);
}

/**
 * A quad as two triangles carrying one colour - one facet - wound so its normal
 * points at `towards`. Winding is derived rather than trusted to a hundred call
 * sites because a single back-facing facet is a hole with space behind it.
 */
export function pushQuad(
  target: Sink,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  towards: THREE.Vector3,
  colour: THREE.Color
): void {
  EDGE_A.subVectors(b, a);
  EDGE_B.subVectors(d, a);
  NORMAL.crossVectors(EDGE_A, EDGE_B);
  CENTROID.copy(a).add(b).add(c).add(d).multiplyScalar(0.25);
  CENTROID.subVectors(towards, CENTROID);

  if (NORMAL.dot(CENTROID) >= 0) {
    pushTriangle(target, a, b, c, colour);
    pushTriangle(target, a, c, d, colour);
  } else {
    pushTriangle(target, a, d, c, colour);
    pushTriangle(target, a, c, b, colour);
  }
}

/** A box, six facets, each shaded from its own centroid. */
export function pushBox(
  target: Sink,
  min: THREE.Vector3,
  max: THREE.Vector3,
  base: THREE.Color,
  seed: number,
  jitter = 0.05
): void {
  const towards = new THREE.Vector3();
  const centre = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const faces: readonly (readonly THREE.Vector3[])[] = [
    [
      v(min.x, min.y, min.z),
      v(min.x, max.y, min.z),
      v(min.x, max.y, max.z),
      v(min.x, min.y, max.z),
    ],
    [
      v(max.x, min.y, min.z),
      v(max.x, min.y, max.z),
      v(max.x, max.y, max.z),
      v(max.x, max.y, min.z),
    ],
    [
      v(min.x, min.y, min.z),
      v(min.x, min.y, max.z),
      v(max.x, min.y, max.z),
      v(max.x, min.y, min.z),
    ],
    [
      v(min.x, max.y, min.z),
      v(max.x, max.y, min.z),
      v(max.x, max.y, max.z),
      v(min.x, max.y, max.z),
    ],
    [
      v(min.x, min.y, min.z),
      v(max.x, min.y, min.z),
      v(max.x, max.y, min.z),
      v(min.x, max.y, min.z),
    ],
    [
      v(min.x, min.y, max.z),
      v(min.x, max.y, max.z),
      v(max.x, max.y, max.z),
      v(max.x, min.y, max.z),
    ],
  ];
  for (const face of faces) {
    const [a, b, c, d] = face as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const mid = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
    // Face outward: away from the box centre, so a box is solid from outside.
    towards.copy(mid).sub(centre).multiplyScalar(2).add(mid);
    pushQuad(target, a, b, c, d, towards, facetColour(base, mid, seed, jitter));
  }
}

export function toGeometry(target: Sink): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(target.position), 3)
  );
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(target.colour), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The interior material, and the one number in it that is not a preference.
 *
 * `emissiveIntensity` is 1.0 on `NIGHT_SIDE`, NOT the 0.62 that earth.ts and
 * satellite.ts carry. Outdoors the ambient, hemisphere and fill terms add on top
 * of the emissive everywhere; indoors an unlit facet has only its emissive, and
 * 0.62 lands at luma 21.3 - under the palette gate's floor of 25.45, which is to
 * say darker than the darkest value in the game. Every interior surface in every
 * room goes through here so that nobody has to remember it twice.
 */
export function interiorMaterial(nightSide: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    // NOT flatShading, and this is a correctness fix rather than a style change.
    //
    // Every geometry built through this kit is NON-INDEXED and gets its normals
    // from `computeVertexNormals()`, which gives each triangle its own face
    // normal. The three vertices of a facet therefore already carry identical
    // normals and the surface renders flat whether or not the flag is set - the
    // flag is redundant here, and it is not harmless.
    //
    // `flatShading` makes the shader ignore the normal attribute and derive one
    // per pixel from the screen-space derivatives of the view position. Stand
    // close to a large flat wall and look along it, and those derivatives go
    // degenerate: the cross product collapses toward zero, `normalize` of it is
    // NaN, and a NaN fragment clamps to 0,0,0. That is PURE BLACK, in a game
    // whose direction says the darkest value is VOID_SLATE and there is no black
    // anywhere. It measured 30 per cent of the frame from a spot the player can
    // stand in, and no pinned preset had ever stood off a corridor's centreline.
    //
    // A curved hull never quite hits the degenerate case, which is why one room
    // with no flat walls hid this for the whole life of the project.
    emissive: new THREE.Color(nightSide),
    emissiveIntensity: 1,
  });
}
