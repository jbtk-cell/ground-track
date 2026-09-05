/**
 * THE GENERATED ROOMS - forty-one compartments from one factory.
 *
 * Deck One's expansion rooms (src/env/station/deckplan.ts) are records, not
 * modules: this factory turns each record into a full CompartmentDefinition
 * with the same contract the bespoke rooms hand-build - ports, declared
 * solids, floors, hull test, caps toggled by sealPort() - and the same
 * loader pairing (a .glb from tools/blender/build_generated.py plus a
 * Cycles lightmap, stems `gen-<id>`).
 *
 * Assets are tolerant here, unlike the bespoke rooms' readyX(): while the
 * expansion is being baked room by room, a missing .glb must not keep the
 * station from mounting. A generated room with no asset builds its contract
 * and simply has no visuals yet.
 */
import * as THREE from 'three';
import type { EnvironmentDefinition, FloorRect, PointOfInterest } from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { GALLERY_SEAM, LOW_SEAM, SEAM, type Port, port } from '../station/ports';
import { DECK_ROOMS, type DeckPortSpec, type DeckRoomSpec } from '../station/deckplan';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const CAP_COLOUR = 0x6b5c42;
const EYE_HEIGHT = 1.74;

function centreOf(spec: DeckRoomSpec): readonly [number, number] {
  return [(spec.rect[0] + spec.rect[1]) / 2, (spec.rect[2] + spec.rect[3]) / 2];
}

/** A spec port in the room's local (centre-origin) frame. */
function localPort(spec: DeckRoomSpec, p: DeckPortSpec): Port {
  const [cx, cz] = centreOf(spec);
  const ohw = (spec.rect[1] - spec.rect[0]) / 2;
  const ohd = (spec.rect[3] - spec.rect[2]) / 2;
  const seam = p.gallery === true ? GALLERY_SEAM : p.low === true ? LOW_SEAM : SEAM;
  const floorY = p.floorY ?? 0;
  const y = floorY + seam.height / 2;
  switch (p.wall) {
    case 'e':
      return port(p.id, [ohw, y, p.at - cz], '+x', floorY, seam);
    case 'w':
      return port(p.id, [-ohw, y, p.at - cz], '-x', floorY, seam);
    case 'n':
      return port(p.id, [p.at - cx, y, ohd], '+z', floorY, seam);
    default:
      return port(p.id, [p.at - cx, y, -ohd], '-z', floorY, seam);
  }
}

function solidsOf(spec: DeckRoomSpec): readonly Solid[] {
  const parts: Solid[] = [];
  for (const f of spec.furniture) {
    const [x0, x1, y0, y1, z0, z1] = f.box;
    parts.push(solid(f.name, f.mat.toLowerCase(), x0, x1, y0, y1, z0, z1));
  }
  spec.lamps.forEach(([x0, x1, z0, z1], i) => {
    parts.push(solid(`lamp-${i}`, 'lamp', x0, x1, spec.h - 0.06, spec.h - 0.02, z0, z1));
  });
  return parts;
}

function selfLitOf(spec: DeckRoomSpec): Map<string, number> {
  return new Map(spec.selfLit.map(([name, colour]) => [name, colour]));
}

/** Somewhere honestly walkable to stand when the room mounts alone. */
function spawnOf(spec: DeckRoomSpec): { position: [number, number, number]; yaw: number } {
  const first = spec.floors[0] ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0, floorY: 0 };
  const x = (first.minX + first.maxX) / 2;
  const z = (first.minZ + first.maxZ) / 2;
  const wide = spec.rect[1] - spec.rect[0] >= spec.rect[3] - spec.rect[2];
  return { position: [x, first.floorY + EYE_HEIGHT, z], yaw: wide ? -Math.PI / 2 : 0 };
}

function buildGenerated(spec: DeckRoomSpec): CompartmentHandle {
  const stem = `gen-${spec.id}`;
  const root = new THREE.Group();
  root.name = stem;

  const ports = spec.ports.map((p) => localPort(spec, p));
  const visuals = bakedVisuals(stem, selfLitOf(spec));
  if (visuals !== null) root.add(visuals);

  const capMeshes = new Map<string, THREE.Mesh>();
  for (const p of ports) {
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

  const ohw = (spec.rect[1] - spec.rect[0]) / 2;
  const ohd = (spec.rect[3] - spec.rect[2]) / 2;
  const floors: readonly FloorRect[] = spec.floors;
  const pois: readonly PointOfInterest[] = spec.pois.map((p) => ({
    id: p.id,
    label: p.label,
    position: [p.position[0], p.position[1], p.position[2]],
    ...(p.operable === true ? { operable: true } : {}),
  }));

  let used = 0;

  return {
    root,
    spawn: { ...spawnOf(spec), pitch: 0.02 },
    floor: floors,
    pointsOfInterest: pois,
    eyeHeight: EYE_HEIGHT,
    ...(spec.machineryHz > 0 ? { machineryHz: spec.machineryHz } : {}),
    solids: solidsOf(spec),
    ports,
    extent: {
      minX: -ohw,
      maxX: ohw,
      minY: -0.2,
      maxY: spec.h + 0.2,
      minZ: -ohd,
      maxZ: ohd,
    },

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y + 0.05,
        spec.h - point.y,
        ohw - Math.abs(point.x),
        ohd - Math.abs(point.z)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      if (!spec.pois.some((p) => p.id === id && p.operable === true)) return false;
      used += 1;
      return true;
    },

    update(): void {
      void used;
    },

    dispose(): void {
      disposeVisuals(root);
      root.clear();
    },
  };
}

export function generatedCompartment(spec: DeckRoomSpec): CompartmentDefinition {
  const ports = spec.ports.map((p) => localPort(spec, p));
  const ohw = (spec.rect[1] - spec.rect[0]) / 2;
  const ohd = (spec.rect[3] - spec.rect[2]) / 2;
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    ports,
    extent: {
      minX: -ohw,
      maxX: ohw,
      minY: -0.2,
      maxY: spec.h + 0.2,
      minZ: -ohd,
      maxZ: ohd,
    },
    build: () => buildGenerated(spec),
  };
}

export const GENERATED_COMPARTMENTS: readonly CompartmentDefinition[] =
  DECK_ROOMS.map(generatedCompartment);

/** Solo-mount definitions, for the catalogue and the pinned poses. */
export const GENERATED_ENVIRONMENTS: readonly EnvironmentDefinition[] = DECK_ROOMS.map((spec) => ({
  id: `gen-${spec.id}`,
  name: `${spec.name} (BLENDER)`,
  description: spec.description,
  build: () => buildGenerated(spec),
}));

/** Fetch every generated room's assets, tolerating the not-yet-baked. */
export async function readyGenerated(): Promise<void> {
  await Promise.all(
    DECK_ROOMS.map((spec) =>
      ready(`gen-${spec.id}`).catch(() => {
        // Not baked yet: the room mounts as contract-only.
      })
    )
  );
}

/** One generated room's assets, same tolerance, for solo mounts. */
export async function readyGeneratedRoom(id: string): Promise<void> {
  await ready(`gen-${id}`).catch(() => {});
}
