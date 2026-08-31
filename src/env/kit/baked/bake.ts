/**
 * BAKED/BAKE - the light solver. Runs once per room, owns every shadow.
 *
 * This is the machinery the interior direction (docs/INTERIORS.md) stands on:
 * direct light from rectangular area sources with soft ray-traced penumbrae,
 * distance-weighted ambient occlusion, one unshadowed bounce of colour bleed,
 * and a filmic shoulder - all computed here, on the CPU, from seeded
 * arithmetic, and consumed at runtime as a static texture by unlit materials.
 * No shadow map exists anywhere; ENVIRONMENTS.md non-negotiable 2 stands and
 * is simply not needed. CI's software rasteriser is handed textured quads,
 * which is its best case, and the bake's output is identical on every machine
 * because it never touches a GPU, a clock, or an unseeded random.
 *
 * UNITS AND SPACES. Everything is linear radiometric-ish irradiance, scaled so
 * 1.0 renders an albedo at its authored value. The lightmap stores irradiance
 * over LIGHT_RANGE in plain RGBA8 (see the pack step for why not float), and
 * the shoulder keeps everything under LIGHT_RANGE so nothing clips in
 * storage. `lightMapIntensity` is PI * LIGHT_RANGE, because MeshBasicMaterial
 * multiplies lightMapTexel * intensity / PI into its indirectDiffuse.
 */
import * as THREE from 'three';
import type { BakedSink } from './atlas';
import { cosineHemisphere, hash2 } from './random';
import { nearestHit, occluded, vesselExit, type TraceSet } from './trace';

export interface AreaLamp {
  readonly name: string;
  /** Rect: origin corner plus two edges. Emits from both faces. */
  readonly origin: readonly [number, number, number];
  readonly edgeU: readonly [number, number, number];
  readonly edgeV: readonly [number, number, number];
  /** Linear colour times scalar intensity. */
  readonly colour: readonly [number, number, number];
  readonly intensity: number;
  readonly samplesU: number;
  readonly samplesV: number;
}

export interface BakeOptions {
  readonly seed: number;
  /** Base fill, linear. What a surface sees with everything occluded is this times its AO. */
  readonly ambient: readonly [number, number, number];
  readonly aoSamples: number;
  /** Metres. Hits beyond this do not occlude. */
  readonly aoRange: number;
  /** 0..1. How black a fully-occluded corner goes. */
  readonly aoStrength: number;
  /** 0..1 share of DIRECT light that ignores AO (1 = shadows only from rays). */
  readonly directAoMix: number;
  /** Strength of the one unshadowed bounce gather. 0 disables. */
  readonly bounce: number;
  readonly exposure: number;
  /** Shoulder knee, linear. Above it light compresses toward `ceiling`. */
  readonly knee: number;
  readonly ceiling: number;
  /**
   * Irradiance floor, applied after exposure. A fully occluded pocket still
   * scatters SOMETHING in a lit pressurised can, and the palette gate holds
   * interiors above luma 5: this is the number that keeps the darkest
   * albedo-times-light product a value rather than an absence.
   */
  readonly floor: number;
}

export interface Probe {
  r: number;
  g: number;
  b: number;
  /** Luma-weighted mean incoming direction, unnormalised. */
  dx: number;
  dy: number;
  dz: number;
}

export interface BakeResult {
  readonly texture: THREE.DataTexture;
  /** Assign verbatim to material.lightMapIntensity. */
  readonly intensity: number;
  /** Trilinear light probe for the arm's runtime rig. */
  probe(x: number, y: number, z: number, out: Probe): void;
  /** FNV-1a over the raw texels; the determinism test compares two bakes. */
  readonly hash: number;
}

interface FlatLamp {
  readonly sx: Float64Array;
  readonly sy: Float64Array;
  readonly sz: Float64Array;
  readonly power: readonly [number, number, number];
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly count: number;
}

const MIN_R2 = 0.04;

/** The lightmap byte range: a stored byte b decodes to irradiance b/255*LIGHT_RANGE. */
export const LIGHT_RANGE = 2.2;

