#!/usr/bin/env node
/**
 * Renders every canonical camera preset to a PNG.
 *
 * These are the visual regression baselines. The review loop reads these images
 * and judges them against docs/DIRECTION.md; unexplained drift from
 * shots/baseline blocks a merge. See docs/LOOP.md.
 *
 * Two pages are shot, because the project has two: index.html, which is the
 * game, and rooms.html, which mounts one environment and nothing else
 * (docs/ENVIRONMENTS.md). The interior presets below drive the second one -
 * they are poses inside a room rather than framings of a planet, so they carry
 * their own clock time and standing position instead of naming a CameraPreset.
 *
 *   npm run shots                  render into shots/current
 *   npm run shots -- --baseline    overwrite shots/baseline (deliberate act)
 *   npm run shots -- --url <url>   shoot an already-running server
 */
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const WIDTH = 1600;
const HEIGHT = 900;
/** Frozen clock, so a screenshot is a function of the code alone. */
const FIXED_TIME = 0;
const PORT = 4318;

/**
 * Interior presets: one pose inside one environment, at one pinned second of
 * the orbital clock.
 *
 * deck-eclipse is first deliberately. docs/ENVIRONMENTS.md: eclipse is where an
 * interior fails, and it fails by going flat and grey rather than by going
 * black, so it is the frame to look at before anything else is polished.
 *
 * Times are wall seconds since the room was built, and the room runs at 20x, so
 * one revolution is 277.7 s. Phase 0 is local noon; the room spawns at 335
 * degrees, twenty-five seconds short of it.
 */
