/**
 * THE BERTH, BUILT IN BLENDER - the resupply drum, as a station compartment.
 *
 * The same room as src/env/berth in every number that matters: a regular
 * octagon 4.8 m across the flats under a 3.4 m lid, one doorway, the only
 * round hatch aboard shut in the far facet, sixty-three tie-down sockets and
 * eleven worn haloes, and nothing in the middle at all. The geometry is a
 * .glb built by tools/blender/build_berth.py; the light is a Cycles bake of
 * the plainest rig in the game - four cream fittings in a cornice ring, which
 * on eight facets at eight angles still yields eight distinct values.
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

const STEM = 'berth';

const A = 2.4;
const FACETS = 8;
const FLOOR_Y = 0;
const CEILING_Y = 3.4;
const EYE_HEIGHT = 1.74;
const WALL_STANDOFF = 0.12;

const HATCH_R = 0.575;
const HATCH_Y = 1.28;
const DOGS = 8;

const SOCKET_PITCH = 0.6;
const SOCKET_HALF = 0.055;
const WORN = new Set([
  '-1,0',
  '0,0',
  '1,0',
  '2,0',
  '-1,1',
  '0,1',
  '1,-1',
  '0,-1',
  '-2,0',
  '0,2',
  '0,-2',
]);

const PORTS = [port('fore', [A, SEAM.height / 2, 0], '+x', FLOOR_Y)] as const;

const EXTENT = {
  minX: -A - 0.2,
  maxX: A,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -A - 0.2,
  maxZ: A + 0.2,
} as const;

function normalOf(k: number): THREE.Vector3 {
  const theta = (k / FACETS) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
}

function onFacet(k: number, s: number, y: number, out = A): THREE.Vector3 {
  const n = normalOf(k);
  return new THREE.Vector3(n.x * out - n.z * s, y, n.z * out + n.x * s);
}

function insideDrum(x: number, z: number, margin: number): boolean {
  for (let k = 0; k < FACETS; k += 1) {
    const n = normalOf(k);
    if (x * n.x + z * n.z > A - margin) return false;
  }
  return true;
}

/**
 * Declarations for the clash and containment tests, from the same plan
 * constants tools/blender/build_berth.py builds from.
 */
function berthSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  const reach = Math.floor((A - 0.35) / SOCKET_PITCH);
  for (let i = -reach; i <= reach; i += 1) {
    for (let j = -reach; j <= reach; j += 1) {
      const x = i * SOCKET_PITCH;
      const z = j * SOCKET_PITCH;
      if (!insideDrum(x, z, 0.34)) continue;
      if (WORN.has(`${i},${j}`)) {
        const h = SOCKET_HALF * 2.4;
        parts.push(
          solid(
            `halo-${i}-${j}`,
            'wear',
            x - h,
            x + h,
            FLOOR_Y + 0.001,
            FLOOR_Y + 0.008,
            z - h,
            z + h
          )
        );
      }
      parts.push(
        solid(
          `socket-${i}-${j}`,
          'socket',
          x - SOCKET_HALF,
          x + SOCKET_HALF,
          FLOOR_Y + 0.006,
          FLOOR_Y + 0.026,
          z - SOCKET_HALF,
          z + SOCKET_HALF
        )
      );
    }
  }

  for (let d = 0; d < DOGS; d += 1) {
    const phi = (d / DOGS) * Math.PI * 2 + Math.PI / DOGS;
    const s = Math.sin(phi) * (HATCH_R + 0.16);
    const y = HATCH_Y + Math.cos(phi) * (HATCH_R + 0.16);
    const p = onFacet(4, s, y, A - 0.11);
    parts.push(
      solid(`dog-${d}`, 'trim', p.x - 0.05, p.x + 0.05, y - 0.05, y + 0.05, p.z - 0.07, p.z + 0.07)
    );
  }

  for (const [n, k] of [3, 5].entries()) {
    const foot = onFacet(k, 0, 0, A - 0.34);
    parts.push(
      solid(
        `stanchion-${n}`,
        'frame',
        foot.x - 0.055,
        foot.x + 0.055,
        FLOOR_Y,
        1.06,
        foot.z - 0.055,
        foot.z + 0.055
      ),
      solid(
        `cleat-${n}`,
        'trim',
        foot.x - 0.11,
        foot.x + 0.11,
        0.86,
        0.94,
        foot.z - 0.11,
        foot.z + 0.11
      )
    );
    if (n === 0) {
      parts.push(
        solid(
          'strap',
          'webbing',
          foot.x - 0.03,
          foot.x + 0.03,
          0.31,
          0.9,
          foot.z - 0.075,
          foot.z + 0.075
        )
      );
    }
  }

  const netAt = onFacet(6, 0, 0, A - 0.22);
  parts.push(
    solid(
      'net-roll',
      'webbing',
      netAt.x - 0.62,
      netAt.x + 0.62,
      0.42,
      0.72,
      netAt.z - 0.16,
      netAt.z + 0.16
    ),
    solid(
      'net-cradle',
      'frame',
      netAt.x - 0.68,
      netAt.x + 0.68,
      0.32,
      0.42,
      netAt.z - 0.2,
      netAt.z + 0.2
    )
  );

  parts.push(
    solid('board', 'frame', -0.46, 0.46, 1.12, 1.72, A - 0.2, A - 0.08),
    solid('board-face', 'panel', -0.4, 0.4, 1.18, 1.66, A - 0.21, A - 0.13)
  );

  parts.push(
    solid('cornice-fore', 'lamp', A - 0.26, A - 0.1, CEILING_Y - 0.14, CEILING_Y, -0.9, 0.9),
    solid('cornice-aft', 'lamp', -A + 0.1, -A + 0.26, CEILING_Y - 0.14, CEILING_Y, -0.9, 0.9),
    solid('cornice-port', 'lamp', -0.9, 0.9, CEILING_Y - 0.14, CEILING_Y, A - 0.26, A - 0.1),
    solid('cornice-starboard', 'lamp', -0.9, 0.9, CEILING_Y - 0.14, CEILING_Y, -A + 0.26, -A + 0.1)
  );

  return parts;
}

