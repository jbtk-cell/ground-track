import { describe, expect, it } from 'vitest';
import {
  BULKHEAD_X,
  DOOR_CLEAR,
  DOOR_COAMING_LAP,
  DOOR_FULL_RATE_S,
  DOOR_PROUD_X,
  type DoorPart,
  createDoor,
  doorEnvelope,
  doorParts,
  leafLift,
} from '../src/env/limbDeck/door';
import { LIMB_DECK } from '../src/env/limbDeck';
import { cutMargin, hullClearance } from '../src/env/limbDeck/shell';
import { LIMB_DECK_GEOMETRY, sampleOrbit } from '../src/env/orbit';

/** A real Frame at time t. The door reads only the clock, but it is handed the
 *  same thing every other animator gets rather than a stub of one. */
const frameAt = (t: number) => ({
  t,
  orbit: sampleOrbit(t, LIMB_DECK_GEOMETRY),
  reducedMotion: false,
});

/** Below this two planes are the same plane as far as a depth buffer cares. */
const COPLANAR_M = 0.0015;

type Axis = 'x' | 'y' | 'z';
interface Face {
  readonly part: string;
  readonly axis: Axis;
  /** +1 for the face whose outward normal points along +axis, -1 for the other. */
  readonly facing: 1 | -1;
  readonly at: number;
  /** Extent on the two axes the face spans, in axis order. */
  readonly span: readonly [number, number, number, number];
}

const OTHERS: Record<Axis, readonly [Axis, Axis]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
};

function facesOf(p: DoorPart, lift: number): readonly Face[] {
  const lo = { x: p.x0, y: p.y0 + lift, z: p.z0 };
  const hi = { x: p.x1, y: p.y1 + lift, z: p.z1 };
  const faces: Face[] = [];
  for (const axis of ['x', 'y', 'z'] as const) {
    const [a, b] = OTHERS[axis];
    const span = [lo[a], hi[a], lo[b], hi[b]] as const;
    faces.push({ part: p.name, axis, facing: -1, at: lo[axis], span });
    faces.push({ part: p.name, axis, facing: 1, at: hi[axis], span });
  }
  return faces;
}

/** Area the two faces share. Touching along an edge is 0 and is not a clash. */
function sharedArea(a: Face, b: Face): number {
  const w = Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]);
  const h = Math.min(a.span[3], b.span[3]) - Math.max(a.span[2], b.span[2]);
  return w > 1e-6 && h > 1e-6 ? w * h : 0;
}

describe('the aft door: nothing shares a plane with anything', () => {
  /**
   * Two surfaces in the same plane, facing the same way, covering the same
   * ground: the depth buffer cannot choose between them and picks differently
   * per pixel, per frame. It renders as a fine comb of alternating values, or as
   * a seam that flickers when the camera moves.
   *
   * This defect shipped twice, was found by eye in a render both times, and the
   * second time was caused by fixing the first - the frame was made to overlap
   * the sleeve in solid material, which put their faces flush. There are several
   * hundred face pairs in this door and eye is the wrong instrument for them.
   *
   * Faces pointing OPPOSITE ways in one plane are fine and common: a box resting
   * on another box shares a plane, but only one of the two faces is front-facing
   * from any given eye, so there is nothing to choose between.
   */
  it('has no two faces coplanar, same-facing and overlapping', () => {
    const parts = doorParts();
    const clashes: string[] = [];

    for (const shut of [true, false]) {
      const faces = parts.flatMap((p) =>
        facesOf(p, p.leaf >= 0 && !shut ? leafLift(p.leaf) : 0)
      );
      for (let i = 0; i < faces.length; i += 1) {
        for (let j = i + 1; j < faces.length; j += 1) {
          const a = faces[i];
          const b = faces[j];
          if (a === undefined || b === undefined) continue;
          if (a.part === b.part) continue;
          if (a.axis !== b.axis || a.facing !== b.facing) continue;
          if (Math.abs(a.at - b.at) > COPLANAR_M) continue;
          const area = sharedArea(a, b);
          if (area > 1e-5) {
            clashes.push(
              `${a.part} / ${b.part}: ${a.axis}=${a.at.toFixed(4)} ` +
                `facing ${a.facing > 0 ? '+' : '-'}, ${(area * 1e4).toFixed(1)} cm2` +
                (shut ? ' (shut)' : ' (open)')
            );
          }
        }
      }
    }

    expect(clashes.slice(0, 12).join('\n')).toBe('');
  });

  it('keeps every face off the bulkhead plane', () => {
    // The bulkhead is a surface too, and it is not in this parts list. The
    // pocket's side cheeks landed exactly on it once and stitched a comb up the
    // wall either side of the head.
    const on = doorParts()
      .filter(
        (p) =>
          Math.abs(p.x0 - BULKHEAD_X) < COPLANAR_M || Math.abs(p.x1 - BULKHEAD_X) < COPLANAR_M
      )
      .map((p) => p.name);
    expect(on).toEqual([]);
  });

  it('keeps every face off the deck plane', () => {
    // Same argument, for the floor the room draws at y = 0.
    const on = doorParts()
      .filter((p) => Math.abs(p.y0) < COPLANAR_M || Math.abs(p.y1) < COPLANAR_M)
      .map((p) => p.name);
    expect(on).toEqual([]);
  });
});

