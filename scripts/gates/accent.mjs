#!/usr/bin/env node
/**
 * The one-accent rule as a mechanical gate.
 *
 * DIRECTION.md: "#D98A3C, permitted on exactly two things: the primary
 * action and the live burn." That is two separate claims - one about the
 * source (nothing else may reference the colour) and one about what lands on
 * screen (nothing else may render it) - so this gate checks both.
 *
 * Source check: every file under src/ (plus index.html) is scanned for the
 * literal hex, case-insensitive. The three canonical definition sites are
 * the only allowed matches; everywhere else must go through PALETTE.ACCENT
 * or the CSS custom properties those sites define. Docs are exempt - stating
 * the colour in prose isn't the same as rendering it.
 *
 * Frame check: every rendered preset in shots/current is scanned for pixels
 * close to the accent colour. The live burn (mission-burn) is the one preset
 * allowed a real patch of it - the burn mark plus the plume cone - bounded
 * just above today's measured baseline. Every other preset gets only enough
 * headroom for antialiasing; setPaused forces the caret off in every shot,
 * so no preset should show the "primary action" use at all.
 *
 *   node scripts/gates/accent.mjs [png ...]    # PNGs default to shots/current
 *
 * One of the gates discovered and run by scripts/gates.mjs. See docs/LOOP.md,
 * "turn taste into lint".
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { decodePNG } from '../lib/png.mjs';

const ACCENT_HEX = 'd98a3c';
const ACCENT_RGB = [0xd9, 0x8a, 0x3c];

// The only files allowed to spell the hex literal. Everything else must
// reference PALETTE.ACCENT or one of these files' own CSS custom properties.
const ALLOWLIST = new Set(['src/render/palette.ts', 'src/style.css', 'src/ui/pad.css']);

// A pixel counts as "the accent" within this Euclidean RGB distance. 25
// cleanly separates the burn mark/plume/caret (0-15 in the measured
// baseline) from unrelated warm tones elsewhere in the frame (nearest
// baseline neighbour sits above 45).
const COLOR_DISTANCE = 25;

// Every preset except the live burn: measured baseline is 0 accent pixels
// everywhere; this just leaves room for antialiasing. A masthead-sized test
// element (DIRECTION.md's acceptance check) runs into the hundreds of
// pixels, so it trips this easily.
const STRAY_CEILING = 8;

// mission-burn: measured baseline is 46 pixels (6x6 burn mark plus the
// plume cone's silhouette). Ceiling sits comfortably above that so ordinary
// rendering variance doesn't flap the gate, but nowhere near a second UI
// element's worth of pixels.
const BURN_PRESET = 'mission-burn';
const BURN_CEILING = 70;

let failures = 0;
failures += sourceCheck();
failures += frameCheck();
process.exit(failures === 0 ? 0 : 1);

function sourceCheck() {
  const files = execFileSync('git', ['ls-files', 'src', 'index.html'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  const offenders = [];
  for (const file of files) {
    if (ALLOWLIST.has(file)) continue;
    if (readFileSync(file, 'utf8').toLowerCase().includes(ACCENT_HEX)) offenders.push(file);
  }

  console.log('accent (source)');
  if (offenders.length === 0) {
    console.log(`  PASS - #D98A3C appears only in ${[...ALLOWLIST].join(', ')}`);
    return 0;
  }
  console.log(`  FAIL - #D98A3C literal outside the allowlist:`);
  for (const file of offenders) console.log(`    ${file}`);
  return 1;
}

function frameCheck() {
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync('shots/current')
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => `shots/current/${f}`);

  if (files.length === 0) {
    console.error('\naccent (frames): no PNGs to check - run npm run shots first');
    return 1;
  }

  let failures = 0;
  for (const path of files) failures += checkFrame(path);
  return failures;
}

function checkFrame(path) {
  const file = readFileSync(path);
  const { width, height, channels, pixels } = decodePNG(file);
  const total = width * height;

  let accentPixels = 0;
  for (let i = 0; i < total; i++) {
    const r = pixels[i * channels];
    const g = pixels[i * channels + 1];
    const b = pixels[i * channels + 2];
    const d = Math.sqrt(
      (r - ACCENT_RGB[0]) ** 2 + (g - ACCENT_RGB[1]) ** 2 + (b - ACCENT_RGB[2]) ** 2
    );
    if (d < COLOR_DISTANCE) accentPixels++;
  }

  const name = path
    .split('/')
    .pop()
    .replace(/\.png$/, '');
  const ceiling = name === BURN_PRESET ? BURN_CEILING : STRAY_CEILING;
  const ok = accentPixels <= ceiling;
  console.log(`\n${path}`);
  console.log(`  accent-coloured pixels : ${accentPixels} (ceiling ${ceiling})`);
  console.log(ok ? '  PASS' : '  FAIL - too many accent-coloured pixels');
  return ok ? 0 : 1;
}
