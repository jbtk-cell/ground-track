/**
 * BAKED/ATLAS - the sink that knows where its light will live.
 *
 * A rebuilt room draws with unlit materials: pixel = vertex albedo x
 * modulation map x baked irradiance. The irradiance is a texture, so every
 * quad that wants a lighting GRADIENT across itself needs its own patch of
 * that texture and a `uv1` telling the shader where the patch is. This module
 * is kit/mesh.ts's Sink grown those two things, plus the allocator.
 *
 * Two tiers, chosen per call and on purpose:
 *
 *   pushPatchQuad  - allocates an atlas patch. For every surface big enough
 *                    to show a gradient: shell walls, deck, crown, worktops.
 *                    The measured failure of the old direction was >= 40% of a
 *                    frame inside one 8-value bucket; patches are the cure.
 *   pushLitBox     - no patch. Small fittings (rails, brackets, trims) get
 *                    their light evaluated per VERTEX by the baker and
 *                    multiplied straight into the colour attribute. A 40 mm
 *                    bracket does not need a gradient; the contact shadow it
 *                    casts lives on the patch behind it.
 *
 * The allocator is a shelf packer: patches land in rows, in call order, with a
 * two-texel gutter against bilinear bleed. Call order is the room's build
 * order, which is deterministic, so the atlas layout is too. Overflow throws -
 * a room that outgrows its atlas should fail its build loudly, not render one
 * quad full-bright because a uv1 silently wrapped.
 *
 * WINDING IS STILL DERIVED (see kit/mesh.ts): the quad is flipped if it faces
 * away from `towards`, and the uv pairs travel with their vertices.
 */
import * as THREE from 'three';
import type { Solid } from '../solids';

export interface Patch {
  /** Texel rect in the atlas. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** World-space frame: origin at uv (0,0), edges spanning the quad. */
  readonly origin: readonly [number, number, number];
  readonly edgeU: readonly [number, number, number];
  readonly edgeV: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  /** Linear albedo the bounce gather treats this patch as reflecting. */
  readonly albedo: readonly [number, number, number];
}

export interface BakedSink {
  readonly position: number[];
  readonly colour: number[];
  /** World-planar coordinates for the tiling modulation map. */
  readonly uv0: number[];
  /** Atlas coordinates for the lightmap. */
  readonly uv1: number[];
  readonly patches: Patch[];
  readonly size: number;
}

interface Shelf {
  cursorX: number;
  cursorY: number;
  rowH: number;
}

const GUTTER = 2;
const shelves = new WeakMap<BakedSink, Shelf>();

export function bakedSink(size = 1024): BakedSink {
  const sink: BakedSink = { position: [], colour: [], uv0: [], uv1: [], patches: [], size };
  shelves.set(sink, { cursorX: GUTTER, cursorY: GUTTER, rowH: 0 });
  return sink;
}

function allocate(sink: BakedSink, w: number, h: number): { x: number; y: number } {
  const shelf = shelves.get(sink);
  if (shelf === undefined) throw new Error('bakedSink: unknown sink');
  if (w + 2 * GUTTER > sink.size || h + 2 * GUTTER > sink.size) {
    throw new Error(`atlas: patch ${w}x${h} cannot fit a ${sink.size} atlas`);
  }
  if (shelf.cursorX + w + GUTTER > sink.size) {
    shelf.cursorX = GUTTER;
    shelf.cursorY += shelf.rowH + GUTTER;
    shelf.rowH = 0;
  }
  if (shelf.cursorY + h + GUTTER > sink.size) {
    throw new Error(
      `atlas: full at ${sink.patches.length} patches - grow the atlas or lower a density`
    );
  }
  const at = { x: shelf.cursorX, y: shelf.cursorY };
  shelf.cursorX += w + GUTTER;
  shelf.rowH = Math.max(shelf.rowH, h);
  return at;
}

const EDGE_A = new THREE.Vector3();
const EDGE_B = new THREE.Vector3();
const NORMAL = new THREE.Vector3();
const CENTROID = new THREE.Vector3();

/** World-planar uv0 for the tiling map: project off the dominant normal axis. */
function planarUv(p: THREE.Vector3, normal: THREE.Vector3, scale: number): [number, number] {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return [p.z / scale, p.y / scale];
  if (ay >= ax && ay >= az) return [p.x / scale, p.z / scale];
  return [p.x / scale, p.y / scale];
}

/**
 * A quad with its own lightmap patch. `a -> b` spans the patch's U axis and
 * `a -> d` its V axis; the quad is assumed planar and (near-)rectangular,
 * which everything built off the solids vocabulary is.
 */
