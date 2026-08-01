import * as THREE from 'three';
import { TWO_PI, orbitPointAtE } from '../sim';
import type { Elements } from '../sim';
import { presetByName } from './camera';
import { scenePointFromSim } from './units';

/**
 * Sampling by eccentric anomaly rather than true anomaly, because equal steps
 * in E spread points evenly around the ellipse where equal steps in nu bunch
 * them at periapsis.
 */
const SEGMENTS = 512;
/** The strip closes by repeating the first point, bit for bit. */
const POINTS = SEGMENTS + 1;

const DASH_SIZE = 0.045;
const GAP_SIZE = 0.038;
/** The occluded pass renders at this fraction of the solid opacity. */
const OCCLUDED_OPACITY = 0.28;

/**
 * DIRECTION.md: the dash phase crawls "4 px/s so a still frame is never
 * frozen." Converted once to scene units/s at the mission framing rather than
 * read from the live viewport, so the rate is a fixed constant, not something
 * that changes on every window resize.
 *
 * At distance d from the camera, the frame's vertical span in scene units is
 * 2 * d * tan(fovY / 2); dividing by the reference frame height in pixels
 * (the 1600x900 the shot harness renders at) gives scene units per pixel.
 */
const DASH_CRAWL_PX_PER_S = 4;
const REFERENCE_FRAME_HEIGHT_PX = 900;
const missionPreset = presetByName('mission');
if (missionPreset === undefined) throw new Error('Missing mission camera preset');
const [cameraX, cameraY, cameraZ] = missionPreset.position;
const [targetX, targetY, targetZ] = missionPreset.target;
const missionCameraDistance = Math.hypot(cameraX - targetX, cameraY - targetY, cameraZ - targetZ);
const missionHalfFovRad = (missionPreset.fov * Math.PI) / 360;
const sceneUnitsPerPixel =
  (2 * missionCameraDistance * Math.tan(missionHalfFovRad)) / REFERENCE_FRAME_HEIGHT_PX;
const DASH_CRAWL_SCENE_UNITS_PER_S = DASH_CRAWL_PX_PER_S * sceneUnitsPerPixel;

export interface OrbitTraceOptions {
  readonly colour: THREE.ColorRepresentation;
  readonly opacity: number;
  /** Default true. False drops the occluded pass so the trace vanishes behind the planet. */
  readonly dashedBehind?: boolean;
  /** The predicted conic while typing: one dashed pass, no hidden-line pair. */
  readonly ghost?: boolean;
}

export interface OrbitTrace {
  readonly object: THREE.Group;
  update(elements: Elements): void;
  /** Sets the dashed passes' phase as a pure function of the app's sceneTime. */
  setDashTime(tScene: number): void;
  setColour(hex: THREE.ColorRepresentation): void;
  dispose(): void;
}

/**
 * Elements arrive freshly regenerated mid-burn; a half-built or hyperbolic set
 * must never write NaN into the position buffer, so update() refuses it and
 * keeps the last good ellipse instead.
 */
function usable(el: Elements): boolean {
  return (
    Number.isFinite(el.a) &&
    el.a > 0 &&
    Number.isFinite(el.e) &&
    el.e >= 0 &&
    el.e < 1 &&
    Number.isFinite(el.i) &&
    Number.isFinite(el.raan) &&
    Number.isFinite(el.argp)
  );
}

/**
 * An orbit as a 1px hairline, solid ahead of nothing and dashed behind the
 * planet: the ISO hidden-line convention executed live against a real depth
 * test. Two Line objects share one BufferGeometry - a solid pass with the
 * normal depth test, and a dashed pass drawn only where something nearer
 * already owns the depth buffer, so the stroke converts to dashes exactly at
 * the limb.
 */
