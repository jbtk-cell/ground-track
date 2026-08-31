#!/usr/bin/env node
/**
 * The measurement half of the interior tuning loop.
 *
 * docs/INTERIORS.md states value targets a rebuilt room must hit; this prints
 * where a frame actually is, so tuning is a measured iteration rather than an
 * argument with one's own eyes. Not a gate - the gates hold the floor; this
 * is the instrument you look at while deciding which lamp to touch.
 *
 *   node scripts/measure.mjs [name-regex]     # default: rebuilt frames
 */
import { readdirSync, readFileSync } from 'node:fs';
import { decodePNG } from './lib/png.mjs';
import { isRebuilt } from './lib/regimes.mjs';

const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
const files = readdirSync('shots/current')
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.replace(/\.png$/, ''))
  .filter((name) => (filter ? filter.test(name) : isRebuilt(name)))
  .sort();

if (files.length === 0) {
  console.error('measure: no matching frames in shots/current');
  process.exit(2);
}

for (const name of files) {
  const { width, height, channels, pixels } = decodePNG(readFileSync(`shots/current/${name}.png`));
  const total = width * height;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < total; i += 1) {
    const p = i * channels;
    const l = Math.round(
      0.2126 * (pixels[p] ?? 0) + 0.7152 * (pixels[p + 1] ?? 0) + 0.0722 * (pixels[p + 2] ?? 0)
    );
    histogram[l] += 1;
  }
  const share = (lo, hi) => {
    let count = 0;
    for (let l = lo; l <= hi; l += 1) count += histogram[l] ?? 0;
    return (100 * count) / total;
  };
  const percentile = (p) => {
    let acc = 0;
    for (let l = 0; l < 256; l += 1) {
      acc += histogram[l] ?? 0;
      if (acc >= total * p) return l;
    }
    return 255;
  };
  const buckets = new Uint32Array(32);
  for (let l = 0; l < 256; l += 1) buckets[l >> 3] += histogram[l] ?? 0;
  let peakBucket = 0;
  let peakAt = 0;
  for (let b = 0; b < 32; b += 1) {
    if ((buckets[b] ?? 0) > peakBucket) {
      peakBucket = buckets[b] ?? 0;
      peakAt = b;
    }
  }

  console.log(`\n${name}`);
  console.log(
    `  sub-floor <5    : ${share(0, 4).toFixed(2)}%     near-black 5-16 : ${share(5, 16).toFixed(1)}%  (target 8-15 hero)`
  );
  console.log(
    `  low 17-45       : ${share(17, 45).toFixed(1)}%     kick 46-80      : ${share(46, 80).toFixed(1)}%`
  );
  console.log(
    `  mid 81-150      : ${share(81, 150).toFixed(1)}%    (warm mid target 50-65 with low)   bright 151-215  : ${share(151, 215).toFixed(1)}%`
  );
  console.log(
    `  over 253        : ${share(254, 255).toFixed(2)}%     p2/p50/p98      : ${percentile(0.02)}/${percentile(0.5)}/${percentile(0.98)}`
  );
  console.log(
    `  peak bucket     : ${((100 * peakBucket) / total).toFixed(1)}% at luma ${peakAt * 8}-${peakAt * 8 + 7}  (limit 25%)`
  );
}
