#!/usr/bin/env node
/**
 * Art direction as a mechanical gate.
 *
 * Two regimes since 2026-08-31 (docs/INTERIORS.md):
 *
 * EXTERIOR - docs/DIRECTION.md holds: VOID_SLATE (#101B26) is the darkest
 * value in orbit and there is no black anywhere. Unchanged.
 *
 * INTERIOR - the owner lifted the indoor value floor by name so recesses and
 * contact shadows can reach genuine dark. The floor moves from VOID_SLATE
 * (luma ~25.5) down to luma 5. Two things still hold indoors, and this gate
 * holds them: pure black (0,0,0) never appears - near-black is a value, black
 * is an absence - and the frame does not pool below the new floor (the same
 * 0.5% antialiasing tolerance as before).
 *
 *   node scripts/gates/palette.mjs [png ...]    # defaults to shots/current
 *
 * One of the gates discovered and run by scripts/gates.mjs. See docs/LOOP.md,
 * "turn taste into lint".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePNG } from '../lib/png.mjs';
import { isInterior } from '../lib/regimes.mjs';

// No arguments means the whole rendered set, so the gate runner can invoke
// every gate the same way.
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync('shots/current')
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => `shots/current/${f}`);

if (files.length === 0) {
  console.error('palette: no PNGs to check - run npm run shots first');
  process.exit(2);
}

/** The interior floor. Luma 5 keeps 0,0,0 unreachable with margin. */
const INTERIOR_FLOOR = 5;

let failures = 0;
for (const path of files) check(path);
process.exit(failures === 0 ? 0 : 1);

function check(path) {
  const file = readFileSync(path);
  const { width, height, channels, pixels: out } = decodePNG(file);

  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const VOID = [0x10, 0x1b, 0x26];
  const name = basename(path, '.png');
  const interior = isInterior(name);
  const floorLuma = interior ? INTERIOR_FLOOR : luma(...VOID);

  let black = 0,
    belowFloor = 0,
    darkest = [255, 255, 255],
    darkestLuma = 1e9;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const r = out[i * channels],
      g = out[i * channels + 1],
      b = out[i * channels + 2];
    if (r === 0 && g === 0 && b === 0) black++;
    const l = luma(r, g, b);
    if (l < floorLuma - 1) belowFloor++;
    if (l < darkestLuma) {
      darkestLuma = l;
      darkest = [r, g, b];
    }
  }
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  console.log(`\n${path}`);
  console.log(`  regime             : ${interior ? 'interior' : 'exterior'}`);
  console.log(`  size               : ${width}x${height}`);
  console.log(`  darkest pixel      : ${hex(darkest)}  luma ${darkestLuma.toFixed(1)}`);
  console.log(`  value floor        : luma ${floorLuma.toFixed(1)}`);
  console.log(`  pure black pixels  : ${black}`);
  console.log(`  below floor        : ${belowFloor} (${((100 * belowFloor) / total).toFixed(2)}%)`);
  // A little tolerance: antialiased edges against the background legitimately
  // land a hair under the floor. A broad region below it is a real regression.
  const share = belowFloor / total;
  const ok = black === 0 && share < 0.005;
  console.log(
    ok
      ? '  PASS'
      : `  FAIL - ${black > 0 ? 'pure black present' : 'too much of the frame is below the floor'}`
  );
  if (!ok) failures += 1;
}