const INTERIOR_PRESETS = [
  {
    // Deep umbra, phase 185 degrees. Same pose as deck-noon, so the pair is a
    // controlled comparison: what is left when the sun goes out is the lamps,
    // the earthshine through the bay, and whether the hull still has facets.
    name: 'deck-eclipse',
    room: 'limb-deck',
    t: 158.1,
    pose: { x: -1.6, z: 0.9, yaw: -0.75, pitch: -0.16 },
  },
  {
    // Local noon, phase 0. The shaft stands on the deck under the bay and the
    // starboard hull carries the sun.
    name: 'deck-noon',
    room: 'limb-deck',
    t: 19.3,
    pose: { x: -1.6, z: 0.9, yaw: -0.75, pitch: -0.16 },
  },
  {
    // At the bay, which is the shot the compositional law is checked against:
    // Earth's lit surface across 30-40 per cent of the aperture, at the 62
    // degree interior FOV that shipped.
    name: 'deck-window',
    room: 'limb-deck',
    t: 30,
    pose: { x: -0.7, z: -1.5, yaw: -0.04, pitch: -0.22 },
  },
  {
    // The aft bulkhead: the closed hatch that is the future door, the name
    // placard, and the sun-bearing dial with its needle 25 degrees short of
    // twelve o'clock.
    name: 'deck-aft',
    room: 'limb-deck',
    t: 0,
    pose: { x: -1.45, z: -0.32, yaw: Math.PI / 2, pitch: -0.03 },
  },
  {
    // At the test button, mid-orbit, with the limb strung out across the lower
    // frame: the couplings open, the hand stands off the last segment, and the
    // state ring sits in clear air outside the gripper.
    name: 'deck-reach',
    room: 'limb-deck',
    t: 19.3,
    pose: { x: 2.15, z: 1.35, yaw: Math.PI, pitch: -0.334 },
  },
  {
    // The same pose with the button pressed, in ECLIPSE, and it is here because
    // the four shots above missed a real defect. The live ring used to be lit
    // MINT plus a MINT emissive term, which rendered at 255,255,247 across eight
    // thousand pixels - blown white, in a game with no white and no bloom - and
    // the palette gate passed the whole time, because no pinned shot had ever
    // stood at a control and operated it. A gate only covers the states it
    // renders. Eclipse rather than noon so the step is measured with nothing
    // else in the room to hide behind.
    name: 'deck-press',
    room: 'limb-deck',
    t: 158.1,
    pose: { x: 2.15, z: 1.35, yaw: Math.PI, pitch: -0.334 },
    press: true,
  },
  {
    // The aft door standing open, from close enough that the jamb, the pocket
    // over the opening and the tunnel behind are all in frame at once.
    //
    // The open state had no pinned shot, and that is how a door shipped whose
    // header stood out through the roof and whose bulkhead was missing a
    // 140-degree cone either side of it. An interior frame containing any
    // VOID_SLATE at all is a hole to space; this is the pose most likely to
    // show one.
    name: 'deck-door',
    room: 'limb-deck',
    t: 19.3,
    // Stood in front of and waited out, which is now the only way this door
    // opens - it has no button, because neither of the two it had could be
    // reached before the door was already running. 2.6 s covers the 0.28 s
    // latch and the 1.55 s travel with room to spare, and the pose is inside
    // the 3.4 m the door summons from, so standing here is the whole input.
    pose: { x: -1.55, z: 0.35, yaw: Math.PI / 2, pitch: -0.02 },
    settle: 2.6,
  },
  {
    // THE SPINE, from one end. The room is a proportion and a vanishing point
    // rather than a set of objects, so the pinned pose is dead centre looking
    // down the run - the one view that shows what the room is for.
    name: 'spine-run',
    room: 'spine',
    t: 19.3,
    pose: { x: 4.6, z: 0, yaw: Math.PI / 2, pitch: 0 },
  },
  {
    // The seam, from the corridor side, with the limb deck's shut door beyond
    // it. This is the only preset that renders two compartments at once, which
    // is the whole reason it exists: cross-room defects - a light from one room
    // falling on another, a hole where two hulls meet, a floor that steps - are
    // invisible in any shot of a single room.
    name: 'station-seam',
    room: 'station',
    t: 19.3,
    pose: { x: -8, z: 0, yaw: -Math.PI / 2, pitch: 0 },
  },
  {
    // THE CROSSING, from just inside the door you arrive by, looking up the
    // room. The room's whole claim is that its ceiling climbs away from you and
    // that no two of its four openings are alike, and this is the one pose where
    // both are true at once or neither is.
    name: 'crossing-run',
    room: 'crossing',
    t: 19.3,
    pose: { x: 1.9, z: 0, yaw: Math.PI / 2, pitch: 0.06 },
  },
  {
    // The same room off the centre line, which is where the raised platform, the
    // wide gallery opening and the diagonal trunk all separate from each other.
    // Also the airtight pose: a slot in a side wall is edge-on from the middle
    // of a room and covers no pixels, so a centred frame cannot see one.
    name: 'crossing-off-line',
    room: 'crossing',
    t: 19.3,
    pose: { x: 1.9, z: 1.3, yaw: Math.PI / 2, pitch: 0.04 },
  },
  {
    // Deep in the corridor with the limb deck streamed in behind. Same pose as
    // spine-run but mounted as part of the station, so the two frames are a
    // controlled comparison: anything that differs between them is something
    // the station is doing to the room.
    name: 'station-run',
    room: 'station',
    t: 19.3,
    pose: { x: -7, z: 0, yaw: Math.PI / 2, pitch: 0 },
  },
  {
    // THE CROWN, from the deck looking up. The room is a height and nothing else,
    // so the pinned pose is the one that contains the height: the plot table in
    // the lower frame, three galleries stacked above it, the aperture at the top.
    name: 'crown-up',
    room: 'crown',
    t: 19.3,
    pose: { x: 2.2, z: 0, yaw: Math.PI / 2, pitch: 0.42 },
  },
  {
    // And off the centre line at eye level, which is the pose that finds a slot
    // in a side wall. Nine metres of wall is a lot of groove to leave open.
    name: 'crown-off-line',
    room: 'crown',
    t: 19.3,
    pose: { x: 2.2, z: 1.7, yaw: Math.PI / 2, pitch: 0.05 },
  },
  {
    // THE BEND, from just inside the fore end, looking round the turn. The room
    // is the fact that you cannot see the other end of it, so this is the pose
    // where that is true or the fourteen facets were not worth building.
    name: 'bend-turn',
    room: 'bend',
    t: 19.3,
    pose: { x: 0.42, z: 3.3, yaw: -Math.PI / 2, pitch: 0 },
  },
  {
    // THE PLOT, off the centre line, from the door toward the console. The room
    // is where the card prints, so the pose is the one a player stands in.
    name: 'plot-console',
    room: 'plot',
    t: 19.3,
    pose: { x: 1.6, z: 0.9, yaw: Math.PI / 2, pitch: -0.04 },
  },
  {
    // THE RACKS, down the aisle. The aisle is 0.95 m wide, so "off the centre
    // line" here is 0.3 m; any further and you are inside a rack.
    name: 'racks-aisle',
    room: 'racks',
    t: 19.3,
    pose: { x: 3.4, z: 0.3, yaw: Math.PI / 2, pitch: 0 },
  },
  {
    // THE CRAWL, from the mouth toward the blind end, where the deck rises and
    // the headroom closes to 0.21 m over a standing eye.
    name: 'crawl-run',
    room: 'crawl',
    t: 19.3,
    pose: { x: 2.8, z: 0.2, yaw: Math.PI / 2, pitch: 0.02 },
  },
  {
    // THE MAGAZINE, off centre, on the upper deck. The only silent room and the
    // only one with no artificial light in it at all.
    name: 'magazine-bay',
    room: 'magazine',
    t: 19.3,
    // Backed into the corner, off the centre line, looking diagonally across
    // the room at the probe on the far wall.
    //
    // The first version stood at x=1.8, z=1.2, a metre from the restraint
    // frame, and 65% of the frame was one dark mass a metre from the lens -
    // the worst-measuring picture in the station, and not because the room is
    // dark. Two attempts to fix it by moving the lighting in opposite
    // directions each moved the number by less than a percent, which is what
    // finally identified the pose. A room photographed from inside its own
    // furniture is not a photograph of the room.
    pose: { x: 2.15, z: 2.05, yaw: 0.79, pitch: -0.04 },
  },
  {
    // The same corridor, OFF the centre line, looking back at the door.
    //
    // Every other interior pose in this file stands dead centre, and that is a
    // blind spot rather than a style: a slot in a side wall is exactly edge-on
    // from the middle of the room and covers no pixels at all. The work band is
    // recessed 0.08 m into the wall and its groove ran off the end of the room
    // uncapped, which is a slot straight through to space for the full length
    // of both walls at eye height - and every centred pose walked past it.
    //
    // Reported as "I can see through holes on either side of the door". This is
    // the pose that shows them: 886 pixels of VOID_SLATE before the fix, none
    // after. Held at the wall margin, which is as far off the line as a player
    // can actually stand.
    name: 'station-off-line',
    room: 'station',
    t: 19.3,
    pose: { x: -8.04, z: 0.55, yaw: -Math.PI / 2, pitch: 0 },
  },
  {
    // THE SILL from the port aisle, looking diagonally across the hole at the
    // wide door in the far wall.
    //
    // The first version of this pose stood on the grating itself, on the centre
    // line of the room, looking straight down its long axis - which is the one
    // place in the compartment the coves deliberately do not reach, aimed at
    // the one direction with nothing in it. It measured a fifteen-value range
    // across the whole frame. A pinned pose is an argument about what a room
    // is, and standing in a room's blind spot makes the argument that it is
    // empty.
    //
    // From here the kerb, both rails, the bars and the lit sump under them are
    // all in frame at once, and so is the register on the far side - and it is
    // still off the centre line, which is the rule the pose has to keep.
    name: 'sill-drop',
    room: 'sill',
    t: 19.3,
    pose: { x: 2.05, z: 1.45, yaw: 1.05, pitch: -0.3 },
  },
  {
    // THE GANTRY from one aisle in, not the middle one. The room's claim is
    // that it is the widest deck in the station under the lowest ceiling, and
    // both of those are only legible off the centre line: down the central
    // aisle the ranks frame the shot symmetrically and the ceiling reads as a
    // corridor roof. From here it is a forest, and the lighting inversion -
    // tanks brighter at their bases, deck lighter than the roof - is measurable
    // against three ranks at once.
    name: 'gantry-aisle',
    room: 'gantry',
    t: 19.3,
    pose: { x: 3.8, z: 1.64, yaw: Math.PI / 2, pitch: -0.06 },
  },
  {
    // THE BERTH, off the centre line, looking across the empty deck at the
    // round hatch. The room's whole argument is that there is nothing in the
    // middle of it, and an argument about absence needs the absence in frame:
    // deck, sockets, wear, and the far wall, with the eye finding no object
    // between here and there. Off-centre both because that is the rule and
    // because a drum shot down its own axis is a bullseye rather than a room.
    name: 'berth-empty',
    room: 'berth',
    t: 19.3,
    pose: { x: 1.5, z: 0.75, yaw: Math.PI / 2, pitch: -0.06 },
  },
];

