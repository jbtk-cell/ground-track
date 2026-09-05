/**
 * THE MAGAZINE, BUILT IN BLENDER - the silent room, as a station compartment.
 *
 * The same room as src/env/magazine in every number that matters: 5 m square,
 * deck at 0.45, ceiling at 5.60, the restraint frame, the tie-down grid, the
 * receiver bracket, one hanging strap. Silent - the only zero machineryHz on
 * the station - and lit by the planet and by nothing else.
 *
 * THE BEAM IS REAL. The .glb is baked with the ceiling grating genuinely open
 * and a sun standing in for the planet at the legacy room's exact fifty
 * degrees, so the barred rectangle on the far wall, the crown ledge's dark
 * step across it, and the wash it throws back into the room are physics
 * rather than the legacy room's analytic projection. The runtime closes the
 * hole with its own dark plenum panel above the bars - the same split as
 * every doorway cap: the model is honest about light, the room is airtight
 * about space.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { SEAM, port } from '../station/ports';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'magazine';

const HALF = 2.5;
const FLOOR_Y = 0.45;
const CEILING_Y = 5.6;
const EYE_HEIGHT = 1.74;

const AP_X0 = -1.2;
const AP_X1 = 0.64;
const AP_Z0 = -0.55;
const AP_Z1 = 0.55;
const BAR_PITCH = 0.2;
const BAR_T = 0.04;
const BAR_D = 0.06;
const BAR_COUNT = Math.round((AP_X1 - AP_X0 - BAR_T) / BAR_PITCH) + 1;

const FRAME_HALF_X = 1.2;
const FRAME_HALF_Z = 0.8;
const MEMBER = 0.09;
const FRAME_TOP = FLOOR_Y + 4.0;
const FRAME_MID = FLOOR_Y + 2.0;

const PORTS = [port('fore', [HALF, FLOOR_Y + SEAM.height / 2, 0], '+x', FLOOR_Y)] as const;

const EXTENT = {
  minX: -HALF - 0.086,
  maxX: HALF + 0.086,
  minY: FLOOR_Y - 0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF - 0.086,
  maxZ: HALF + 0.086,
} as const;

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_magazine.py builds from.
 */
function magazineSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  const innerX = FRAME_HALF_X - MEMBER;
  const innerZ = FRAME_HALF_Z - MEMBER;
  for (const [nx, sx] of [-1, 1].entries()) {
    for (const [nz, sz] of [-1, 1].entries()) {
      parts.push(
        solid(
          `frame-post-${nx}${nz}`,
          'frame',
          sx < 0 ? -FRAME_HALF_X : innerX,
          sx < 0 ? -innerX : FRAME_HALF_X,
          FLOOR_Y,
          FRAME_TOP,
          sz < 0 ? -FRAME_HALF_Z : innerZ,
          sz < 0 ? -innerZ : FRAME_HALF_Z
        )
      );
    }
  }
  const levels: readonly (readonly [string, number])[] = [
    ['sill', FLOOR_Y],
    ['mid', FRAME_MID],
    ['head', FRAME_TOP - MEMBER],
  ];
  for (const [name, y0] of levels) {
    for (const [n, sz] of [-1, 1].entries()) {
      parts.push(
        solid(
          `frame-${name}-long-${n}`,
          'frame',
          -innerX,
          innerX,
          y0,
          y0 + MEMBER,
          sz < 0 ? -FRAME_HALF_Z : innerZ,
          sz < 0 ? -innerZ : FRAME_HALF_Z
        )
      );
    }
    for (const [n, sx] of [-1, 1].entries()) {
      parts.push(
        solid(
          `frame-${name}-cross-${n}`,
          'frame',
          sx < 0 ? -FRAME_HALF_X : innerX,
          sx < 0 ? -innerX : FRAME_HALF_X,
          y0,
          y0 + MEMBER,
          -innerZ,
          innerZ
        )
      );
    }
  }

  for (let k = 0; k < BAR_COUNT; k += 1) {
    const x0 = AP_X0 + k * BAR_PITCH;
    parts.push(
      solid(`grate-bar-${k}`, 'shade', x0, x0 + BAR_T, CEILING_Y - BAR_D, CEILING_Y, AP_Z0, AP_Z1)
    );
  }

  parts.push(
    solid('mast-pad', 'shade', -HALF, -HALF + 0.06, 1.58, 2.32, -1.72, -1.28),
    solid('mast-collar', 'frame', -HALF + 0.06, -HALF + 0.2, 1.86, 2.04, -1.6, -1.4),
    solid('mast-stub', 'frame', -HALF + 0.08, -HALF + 0.18, 2.04, 2.66, -1.55, -1.45)
  );

  parts.push(
    solid('perch', 'frame', 1.72, 2.34, FLOOR_Y + 0.56, FLOOR_Y + 0.62, 2.1, 2.44),
    solid('perch-bracket', 'trim', 1.96, 2.1, FLOOR_Y, FLOOR_Y + 0.56, 2.3, 2.44),
    solid('perch-loop', 'frame', 1.82, 2.24, FLOOR_Y + 1.34, FLOOR_Y + 1.4, 2.42, HALF)
  );

  parts.push(solid('strap', 'trim', 1.13, 1.18, FRAME_MID + MEMBER, FRAME_TOP - MEMBER, 0.2, 0.23));

  return parts;
}

