import * as THREE from 'three';
import { TWO_PI, orbitPointAtE } from '../sim';
import type { Elements } from '../sim';
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
      // skip this and the dashed pass renders nothing.
      if (dashedLine) dashedLine.computeLineDistances();
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
