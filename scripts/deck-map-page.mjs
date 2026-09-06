/**
 * Render the Deck One chart: an HTML page from the live map data.
 *
 *   node scripts/deck-map-page.mjs <map.json> <out.html>
 */
import fs from 'node:fs';

const [mapFile, outFile] = process.argv.slice(2);
const { rooms, doors } = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

// World -> chart: fore (world +x, the limb deck) at top.
const X = (wz) => wz;
const Y = (wx) => -wx;

const PAD = 3;
const xs = rooms.flatMap((r) => [X(r.z0), X(r.z1)]);
const ys = rooms.flatMap((r) => [Y(r.x0), Y(r.x1)]);
const minX = Math.min(...xs) - PAD;
const maxX = Math.max(...xs) + PAD;
const minY = Math.min(...ys) - PAD;
const maxY = Math.max(...ys) + PAD;

const FAMILY = {
  corridor: { fill: '#3d3428', line: '#6d5c44', label: 'passage' },
  hab: { fill: '#4a3d2a', line: '#a5854f', label: 'habitation' },
  works: { fill: '#453126', line: '#9c6b45', label: 'works' },
  stores: { fill: '#463b26', line: '#b09258', label: 'stores' },
  science: { fill: '#3a4030', line: '#7f8f6a', label: 'science' },
  setpiece: { fill: '#4d3f22', line: '#c9a44a', label: 'set piece' },
  secret: { fill: '#2b2620', line: '#8FB7A2', label: 'secret' },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');

let svgRooms = '';
for (const r of rooms) {
  const fam = r.secret ? FAMILY.secret : (FAMILY[r.family] ?? FAMILY.corridor);
  const x = Math.min(X(r.z0), X(r.z1));
  const y = Math.min(Y(r.x0), Y(r.x1));
  const w = Math.abs(X(r.z1) - X(r.z0));
  const h = Math.abs(Y(r.x1) - Y(r.x0));
  const dash = r.secret ? ' stroke-dasharray="0.5 0.32"' : '';
  const name = r.name.replace(/^THE /, '');
  const big = w * h > 30;
  const across = Math.max(w, h * 0.55);
  const fontSize = big ? 1.05 : Math.min(0.78, Math.max(0.46, across / (name.length * 0.6)));
  svgRooms +=
    `<g class="room"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${fam.fill}" stroke="${fam.line}" stroke-width="0.16"${dash} rx="0.25"/>` +
    `<text x="${(x + w / 2).toFixed(2)}" y="${(y + h / 2 + 0.28).toFixed(2)}" font-size="${fontSize}" fill="${r.secret ? '#8FB7A2' : '#d9c9a6'}">${esc(name)}</text>` +
    `<title>${esc(r.name)} - ${esc(r.purpose)}</title></g>\n`;
}

let svgDoors = '';
for (const d of doors) {
  const cx = X(d.z);
  const cy = Y(d.x);
  // A door crossing an x-facing seam runs along z on the chart, and so on.
  const along = d.axis === 'x' ? 'h' : 'v';
  const half = d.w / 2;
  const w = along === 'h' ? 0.56 : half * 2;
  const h = along === 'h' ? half * 2 : 0.56;
  svgDoors += `<rect x="${(cx - w / 2).toFixed(2)}" y="${(cy - h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${d.locked ? '#22322c' : '#171310'}" stroke="${d.locked ? '#8FB7A2' : '#8a7354'}" stroke-width="0.12"/>\n`;
  if (d.locked) {
    svgDoors +=
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="0.28" fill="none" stroke="#8FB7A2" stroke-width="0.12"/>` +
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="0.07" fill="#8FB7A2"/>\n`;
  }
}

const locks = doors.filter((d) => d.locked);
let lockList = '';
for (const d of locks) {
  lockList += `<li><span class="key">${esc(d.locked)}</span></li>`;
}

const WINGS = [
  [
    'THE RUN',
    [
      'limb-deck',
      'spine',
      'crossing',
      'crown',
      'magazine',
      'plot',
      'crawl',
      'racks',
      'bend',
      'sill',
      'gantry',
      'berth',
    ],
  ],
  [
    'HAB NORTH',
    ['tee', 'mess', 'galley', 'walk', 'cabins', 'bunks', 'ward', 'head', 'lockers', 'return'],
  ],
  [
    'WORKS SOUTH',
    ['chase', 'shop', 'pumps', 'filter', 'switch', 'link', 'elbow', 'servers', 'comms', 'furnace'],
  ],
  [
    'STORES FRONTIER',
    ['belt', 'hold', 'drystores', 'crib', 'coldstore', 'engine', 'holds', 'void', 'bond'],
  ],
  [
    'SCIENCE QUARTER',
    [
      'spur',
      'lab',
      'archive',
      'charts',
      'shortcut',
      'garden',
      'scope',
      'assembly',
      'annex',
      'cache',
    ],
  ],
  ['THE KEEL', ['keela', 'keelb']],
];

const byId = new Map(rooms.map((r) => [r.id, r]));
let manifest = '';
for (const [wing, ids] of WINGS) {
  manifest += `<section class="wing"><h3>${wing}</h3><ul>`;
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    manifest += `<li${r.secret ? ' class="secret"' : ''}><b>${esc(r.name)}</b><span>${esc(r.purpose)}</span></li>`;
  }
  manifest += `</ul></section>\n`;
}

let legend = '';
for (const fam of Object.values(FAMILY)) {
  legend += `<span class="chip"><i style="background:${fam.fill};border-color:${fam.line}"></i>${fam.label}</span>`;
}

