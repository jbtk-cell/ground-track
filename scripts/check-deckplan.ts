/**
 * Verify Deck One: the layout closes, nothing overlaps, every join's two
 * seams are the same seam, and every doorway clears its corners.
 *
 *     npx vite-node scripts/check-deckplan.ts
 */
import * as THREE from 'three';
import { STATION } from '../src/env/station/plan';
import { layOut, overlaps } from '../src/env/station/layout';

const placed = layOut(STATION.rooms, STATION.connections, STATION.anchor);
const byId = new Map(STATION.rooms.map((r) => [r.id, r]));

let bad = 0;

const clash = overlaps(STATION.rooms, placed);
for (const line of clash) {
  console.log(`OVERLAP  ${line}`);
  bad += 1;
}

function seamWorld(roomId: string, portId: string): THREE.Vector3 | null {
  const room = byId.get(roomId);
  const p = placed.get(roomId);
  if (!room || !p) return null;
  const at = room.ports.find((q) => q.id === portId);
  if (!at) return null;
  return new THREE.Vector3(at.at[0], at.at[1], at.at[2])
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw)
    .add(p.position);
}

for (const link of STATION.connections) {
  const a = seamWorld(link.from[0], link.from[1]);
  const b = seamWorld(link.to[0], link.to[1]);
  if (!a || !b) {
    console.log(`MISSING  ${link.from.join('.')} <-> ${link.to.join('.')}`);
    bad += 1;
    continue;
  }
  const gap = a.distanceTo(b);
  if (gap > 1e-4) {
    console.log(
      `MISALIGNED  ${link.from.join('.')} <-> ${link.to.join('.')}: ${gap.toFixed(4)} m apart ` +
        `(${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}) vs (${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)})`
    );
    bad += 1;
  }
}

// Doorway corner clearance, in each room's local frame.
for (const room of STATION.rooms) {
  for (const p of room.ports) {
    const half = p.seam.width / 2;
    const [x, , z] = p.at;
    const along = p.facing === '+x' || p.facing === '-x' ? z : x;
    const lo =
      p.facing === '+x' || p.facing === '-x'
        ? [room.extent.minZ, room.extent.maxZ]
        : [room.extent.minX, room.extent.maxX];
    const clearance = Math.min(along - half - (lo[0] ?? 0), (lo[1] ?? 0) - (along + half));
    if (clearance < 0.2) {
      console.log(`TIGHT  ${room.id}.${p.id}: door edge ${clearance.toFixed(2)} m from a corner`);
      if (clearance < 0.1) bad += 1;
    }
  }
}

console.log(
  bad === 0 ? `deckplan: OK (${STATION.rooms.length} rooms)` : `deckplan: ${bad} problems`
);
process.exit(bad === 0 ? 0 : 1);