const SOLIDS: readonly Solid[] = magazineSolids();

/** Nothing in this room is its own light. The map is empty on purpose. */
const SELF_LIT = new Map<string, number>();

const CAP_COLOUR = 0x6b5c42;
/** Near-black, never pure black: the dark duct above the bars. */
const PLENUM_COLOUR = 0x0c0a08;

const FLOOR: readonly FloorRect[] = [
  { minX: -2.4, maxX: 2.4, minZ: -2.4, maxZ: 2.4, floorY: FLOOR_Y },
  { minX: 2.4, maxX: HALF, minZ: -0.55, maxZ: 0.55, floorY: FLOOR_Y },
];

const APERTURE_MID = (AP_X0 + AP_X1) / 2;
const POINTS: readonly PointOfInterest[] = [
  { id: 'probe', label: 'the receiver bracket', position: [-2.36, 1.95, -1.5], operable: true },
  { id: 'perch', label: 'the perch', position: [2.03, FLOOR_Y + 0.62, 2.3] },
  { id: 'restraint', label: 'the restraint frame', position: [0, FRAME_MID, 0] },
  { id: 'grating', label: 'the ceiling grating', position: [APERTURE_MID, CEILING_Y - 0.1, 0] },
];

function buildMagazineBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'magazine-blender';

  const visuals = bakedVisuals(STEM, SELF_LIT);
  if (visuals !== null) root.add(visuals);

  // The plenum panel: the .glb bakes with the aperture open so the planet
  // can shine through; this plate is what actually seals the hull. Above the
  // bars, wider than the opening, and dark - a duct, not a sky.
  const plenum = new THREE.Mesh(
    new THREE.BoxGeometry(AP_X1 - AP_X0 + 0.3, 0.05, AP_Z1 - AP_Z0 + 0.3),
    new THREE.MeshBasicMaterial({ color: PLENUM_COLOUR })
  );
  plenum.name = 'plenum-panel';
  plenum.position.set(APERTURE_MID, CEILING_Y + 0.035, 0);
  root.add(plenum);

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

  // The arm's light: the dimmest on the station, cool - the planet's, not a
  // fitting's.
  const hemi = new THREE.HemisphereLight(0xc4b189, 0x14110d, 0.3);
  root.add(hemi);

  let checkIns = 0;

  return {
    root,
    // Just inside the door, pitched up: the room's whole claim is the height
    // above you and the barred light on the far wall.
    spawn: { position: [2.1, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.14 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    // Zero, and the only zero on the station: silence is the room's
    // signature, and what the probe's check-in arrives into.
    machineryHz: 0,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF - Math.abs(point.x),
        HALF - Math.abs(point.z)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      if (id !== 'probe') return false;
      checkIns += 1;
      return true;
    },

    update(): void {
      // Nothing in here moves and nothing in here sounds.
      void checkIns;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const MAGAZINE_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'magazine',
  name: 'THE MAGAZINE',
  description: 'A stripped propellant magazine, 5 m square and 5.6 m to the crown. Silent.',
  ports: PORTS,
  extent: EXTENT,
  build: buildMagazineBlender,
};

export const MAGAZINE_BLENDER: EnvironmentDefinition = {
  id: 'magazine-blender',
  name: 'THE MAGAZINE (BLENDER)',
  description: 'The same silent room, modelled in Blender and lit by Cycles.',
  build: buildMagazineBlender,
};

export async function readyMagazine(): Promise<void> {
  await ready(STEM);
}

export default MAGAZINE_BLENDER;
