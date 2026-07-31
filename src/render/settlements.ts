import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * Warm pinpricks on the night side. They exist so the dark half of the planet
 * is inhabited rather than empty, and they fade out through the terminator so
 * nothing glows in daylight.
 */
export function buildSettlements(
  landPoints: Float32Array,
  radius: number,
  keepEvery = 6
): THREE.Points {
  const kept: number[] = [];
  for (let i = 0; i < landPoints.length; i += 3) {
    if ((i / 3) % keepEvery !== 0) continue;
    const x = landPoints[i] ?? 0;
    const y = landPoints[i + 1] ?? 0;
    const z = landPoints[i + 2] ?? 0;
    kept.push(x * radius, y * radius, z * radius);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(kept), 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uColour: { value: new THREE.Color(PALETTE.SETTLEMENT) },
      uSize: { value: 2.0 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uSunDirection;
      uniform float uSize;
      varying float vNight;

      void main() {
        vec3 surfaceNormal = normalize(position);
        float sun = dot(surfaceNormal, normalize(uSunDirection));
        // Full brightness well into the dark side, out before local sunrise.
        vNight = 1.0 - smoothstep(-0.28, 0.02, sun);

        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = uSize;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      varying float vNight;

      void main() {
        if (vNight <= 0.01) discard;
        gl_FragColor = vec4(uColour, vNight * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'settlements';
  return points;
}

export function setSettlementSun(points: THREE.Points, direction: THREE.Vector3): void {
  const material = points.material as THREE.ShaderMaterial;
  (material.uniforms['uSunDirection']?.value as THREE.Vector3).copy(direction).normalize();
}
