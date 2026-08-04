/**
 * Every room, held to the same rules.
 *
 * This file exists because of how the first room's defects were found: by
 * rendering a picture, looking at it, and noticing. That worked, slowly, three
 * times, for one room - and the third defect was caused by the fix for the
 * second. It does not work for eight rooms, and it never worked for the states
 * nobody thinks to render: a door at the top of its travel, a fitting on the far
 * side of a wall, two compartments occupying the same cubic metre.
 *
 * So each check below is a defect that actually shipped, generalised to run over
 * every room at once. Adding a room adds it to `ROOMS` and it inherits the lot.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LIMB_DECK } from '../src/env/limbDeck';
import { STATION } from '../src/env/station/plan';
import { corners, planeClashes } from '../src/env/kit/solids';
import { layOut, overlaps } from '../src/env/station/layout';
import { buildStation } from '../src/env/station/index';
import { SEAM, facingVector } from '../src/env/station/ports';
import type { CompartmentDefinition } from '../src/env/station/compartment';

const ROOMS: readonly CompartmentDefinition[] = STATION.rooms;

/** Runs a body against every room, naming the room in any failure. */
function forEachRoom(body: (room: CompartmentDefinition) => void): void {
  for (const room of ROOMS) {
    it(room.id, () => body(room));
  }
}

describe('every room: nothing shares a plane with anything', () => {
  // Two surfaces in the same plane, facing the same way, covering the same
  // ground: the depth buffer cannot choose between them and picks differently
  // per pixel and per frame. It renders as a comb of alternating values or as a
  // seam that crawls when the camera moves - reported from the room as
  // "glitching, some layers overlap and it isn't clear which is above".
  forEachRoom((room) => {
    const built = room.build();
    try {
      const shut = planeClashes(built.solids);
      const open = planeClashes(built.solids, built.lifts ?? []);
      expect([...shut, ...open].slice(0, 10).join('\n')).toBe('');
    } finally {
      built.dispose();
    }
  });
});

describe('every room: everything it owns is inside its own pressure vessel', () => {
  // A header housing sized off the opening it had to swallow, and nothing else,
  // stood 0.6 m out through the roof of the first room. Invisible from every
  // interior pose - you cannot see the ceiling from under it - and unmissable
  // from outside. No room's hull is a shape anyone can check by eye.
  forEachRoom((room) => {
    const built = room.build();
    try {
      const outside: string[] = [];
      for (const corner of corners(built.solids, built.lifts ?? [])) {
        if (built.contains(corner) < 0) {
          outside.push(
            `(${corner.x.toFixed(2)}, ${corner.y.toFixed(2)}, ${corner.z.toFixed(2)}) ` +
              `is ${(-built.contains(corner)).toFixed(3)} m outside`
          );
        }
      }
      expect(outside.slice(0, 6).join('\n')).toBe('');
    } finally {
      built.dispose();
    }
  });
});

describe('every room: declares enough of itself to be worth checking', () => {
  // A room that declares no solids passes every check above and earns none of
  // the credit. This is the floor on honesty: if a room is mostly boxes, most of
  // its boxes have to be in the list.
  forEachRoom((room) => {
    const built = room.build();
    try {
      expect(built.solids.length).toBeGreaterThan(4);
    } finally {
      built.dispose();
    }
  });
});

describe('every room: is somewhere a person can actually stand', () => {
  forEachRoom((room) => {
    const built = room.build();
    try {
      expect(built.floor.length).toBeGreaterThan(0);
      // Standing room, measured against the room's own eye height rather than a
      // constant, so a room that wants a shorter crew has to say so.
      const eye = new THREE.Vector3(...built.spawn.position);
      expect(built.contains(eye)).toBeGreaterThan(0);
      // And the spawn is on the floor, not in a wall or above the deck.
      const onFloor = built.floor.some(
        (rect) =>
          eye.x >= rect.minX &&
          eye.x <= rect.maxX &&
          eye.z >= rect.minZ &&
          eye.z <= rect.maxZ &&
          Math.abs(eye.y - (rect.floorY + built.eyeHeight)) < 1e-6
      );
      expect(onFloor, `${room.id} spawns off its own floor`).toBe(true);
    } finally {
      built.dispose();
    }
  });
});

describe('every room: the ports it advertises are the ports it has', () => {
  // The station lays out the whole graph from the DEFINITION's ports, without
  // building anything - that is what makes streaming possible. If the built room
  // disagreed, the layout would be correct about a station that does not exist.
  forEachRoom((room) => {
    const built = room.build();
    try {
      expect(built.ports.map((p) => p.id).sort()).toEqual(room.ports.map((p) => p.id).sort());
      for (const declared of room.ports) {
        const actual = built.ports.find((p) => p.id === declared.id);
        expect(actual).toEqual(declared);
      }
    } finally {
      built.dispose();
    }
  });
});

describe('every room: its seams are walk-through sized', () => {
  forEachRoom((room) => {
    for (const p of room.ports) {
      // The seam opening sits on the deck and clears a standing person. This is
      // the multi-room form of the mistake that shipped a door 70 mm over the
      // eye: measured against the doorway the hull was cut to, not the gap a
      // person walks through.
      expect(p.at[1] - p.floorY).toBeCloseTo(SEAM.height / 2, 6);
      expect(SEAM.height).toBeGreaterThan(1.99);
      expect(SEAM.width).toBeGreaterThan(1.0);
    }
  });
});

