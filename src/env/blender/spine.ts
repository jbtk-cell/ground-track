/**
 * THE SPINE, BUILT IN BLENDER - the corridor, as a station compartment.
 *
 * The same room as src/env/spine in every number that matters: 11.2 m long,
 * 1.62 m wide, 2.24 m to the ceiling, eight identical frames, eight lamp
 * segments with dark gaps between them - the sweep that makes the corridor
 * walkable - a cable run down the port wall and a mint handrail down the
 * starboard one. The geometry is a .glb built by tools/blender/
 * build_spine.py; the light is a Cycles bake in which the segment rhythm
 * produces its pools and its grazing frame separation as physics.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { SEAM, port } from '../station/ports';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'spine';

const LENGTH = 11.2;
const HALF_LENGTH = LENGTH / 2;
const HALF_Z = 0.81;
const FLOOR_Y = 0;
const CEILING_Y = 2.24;
const EYE_HEIGHT = 1.74;
const WALK_HALF_Z = HALF_Z - 0.06;

const FRAMES = 8;
const FRAME_T = 0.09;
const FRAME_STAND = 0.055;
const LAMP_SEGMENTS = 8;
const LAMP_GAP = 0.42;
const LAMP_Y = CEILING_Y - 0.035;
const LAMP_HALF_Z = 0.062;

const PORTS = [
  port('fore', [HALF_LENGTH, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_LENGTH, SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_LENGTH,
  maxX: HALF_LENGTH,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z - 0.2,
  maxZ: HALF_Z + 0.2,
} as const;

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_spine.py builds from.
 */
function spineSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  for (let i = 0; i < FRAMES; i += 1) {
    const t = (i + 0.5) / FRAMES;
    const x0 = -HALF_LENGTH + 0.35 + t * (LENGTH - 0.7) - FRAME_T / 2;
    const x1 = x0 + FRAME_T;
    const id = `frame-${i}`;
    const inner = HALF_Z - FRAME_STAND;
    parts.push(
      solid(`${id}-port`, 'frame', x0, x1, FLOOR_Y, CEILING_Y, -HALF_Z, -inner),
      solid(`${id}-starboard`, 'frame', x0, x1, FLOOR_Y, CEILING_Y, inner, HALF_Z),
      solid(`${id}-head`, 'frame', x0, x1, CEILING_Y - FRAME_STAND, CEILING_Y, -inner, inner),
      solid(`${id}-kick`, 'trim', x0, x1, FLOOR_Y + 0.02, FLOOR_Y + 0.11, -inner, inner)
    );
  }

  for (let i = 0; i < LAMP_SEGMENTS; i += 1) {
    const span = (LENGTH - 1.0) / LAMP_SEGMENTS;
    const x0 = -HALF_LENGTH + 0.5 + i * span;
    parts.push(
      solid(
        `lamp-${i}`,
        'lamp',
        x0 + LAMP_GAP / 2,
        x0 + span - LAMP_GAP / 2,
        LAMP_Y,
        CEILING_Y - 0.004,
        -LAMP_HALF_Z,
        LAMP_HALF_Z
      )
    );
  }

  const runY = 1.52;
  parts.push(
    solid(
      'cable-run',
      'trim',
      -HALF_LENGTH + 0.4,
      HALF_LENGTH - 0.4,
      runY,
      runY + 0.045,
      -HALF_Z + 0.005,
      -HALF_Z + FRAME_STAND + 0.012
    )
  );

  const railY = 0.98;
  parts.push(
    solid(
      'handrail',
      'grip',
      -HALF_LENGTH + 0.4,
      HALF_LENGTH - 0.4,
      railY,
      railY + 0.043,
      HALF_Z - FRAME_STAND - 0.012,
      HALF_Z - 0.005
    )
  );

  return parts;
}

const SOLIDS: readonly Solid[] = spineSolids();

const SELF_LIT = new Map<string, number>([['DIFF', 0xe4d6bb]]);

const CAP_COLOUR = 0x6b5c42;

const FLOOR: readonly FloorRect[] = [
  { minX: -HALF_LENGTH, maxX: HALF_LENGTH, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: FLOOR_Y },
];

const POINTS: readonly PointOfInterest[] = [
  { id: 'run', label: 'the cable run', position: [0, 1.55, -HALF_Z + 0.05] },
];

function buildSpineBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'spine-blender';

  const visuals = bakedVisuals(STEM, SELF_LIT);
  if (visuals !== null) root.add(visuals);

  const capMeshes = new Map<string, THREE.Mesh>();
  for (const p of PORTS) {
    const cap = capPlate(
      `cap-${p.id}`,
      p.at,
      p.facing,
      p.seam.width + 0.24,
      p.seam.height + 0.12,
      CAP_COLOUR
    );
    capMeshes.set(p.id, cap);
    root.add(cap);
  }

  const hemi = new THREE.HemisphereLight(0xd9c9a6, 0x2a2622, 0.55);
  root.add(hemi);

  return {
    root,
    // Stood at the fore end looking down the run: the room's whole claim is
    // the long converging view.
    spawn: { position: [HALF_LENGTH - 0.9, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        HALF_Z - Math.abs(point.z),
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_LENGTH - Math.abs(point.x)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    update(): void {
      // Nothing in this room moves: it is the only place on the station
      // where time does not show.
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const SPINE_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'spine',
  name: 'THE SPINE',
  description: 'An 11 m connecting run, one person wide.',
  ports: PORTS,
  extent: EXTENT,
  build: buildSpineBlender,
};

export const SPINE_BLENDER: EnvironmentDefinition = {
  id: 'spine-blender',
  name: 'THE SPINE (BLENDER)',
  description: 'The same corridor, modelled in Blender and lit by Cycles.',
  build: buildSpineBlender,
};

export async function readySpine(): Promise<void> {
  await ready(STEM);
}

export default SPINE_BLENDER;
