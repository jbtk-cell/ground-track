/**
 * BAKED/DTEX - seeded DataTextures, and why there is no Canvas here.
 *
 * The interior direction allows textures, but the pipeline's determinism claim
 * extends to them: a texture drawn through Canvas 2D is rasterised by Skia,
 * and Skia's output moves between Chromium versions - which is drift landing
 * straight in the CI pixel baselines. So every map is written texel by texel
 * from the seeded arithmetic in random.ts. Same bytes, every machine, forever.
 *
 * These are MODULATION maps, not albedo: values sit around 1.0 and multiply
 * the vertex albedo the kit already authors (pixel = vertexColour x map x
 * baked light). Authoring them as modulation keeps the palette in one place -
 * a wall's colour is still named in the room file; the map only breaks the
 * flatness of it.
 *
 * The liner follows the Skylab locker-grid reading of reference R06: density
 * comes from pale panels divided by thin dark seams, with small dark latches
 * on the module rhythm - not from noise. Noise was measured invisible at the
 * amplitude the old direction allowed; seams read at any amplitude.
 */
import * as THREE from 'three';
import { fbm2, hash2 } from './random';

/** A typed array over a plain ArrayBuffer, which is what DataTexture accepts. */
function bytes(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

function toTexture(
  data: Uint8Array<ArrayBuffer>,
  size: number,
  repeat: boolean
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Modulation value in 0..~1.05 packed to a byte around unity = 200. */
const UNITY = 200;

function put(data: Uint8Array, i: number, value: number): void {
  const byte = Math.max(0, Math.min(255, Math.round(value * UNITY)));
  data[i] = byte;
  data[i + 1] = byte;
  data[i + 2] = byte;
  data[i + 3] = 255;
}

/** What a material must multiply by so a map value of 1.0 is exactly 1.0. */
export const MAP_UNITY_SCALE = 255 / UNITY;

/**
 * The work-band liner: one texture repeat = ONE BAY (1.05 m), so push wall
 * quads with uvScale = 1.05 and the seams land on the station's own rhythm.
 */
export function linerMap(seed: number, size = 256): THREE.DataTexture {
  const data = bytes(size * size * 4);
  const seam = 0.014; // 1.5 cm of the bay, each side of the panel edge.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      // Panel field: mottle at two scales. The low-frequency term is what
      // spreads a big wall across several value buckets - the flatness gate
      // measured a single-scale field collapsing into one.
      let value =
        0.92 +
        (fbm2(u * 6, v * 6, seed, 3) - 0.5) * 0.16 +
        (fbm2(u * 1.7 + 31, v * 1.7 + 17, seed + 77, 2) - 0.5) * 0.13 +
        (hash2(x, y, seed + 9) - 0.5) * 0.02;
      // Seams: one vertical pair per repeat, one horizontal at panel half-height.
      const du = Math.min(u, 1 - u);
      const dv = Math.min(Math.abs(v - 0.5), Math.min(v, 1 - v));
      const edge = Math.min(du, dv);
      if (edge < seam) {
        const depth = 1 - edge / seam;
        value *= 1 - 0.52 * depth * depth;
      } else if (edge < seam * 3) {
        // The soft AO gradient a recessed panel edge carries.
        const near = 1 - (edge - seam) / (seam * 2);
        value *= 1 - 0.1 * near;
      }
      // Latches: two small dark fittings per panel edge, on the grid.
      const lu = Math.abs(u - 0.5);
      for (const at of [0.27, 0.73]) {
        const dy = Math.abs(v - at);
        if (lu > 0.46 && dy < 0.02) value *= 0.62;
      }
      put(data, (y * size + x) * 4, value);
    }
  }
  return toTexture(data, size, true);
}

/** Deck plate: tread ribs and long wear streaks in the walking direction. */
export function plateMap(seed: number, size = 256): THREE.DataTexture {
  const data = bytes(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      let value = 0.92 + (fbm2(u * 4, v * 4, seed, 3) - 0.5) * 0.08;
      // Wear: streaks stretched along u, brighter where feet polish.
      value += (fbm2(u * 2.4, v * 24, seed + 31, 2) - 0.5) * 0.09;
      // Tread: a fine rib grid, quiet, reading only close up.
      const rib = Math.abs(((u * 24) % 1) - 0.5) < 0.06 || Math.abs(((v * 24) % 1) - 0.5) < 0.06;
      if (rib) value *= 0.93;
      put(data, (y * size + x) * 4, value);
    }
  }
  return toTexture(data, size, true);
}

/** Console faces: directional brushing, almost subliminal. */
export function brushMap(seed: number, size = 128): THREE.DataTexture {
  const data = bytes(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const value = 0.97 + (fbm2(u * 3, v * 90, seed, 2) - 0.5) * 0.05;
      put(data, (y * size + x) * 4, value);
    }
  }
  return toTexture(data, size, true);
}

/**
 * The halo sprite: a radial falloff for the additive glow quads. The alpha IS
 * the falloff; the material's colour carries the hue. Squared so the core is
 * tight and the skirt long, the way a diffuser blooms on a phone camera.
 */
export function haloSprite(size = 128): THREE.DataTexture {
  const data = bytes(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.min(1, Math.hypot(dx, dy));
      const fall = Math.pow(1 - r, 2.4);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(fall * 255);
    }
  }
  const texture = toTexture(data, size, false);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}