export function pushPatchQuad(
  sink: BakedSink,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  towards: THREE.Vector3,
  colour: THREE.Color,
  texelsPerMetre: number,
  uvScale = 0.5
): void {
  EDGE_A.subVectors(b, a);
  EDGE_B.subVectors(d, a);
  NORMAL.crossVectors(EDGE_A, EDGE_B).normalize();
  CENTROID.copy(a).add(b).add(c).add(d).multiplyScalar(0.25);
  const flip = NORMAL.dot(CENTROID.subVectors(towards, CENTROID)) < 0;
  if (flip) NORMAL.multiplyScalar(-1);

  const w = Math.max(2, Math.ceil(EDGE_A.length() * texelsPerMetre) + 1);
  const h = Math.max(2, Math.ceil(EDGE_B.length() * texelsPerMetre) + 1);
  const at = allocate(sink, w, h);

  sink.patches.push({
    x: at.x,
    y: at.y,
    w,
    h,
    origin: [a.x, a.y, a.z],
    edgeU: [b.x - a.x, b.y - a.y, b.z - a.z],
    edgeV: [d.x - a.x, d.y - a.y, d.z - a.z],
    normal: [NORMAL.x, NORMAL.y, NORMAL.z],
    albedo: [colour.r, colour.g, colour.b],
  });

  // Half-texel inset keeps bilinear lookups inside the patch at its rim.
  const u0 = (at.x + 0.5) / sink.size;
  const u1 = (at.x + w - 0.5) / sink.size;
  const v0 = (at.y + 0.5) / sink.size;
  const v1 = (at.y + h - 0.5) / sink.size;

  type Corner = { p: THREE.Vector3; u: number; v: number };
  const ca: Corner = { p: a, u: u0, v: v0 };
  const cb: Corner = { p: b, u: u1, v: v0 };
  const cc: Corner = { p: c, u: u1, v: v1 };
  const cd: Corner = { p: d, u: u0, v: v1 };
  const order: readonly Corner[] = flip ? [ca, cd, cc, ca, cc, cb] : [ca, cb, cc, ca, cc, cd];

  for (const corner of order) {
    sink.position.push(corner.p.x, corner.p.y, corner.p.z);
    sink.colour.push(colour.r, colour.g, colour.b);
    const [tu, tv] = planarUv(corner.p, NORMAL, uvScale);
    sink.uv0.push(tu, tv);
    sink.uv1.push(corner.u, corner.v);
  }
}

/**
 * A quad with no patch: reveals, jamb strips, collar segments - anything too
 * thin to show a gradient. Same derived winding as pushPatchQuad; uv1 parks on
 * the reserved white texel and the baker lights its vertices directly.
 *
 * `flatUv` pins every vertex's map coordinate to one point, for geometry the
 * tiling liner must NOT paint: the world-planar projection drew panel seams
 * and latch tabs across the inside of a porthole bore, which read as plumbing
 * floating in the hole. A pinned mid-panel sample keeps the map's tone and
 * drops its features.
 */
export function pushLitQuad(
  sink: BakedSink,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  towards: THREE.Vector3,
  colour: THREE.Color,
  uvScale = 0.5,
  flatUv?: readonly [number, number]
): void {
  EDGE_A.subVectors(b, a);
  EDGE_B.subVectors(d, a);
  NORMAL.crossVectors(EDGE_A, EDGE_B).normalize();
  CENTROID.copy(a).add(b).add(c).add(d).multiplyScalar(0.25);
  const flip = NORMAL.dot(CENTROID.subVectors(towards, CENTROID)) < 0;
  if (flip) NORMAL.multiplyScalar(-1);
  const order: readonly THREE.Vector3[] = flip ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
  for (const p of order) {
    sink.position.push(p.x, p.y, p.z);
    sink.colour.push(colour.r, colour.g, colour.b);
    const [tu, tv] = flatUv ?? planarUv(p, NORMAL, uvScale);
    sink.uv0.push(tu, tv);
    sink.uv1.push(0.5 / sink.size, 0.5 / sink.size);
  }
}

/**
 * A box with no patch: six quads whose light the baker evaluates per vertex.
 * uv1 parks every vertex on a reserved white texel so the shared material's
 * lightmap term is 1 and the baked light rides the colour attribute instead.
 */
export function pushLitBox(sink: BakedSink, part: Solid, colour: THREE.Color, uvScale = 0.5): void {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const x0 = Math.min(part.x0, part.x1);
  const x1 = Math.max(part.x0, part.x1);
  const y0 = Math.min(part.y0, part.y1);
  const y1 = Math.max(part.y0, part.y1);
  const z0 = Math.min(part.z0, part.z1);
  const z1 = Math.max(part.z0, part.z1);
  const centre = v((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const faces: readonly (readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3])[] =
    [
      [v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1)],
      [v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0)],
      [v(x0, y0, z0), v(x0, y0, z1), v(x1, y0, z1), v(x1, y0, z0)],
      [v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)],
      [v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0)],
      [v(x0, y0, z1), v(x0, y1, z1), v(x1, y1, z1), v(x1, y0, z1)],
    ];
  const outward = new THREE.Vector3();
  for (const [a, b, c, d] of faces) {
    const mid = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
    outward.copy(mid).sub(centre).multiplyScalar(2).add(mid);

    EDGE_A.subVectors(b, a);
    EDGE_B.subVectors(d, a);
    NORMAL.crossVectors(EDGE_A, EDGE_B).normalize();
    CENTROID.copy(mid);
    const flip = NORMAL.dot(CENTROID.subVectors(outward, CENTROID)) < 0;
    if (flip) NORMAL.multiplyScalar(-1);

    const order: readonly THREE.Vector3[] = flip ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
    for (const p of order) {
      sink.position.push(p.x, p.y, p.z);
      sink.colour.push(colour.r, colour.g, colour.b);
      const [tu, tv] = planarUv(p, NORMAL, uvScale);
      sink.uv0.push(tu, tv);
      // The reserved white texel: dead centre of texel (0,0), which bake()
      // writes as full irradiance and the gutter keeps unbled.
      sink.uv1.push(0.5 / sink.size, 0.5 / sink.size);
    }
  }
}

/** How many vertices carry a real patch (uv1 not parked on the white texel). */
export function patchedVertexCount(sink: BakedSink): number {
  const parked = 0.5 / sink.size;
  let count = 0;
  for (let i = 0; i < sink.uv1.length; i += 2) {
    if (sink.uv1[i] !== parked || sink.uv1[i + 1] !== parked) count += 1;
  }
  return count;
}

export function toBakedGeometry(sink: BakedSink): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sink.position), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sink.colour), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(sink.uv0), 2));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(sink.uv1), 2));
  geometry.computeVertexNormals();
  return geometry;
}
