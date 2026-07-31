import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * The limb. A slightly larger inverted shell with a Fresnel falloff, so the
 * atmosphere is a crisp arc at the edge of the planet rather than a
 * screen-space glow. There is no bloom in this project; this is the only place
 * light is allowed to look soft, and it is geometry, not a post pass.
 */
export function buildAtmosphere(radius: number, scaleFactor = 1.035): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius * scaleFactor, 96, 64);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uDayColour: { value: new THREE.Color(PALETTE.DAWN_CREAM) },
      uHorizonColour: { value: new THREE.Color(PALETTE.HIGH_FIELD) },
      uNightColour: { value: new THREE.Color(PALETTE.DEEP_FIELD) },
      uPower: { value: 2.9 },
      uIntensity: { value: 1.25 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vViewDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewDirection = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDirection;
      uniform vec3 uDayColour;
      uniform vec3 uHorizonColour;
      uniform vec3 uNightColour;
      uniform float uPower;
      uniform float uIntensity;

      varying vec3 vWorldNormal;
      varying vec3 vViewDirection;

      void main() {
        // Inverted shell: the normal faces inward, so flip it back.
        vec3 normal = -vWorldNormal;

        float rim = 1.0 - abs(dot(vViewDirection, normal));
        rim = pow(clamp(rim, 0.0, 1.0), uPower);

        // Soft terminator: the limb keeps a little colour past the day side.
        float sun = dot(normal, normalize(uSunDirection));
        float day = smoothstep(-0.35, 0.30, sun);

        vec3 colour = mix(uNightColour, uHorizonColour, day);
        colour = mix(colour, uDayColour, smoothstep(0.0, 0.75, sun) * 0.85);

        float alpha = rim * uIntensity * mix(0.22, 1.0, day);
        gl_FragColor = vec4(colour, alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'atmosphere';
  return mesh;
}

export function setAtmosphereSun(mesh: THREE.Mesh, direction: THREE.Vector3): void {
  const material = mesh.material as THREE.ShaderMaterial;
  (material.uniforms['uSunDirection']?.value as THREE.Vector3).copy(direction).normalize();
}
