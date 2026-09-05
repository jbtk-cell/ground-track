/**
 * Emit the deck map's data: every room's world box, name, family and
 * purpose, and every doorway's position and lock - from the live layout, so
 * the map cannot drift from the game.
 *
 *     npx vite-node scripts/deck-map-data.ts > map.json
 */
import * as THREE from 'three';
import { STATION } from '../src/env/station/plan';
import { layOut, worldExtent } from '../src/env/station/layout';
import { DECK_ROOMS } from '../src/env/station/deckplan';

const placed = layOut(STATION.rooms, STATION.connections, STATION.anchor);
const byId = new Map(STATION.rooms.map((r) => [r.id, r]));
const specById = new Map(DECK_ROOMS.map((r) => [r.id, r]));

/** The twelve bespoke rooms' families and purposes, matched by hand. */
const BESPOKE: Record<string, { family: string; purpose: string }> = {
  'limb-deck': {
    family: 'setpiece',
    purpose: 'The window, the arm, the sun. Where you learn to reach.',
  },
  spine: { family: 'corridor', purpose: 'The first street; every wing now opens off it.' },
  crossing: { family: 'corridor', purpose: 'The hub. The offer board starts every run.' },
  crown: { family: 'science', purpose: 'The regime map on the plot table; the shaft of light.' },
  magazine: { family: 'works', purpose: 'The probe. The planet through the grating.' },
  plot: { family: 'science', purpose: 'The flight deck: the card prints here.' },
  crawl: { family: 'corridor', purpose: 'The duct. Now breaks through to the science quarter.' },
  racks: { family: 'stores', purpose: 'The stores: what was recovered, stowed and counted.' },
  bend: { family: 'corridor', purpose: 'The turn between information and material.' },
  sill: { family: 'works', purpose: 'The salvage register over the sump.' },
  gantry: { family: 'works', purpose: 'The tank farm: what is left to burn.' },
  berth: { family: 'setpiece', purpose: 'Where things dock. Three hatches now.' },
};

const rooms = STATION.rooms.map((room) => {
  const placement = placed.get(room.id);
  const box = placement ? worldExtent(room, placement) : new THREE.Box3();
  const spec = specById.get(room.id);
  const meta = spec
    ? { family: spec.family, purpose: spec.purpose }
    : (BESPOKE[room.id] ?? { family: 'corridor', purpose: '' });
  const secret = spec?.purpose.startsWith('SECRET') ?? false;
  return {
    id: room.id,
    name: room.name,
    family: meta.family,
    purpose: meta.purpose,
    secret,
    x0: box.min.x,
    x1: box.max.x,
    z0: box.min.z,
    z1: box.max.z,
  };
});

const doors = STATION.connections.map((link) => {
  const room = byId.get(link.from[0]);
  const placement = placed.get(link.from[0]);
  const p = room?.ports.find((q) => q.id === link.from[1]);
  if (!room || !placement || !p) return null;
  const at = new THREE.Vector3(p.at[0], p.at[1], p.at[2])
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw)
    .add(placement.position);
  const dir = new THREE.Vector3(
    p.facing === '+x' ? 1 : p.facing === '-x' ? -1 : 0,
    0,
    p.facing === '+z' ? 1 : p.facing === '-z' ? -1 : 0
  ).applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
  return {
    x: at.x,
    z: at.z,
    axis: Math.abs(dir.x) > 0.5 ? 'x' : 'z',
    w: p.seam.width,
    locked: link.locked ?? null,
  };
});

console.log(JSON.stringify({ rooms, doors: doors.filter((d) => d !== null) }, null, 1));