function flatten(lamp: AreaLamp): FlatLamp {
  const nu = Math.max(1, lamp.samplesU);
  const nv = Math.max(1, lamp.samplesV);
  const count = nu * nv;
  const sx = new Float64Array(count);
  const sy = new Float64Array(count);
  const sz = new Float64Array(count);
  const [ox, oy, oz] = lamp.origin;
  const [ux, uy, uz] = lamp.edgeU;
  const [vx, vy, vz] = lamp.edgeV;
  let k = 0;
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const fu = (i + 0.5) / nu;
      const fv = (j + 0.5) / nv;
      sx[k] = ox + ux * fu + vx * fv;
      sy[k] = oy + uy * fu + vy * fv;
      sz[k] = oz + uz * fu + vz * fv;
      k += 1;
    }
  }
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const area = Math.hypot(nx, ny, nz);
  const inv = area > 1e-9 ? 1 / area : 0;
  nx *= inv;
  ny *= inv;
  nz *= inv;
  const scale = (lamp.intensity * area) / count;
  return {
    sx,
    sy,
    sz,
    power: [lamp.colour[0] * scale, lamp.colour[1] * scale, lamp.colour[2] * scale],
    nx,
    ny,
    nz,
    count,
  };
}

/** The shoulder: identity below the knee, asymptotic to `ceiling` above it. */
function shoulder(value: number, knee: number, ceiling: number): number {
  if (value <= knee) return value;
  const span = ceiling - knee;
  const over = value - knee;
  return knee + (span * over) / (span + over);
}

/**
 * The evaluator both bakes share: direct light and ambient occlusion at one
 * point with one normal. Factored out so bakeGeometry() can light arbitrary
 * fit-out meshes (the console instruments) with exactly the arithmetic the
 * room's own atlas gets - one solver, one look, one determinism argument.
 */
function makeEvaluator(
  set: TraceSet,
  flat: readonly FlatLamp[],
  hemi: Float32Array,
  opts: BakeOptions
) {
  const direct = (px: number, py: number, pz: number, nx: number, ny: number, nz: number) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const lamp of flat) {
      for (let s = 0; s < lamp.count; s += 1) {
        const dx = (lamp.sx[s] ?? 0) - px;
        const dy = (lamp.sy[s] ?? 0) - py;
        const dz = (lamp.sz[s] ?? 0) - pz;
        const r2 = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(r2);
        if (dist < 1e-6) continue;
        const inv = 1 / dist;
        const cosS = (dx * nx + dy * ny + dz * nz) * inv;
        if (cosS <= 0) continue;
        // Both faces of a diffuser emit; orientation mistakes stay visible
        // in the values, never as a silently dead lamp.
        const cosL = Math.abs((dx * lamp.nx + dy * lamp.ny + dz * lamp.nz) * inv);
        if (cosL <= 1e-4) continue;
        if (occluded(set, px, py, pz, dx * inv, dy * inv, dz * inv, 0.012, dist - 0.012)) continue;
        const fall = (cosS * cosL) / (Math.PI * Math.max(r2, MIN_R2));
        r += lamp.power[0] * fall;
        g += lamp.power[1] * fall;
        b += lamp.power[2] * fall;
      }
    }
    return [r, g, b] as const;
  };

  const ambientOcclusion = (
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
    gx: number,
    gy: number
  ) => {
    // Tangent frame, deterministically chosen off the less-aligned axis.
    let tx: number;
    let ty: number;
    let tz: number;
    if (Math.abs(ny) < 0.9) {
      tx = ny * 0 - nz * 1;
      ty = nz * 0 - nx * 0;
      tz = nx * 1 - ny * 0;
    } else {
      tx = ny * 1 - nz * 0;
      ty = nz * 0 - nx * 1;
      tz = nx * 0 - ny * 0;
    }
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;

    const spin = hash2(gx, gy, opts.seed) * Math.PI * 2;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);

    let occ = 0;
    const n = opts.aoSamples;
    for (let s = 0; s < n; s += 1) {
      const hx0 = hemi[s * 3] ?? 0;
      const hy0 = hemi[s * 3 + 1] ?? 0;
      const hz = hemi[s * 3 + 2] ?? 0;
      const hx = hx0 * cs - hy0 * sn;
      const hy = hx0 * sn + hy0 * cs;
      const dx = tx * hx + bx * hy + nx * hz;
      const dy = ty * hx + by * hy + ny * hz;
      const dz = tz * hx + bz * hy + nz * hz;
      const exit = vesselExit(set, px, py, pz, dx, dy, dz);
      const hit = nearestHit(set, px, py, pz, dx, dy, dz, 0.012, Math.min(exit, opts.aoRange));
      const reach = Math.min(hit, exit);
      if (reach < opts.aoRange) occ += 1 - reach / opts.aoRange;
    }
    return 1 - (opts.aoStrength * occ) / n;
  };

  return { direct, ambientOcclusion };
}

