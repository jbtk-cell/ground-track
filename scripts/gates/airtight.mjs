#!/usr/bin/env node
/**
 * The pressure vessel, as a mechanical gate.
 *
 * docs/ENVIRONMENTS.md: the interior must be airtight from every reachable eye
 * position, because the exterior pass clears depth before the room is drawn -
 * so any seam a ray slips through does not render as a crack, it renders as
 * space. And space renders as exactly one value: VOID_SLATE, #101B26. In the
 * old direction no interior surface could reach that value at all, so a single
 * matching pixel was proof of a hole.
 *
 * Since the interior direction (docs/INTERIORS.md) let rooms go near-black,
 * one pixel is no longer proof: an 8-bit near-black can land on the sentinel
 * triple by arithmetic accident, one pixel at a time. A hole cannot. Every
 * hole this project has shipped was a contiguous region - 64,060 pixels once,
 * 18,360 once, 886 at its subtlest - because a hole is a shape, not a speck.
 * So the check is now connectivity: a breach is a 4-connected component of
 * exact-#101B26 pixels of area >= BLOB. Isolated accidents below that are
 * reported but tolerated. The sentinel mechanism itself is unchanged, and so
 * is the rule that made it work: no interior material may be AUTHORED at
 * VOID_SLATE - the gap between it and any legitimate near-black is what keeps
 * accidental matches rare enough for the blob rule to be meaningful.
 *
 * This gate exists because holes shipped twice. The aft bulkhead spent a
 * revision missing a 140-degree cone either side of its doorway - 64,060
 * pixels of open space in `deck-aft`, roughly one frame pixel in twenty-five -
 * while every other gate passed, because no gate was looking at whether the
 * room was a room.
 *
 *   node scripts/gates/airtight.mjs
 *
 * One of the gates discovered and run by scripts/gates.mjs. See docs/LOOP.md,
 * "turn taste into lint".
 */
import { existsSync, readFileSync } from 'node:fs';
import { decodePNG } from '../lib/png.mjs';

/**
 * Interior presets whose framing contains no window.
 *
 * It has to be a list rather than "every interior shot", because the shots
 * that DO look at a window are supposed to be full of space and there is no
 * way to tell the sky from a hole by value alone - they are the same colour,
 * which is the whole point of the check. Anything aimed away from a window
 * belongs here, and adding a pose to this list is one line.
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
  'crossing-run',
  'bend-turn',
  'plot-console',
  'racks-aisle',
  'crawl-run',
  'magazine-bay',
  'crown-up',
  'crown-off-line',
  'crossing-off-line',
  // Both off the centre line by construction, and both rooms whose floor is not
  // a plain deck: THE SILL is stood on a grating over an open sump, THE GANTRY
  // is lit only from below, so in each the surface most likely to be missing is
  // the one a centred pose sees edge-on.
  'sill-drop',
  'gantry-aisle',
  // The only room with a round opening in it, and a round hole cut out of a
  // square one leaves four crescents of open space between them - 0.28 m2 of
  // it, before the hatch got the mounting plate it should always have had.
  'berth-empty',
  'station-run',
  'station-seam',
  // Off the centre line, which every other pose in this list is on. A slot in a
  // side wall is edge-on from the middle of a room and covers no pixels, so a
  // gate made entirely of centred poses cannot see one - and did not see the
  // corridor's band recess running off the end of the room uncapped, 886 pixels
  // of open space at eye height, for as long as the bands have existed.
  'station-off-line',
];

/** Space, and the exterior's darkest value. Nothing interior is authored at it. */
const VOID = [0x10, 0x1b, 0x26];

/**
 * A breach is a connected region at least this big. The smallest real hole
 * ever shipped was 886 pixels; the largest plausible 8-bit accident is a few
 * isolated pixels along one antialiased edge. 30 sits far from both.
 */
const BLOB = 30;

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
  // Mark every sentinel pixel, then flood-fill 4-connected components.
  const mask = new Uint8Array(width * height);
  let voids = 0;
  for (let i = 0; i < width * height; i += 1) {
    const p = i * channels;
    if (pixels[p] === VOID[0] && pixels[p + 1] === VOID[1] && pixels[p + 2] === VOID[2]) {
      mask[i] = 1;
      voids += 1;
    }
  }

  let largest = 0;
  let largestAt = null;
  if (voids > 0) {
    const stack = [];
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] !== 1) continue;
      // Flood one component, counting it.
      let size = 0;
      stack.length = 0;
      stack.push(i);
      mask[i] = 2;
      const sx = i % width;
      const sy = Math.floor(i / width);
      while (stack.length > 0) {
        const j = stack.pop();
        size += 1;
        const x = j % width;
        const neighbours = [
          x > 0 ? j - 1 : -1,
          x < width - 1 ? j + 1 : -1,
          j >= width ? j - width : -1,
          j + width < mask.length ? j + width : -1,
        ];
        for (const n of neighbours) {
          if (n >= 0 && mask[n] === 1) {
            mask[n] = 2;
            stack.push(n);
          }
        }
      }
      if (size > largest) {
        largest = size;
        largestAt = [sx, sy];
      }
    }
  }

  const share = ((voids / (width * height)) * 100).toFixed(2);
  console.log(`\nshots/current/${name}.png`);
  console.log(`  void pixels        : ${voids} (${share}%)`);
  console.log(
    `  largest blob       : ${largest}${largestAt ? ` at ${largestAt[0]}, ${largestAt[1]}` : ''}`
  );
  if (largest < BLOB) {
    console.log(voids === 0 ? '  PASS' : `  PASS - isolated accidents only (blob < ${BLOB})`);
    return;
  }
  console.log('  FAIL - this pose has no window in it, so that is space through a wall');
  failures += 1;
}
