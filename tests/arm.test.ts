import { describe, expect, it } from 'vitest';
import { couplingGaps, couplingRelease, limbSolidLength } from '../src/env/player/arm';
import { LIMB_DECK } from '../src/env/limbDeck';
import { hullMountAt } from '../src/env/limbDeck/shell';

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
      //
      // One entry, and it used to be three. Two of them were the same door, one
      // control per side, and NEITHER could ever be pressed: the hand takes
      // hold inside 1.6 m and the door opens on approach from 3.4 m, so a
      // player near enough to reach either one always found a door that was
      // already running and a press that did nothing. Reported as "idk why
      // there are multiple buttons, clicking the buttons doesn't seem to work".
      // The door is automatic and its plate is now an indicator, `door-lamp`,
      // which is not operable and so is not in this list.
      expect(operable.map((poi) => poi.id).sort()).toEqual(['test-button']);

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