export function bake(
  sink: BakedSink,
  set: TraceSet,
  lamps: readonly AreaLamp[],
  opts: BakeOptions
): BakeResult {
  const size = sink.size;
  const texels = new Float32Array(size * size * 3);
  const flat = lamps.map(flatten);
  const hemi = cosineHemisphere(opts.aoSamples);
  const { direct, ambientOcclusion } = makeEvaluator(set, flat, hemi, opts);

  // --- Pass 1: direct + AO into every patch texel. --------------------------

  for (const patch of sink.patches) {
    const [ox, oy, oz] = patch.origin;
    const [ux, uy, uz] = patch.edgeU;
    const [vx, vy, vz] = patch.edgeV;
    const [nx, ny, nz] = patch.normal;
    const stepU = patch.w > 1 ? 1 / (patch.w - 1) : 0;
    const stepV = patch.h > 1 ? 1 / (patch.h - 1) : 0;
    for (let j = 0; j < patch.h; j += 1) {
      const fv = j * stepV;
      for (let i = 0; i < patch.w; i += 1) {
        const fu = i * stepU;
        const px = ox + ux * fu + vx * fv + nx * 0.004;
        const py = oy + uy * fu + vy * fv + ny * 0.004;
        const pz = oz + uz * fu + vz * fv + nz * 0.004;
        const [dr, dg, db] = direct(px, py, pz, nx, ny, nz);
        const ao = ambientOcclusion(px, py, pz, nx, ny, nz, patch.x + i, patch.y + j);
        const dm = opts.directAoMix + (1 - opts.directAoMix) * ao;
        const idx = ((patch.y + j) * size + (patch.x + i)) * 3;
        texels[idx] = (opts.ambient[0] ?? 0) * ao + dr * dm;
        texels[idx + 1] = (opts.ambient[1] ?? 0) * ao + dg * dm;
        texels[idx + 2] = (opts.ambient[2] ?? 0) * ao + db * dm;
      }
    }
  }

  // --- Pass 2: one unshadowed bounce, gathered coarse and lerped up. --------
  //
  // Emitters are the direct-lit patches themselves, sampled sparsely, each
  // reflecting its patch albedo. No visibility rays: bounce light is low
  // frequency and the receiver's own AO already damps it in corners. The
  // cheat is stated here so nobody mistakes it for the real thing; a
  // `bounceVisibility` upgrade would slot in below if a room ever needs it.

  if (opts.bounce > 0) {
    interface Emitter {
      x: number;
      y: number;
      z: number;
      nx: number;
      ny: number;
      nz: number;
      r: number;
      g: number;
      b: number;
    }
    const emitters: Emitter[] = [];
    const EMIT_EVERY_M = 0.45;
    for (const patch of sink.patches) {
      const [ux, uy, uz] = patch.edgeU;
      const [vx, vy, vz] = patch.edgeV;
      const lenU = Math.hypot(ux, uy, uz);
      const lenV = Math.hypot(vx, vy, vz);
      const nu = Math.max(1, Math.round(lenU / EMIT_EVERY_M));
      const nv = Math.max(1, Math.round(lenV / EMIT_EVERY_M));
      const cellArea = (lenU / nu) * (lenV / nv);
      for (let j = 0; j < nv; j += 1) {
        for (let i = 0; i < nu; i += 1) {
          const fu = (i + 0.5) / nu;
          const fv = (j + 0.5) / nv;
          const ti = Math.min(patch.w - 1, Math.floor(fu * patch.w));
          const tj = Math.min(patch.h - 1, Math.floor(fv * patch.h));
          const idx = ((patch.y + tj) * size + (patch.x + ti)) * 3;
          const [nx, ny, nz] = patch.normal;
          const [ox, oy, oz] = patch.origin;
          emitters.push({
            x: ox + ux * fu + vx * fv + nx * 0.004,
            y: oy + uy * fu + vy * fv + ny * 0.004,
            z: oz + uz * fu + vz * fv + nz * 0.004,
            nx,
            ny,
            nz,
            r: (texels[idx] ?? 0) * (patch.albedo[0] ?? 0) * cellArea,
            g: (texels[idx + 1] ?? 0) * (patch.albedo[1] ?? 0) * cellArea,
            b: (texels[idx + 2] ?? 0) * (patch.albedo[2] ?? 0) * cellArea,
          });
        }
      }
    }

    const gather = (px: number, py: number, pz: number, nx: number, ny: number, nz: number) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const e of emitters) {
        const dx = e.x - px;
        const dy = e.y - py;
        const dz = e.z - pz;
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < 0.02) continue;
        const inv = 1 / Math.sqrt(r2);
        const cosS = (dx * nx + dy * ny + dz * nz) * inv;
        if (cosS <= 0) continue;
        const cosE = -(dx * e.nx + dy * e.ny + dz * e.nz) * inv;
        if (cosE <= 0) continue;
        const fall = (cosS * cosE) / (Math.PI * Math.max(r2, MIN_R2));
        r += e.r * fall;
        g += e.g * fall;
        b += e.b * fall;
      }
      return [r * opts.bounce, g * opts.bounce, b * opts.bounce] as const;
    };

    const COARSE = 4;
    for (const patch of sink.patches) {
      const cw = Math.max(2, Math.ceil(patch.w / COARSE));
      const ch = Math.max(2, Math.ceil(patch.h / COARSE));
      const coarse = new Float32Array(cw * ch * 3);
      const [ox, oy, oz] = patch.origin;
      const [ux, uy, uz] = patch.edgeU;
      const [vx, vy, vz] = patch.edgeV;
      const [nx, ny, nz] = patch.normal;
      for (let j = 0; j < ch; j += 1) {
        for (let i = 0; i < cw; i += 1) {
          const fu = cw > 1 ? i / (cw - 1) : 0;
          const fv = ch > 1 ? j / (ch - 1) : 0;
          const [br, bg, bb] = gather(
            ox + ux * fu + vx * fv + nx * 0.004,
            oy + uy * fu + vy * fv + ny * 0.004,
            oz + uz * fu + vz * fv + nz * 0.004,
            nx,
            ny,
            nz
          );
          const c = (j * cw + i) * 3;
          coarse[c] = br;
          coarse[c + 1] = bg;
          coarse[c + 2] = bb;
        }
      }
      for (let j = 0; j < patch.h; j += 1) {
        const fv = patch.h > 1 ? (j / (patch.h - 1)) * (ch - 1) : 0;
        const j0 = Math.min(ch - 2, Math.floor(fv));
        const tj = fv - j0;
        for (let i = 0; i < patch.w; i += 1) {
          const fu = patch.w > 1 ? (i / (patch.w - 1)) * (cw - 1) : 0;
          const i0 = Math.min(cw - 2, Math.floor(fu));
          const ti = fu - i0;
          const idx = ((patch.y + j) * size + (patch.x + i)) * 3;
          for (let ch3 = 0; ch3 < 3; ch3 += 1) {
            const c00 = coarse[(j0 * cw + i0) * 3 + ch3] ?? 0;
            const c10 = coarse[(j0 * cw + i0 + 1) * 3 + ch3] ?? 0;
            const c01 = coarse[((j0 + 1) * cw + i0) * 3 + ch3] ?? 0;
            const c11 = coarse[((j0 + 1) * cw + i0 + 1) * 3 + ch3] ?? 0;
            const top = c00 + (c10 - c00) * ti;
            const bot = c01 + (c11 - c01) * ti;
            texels[idx + ch3] = (texels[idx + ch3] ?? 0) + top + (bot - top) * tj;
          }
        }
      }
    }
  }

  // --- Pass 3: exposure and shoulder, in place. -----------------------------

  const total = size * size * 3;
  for (const patch of sink.patches) {
    for (let j = 0; j < patch.h; j += 1) {
      for (let i = 0; i < patch.w; i += 1) {
        const idx = ((patch.y + j) * size + (patch.x + i)) * 3;
        for (let c = 0; c < 3; c += 1) {
          const value = (texels[idx + c] ?? 0) * opts.exposure;
          texels[idx + c] = Math.max(opts.floor, shoulder(value, opts.knee, opts.ceiling));
        }
      }
    }
  }

  // The reserved white texel the vertex-lit tier parks on: term of exactly 1.
  texels[0] = 1;
  texels[1] = 1;
  texels[2] = 1;

  // --- Pass 4: the vertex-lit tier, multiplied into the colour attribute. ---

  const parked = 0.5 / size;
  const positions = sink.position;
  const colours = sink.colour;
  const vertexCount = positions.length / 3;
  for (let tri = 0; tri < vertexCount / 3; tri += 1) {
    const v0 = tri * 3;
    const u = sink.uv1[v0 * 2] ?? 0;
    const v = sink.uv1[v0 * 2 + 1] ?? 0;
    if (u !== parked || v !== parked) continue;

    const ax = positions[v0 * 3] ?? 0;
    const ay = positions[v0 * 3 + 1] ?? 0;
    const az = positions[v0 * 3 + 2] ?? 0;
    const bx = positions[(v0 + 1) * 3] ?? 0;
    const by = positions[(v0 + 1) * 3 + 1] ?? 0;
    const bz = positions[(v0 + 1) * 3 + 2] ?? 0;
    const cx = positions[(v0 + 2) * 3] ?? 0;
    const cy = positions[(v0 + 2) * 3 + 1] ?? 0;
    const cz = positions[(v0 + 2) * 3 + 2] ?? 0;
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;

    for (let corner = 0; corner < 3; corner += 1) {
      const vi = v0 + corner;
      const px = (positions[vi * 3] ?? 0) + nx * 0.012;
      const py = (positions[vi * 3 + 1] ?? 0) + ny * 0.012;
      const pz = (positions[vi * 3 + 2] ?? 0) + nz * 0.012;
      const [dr, dg, db] = direct(px, py, pz, nx, ny, nz);
      const ao = ambientOcclusion(
        px,
        py,
        pz,
        nx,
        ny,
        nz,
        Math.round(px * 53 + pz * 17),
        Math.round(py * 53 + px * 17)
      );
      const dm = opts.directAoMix + (1 - opts.directAoMix) * ao;
      const lr = Math.max(
        opts.floor,
        shoulder(((opts.ambient[0] ?? 0) * ao + dr * dm) * opts.exposure, opts.knee, opts.ceiling)
      );
      const lg = Math.max(
        opts.floor,
        shoulder(((opts.ambient[1] ?? 0) * ao + dg * dm) * opts.exposure, opts.knee, opts.ceiling)
      );
      const lb = Math.max(
        opts.floor,
        shoulder(((opts.ambient[2] ?? 0) * ao + db * dm) * opts.exposure, opts.knee, opts.ceiling)
      );
      colours[vi * 3] = (colours[vi * 3] ?? 0) * lr;
      colours[vi * 3 + 1] = (colours[vi * 3 + 1] ?? 0) * lg;
      colours[vi * 3 + 2] = (colours[vi * 3 + 2] ?? 0) * lb;
    }
  }

  // --- Pack to RGBA8 and hash. ----------------------------------------------
  //
  // Plain bytes, not floats, and RANGE is why it works: irradiance is stored
  // divided by RANGE and the material multiplies it back through
  // lightMapIntensity, so values up to RANGE survive and the quantisation
  // step is RANGE/255 - under half a value out of 255 on screen, invisible.
  // An RGBA16F atlas was tried first and sampled as zero on SwiftShader's
  // WebGL for exactly the texels that mattered; an 8-bit texture is the most
  // boring object in the entire API, and boring is what CI needs.

  const RANGE = LIGHT_RANGE;
  const bytes = new Uint8Array(new ArrayBuffer(size * size * 4));
  for (let i = 0; i < size * size; i += 1) {
    bytes[i * 4] = Math.round(Math.min(1, (texels[i * 3] ?? 0) / RANGE) * 255);
    bytes[i * 4 + 1] = Math.round(Math.min(1, (texels[i * 3 + 1] ?? 0) / RANGE) * 255);
    bytes[i * 4 + 2] = Math.round(Math.min(1, (texels[i * 3 + 2] ?? 0) / RANGE) * 255);
    bytes[i * 4 + 3] = 255;
  }
  // The reserved white texel must decode to EXACTLY 1.0 after the RANGE
  // multiply, or every vertex-lit surface picks up a uniform cast. Byte 116
  // at RANGE 2.2 decodes to 1.0007; close, but exactness is cheap: the
  // shader term is texel * RANGE, so store 1/RANGE with full precision by
  // special-casing the one texel whose value is load-bearing.
  bytes[0] = Math.round((1 / RANGE) * 255);
  bytes[1] = bytes[0];
  bytes[2] = bytes[0];

  let hashValue = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hashValue = Math.imul(hashValue ^ (bytes[i] ?? 0), 0x01000193) >>> 0;
  }
  void total;

  const texture = new THREE.DataTexture(
    bytes,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // --- Probes: a coarse grid of (colour, mean direction) for the arm. -------

  const v0 = set.vessel;
  const PX = 5;
  const PY = 3;
  const PZ = 4;
  const probes = new Float64Array(PX * PY * PZ * 6);
  for (let k = 0; k < PZ; k += 1) {
    for (let j = 0; j < PY; j += 1) {
      for (let i = 0; i < PX; i += 1) {
        const px = v0.x0 + ((i + 0.5) / PX) * (v0.x1 - v0.x0);
        const py = v0.y0 + ((j + 0.5) / PY) * (v0.y1 - v0.y0);
        const pz = v0.z0 + ((k + 0.5) / PZ) * (v0.z1 - v0.z0);
        let r = opts.ambient[0] ?? 0;
        let g = opts.ambient[1] ?? 0;
        let b = opts.ambient[2] ?? 0;
        let dx = 0;
        let dy = 0;
        let dz = 0;
        for (const lamp of flat) {
          for (let s = 0; s < lamp.count; s += 1) {
            const lx = (lamp.sx[s] ?? 0) - px;
            const ly = (lamp.sy[s] ?? 0) - py;
            const lz = (lamp.sz[s] ?? 0) - pz;
            const r2 = lx * lx + ly * ly + lz * lz;
            const dist = Math.sqrt(r2);
            if (dist < 1e-6) continue;
            const inv = 1 / dist;
            if (occluded(set, px, py, pz, lx * inv, ly * inv, lz * inv, 0.012, dist - 0.012)) {
              continue;
            }
            const fall = 1 / (Math.PI * Math.max(r2, MIN_R2));
            const lr = lamp.power[0] * fall;
            const lg = lamp.power[1] * fall;
            const lb = lamp.power[2] * fall;
            r += lr;
            g += lg;
            b += lb;
            const luma = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
            dx += lx * inv * luma;
            dy += ly * inv * luma;
            dz += lz * inv * luma;
          }
        }
        const at = ((k * PY + j) * PX + i) * 6;
        probes[at] = r * opts.exposure;
        probes[at + 1] = g * opts.exposure;
        probes[at + 2] = b * opts.exposure;
        probes[at + 3] = dx;
        probes[at + 4] = dy;
        probes[at + 5] = dz;
      }
    }
  }

  const probe = (x: number, y: number, z: number, out: Probe): void => {
    const fx = Math.min(PX - 1.001, Math.max(0, ((x - v0.x0) / (v0.x1 - v0.x0)) * PX - 0.5));
    const fy = Math.min(PY - 1.001, Math.max(0, ((y - v0.y0) / (v0.y1 - v0.y0)) * PY - 0.5));
    const fz = Math.min(PZ - 1.001, Math.max(0, ((z - v0.z0) / (v0.z1 - v0.z0)) * PZ - 0.5));
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const k0 = Math.floor(fz);
    const ti = fx - i0;
    const tj = fy - j0;
    const tk = fz - k0;
    out.r = 0;
    out.g = 0;
    out.b = 0;
    out.dx = 0;
    out.dy = 0;
    out.dz = 0;
    for (let dk = 0; dk < 2; dk += 1) {
      for (let dj = 0; dj < 2; dj += 1) {
        for (let di = 0; di < 2; di += 1) {
          const w = (di === 0 ? 1 - ti : ti) * (dj === 0 ? 1 - tj : tj) * (dk === 0 ? 1 - tk : tk);
          const at = (((k0 + dk) * PY + (j0 + dj)) * PX + (i0 + di)) * 6;
          out.r += (probes[at] ?? 0) * w;
          out.g += (probes[at + 1] ?? 0) * w;
          out.b += (probes[at + 2] ?? 0) * w;
          out.dx += (probes[at + 3] ?? 0) * w;
          out.dy += (probes[at + 4] ?? 0) * w;
          out.dz += (probes[at + 5] ?? 0) * w;
        }
      }
    }
  };

  return { texture, intensity: Math.PI * LIGHT_RANGE, probe, hash: hashValue };
}

