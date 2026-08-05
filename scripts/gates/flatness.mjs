/**
 * Is anything actually happening in this frame?
 *
 * An outside review measured what the existing gates could not see. Every gate
 * this project had asks whether a frame is CORRECT - nothing below VOID_SLATE,
 * no stray accent, no pure black, matches its baseline. A frame can pass all of
 * them and still be a rectangle of one colour, and most of them were: a single
 * 8-value luminance bucket covered 60.5% of the average frame across the
 * station, 83.6% in the corridor, 97.8% at its worst. The corridor's ceiling,
 * both walls, floor and frame uprights all measured between 43 and 45.
 *
 * Two numbers catch that, and neither needs to know what the room is of:
 *
 *   FLATNESS  the share of the frame in its single most common 8-value bucket.
 *             A room with a value structure spreads its pixels across several.
 *   SPREAD    lightest minus darkest. The corridor's worst frame was 4.
 *
 * Both are deliberately crude. A frame can be beautiful and fail these, and a
 * frame can pass them and be ugly - they are a floor, not a judgement. What they
 * make impossible is shipping a room nobody looked at.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIR = path.join(process.cwd(), 'shots', 'current');

/** No single 8-value bucket may cover more than this share of a frame. */
const FLATNESS_LIMIT = 0.4;
/** Lightest minus darkest, out of 255. */
const SPREAD_FLOOR = 90;

/**
 * Frames exempt from the spread floor, with the reason.
 *
 * An exemption is a claim that a frame is SUPPOSED to be nearly uniform, and it
 * has to be argued rather than assumed - which is why this list is here and not
 * a flag on the preset.
 */
const EXEMPT = new Map([
  ['deck-eclipse', 'the planet is in shadow; a bright pixel would be the bug'],
]);

/**
 * Only interior frames are judged.
 *
 * An orbital frame is mostly space, and space is legitimately one value - that
 * is the whole point of a hairline orbit against a void. Holding an exterior
 * shot to an interior's value structure would fail it for being correct. These
 * are the presets that show a room a person is standing in.
 */
const INTERIOR = /^(deck|spine|node|station)-/;

function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colourType = 6;
  const idat = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`${file}: only 8-bit PNGs, got ${bitDepth}`);
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`${file}: unsupported colour type ${colourType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp];
    rp += 1;
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      const x = line[i];
      let value;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`${file}: bad filter ${filter}`);
      cur[i] = value & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

function measure(file) {
  const { width, height, channels, pixels } = readPng(file);
  const buckets = new Uint32Array(32);
  let min = 255;
  let max = 0;
  let total = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    const l = Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
    buckets[l >> 3] += 1;
    if (l < min) min = l;
    if (l > max) max = l;
    total += 1;
  }
  let peak = 0;
  for (const count of buckets) peak = Math.max(peak, count);
  return { width, height, flatness: peak / total, spread: max - min, min, max };
}

const files = fs.existsSync(DIR)
  ? fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.png'))
      .sort()
  : [];

if (files.length === 0) {
  console.error(`no PNGs in ${DIR} - run "npm run shots" first`);
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const name = file.replace(/\.png$/, '');
  if (!INTERIOR.test(name)) continue;
  const m = measure(path.join(DIR, file));
  const exempt = EXEMPT.get(name);
  const flatBad = m.flatness > FLATNESS_LIMIT;
  const spreadBad = m.spread < SPREAD_FLOOR && exempt === undefined;
  const ok = !flatBad && !spreadBad;
  const flags = [];
  if (flatBad) flags.push(`FLAT ${(100 * m.flatness).toFixed(1)}% in one bucket`);
  if (spreadBad) flags.push(`NARROW spread ${m.spread}`);
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(16)} ` +
      `flatness ${(100 * m.flatness).toFixed(1).padStart(5)}%  ` +
      `spread ${String(m.spread).padStart(3)} (${m.min}-${m.max})` +
      (exempt !== undefined ? `  exempt: ${exempt}` : '') +
      (flags.length > 0 ? `  <- ${flags.join(', ')}` : '')
  );
  if (!ok) failures += 1;
}

console.log(
  failures === 0
    ? `\nflatness: PASS (${files.length} frames)`
    : `\nflatness: FAIL (${failures} of ${files.length} frames)`
);
process.exit(failures === 0 ? 0 : 1);
