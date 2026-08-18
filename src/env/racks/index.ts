/**
 * THE RACKS - the stores, and the room the rest of the station is measured by.
 *
 * 8.40 by 3.05 m, flat at 2.42, with a bank of rack bays 1.05 m deep down both
 * long walls and a 0.95 m aisle between them. Sixteen bays on a 1.05 m pitch,
 * fifty drawer faces, fifty pulls, fifty label plates, four bays standing open.
 * It is by a wide margin the busiest room on the station and it is built that
 * way for somebody else's benefit: THE SPINE and THE MAGAZINE are only empty
 * relative to something, and this is the something. Density is not a property of
 * a room, it is a property of the room you walked out of.
 *
 * WHAT IT IS FOR. Thrusters, tanks and imagers arrive against a MANIFEST and
 * physically change what the cards say - STRUCTURE.md's delivery rule. This is
 * where the hardware sits between arriving and being fitted, so the manifest
 * board is the one operable thing in it and everything else is the stock the
 * board is a list of. A room whose whole subject is inventory should look like
 * inventory rather than like a diagram of one.
 *
 * NOTHING IN IT IS ANY OTHER SIZE. An International Standard Payload Rack is
 * 1.05 m wide and 0.86 m deep, which is where BAY_M and RACK_D_M come from, and
 * every dimension here is a division of those two: the bay pitch, the 0.04 m
 * reveal between bays, the deck plates, the lamp spacing, the drawer heights.
 * The bank is 1.05 deep because it is one rack plus the 0.19 m of standoff a
 * real rack needs behind it for services. Two banks and an aisle is
 * 1.05 + 0.95 + 1.05 = 3.05, and that is the whole plan. Next door THE CROSSING
 * has no two edges alike; this room has nothing BUT repeats, and the pair reads
 * as one building precisely because they are opposite in the same language.
 *
 * THE AISLE IS DELIBERATELY WRONG. Destiny's working corridor between its rack
 * banks is about 2.1 m. This is 0.95, less than half, because Destiny is a
 * laboratory people work in and this is a stores aisle people pass through. You
 * can touch both walls at once. Four bays have a drawer pulled out into the
 * aisle, which takes it down to 0.44 m at those four points - narrower than your
 * shoulders, so you turn them, and it is the only place on the station where the
 * building makes you do anything with your body.
 *
 * 0.44 AND NOT THE 0.40 THE BRIEF ASKS FOR. The walk clamp holds the eye 0.2 m
 * off any surface, twice the camera's near plane, because an eye nearer than
 * that clips through the wall and the exterior shows through it. Two of those
 * margins is 0.40 exactly, so a 0.40 m gap does not leave a strip a body may
 * stand in - it leaves a line, and a line is a pinch a player can fail to find.
 * 0.44 leaves 40 mm of it. The 40 mm is invisible and the difference between a
 * squeeze and a wall.
 *
 * NO DIRECTIONAL LIGHT. Not a dim one, not a wash: none. The room is lit by a
 * hemisphere and by eight lamps on the bay pitch down the middle of the ceiling,
 * and the result is flat, even and shadowless - bureaucratic light, the light of
 * a stockroom. Every other room on the station is keyed from somewhere you can
 * name (the crossing rakes from its high end, the gantry comes from below, the
 * magazine falls through a grating), so the one room with no direction at all is
 * as strong a change as any of them, and it costs nothing to hold: there is no
 * light rig here to get wrong.
 *
 * WHY THE WALL IS MOSTLY NOT A WALL. Every room is banded at the same two
 * heights, kick to 0.95 and work to 2.05, and here the racks stand exactly 2.05
 * tall - so on the long walls the rack bank IS the work band and the kick band,
 * and the only banded run left is the crown above them, drawn with its reveal
 * returns like everywhere else. What shows between the bays is the pressure wall
 * itself at its nominal line, dark, with the rust datum crossing it at 1.10 m in
 * a stack of 12 mm ticks - the hull's own hairline, visible only through the
 * 40 mm gaps in the stores. That is the honest version of "a datum on every
 * pressure-boundary wall" in a room whose pressure boundary is behind the stock.
 *
 * THE DOORWAY IS WIDER THAN THE AISLE. The seam is 1.18 and the aisle is 0.95,
 * so the last bay of each bank stands in the outer 115 mm of its own doorway and
 * you see the end of the run framed inside the opening. That is a consequence of
 * sixteen bays on a 1.05 m pitch in an 8.40 m room rather than a decision, and it
 * is left alone because it reads correctly: stores run to the bulkhead, and the
 * door is a hole in the bulkhead, not a lobby.
 *
 * ONE THING OUT OF PLACE (S11). Four drawers are open, and none of them counts:
 * a drawer on its slides is a drawer in use, not a drawer out of position. The
 * single disorder is a foil stowage tote left standing on top of one of them,
 * six metres down the aisle from the fore door - which makes it the room's one
 * warm element at the end of its one long sightline (S12) as well. One object
 * doing both jobs is cheaper than two and reads better than either.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, planeClashes, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import {
  BAY_M,
  CROWN_COLOUR,
  DATUM_COLOUR,
  DATUM_T_M,
  DATUM_Y_M,
  RACK_D_M,
  REVEAL_COLOUR,
  WORK_TOP_M,
  bands,
  deepestRelief,
} from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

const HALF_X = 4.2;
const HALF_Z = 1.525;
const FLOOR_Y = 0;
const CEILING_Y = 2.42;

/** Eight bays a side on the ISPR pitch, which is exactly 8.40 m of run. */
const BAYS_PER_SIDE = 8;
/** The dark gap between neighbouring bays. Also what stops two carcasses
 *  sharing a face plane, which with sixteen boxes on a regular pitch is the
 *  defect this room was most likely to ship. */
