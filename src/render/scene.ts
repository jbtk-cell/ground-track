import * as THREE from 'three';
import { buildAtmosphere, setAtmosphereSun } from './atmosphere';
import { buildMoon, buildPlanets, setMoonSun } from './companions';
import { buildEarth, DEFAULT_EARTH } from './earth';
import { EARTHSHINE_GROUND, PALETTE, SUN_COLOUR } from './palette';
import { buildSettlements, setSettlementSun } from './settlements';
import { buildStarfield } from './starfield';

/** Scene units are Earth radii. One unit is 6378 km. */
export const EARTH_RADIUS_UNITS = 1;

export interface SceneHandle {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly earth: THREE.Mesh;
  readonly atmosphere: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  setSunDirection(direction: THREE.Vector3): void;
  resize(width: number, height: number): void;
  update(elapsedSeconds: number): void;
}

/**
 * The lighting rig, which is the whole trick.
 *
 * A single grazing key placed nearly tangent to the surface fractures a
 * low-poly Earth into separable facet values; a high sun flattens it to mush.
 * An earthshine hemisphere puts bounced daylight on undersides, and a dim
 * anti-sun fill keeps the night limb from going to a flat silhouette. There is
 * no black in the result, which is the point.
 */
function buildLights(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
} {
  const sun = new THREE.DirectionalLight(new THREE.Color(SUN_COLOUR), 2.5);
  sun.position.set(1, 0.06, 0.35).normalize().multiplyScalar(50);
  sun.name = 'sun';
  scene.add(sun);

  const earthshine = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HIGH_FIELD),
    new THREE.Color(EARTHSHINE_GROUND),
    0.55
  );
  earthshine.name = 'earthshine';
  scene.add(earthshine);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.DEEP_FIELD), 0.34);
  fill.position.copy(sun.position).multiplyScalar(-1);
  fill.name = 'antisun';
  scene.add(fill);

  // A floor, so the unlit hemisphere settles onto NIGHT_SIDE rather than black.
  // There is no black anywhere in this game and Lambert shading will happily
  // produce it if nothing stops the falloff.
  const floor = new THREE.AmbientLight(new THREE.Color(PALETTE.NIGHT_SIDE), 0.45);
  floor.name = 'night-floor';
  scene.add(floor);

  return { sun, fill };
}

export function createScene(): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.VOID_SLATE);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.001, 400);

  const { mesh: earth, landPoints } = buildEarth(DEFAULT_EARTH);
  scene.add(earth);

  // Must clear the maximum terrain relief (see RELIEF in earth.ts) or the
  // lights render inside the ground and never appear.
  const settlements = buildSettlements(landPoints, EARTH_RADIUS_UNITS * 1.013);
  scene.add(settlements);

  const atmosphere = buildAtmosphere(EARTH_RADIUS_UNITS);
  scene.add(atmosphere);

  scene.add(buildStarfield(3200, 180));

  // The Moon and the four naked-eye planets. See companions.ts: the Moon is at
  // true scale and true distance, so it is half a degree across and takes its
  // phase from the scene's own sun rather than from anything that has to be
  // kept in step.
  //
  // This bearing puts it high and well off the sun's, which is what gives it a
  // phase to show. Directly along the sun it would be full and featureless;
  // directly opposite, invisible.
  const moon = buildMoon(new THREE.Vector3(0.28, 0.5, -0.82));
  scene.add(moon);
  scene.add(buildPlanets(176));

  const { sun, fill } = buildLights(scene);

  const sunDirection = new THREE.Vector3().copy(sun.position).normalize();
  setAtmosphereSun(atmosphere, sunDirection);
  setSettlementSun(settlements, sunDirection);
  setMoonSun(moon, sunDirection);

  return {
    scene,
    camera,
    earth,
    atmosphere,
    sun,

    setSunDirection(direction: THREE.Vector3) {
      sunDirection.copy(direction).normalize();
      sun.position.copy(sunDirection).multiplyScalar(50);
      fill.position.copy(sun.position).multiplyScalar(-1);
      setAtmosphereSun(atmosphere, sunDirection);
      setSettlementSun(settlements, sunDirection);
      setMoonSun(moon, sunDirection);
    },

    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },

    update(elapsedSeconds: number) {
      // A slow turn, so the terminator crawls rather than sits.
      earth.rotation.y = elapsedSeconds * 0.012;
      settlements.rotation.y = earth.rotation.y;
    },
  };
}
