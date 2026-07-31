import * as THREE from 'three';
import { STAR_RAMP } from './palette';

/**
 * Stars as hard square points. gl.POINTS with no texture renders a solid quad,
 * which is exactly the look wanted, and they never twinkle: twinkle is an
 * atmospheric artifact and there is no atmosphere out here.
 */
export function buildStarfield(count: number, radius: number, seed = 5): THREE.Group {
  const group = new THREE.Group();
  group.name = 'starfield';

  // Two sets so there are genuinely two pixel sizes rather than one blurred one.
  const tiers = [
    { fraction: 0.78, size: 1, opacity: 0.7 },
    { fraction: 0.22, size: 2, opacity: 0.95 },
  ];

  let state = seed >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const ramp = STAR_RAMP.map((hex) => new THREE.Color(hex));

  for (const tier of tiers) {
    const tierCount = Math.max(1, Math.round(count * tier.fraction));
    const positions = new Float32Array(tierCount * 3);
    const colours = new Float32Array(tierCount * 3);

    for (let i = 0; i < tierCount; i += 1) {
      // Uniform on the sphere: cosine-distributed z avoids polar clustering.
      const z = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);

      positions[i * 3] = r * Math.cos(theta) * radius;
      positions[i * 3 + 1] = r * Math.sin(theta) * radius;
      positions[i * 3 + 2] = z * radius;

      const colour = ramp[Math.floor(random() * ramp.length)] ?? ramp[2];
      const dim = 0.65 + random() * 0.35;
      colours[i * 3] = (colour?.r ?? 1) * dim;
      colours[i * 3 + 1] = (colour?.g ?? 1) * dim;
      colours[i * 3 + 2] = (colour?.b ?? 1) * dim;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

    const material = new THREE.PointsMaterial({
      size: tier.size,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: tier.opacity,
      depthWrite: false,
    });

    group.add(new THREE.Points(geometry, material));
  }

  return group;
}