const BAY_GAP = 0.04;
const BAY_W = BAY_M - BAY_GAP;

/** Half the clear aisle: one bank depth in from each wall. */
const AISLE_HALF = HALF_Z - BAY_M;
/** Rack top, which is the station's work-band datum and not a coincidence. */
const RACK_TOP = WORK_TOP_M;
const PLINTH_H = 0.05;

/**
 * The three depths a bank is built at, measured from the centreline outward.
 *
 * The drawer faces are the front of the room at AISLE_HALF; the carcass sits
 * FACE_RELIEF behind them so every face is ringed by a shadow line; the cavity
 * is one real ISPR deep behind that; and the last 5 mm to the wall is left for
 * the liner, so no box in this room ever ends in the same plane as the hull.
 */
const FACE_RELIEF = 0.055;
const FACE_Z = AISLE_HALF;
const CARCASS_Z = AISLE_HALF + FACE_RELIEF;
const CAVITY_BACK_Z = CARCASS_Z + RACK_D_M;
const BANK_BACK_Z = HALF_Z - 0.005;

/** Five drawers to a bay, filling the 2.00 m rack between plinth and top. */
const DRAWERS = 5;
const DRAWER_H = 0.37;
const DRAWER_GAP = 0.025;
const DRAWER_W = BAY_W - 0.04;
const PULL_W = 0.32;
const LABEL_W = 0.24;

/** How far the four open drawers ride out, and what that leaves to walk in. */
const DRAWER_OUT = 0.51;
const OPEN_DRAWER_W = 0.94;
const DRAWER_FRONT_Z = AISLE_HALF - DRAWER_OUT;

/** Bay indices, 0 aft to 7 fore, that are something other than a shut bay. */
// Held clear of both doorways. A withdrawn drawer pinches the aisle off the
// centreline, and the station's own walk test steps along a seam's centre for
// two metres each side of it - so an open bay within that reach is not a tight
// squeeze, it is a seam with no floor down the middle of it. Staggered across
// the aisle so the pinches never face each other.
const PORT_OPEN = new Set([2, 4]);
const STARBOARD_OPEN = new Set([3, 5]);
const MANIFEST_BAY = 4;
const PERCH_BAY = 7;

