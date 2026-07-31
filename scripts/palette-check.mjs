#!/usr/bin/env node
/**
 * Art direction as a mechanical gate.
 *
 * docs/DIRECTION.md states that VOID_SLATE (#101B26) is the darkest value in
 * the game and that there is no black anywhere. That is not a matter of taste
 * once written down - it is an assertion about pixels, and a reviewer cannot
 * hold it reliably across hundreds of iterations. This can.
 *
 *   node scripts/palette-check.mjs <png> [...more png]
 *
 * See docs/LOOP.md, "turn taste into lint".
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/palette-check.mjs <png> [...]');
  process.exit(2);
}

let failures = 0;
for (const path of files) check(path);
process.exit(failures === 0 ? 0 : 1);

function check(path) {
  const file = readFileSync(path);
  let pos = 8,
    width = 0,
    height = 0,
    bitDepth = 0,
    colorType = 0;
  const idat = [];
  while (pos < file.length) {
    const len = file.readUInt32BE(pos);
    const type = file.toString('ascii', pos + 4, pos + 8);
    const data = file.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      out[y * stride + x] = v & 0xff;
    }
  }

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
