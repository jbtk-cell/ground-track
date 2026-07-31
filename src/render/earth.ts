import * as THREE from 'three';
import { PALETTE } from './palette';
import { fbm, ridged } from './noise';

export interface EarthOptions {
  readonly radius: number;
  /**
   * Icosahedron subdivision. three.js splits each edge into detail+1 segments,
   * so faces = 20 * (detail+1)^2. 28 gives 16820 facets: fine enough to draw a
   * coastline, coarse enough that every facet still reads as a facet.
   */
  readonly detail: number;
  readonly seed: number;
}

export const DEFAULT_EARTH: EarthOptions = { radius: 1, detail: 28, seed: 1337 };

const SEA_LEVEL = 0.505;
/** Relief as a fraction of radius. Small, so the silhouette stays clean. */
const RELIEF = 0.009;

interface Sample {
  readonly elevation: number;
  readonly land: boolean;
}

/** Continent field at a point on the unit sphere. */
function sampleSurface(x: number, y: number, z: number, seed: number): Sample {
  const continents = fbm(x * 2.15, y * 2.15, z * 2.15, seed, 6);
  const coast = fbm(x * 5.4, y * 5.4, z * 5.4, seed + 77, 4);
  const grain = fbm(x * 13.0, y * 13.0, z * 13.0, seed + 401, 3);

  // Pushing the continent term away from its midpoint hardens coastlines, so
  // land reads as land rather than as a gradient into the sea.
  const shaped = 0.5 + (continents - 0.5) * 1.45;
  const elevation = shaped * 0.78 + coast * 0.17 + grain * 0.05;
  return { elevation, land: elevation > SEA_LEVEL };
}

function colourFor(
  elevation: number,
  land: boolean,
  latitude: number,
  ridge: number,
  target: THREE.Color
): void {
  const polar = Math.abs(latitude);

  if (!land) {
    // Deeper water further from the shelf.
    // Deep water is the default; the lighter shelf colour only appears close in
    // to a coast, which is what gives the continents their edge.
    const shelf = THREE.MathUtils.clamp((elevation - (SEA_LEVEL - 0.055)) / 0.055, 0, 1);
    target.set(PALETTE.OCEAN_DEEP).lerp(new THREE.Color(PALETTE.OCEAN), shelf * 0.9);
    if (polar > 0.86) target.lerp(new THREE.Color(PALETTE.CLOUD), (polar - 0.86) / 0.14);
    return;
  }

  const above = THREE.MathUtils.clamp((elevation - SEA_LEVEL) / 0.14, 0, 1);

  target.set(PALETTE.FOREST).lerp(new THREE.Color(PALETTE.SAGE), above);
  // Ridged noise dries the high ground into arid sand.
  if (ridge > 0.55) {
    target.lerp(new THREE.Color(PALETTE.ARID), THREE.MathUtils.clamp((ridge - 0.55) / 0.35, 0, 1));
  }
  // Arid belts near the tropics, ice toward the poles.
  if (polar > 0.2 && polar < 0.42) {
    target.lerp(new THREE.Color(PALETTE.ARID), (0.42 - Math.abs(polar - 0.31) * 2) * 0.55);
  }
  if (polar > 0.78) {
    target.lerp(new THREE.Color(PALETTE.CLOUD), THREE.MathUtils.clamp((polar - 0.78) / 0.22, 0, 1));
  }
}

export interface EarthBuild {
  readonly mesh: THREE.Mesh;
  /** Points on land, in local space, for settlement lights. */
  readonly landPoints: Float32Array;
}

/**
 * A flat-shaded low-poly Earth. Geometry is non-indexed, so each facet owns its
 * three vertices and takes a single colour; displacement is a pure function of
 * position, so shared corners move together and no cracks open.
 */
export function buildEarth(options: EarthOptions = DEFAULT_EARTH): EarthBuild {
  const geometry = new THREE.IcosahedronGeometry(options.radius, options.detail);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = position.count;

  const colours = new Float32Array(count * 3);
  const colour = new THREE.Color();
  const candidateLand: number[] = [];

  // Per facet: one sample at the centroid, one colour across all three corners.
  for (let f = 0; f < count; f += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k += 1) {
      cx += position.getX(f + k);
      cy += position.getY(f + k);
      cz += position.getZ(f + k);
    }
    cx /= 3;
    cy /= 3;
    cz /= 3;

    const len = Math.hypot(cx, cy, cz) || 1;
    const nx = cx / len;
    const ny = cy / len;
    const nz = cz / len;

    const { elevation, land } = sampleSurface(nx, ny, nz, options.seed);
    const ridge = land ? ridged(nx * 3.4, ny * 3.4, nz * 3.4, options.seed + 313) : 0;

    colourFor(elevation, land, ny, ridge, colour);

    for (let k = 0; k < 3; k += 1) {
      colours[(f + k) * 3] = colour.r;
      colours[(f + k) * 3 + 1] = colour.g;
      colours[(f + k) * 3 + 2] = colour.b;
    }

    if (land && Math.abs(ny) < 0.82) candidateLand.push(nx, ny, nz);
  }

  // Displacement by position, so co-located corners agree.
  for (let v = 0; v < count; v += 1) {
    const x = position.getX(v);
    const y = position.getY(v);
    const z = position.getZ(v);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;

    const { elevation, land } = sampleSurface(nx, ny, nz, options.seed);
    const lift = land ? (elevation - SEA_LEVEL) / (1 - SEA_LEVEL) : 0;
    const r = options.radius * (1 + lift * RELIEF);
    position.setXYZ(v, nx * r, ny * r, nz * r);
  }

  position.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    // An emissive floor, not an ambient one. Ambient light multiplies albedo,
    // so dark ocean under a dark ambient lands below VOID_SLATE; emissive adds
    // a constant instead and holds the palette's darkest value as a true floor.
    emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
    emissiveIntensity: 0.62,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'earth';

  return { mesh, landPoints: new Float32Array(candidateLand) };
}