/** Deck joint width, on the bay pitch like everything else. */
const JOINT_M = 0.05;

const SEED = 0x7ac;
const JITTER = 0.05;
const EYE_HEIGHT = 1.74;

/** How far the crown trunking stands proud, taken from the band table itself. */
const CROWN_RELIEF = bands(FLOOR_Y, CEILING_Y).find((band) => band.name === 'crown')?.relief ?? 0;
const CROWN_FACE_Z = HALF_Z - CROWN_RELIEF;

const BAY_CENTRES: readonly number[] = Array.from(
  { length: BAYS_PER_SIDE },
  (_, n) => -HALF_X + BAY_M / 2 + n * BAY_M
);

/**
 * Two ports, both centred on the short ends, and nothing clever about either.
 *
 * The most conventional circulation on the station, on purpose: this room's
 * information is entirely in its surfaces, and a plan that also wanted attention
 * would be competing with it. You come in one end and you can see the other.
 */
const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z - 0.2,
  maxZ: HALF_Z + 0.2,
} as const;

/** Bottom and top of drawer k, counting up from the plinth. */
function drawerY(k: number): readonly [number, number] {
  const y0 = PLINTH_H + DRAWER_GAP + k * (DRAWER_H + DRAWER_GAP);
  return [y0, y0 + DRAWER_H];
}

/**
 * How one bay is written: a bay-local builder, so nothing here repeats a sign.
 *
 * X comes in relative to the bay centre and depth comes in measured from the
 * room's centreline outward, which makes the port and starboard banks one
 * description instead of two - and two descriptions of a mirrored thing is how a
 * sign error ends up in only one of them. Depths come out ordered, because
 * `planeClashes` reads z0 as the low face and a box handed its bounds backwards
 * reports overlaps that are not there and misses the ones that are.
 */
function bayBoxes(
  parts: Solid[],
  id: string,
  cx: number,
  side: -1 | 1
): (
  suffix: string,
  material: string,
  x: readonly [number, number],
  y: readonly [number, number],
  d: readonly [number, number]
) => void {
  return (suffix, material, x, y, d) => {
    const a = side * d[0];
    const b = side * d[1];
    parts.push(
      solid(
        `${id}-${suffix}`,
        material,
        cx + x[0],
        cx + x[1],
        y[0],
        y[1],
        Math.min(a, b),
        Math.max(a, b)
      )
    );
  };
}

/** One shut drawer: the face, its pull and its label plate. */
function shutDrawer(box: ReturnType<typeof bayBoxes>, k: number): void {
  const [y0, y1] = drawerY(k);
  const mid = (y0 + y1) / 2;
  box(`d${k}-face`, 'face', [-DRAWER_W / 2, DRAWER_W / 2], [y0, y1], [FACE_Z, CARCASS_Z]);
  // Pull and label both stand PROUD of the face and both end on its plane, so
  // they are held apart across the face rather than stacked: two surfaces at one
  // depth pointing one way is a fight for pixels, and there are a hundred of
  // these pairs in the room.
  box(
    `d${k}-pull`,
    'pull',
    [-0.34, -0.34 + PULL_W],
    [mid - 0.015, mid + 0.015],
    [FACE_Z - 0.028, FACE_Z]
  );
  box(
    `d${k}-label`,
    'trim',
    [0.1, 0.1 + LABEL_W],
    [mid - 0.025, mid + 0.025],
    [FACE_Z - 0.006, FACE_Z]
  );
}

/**
 * The bay that is standing open, and the reason the room is not wallpaper.
 *
 * Built as a shell rather than as a block with a hole drawn on it: back, two
 * sides, a head and two shelves, so there is 0.86 m of real interior behind the
 * mouth and the things stood in it are silhouettes against the dark rather than
 * marks on a surface. The drawer rides out past the centreline of the room.
 */
