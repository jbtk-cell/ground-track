/**
 * THE GANTRY, BUILT IN BLENDER - the propellant column, as a station
 * compartment.
 *
 * The same room as src/env/gantry in every number that matters: twenty-four
 * tanks on the two-metre grid, 11.0 by 7.6 m under a 2.15 m lid with the
 * entry bay coffered to 2.50, one tank off its saddle in the cross-aisle. The
 * geometry is a .glb built by tools/blender/build_gantry.py and the light is
 * a Cycles bake of the room's one inviolable rule - lit from twelve fittings
 * at knee height and from nowhere else, so the tanks are bright-footed, the
 * deck is the lightest large surface and the lid is the darkest.
 *
 * THE TRANSFER BOARD's column is drawn by the runtime from the same
 * instrument kit as every screen on the station; the .glb contributes only a
 * hidden emissive plate so the bake receives the board's light.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { GALLERY_SEAM, SEAM, SEAM_INSET_M, port } from '../station/ports';
import { sink, toGeometry } from '../kit/mesh';
import { barGraph, screenPlate } from '../kit/instruments';
import { halo } from '../kit/baked/glow';
import { PALETTE } from '../../render/palette';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'gantry';

const HALF_X = 5.5;
const HALF_Z = 3.8;
const FLOOR_Y = 0;
const CEILING_Y = 2.15;
const COFFER_Y = 2.5;
const COFFER_X0 = 4.4;
const COFFER_HALF_Z = 1.44;
const EYE_HEIGHT = 1.74;

const TANK_X = [-5, -3, -1, 1, 3, 5] as const;
const TANK_Z = [-3, -1, 1, 3] as const;
const TANK_H = 1.55;
const SADDLE_H = 0.14;
const CAP_H = 0.11;
const KEEP = 0.44;
const STRAY_Z = 1;
const STRAY_X = 2;

const LAMP_Z = 2;
const LAMP_KEEP = 0.16;
const PIPE_Y0 = 1.95;
const PIPE_Y1 = 2.1;
const PIPE_HALF = 0.08;
const RUN_X = HALF_X - SEAM_INSET_M;

const WALK_X1 = 5 + KEEP;
const WALK_Z1 = HALF_Z - 0.08;

const PORTS = [
  port('fore', [HALF_X, GALLERY_SEAM.height / 2, 0], '+x', FLOOR_Y, GALLERY_SEAM),
  port('aft', [-HALF_X, SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.25,
  maxY: COFFER_Y + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

function ceilingAt(x: number, z: number): number {
  return x >= COFFER_X0 && Math.abs(z) <= COFFER_HALF_Z ? COFFER_Y : CEILING_Y;
}

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_gantry.py builds from: cradles, overhead
 * runs, drops, uplights, the perch and the board - the boxes with clear air
 * round them. The board is declared to its legacy 5.496 face although the
 * model butts deeper, for the same reason the sill's bank is.
 */
function gantrySolids(): readonly Solid[] {
  const parts: Solid[] = [];
  for (const x of TANK_X) {
    for (const z of TANK_Z) {
      for (const [n, side] of [-1, 1].entries()) {
        parts.push(
          solid(
            `cradle-${x}-${z}-${n}`,
            'frame',
            x - 0.26,
            x + 0.26,
            FLOOR_Y,
            FLOOR_Y + SADDLE_H,
            z + side * 0.16,
            z + side * 0.28
          )
        );
      }
    }
  }
  for (const [n, z] of TANK_Z.entries()) {
    parts.push(
      solid(`run-${n}`, 'pipe', -RUN_X, RUN_X, PIPE_Y0, PIPE_Y1, z - PIPE_HALF, z + PIPE_HALF)
    );
  }
  for (const x of TANK_X) {
    for (const z of TANK_Z) {
      parts.push(
        solid(
          `drop-${x}-${z}`,
          'pipe',
          x - 0.035,
          x + 0.035,
          FLOOR_Y + SADDLE_H + TANK_H + CAP_H,
          PIPE_Y0,
          z - 0.035,
          z + 0.035
        )
      );
    }
  }
  for (const x of TANK_X) {
    for (const side of [-1, 1] as const) {
      const z = side * LAMP_Z;
      parts.push(
        solid(
          `uplight-pan-${x}-${side}`,
          'frame',
          x - 0.06,
          x + 0.06,
          FLOOR_Y,
          FLOOR_Y + 0.22,
          z - 0.06,
          z + 0.06
        ),
        solid(
          `uplight-${x}-${side}`,
          'lamp',
          x - 0.1,
          x + 0.1,
          FLOOR_Y + 0.22,
          FLOOR_Y + 0.34,
          z - 0.1,
          z + 0.1
        )
      );
    }
  }
  parts.push(
    solid('perch', 'trim', 4.976, 5.496, 0.5, 0.58, 1.55, 2.17),
    solid('perch-leg', 'frame', 5.4, 5.48, FLOOR_Y, 0.5, 1.82, 1.9),
    solid('board', 'frame', 5.396, 5.496, 1.0, 1.52, -2.17, -1.55),
    solid('board-shelf', 'trim', 5.3, 5.4, 0.96, 1.0, -2.13, -1.59)
  );
  return parts;
}

const SOLIDS: readonly Solid[] = gantrySolids();

/** The twelve uplight heads and the board's bake plate. */
const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['SCREENGLOW', 0x1b2735],
]);

const CAP_COLOUR = 0x6b5c42;

