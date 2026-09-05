/**
 * THE SILL, BUILT IN BLENDER - the salvage register, as a station compartment.
 *
 * The same room as src/env/sill in every number that matters: 6.00 by 4.00 m
 * under a flat 3.00 m lid, over a 3.40 by 2.40 m sump 4.50 m deep with the
 * collection on the old pump foundations and no way down. What changed is
 * where the geometry and the light come from: a .glb built by
 * tools/blender/build_sill.py and a Cycles bake whose value structure is
 * plan-wise - two cream coves over the two walking lines, nothing over the
 * grating, and the station's only below-your-feet lamp warm in the sump.
 *
 * THE REGISTER'S ROWS are drawn by the runtime from the same instrument kit
 * as every console on the station (src/env/kit/instruments); the .glb
 * contributes only a hidden emissive plate so the bake receives the screen's
 * light - the plot's shared-screens contract, applied to a one-plate room.
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

const STEM = 'sill';

const HALF_X = 3.0;
const HALF_Z = 2.0;
const FLOOR_Y = 0;
const CEILING_Y = 3.0;
const EYE_HEIGHT = 1.74;

const OPEN_HALF_X = 1.5;
const OPEN_HALF_Z = 0.8;
const KERB_W = 0.1;
const KERB_H = 0.14;
const KERB_X = OPEN_HALF_X + KERB_W;
const KERB_Z = OPEN_HALF_Z + KERB_W;

const SUMP_HALF_X = 1.7;
const SUMP_HALF_Z = 1.2;
const SUMP_FLOOR_Y = -4.5;

const WALL_STANDOFF = 0.1;

const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, GALLERY_SEAM.height / 2, 0], '-x', FLOOR_Y, GALLERY_SEAM),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: SUMP_FLOOR_Y - 0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z - 0.2,
  maxZ: HALF_Z + 0.2,
} as const;

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_sill.py builds from. The bank is declared to
 * the 2.00 m hull line although the model butts it against the recessed work
 * face - a declared corner outside the datum hull fails containment, exactly
 * the crawl trunk's lesson.
 */
const SOLIDS: readonly Solid[] = [
  solid('kerb-port', 'steel', -KERB_X, KERB_X, FLOOR_Y, KERB_H, -KERB_Z, -OPEN_HALF_Z),
  solid('kerb-starboard', 'steel', -KERB_X, KERB_X, FLOOR_Y, KERB_H, OPEN_HALF_Z, KERB_Z),
  solid('kerb-fore', 'steel', OPEN_HALF_X, KERB_X, FLOOR_Y, KERB_H, -OPEN_HALF_Z, OPEN_HALF_Z),
  solid('kerb-aft', 'steel', -KERB_X, -OPEN_HALF_X, FLOOR_Y, KERB_H, -OPEN_HALF_Z, OPEN_HALF_Z),
  solid('rail-port-bar', 'trim', -1.48, 1.48, 1.02, 1.08, -0.895, -0.805),
  solid('rail-starboard-bar', 'trim', -1.48, 1.48, 1.02, 1.08, 0.805, 0.895),
  solid('register', 'steel', -0.45, 0.45, 0.84, 1.28, -0.94, -0.895),
  solid('tray', 'trim', 0.34, 0.78, KERB_H, 0.2, 0.7, 0.92),
  solid('perch', 'trim', 2.1, 2.72, 0.5, 0.58, 1.42, 1.94),
  solid('bank', 'steel', -1.2, 1.2, 0.95, 2.05, 1.9, 2.0),
  solid('cove-port', 'steel', -2.6, 2.6, 2.86, CEILING_Y, -1.78, -1.62),
  solid('cove-starboard', 'steel', -2.6, 2.6, 2.86, CEILING_Y, 1.62, 1.78),
  solid('frame-stage', 'salvage', -1.3, 1.3, -3.53, -3.09, -0.3, 0.3),
  solid('frame-bird', 'salvage', -0.7, 0.1, SUMP_FLOOR_Y, -4.1, 0.62, 1.06),
  solid('frame-cube', 'salvage', 0.55, 0.83, SUMP_FLOOR_Y, -4.22, -1.02, -0.74),
];

/** The coves, the sump lamp, and the register's bake plate. */
const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['AMBER', 0xc9a063],
  ['SCREENGLOW', 0x1b2735],
]);

const CAP_COLOUR = 0x6b5c42;

/**
 * A ring of deck and the grating across the middle of it: the bars carry you,
 * exactly as the legacy room settled it, so the route through is a choice -
 * straight out over the drop, or round the side of it.
 */
