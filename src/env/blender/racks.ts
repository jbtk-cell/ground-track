/**
 * THE RACKS, BUILT IN BLENDER - the stores, as a station compartment.
 *
 * The same room as src/env/racks in every number that matters: 8.40 by
 * 3.05 m flat at 2.42, sixteen bays on the ISPR pitch down both long walls,
 * fifty drawer faces, four bays standing open with their drawers ridden out
 * into the 0.95 m aisle - the only place on the station where the building
 * makes you do anything with your body. The geometry is a .glb built by
 * tools/blender/build_racks.py; the light is a Cycles bake of the room's one
 * rule - eight identical fittings on the bay pitch and nothing else, flat,
 * even, bureaucratic.
 *
 * THE MANIFEST BOARD's rows are drawn by the runtime from the shared
 * instrument kit; the .glb contributes only a hidden emissive plate.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { SEAM, port } from '../station/ports';
import { sink, toGeometry } from '../kit/mesh';
import { screenPlate, textRows } from '../kit/instruments';
import { halo } from '../kit/baked/glow';
import { PALETTE } from '../../render/palette';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'racks';

const HALF_X = 4.2;
const HALF_Z = 1.525;
const FLOOR_Y = 0;
const CEILING_Y = 2.42;
const EYE_HEIGHT = 1.74;

const BAY_M = 1.05;
const BAYS_PER_SIDE = 8;
const BAY_GAP = 0.04;
const BAY_W = BAY_M - BAY_GAP;
const AISLE_HALF = HALF_Z - BAY_M;
const RACK_TOP = 2.05;
const PLINTH_H = 0.05;

const FACE_RELIEF = 0.055;
const FACE_Z = AISLE_HALF;
const CARCASS_Z = AISLE_HALF + FACE_RELIEF;
const CAVITY_BACK_Z = CARCASS_Z + 0.86;
const BANK_BACK_Z = HALF_Z - 0.005;

const DRAWERS = 5;
const DRAWER_H = 0.37;
const DRAWER_GAP = 0.025;
const DRAWER_W = BAY_W - 0.04;
const PULL_W = 0.32;
const LABEL_W = 0.24;
const DRAWER_OUT = 0.51;
const OPEN_DRAWER_W = 0.94;
const DRAWER_FRONT_Z = AISLE_HALF - DRAWER_OUT;

const PORT_OPEN = new Set([2, 4]);
const STARBOARD_OPEN = new Set([3, 5]);
const MANIFEST_BAY = 4;
const PERCH_BAY = 7;

const BAY_CENTRES: readonly number[] = Array.from(
  { length: BAYS_PER_SIDE },
  (_, n) => -HALF_X + BAY_M / 2 + n * BAY_M
);

const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z - 0.2,
  maxZ: HALF_Z + 0.2,
} as const;

function drawerY(k: number): readonly [number, number] {
  const y0 = PLINTH_H + DRAWER_GAP + k * (DRAWER_H + DRAWER_GAP);
  return [y0, y0 + DRAWER_H];
}

function bayBoxes(
  parts: Solid[],
  id: string,
  cx: number,
  side: -1 | 1
): (
  suffix: string,
  material: string,
  x: readonly [number, number],
  y: readonly [number, number],
  d: readonly [number, number]
) => void {
  return (suffix, material, x, y, d) => {
    const a = side * d[0];
    const b = side * d[1];
    parts.push(
      solid(
        `${id}-${suffix}`,
        material,
        cx + x[0],
        cx + x[1],
        y[0],
        y[1],
        Math.min(a, b),
        Math.max(a, b)
      )
    );
  };
}

function shutDrawer(box: ReturnType<typeof bayBoxes>, k: number): void {
  const [y0, y1] = drawerY(k);
  const mid = (y0 + y1) / 2;
  box(`d${k}-face`, 'face', [-DRAWER_W / 2, DRAWER_W / 2], [y0, y1], [FACE_Z, CARCASS_Z]);
  box(
    `d${k}-pull`,
    'pull',
    [-0.34, -0.34 + PULL_W],
    [mid - 0.015, mid + 0.015],
    [FACE_Z - 0.028, FACE_Z]
  );
  box(
    `d${k}-label`,
    'trim',
    [0.1, 0.1 + LABEL_W],
    [mid - 0.025, mid + 0.025],
    [FACE_Z - 0.006, FACE_Z]
  );
}

function openBay(box: ReturnType<typeof bayBoxes>): void {
  const half = BAY_W / 2;
  const inner = half - 0.03;
  const cavity = [CARCASS_Z, CAVITY_BACK_Z] as const;
  box('back', 'cavity', [-half, half], [PLINTH_H, RACK_TOP], [CAVITY_BACK_Z, BANK_BACK_Z]);
  box('side-a', 'cavity', [-half, -inner], [PLINTH_H, RACK_TOP], cavity);
  box('side-b', 'cavity', [inner, half], [PLINTH_H, RACK_TOP], cavity);
  box('head', 'cavity', [-inner, inner], [RACK_TOP - 0.06, RACK_TOP], cavity);
  box('shelf-lo', 'steel', [-inner, inner], [0.7, 0.73], cavity);
  box('shelf-hi', 'steel', [-inner, inner], [1.42, 1.45], cavity);
  box('stock-a', 'carcass', [-0.44, -0.14], [0.73, 0.85], [CARCASS_Z + 0.09, CARCASS_Z + 0.47]);
  box('stock-b', 'carcass', [0.02, 0.34], [0.73, 0.79], [CARCASS_Z + 0.17, CARCASS_Z + 0.75]);
  box('stock-c', 'carcass', [-0.3, 0.18], [1.45, 1.72], [CARCASS_Z + 0.07, CARCASS_Z + 0.57]);
  const [y0, y1] = drawerY(2);
  const mid = (y0 + y1) / 2;
  const out = OPEN_DRAWER_W / 2;
  box('drawer', 'face', [-out, out], [y0, y1], [DRAWER_FRONT_Z, CARCASS_Z + 0.2]);
  box(
    'drawer-pull',
    'pull',
    [-0.16, 0.16],
    [mid - 0.015, mid + 0.015],
    [DRAWER_FRONT_Z - 0.028, DRAWER_FRONT_Z]
  );
}

/** Every box the stores are made of, exactly the legacy room's list. */
function racksSolids(): readonly Solid[] {
  const parts: Solid[] = [];
  const half = BAY_W / 2;

  BAY_CENTRES.forEach((cx, n) => {
    for (const side of [-1, 1] as const) {
      const box = bayBoxes(parts, `bay-${side < 0 ? 'p' : 's'}${n}`, cx, side);
      box('plinth', 'steel', [-half, half], [FLOOR_Y, PLINTH_H], [FACE_Z, BANK_BACK_Z]);
      if (side < 0 ? PORT_OPEN.has(n) : STARBOARD_OPEN.has(n)) {
        openBay(box);
        continue;
      }
      box('carcass', 'carcass', [-half, half], [PLINTH_H, RACK_TOP], [CARCASS_Z, BANK_BACK_Z]);
      if (side > 0 && n === PERCH_BAY) {
        const face = DRAWER_W / 2;
        box('blank', 'steel', [-face, face], [PLINTH_H, RACK_TOP], [CARCASS_Z - 0.025, CARCASS_Z]);
        box('perch', 'steel', [-0.31, 0.31], [0.58, 0.62], [FACE_Z - 0.34, FACE_Z]);
        box('perch-bracket', 'trim', [-0.03, 0.03], [PLINTH_H, 0.58], [FACE_Z - 0.175, FACE_Z]);
        box('perch-loop', 'trim', [-0.21, 0.21], [1.36, 1.4], [FACE_Z - 0.06, FACE_Z]);
        continue;
      }
      if (side > 0 && n === MANIFEST_BAY) {
        for (let k = 0; k < 2; k += 1) shutDrawer(box, k);
        box('board', 'face', [-0.44, 0.44], [0.95, 1.9], [FACE_Z - 0.01, CARCASS_Z]);
        box('board-lip', 'steel', [-0.44, 0.44], [0.925, 0.95], [FACE_Z - 0.035, FACE_Z]);
        continue;
      }
      for (let k = 0; k < DRAWERS; k += 1) shutDrawer(box, k);
    }
  });

  {
    const [, top] = drawerY(2);
    const tote = bayBoxes(parts, 'stray', BAY_CENTRES[1] ?? 0, -1);
    tote('tote', 'warm', [-0.18, 0.18], [top, top + 0.24], [0.06, 0.42]);
  }

  BAY_CENTRES.forEach((cx, n) => {
    parts.push(solid(`lamp-${n}`, 'lamp', cx - 0.3, cx + 0.3, 2.36, 2.4, -0.11, 0.11));
  });

  return parts;
}

