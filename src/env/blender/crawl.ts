/**
 * THE CRAWL, BUILT IN BLENDER - the duct off the plot's spur, as a station
 * compartment.
 *
 * The same room as src/env/crawl in every number that matters: a 7.2 m duct
 * 1.18 m wide narrowing to 1.02, its deck climbing 0.60 in three steps to a
 * bolted blank, nothing in it operable - the room IS the traverse. What
 * changed is where the geometry and the light come from: a .glb built by
 * tools/blender/build_crawl.py and a Cycles bake, the dimmest on the station -
 * one amber lamp at the blind end, and spill through the mouth for the rest.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { SEAM, port } from '../station/ports';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'crawl';

const HALF_LENGTH = 3.6;
const CEILING_Y = 2.55;
const HALF_Z_MOUTH = 0.59;
const HALF_Z_BLIND = 0.51;
const EYE_HEIGHT = 1.74;
const WALK_HALF_Z = 0.3;

const PORTS = [port('fore', [HALF_LENGTH, SEAM.height / 2, 0], '+x', 0)] as const;

const EXTENT = {
  minX: -HALF_LENGTH,
  maxX: HALF_LENGTH,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z_MOUTH - 0.2,
  maxZ: HALF_Z_MOUTH + 0.2,
} as const;

function halfWidthAt(x: number): number {
  return HALF_Z_BLIND + ((HALF_Z_MOUTH - HALF_Z_BLIND) * (x + HALF_LENGTH)) / (2 * HALF_LENGTH);
}

function deckAt(x: number): number {
  if (x >= 1.8) return 0;
  if (x >= 0.6) return 0.2;
  if (x >= -0.6) return 0.4;
  return 0.6;
}

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_crawl.py builds from - the duct, the trunk,
 * the stowage, the perch loop: the boxes with clear air on every side.
 */
const SOLIDS: readonly Solid[] = [
  solid('duct', 'frame', -3.5, -2.62, 2.14, 2.42, 0.09, 0.37),
  solid('duct-collar', 'frame', -3.53, -3.4, 2.1, 2.46, 0.05, 0.41),
  solid('lh-blind', 'trim', -2.92, -2.6, 2.49, CEILING_Y, -0.26, 0.02),
  solid('lh-mid', 'trim', 0.76, 1.08, 2.49, CEILING_Y, -0.2, 0.08),
  // The trunk's proud half only: its root is buried in the recessed work
  // face, outside the datum hull that contains() measures against.
  solid('trunk-3', 'frame', -0.545, 0.545, 1.88, 2.05, -0.54, -0.421),
  solid('stow-5', 'soft', 0.94, 1.42, 0.32, 0.8, 0.3404, 0.5404),
  solid('perch-loop', 'trim', 2.4, 2.82, 1.36, 1.4, 0.4667, 0.5067),
  solid('perch-bracket', 'trim', 2.55, 2.67, 0.28, 0.62, 0.3383, 0.5583),
];

/** The blind-end amber pool and the mid-run cream diffuser. */
const SELF_LIT = new Map<string, number>([
  ['AMBER', 0xc9a063],
  ['DIMDIFF', 0xe4d6bb],
  ['STRIP', 0xd9cbb1],
]);

const CAP_COLOUR = 0x6b5c42;

const FLOOR: readonly FloorRect[] = [
  { minX: 1.8, maxX: HALF_LENGTH, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: 0 },
  { minX: 0.6, maxX: 1.8, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: 0.2 },
  { minX: -0.6, maxX: 0.6, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: 0.4 },
  { minX: -3.5, maxX: -0.6, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: 0.6 },
];

const POINTS: readonly PointOfInterest[] = [
  { id: 'perch', label: 'the perch', position: [2.61, 0.72, 0.42] },
  { id: 'trunk', label: 'the cable run', position: [-1.2, 1.96, -0.4] },
  { id: 'blank', label: 'the blank flange', position: [-3.42, 1.35, 0] },
  { id: 'loose-bag', label: 'a stowage bag, unclipped', position: [0.3, 0.56, 0.05] },
];

function buildCrawlBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'crawl-blender';

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

  // The arm's light, tuned down: this is the dim room.
  const hemi = new THREE.HemisphereLight(0xa89a80, 0x1c1814, 0.4);
  root.add(hemi);

  return {
    root,
    spawn: { position: [3.1, EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.06 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 33,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - deckAt(point.x),
        CEILING_Y - point.y,
        halfWidthAt(point.x) - Math.abs(point.z),
        HALF_LENGTH - Math.abs(point.x)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    update(): void {
      // Nothing moves. The room's entire content is the traverse.
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const CRAWL_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'crawl',
  name: 'THE CRAWL',
  description: 'A 7.2 m duct, 1.18 narrowing to 1.02, its deck climbing 0.60 in three steps.',
  ports: PORTS,
  extent: EXTENT,
  build: buildCrawlBlender,
};

export const CRAWL_BLENDER: EnvironmentDefinition = {
  id: 'crawl-blender',
  name: 'THE CRAWL (BLENDER)',
  description: 'The same duct, modelled in Blender and lit by Cycles.',
  build: buildCrawlBlender,
};

export async function readyCrawl(): Promise<void> {
  await ready(STEM);
}

export default CRAWL_BLENDER;
