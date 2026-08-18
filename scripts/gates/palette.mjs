#!/usr/bin/env node
/**
 * Art direction as a mechanical gate.
 *
 * docs/DIRECTION.md states that VOID_SLATE (#101B26) is the darkest value in
 * the game and that there is no black anywhere, and separately that the only
 * warm-negative is a desaturated rust (#A8624B, hairline) - no red anywhere
 * else. Neither is a matter of taste once written down - both are assertions
 * about pixels, and a reviewer cannot hold them reliably across hundreds of
 * iterations. This can.
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

// The sanctioned warm tokens from src/render/palette.ts, hardcoded here since
// this script runs under plain Node, outside the Vite/TS toolchain. A
// red-band pixel within RED_EXCLUDE_DISTANCE of one of these is a legitimate
// render of a sanctioned colour, not the "no red" violation this gate hunts
// for. CAUTION_RUST is the load-bearing entry: its hue (~14.8deg) sits right
// under the RED_HUE_SPAN cutoff below, so without this exclusion the game's
// own sanctioned caution colour would fail its own gate.
const WARM_TOKENS = [
  ['CAUTION_RUST', 0xa8, 0x62, 0x4b],
  ['ACCENT', 0xd9, 0x8a, 0x3c],
  ['FOIL', 0xb9, 0x9a, 0x63],
  ['SETTLEMENT', 0xc9, 0xa0, 0x63],
  ['DAWN_SAND', 0xd9, 0xc9, 0xa6],
  ['DAWN_CREAM', 0xe4, 0xd6, 0xbb],
  ['IGNITION_CORE', 0xf1, 0xe7, 0xd4],
  ['SUN_COLOUR', 0xff, 0xf0, 0xd6],
  ['EARTHSHINE_GROUND', 0xc4, 0xb1, 0x89],
];
const RED_EXCLUDE_DISTANCE = 30;

// Red band: within 15deg of pure red hue, and saturated/bright enough to read
// as an actual red rather than a warm-grey antialiasing blend near the void
// floor or a dark edge.
const RED_HUE_SPAN = 15;
const RED_SAT_MIN = 0.4;
const RED_VALUE_MIN = 0.25;
// Measured baseline (every current preset in both shots/baseline and
// shots/current) is 0 flagged pixels. This ceiling is a hairline of
// antialiasing headroom - deliberately an absolute pixel count, tighter than
// the floor check's 0.5%-of-frame share below, because a broad near-void
// gradient at an edge is expected but a broad red one never is.
const RED_CEILING = 8;

let failures = 0;
for (const path of files) check(path);
process.exit(failures === 0 ? 0 : 1);

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    diff = max - min;
  let hue = 0;
  if (diff !== 0) {
    if (max === r) hue = 60 * (((g - b) / diff) % 6);
    else if (max === g) hue = 60 * ((b - r) / diff + 2);
    else hue = 60 * ((r - g) / diff + 4);
    if (hue < 0) hue += 360;
  }
  return { hue, sat: max === 0 ? 0 : diff / max, value: max / 255 };
}

function nearWarmToken(r, g, b) {
  for (const [, tr, tg, tb] of WARM_TOKENS) {
    const d = Math.sqrt((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2);
    if (d < RED_EXCLUDE_DISTANCE) return true;
  }
  return false;
}

function check(path) {
  const file = readFileSync(path);
  const { width, height, channels, pixels: out } = decodePNG(file);

  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const VOID = [0x10, 0x1b, 0x26];
  const voidLuma = luma(...VOID);

  let black = 0,
    belowVoid = 0,
    darkest = [255, 255, 255],
    darkestLuma = 1e9,
    red = 0;
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
    const { hue, sat, value } = rgbToHsv(r, g, b);
    if (
      (hue < RED_HUE_SPAN || hue > 360 - RED_HUE_SPAN) &&
      sat > RED_SAT_MIN &&
      value > RED_VALUE_MIN &&
      !nearWarmToken(r, g, b)
    ) {
      red++;
    }
  }
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  console.log(`\n${path}`);
  console.log(`  size               : ${width}x${height}`);
  console.log(`  darkest pixel      : ${hex(darkest)}  luma ${darkestLuma.toFixed(1)}`);
  console.log(`  VOID_SLATE floor   : ${hex(VOID)}  luma ${voidLuma.toFixed(1)}`);
  console.log(`  pure black pixels  : ${black}`);
  console.log(`  below VOID_SLATE   : ${belowVoid} (${((100 * belowVoid) / total).toFixed(2)}%)`);
  console.log(`  red-band pixels    : ${red} (ceiling ${RED_CEILING})`);
  // A little tolerance: antialiased edges against the background legitimately
  // land a hair under the floor. A broad region below it is a real regression.
  const floorShare = belowVoid / total;
  const floorOk = black === 0 && floorShare < 0.005;
  const redOk = red <= RED_CEILING;
  const ok = floorOk && redOk;
  const reasons = [];
  if (black > 0) reasons.push('pure black present');
  else if (!floorOk) reasons.push('too much of the frame is below VOID_SLATE');
  if (!redOk) reasons.push('too many red-band pixels');
  console.log(ok ? '  PASS' : `  FAIL - ${reasons.join('; ')}`);
  if (!ok) failures += 1;
}
