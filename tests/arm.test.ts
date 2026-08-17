import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { couplingGaps, couplingRelease, createArm, limbSolidLength } from '../src/env/player/arm';
import { NEAR_PLANE_M } from '../src/env/viewer/controller';
import { LIMB_DECK } from '../src/env/limbDeck';
import { hullMountAt } from '../src/env/limbDeck/shell';
import { buildStation } from '../src/env/station/index';
import { STATION } from '../src/env/station/plan';

/** The controller's wall margin: twice the near plane, held off every outer edge. */
const MARGIN_M = NEAR_PLANE_M * 2;

describe('the magnetic limb', () => {
  it('is shorter than anything it has to touch', () => {
    // The whole design rests on this. The nearest a body can stand to a hull
    // fitting is about 0.7 m - wall margin plus the shoulder's setback - so a
    // limb that could span that closed would never come apart, and the
    // separation would be a decoration rather than the mechanism. If someone
    // lengthens the segments past this, the character quietly stops working.
    expect(limbSolidLength()).toBeLessThan(0.55);
    expect(limbSolidLength()).toBeGreaterThan(0.25);
  });

  it('opens by exactly the distance it has to cover', () => {
    // Hardware is rigid: every millimetre the path is longer than the limb
    // comes out of the couplings and nowhere else. A chain whose gaps did not
    // sum to the slack would either stretch its own segments or fall short of
    // what it is reaching for.
    const solid = limbSolidLength();
    for (const span of [0.6, 0.8, 1.1, 1.4]) {
      const gaps = couplingGaps(span, solid);
      const opened = gaps.reduce((total, gap) => total + gap, 0);
      expect(opened).toBeCloseTo(span - solid, 10);
    }
  });

  it('travels shut before it lets go', () => {
    // Two motions, in order: the limb comes up off the hip as one solid stack
    // and aims, and only then do the magnets release. Both at once and the
    // player never sees it whole and never sees it come apart - it simply is
    // apart, which reads as floating debris rather than as a machine taking
    // itself to pieces. The separation has to be witnessed.
    expect(couplingRelease(0)).toBe(0);
    expect(couplingRelease(0.3)).toBe(0);
    expect(couplingRelease(1)).toBe(1);

    // And it eases rather than snapping: no jump anywhere across the opening.
    let previous = 0;
    let biggestStep = 0;
    for (let i = 1; i <= 100; i += 1) {
      const here = couplingRelease(i / 100);
      expect(here).toBeGreaterThanOrEqual(previous);
      biggestStep = Math.max(biggestStep, here - previous);
      previous = here;
    }
    expect(biggestStep).toBeLessThan(0.04);

    // Shut means shut: no gap anywhere while the stack is still travelling.
    for (const gap of couplingGaps(1.2, limbSolidLength(), couplingRelease(0.2))) {
      expect(gap).toBe(0);
    }
  });

  it('stays shut when the path is shorter than the limb', () => {
    // Standing on top of something must not make the couplings open backwards.
    const gaps = couplingGaps(0.2, limbSolidLength());
    for (const gap of gaps) expect(gap).toBe(0);
  });

  it('lets go at the wrist first', () => {
    // The read is "the hand detached and went", not "the limb fell apart". Past
    // the lead-out that pushes the stack clear of the eye, the gaps have to grow
    // toward the hand, and the wrist has to open widest by a clear margin - the
    // hand is only free-looking if it stands off the segment behind it by more
    // than that segment is long.
    const gaps = couplingGaps(1.0, limbSolidLength());
    for (let i = 2; i < gaps.length; i += 1) {
      expect(gaps[i] ?? 0).toBeGreaterThan(gaps[i - 1] ?? 0);
    }
    const wrist = gaps[gaps.length - 1] ?? 0;
    const previous = gaps[gaps.length - 2] ?? 0;
    expect(wrist).toBeGreaterThan(previous * 1.3);
    expect(wrist).toBeGreaterThan(0.08);
  });
});

