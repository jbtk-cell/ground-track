/**
 * THE CROSSING, BUILT IN BLENDER - the hub, as a station compartment.
 *
 * The same room as src/env/crossing in every number that matters: 5.40 by
 * 4.20 m with no two edges alike - the ceiling climbing 2.60 to 4.40 in nine
 * facets away from the door you arrive by, the 45-degree trunk across the far
 * port corner, four ports of four kinds, the platform up to the wide high
 * door. The geometry is a .glb built by tools/blender/build_crossing.py; the
 * light is a Cycles bake off the room's two fittings, under which the nine
 * lid facets genuinely take nine values.
 *
 * THE OFFER BOARD's queue is drawn by the runtime from the shared instrument
 * kit; the .glb contributes only a hidden emissive plate.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { GALLERY_SEAM, SEAM, port } from '../station/ports';
import { sink, toGeometry } from '../kit/mesh';
import { screenPlate, textRows } from '../kit/instruments';
import { halo } from '../kit/baked/glow';
import { PALETTE } from '../../render/palette';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'crossing';

const HALF_X = 2.7;
const HALF_Z = 2.1;
const FLOOR_Y = 0;
const CEIL_LOW = 2.6;
const CEIL_HIGH = 4.4;
const EYE_HEIGHT = 1.74;

const CHAMFER = 0.9;
const CHAMFER_D = -HALF_X - HALF_Z + CHAMFER;

const PLATFORM_Y = 0.45;
const TREAD_Y = 0.225;
const RISE_X1 = -0.2;
const TREAD_Z0 = 0.25;
const PLATFORM_Z0 = 0.55;

function ceilingAt(x: number): number {
  const t = (HALF_X - x) / (2 * HALF_X);
  return CEIL_LOW + (CEIL_HIGH - CEIL_LOW) * Math.min(Math.max(t, 0), 1);
}

const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, SEAM.height / 2, -0.45], '-x', FLOOR_Y),
  port(
    'high',
    [-1.4, PLATFORM_Y + GALLERY_SEAM.height / 2, HALF_Z],
    '+z',
    PLATFORM_Y,
    GALLERY_SEAM
  ),
  port('low', [0.9, SEAM.height / 2, -HALF_Z], '-z', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.2,
  maxY: CEIL_HIGH + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_crossing.py builds from.
 */
function crossingSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  parts.push(
    solid(
      'platform',
      'frame',
      -HALF_X + 0.02,
      RISE_X1,
      FLOOR_Y,
      PLATFORM_Y,
      PLATFORM_Z0,
      HALF_Z - 0.02
    ),
    solid('tread', 'frame', -HALF_X + 0.02, RISE_X1, FLOOR_Y, TREAD_Y, TREAD_Z0, PLATFORM_Z0),
    solid(
      'nose-low',
      'trim',
      -HALF_X + 0.08,
      RISE_X1 - 0.06,
      TREAD_Y,
      TREAD_Y + 0.02,
      TREAD_Z0,
      TREAD_Z0 + 0.08
    ),
    solid(
      'nose-high',
      'trim',
      -HALF_X + 0.08,
      RISE_X1 - 0.06,
      PLATFORM_Y,
      PLATFORM_Y + 0.02,
      PLATFORM_Z0,
      PLATFORM_Z0 + 0.08
    )
  );

  parts.push(
    solid('board', 'frame', 1.32, 2.5, 0.95, 1.85, 2.0, 2.06),
    solid('board-lip', 'trim', 1.32, 2.5, 0.95, 0.99, 1.94, 2.0)
  );

  parts.push(
    solid('perch', 'trim', 1.28, 1.9, 0.5, 0.58, -2.06, -1.54),
    solid('perch-leg', 'frame', 1.32, 1.4, FLOOR_Y, 0.5, -1.7, -1.62)
  );

  const BRACKET_HALF = 0.08;
  for (const [n, t] of [0.28, 0.62].entries()) {
    const x = -HALF_X + CHAMFER * t + 0.12;
    const z = CHAMFER_D - x + 2 * BRACKET_HALF + 0.04;
    parts.push(
      solid(
        `trunk-bracket-${n}`,
        'frame',
        x - BRACKET_HALF,
        x + BRACKET_HALF,
        0.62 + n * 1.15,
        0.78 + n * 1.15,
        z - BRACKET_HALF,
        z + BRACKET_HALF
      )
    );
  }

  parts.push(
    solid('lamp-near', 'lamp', 0.7, 2.1, CEIL_LOW - 0.16, CEIL_LOW - 0.08, -0.34, 0.34),
    solid(
      'lamp-far',
      'lamp',
      -2.2,
      -0.8,
      ceilingAt(-0.8) - 0.18,
      ceilingAt(-0.8) - 0.1,
      -0.34,
      0.34
    )
  );

  parts.push(solid('strap', 'trim', 1.42, 1.5, 0.16, 0.5, -1.86, -1.82));

  return parts;
}

