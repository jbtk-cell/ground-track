/**
 * THE CROWN, BUILT IN BLENDER - the 9.6 m shaft, as a station compartment.
 *
 * The same room as src/env/crown in every number that matters: 6.60 by 5.00 m
 * on the upper deck, three unreachable galleries, the plot table, the canted
 * six-pane aperture. The geometry is a .glb built by tools/blender/
 * build_crown.py; the light is a Cycles bake in which the panes themselves
 * are the source, so the station's one value inversion - the lightest wall at
 * the top, crossed by three dark bands - is falloff and shadow rather than
 * paint.
 *
 * THE REGIME RINGS on the table are runtime geometry, because their radii
 * derive from src/sim's live regime definitions - a map of the areas that
 * does not change when the areas do is a decoration of a map, and a .glb
 * cannot import the sim.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { GALLERY_SEAM, SEAM, port } from '../station/ports';
import { REGIMES, mapFraction } from '../../sim';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'crown';

const HALF_X = 3.3;
const HALF_Z = 2.5;
const FLOOR_Y = 0.45;
const HEIGHT = 9.6;
const CEILING_Y = FLOOR_Y + HEIGHT;
const APERTURE_RISE = 0.55;
const EYE_HEIGHT = 1.74;

const GALLERY_YS = [3.2, 5.6, 8.0] as const;
const GALLERY_W = 0.85;
const GALLERY_T = 0.12;

const TABLE_TOP = FLOOR_Y + 0.92;
const FOOT_TOP = FLOOR_Y + 0.06;

const PORTS = [
  port('fore', [HALF_X, FLOOR_Y + GALLERY_SEAM.height / 2, 0], '+x', FLOOR_Y, GALLERY_SEAM),
  port('aft', [-HALF_X, FLOOR_Y + SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: FLOOR_Y - 0.25,
  maxY: CEILING_Y + APERTURE_RISE + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

/** The regime rings: similar rectangles, radii from the sim's own regimes. */
function ringSolids(): readonly Solid[] {
  const parts: Solid[] = [];
  const INNER_M = 0.3;
  const OUTER_M = 0.86;
  const Z_RATIO = 0.72 / OUTER_M;
  for (const regime of REGIMES) {
    const r = INNER_M + (OUTER_M - INNER_M) * mapFraction(regime);
    const t = 0.035;
    const rz = r * Z_RATIO;
    const top = TABLE_TOP + 0.012;
    parts.push(
      solid(`ring-${regime.id}-a`, 'trim', -r, r, TABLE_TOP, top, -rz, -rz + t),
      solid(`ring-${regime.id}-b`, 'trim', -r, r, TABLE_TOP, top, rz - t, rz),
      solid(`ring-${regime.id}-c`, 'trim', -r, -r + t, TABLE_TOP, top, -rz + t, rz - t),
      solid(`ring-${regime.id}-d`, 'trim', r - t, r, TABLE_TOP, top, -rz + t, rz - t)
    );
  }
  return parts;
}

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_crown.py builds from - plus the rings.
 */
function crownSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  const inset = 0.06;
  for (const [n, above] of GALLERY_YS.entries()) {
    const y0 = FLOOR_Y + above;
    const y1 = y0 + GALLERY_T;
    const xa = -HALF_X + inset;
    const xb = HALF_X - inset;
    const za = -HALF_Z + inset;
    const zb = HALF_Z - inset;
    parts.push(
      solid(`gallery-${n}-port`, 'gallery', xa, xb, y0, y1, za, za + GALLERY_W),
      solid(`gallery-${n}-starboard`, 'gallery', xa, xb, y0, y1, zb - GALLERY_W, zb),
      solid(
        `gallery-${n}-aft`,
        'gallery',
        xa,
        xa + GALLERY_W,
        y0,
        y1,
        za + GALLERY_W,
        zb - GALLERY_W
      ),
      solid(
        `gallery-${n}-fore`,
        'gallery',
        xb - GALLERY_W,
        xb,
        y0,
        y1,
        za + GALLERY_W,
        zb - GALLERY_W
      )
    );
    const ri = 0.07;
    const rx0 = xa + GALLERY_W;
    const rx1 = xb - GALLERY_W;
    const rz0 = za + GALLERY_W;
    const rz1 = zb - GALLERY_W;
    const rail = y1 + 0.42;
    parts.push(
      solid(`rail-${n}-port`, 'trim', rx0, rx1, rail, rail + 0.05, rz0 - ri, rz0),
      solid(`rail-${n}-starboard`, 'trim', rx0, rx1, rail, rail + 0.05, rz1, rz1 + ri),
      solid(`rail-${n}-aft`, 'trim', rx0 - ri, rx0, rail, rail + 0.05, rz0, rz1),
      solid(`rail-${n}-fore`, 'trim', rx1, rx1 + ri, rail, rail + 0.05, rz0, rz1)
    );
  }

  parts.push(
    solid('table', 'frame', -1.05, 1.05, FOOT_TOP, TABLE_TOP, -0.8, 0.8),
    solid('table-foot', 'trim', -1.12, 1.12, FLOOR_Y, FOOT_TOP, -0.87, 0.87)
  );

  parts.push(...ringSolids());

  parts.push(
    solid('perch', 'trim', 1.5, 2.12, FLOOR_Y + 0.5, FLOOR_Y + 0.58, -2.44, -1.92),
    solid('perch-leg', 'frame', 1.54, 1.62, FLOOR_Y, FLOOR_Y + 0.5, -2.08, -2.0)
  );

  parts.push(solid('plate', 'trim', 0.24, 0.78, TABLE_TOP + 0.012, TABLE_TOP + 0.026, -0.32, 0.1));

  return parts;
}