const SOLIDS: readonly Solid[] = berthSolids();

const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['SCREENGLOW', 0x1b2735],
]);

const CAP_COLOUR = 0x6b5c42;

/** Three overlapping rectangles inscribed in the octagon, as in the legacy. */
const INNER = A - WALL_STANDOFF;
const ARM = INNER * (Math.SQRT2 - 1);
const DIAG = INNER / Math.SQRT2;
const FLOOR: readonly FloorRect[] = [
  { minX: -INNER, maxX: INNER, minZ: -ARM, maxZ: ARM, floorY: FLOOR_Y },
  { minX: -ARM, maxX: ARM, minZ: -INNER, maxZ: INNER, floorY: FLOOR_Y },
  { minX: -DIAG, maxX: DIAG, minZ: -DIAG, maxZ: DIAG, floorY: FLOOR_Y },
];

const HATCH_AT = onFacet(4, 0, HATCH_Y, A - 0.2);
const NET_AT = onFacet(6, 0, 0.6, A - 0.3);
const POINTS: readonly PointOfInterest[] = [
  { id: 'manifest', label: 'the manifest board', position: [0, 1.4, A - 0.28], operable: true },
  { id: 'hatch', label: 'the resupply hatch', position: [HATCH_AT.x, HATCH_AT.y, HATCH_AT.z] },
  { id: 'net', label: 'the stowed cargo net', position: [NET_AT.x, NET_AT.y, NET_AT.z] },
  { id: 'deck', label: 'the tie-down grid', position: [0, 0.1, 0] },
];

/** The manifest's rows on the board's room face (facing -z), plus a halo. */
function boardInstruments(): readonly THREE.Object3D[] {
  const target = sink();
  const panel = {
    origin: new THREE.Vector3(0.4, 1.18, A - 0.2015),
    right: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    width: 0.8,
    height: 0.48,
  };
  screenPlate(target, panel);
  textRows(target, panel, { rows: 8, seed: 0xbe4, inset: 0.028, fill: 0.66 });
  const rows = new THREE.Mesh(
    toGeometry(target),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  rows.name = 'berthb-manifest-rows';
  return [
    rows,
    halo({
      at: [0, 1.42, A - 0.2015],
      normal: [0, 0, -1],
      width: 1.1,
      height: 0.72,
      colour: PALETTE.MINT,
      opacity: 0.2,
      proud: 0.03,
    }),
  ];
}

function buildBerthBlender(): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'berth-blender';

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

  // The arm's light: plain and even, like the room.
  const hemi = new THREE.HemisphereLight(0xd9c9a6, 0x2a2622, 0.7);
  root.add(hemi);

  let read = 0;

  return {
    root,
    // One pace in from the door, facing the hatch down the long diagonal,
    // with the empty middle between the two.
    spawn: { position: [A - 0.7, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: -0.04 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 41,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    /** Eight half-planes, a deck and a lid: the smallest clearance wins. */
    contains(point: THREE.Vector3): number {
      let worst = Math.min(point.y - FLOOR_Y, CEILING_Y - point.y);
      for (let k = 0; k < FACETS; k += 1) {
        const n = normalOf(k);
        worst = Math.min(worst, A - (point.x * n.x + point.z * n.z));
      }
      return worst;
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
      void read;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export const BERTH_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'berth',
  name: 'THE BERTH',
  description: 'A 4.8 m octagon kept empty, with the only round hatch aboard.',
  ports: PORTS,
  extent: EXTENT,
  build: buildBerthBlender,
};

export const BERTH_BLENDER: EnvironmentDefinition = {
  id: 'berth-blender',
  name: 'THE BERTH (BLENDER)',
  description: 'The same drum, modelled in Blender and lit by Cycles.',
  build: buildBerthBlender,
};

export async function readyBerth(): Promise<void> {
  await ready(STEM);
}

export default BERTH_BLENDER;
