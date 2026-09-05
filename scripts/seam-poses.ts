/**
 * Dump world-space inspection poses for every seam of Station Kepler - both
 * sides, axial and grazing - plus the window apertures.
 *
 *     npx vite-node scripts/seam-poses.ts > poses.json
 *     node scripts/seam-scan.mjs poses.json out/ [serverUrl]
 *
 * The 2026-09-05 scan of these poses found sliver light-leaks and z-fighting
 * at every one of the eleven seams (fixed by the station's collar rings), a
 * void slit above the crown's aperture, and the legacy limb-deck door's
 * housing protruding into the spine. The poses derive from the live plan via
 * layOut, so they follow the station when it grows.
 */
import * as THREE from 'three';
import { STATION } from '../src/env/station/plan';
import { layOut } from '../src/env/station/layout';

const byId = layOut(STATION.rooms, STATION.connections, STATION.anchor);
const roomById = new Map(STATION.rooms.map((r) => [r.id, r]));

function facingDir(facing: string): [number, number] {
  if (facing === '+x') return [1, 0];
  if (facing === '-x') return [-1, 0];
  if (facing === '+z') return [0, 1];
  return [0, -1];
}

interface ScanPose {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  t: number;
}

const poses: ScanPose[] = [];

for (const conn of STATION.connections) {
  const [a, aPort] = conn.from;
  const [b, bPort] = conn.to;
  for (const [room, portId, other] of [
    [a, aPort, b],
    [b, bPort, a],
  ] as const) {
    const placement = byId.get(room);
    const def = roomById.get(room);
    if (!placement || !def) continue;
    const port = def.ports.find((p) => p.id === portId);
    if (!port) continue;
    const local = new THREE.Vector3(port.at[0], port.at[1], port.at[2]);
    const world = local
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw)
      .add(placement.position);
    const [fx, fz] = facingDir(port.facing);
    const dir = new THREE.Vector3(fx, 0, fz).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      placement.yaw
    );
    // Stand inside `room`, back from the seam, looking out through it.
    for (const [tag, back, side, pitch] of [
      ['axial', 1.6, 0.0, 0.0],
      ['graze', 2.4, 0.55, 0.12],
    ] as const) {
      const eye = world
        .clone()
        .addScaledVector(dir, -back)
        .addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), side);
      const look = dir.clone();
      if (side !== 0) {
        // Aim at the seam edge rather than dead centre: grazing sightline.
        look
          .copy(world)
          .addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), -0.5)
          .sub(eye)
          .setY(0)
          .normalize();
      }
      const yaw = Math.atan2(-look.x, -look.z);
      poses.push({
        name: `seam-${room}-${portId}-to-${other}-${tag}`,
        x: eye.x,
        z: eye.z,
        yaw,
        pitch,
        t: 19.3,
      });
    }
  }
}

// Windows and apertures, in each room's world frame.
function roomPose(
  name: string,
  room: string,
  lx: number,
  lz: number,
  lyaw: number,
  pitch: number
): void {
  const placement = byId.get(room);
  if (!placement) return;
  const eye = new THREE.Vector3(lx, 0, lz)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw)
    .add(placement.position);
  poses.push({ name, x: eye.x, z: eye.z, yaw: lyaw + placement.yaw, pitch, t: 19.3 });
}

roomPose('win-crown-panes', 'crown', 0.4, 0.4, Math.PI / 2 + 0.3, 1.25);
roomPose('win-magazine-grating', 'magazine', 0.4, 0.9, Math.PI / 2, 1.3);
roomPose('win-sill-sump', 'sill', 0.9, -1.2, 2.0, -0.9);
roomPose('win-limb-bay', 'limb-deck', -0.7, -1.5, -0.04, -0.22);
roomPose('win-crown-annulus', 'crown', -1.9, -1.4, Math.PI / 2 - 0.5, 1.35);

console.log(JSON.stringify(poses, null, 1));
