/** TEMP: screenshot a local html file. node scripts/dev-shot-html.mjs in.html out.png */
import { chromium } from 'playwright';
const [file, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1900 } });
await page.goto(`file://${file}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`wrote ${out}`);
