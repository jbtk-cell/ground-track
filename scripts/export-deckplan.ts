/**
 * Write tools/blender/deckplan.json - the Blender build's view of Deck One.
 *
 *     npx vite-node scripts/export-deckplan.ts
 *
 * Everything is converted to each room's LOCAL frame here, once, so
 * build_generated.py stays a renderer of records rather than a second
 * implementation of the coordinate rules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DECK_ROOMS } from '../src/env/station/deckplan';

const out = DECK_ROOMS.map((spec) => {
  const cx = (spec.rect[0] + spec.rect[1]) / 2;
  const cz = (spec.rect[2] + spec.rect[3]) / 2;
  const ohw = (spec.rect[1] - spec.rect[0]) / 2;
  const ohd = (spec.rect[3] - spec.rect[2]) / 2;
  return {
    id: spec.id,
    stem: `gen-${spec.id}`,
    name: spec.name,
    family: spec.family,
    ohw,
    ohd,
    h: spec.h,
    atlas: spec.atlas,
    ports: spec.ports.map((p) => ({
      id: p.id,
      wall: p.wall,
      at: p.wall === 'n' || p.wall === 's' ? p.at - cx : p.at - cz,
      w: p.gallery === true ? 2.1 : p.low === true ? 1.02 : 1.18,
      hSeam: p.gallery === true ? 2.3 : p.low === true ? 1.86 : 2.06,
      floorY: p.floorY ?? 0,
    })),
    furniture: spec.furniture,
    floors: spec.floors,
    lamps: spec.lamps,
    selfLit: spec.selfLit.map(([name]) => name),
  };
});

const file = path.join(__dirname, '..', 'tools', 'blender', 'deckplan.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`wrote ${file} (${out.length} rooms)`);