/**
 * How far the eye may end up from where the preset put it, metres.
 *
 * Not zero, because `setPose` is allowed to snap: it stands the camera on the
 * floor, and a pose authored a centimetre outside a rectangle is meant to be
 * pulled back onto it rather than refused. Nothing legitimate moves further
 * than a hand's width, so anything past this is the pose not having been
 * applied at all.
 */
const POSE_TOLERANCE_M = 0.2;

/**
 * Write one frame, and do not let a slow one be mistaken for a broken one.
 *
 * Everything here renders through SwiftShader, in software, on the CPU. A
 * single frame of the nine-compartment station is a great deal more work than
 * a frame of one room, and Playwright's default screenshot timeout is short
 * enough that a machine under load loses it now and then - not always, and not
 * on the same preset twice, which is exactly the signature of a timing limit
 * rather than a fault.
 *
 * A run that dies two thirds of the way through leaves a shots directory that
 * is part fresh and part missing, and the gates downstream then report the
 * absent frames as failures of the room. So: a longer patience, and one retry,
 * and a loud failure if the second attempt does not land either.
 */
async function capture(page, file, name) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.screenshot({ path: file, timeout: 60000 });
      return;
    } catch (error) {
      if (attempt === 2) throw new Error(`${name}: could not be photographed - ${error.message}`);
      console.log(`  ${name}: screenshot timed out, retrying`);
      await sleep(1000);
    }
  }
}