describe('the station as a whole', () => {
  it('closes: every room placed, none unreachable', () => {
    const placed = layOut(STATION.rooms, STATION.connections, STATION.anchor);
    expect(placed.size).toBe(STATION.rooms.length);
  });

  it('never puts two compartments in the same cubic metre', () => {
    // The one you cannot see. The far room is not resident while you stand in
    // the near one, so an overlap never appears in a screenshot until the day it
    // does, and then it is a wall you can see through from one specific corner.
    const placed = layOut(STATION.rooms, STATION.connections, STATION.anchor);
    expect(overlaps(STATION.rooms, placed).slice(0, 6).join('\n')).toBe('');
  });

  it('anchors on the room with the window', () => {
    // A windowed room paints space into the screen rectangle its panes cover,
    // and those pane corners are stored in the room's own frame. Placed anywhere
    // but the origin, it would scissor space to the wrong part of the screen.
    // See Painter in station/compartment.ts.
    expect(STATION.anchor).toBe(LIMB_DECK.id);
  });

  it('has a route from the start to every other room', () => {
    const reachable = new Set<string>([STATION.start ?? STATION.anchor]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const link of STATION.connections) {
        const [a] = link.from;
        const [b] = link.to;
        if (reachable.has(a) && !reachable.has(b)) {
          reachable.add(b);
          grew = true;
        }
        if (reachable.has(b) && !reachable.has(a)) {
          reachable.add(a);
          grew = true;
        }
      }
    }
    expect([...reachable].sort()).toEqual(STATION.rooms.map((r) => r.id).sort());
  });

  it('gives no two rooms the same proportions', () => {
    // The failure mode of a series of rooms is sameness, and sameness is
    // invisible when you look at one room at a time. Two rooms whose width,
    // height and length all match within a handspan are one room built twice.
    const shapes = STATION.rooms.map((room) => ({
      id: room.id,
      w: room.extent.maxZ - room.extent.minZ,
      h: room.extent.maxY - room.extent.minY,
      l: room.extent.maxX - room.extent.minX,
    }));
    const same: string[] = [];
    for (let i = 0; i < shapes.length; i += 1) {
      for (let j = i + 1; j < shapes.length; j += 1) {
        const a = shapes[i];
        const b = shapes[j];
        if (a === undefined || b === undefined) continue;
        if (
          Math.abs(a.w - b.w) < 0.25 &&
          Math.abs(a.h - b.h) < 0.25 &&
          Math.abs(a.l - b.l) < 0.25
        ) {
          same.push(`${a.id} and ${b.id} are the same size`);
        }
      }
    }
    expect(same.join('\n')).toBe('');
  });
});

describe('the station: you can actually walk between the compartments', () => {
  it('has continuous floor through every seam', () => {
    // The one that every gate missed. Two compartments joined at a port are not
    // joined for WALKING: each room's deck stops at its own end wall and the
    // collar between them - the door, its pocket, the sleeve - belonged to
    // neither. Walking aft with the door open, the player stopped dead 1.65 m
    // short of the corridor and stayed there, while every screenshot preset
    // passed, because a shot harness teleports and never walks.
    //
    // Sampling every 10 cm along the seam axis is the cheapest honest form of
    // "walk through it": a gap anywhere in the run is a gap the player hits.
    const station = buildStation(STATION);
    try {
      const placed = layOut(STATION.rooms, STATION.connections, STATION.anchor);
      for (const link of STATION.connections) {
        const room = STATION.rooms.find((r) => r.id === link.from[0]);
        const placement = placed.get(link.from[0]);
        const p = room?.ports.find((q) => q.id === link.from[1]);
        expect(p, `${link.from[0]} has no port ${link.from[1]}`).toBeDefined();
        if (p === undefined || placement === undefined) continue;

        const seam = new THREE.Vector3(p.at[0], 0, p.at[2]).applyMatrix4(placement.matrix);
        const axis = new THREE.Vector3(...facingVector(p.facing))
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw)
          .round();

        // Walk the eye from 2 m before the seam to 2 m past it.
        const gaps: string[] = [];
        for (let t = -2; t <= 2.0001; t += 0.1) {
          const x = seam.x + axis.x * t;
          const z = seam.z + axis.z * t;
          station.observe?.(new THREE.Vector3(x, 1.74, z));
          const standing = station.floor.some(
            (rect) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ
          );
          if (!standing) gaps.push(`${t.toFixed(1)} m from the seam`);
        }
        expect(
          gaps.slice(0, 6).join(', '),
          `no floor across ${link.from[0]}.${link.from[1]} -> ${link.to[0]}.${link.to[1]}`
        ).toBe('');
      }
    } finally {
      station.dispose();
    }
  });
});

describe('the limb deck keeps the promises it made on its own', () => {
  it('marks operable exactly the points interact() will honour', () => {
    // Moved here from arm.test.ts and generalised: the hand is the only signal
    // that a thing can be operated, so a reach is a promise, and this is that
    // promise being kept. Runs for every room rather than the one it was
    // written for.
    for (const room of ROOMS) {
      const built = room.build();
      try {
        for (const poi of built.pointsOfInterest) {
          const acted = built.interact?.(poi.id) === true;
          expect(acted, `${room.id}/${poi.id}`).toBe(poi.operable === true);
        }
      } finally {
        built.dispose();
      }
    }
  });
});
