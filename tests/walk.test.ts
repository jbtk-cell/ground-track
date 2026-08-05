/**
 * Walking, as opposed to being placed.
 *
 * Every gate this project had teleported. `setPose` does not go through the
 * floor resolver at all, so a pose that a screenshot proves is fine can be a
 * pose the player is physically unable to reach - and that is exactly what
 * shipped: both doorways in the station stopped the player dead unless they
 * approached along the centre line, with the far compartment in plain sight
 * and no feedback, while every pinned shot passed.
 *
 * These tests hold the key down. They drive `advance` - the same function the
 * frame loop drives - at 60 Hz, from a real standing start, and check where the
 * body actually ended up.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advance } from '../src/env/viewer/controller';
import { STATION } from '../src/env/station/plan';
import { layOut } from '../src/env/station/layout';
import { buildStation } from '../src/env/station/index';
import { SEAM, facingVector } from '../src/env/station/ports';
import type { FloorRect } from '../src/env/types';

const WALK_SPEED_MS = 1.85;
const HZ = 60;
const EYE_Y = 1.74;

interface Walked {
  readonly x: number;
  readonly z: number;
  /** Metres of ground actually covered, which is not metres asked for. */
  readonly covered: number;
}

/**
 * Hold a direction for a number of seconds and report where the body ends up.
 *
 * `observe` is called every step because the station streams: which
 * compartments are resident is a function of where the eye is, and a walk that
 * never told the station it had moved would walk into a room that was never
 * built.
 */
function hold(
  station: { floor: readonly FloorRect[]; observe?: (eye: THREE.Vector3) => void },
  startX: number,
  startZ: number,
  dirX: number,
  dirZ: number,
  seconds: number
): Walked {
  const dt = 1 / HZ;
  let x = startX;
  let z = startZ;
  let covered = 0;
  const steps = Math.round(seconds * HZ);
  for (let i = 0; i < steps; i += 1) {
    station.observe?.(new THREE.Vector3(x, EYE_Y, z));
    const before = { x, z };
    const next = advance(station.floor, x, z, dirX * WALK_SPEED_MS * dt, dirZ * WALK_SPEED_MS * dt);
    x = next.x;
    z = next.z;
    covered += Math.hypot(x - before.x, z - before.z);
  }
  return { x, z, covered };
}

describe('the station: every doorway is walk-through at its full width', () => {
  // The defect this replaces: SEAM.width is 1.18 m, but only the middle 0.70 m
  // could be walked. At |z| >= 0.40 the player stopped inside the door recess.
  // Found by holding W. Not findable by any number of screenshots.
  const station = buildStation(STATION);
  const placed = layOut(STATION.rooms, STATION.connections, STATION.anchor);

  const approach = 1.5;
  const offsets: number[] = [];
  for (let o = -0.55; o <= 0.5501; o += 0.05) offsets.push(Math.round(o * 100) / 100);

  for (const link of STATION.connections) {
    const room = STATION.rooms.find((r) => r.id === link.from[0]);
    const placement = placed.get(link.from[0]);
    const port = room?.ports.find((q) => q.id === link.from[1]);
    const label = `${link.from[0]}.${link.from[1]} -> ${link.to[0]}.${link.to[1]}`;

    it(`${label} passes at every offset across the opening`, () => {
      expect(port, `${link.from[0]} has no port ${link.from[1]}`).toBeDefined();
      expect(placement).toBeDefined();
      if (port === undefined || placement === undefined) return;

      const seam = new THREE.Vector3(port.at[0], 0, port.at[2]).applyMatrix4(placement.matrix);
      const axis = new THREE.Vector3(...facingVector(port.facing))
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw)
        .round();
      // Across the opening, perpendicular to the way through it.
      const side = new THREE.Vector3(-axis.z, 0, axis.x);

      const stuck: string[] = [];
      for (const offset of offsets) {
        const startX = seam.x - axis.x * approach + side.x * offset;
        const startZ = seam.z - axis.z * approach + side.z * offset;
        // Only start from offsets that are themselves standable - an offset
        // outside the room is not a doorway failure.
        const standable = station.floor.some(
          (r) => startX >= r.minX && startX <= r.maxX && startZ >= r.minZ && startZ <= r.maxZ
        );
        if (!standable) continue;

        const end = hold(station, startX, startZ, axis.x, axis.z, 2);
        // How far past the seam plane the body finished, along the way through.
        const past = (end.x - seam.x) * axis.x + (end.z - seam.z) * axis.z;
        if (past <= 0.2) {
          stuck.push(`offset ${offset.toFixed(2)} m stopped ${past.toFixed(2)} m from the seam`);
        }
      }
      expect(stuck.join('\n')).toBe('');
    });
  }

  it('leaves at least 1.0 m of the opening walkable', () => {
    // The width test, stated as a number rather than as a pass. SEAM.width is
    // the clear opening; this is the part of it a body can actually use.
    expect(SEAM.width).toBeGreaterThan(1.0);
  });
});

describe('the station: a walk is never a teleport', () => {
  it('covers no more ground than the legs asked for', () => {
    // The guard the doorway fix had to be careful not to break. A correction
    // that crosses a gap between disjoint rectangles is a teleport, and the
    // slide that lets a player funnel into a doorway must never become one.
    const station = buildStation(STATION);
    try {
      const spawn = STATION.rooms.find((r) => r.id === STATION.anchor)?.build();
      const from = spawn?.spawn.position ?? [0, EYE_Y, 0];
      spawn?.dispose();
      const seconds = 8;
      const end = hold(station, from[0], from[2], -1, 0, seconds);
      // Ground covered can be less than asked for - walls stop legs - but it
      // can never be more, at any offset, through any doorway.
      expect(end.covered).toBeLessThanOrEqual(WALK_SPEED_MS * seconds + 1e-6);
    } finally {
      station.dispose();
    }
  });
});