describe('the aft door: where it is allowed to be', () => {
  it('fits inside the pressure hull', () => {
    // The one that got away. The first header housing was sized off the opening
    // it had to swallow and nothing else, and stood 0.6 m out through the roof -
    // invisible from every interior pose, because you cannot see the ceiling
    // from under it, and unmissable from outside. The hull is a curve and no
    // amount of looking at the room will tell you where it is at a given z.
    for (const [y, z] of doorEnvelope()) {
      expect(hullClearance(y, z), `door corner y=${y} z=${z}`).toBeGreaterThan(0.1);
    }
  });

  it('stands clear of the floor the player can reach', () => {
    // The frame protrudes into the room and the deck runs up to the bulkhead, so
    // these two numbers are in a negotiation whether anyone writes it down or
    // not. The viewer holds the eye a further wall margin inside this.
    const room = LIMB_DECK.build();
    try {
      const aft = Math.min(...room.floor.map((rect) => rect.minX));
      expect(DOOR_PROUD_X).toBeLessThan(aft);
    } finally {
      room.dispose();
    }
  });

  it('laps the bulkhead cut by more than the cut can be out', () => {
    // The frame's whole job at its edges is covering the staircase the polar fan
    // leaves around a rectangular hole. Sizing it by eye is what produced four
    // holes to space either side of the last door, so the tolerance is published
    // by the thing that does the cutting and the frame is held to it here.
    expect(DOOR_COAMING_LAP).toBeGreaterThan(cutMargin() * 2);
  });

  it('opens a doorway a person can walk through', () => {
    // Measured where the player actually walks: threshold to parked leaf, and
    // between the rails. An earlier door cleared the eye by 70 mm, which reads
    // in the room as a duck-under - it was reported as "too small to walk
    // through" and it was right. A quarter of a metre over the eye is the
    // difference between a doorway and a hatch.
    const room = LIMB_DECK.build();
    try {
      expect(DOOR_CLEAR.height).toBeGreaterThan(room.eyeHeight + 0.25);
      expect(DOOR_CLEAR.width).toBeGreaterThan(1.0);
    } finally {
      room.dispose();
    }
  });
});

describe('the aft door: what it does when pressed', () => {
  /** Runs the door forward from rest, sampling travel at fixed steps. */
  function run(seconds: number, step = 1 / 60) {
    const door = createDoor();
    let t = 0;
    door.update(frameAt(t));
    door.press();
    let peak = 0;
    while (t < seconds) {
      t += step;
      door.update(frameAt(t));
      peak = Math.max(peak, door.travel());
    }
    return { door, peak };
  }

  it('lifts fully, holds, and comes back down by itself', () => {
    const opened = run(2.2);
    expect(opened.door.travel()).toBeGreaterThan(0.99);
    opened.door.dispose();

    // Latch, travel, dwell, latch, travel - and then shut, with no further press.
    const cycled = run(12);
    expect(cycled.peak).toBeGreaterThan(0.99);
    expect(cycled.door.travel()).toBe(0);
    cycled.door.dispose();
  });

  it('refuses a second press while it is moving', () => {
    const door = createDoor();
    door.update(frameAt(0));
    expect(door.press()).toBe(true);
    expect(door.press()).toBe(false);
    door.update(frameAt(0.5));
    expect(door.press()).toBe(false);
    door.dispose();
  });

  it('runs the lower leaves faster, and lands them all together', () => {
    // The telescoping read depends entirely on this. Equal travel would be three
    // panels sliding in formation, which is a lift door with extra seams.
    const lifts = [0, 1, 2].map(leafLift);
    expect(lifts[0]).toBeGreaterThan(lifts[1] ?? 0);
    expect(lifts[1]).toBeGreaterThan(lifts[2] ?? 0);
    expect(lifts[2]).toBeGreaterThan(0);
  });

  it('never snaps', () => {
    // DIRECTION's camera law, applied to the one thing in the room that moves on
    // its own: at 60 fps no step in the travel may read as a jump.
    const door = createDoor();
    let t = 0;
    door.update(frameAt(t));
    door.press();
    let previous = 0;
    let biggest = 0;
    while (t < 12) {
      t += 1 / 60;
      door.update(frameAt(t));
      biggest = Math.max(biggest, Math.abs(door.travel() - previous));
      previous = door.travel();
    }
    // A sixtieth of the travel time, plus the smoothstep's peak gradient of 1.5.
    expect(biggest).toBeLessThan((1.5 / 60 / DOOR_FULL_RATE_S) * 1.2);
    door.dispose();
  });
});
