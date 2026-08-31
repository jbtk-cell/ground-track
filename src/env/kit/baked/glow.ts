/**
 * BAKED/GLOW - authored bloom: halo quads floating just proud of what emits.
 *
 * The reference footage has bloom on its light strips and the owner allowed
 * glow indoors by name - but the postprocessing import ban stands, so glow is
 * geometry: an additive quad with a radial-falloff sprite, hung a few
 * centimetres proud of the diffuser it belongs to. Depth-tested, so real
 * geometry occludes it; that occlusion is precisely what makes it read as
 * light in the air rather than a sticker on the lens. The surface response -
 * the pool a lamp lays on the desk under it - is the bake's job, not this
 * file's; a halo whose lamp illuminates nothing reads as a mistake. No gate
 * measures that per lamp today - the tuning loop measures it by hand with
 * scripts/measure.mjs, and turning it into a probe gate is welcome work.
 */
import * as THREE from 'three';
import { haloSprite } from './dtex';
import { haloMaterial } from './material';

let sharedSprite: THREE.DataTexture | null = null;

function sprite(): THREE.DataTexture {
  if (sharedSprite === null) sharedSprite = haloSprite();
  return sharedSprite;
}

export interface HaloSpec {
  /** Centre of the glow, room coordinates. */
  readonly at: readonly [number, number, number];
  /** Unit-ish normal the quad faces along; it is offset this way too. */
  readonly normal: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
  readonly colour: string;
  /** 0..1; multiplies the sprite's falloff. Keep halos quiet - they add. */
  readonly opacity: number;
  /** Metres proud of the surface. Default 0.03. */
  readonly proud?: number;
}

/** One glow. The caller owns placement; this owns material discipline. */
export function halo(spec: HaloSpec): THREE.Mesh {
  const material = haloMaterial(sprite(), spec.colour);
  material.opacity = spec.opacity;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), material);
  const [nx, ny, nz] = spec.normal;
  const proud = spec.proud ?? 0.03;
  mesh.position.set(spec.at[0] + nx * proud, spec.at[1] + ny * proud, spec.at[2] + nz * proud);
  // PlaneGeometry faces +Z; aim it along the spec's normal.
  const aim = new THREE.Vector3(nx, ny, nz).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
  // After the room's opaque pass; halos add over whatever is behind them.
  mesh.renderOrder = 30;
  mesh.name = 'halo';
  return mesh;
}