const SOLIDS: readonly Solid[] = crownSolids();

/** The panes and the gallery cove strips: the room's authored light. */
const SELF_LIT = new Map<string, number>([
  ['PANEGLOW', 0xe4dcc4],
  ['GALCOVE', 0xe4d6bb],
]);

const CAP_COLOUR = 0x6b5c42;

const FLOOR: readonly FloorRect[] = [
  { minX: -HALF_X + 0.08, maxX: HALF_X - 0.08, minZ: -HALF_Z + 0.08, maxZ: -0.95, floorY: FLOOR_Y },
  { minX: -HALF_X + 0.08, maxX: HALF_X - 0.08, minZ: 0.95, maxZ: HALF_Z - 0.08, floorY: FLOOR_Y },
  { minX: -HALF_X + 0.08, maxX: -1.2, minZ: -0.95, maxZ: 0.95, floorY: FLOOR_Y },
  { minX: 1.2, maxX: HALF_X - 0.08, minZ: -0.95, maxZ: 0.95, floorY: FLOOR_Y },
];

const POINTS: readonly PointOfInterest[] = [
  { id: 'map', label: 'the plot table', position: [0, FLOOR_Y + 0.95, -0.86], operable: true },
  { id: 'perch', label: 'the perch', position: [1.8, FLOOR_Y + 0.58, -2.18] },
  { id: 'galleries', label: 'the galleries', position: [0, FLOOR_Y + 5.6, 0] },
];

/** The rings, drawn from the same declarations the tests check. */
function ringMesh(): THREE.Mesh {
  const boxes = ringSolids().map((part) => boxOf(part));
  const mesh = new THREE.Mesh(merged(boxes), new THREE.MeshBasicMaterial({ color: 0x2a2118 }));
  mesh.name = 'crownb-rings';
  return mesh;
}

function buildCrownBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'crown-blender';

  const visuals = bakedVisuals(STEM, SELF_LIT);
  if (visuals !== null) {
    root.add(visuals);
    root.add(ringMesh());
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

  // The arm's light: from above, like the room's.
  const hemi = new THREE.HemisphereLight(0xe4dcc4, 0x241f1a, 0.6);
  root.add(hemi);

  let pulled = 0;

  return {
    root,
    // Standing at the table, looking up the room and into the height.
    spawn: { position: [2.2, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.18 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 27,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y + APERTURE_RISE - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      if (id !== 'map') return false;
      pulled += 1;
      return true;
    },

    update(): void {
      void pulled;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const CROWN_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'crown',
  name: 'THE CROWN',
  description: 'A 9.6 m shaft with three galleries, on the upper deck.',
  ports: PORTS,
  extent: EXTENT,
  build: buildCrownBlender,
};

export const CROWN_BLENDER: EnvironmentDefinition = {
  id: 'crown-blender',
  name: 'THE CROWN (BLENDER)',
  description: 'The same shaft, modelled in Blender and lit by Cycles.',
  build: buildCrownBlender,
};

export async function readyCrown(): Promise<void> {
  await ready(STEM);
}

export default CROWN_BLENDER;