export function createOrbitTrace(options: OrbitTraceOptions): OrbitTrace {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINTS * 3), 3));

  const group = new THREE.Group();
  group.name = 'orbit-trace';

  const materials: Array<THREE.LineBasicMaterial | THREE.LineDashedMaterial> = [];
  /** The line whose computeLineDistances() feeds every dashed material. */
  let dashedLine: THREE.Line | null = null;
  /** The lineDistance values computeLineDistances() produced, phase zero. */
  let baseLineDistances: Float32Array | null = null;
  let dashTime = 0;

  /**
   * Shifts the dashed pass's lineDistance attribute by the current phase
   * without a full computeLineDistances() recompute: the dash shader takes
   * `mod(lineDistance, dashSize + gapSize)`, and GLSL mod handles the negative
   * values a growing offset produces, so a per-vertex subtraction is enough.
   */
  function applyDashOffset(): void {
    if (dashedLine === null || baseLineDistances === null) return;
    const attribute = dashedLine.geometry.getAttribute('lineDistance') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const offset = dashTime * DASH_CRAWL_SCENE_UNITS_PER_S;
    baseLineDistances.forEach((base, k) => {
      array[k] = base - offset;
    });
    attribute.needsUpdate = true;
  }

  if (options.ghost === true) {
    const material = new THREE.LineDashedMaterial({
      color: new THREE.Color(options.colour),
      transparent: true,
      opacity: options.opacity,
      dashSize: DASH_SIZE,
      gapSize: GAP_SIZE,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = 'orbit-ghost';
    // The buffer starts all-zero and a stale bounding sphere would cull the
    // line; a 513-vertex strip is too cheap to be worth guarding with bounds.
    line.frustumCulled = false;
    group.add(line);
    materials.push(material);
    dashedLine = line;
  } else {
    const solidMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(options.colour),
      transparent: true,
      opacity: options.opacity,
      depthWrite: false,
    });
    const solid = new THREE.Line(geometry, solidMaterial);
    solid.name = 'orbit-solid';
    solid.frustumCulled = false;
    group.add(solid);
    materials.push(solidMaterial);

    if (options.dashedBehind !== false) {
      const occludedMaterial = new THREE.LineDashedMaterial({
        color: new THREE.Color(options.colour),
        transparent: true,
        opacity: options.opacity * OCCLUDED_OPACITY,
        dashSize: DASH_SIZE,
        gapSize: GAP_SIZE,
        depthWrite: false,
      });
      // GreaterDepth inverts the test: this pass survives only where the
      // planet already wrote a nearer depth, i.e. exactly where the solid
      // pass lost. Between them every fragment of the ellipse is drawn once.
      occludedMaterial.depthFunc = THREE.GreaterDepth;
      const occluded = new THREE.Line(geometry, occludedMaterial);
      occluded.name = 'orbit-occluded';
      occluded.frustumCulled = false;
      group.add(occluded);
      materials.push(occludedMaterial);
      dashedLine = occluded;
    }
  }

  return {
    object: group,

    update(elements: Elements) {
      if (!usable(elements)) return;

      const position = geometry.getAttribute('position') as THREE.BufferAttribute;

      for (let k = 0; k < POINTS; k += 1) {
        const E = ((k % SEGMENTS) / SEGMENTS) * TWO_PI;
        // The sim owns the ellipse and its frame; the trace only maps points.
        const p = scenePointFromSim(orbitPointAtE(elements, E));
        position.setXYZ(k, p.x, p.y, p.z);
      }

      position.needsUpdate = true;
      // Dash placement is a cumulative arc length baked into the geometry;
      // skip this and the dashed pass renders nothing. Elements arrive far
      // less often than frames render, so recomputing it here (rather than in
      // applyDashOffset, called every frame) is the expensive path only when
      // the orbit actually changes.
      if (dashedLine) {
        dashedLine.computeLineDistances();
        const attribute = dashedLine.geometry.getAttribute('lineDistance') as THREE.BufferAttribute;
        baseLineDistances = Float32Array.from(attribute.array as Float32Array);
        applyDashOffset();
      }
    },

    setDashTime(tScene: number) {
      dashTime = tScene;
      applyDashOffset();
    },

    setColour(hex: THREE.ColorRepresentation) {
      for (const material of materials) material.color.set(hex);
    },

    dispose() {
      geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