function openBay(box: ReturnType<typeof bayBoxes>): void {
  const half = BAY_W / 2;
  const inner = half - 0.03;
  const cavity = [CARCASS_Z, CAVITY_BACK_Z] as const;
  box('back', 'cavity', [-half, half], [PLINTH_H, RACK_TOP], [CAVITY_BACK_Z, BANK_BACK_Z]);
  box('side-a', 'cavity', [-half, -inner], [PLINTH_H, RACK_TOP], cavity);
  box('side-b', 'cavity', [inner, half], [PLINTH_H, RACK_TOP], cavity);
  box('head', 'cavity', [-inner, inner], [RACK_TOP - 0.06, RACK_TOP], cavity);
  box('shelf-lo', 'steel', [-inner, inner], [0.7, 0.73], cavity);
  box('shelf-hi', 'steel', [-inner, inner], [1.42, 1.45], cavity);

  // Stock, in silhouette. Three boxes of three sizes, no two of them standing
  // at the same depth, because a shelf of identical crates is a texture.
  box('stock-a', 'carcass', [-0.44, -0.14], [0.73, 0.85], [CARCASS_Z + 0.09, CARCASS_Z + 0.47]);
  box('stock-b', 'carcass', [0.02, 0.34], [0.73, 0.79], [CARCASS_Z + 0.17, CARCASS_Z + 0.75]);
  box('stock-c', 'carcass', [-0.3, 0.18], [1.45, 1.72], [CARCASS_Z + 0.07, CARCASS_Z + 0.57]);

  // And the drawer itself, out on its slides between the two shelves.
  const [y0, y1] = drawerY(2);
  const mid = (y0 + y1) / 2;
  const out = OPEN_DRAWER_W / 2;
  box('drawer', 'face', [-out, out], [y0, y1], [DRAWER_FRONT_Z, CARCASS_Z + 0.2]);
  box(
    'drawer-pull',
    'pull',
    [-0.16, 0.16],
    [mid - 0.015, mid + 0.015],
    [DRAWER_FRONT_Z - 0.028, DRAWER_FRONT_Z]
  );
}

/** Every box the stores are made of. */
function racksSolids(): readonly Solid[] {
  const parts: Solid[] = [];
  const half = BAY_W / 2;

  BAY_CENTRES.forEach((cx, n) => {
    for (const side of [-1, 1] as const) {
      const box = bayBoxes(parts, `bay-${side < 0 ? 'p' : 's'}${n}`, cx, side);

      // Every bay stands on the same 50 mm plinth, and the plinth is what puts
      // the rack top on the 2.05 datum. It runs the full bank depth so the deck
      // meets it back to back rather than showing under it.
      box('plinth', 'steel', [-half, half], [FLOOR_Y, PLINTH_H], [FACE_Z, BANK_BACK_Z]);

      if (side < 0 ? PORT_OPEN.has(n) : STARBOARD_OPEN.has(n)) {
        openBay(box);
        continue;
      }

      // The carcass: one box, its front held back by the face relief so every
      // drawer reads as a slab with a shadow line round it.
      box('carcass', 'carcass', [-half, half], [PLINTH_H, RACK_TOP], [CARCASS_Z, BANK_BACK_Z]);

      if (side > 0 && n === PERCH_BAY) {
        // A blank bay, which is how the perch is findable at all in a wall of
        // fifty identical drawer faces: the eye goes to the one bay with nothing
        // in it long before it goes to the shelf bolted on the front of it.
        const face = DRAWER_W / 2;
        box('blank', 'steel', [-face, face], [PLINTH_H, RACK_TOP], [CARCASS_Z - 0.025, CARCASS_Z]);
        // S9: the station's one repeated object. 0.62 by 0.34 at 0.62 m on a
        // single bracket, with the grab loop at 1.36, identical in every
        // compartment and always on the left of the door you came in by.
        box('perch', 'steel', [-0.31, 0.31], [0.58, 0.62], [FACE_Z - 0.34, FACE_Z]);
        box('perch-bracket', 'trim', [-0.03, 0.03], [PLINTH_H, 0.58], [FACE_Z - 0.175, FACE_Z]);
        box('perch-loop', 'trim', [-0.21, 0.21], [1.36, 1.4], [FACE_Z - 0.06, FACE_Z]);
        continue;
      }

      if (side > 0 && n === MANIFEST_BAY) {
        // The manifest board fills this bay's work band exactly - 0.95 to 2.05,
        // the same two heights every wall in the station is cut at - and the two
        // drawers below it are all that is left of the bay. It stands 10 mm
        // proud of the drawer plane, so it is a board ON a rack rather than a
        // rectangle printed on one.
        for (let k = 0; k < 2; k += 1) shutDrawer(box, k);
        box('board', 'face', [-0.44, 0.44], [0.95, 1.9], [FACE_Z - 0.01, CARCASS_Z]);
        box('board-lip', 'steel', [-0.44, 0.44], [0.925, 0.95], [FACE_Z - 0.035, FACE_Z]);
        continue;
      }

      for (let k = 0; k < DRAWERS; k += 1) shutDrawer(box, k);
    }
  });

  // S11, and S12 in the same object: a foil tote left standing on an open
  // drawer six metres down the aisle, warm in a cold frame and the only thing
  // in the room that is not where it belongs.
  {
    const [, top] = drawerY(2);
    const tote = bayBoxes(parts, 'stray', BAY_CENTRES[1] ?? 0, -1);
    tote('tote', 'warm', [-0.18, 0.18], [top, top + 0.24], [0.06, 0.42]);
  }

  // Eight lamps, one per bay pitch, down the centreline of the ceiling. On the
  // module like everything else, so the ceiling reads as the same grid as the
  // walls rather than as a lighting layout laid over them.
  BAY_CENTRES.forEach((cx, n) => {
    parts.push(solid(`lamp-${n}`, 'lamp', cx - 0.3, cx + 0.3, 2.36, 2.4, -0.11, 0.11));
  });

  return parts;
}

