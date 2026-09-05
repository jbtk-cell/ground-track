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
  // An uncaught throw in a pointerdown handler is a click that half ran, and
  // one shipped: setPointerCapture raises InvalidStateError once the pointer
  // lock is held, so every click in the player's browser threw. Nothing in the
  // suite noticed, because nothing was listening.
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
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

  // --- The whole game, as a person plays it: land on the page and hold W.
  //
  // The door is shut and a shut door is a wall, so this must STOP. That is the
  // barrier working, and it is checked here because the opposite defect - the
  // eye walking into a two-metre pressure slab, whole screen one flat value -
  // is what "I can't walk through the door" turned out to mean the first time.
  await page.evaluate(() => window.groundTrackRooms.setPose(window.groundTrackRooms.spawn()));
  await page.evaluate(() => window.groundTrackRooms.setPaused(false));
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 4000));
  await page.keyboard.up('w');
  const atDoor = await pose();
  check(
    'a shut door stops you rather than letting you walk into it',
    atDoor.x > -3.5 && atDoor.x < -2.0,
    `stopped at x=${atDoor.x.toFixed(2)}, door plane is -3.20`
  );

  // --- Turn to the control, press it, turn back, walk through.
  //
  // This is the mechanic, and it is the whole interaction model: no cursor, no
  // prompt, no highlight, just an arm that reaches for whatever is in front of
  // it. The button sits on the starboard jamb, 73 degrees off the axis you
  // arrive on, so it takes a deliberate look to the side - and the arm only
  // deploys inside a 55 degree cone, which is why that look is required rather
  // than optional.
  //
  // It has been broken in both directions. Once the button was the ONLY way
  // through and nobody found it, so the door was a lock. Then the door was made
  // to open on approach and the buttons were deleted as redundant, which took
  // the arm away from the one place in the room a player walks to - reported as
  // "my arm is gone and it doesn't do anything". Both halves are checked here:
  // the door does not open until it is pressed, and pressing it works.
  //
  // There is a second number here that matters as much as the cone, and it is
  // the one that bit twice: the arm DEPLOYS at 1.6 m but only GRIPS at 0.95 m.
  // In between, the limb visibly reaches for a control it will never take hold
  // of and the space bar does nothing - which is what "clicking the buttons
  // doesn't seem to work" actually was. The spawn now points straight down the
  // room's axis so the walk has no lateral component and the eye arrives at the
  // middle of the doorway, 0.73 m from the control, inside the grip.
  //
  // ArrowLeft turns toward +z, which is the side the jamb is on. 73 degrees at
  // the 1.6 rad/s key rate is 0.80 s, then a beat for the couplings to close.
  await page.keyboard.down('ArrowLeft');
  await new Promise((r) => setTimeout(r, 800));
  await page.keyboard.up('ArrowLeft');
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.press('Space');
  await new Promise((r) => setTimeout(r, 300));
  await page.keyboard.down('ArrowRight');
  await new Promise((r) => setTimeout(r, 800));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 9000));
  await page.keyboard.up('w');
  const out = await pose();
  check(
    'turning to the door control, pressing it and walking through gets you out',
    out.x < MUST_REACH_X,
    `reached x=${out.x.toFixed(2)}, needed past ${MUST_REACH_X}`
  );
  check(
    'nothing throws while the player plays',
    pageErrors.length === 0,
    pageErrors.slice(0, 2).join(' | ')
  );

  // --- The keyboard still works after clicking something in the rail.
  //
  // This is the one that made the game unplayable for a week. Every keydown was
  // gated on `typingTarget`, which counted BUTTON and A as things being typed
  // into. The rail is a list of <a> links - clicking one is how you pick a room
  // - and a clicked link keeps DOM focus, so from that moment every W and every
  // arrow was dropped before it reached the input. Drag-look still worked, so
  // the symptom was "the mouse half works and I physically cannot walk", with
  // no error anywhere. Reproduced and fixed; this is the guard.
  //
  // Done out in the corridor, where there is open floor to cover: back on the
  // deck the player is standing against a shut door, and "did not move" would
  // be the door working rather than the keyboard failing.
  await page.click('.rooms-link');
  await new Promise((r) => setTimeout(r, 1200));
  await page.waitForFunction(() => window.groundTrackRooms?.ready === true, { timeout: 20000 });
  await page.evaluate(() => window.groundTrackRooms.setPaused(false));
  const railStart = await pose();
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 3000));
  await page.keyboard.up('w');
  const railEnd = await pose();
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '?');
  check(
    'the keyboard still walks after clicking a link in the rail',
    Math.hypot(railEnd.x - railStart.x, railEnd.z - railStart.z) > 0.3,
    `focus on ${focused}, moved ${Math.hypot(railEnd.x - railStart.x, railEnd.z - railStart.z).toFixed(2)} m`
  );

  // --- Every compartment, entered and walked, on the keys a person actually has.
  //
  // The five checks above are all the limb deck and the corridor, because those
  // were the only two rooms when they were written. Ten more have been built
  // since and NONE of them had ever been walked by anything but a setPose call,
  // which is precisely the hole this file exists to close: setPose teleports, so
  // it proves the renderer can draw a pose and proves nothing at all about
  // whether a person can stand there and move. A room that spawns you inside its
  // own furniture, or on no floor, or facing a wall 30 cm away, passes every
  // other gate in this repo and is unplayable the moment it is opened.
  //
  // The room list comes from the live registry rather than a literal, so a
  // thirteenth compartment is covered the day it is registered and nobody has to
  // remember to add it here. That is the same allow-list failure the flatness
  // gate shipped with, and it is not worth making twice.
  const ids = await page.evaluate(() => window.groundTrackRooms.environments);
  const stuck = [];
  for (const id of ids) {
    await page.goto(`http://localhost:${PORT}/rooms.html#${id}`);
    await page.waitForFunction(
      (room) =>
        window.groundTrackRooms?.ready === true &&
        (window.groundTrackRooms.environment === room || window.groundTrackRooms.error !== null),
      id,
      { timeout: 20000 }
    );
    const failure = await page.evaluate(() => window.groundTrackRooms.error);
    if (failure !== null) {
      stuck.push(`${id}: ${failure}`);
      continue;
    }
    await page.evaluate(() => window.groundTrackRooms.setPaused(false));
    // Turn first, then walk. Spawning nose-on to a bulkhead is a legitimate way
    // to author a room, and a walk test that only ever presses W would call it
    // broken; a quarter turn either side finds real floor if any is reachable.
    let best = 0;
    for (const turn of ['', 'ArrowLeft', 'ArrowRight']) {
      const from = await page.evaluate(() => window.groundTrackRooms.pose());
      if (turn !== '') {
        await page.keyboard.down(turn);
        await new Promise((r) => setTimeout(r, 500));
        await page.keyboard.up(turn);
      }
      await page.keyboard.down('w');
      await new Promise((r) => setTimeout(r, 700));
      await page.keyboard.up('w');
      const to = await page.evaluate(() => window.groundTrackRooms.pose());
      best = Math.max(best, Math.hypot(to.x - from.x, to.z - from.z));
      if (best >= 0.1) break;
    }
    if (best < 0.1) stuck.push(`${id}: moved ${best.toFixed(3)} m`);
  }
  check(
    'every compartment can be entered and walked with the keys',
    stuck.length === 0,
    stuck.length === 0 ? `${ids.length} walked` : stuck.join('; ')
  );

  // --- The Blender-built seams, walked rather than asserted.
  //
  // Three of the station's compartments are .glb rooms now (plot, crawl,
  // bend), and the whole point of giving them real ports was that a player
  // walks from one into the next through a continuous floor. That continuity
  // is exactly the kind of claim that passes every picture gate while being
  // false - a seam floor 2 cm short, a cap that never unsealed - so it is
  // walked here, on the keys. Positions are station coordinates from layOut:
  // the plot sits at (-23.25, -0.45) with identity rotation, its aft seam at
  // x -25.55 and its spur seam at z -2.15.
  await page.goto(`http://localhost:${PORT}/rooms.html#station`);
  await page.waitForFunction(() => window.groundTrackRooms?.ready === true, { timeout: 20000 });
  await page.evaluate(() => window.groundTrackRooms.setPaused(false));

  await page.evaluate(() =>
    window.groundTrackRooms.setPose({ x: -24.1, z: 0.1, yaw: Math.PI / 2, pitch: 0 })
  );
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 3000));
  await page.keyboard.up('w');
  const inBend = await pose();
  check(
    'walking aft out of the plot crosses the seam into the bend',
    inBend.x < -25.8,
    `reached x=${inBend.x.toFixed(2)}, seam is -25.55`
  );

  await page.evaluate(() =>
    window.groundTrackRooms.setPose({ x: -23.65, z: -0.8, yaw: 0, pitch: 0 })
  );
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 3000));
  await page.keyboard.up('w');
  const inCrawl = await pose();
  check(
    'walking the spur out of the plot crosses the seam into the crawl',
    inCrawl.z < -2.6,
    `reached z=${inCrawl.z.toFixed(2)}, seam is -2.15`
  );

  // --- A locked door is a wall until its key turns, and a doorway after.
  //
  // Deck One's secret rooms are the first gameplay the station has that is
  // ABOUT state: the drystores' east panel leads to THE VOID only once
  // 'sounding' is unlocked. Both halves are claims a picture cannot test -
  // a blank that stops nobody, or a key that opens nothing, would each pass
  // every shot in the repo. Walked here, on the keys, both sides of the key.
  await page.evaluate(() =>
    window.groundTrackRooms.setPose({ x: -24.9, z: 23.7, yaw: -Math.PI / 2, pitch: 0 })
  );
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.up('w');
  const atLocked = await pose();
  check(
    'a locked secret door stops the walk',
    atLocked.x < -23.9,
    `stopped at x=${atLocked.x.toFixed(2)}, the void's seam is -23.95`
  );
  await page.evaluate(() => window.groundTrackRooms.unlock('sounding'));
  await page.evaluate(() =>
    window.groundTrackRooms.setPose({ x: -24.9, z: 23.7, yaw: -Math.PI / 2, pitch: 0 })
  );
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 2000));
  await page.keyboard.up('w');
  const inVoid = await pose();
  check(
    'the same door opens when its key is unlocked',
    inVoid.x > -23.9,
    `reached x=${inVoid.x.toFixed(2)} past the seam at -23.95`
  );

  // --- The rebuilt flight deck, played rather than posed.
  //
  // The plot spawn faces the console; holding W walks a body to the rail, and
  // inside 1.6 m of the card slot the limb must deploy on its own - the reach
  // IS the interface, and it has broken twice in ways only a real walk shows
  // (deploy-but-never-grip, and an arm that vanished entirely). setPose
  // proves nothing here; this is the same walk a player makes.
  await page.goto(`http://localhost:${PORT}/rooms.html#plot`);
  await page.waitForFunction(
    () =>
      window.groundTrackRooms?.ready === true &&
      (window.groundTrackRooms.environment === 'plot' || window.groundTrackRooms.error !== null),
    { timeout: 20000 }
  );
  await page.evaluate(() => window.groundTrackRooms.setPaused(false));
  // Walk to the desk, then TURN to it - the spawn's walking line passes the
  // console, and an arm only deploys for what the eye is on. The first cut
  // of this check walked 1.7 s and read the limb still facing down-room:
  // tracking, reach zero, exactly the deploy-never-grip class it hunts.
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.up('w');
  await page.keyboard.down('ArrowLeft');
  await new Promise((r) => setTimeout(r, 1200));
  await page.keyboard.up('ArrowLeft');
  await new Promise((r) => setTimeout(r, 900));
  const reach = await page.evaluate(() => ({
    limb: window.groundTrackRooms.limb(),
    pose: window.groundTrackRooms.pose(),
  }));
  // Non-null alone is not deployment: limb() answers the moment a target is
  // merely eyed. reach > 0.5 requires the walk to have actually closed most
  // of the deploy envelope - which also proves the body left spawn.
  const deployed = reach.limb !== null && reach.limb.reach > 0.5;
  check(
    'walking to the flight deck console deploys the limb for the card slot',
    deployed,
    reach.limb === null
      ? `no reach at x=${reach.pose.x.toFixed(2)}, z=${reach.pose.z.toFixed(2)}`
      : `limb reach ${reach.limb.reach.toFixed(2)}, open ${reach.limb.open.toFixed(2)} at x=${reach.pose.x.toFixed(2)}`
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
