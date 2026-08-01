#!/usr/bin/env node
/**
 * Art direction as a mechanical gate.
 *
 * docs/DIRECTION.md states that VOID_SLATE (#101B26) is the darkest value in
 * the game and that there is no black anywhere. That is not a matter of taste
 * once written down - it is an assertion about pixels, and a reviewer cannot
 * hold it reliably across hundreds of iterations. This can.
 *
 *   node scripts/gates/palette.mjs [png ...]    # defaults to shots/current
 *
 * One of the gates discovered and run by scripts/gates.mjs. See docs/LOOP.md,
 * "turn taste into lint".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { decodePNG } from '../lib/png.mjs';

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

let failures = 0;
for (const path of files) check(path);
process.exit(failures === 0 ? 0 : 1);

function check(path) {
  const file = readFileSync(path);
  const { width, height, channels, pixels: out } = decodePNG(file);

  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const VOID = [0x10, 0x1b, 0x26];
  const voidLuma = luma(...VOID);

  let black = 0,
    belowVoid = 0,
    darkest = [255, 255, 255],
    darkestLuma = 1e9;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const r = out[i * channels],
      g = out[i * channels + 1],
      b = out[i * channels + 2];
    if (r === 0 && g === 0 && b === 0) black++;
    const l = luma(r, g, b);
    if (l < voidLuma - 1) belowVoid++;
    if (l < darkestLuma) {
      darkestLuma = l;
      darkest = [r, g, b];
    }
  }
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  console.log(`\n${path}`);
  console.log(`  size               : ${width}x${height}`);
  console.log(`  darkest pixel      : ${hex(darkest)}  luma ${darkestLuma.toFixed(1)}`);
  console.log(`  VOID_SLATE floor   : ${hex(VOID)}  luma ${voidLuma.toFixed(1)}`);
  console.log(`  pure black pixels  : ${black}`);
  console.log(`  below VOID_SLATE   : ${belowVoid} (${((100 * belowVoid) / total).toFixed(2)}%)`);
  // A little tolerance: antialiased edges against the background legitimately
  // land a hair under the floor. A broad region below it is a real regression.
  const share = belowVoid / total;
  const ok = black === 0 && share < 0.005;
  console.log(
    ok
      ? '  PASS'
      : `  FAIL - ${black > 0 ? 'pure black present' : 'too much of the frame is below VOID_SLATE'}`
  );
  if (!ok) failures += 1;
}
