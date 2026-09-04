/**
 * THE BEND, BUILT IN BLENDER - the 90 degree turn, as a station compartment.
 *
 * The same room as src/env/bend in every number that matters: a quarter
 * annulus 1.9 m wide walked as fourteen flat facets, the frame album on the
 * outer wall, the ribbed tank belly on the inner, deliberately the brightest
 * room this side of the station. Geometry from tools/blender/build_bend.py,
 * light from a Cycles bake; three cream ceiling diffusers carry the room and
 * nine self-lit stills carry the album.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { SEAM, port } from '../station/ports';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'bend';

const R = 3.6;
const HALF_W = 0.95;
const R_IN = R - HALF_W;
const R_OUT = R + HALF_W;
const CEILING_Y = 2.55;
const EYE_HEIGHT = 1.74;
const SWEEP = Math.PI / 2;

const PORTS = [
  port('fore', [0, SEAM.height / 2, R], '-x', 0),
  port('aft', [R, SEAM.height / 2, 0], '-z', 0),
] as const;

const EXTENT = {
  minX: 0,
  maxX: R_OUT,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: 0,
  maxZ: R_OUT,
} as const;

/**
 * Declarations for the clash and containment tests. The ribs and album are
 * facet-aligned prisms, which no axis box honestly describes, so what is
 * declared is the room's axis-aligned furniture: the perch group and the
 * three ceiling lamp housings.
 */
const SOLIDS: readonly Solid[] = [
  solid('perch', 'trim', 0.047, 0.647, 0.5, 0.58, 2.841, 3.321),
  solid('perch-leg', 'trim', 0.297, 0.397, 0, 0.5, 3.031, 3.131),
  solid('leaning', 'trim', 0.227, 0.467, 0.582, 0.9, 3.051, 3.111),
  solid('lamp-1', 'trim', 0.32, 1.03, 2.48, CEILING_Y, 3.181, 3.891),
  solid('lamp-2', 'trim', 2.191, 2.901, 2.48, CEILING_Y, 2.191, 2.901),
  solid('lamp-3', 'trim', 3.181, 3.891, 2.48, CEILING_Y, 0.32, 1.03),
];

/** The diffusers and the album stills are their own light sources. */
const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['STILL', 0xe4d6bb],
]);

const CAP_COLOUR = 0x6b5c42;

/**
 * The floor: seventeen overlapping 0.9 m squares strung along the
 * centreline, one every sixteenth of the sweep - the same trick as the
 * legacy room, because axis-aligned rectangles cannot follow an arc any
 * other way.
 */
function bendFloor(): readonly FloorRect[] {
  const rects: FloorRect[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const theta = (SWEEP * i) / 16;
    const cx = R * Math.sin(theta);
    const cz = R * Math.cos(theta);
    rects.push({ minX: cx - 0.45, maxX: cx + 0.45, minZ: cz - 0.45, maxZ: cz + 0.45, floorY: 0 });
  }
  return rects;
}

const FLOOR = bendFloor();

const POINTS: readonly PointOfInterest[] = [
  { id: 'album', label: 'the frame album', position: [2.832, 1.34, 3.169], operable: true },
  { id: 'perch', label: 'the perch', position: [0.347, 0.58, 3.081] },
  { id: 'ribs', label: 'the tank ribs', position: [1.945, 1.2, 1.945] },
];

function buildBendBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'bend-blender';

  const visuals = bakedVisuals(STEM, SELF_LIT);
  if (visuals !== null) root.add(visuals);

  const capMeshes = new Map<string, THREE.Mesh>();
  for (const p of PORTS) {
    const cap = capPlate(
      `cap-${p.id}`,
      p.at,
      p.facing,
      p.seam.width + 0.1,
      p.seam.height + 0.06,
      CAP_COLOUR
    );
    capMeshes.set(p.id, cap);
    root.add(cap);
  }

  // The arm's light: bright, like the room.
  const hemi = new THREE.HemisphereLight(0xdcd8ce, 0x46586a, 0.9);
  root.add(hemi);

  return {
    root,
    spawn: {
      position: [R * Math.sin(SWEEP / 14), EYE_HEIGHT, R * Math.cos(SWEEP / 14)],
      yaw: -Math.PI / 2,
      pitch: 0,
    },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 52,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      const r = Math.hypot(point.x, point.z);
      return Math.min(point.y, CEILING_Y - point.y, r - R_IN, R_OUT - r, point.x, point.z);
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      return id === 'album';
    },

    update(): void {
      // Nothing moves; the album is stills.
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const BEND_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'bend',
  name: 'THE BEND',
  description: 'A 90 degree turn in fourteen flat facets, 1.9 m wide.',
  ports: PORTS,
  extent: EXTENT,
  build: buildBendBlender,
};

export const BEND_BLENDER: EnvironmentDefinition = {
  id: 'bend-blender',
  name: 'THE BEND (BLENDER)',
  description: 'The same turn, modelled in Blender and lit by Cycles.',
  build: buildBendBlender,
};

export async function readyBend(): Promise<void> {
  await ready(STEM);
}

export default BEND_BLENDER;