/** Deck, ceiling, the crown band over the racks, the wall behind them, two ends. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const joint = new THREE.Color(PALETTE.HULL);
  const roof = new THREE.Color(CROWN_COLOUR);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const rust = new THREE.Color(DATUM_COLOUR);
  const inward = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  // --- Deck, in plates on the bay pitch with a light joint at each pitch line.
  // Drawn across the whole footprint rather than clipped to the aisle: the racks
  // stand ON it, their plinths meet it back to back, and a deck clipped to what
  // you can walk on is a deck with a strip of open space under every bank.
  for (let i = 0; i < BAYS_PER_SIDE; i += 1) {
    const x0 = -HALF_X + i * BAY_M;
    const x1 = x0 + BAY_M;
    inward.set((x0 + x1) / 2, 1, 0);
    const plate = (a: number, b: number, colour: THREE.Color): void => {
      pushQuad(
        target,
        v(a, FLOOR_Y, -HALF_Z),
        v(b, FLOOR_Y, -HALF_Z),
        v(b, FLOOR_Y, HALF_Z),
        v(a, FLOOR_Y, HALF_Z),
        inward,
        colour
      );
    };
    plate(x0, x1 - JOINT_M, facetColour(deck, v((x0 + x1) / 2, FLOOR_Y, 0), SEED, JITTER));
    plate(x1 - JOINT_M, x1, facetColour(joint, v(x1, FLOOR_Y, 0), SEED, JITTER * 0.4));
  }

  // --- Ceiling, stopping at the inner face of the crown trunking rather than
  // running to the wall. A ceiling drawn the full width would share that last
  // 0.14 m with the trunking's own top return, facing the same way, which is
  // 2.4 m2 of two surfaces fighting for every pixel they cover.
  for (let i = 0; i < BAYS_PER_SIDE; i += 1) {
    const x0 = -HALF_X + i * BAY_M;
    const x1 = x0 + BAY_M;
    inward.set((x0 + x1) / 2, 0, 0);
    pushQuad(
      target,
      v(x0, CEILING_Y, -CROWN_FACE_Z),
      v(x1, CEILING_Y, -CROWN_FACE_Z),
      v(x1, CEILING_Y, CROWN_FACE_Z),
      v(x0, CEILING_Y, CROWN_FACE_Z),
      inward,
      facetColour(roof, v((x0 + x1) / 2, CEILING_Y, 0), SEED + i * 7, JITTER)
    );
  }

  // --- The long walls, banded, above the racks.
  //
  // `bands` is asked for the whole wall and every band that the bank covers is
  // skipped, which is the kick and the work: in this room those two are not
  // painted on the wall, they ARE the racks, standing to the 2.05 datum the work
  // band ends at. What is left is the crown, at its own depth off the plane with
  // the returns that close it back - a band floating at a depth with no return
  // is a hole in the hull.
  const wallBands = (x0: number, x1: number, side: -1 | 1): void => {
    inward.set((x0 + x1) / 2, CEILING_Y / 2, 0);
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const y0 = Math.max(band.y0, RACK_TOP);
      if (band.y1 - y0 < 1e-6) continue;
      const z = side * (HALF_Z - band.relief);
      const lip = side * HALF_Z;
      pushQuad(
        target,
        v(x0, y0, z),
        v(x1, y0, z),
        v(x1, band.y1, z),
        v(x0, band.y1, z),
        inward,
        facetColour(new THREE.Color(band.colour), v((x0 + x1) / 2, y0 + 0.2, z), SEED + 3, JITTER)
      );
      if (Math.abs(band.relief) > 1e-6) {
        for (const y of [y0, band.y1]) {
          pushQuad(
            target,
            v(x0, y, lip),
            v(x1, y, lip),
            v(x1, y, z),
            v(x0, y, z),
            inward,
            facetColour(reveal, v((x0 + x1) / 2, y, (lip + z) / 2), SEED + 5, JITTER)
          );
        }
      }
    }
  };

  // --- And the wall the racks stand against, at its nominal line, dark, with
  // the rust datum crossing it at 1.10 m. It is only ever seen through the 40 mm
  // gaps between bays and through the mouths of the four open ones, which is
  // exactly what makes those gaps read as depth rather than as a painted stripe:
  // there is something behind them and it is 55 mm further away.
  const backing = (x0: number, x1: number, side: -1 | 1): void => {
    const z = side * HALF_Z;
    inward.set((x0 + x1) / 2, RACK_TOP / 2, 0);
    const strip = (y0: number, y1: number, colour: THREE.Color): void => {
      if (y1 - y0 < 1e-6) return;
      pushQuad(
        target,
        v(x0, y0, z),
        v(x1, y0, z),
        v(x1, y1, z),
        v(x0, y1, z),
        inward,
        facetColour(colour, v((x0 + x1) / 2, (y0 + y1) / 2, z), SEED + 9, JITTER)
      );
    };
    const d0 = DATUM_Y_M - DATUM_T_M / 2;
    const d1 = DATUM_Y_M + DATUM_T_M / 2;
    strip(FLOOR_Y, d0, reveal);
    strip(d0, d1, rust);
    strip(d1, RACK_TOP, reveal);
  };

  for (let i = 0; i < BAYS_PER_SIDE; i += 1) {
    const x0 = -HALF_X + i * BAY_M;
    const x1 = x0 + BAY_M;
    for (const side of [-1, 1] as const) {
      wallBands(x0, x1, side);
      backing(x0, x1, side);
    }
  }

  // --- The two end walls, each with its doorway cut out of it.
  //
  // Out to the deepest band face, not to the nominal wall plane: this room draws
  // no recessed band, but the rule is about the wall RUN and not about what
  // happens to be drawn on it today, and a groove that runs off the end of a
  // wall is a slot through to space. Held 6 mm inboard of the seam plane so the
  // neighbour's collar and this room's end never land in one plane.
  const outerZ = HALF_Z + deepestRelief(FLOOR_Y, CEILING_Y);
  const halfW = SEAM.width / 2;
  for (const side of [-1, 1] as const) {
    const x = side * (HALF_X - SEAM_INSET_M);
    inward.set(x - side * 1, CEILING_Y / 2, 0);
    const panel = (z0: number, z1: number, y0: number, y1: number): void => {
      if (z1 - z0 < 1e-6 || y1 - y0 < 1e-6) return;
      pushQuad(
        target,
        v(x, y0, z0),
        v(x, y0, z1),
        v(x, y1, z1),
        v(x, y1, z0),
        inward,
        facetColour(hull, v(x, (y0 + y1) / 2, (z0 + z1) / 2), SEED + 11, JITTER)
      );
    };
    panel(-outerZ, -halfW, FLOOR_Y, CEILING_Y);
    panel(halfW, outerZ, FLOOR_Y, CEILING_Y);
    panel(-halfW, halfW, SEAM.height, CEILING_Y);
  }

  return toGeometry(target);
}

/**
 * The walkable aisle, cut round the four drawers that are standing in it.
 *
 * Rectangles touch exactly at their shared edges and never overlap, which is
 * what lets the walk cross between them; at a pinch the rectangle narrows on the
 * side the drawer is out, so the body is steered round it rather than stopped by
 * it. Between the two pinched pairs there is 1.16 m of full-width aisle, which
 * is where a player crossing from one side to the other actually does it - two
 * pinches on opposite walls closer together than that would be a gap you cannot
 * get through in one move.
 */
