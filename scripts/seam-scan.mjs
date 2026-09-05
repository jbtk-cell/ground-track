/**
 * Render inspection poses (from seam-poses.ts, or any JSON list of
 * {name, room?, x, z, yaw, pitch, t}) against a running server and write
 * PNGs for review. Poses without a room mount #station.
 *
 *   node scripts/seam-scan.mjs <poses.json> <outDir> [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [posesFile, outDir, url = 'http://localhost:5180/'] = process.argv.slice(2);
const poses = JSON.parse(fs.readFileSync(posesFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let mounted = null;
async function mount(room) {
  if (mounted === room) return;
  await page.goto(new URL(`rooms.html?bare=1#${room}`, url).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (id) =>
      window.groundTrackRooms?.ready === true &&
      (window.groundTrackRooms.environment === id || window.groundTrackRooms.error !== null),
    room,
    { timeout: 60000 }
  );
  const failure = await page.evaluate(() => window.groundTrackRooms.error);
  if (failure) throw new Error(`${room} failed to mount: ${failure}`);
  await page.evaluate(() => window.groundTrackRooms.setPaused(true));
  mounted = room;
}

for (const pose of poses) {
  await mount(pose.room ?? 'station');
  await page.evaluate((t) => window.groundTrackRooms.setTime(t), pose.t);
  await page.evaluate(
    (p) => window.groundTrackRooms.setPose({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch }),
    pose
  );
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(outDir, `${pose.name}.png`) });
  console.log(`shot ${pose.name}`);
}

await browser.close();
console.log(`wrote ${poses.length} scans to ${outDir}`);