const args = process.argv.slice(2);
const writeBaseline = args.includes('--baseline');
const urlFlag = args.indexOf('--url');
const externalUrl = urlFlag >= 0 ? args[urlFlag + 1] : null;

/**
 * `--only <regex>` renders just the presets whose name matches.
 *
 * Tuning a room's light is a measure-change-measure loop, and re-rendering all
 * thirty-one frames to see what one of them did makes the loop slow enough that
 * you start guessing instead of measuring. It filters by PRESET name, not room,
 * so `--only 'spine|station-'` is the corridor and everything that looks down it.
 *
 * It deliberately does nothing when writing baselines: a partial baseline is a
 * set of approved references where some are approved and some are last week's,
 * with no record of which. Baselines are all or nothing.
 */
const onlyFlag = args.indexOf('--only');
const only = onlyFlag >= 0 && !writeBaseline ? new RegExp(args[onlyFlag + 1]) : null;

const outDir = path.resolve(writeBaseline ? 'shots/baseline' : 'shots/current');

async function startPreview() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`);
      if (response.ok) return { child, url: `http://localhost:${PORT}/` };
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  child.kill();
  throw new Error('vite preview did not start');
}

async function main() {
  // A full run clears first, so a preset that has been deleted cannot leave a
  // stale PNG behind for a gate to keep grading. A filtered run must NOT: it is
  // rendering four frames out of thirty-one, and wiping the other twenty-seven
  // would leave every gate measuring whatever survived. Found by doing it.
  if (only === null) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  let server = null;
  let url = externalUrl;
  if (url === null || url === undefined) {
    server = await startPreview();
    url = server.url;
  }

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.groundTrack?.ready === true, { timeout: 30000 });

  const presets = await page.evaluate(() => window.groundTrack.presets);
  await page.evaluate(() => window.groundTrack.setPaused(true));

  for (const preset of presets) {
    if (only !== null && !only.test(preset)) continue;
    await page.evaluate((name) => window.groundTrack.setPreset(name), preset);
    // Pins the planet clock for the landing presets; the mission-* presets are
    // deterministic by construction (setPreset rebuilds their state fresh).
    await page.evaluate((t) => window.groundTrack.setTime(t), FIXED_TIME);
    // Settle so uniforms, DOM layout and fonts are certainly applied.
    await sleep(250);
    await page.screenshot({ path: path.join(outDir, `${preset}.png`) });
    console.log(`shot ${preset}`);
  }

  // The environment viewer. A separate page with its own harness hooks, and no
  // import of anything the game owns - that separation is the whole point of
  // rooms.html, so the shot script keeps it too rather than folding the rooms
  // into window.groundTrack.
  let mounted = null;
  for (const preset of INTERIOR_PRESETS) {
    if (only !== null && !only.test(preset.name)) continue;
    if (mounted !== preset.room) {
      await page.goto(new URL(`rooms.html#${preset.room}`, url).href, {
        waitUntil: 'networkidle',
      });
      // Wait for THIS room, by name. `ready` alone is not enough on its own
      // even now that it is lowered on mount: naming the room is what makes the
      // wait impossible to satisfy with a leftover answer from the last one.
      await page.waitForFunction(
        (id) =>
          window.groundTrackRooms?.ready === true &&
          (window.groundTrackRooms.environment === id || window.groundTrackRooms.error !== null),
        preset.room,
        { timeout: 30000 }
      );
      const failure = await page.evaluate(() => window.groundTrackRooms.error);
      if (failure !== null) throw new Error(`${preset.room} failed to build: ${failure}`);
      await page.evaluate(() => window.groundTrackRooms.setPaused(true));
      mounted = preset.room;
    }

    // Time first, then pose: setPose draws, and a pose drawn against the
    // previous preset's clock is a frame nobody asked for.
    await page.evaluate((t) => window.groundTrackRooms.setTime(t), preset.t);
    // A preset that presses may do it from somewhere other than where it is
    // shot from; the final pose is set again below, after the mechanism has run.
    await page.evaluate(
      (pose) => window.groundTrackRooms.setPose(pose),
      preset.pressFrom ?? preset.pose
    );
    if (preset.press === true) {
      // setPose resolves the reach outright at dt 0, so the hand already has
      // hold of whatever is in front of it and interact() lands. The cap and
      // its ring are on a spring, though, and a spring needs an interval: the
      // clock is nudged past the 60 ms press time so the shot catches the
      // travelled state rather than the frame the key went down.
      const acted = await page.evaluate(() => window.groundTrackRooms.interact());
      if (!acted) throw new Error(`${preset.name}: nothing to press at this pose`);
    }
    // Let the clock run on where the preset asks for it. Pressing implies it -
    // a spring needs an interval - but it is no longer only for presses: the
    // aft door has no button any more and opens because somebody is standing in
    // front of it, so the shot of it standing open is a pose plus a wait.
    //
    // Stepped rather than jumped, and that is not a nicety: a mechanism derives
    // its own interval from this clock and clamps it to 0.1 s so that a dropped
    // frame cannot teleport it. Setting the time two seconds ahead in one call
    // advances the door by a tenth of a second. `setTime` also re-observes, so
    // a door that opens on approach is told, every step, that somebody is there.
    const settle = preset.settle ?? (preset.press === true ? 0.08 : 0);
    if (settle > 0) {
      await page.evaluate(
        ({ from, span }) => {
          for (let t = from; t < from + span; t += 0.05) {
            window.groundTrackRooms.setTime(Math.min(t + 0.05, from + span));
          }
        },
        { from: preset.t, span: settle }
      );
    }
    if (preset.pressFrom !== undefined) {
      await page.evaluate((pose) => window.groundTrackRooms.setPose(pose), preset.pose);
    }
    await sleep(250);

    // Check the eye is where the preset put it BEFORE the frame is written.
    //
    // A screenshot records what the camera saw, not what it was told to see,
    // and those came apart silently for as long as the station has existed:
    // the first shot of a freshly mounted room was taken while the room was
    // still building, `setPose` hit a null controller and vanished down an
    // optional chain, and the picture that went to disk was the spawn pose
    // under the previous pose's filename. Every gate downstream then measured
    // the wrong room and blamed the geometry.
    //
    // Verifying the pose is the cheapest possible defence and it is exact.
    const landed = await page.evaluate(() => window.groundTrackRooms.pose());
    const drift = Math.hypot(landed.x - preset.pose.x, landed.z - preset.pose.z);
    if (drift > POSE_TOLERANCE_M) {
      throw new Error(
        `${preset.name}: camera is not where the preset put it - asked ` +
          `(${preset.pose.x}, ${preset.pose.z}), stood at ` +
          `(${landed.x.toFixed(2)}, ${landed.z.toFixed(2)}), ${drift.toFixed(2)} m away. ` +
          `The frame would not be the pose it is named after.`
      );
    }

    await capture(page, path.join(outDir, `${preset.name}.png`), preset.name);
    console.log(`shot ${preset.name}`);
  }

  await browser.close();
  if (server) server.child.kill();

  if (errors.length > 0) {
    console.error(`\n${errors.length} console/page error(s):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }

  const total = presets.length + INTERIOR_PRESETS.length;
  console.log(`\nwrote ${total} shots to ${path.relative(process.cwd(), outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
