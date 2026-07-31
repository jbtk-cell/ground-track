import * as THREE from 'three';

export interface CameraPreset {
  readonly name: string;
  /** Camera position in Earth radii. */
  readonly position: readonly [number, number, number];
  /** Point the camera aims at. Aiming above the origin pushes Earth low in frame. */
  readonly target: readonly [number, number, number];
  readonly fov: number;
  /** Sun direction, which sets where the terminator falls. */
  readonly sun: readonly [number, number, number];
}

/**
 * Canonical framings. These are also the states the screenshot harness drives,
 * so they double as the visual regression baseline set.
 *
 * The compositional law from the art direction: Earth's limb crosses the frame
 * and the planet holds the lower part of it. No shot is an object against black.
 */
export const PRESETS: readonly CameraPreset[] = [
  {
    name: 'limb-dawn',
    position: [0, 0.5, 2.25],
    target: [0, 1.25, 0],
    fov: 42,
    sun: [0.92, 0.11, 0.08],
  },
  {
    name: 'terminator',
    position: [1.68, 0.5, 1.68],
    target: [0.3, 1.2, 0],
    fov: 40,
    sun: [0.72, 0.06, -0.55],
  },
  {
    name: 'high-pass',
    position: [0, 0.75, 4.1],
    target: [0, 0.9, 0],
    fov: 38,
    sun: [0.8, 0.15, 0.28],
  },
  {
    name: 'night-side',
    position: [-0.72, 0.5, 2.28],
    target: [0, 1.2, 0],
    fov: 42,
    sun: [-0.45, 0.08, -0.89],
  },
];

export function applyPreset(
  camera: THREE.PerspectiveCamera,
  preset: CameraPreset,
  setSun: (direction: THREE.Vector3) => void
): void {
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.fov = preset.fov;
  camera.updateProjectionMatrix();
  setSun(new THREE.Vector3(...preset.sun));
}

export function presetByName(name: string): CameraPreset | undefined {
  return PRESETS.find((preset) => preset.name === name);
}