const SOLIDS: readonly Solid[] = racksSolids();

const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['SCREENGLOW', 0x1b2735],
]);

const CAP_COLOUR = 0x6b5c42;

/** The walkable aisle, cut round the four withdrawn drawers - legacy logic. */
function aisleFloor(): readonly FloorRect[] {
  const pinches = BAY_CENTRES.flatMap((cx, n) => {
    const side: -1 | 1 | 0 = PORT_OPEN.has(n) ? -1 : STARBOARD_OPEN.has(n) ? 1 : 0;
    return side === 0 ? [] : [{ x0: cx - OPEN_DRAWER_W / 2, x1: cx + OPEN_DRAWER_W / 2, side }];
  });
  pinches.sort((a, b) => a.x0 - b.x0);

  const rects: FloorRect[] = [];
  let cursor = -HALF_X;
  for (const pinch of pinches) {
    if (pinch.x0 - cursor > 1e-6) {
      rects.push({
        minX: cursor,
        maxX: pinch.x0,
        minZ: -AISLE_HALF,
        maxZ: AISLE_HALF,
        floorY: FLOOR_Y,
      });
    }
    const front = pinch.side * DRAWER_FRONT_Z;
    rects.push({
      minX: pinch.x0,
      maxX: pinch.x1,
      minZ: pinch.side > 0 ? -AISLE_HALF : front,
      maxZ: pinch.side > 0 ? front : AISLE_HALF,
      floorY: FLOOR_Y,
    });
    cursor = pinch.x1;
  }
  if (HALF_X - cursor > 1e-6) {
    rects.push({
      minX: cursor,
      maxX: HALF_X,
      minZ: -AISLE_HALF,
      maxZ: AISLE_HALF,
      floorY: FLOOR_Y,
    });
  }
  return rects;
}