describe('the limb deck: what the hand may reach for', () => {
  it('marks operable exactly the points interact() will honour', () => {
    // The hand is the only signal that a thing can be operated, so a reach is
    // a promise. These two lists are that promise and its keeping, and nothing
    // but this test stops them drifting apart.
    const room = LIMB_DECK.build();
    try {
      const operable = room.pointsOfInterest.filter((poi) => poi.operable === true);
      // Sorted, so adding a control does not depend on where it lands in the list.
      // Two of these are the same door, from the deck and from the corridor.
      // A door with one control is a door that opens only from the room that
      // owns it, and the corridor is not that room.
      expect(operable.map((poi) => poi.id).sort()).toEqual([
        'door-button',
        'door-button-aft',
        'test-button',
      ]);

      // One press per freshly built room, so a control whose mechanism another
      // control already set going is not read as a control that was never
      // wired up. `operable` promises the control is live, not that the thing
      // it drives is idle.
      const ids = room.pointsOfInterest.map((poi) => ({
        id: poi.id,
        operable: poi.operable === true,
      }));
      for (const poi of ids) {
        const fresh = LIMB_DECK.build();
        try {
          expect(fresh.interact?.(poi.id) === true, poi.id).toBe(poi.operable);
        } finally {
          fresh.dispose();
        }
      }
    } finally {
      room.dispose();
    }
  });

  it('bolts the test button to the hull rather than to thin air', () => {
    const room = LIMB_DECK.build();
    try {
      const button = room.pointsOfInterest.find((poi) => poi.id === 'test-button');
      expect(button).toBeDefined();
      const [x, y, z] = button?.position ?? [0, 0, 0];

      // The skin is a curve, so "on the starboard wall" is an arithmetic claim,
      // not a z you can eyeball. The cap must sit just inboard of where the
      // shell actually is at that station - it was previously typed in by hand
      // and floated half a metre out in the middle of the deck.
      const mount = hullMountAt(x, y, 1);
      const standoff = mount.position.z - z;
      expect(standoff).toBeGreaterThan(0);
      expect(standoff).toBeLessThan(0.06);

      // And inside the room the player can actually stand in: the deck chord at
      // deck height is +/-1.757, so a fitting at the wall is outboard of it.
      expect(z).toBeGreaterThan(1.757);
    } finally {
      room.dispose();
    }
  });
});

describe('the station: the hand can actually get to every control', () => {
  it('takes hold of each operable point from somewhere a player can stand', () => {
    // "My arm is gone and it doesn't do anything."
    //
    // The arm is the entire interaction model - no cursor, no prompt, no
    // highlight - and it only deploys for an operable point within 1.6 m of the
    // shoulder and inside a 55 degree cone. So a control the hand cannot get to
    // is not a control, and the failure is completely silent: the arm simply
    // never appears, and the room looks like a room with nothing in it.
    //
    // It has failed twice. Once by placement, a button 73 degrees off the only
    // axis you could approach it from. Once by deletion, when the door was made
    // to open on approach and its buttons were taken out as redundant - which
    // removed the only operable thing at the doorway, and with it the arm, at
    // the one place in the room a player actually walks to.
    //
    // Run against the STATION rather than the room, because that is where a
    // player stands: the corridor-side door control sits 0.24 m inside the
    // sleeve, and the sleeve is floor the station owns and the room does not.
    // Checked with every door SHUT, which is the state you have to be able to
    // reach a door control in - a button you can only press once the door is
    // already open is the same nothing as no button at all.
    //
    // This drives the real arm with a real camera and asks it what it is
    // holding. Nothing else in the suite proves a control can be operated at
    // all, as opposed to being wired up correctly to nothing anybody can reach.
    const station = buildStation(STATION);
    const arm = createArm(false);
    try {
      station.observe?.(new THREE.Vector3(1.4, 1.74, 0));
      station.update(0);
      const operable = station.pointsOfInterest.filter((poi) => poi.operable === true);
      expect(operable.length, 'the station has no controls at all').toBeGreaterThan(0);
      expect(station.mechanism?.travel, 'a door was already open, so this proves less').toBe(0);

      const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 100);
      const targets = operable.map((p) => ({
        id: p.id,
        position: new THREE.Vector3(...p.position),
      }));
      const unreachable: string[] = [];

      for (const poi of operable) {
        const at = new THREE.Vector3(...poi.position);
        // Every place a body could stand, on a 0.1 m grid, and whether the hand
        // takes hold from any of them. Standing is the floor rectangles inset
        // by the same wall margin the controller holds off every outer edge.
        let grabbed = false;
        for (const rect of station.floor) {
          for (let x = rect.minX + MARGIN_M; x <= rect.maxX - MARGIN_M && !grabbed; x += 0.1) {
            for (let z = rect.minZ + MARGIN_M; z <= rect.maxZ - MARGIN_M && !grabbed; z += 0.1) {
              const eye = new THREE.Vector3(x, rect.floorY + station.eyeHeight, z);
              if (eye.distanceTo(at) > 2) continue;
              // Looking straight at it, which a player can always choose to do.
              camera.position.copy(eye);
              camera.lookAt(at);
              camera.updateMatrixWorld(true);
              // A few frames, because the couplings ramp rather than snap.
              for (let f = 0; f < 8; f += 1) arm.update(camera, targets, 1 / 60);
              if (arm.held() === poi.id) grabbed = true;
            }
          }
        }
        if (!grabbed) unreachable.push(poi.id);
      }

      expect(
        unreachable.join(', '),
        'operable, and the hand can never get to it from anywhere a player can stand'
      ).toBe('');
    } finally {
      arm.dispose();
      station.dispose();
    }
  });
});