const FLOOR: readonly FloorRect[] = [
  {
    minX: KERB_X,
    maxX: HALF_X - WALL_STANDOFF,
    minZ: -HALF_Z + WALL_STANDOFF,
    maxZ: HALF_Z - WALL_STANDOFF,
    floorY: FLOOR_Y,
  },
  {
    minX: -HALF_X + WALL_STANDOFF,
    maxX: -KERB_X,
    minZ: -HALF_Z + WALL_STANDOFF,
    maxZ: HALF_Z - WALL_STANDOFF,
    floorY: FLOOR_Y,
  },
  { minX: -KERB_X, maxX: KERB_X, minZ: KERB_Z, maxZ: HALF_Z - WALL_STANDOFF, floorY: FLOOR_Y },
  { minX: -KERB_X, maxX: KERB_X, minZ: -HALF_Z + WALL_STANDOFF, maxZ: -KERB_Z, floorY: FLOOR_Y },
  { minX: -KERB_X, maxX: KERB_X, minZ: -OPEN_HALF_Z, maxZ: OPEN_HALF_Z, floorY: FLOOR_Y },
];

const POINTS: readonly PointOfInterest[] = [
  { id: 'salvage', label: 'the salvage register', position: [0, 1.06, -0.95], operable: true },
  { id: 'perch', label: 'the perch', position: [2.41, 0.58, 1.68] },
  { id: 'sump', label: 'the sump', position: [0, -3.3, 0] },
  { id: 'bank', label: 'the pump controls', position: [0, 1.5, 1.88] },
];

/**
 * The register's drawn content: rows of names on the plate's walkway face
 * (facing -z, read from the port aisle), plus one mint halo. Same kit, same
 * lifts as every screen on the station.
 */
function registerInstruments(): readonly THREE.Object3D[] {
  const target = sink();
  const panel = {
    origin: new THREE.Vector3(0.41, 0.88, -0.94),
    right: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    width: 0.82,
    height: 0.36,
  };
  screenPlate(target, panel);
  textRows(target, panel, { rows: 7, seed: 0x5c1, inset: 0.03, fill: 0.62 });
  const rows = new THREE.Mesh(
    toGeometry(target),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  rows.name = 'sillb-register-rows';
  return [
    rows,
    halo({
      at: [0, 1.06, -0.94],
      normal: [0, 0, -1],
      width: 1.1,
      height: 0.55,
      colour: PALETTE.MINT,
      opacity: 0.22,
      proud: 0.03,
    }),
  ];
}

function buildSillBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'sill-blender';

  const visuals = bakedVisuals(STEM, SELF_LIT);
  if (visuals !== null) {
    root.add(visuals);
    for (const part of registerInstruments()) root.add(part);
  }

  const capMeshes = new Map<string, THREE.Mesh>();
  for (const p of PORTS) {
    const cap = capPlate(
      `cap-${p.id}`,
      p.at,
      p.facing,
      // Wide margins, as in the gantry: a gallery door plus an oblique pose
      // can slip a grazing sightline past a 0.05 m margin at 0.03 m of inset.
      p.seam.width + 0.24,
      p.seam.height + 0.12,
      CAP_COLOUR
    );
    capMeshes.set(p.id, cap);
    root.add(cap);
  }

  // The arm's light: dimmer than the flight deck, warmer than the crawl.
  const hemi = new THREE.HemisphereLight(0xd9c9a6, 0x241f1a, 0.55);
  root.add(hemi);

  let read = 0;

  return {
    root,
    // Just inside the fore door, square to the room, eye tipped down far
    // enough that the dark rectangle in the floor is in frame from the first
    // instant and the depth of it is not.
    spawn: { position: [2.6, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: -0.12 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 64,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    /**
     * Two boxes, one under the other - a `max`, not a `min`: a point is
     * inside if it is inside EITHER the room or the sump hung beneath it.
     */
    contains(point: THREE.Vector3): number {
      const above = Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
      const below = Math.min(
        FLOOR_Y - point.y,
        point.y - SUMP_FLOOR_Y,
        SUMP_HALF_X - Math.abs(point.x),
        SUMP_HALF_Z - Math.abs(point.z)
      );
      return Math.max(above, below);
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      if (id !== 'salvage') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Nothing in this room moves, and the frames below least of all: the
      // collection is waiting on the player, not on a clock.
      void read;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const SILL_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'sill',
  name: 'THE SILL',
  description: 'The salvage register, 6 by 4 m over a lit 4.5 m sump.',
  ports: PORTS,
  extent: EXTENT,
  build: buildSillBlender,
};

export const SILL_BLENDER: EnvironmentDefinition = {
  id: 'sill-blender',
  name: 'THE SILL (BLENDER)',
  description: 'The same register room, modelled in Blender and lit by Cycles.',
  build: buildSillBlender,
};

export async function readySill(): Promise<void> {
  await ready(STEM);
}

export default SILL_BLENDER;