const FLOOR: readonly FloorRect[] = aisleFloor();

const MANIFEST_X = BAY_CENTRES[MANIFEST_BAY] ?? 0;
const PERCH_X = BAY_CENTRES[PERCH_BAY] ?? HALF_X - BAY_M / 2;
const TOTE_X = BAY_CENTRES[1] ?? -HALF_X + BAY_M / 2;

const POINTS: readonly PointOfInterest[] = [
  {
    id: 'manifest',
    label: 'the manifest board',
    position: [MANIFEST_X, 1.42, FACE_Z - 0.02],
    operable: true,
  },
  { id: 'perch', label: 'the perch', position: [PERCH_X, 0.62, FACE_Z - 0.17] },
  { id: 'tote', label: 'the stowage tote', position: [TOTE_X, 1.35, -0.24] },
];

/** The manifest's rows on the board's aisle face (facing -z), plus a halo. */
function boardInstruments(): readonly THREE.Object3D[] {
  const target = sink();
  const panel = {
    origin: new THREE.Vector3(MANIFEST_X + 0.4, 1.0, FACE_Z - 0.0115),
    right: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    width: 0.8,
    height: 0.85,
  };
  screenPlate(target, panel);
  textRows(target, panel, { rows: 12, seed: 0x7ac, inset: 0.032, fill: 0.68 });
  const rows = new THREE.Mesh(
    toGeometry(target),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  rows.name = 'racksb-manifest-rows';
  return [
    rows,
    halo({
      at: [MANIFEST_X, 1.42, FACE_Z - 0.0115],
      normal: [0, 0, -1],
      width: 1.05,
      height: 1.1,
      colour: PALETTE.MINT,
      opacity: 0.2,
      proud: 0.03,
    }),
  ];
}

function buildRacksBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'racks-blender';

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

  // The arm's light: flat and even, like the room.
  const hemi = new THREE.HemisphereLight(0xd9c9a6, 0x2a2622, 0.75);
  root.add(hemi);

  let read = 0;

  return {
    root,
    // Just inside the fore door, on the centreline, looking the length of
    // the aisle - the room's one claim is what 8.4 m of drawer faces does to
    // a 0.95 m gap.
    spawn: { position: [3.55, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 71,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      if (id !== 'manifest') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Nothing here moves. The four open drawers have already said
      // everything this compartment has to say about somebody having been
      // here.
      void read;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const RACKS_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'racks',
  name: 'THE RACKS',
  description: 'The stores, 8.4 by 3.05 m, sixteen bays and a 0.95 m aisle.',
  ports: PORTS,
  extent: EXTENT,
  build: buildRacksBlender,
};

export const RACKS_BLENDER: EnvironmentDefinition = {
  id: 'racks-blender',
  name: 'THE RACKS (BLENDER)',
  description: 'The same stores, modelled in Blender and lit by Cycles.',
  build: buildRacksBlender,
};

export async function readyRacks(): Promise<void> {
  await ready(STEM);
}

export default RACKS_BLENDER;