/**
 * The deck minus the twenty-four tanks standing on it, exactly the legacy
 * room's lattice: bands across the room in z with the occupied pieces cut
 * out, which is the one construction that cannot double-count.
 */
function floorPlan(): readonly FloorRect[] {
  const rects: FloorRect[] = [];
  const band = (z0: number, z1: number, blocks: readonly (readonly [number, number])[]): void => {
    let x = -WALK_X1;
    for (const [b0, b1] of [...blocks].sort((p, q) => p[0] - q[0])) {
      if (b0 > x) rects.push({ minX: x, maxX: b0, minZ: z0, maxZ: z1, floorY: FLOOR_Y });
      x = Math.max(x, b1);
    }
    if (x < WALK_X1) rects.push({ minX: x, maxX: WALK_X1, minZ: z0, maxZ: z1, floorY: FLOOR_Y });
  };

  const lamps = TANK_X.map((x) => [x - LAMP_KEEP, x + LAMP_KEEP] as const);
  const tanks = TANK_X.map((x) => [x - KEEP, x + KEEP] as const);

  const aisle = (z0: number, z1: number): void => {
    const mid = (z0 + z1) / 2;
    if (Math.abs(Math.abs(mid) - LAMP_Z) > 1e-6) {
      band(z0, z1, []);
      return;
    }
    band(z0, mid - LAMP_KEEP, []);
    band(mid - LAMP_KEEP, mid + LAMP_KEEP, lamps);
    band(mid + LAMP_KEEP, z1, []);
  };

  let z0 = -WALK_Z1;
  for (const z of TANK_Z) {
    aisle(z0, z - KEEP);
    const blocks: (readonly [number, number])[] = [...tanks];
    if (z === STRAY_Z) blocks.push([STRAY_X - 1 + KEEP, STRAY_X + 1 - KEEP]);
    band(z - KEEP, z + KEEP, blocks);
    z0 = z + KEEP;
  }
  aisle(z0, WALK_Z1);
  return rects;
}

const FLOOR: readonly FloorRect[] = floorPlan();

const POINTS: readonly PointOfInterest[] = [
  {
    id: 'propellant',
    label: 'the transfer board',
    position: [5.34, 1.26, -1.86],
    operable: true,
  },
  { id: 'perch', label: 'the perch', position: [5.2, 0.58, 1.86] },
  { id: 'stray', label: 'the tank off its saddle', position: [STRAY_X, 0.9, STRAY_Z] },
  { id: 'farm', label: 'the tank farm', position: [0, 0.9, 0] },
];

/**
 * The transfer board's drawn content: the propellant column as a bar graph on
 * the board's aisle face (facing -x), plus one mint halo. Same kit, same
 * lifts as every screen on the station.
 */
function boardInstruments(): readonly THREE.Object3D[] {
  const target = sink();
  // right x up must give the OUTWARD normal (-x, toward the aisle); with
  // right at -z the lifts push content into the wall and the plate buries
  // its own bars - found as a blue screen with nothing on it.
  const panel = {
    origin: new THREE.Vector3(5.396, 1.04, -2.13),
    right: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    width: 0.54,
    height: 0.44,
  };
  screenPlate(target, panel);
  barGraph(target, panel, { bars: 8, seed: 0x0d7, inset: 0.03 });
  const column = new THREE.Mesh(
    toGeometry(target),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  column.name = 'gantryb-board-column';
  return [
    column,
    halo({
      at: [5.396, 1.26, -1.86],
      normal: [-1, 0, 0],
      width: 0.8,
      height: 0.62,
      colour: PALETTE.MINT,
      opacity: 0.22,
      proud: 0.03,
    }),
  ];
}

function buildGantryBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'gantry-blender';

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
      // Wider margins than the first three Blender rooms: the wide door plus
      // an oblique pose let a grazing sightline slip past a 0.05 m margin at
      // 0.03 m of inset - found as 548 pixels of space in gantryb-board.
      p.seam.width + 0.24,
      p.seam.height + 0.12,
      CAP_COLOUR
    );
    capMeshes.set(p.id, cap);
    root.add(cap);
  }

  // The arm's light, inverted like the room: the bright hemisphere is the
  // one underneath.
  const hemi = new THREE.HemisphereLight(0x241f1a, 0xd9c9a6, 0.5);
  root.add(hemi);

  let read = 0;

  return {
    root,
    // One pace inside the wide opening, looking down the central aisle: a
    // forest, receding, with the light coming up between the trunks.
    spawn: { position: [4.8, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: -0.02 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 88,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    /** A flat box with one raised bay over the entry; hull and liner agree. */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        ceilingAt(point.x, point.z) - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      if (id !== 'propellant') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Still. A tank farm is a place where nothing has happened for a long
      // time, and the only thing in here that moves is the player.
      void read;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const GANTRY_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'gantry',
  name: 'THE GANTRY',
  description: 'Twenty-four propellant tanks, 11.0 by 7.6 m, lit from the deck up.',
  ports: PORTS,
  extent: EXTENT,
  build: buildGantryBlender,
};

export const GANTRY_BLENDER: EnvironmentDefinition = {
  id: 'gantry-blender',
  name: 'THE GANTRY (BLENDER)',
  description: 'The same tank farm, modelled in Blender and lit by Cycles.',
  build: buildGantryBlender,
};

export async function readyGantry(): Promise<void> {
  await ready(STEM);
}

export default GANTRY_BLENDER;
