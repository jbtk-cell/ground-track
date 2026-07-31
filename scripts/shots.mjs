#!/usr/bin/env node
/**
 * Renders every canonical camera preset to a PNG.
 *
 * These are the visual regression baselines. The review loop reads these images
 * and judges them against docs/DIRECTION.md; unexplained drift from
 * shots/baseline blocks a merge. See docs/LOOP.md.
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

const args = process.argv.slice(2);
const writeBaseline = args.includes('--baseline');
const urlFlag = args.indexOf('--url');
const externalUrl = urlFlag >= 0 ? args[urlFlag + 1] : null;

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
  await rm(outDir, { recursive: true, force: true });
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
    await page.evaluate((name) => window.groundTrack.setPreset(name), preset);
    await page.evaluate((t) => window.groundTrack.setTime(t), FIXED_TIME);
    // Two frames so the shader uniforms are certainly applied.
    await sleep(120);
    await page.screenshot({ path: path.join(outDir, `${preset}.png`) });
    console.log(`shot ${preset}`);
  }

  await browser.close();
  if (server) server.child.kill();

  if (errors.length > 0) {
    console.error(`\n${errors.length} console/page error(s):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }

  console.log(`\nwrote ${presets.length} shots to ${path.relative(process.cwd(), outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
