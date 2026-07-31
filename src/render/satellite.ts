import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * Dimensions in scene units (Earth radii). Wildly oversized against the real
 * planet, deliberately: the satellite is a readable game piece, not a pixel.
 * The long axis is the array span, about 0.045 units tip to tip.
 */
const BUS = { x: 0.016, y: 0.011, z: 0.011 } as const;
const PANEL = { x: 0.009, y: 0.0006, z: 0.0155 } as const;
const YOKE_LENGTH = 0.002;
const NOZZLE_LENGTH = 0.003;
/**
 * Oversized against the vehicle for the same reason the vehicle is oversized
 * against the planet: the live burn is one of the game's two accent sites and
 * must read at the mission camera, where a scale plume projects to under two
 * pixels and the burn would exist only as a card annotation.
 */
const PLUME_LENGTH = 0.03;
const PLUME_RADIUS = 0.005;

/**
 * The same emissive floor earth.ts carries, for the same reason: ambient light
 * multiplies albedo and cannot floor a palette, so the night side of every
 * material adds NIGHT_SIDE instead of falling to black.
 */
function lambert(colour: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(colour),
    flatShading: true,
    emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
    emissiveIntensity: 0.62,
  });
}

/**
 * Crumpled MLI on the bus roof: a plane whose vertices are lifted by a seeded
 * LCG (same recurrence as starfield.ts - the crumple must be identical every
 * launch), so flat shading fractures one gold blanket into distinct foil
 * facets.
 */
function buildBlanket(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(BUS.x * 0.92, BUS.z * 0.92, 6, 6);

  let state = 22 >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let v = 0; v < position.count; v += 1) {
    // A base lift keeps every facet clear of the bus face it sits on.
    position.setZ(v, 0.0004 + random() * 0.0011);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, lambert(PALETTE.FOIL));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = BUS.y / 2;
  mesh.name = 'blanket';
  return mesh;
}

export function createSatellite(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'satellite';

  const bus = new THREE.Mesh(new THREE.BoxGeometry(BUS.x, BUS.y, BUS.z), lambert(PALETTE.HULL));
  bus.name = 'bus';
  group.add(bus);

  group.add(buildBlanket());

  const panelGeometry = new THREE.BoxGeometry(PANEL.x, PANEL.y, PANEL.z);
  const panelMaterial = lambert(PALETTE.ARRAY);
  const yokeGeometry = new THREE.BoxGeometry(0.0012, 0.0012, YOKE_LENGTH);
  const yokeMaterial = lambert(PALETTE.HULL_SHADOW);

  for (const side of [1, -1]) {
    const yoke = new THREE.Mesh(yokeGeometry, yokeMaterial);
    yoke.position.z = side * (BUS.z / 2 + YOKE_LENGTH / 2);
    yoke.name = side === 1 ? 'yoke-plus' : 'yoke-minus';
    group.add(yoke);

    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.z = side * (BUS.z / 2 + YOKE_LENGTH + PANEL.z / 2);
    panel.name = side === 1 ? 'array-plus' : 'array-minus';
    group.add(panel);
  }

  // Apex toward the bus, bell opening -X, the direction thrust leaves.
  const nozzle = new THREE.Mesh(
    new THREE.ConeGeometry(0.0022, NOZZLE_LENGTH, 8),
    lambert(PALETTE.HULL_SHADOW)
  );
  nozzle.rotation.z = -Math.PI / 2;
  nozzle.position.x = -(BUS.x / 2 + NOZZLE_LENGTH / 2);
  nozzle.name = 'nozzle';
  group.add(nozzle);

  // The live burn is one of the two places ACCENT is ever allowed. A flat
  // Lambert cone with an ACCENT emissive term reads as self-luminous exhaust
  // on the night side - no glow, no sprite, no light, the cone is the whole
  // effect. Hidden until setBurning(true).
  const plumeMaterial = new THREE.MeshLambertMaterial({
    color: new THREE.Color(PALETTE.ACCENT),
    flatShading: true,
    emissive: new THREE.Color(PALETTE.ACCENT),
    emissiveIntensity: 0.55,
  });
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(PLUME_RADIUS, PLUME_LENGTH, 8),
    plumeMaterial
  );
  plume.rotation.z = Math.PI / 2;
  plume.position.x = -(BUS.x / 2 + PLUME_LENGTH / 2);
  plume.name = 'nozzle-burning';
  plume.visible = false;
  group.add(plume);

  return group;
}

/**
 * While burning, the grey nozzle swaps for the ACCENT cone; on cutoff it swaps
 * straight back. Visibility toggles rather than material mutation, so the
 * accent genuinely cannot exist on screen outside a live burn.
 */
export function setBurning(group: THREE.Group, burning: boolean): void {
  const nozzle = group.getObjectByName('nozzle');
  const plume = group.getObjectByName('nozzle-burning');
  if (nozzle) nozzle.visible = !burning;
  if (plume) plume.visible = burning;
}
