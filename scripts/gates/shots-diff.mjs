#!/usr/bin/env node
/**
 * Pixel-drift gate: shots/current against the committed shots/baseline.
 *
 * docs/LOOP.md's fourth green light says unexplained pixel drift from the
 * committed baselines blocks a merge. This turns that from "a reviewer
 * eyeballs PNGs" into a mechanical check: any preset whose changed-pixel
 * share exceeds --threshold fails, and a difference image lands in
 * shots/diff for the artifact upload.
 *
 * Intentional visual changes rerun `npm run shots -- --baseline` in the same
 * PR and explain the change in the PR body - see AGENTS.md.
 *
 *   node scripts/gates/shots-diff.mjs [--max-delta N] [--threshold PCT]
 *
 * One of the gates discovered and run by scripts/gates.mjs. See docs/LOOP.md,
 * "turn taste into lint".
 */
import { readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { decodePNG, encodePNG } from '../lib/png.mjs';

const BASELINE_DIR = 'shots/baseline';
const CURRENT_DIR = 'shots/current';
const DIFF_DIR = 'shots/diff';

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const maxDelta = flag('--max-delta', 2);
const thresholdPct = flag('--threshold', 0.1);

function presetNames(dir) {
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
  );
}

const baselineNames = presetNames(BASELINE_DIR);
const currentNames = presetNames(CURRENT_DIR);

if (baselineNames.size === 0) {
  console.error(`shots-diff: no baselines in ${BASELINE_DIR}`);
  process.exit(2);
}

rmSync(DIFF_DIR, { recursive: true, force: true });

const missing = [...baselineNames].filter((n) => !currentNames.has(n)).sort();
const extra = [...currentNames].filter((n) => !baselineNames.has(n)).sort();
const matched = [...baselineNames].filter((n) => currentNames.has(n)).sort();

let failures = 0;
for (const name of missing) {
  console.log(`\n${name}`);
  console.log(`  FAIL - missing from ${CURRENT_DIR} (run npm run shots)`);
  failures += 1;
}
for (const name of extra) {
  console.log(`\n${name}`);
  console.log(
    `  FAIL - no baseline in ${BASELINE_DIR} (run npm run shots -- --baseline if intentional)`
  );
  failures += 1;
}
for (const name of matched) {
  if (!compare(name)) failures += 1;
}

const checked = missing.length + extra.length + matched.length;
console.log(`\n${checked - failures}/${checked} presets within drift threshold`);
process.exit(failures === 0 ? 0 : 1);

function compare(name) {
  const baseline = decodePNG(readFileSync(`${BASELINE_DIR}/${name}.png`));
  const current = decodePNG(readFileSync(`${CURRENT_DIR}/${name}.png`));

  console.log(`\n${name}`);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    console.log(
      `  FAIL - size changed: baseline ${baseline.width}x${baseline.height} vs current ${current.width}x${current.height}`
    );
    return false;
  }
  if (baseline.channels !== current.channels) {
    console.log(
      `  FAIL - channel layout changed: baseline ${baseline.channels} vs current ${current.channels}`
    );
    return false;
  }

  const { width, height, channels } = baseline;
  const total = width * height;
  const diffPixels = Buffer.alloc(total * 3);
  let changed = 0;

  for (let i = 0; i < total; i++) {
    let delta = 0;
    for (let c = 0; c < channels; c++) {
      delta = Math.max(
        delta,
        Math.abs(baseline.pixels[i * channels + c] - current.pixels[i * channels + c])
      );
    }
    const isChanged = delta > maxDelta;
    if (isChanged) changed += 1;
    const v = isChanged ? 255 : 0;
    diffPixels[i * 3] = v;
    diffPixels[i * 3 + 1] = v;
    diffPixels[i * 3 + 2] = v;
  }

  const share = changed / total;
  const ok = share * 100 <= thresholdPct;
  console.log(`  size               : ${width}x${height}`);
  console.log(`  changed pixels     : ${changed} (${(share * 100).toFixed(3)}%)`);
  console.log(`  threshold          : ${thresholdPct}%  (max-delta ${maxDelta})`);
  console.log(ok ? '  PASS' : '  FAIL - pixel drift exceeds threshold');

  if (!ok) {
    mkdirSync(DIFF_DIR, { recursive: true });
    writeFileSync(
      `${DIFF_DIR}/${name}.png`,
      encodePNG({ width, height, channels: 3, pixels: diffPixels })
    );
  }
  return ok;
}