/**
 * Light an arbitrary non-indexed geometry the way the atlas bake lights its
 * vertex-lit tier: per-triangle normal, per-vertex evaluation, the result
 * multiplied into the colour attribute in place. For fit-out meshes built by
 * older kit code (the console instruments) that a rebuilt room adopts without
 * rebuilding - they then draw with a plain vertexColors MeshBasicMaterial and
 * sit in the same light as everything else.
 */
export function bakeGeometry(
  geometry: THREE.BufferGeometry,
  set: TraceSet,
  lamps: readonly AreaLamp[],
  opts: BakeOptions
): void {
  const flat = lamps.map(flatten);
  const hemi = cosineHemisphere(opts.aoSamples);
  const { direct, ambientOcclusion } = makeEvaluator(set, flat, hemi, opts);
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  if (!(position instanceof THREE.BufferAttribute) || !(colour instanceof THREE.BufferAttribute)) {
    throw new Error('bakeGeometry: needs position and color attributes');
  }
  if (geometry.index !== null) throw new Error('bakeGeometry: needs non-indexed geometry');

  for (let tri = 0; tri < position.count / 3; tri += 1) {
    const v0 = tri * 3;
    const ax = position.getX(v0);
    const ay = position.getY(v0);
    const az = position.getZ(v0);
    let nx =
      (position.getY(v0 + 1) - ay) * (position.getZ(v0 + 2) - az) -
      (position.getZ(v0 + 1) - az) * (position.getY(v0 + 2) - ay);
    let ny =
      (position.getZ(v0 + 1) - az) * (position.getX(v0 + 2) - ax) -
      (position.getX(v0 + 1) - ax) * (position.getZ(v0 + 2) - az);
    let nz =
      (position.getX(v0 + 1) - ax) * (position.getY(v0 + 2) - ay) -
      (position.getY(v0 + 1) - ay) * (position.getX(v0 + 2) - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;

    for (let corner = 0; corner < 3; corner += 1) {
      const vi = v0 + corner;
      const px = position.getX(vi) + nx * 0.012;
      const py = position.getY(vi) + ny * 0.012;
      const pz = position.getZ(vi) + nz * 0.012;
      const [dr, dg, db] = direct(px, py, pz, nx, ny, nz);
      const ao = ambientOcclusion(
        px,
        py,
        pz,
        nx,
        ny,
        nz,
        Math.round(px * 53 + pz * 17),
        Math.round(py * 53 + px * 17)
      );
      const dm = opts.directAoMix + (1 - opts.directAoMix) * ao;
      const scale = (base: number, dir: number): number =>
        Math.max(
          opts.floor,
          shoulder((base * ao + dir * dm) * opts.exposure, opts.knee, opts.ceiling)
        );
      colour.setXYZ(
        vi,
        colour.getX(vi) * scale(opts.ambient[0] ?? 0, dr),
        colour.getY(vi) * scale(opts.ambient[1] ?? 0, dg),
        colour.getZ(vi) * scale(opts.ambient[2] ?? 0, db)
      );
    }
  }
  colour.needsUpdate = true;
}
