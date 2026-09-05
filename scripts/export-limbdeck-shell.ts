/**
 * Export THE LIMB DECK's shell geometry for the Cycles bake.
 *
 *     npx vite-node scripts/export-limbdeck-shell.ts
 *
 * Writes tools/blender/limbdeck/structure.ply and lamps.ply - the exact two
 * meshes buildShell() mounts, positions and vertex colours, in GAME
 * coordinates. tools/blender/build_limbdeck.py imports them, so the baked
 * shell is the legacy shell to the millimetre: the cupola cut, the bulkhead
 * fan's staircase doorway, the deck warp - everything the exterior pass and
 * the door depend on - are never re-derived, only re-lit.
 *
 * Every other Blender room re-models its plan from numbers, because a plan of
 * boxes re-models faithfully. This shell is 1200 lines of snapped grids and
 * split fans, and a re-derivation that drifted a centimetre would open a
 * pinhole into the exterior pass. Exporting the real thing cannot drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { buildShell } from '../src/env/limbDeck/shell';

const OUT_DIR = path.join(__dirname, '..', 'tools', 'blender', 'limbdeck');
fs.mkdirSync(OUT_DIR, { recursive: true });

function writePly(file: string, geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const colour = geometry.getAttribute('color');
  const count = position.count;
  const lines: string[] = [
    'ply',
    'format ascii 1.0',
    `element vertex ${count}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    `element face ${count / 3}`,
    'property list uchar int vertex_indices',
    'end_header',
  ];
  const c = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    c.setRGB(colour?.getX(i) ?? 1, colour?.getY(i) ?? 1, colour?.getZ(i) ?? 1);
    // Linear working-space floats to sRGB bytes: Blender decodes byte colour
    // attributes back to linear, so the round trip is exact to 1/255.
    c.convertLinearToSRGB();
    lines.push(
      [
        position.getX(i).toFixed(6),
        position.getY(i).toFixed(6),
        position.getZ(i).toFixed(6),
        Math.round(THREE.MathUtils.clamp(c.r, 0, 1) * 255),
        Math.round(THREE.MathUtils.clamp(c.g, 0, 1) * 255),
        Math.round(THREE.MathUtils.clamp(c.b, 0, 1) * 255),
      ].join(' ')
    );
  }
  for (let f = 0; f < count / 3; f += 1) {
    lines.push(`3 ${3 * f} ${3 * f + 1} ${3 * f + 2}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

const shell = buildShell();
let wrote = 0;
for (const child of shell.root.children) {
  if (!(child instanceof THREE.Mesh)) continue;
  const stem =
    child.name === 'shell-structure' ? 'structure' : child.name === 'shell-lamps' ? 'lamps' : null;
  if (stem === null) continue;
  const file = path.join(OUT_DIR, `${stem}.ply`);
  writePly(file, child.geometry as THREE.BufferGeometry);
  console.log(
    `wrote ${file} (${(child.geometry as THREE.BufferGeometry).getAttribute('position').count} vertices)`
  );
  wrote += 1;
}
if (wrote !== 2) throw new Error(`expected structure + lamps, wrote ${wrote} meshes`);
shell.dispose();