const html = `<title>Station Kepler Deck One</title>
<style>
  :root { color-scheme: dark; }
  body { background: #171310; color: #d9c9a6; margin: 0;
    font-family: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
  header { padding: 28px 32px 10px; }
  h1 { font-family: 'Archivo', 'Helvetica Neue', sans-serif; font-weight: 800;
    font-size: 26px; letter-spacing: 0.14em; margin: 0; color: #e4d6bb; text-transform: uppercase; }
  header p { margin: 6px 0 0; font-size: 12px; color: #8a7354; letter-spacing: 0.06em; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px 16px; padding: 10px 32px 4px; }
  .chip { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #b09b78;
    display: inline-flex; align-items: center; gap: 6px; }
  .chip i { width: 14px; height: 10px; display: inline-block; border: 1px solid; border-radius: 2px; }
  .chip.lock i { border-radius: 50%; width: 10px; }
  .chart { padding: 8px 24px 12px; overflow-x: auto; }
  svg { display: block; margin: 0 auto; max-width: 1500px; width: 100%; height: auto;
    background:
      radial-gradient(1200px 700px at 55% 35%, #1d1813 0%, #171310 70%),
      #171310; border: 1px solid #35302a; border-radius: 6px; }
  svg text { font-family: 'IBM Plex Mono', ui-monospace, monospace; text-anchor: middle;
    letter-spacing: 0.04em; text-transform: uppercase;
    paint-order: stroke; stroke: #171310; stroke-width: 0.14px; }
  .room rect { transition: filter 120ms ease; }
  .room:hover rect { filter: brightness(1.35); }
  .manifest { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 8px 28px; padding: 12px 32px 24px; max-width: 1500px; margin: 0 auto; }
  .wing h3 { font-size: 12px; letter-spacing: 0.18em; color: #c9a44a; margin: 14px 0 6px;
    border-bottom: 1px solid #35302a; padding-bottom: 4px; }
  .wing ul { list-style: none; margin: 0; padding: 0; }
  .wing li { font-size: 11.5px; line-height: 1.5; display: grid;
    grid-template-columns: 132px 1fr; gap: 10px; padding: 2px 0; color: #b09b78; }
  .wing li b { color: #d9c9a6; font-weight: 600; }
  .wing li.secret b, .wing li.secret span { color: #8FB7A2; }
  .keys { padding: 4px 32px 8px; max-width: 1500px; margin: 0 auto; font-size: 11.5px; color: #b09b78; }
  .keys ul { display: inline; list-style: none; padding: 0; margin: 0; }
  .keys li { display: inline; }
  .keys li + li::before { content: ' / '; color: #574a38; }
  .key { color: #8FB7A2; }
  .effects { max-width: 1100px; margin: 0 auto; padding: 8px 32px 44px; }
  .effects h2 { font-family: 'Archivo', sans-serif; font-size: 15px; letter-spacing: 0.14em;
    text-transform: uppercase; color: #e4d6bb; border-bottom: 1px solid #35302a; padding-bottom: 6px; }
  .effects li { font-size: 12.5px; line-height: 1.65; color: #b09b78; margin-bottom: 10px; }
  .effects b { color: #d9c9a6; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@800&family=IBM+Plex+Mono:wght@400;600&display=swap">
<header>
  <h1>Station Kepler &middot; Deck One</h1>
  <p>53 compartments &middot; 5 locked doors &middot; 6 secret or sealed rooms &middot; drawn from the live layout, fore at the top</p>
</header>
<div class="legend">${legend}<span class="chip lock"><i style="background:#22322c;border-color:#8FB7A2"></i>locked door</span></div>
<div class="chart">
<svg viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}" xmlns="http://www.w3.org/2000/svg">
${svgRooms}
${svgDoors}
</svg>
</div>
<p class="keys">KEYS: <ul>${lockList}</ul> &mdash; each opens where its mechanism names it. Hover any room for its purpose.</p>
<div class="manifest">
${manifest}
</div>
<div class="effects">
<h2>Making it look better after the bake &mdash; a proposal</h2>
<ul>
<li><b>Already legal, highest value: dithered lightmaps.</b> The 8-bit maps band visibly in the darkest rooms; ordered dithering at write time (one line in write_lightmap) kills the banding for free.</li>
<li><b>Compressed textures (KTX2/Basis).</b> Fifty-three lightmaps as raw PNG is ~100 MB of VRAM; Basis brings it down ~6x and loads faster. Pipeline change only, zero visual change.</li>
<li><b>Baked ambient occlusion in corners.</b> Cycles already computes it; a slightly higher-resolution atlas for the big setpiece rooms would keep their contact shadows crisp.</li>
<li><b>More motes.</b> The limb deck's dust is the best atmosphere in the game and it is one room's. The garden, the furnace and the hold each deserve their own particle identity (spores, embers, drifting grit) - all bloomless, all cheap.</li>
<li><b>Emissive flicker discipline.</b> A 2 percent slow flicker on the sill sump lamp and the furnace grille, keyed to machineryHz, would make the baked light feel inhabited. Runtime-modulated material intensity, no postprocessing.</li>
<li><b>Requires an owner decision (currently banned by DIRECTION/INTERIORS):</b> screen-space ambient occlusion, bloom on emitters, temporal antialiasing, and any tone-curve grading are all postprocessing. The ban has kept the game's look disciplined; if any is ever allowed, SSAO is the one that would flatter the baked rooms most, and bloom the one most likely to cheapen them.</li>
</ul>
</div>
`;

fs.writeFileSync(outFile, html);
console.log(`wrote ${outFile}`);