function aisleFloor(): readonly FloorRect[] {
  const pinches = BAY_CENTRES.flatMap((cx, n) => {
    const side: -1 | 1 | 0 = PORT_OPEN.has(n) ? -1 : STARBOARD_OPEN.has(n) ? 1 : 0;
    return side === 0 ? [] : [{ x0: cx - OPEN_DRAWER_W / 2, x1: cx + OPEN_DRAWER_W / 2, side }];
  });
  pinches.sort((a, b) => a.x0 - b.x0);

  const rects: FloorRect[] = [];
  let cursor = -HALF_X;
  for (const pinch of pinches) {
    if (pinch.x0 - cursor > 1e-6) {
      rects.push({
        minX: cursor,
        maxX: pinch.x0,
        minZ: -AISLE_HALF,
        maxZ: AISLE_HALF,
        floorY: FLOOR_Y,
      });
    }
    const front = pinch.side * DRAWER_FRONT_Z;
    rects.push({
      minX: pinch.x0,
      maxX: pinch.x1,
      minZ: pinch.side > 0 ? -AISLE_HALF : front,
      maxZ: pinch.side > 0 ? front : AISLE_HALF,
      floorY: FLOOR_Y,
    });
    cursor = pinch.x1;
  }
  if (HALF_X - cursor > 1e-6) {
    rects.push({
      minX: cursor,
      maxX: HALF_X,
      minZ: -AISLE_HALF,
      maxZ: AISLE_HALF,
      floorY: FLOOR_Y,
    });
  }
  return rects;
}

