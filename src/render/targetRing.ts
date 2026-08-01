import * as THREE from 'three';
import { TWO_PI, cross, perifocalToInertial, vec3 } from '../sim';
import type { Elements } from '../sim';
import { PALETTE } from './palette';
import { scenePointFromSim } from './units';

const SEGMENTS = 256;
/** The circle closes by repeating the first point, bit for bit. */
const POINTS = SEGMENTS + 1;

const DASH_SIZE = 0.045;
const GAP_SIZE = 0.038;

export interface TargetRing {
  readonly object: THREE.Group;
  update(elements: Elements, targetRaKm: number): void;
  setSolid(solid: boolean): void;
  setVisible(v: boolean): void;
}

function usable(el: Elements): boolean {
  return Number.isFinite(el.i) && Number.isFinite(el.raan) && Number.isFinite(el.argp);
}

/**
 * The target apoapsis as a mint hairline circle in the orbital plane, centred
 * on the planet. Dashed while the apoapsis is somewhere else; setSolid(true)
 * when it settles on. The dashed-to-solid swap is the win state, delivered as
 * geometry - no text ever announces it.
 */
export function createTargetRing(): TargetRing {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINTS * 3), 3));

  const dashedMaterial = new THREE.LineDashedMaterial({
    color: new THREE.Color(PALETTE.MINT),
    transparent: true,
    opacity: 0.5,
    dashSize: DASH_SIZE,
    gapSize: GAP_SIZE,
    depthWrite: false,
  });
  const solidMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.MINT),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  // Widened so setSolid can swap between the dashed and solid materials.
  const line: THREE.Line = new THREE.Line(geometry, dashedMaterial);
  line.name = 'target-ring';
  // The buffer starts all-zero and a stale bounding sphere would cull the
  // line; a 257-vertex circle is too cheap to be worth guarding with bounds.
  line.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'target-ring-group';
  group.add(line);

  return {
    object: group,

    update(elements: Elements, targetRaKm: number) {
      // Freshly regenerated elements or an unset target must never write NaN
      // into the buffer; keep the last good circle instead.
      if (!usable(elements) || !Number.isFinite(targetRaKm) || targetRaKm <= 0) return;

      // The sim owns the rotation convention; the ring only spans the plane.
      const toInertial = perifocalToInertial(elements);

      // Plane basis from the elements alone: the apoapsis direction, the plane
      // normal, and their cross product spanning the orbital plane.
      const apo = toInertial(vec3(-1, 0, 0));
      const normal = toInertial(vec3(0, 0, 1));
      const across = cross(normal, apo);

      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < POINTS; k += 1) {
        const theta = ((k % SEGMENTS) / SEGMENTS) * TWO_PI;
        const c = Math.cos(theta) * targetRaKm;
        const s = Math.sin(theta) * targetRaKm;
        const p = scenePointFromSim(
          vec3(c * apo.x + s * across.x, c * apo.y + s * across.y, c * apo.z + s * across.z)
        );
        position.setXYZ(k, p.x, p.y, p.z);
      }

      position.needsUpdate = true;
      // Dash placement is arc length baked into the geometry; without this the
      // dashed material renders nothing.
      line.computeLineDistances();
    },

    setSolid(solid: boolean) {
      line.material = solid ? solidMaterial : dashedMaterial;
    },

    setVisible(v: boolean) {
      group.visible = v;
    },
  };
}
