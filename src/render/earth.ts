import * as THREE from 'three';
import { PALETTE } from './palette';
import { fbm, ridged } from './noise';

export interface EarthOptions {
  readonly radius: number;
  /**
   * Icosahedron subdivision. three.js splits each edge into detail+1 segments,
   * so faces = 20 * (detail+1)^2. 42 gives 36980 facets.
   *
   * Raised from 28 (16820). The planet is the one thing in the bay the eye
   * lingers on, and through a window it is seen much closer to full frame than
   * it ever is on the orbital map - at 28 a coastline is drawn in triangles you
   * can count. This is still comfortably a FACETED Earth, which is the point:
   * every facet has to stay big enough to read as one, or the low-poly language
   * quietly becomes a smooth sphere with noise on it. Twice the facets is about
   * 1.4x finer in each direction, which is the largest step that keeps them
   * legible at the bay's framing.
   */
  readonly detail: number;
  readonly seed: number;
}

export const DEFAULT_EARTH: EarthOptions = { radius: 1, detail: 42, seed: 1337 };

/**
 * Specular colour of the sea. Warm, because it is reflecting the sun, and dark
 * because a specular term ADDS: this is the amount of extra brightness a facet
 * gains at perfect mirror alignment, on top of a lit ocean that is already
 * halfway up the range.
 */
const GLINT = '#7A6E58';

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

/**
 * The surface colour under a geodetic point, without building any geometry.
 *
 * An interior lights its earthshine with the colour of the ground actually
 * below the station, and that colour has to come from this terrain field or
 * the fill light and the planet seen through the window disagree about which
 * continent you are over. Pure and allocation-free when given a target.
 *
 * Longitude follows the frame in units.ts - sim +x is scene +x and sim +y is
 * scene -z - so the same longitude names the same ground here and on the mesh.
 */
export function albedoAt(
  latitude: number,
  longitude: number,
  target: THREE.Color = new THREE.Color(),
  seed: number = DEFAULT_EARTH.seed
): THREE.Color {
  const cosLat = Math.cos(latitude);
  const x = cosLat * Math.cos(longitude);
  const y = Math.sin(latitude);
  const z = -cosLat * Math.sin(longitude);

  const { elevation, land } = sampleSurface(x, y, z, seed);
  const ridge = land ? ridged(x * 3.4, y * 3.4, z * 3.4, seed + 313) : 0;
  // colourFor's third argument is sin(latitude), which is what buildEarth
  // passes it as well - the vertical component of the unit normal, not degrees.
  colourFor(elevation, land, y, ridge, target);
  return target;
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
  const isWater = new Uint8Array(count / 3);

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
    // Which facets are water. Only these are allowed to catch the sun.
    isWater[f / 3] = land ? 0 : 1;
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

  // --- Sort water facets to the front, so the mesh can be drawn in two groups.
  //
  // The glint has to be water only - a specular highlight sliding across a
  // continent is a plastic planet - and a material is per draw call, not per
  // facet. Reordering the facets so all the ocean is contiguous buys a second
  // draw group on the SAME geometry and the same mesh: one extra draw call, no
  // second object to keep in step, and land stays exactly the Lambert surface
  // it was.
  const facets = count / 3;
  const sorted = new Float32Array(count * 3);
  const sortedColours = new Float32Array(count * 3);
  let write = 0;
  let waterVerts = 0;
  for (const wantWater of [1, 0]) {
    for (let f = 0; f < facets; f += 1) {
      if (isWater[f] !== wantWater) continue;
      for (let k = 0; k < 3; k += 1) {
        const from = (f * 3 + k) * 3;
        sorted[write] = position.getX(f * 3 + k);
        sorted[write + 1] = position.getY(f * 3 + k);
        sorted[write + 2] = position.getZ(f * 3 + k);
        sortedColours[write] = colours[from] ?? 0;
        sortedColours[write + 1] = colours[from + 1] ?? 0;
        sortedColours[write + 2] = colours[from + 2] ?? 0;
        write += 3;
      }
      if (wantWater === 1) waterVerts += 3;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(sorted, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(sortedColours, 3));
  geometry.computeVertexNormals();
  geometry.clearGroups();
  geometry.addGroup(0, waterVerts, 0);
  geometry.addGroup(waterVerts, count - waterVerts, 1);

  // An emissive floor, not an ambient one. Ambient light multiplies albedo, so
  // dark ocean under a dark ambient lands below VOID_SLATE; emissive adds a
  // constant instead and holds the palette's darkest value as a true floor.
  const floor = {
    emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
    emissiveIntensity: 0.62,
  };

  /**
   * Ocean, with the sun in it.
   *
   * Sunglint is the one thing you actually see from a window in low orbit that
   * a diffuse planet cannot produce: a hard bright patch where the water's
   * mirror direction lines up with your eye, sliding across the sea as the
   * orbit carries you. Here it costs a specular term and nothing else. No
   * bloom, no sprite, no post pass - DIRECTION bans all three - and because the
   * mesh is flat shaded the highlight lands per FACET, so it reads as a scatter
   * of stepped water facets rather than as a soft blob airbrushed on the ocean.
   * That is the same language the rest of the planet is drawn in.
   *
   * `shininess` is high and `specular` deliberately dim. A wide lobe would wash
   * half an ocean and clip; this keeps the patch small and its brightest facet
   * measured well under 255 at every orbital phase.
   */
  const ocean = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    specular: new THREE.Color(GLINT),
    shininess: 7,
    ...floor,
  });

  const land = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    ...floor,
  });

  const mesh = new THREE.Mesh(geometry, [ocean, land]);
  mesh.name = 'earth';

  return { mesh, landPoints: new Float32Array(candidateLand) };
}
