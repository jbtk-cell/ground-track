import * as THREE from 'three';
import { R_EARTH } from '../sim';
import type { State, Vec3 } from '../sim';
import { EARTH_RADIUS_UNITS } from './scene';

/** One scene unit is one Earth radius; kilometres divide through R_EARTH. */
export function kmToScene(km: number): number {
  return (km / R_EARTH) * EARTH_RADIUS_UNITS;
}

export function sceneToKm(units: number): number {
  return (units / EARTH_RADIUS_UNITS) * R_EARTH;
}

/**
 * A point in the three.js scene frame as plain numbers, so the mapping stays
 * pure maths and can be tested without an engine.
 */
export interface ScenePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The one frame mapping every mission visual shares. The sim's inertial frame
 * is z-up; earth.ts renders y-up. Sim z -> scene y, sim x -> scene x, and
 * sim y -> scene -z, which keeps the transform a pure rotation: right-handed
 * on both sides, so no orbit silently mirrors. Input in km, output in scene
 * units.
 */
export function scenePointFromSim(point: Vec3): ScenePoint {
  return { x: kmToScene(point.x), y: kmToScene(point.z), z: -kmToScene(point.y) };
}

/** Inverse of scenePointFromSim: scene units back into sim kilometres. */
export function simPointFromScene(point: ScenePoint): Vec3 {
  return { x: sceneToKm(point.x), y: sceneToKm(-point.z), z: sceneToKm(point.y) };
}

/** Thin three wrapper over the pure mapping. */
export function sceneFromState(state: State): THREE.Vector3 {
  const p = scenePointFromSim(state.position);
  return new THREE.Vector3(p.x, p.y, p.z);
}