function buildRacks(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'racks';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'racks-shell';
  root.add(shell);

  const parts = racksSolids();
  const materials: Record<string, THREE.MeshLambertMaterial> = {
    // The drawer faces: the lightest large surface in the room and the thing it
    // is mostly made of.
    face: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    steel: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL_SHADOW),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The carcass, seen only as the 55 mm reveal round every drawer face. This
    // is the dark half of the alternation that gives the room its frequency:
    // light, dark, light, dark every 1.05 m for the whole 8.4 m.
    carcass: new THREE.MeshLambertMaterial({
      color: new THREE.Color(CROWN_COLOUR),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The insides of the four open bays, and the darkest thing in the room.
    // VOID_SLATE is the floor of the whole game and it is still never black:
    // every interior material carries NIGHT_SIDE emissive at full strength, so
    // an unlit facet lands above the palette gate's floor rather than under it.
    cavity: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.VOID_SLATE),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    pull: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.CLOUD),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    trim: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.ARRAY),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The one warm object on the station's longest sightline that is not a
    // light. FOIL, not the accent, which appears on two things in this game and
    // neither of them is furniture.
    warm: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.FOIL),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The lamp-diffuser rule: no diffuse term at all, the whole value in
    // emissive, or the fitting clips the moment anything bright lands on it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.CLOUD),
      emissiveIntensity: 0.42,
    }),
  };
  for (const key of Object.keys(materials)) {
    const boxes = parts.filter((part) => part.material === key).map((part) => boxOf(part));
    const material = materials[key];
    if (boxes.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(boxes), material);
    mesh.name = `racks-${key}`;
    root.add(mesh);
  }

  // --- The light rig, entire.
  //
  // A hemisphere and eight point sources on the bay pitch, and NOTHING ELSE. No
  // directional key, no wash, no fill: the room is flat, even and shadowless,
  // and that is its whole signature against every other compartment on the
  // station. It is also the only lighting decision here that a later hand could
  // undo without noticing, so it is written down twice - once in the module
  // note above and once here.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    0.78
  );
  root.add(ambient);
  for (const cx of BAY_CENTRES) {
    // Decay 1 rather than the physical 2. Eight inverse-square sources in a
    // 0.95 m aisle give eight bright patches and seven dark ones between them,
    // which is a rhythm - and rhythm is the wall's job in this room, not the
    // ceiling's. A softer falloff overlaps them into one even field.
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.3, 3.2, 1);
    lamp.position.set(cx, 2.3, 0);
    root.add(lamp);
  }

  const floor = aisleFloor();

  const perchX = BAY_CENTRES[PERCH_BAY] ?? HALF_X - BAY_M / 2;
  const manifestX = BAY_CENTRES[MANIFEST_BAY] ?? 0;
  const toteX = BAY_CENTRES[1] ?? -HALF_X + BAY_M / 2;

  const points: readonly PointOfInterest[] = [
    // The manifest. Operable, and the only operable thing in the room: what is
    // on the shelves is stock, and stock is read off a list rather than handled.
    {
      id: 'manifest',
      label: 'the manifest board',
      position: [manifestX, 1.42, FACE_Z - 0.02],
      operable: true,
    },
    { id: 'perch', label: 'the perch', position: [perchX, 0.62, FACE_Z - 0.17] },
    { id: 'tote', label: 'the stowage tote', position: [toteX, 1.35, -0.24] },
  ];

  let read = 0;

  return {
    root,
    // Just inside the fore door, on the centreline, looking the length of the
    // aisle. The room's one claim is what eight metres of drawer faces does to a
    // 0.95 m gap, and that is a claim about a view from a doorway.
    spawn: { position: [3.55, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    // Distinct from every neighbour: the crossing hums at 46, the corridor at
    // 78. A stores compartment full of powered racks sits between them.
    machineryHz: 71,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * A plain rectangular box, which is the one thing about this room that is
     * simple. Everything difficult in it is a fitting rather than a hull, and
     * fittings are exactly what `solids` and this function together check.
     */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    interact(id: string): boolean {
      if (id !== 'manifest') return false;
      read += 1;
      return true;
    },

    update(): void {
      // Nothing here moves. A stores room with animation in it is a stores room
      // pretending to be an event, and the four open drawers have already said
      // everything this compartment has to say about somebody having been here.
      void read;
    },

    dispose(): void {
      shell.geometry.dispose();
      liner.dispose();
      for (const material of Object.values(materials)) material.dispose();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      root.clear();
    },
  };
}

/** Sanity for the author: sixteen bays on a regular pitch is a lot of face pairs. */
export function racksClashes(): readonly string[] {
  return planeClashes(racksSolids());
}

export const RACKS: CompartmentDefinition = {
  id: 'racks',
  name: 'THE RACKS',
  description: 'The stores, 8.4 by 3.05 m, sixteen bays and a 0.95 m aisle.',
  ports: PORTS,
  extent: EXTENT,
  build: buildRacks,
};

export const RACKS_SOLO = {
  id: 'racks',
  name: 'THE RACKS',
  description: 'The stores, 8.4 by 3.05 m, sixteen bays and a 0.95 m aisle.',
  build: () => soloStation(RACKS),
};

export default RACKS_SOLO;
