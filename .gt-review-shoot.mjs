/** Scratch review harness: arbitrary poses in the running dev server -> PNGs + pixel stats. */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodePNG } from '/Users/johnnyklaus/ground-track/.claude/worktrees/interior/scripts/lib/png.mjs';

const URL_BASE = process.env.GT_URL ?? 'http://localhost:5190/';
const outDir = process.argv[2] ?? '/tmp/gtreview/out';
const specPath = process.argv[3] ?? '/tmp/gtreview/poses.json';
const W = 1280;
const H = 720;

const poses = JSON.parse(await readFile(specPath, 'utf8'));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

let mounted = null;
const report = [];

for (const p of poses) {
  const room = p.room ?? 'station';
  if (p.openDoor) mounted = null;
  if (mounted !== room) {
    await page.goto(new URL(`rooms.html#${room}`, URL_BASE).href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.groundTrackRooms?.ready === true, { timeout: 30000 });
    const failure = await page.evaluate(() => window.groundTrackRooms.error);
    if (failure !== null) throw new Error(`${room}: ${failure}`);
    await page.evaluate(() => window.groundTrackRooms.setPaused(true));
    mounted = room;
  }
  await page.evaluate((t) => window.groundTrackRooms.setTime(t), p.t ?? 19.3);
  if (p.openDoor) {
    await page.evaluate((pose) => window.groundTrackRooms.setPose(pose), p.pressFrom);
    const acted = await page.evaluate(() => window.groundTrackRooms.interact());
    if (!acted) throw new Error(`${p.name}: nothing to press at pressFrom`);
    await page.evaluate(
      ({ from, settle }) => {
        for (let t = from; t < from + settle; t += 0.05)
          window.groundTrackRooms.setTime(Math.min(t + 0.05, from + settle));
      },
      { from: p.t ?? 19.3, settle: p.settle ?? 2.4 }
    );
  }
  await page.evaluate((pose) => window.groundTrackRooms.setPose(pose), {
    x: p.x,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch ?? 0,
  });
  await page.waitForTimeout(200);
  const file = path.join(outDir, `${p.name}.png`);
  await page.screenshot({ path: file });

  const img = decodePNG(await readFile(file));
  const { width, height, channels, pixels } = img;
  let voidPx = 0;
  const voidPts = [];
  let sum = 0;
  const hist = new Map();
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    if (r === 0x10 && g === 0x1b && b === 0x26) {
      voidPx += 1;
      if (voidPts.length < 24 && voidPx % 137 === 1) {
        const idx = i / channels;
        voidPts.push([idx % width, Math.floor(idx / width)]);
      }
    }
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const key = `${r},${g},${b}`;
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const entry = {
    name: p.name,
    pose: { x: p.x, z: p.z, yaw: +(p.yaw ?? 0).toFixed(4), pitch: p.pitch ?? 0, t: p.t ?? 19.3 },
    voidPixels: voidPx,
    voidSamples: voidPts,
    meanLuma: +(sum / (width * height)).toFixed(1),
    topColours: top.map(([c, n]) => `${c} x${n} luma${(() => {
      const [r, g, b] = c.split(',').map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(0);
    })()}`),
  };
  report.push(entry);
  console.log(`${p.name}: void=${voidPx} meanLuma=${entry.meanLuma}`);
}

await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:');
  for (const e of errors) console.error('  ' + e);
}
