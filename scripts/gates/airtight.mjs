#!/usr/bin/env node
/**
 * The pressure vessel, as a mechanical gate.
 *
 * docs/ENVIRONMENTS.md: the interior must be airtight from every reachable eye
 * position, because the exterior pass clears depth before the room is drawn -
 * so any seam a ray slips through does not render as a crack, it renders as
 * space. And space renders as exactly one value: VOID_SLATE, #101B26, which no
 * interior surface is allowed to reach (the palette gate holds the floor at it,
 * and interior materials sit above it on the emissive floor).
 *
 * That makes the check trivial and exact. In a frame with no window in it, one
 * pixel of #101B26 is one pixel of outer space seen through a wall.
 *
 * This gate exists because holes shipped twice. The aft bulkhead spent a
 * revision missing a 140-degree cone either side of its doorway - 64,060 pixels
 * of open space in `deck-aft`, roughly one frame pixel in twenty-five - while
 * every other gate passed, because no gate was looking at whether the room was
 * a room.
 *
 *   node scripts/gates/airtight.mjs
 *
 * One of the gates discovered and run by scripts/gates.mjs. See docs/LOOP.md,
 * "turn taste into lint".
 */
import { existsSync, readFileSync } from 'node:fs';
import { decodePNG } from '../lib/png.mjs';

/**
 * Interior presets whose framing contains no part of the cupola.
 *
 * It has to be a list rather than "every interior shot", because the shots that
 * DO look at the window are supposed to be full of space and there is no way to
 * tell the sky from a hole by value alone - they are the same colour, which is
 * the whole point of the check. Anything aimed away from the bay belongs here,
 * and adding a pose to this list is one line.
 */
const SEALED = [
  'deck-aft',
  'deck-door',
  'deck-reach',
  'deck-press',
  // The corridor has no window at all, so every one of its poses qualifies, and
  // its unconnected aft port measured 18,360 void pixels the first time it was
  // walked - a hole the size of a doorway, in a brand new room, found by this
  // check rather than by looking.
  'spine-run',
  'station-run',
  'station-seam',
];

/** Space, and the darkest value in the game. Nothing interior may reach it. */
const VOID = [0x10, 0x1b, 0x26];

let failures = 0;
for (const name of SEALED) check(name);

if (failures === 0) {
  console.log(`airtight: ${SEALED.length}/${SEALED.length} sealed poses show no space`);
}
process.exit(failures === 0 ? 0 : 1);

function check(name) {
  const path = `shots/current/${name}.png`;
  if (!existsSync(path)) {
    // Not a skip. A missing frame is a pose that stopped being rendered, and a
    // gate that quietly passes when its evidence disappears is not a gate.
    console.error(`airtight: ${name} not rendered - run npm run shots first`);
    failures += 1;
    return;
  }

  const { width, height, channels, pixels } = decodePNG(readFileSync(path));
  let voids = 0;
  let first = null;
  for (let i = 0; i < width * height; i += 1) {
    const p = i * channels;
    if (pixels[p] === VOID[0] && pixels[p + 1] === VOID[1] && pixels[p + 2] === VOID[2]) {
      voids += 1;
      if (first === null) first = [i % width, Math.floor(i / width)];
    }
  }

  const share = ((voids / (width * height)) * 100).toFixed(2);
  console.log(`\nshots/current/${name}.png`);
  console.log(`  void pixels        : ${voids} (${share}%)`);
  if (voids === 0) {
    console.log('  PASS');
    return;
  }
  console.log(`  first at           : ${first?.[0]}, ${first?.[1]}`);
  console.log('  FAIL - this pose has no window in it, so that is space through a wall');
  failures += 1;
}