const SOLIDS: readonly Solid[] = crossingSolids();

const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['SCREENGLOW', 0x1b2735],
]);

const CAP_COLOUR = 0x6b5c42;

const FLOOR: readonly FloorRect[] = [
  { minX: -HALF_X + 0.08, maxX: -2.2, minZ: -1.28, maxZ: TREAD_Z0, floorY: FLOOR_Y },
  { minX: -2.2, maxX: -1.8, minZ: -1.7, maxZ: TREAD_Z0, floorY: FLOOR_Y },
  { minX: -1.8, maxX: RISE_X1, minZ: -HALF_Z + 0.08, maxZ: TREAD_Z0, floorY: FLOOR_Y },
  {
    minX: RISE_X1,
    maxX: HALF_X - 0.08,
    minZ: -HALF_Z + 0.08,
    maxZ: HALF_Z - 0.08,
    floorY: FLOOR_Y,
  },
  { minX: -HALF_X + 0.08, maxX: RISE_X1, minZ: TREAD_Z0, maxZ: PLATFORM_Z0, floorY: TREAD_Y },
  {
    minX: -HALF_X + 0.08,
    maxX: RISE_X1,
    minZ: PLATFORM_Z0,
    maxZ: HALF_Z - 0.08,
    floorY: PLATFORM_Y,
  },
];

const POINTS: readonly PointOfInterest[] = [
  { id: 'board', label: 'the situations board', position: [1.9, 1.4, 1.94], operable: true },
  { id: 'perch', label: 'the perch', position: [1.6, 0.58, -1.8] },
  { id: 'trunk', label: 'the pressure trunk', position: [-2.2, 1.3, -1.5] },
];

/** The offer queue on the board's room face (facing -z), plus a halo. */
function boardInstruments(): readonly THREE.Object3D[] {
  const target = sink();
  const panel = {
    origin: new THREE.Vector3(2.46, 1.0, 1.9985),
    right: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    width: 1.1,
    height: 0.8,
  };
  screenPlate(target, panel);
  textRows(target, panel, { rows: 9, seed: 0x0c8, inset: 0.034, fill: 0.6 });
  const rows = new THREE.Mesh(
    toGeometry(target),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  rows.name = 'crossingb-board-rows';
  return [
    rows,
    halo({
      at: [1.91, 1.4, 1.9985],
      normal: [0, 0, -1],
      width: 1.4,
      height: 1.05,
      colour: PALETTE.MINT,
      opacity: 0.2,
      proud: 0.03,
    }),
  ];
}

function buildCrossingBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'crossing-blender';

  const visuals = bakedVisuals(STEM, SELF_LIT);
  if (visuals !== null) {
    root.add(visuals);
    for (const part of boardInstruments()) root.add(part);
  }

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

  const hemi = new THREE.HemisphereLight(0xd9c9a6, 0x2a2622, 0.7);
  root.add(hemi);

  let read = 0;

  return {
    root,
    // Standing just inside the door you arrive by, facing up the room, so
    // the slope is the first thing in frame.
    spawn: { position: [1.9, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.05 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 46,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    /** A box with a sloping lid and one corner cut off, as in the legacy. */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        ceilingAt(point.x) - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z),
        (point.x + point.z - CHAMFER_D) / Math.SQRT2
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      if (id !== 'board') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Still, like the corridor either side of it: the hub is where the
      // player stops to decide, and a room that moves is a room that hurries
      // you.
      void read;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const CROSSING_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'crossing',
  name: 'THE CROSSING',
  description: 'The hub, 5.4 by 4.2 m, its ceiling climbing 2.6 to 4.4.',
  ports: PORTS,
  extent: EXTENT,
  build: buildCrossingBlender,
};

export const CROSSING_BLENDER: EnvironmentDefinition = {
  id: 'crossing-blender',
  name: 'THE CROSSING (BLENDER)',
  description: 'The same hub, modelled in Blender and lit by Cycles.',
  build: buildCrossingBlender,
};

export async function readyCrossing(): Promise<void> {
  await ready(STEM);
}

export default CROSSING_BLENDER;
