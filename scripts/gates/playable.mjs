/**
 * Can a person actually play this?
 *
 * Every other gate in here renders a frame from a pose somebody chose and looks
 * at the pixels. Three separate defects walked straight past all of them, and
 * they were all the same kind of defect - not "the picture is wrong" but "the
 * controls do not work":
 *
 *   1. Clicking the canvas and moving the mouse turned the view by exactly
 *      zero. Pointer lock is a permission; when the browser declines it, the
 *      drag fallback was gated behind a rejection handler that only fires if
 *      requestPointerLock returns a promise AND that promise rejects. Safari
 *      returns undefined. So both look paths were dead, permanently.
 *   2. The spawn faces 60 degrees off the bow and the only door is behind you,
 *      so a player who cannot turn cannot reach it. "I can't look around" and
 *      "I can't walk through the door" were one bug.
 *   3. Before that, a shut door was not a barrier at all, so the eye walked
 *      into the slab; then it was a barrier whose only control sat outside the
 *      hand's reach cone, which is a lock.
 *
 * Unit tests missed all three because they called the functions directly, and
 * the shot harness missed them because it teleports with setPose and never
 * touches a key. This gate does what a player does: clicks, drags, presses
 * arrows, holds W. If it fails, the game is unplayable, whatever the pictures
 * look like.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4399;
/** How far along the station a player must get, metres from the anchor. */
const MUST_REACH_X = -12;

function serve() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite preview did not start');
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${detail}`}`);
}

const child = serve();
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${PORT}/rooms.html#station`);
  await page.waitForFunction(() => window.groundTrackRooms?.ready === true, { timeout: 20000 });

  const yaw = () => page.evaluate(() => window.groundTrackRooms.pose().yaw);
  const pose = () => page.evaluate(() => window.groundTrackRooms.pose());

  // --- Looking, on the very first click, with no prior failed attempt.
  const y0 = await yaw();
  await page.mouse.move(640, 360);
  await page.mouse.down();
  for (let i = 1; i <= 20; i += 1) await page.mouse.move(640 + i * 20, 360);
  await page.mouse.up();
  const y1 = await yaw();
  check(
    'the mouse turns the view on the first click',
    Math.abs(y1 - y0) > 0.05,
    `yaw ${y0.toFixed(2)} -> ${y1.toFixed(2)}`
  );

  // --- Looking on the keyboard, which no permission can refuse.
  await page.keyboard.down('ArrowLeft');
  await new Promise((r) => setTimeout(r, 700));
  await page.keyboard.up('ArrowLeft');
  const y2 = await yaw();
  check(
    'the arrow keys turn the view',
    Math.abs(y2 - y1) > 0.3,
    `yaw ${y1.toFixed(2)} -> ${y2.toFixed(2)}`
  );

  // --- Walking the station, from the spawn, keyboard only, pressing nothing.
  await page.evaluate(() => window.groundTrackRooms.setPose(window.groundTrackRooms.spawn()));
  await page.evaluate(() => window.groundTrackRooms.setPaused(false));
  await page.keyboard.down('ArrowLeft');
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 9000));
  await page.keyboard.up('w');
  const end = await pose();
  check(
    'a player can turn round at the spawn and walk out through the door',
    end.x < MUST_REACH_X,
    `reached x=${end.x.toFixed(2)}, needed past ${MUST_REACH_X}`
  );
} finally {
  await browser?.close();
  child.kill();
}

const failed = results.filter((r) => !r.ok).length;
console.log(
  failed === 0
    ? `\nplayable: PASS (${results.length} checks)`
    : `\nplayable: FAIL (${failed} of ${results.length} checks)`
);
process.exit(failed === 0 ? 0 : 1);
