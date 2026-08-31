/**
 * THE PLOT - the flight deck, and the first room rebuilt to the interior
 * direction (docs/INTERIORS.md).
 *
 * Every other compartment houses something you look at. This one houses the
 * exchange the whole design is built around: the flight computer solves the
 * transfer, prints twelve fields, fills eleven of them, and stops. A person
 * closes the last line. The fittings here are the hardware that exchange
 * physically needs - a place to stand, a worktop, a slot the card comes out
 * of, a ledge it lands on, a rail to hold, a bank that is plainly the machine
 * - and nothing else.
 *
 * WHAT THE REBUILD CHANGES, and what it deliberately keeps.
 *
 * Kept: the 4.60 x 3.40 x 2.85 vessel, all three ports and their offsets, the
 * console's every number (two ISPR bays, desk at 1.03, slot at 1.15-1.29),
 * the perch, the stand plate, the one drawer out of place, the floor rects,
 * the reach maths, the spawn. Those were argued for line by line in the old
 * file and the arguments still hold; the room's PLAN was never the problem.
 *
 * Changed: everything about how it renders. The room is UNLIT at runtime -
 * light is computed once by kit/baked/bake.ts from three ceiling strip lamps,
 * the mint screens and the porthole fill, with ray-traced soft shadows,
 * ambient occlusion, one bounce of colour bleed and a filmic shoulder, into a
 * lightmap atlas the walls carry on uv1. The palette moves to the warm end
 * the owner chose: DAWN_SAND and FOIL liner, rust datum, near-black in the
 * joints, MINT screens as the cool counterpoint. Texture is a seeded
 * modulation map, panel seams on the bay rhythm. Glow is authored halos.
 *
 * AND IT HAS PORTHOLES NOW - the owner picked the reference composition by
 * name. Two 0.50 m discs in the -z pressure wall flanking the spur, their
 * collars standing proud INTO the room so every millimetre of geometry stays
 * inside the vessel. In solo mount this room is its own station anchor, so
 * the discs are real holes: the proven two-pass scissored exterior paints
 * space behind them (the cupola's recipe, circular apertures). In station
 * mount the room is NOT the anchor, may not paint, and builds shutter plates
 * instead - `anchor owns the window` stays true and the airtight gate stays
 * honest. The old file argued a flight deck must not have a window; the owner
 * decided otherwise on 2026-08-31, and the spur wall puts Earth BEHIND the
 * operator: the card still cannot be checked against the view.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, solid } from '../kit/solids';
import { pushBox, sink, toGeometry } from '../kit/mesh';
import { bands, baySpans, deepestRelief } from '../kit/bands';
import {
  bakedSink,
  pushLitBox,
  pushLitQuad,
  pushPatchQuad,
  toBakedGeometry,
  type BakedSink,
} from '../kit/baked/atlas';
import { bake, bakeGeometry, type AreaLamp, type BakeOptions, type Probe } from '../kit/baked/bake';
import { traceSet } from '../kit/baked/trace';
import { linerMap } from '../kit/baked/dtex';
import { bakedMaterial } from '../kit/baked/material';
import { halo } from '../kit/baked/glow';
import { buildExterior } from '../limbDeck/exterior';
import type { Aperture, Frame } from '../limbDeck/contract';
import { LIMB_DECK_GEOMETRY, sampleOrbit } from '../orbit';
import type { FloorRect, PointOfInterest } from '../types';
import { consoleFitOut } from './console';

const HALF_X = 2.3;
const HALF_Z = 1.7;
const FLOOR_Y = 0;
const CEILING_Y = 2.85;

/** See the old file's note: both read off bands() because both are load-bearing. */
const PROUDEST = Math.max(0, ...bands(FLOOR_Y, CEILING_Y).map((band) => band.relief));

/** How far a doorway reveal is let into the wall before the collar takes over. */
const DOOR_DEPTH = 0.2;

/**
 * How far inboard of the seam the port wall - the one the spur leads off - is
 * built, so its recessed work band lands where the nominal plane was. The
 * portholes live in this wall and their collars grow INWARD from its face.
 */
const PORT_WALL_SETBACK = deepestRelief(FLOOR_Y, CEILING_Y) + SEAM_INSET_M;

function wallHalfZ(side: -1 | 1): number {
  return side < 0 ? HALF_Z - PORT_WALL_SETBACK : HALF_Z;
}

const SEED = 0x91a;
const EYE_HEIGHT = 1.74;

// --- The console, as one set of numbers everything else is measured off.
// Unchanged from the old room; see its comment for the reach arithmetic.
const DESK_X0 = -1.75;
const DESK_X1 = 0.35;
const DESK_BACK_Z = 1.68;
const DESK_FRONT_Z = 1.16;
const DESK_TOP_Y = 1.03;
const BANK_TOP_Y = 2.05;
const SLOT_Z = 1.48;
const SLOT_Y0 = 1.15;
const SLOT_Y1 = 1.29;

const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, SEAM.height / 2, 0.55], '-x', FLOOR_Y),
  port('port', [-0.4, SEAM.height / 2, -HALF_Z], '-z', FLOOR_Y),
] as const;

const SPUR_X = -0.4;
const SPUR_HALF = SEAM.width / 2;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

// --- The portholes. --------------------------------------------------------
//
// Two 0.50 m clear discs in the -z wall, flanking the spur: one outboard of
// each jamb, at porthole height rather than eye height so the limb crosses
// their lower third from a standing eye. The collar is a 16-segment tube
// standing 0.16 m proud into the room - deep frames are what portholes have,
// and the throat's own shadow is the near-black ring the composition wants.
const PORT_R = 0.25;
const PORT_HSQ = 0.34;
const PORT_Y = 1.55;
const PORT_SEGS = 16;
const COLLAR_DEPTH = 0.16;
const COLLAR_RIM = 0.035;
const PORTHOLE_X = [-1.62, 1.18] as const;

/** The -z work-band face the porthole assemblies mount on. */
function portWallFace(): number {
  const work = bands(FLOOR_Y, CEILING_Y).find((band) => band.y0 <= 1.5 && band.y1 >= 1.5);
  const relief = work?.relief ?? 0;
  return -1 * (wallHalfZ(-1) - relief);
}

// --- The warm cabin, from the palette's warm end. ---------------------------
//
// Owner decision 2026-08-31: FOIL, DAWN_SAND, CAUTION_RUST with MINT screens.
// Every colour below is a mix of named palette entries - nothing new is
// minted. These are ALBEDOS; what lands on screen is albedo times baked
// light, and the measurement loop tunes the lamp energies against
// docs/INTERIORS.md's value targets, not these numbers.
function mix(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
const LINER = mix(PALETTE.DAWN_SAND, PALETTE.FOIL, 0.5);
const KICK = mix(PALETTE.FOIL, PALETTE.HULL_SHADOW, 0.5).multiplyScalar(0.85);
const CROWN_WARM = mix(PALETTE.HULL_SHADOW, PALETTE.FOIL, 0.25).multiplyScalar(0.5);
const DECK_WARM = mix(PALETTE.HULL_SHADOW, PALETTE.FOIL, 0.35).multiplyScalar(0.8);
const REVEAL_DARK = new THREE.Color(PALETTE.FOIL).multiplyScalar(0.14);
const THROAT_DARK = new THREE.Color(PALETTE.FOIL).multiplyScalar(0.11);
const JAMB = mix(PALETTE.HULL_SHADOW, PALETTE.FOIL, 0.3).multiplyScalar(0.7);
const END_WALL = mix(PALETTE.DAWN_SAND, PALETTE.FOIL, 0.62).multiplyScalar(0.9);
const CONSOLE_FOIL = new THREE.Color(PALETTE.FOIL);
// Dark fittings in a warm room are warm-dark, not navy: ARRAY is orbit
// hardware. The drawer, ledge and plinth read as shadowed brown leather-dark.
const TRIM = new THREE.Color(PALETTE.FOIL).multiplyScalar(0.34);
const GRIP_MINT = new THREE.Color(PALETTE.MINT);
const RUST = new THREE.Color(PALETTE.CAUTION_RUST);
const DIFFUSER = new THREE.Color(PALETTE.DAWN_CREAM).multiplyScalar(0.9);

// --- Texel densities, per surface class. ------------------------------------
const TEXELS_WALL = 44;
const TEXELS_DECK = 40;
const TEXELS_CROWN = 30;
const TEXELS_CONSOLE = 84;

/**
 * Every box the flight deck is made of - identical to the old room's list,
 * plus the two porthole collars. Declared as data so tests/rooms.test.ts can
 * check the lot, and so the baker can trace rays against the same truth.
 */
function plotSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  parts.push(
    solid('desk-plinth', 'trim', DESK_X0 + 0.04, DESK_X1 - 0.04, FLOOR_Y, 0.13, 1.26, DESK_BACK_Z),
    solid('desk-carcass', 'frame', DESK_X0, DESK_X1, 0.13, 0.97, DESK_FRONT_Z, DESK_BACK_Z),
    solid('desk-top', 'frame', DESK_X0 - 0.08, DESK_X1 + 0.08, 0.97, DESK_TOP_Y, 1.08, DESK_BACK_Z)
  );

  parts.push(
    solid('bank-sill', 'frame', DESK_X0, DESK_X1, DESK_TOP_Y, SLOT_Y0, SLOT_Z, DESK_BACK_Z),
    solid('bank-left', 'frame', DESK_X0, -1.15, SLOT_Y0, SLOT_Y1, SLOT_Z, DESK_BACK_Z),
    solid('bank-right', 'frame', -0.15, DESK_X1, SLOT_Y0, SLOT_Y1, SLOT_Z, DESK_BACK_Z),
    solid('bank-head', 'frame', DESK_X0, DESK_X1, SLOT_Y1, BANK_TOP_Y, SLOT_Z, DESK_BACK_Z),
    solid('slot-back', 'trim', -1.15, -0.15, SLOT_Y0, SLOT_Y1, 1.6, DESK_BACK_Z)
  );

  parts.push(
    solid('ledge-tray', 'trim', -1.02, -0.22, DESK_TOP_Y, 1.05, 1.3, SLOT_Z),
    solid('ledge-lip', 'trim', -0.98, -0.26, 1.05, 1.1, 1.32, 1.36)
  );

  parts.push(solid('desk-rail', 'grip', -1.55, 0.15, 0.88, 0.92, 1.0, 1.04));
  for (const [n, x] of [-1.49, 0.03].entries()) {
    parts.push(solid(`rail-post-${n}`, 'frame', x, x + 0.06, 0.92, 0.97, 1.005, DESK_FRONT_Z));
  }

  parts.push(solid('stand-plate', 'trim', -1.15, -0.25, FLOOR_Y, 0.025, 0.42, 0.9));
  for (const [n, x] of [-1.06, -0.54].entries()) {
    parts.push(solid(`stand-toe-${n}`, 'frame', x, x + 0.2, 0.025, 0.07, 0.5, 0.58));
  }

  parts.push(
    solid('perch', 'trim', 1.1, 1.72, 0.58, 0.62, 1.32, 1.66),
    solid('perch-bracket', 'frame', 1.36, 1.46, FLOOR_Y, 0.58, 1.48, 1.64),
    solid('perch-loop', 'grip', 1.2, 1.62, 1.36, 1.4, 1.56, 1.6)
  );
  for (const [n, x] of [1.22, 1.56].entries()) {
    parts.push(solid(`loop-mount-${n}`, 'frame', x, x + 0.04, 1.34, 1.42, 1.6, 1.69));
  }

  parts.push(
    solid('file-drawer', 'trim', -1.58, -0.88, 0.58, 0.86, 0.92, 1.2),
    solid('drawer-pull', 'grip', -1.34, -1.12, 0.7, 0.74, 0.88, 0.92)
  );

  // Three lamps: the strip over the console, the walk-in, the spur mouth.
  // Their boxes are the diffusers the glow mesh draws bright; the baker takes
  // their undersides as the area sources and EXCLUDES these boxes from the
  // occluder set so a lamp cannot shadow its own light.
  parts.push(
    solid('lamp-station', 'lamp', -1.6, 0.2, 2.71, 2.79, 0.9, 1.24),
    solid('lamp-walk', 'lamp', 0.9, 2.0, 2.73, 2.79, -0.4, -0.1),
    solid('lamp-spur', 'lamp', -0.85, 0.05, 2.75, 2.79, -1.2, -1.0)
  );

  // The porthole collars, as their bounding boxes, so the clash checks see
  // them and the baker's rays are stopped by them. Their backs stand 3 mm
  // inboard of the wall face they mount on - a declared box in the wall's own
  // plane would be the coplanar defect the checks exist to catch.
  const face = portWallFace();
  for (const [n, x] of PORTHOLE_X.entries()) {
    parts.push(
      solid(
        `porthole-${n}`,
        'frame',
        x - PORT_HSQ + 0.05,
        x + PORT_HSQ - 0.05,
        PORT_Y - PORT_HSQ + 0.05,
        PORT_Y + PORT_HSQ - 0.05,
        face + 0.003,
        face + 0.003 + COLLAR_DEPTH
      )
    );
  }

  return parts;
}

/** One rectangular hole, for the band runs that must part around a porthole. */
interface Hole {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function buildShell(target: BakedSink, open: boolean): readonly Aperture[] {
  const inward = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const wear = (i: number, j: number, spread: number): number =>
    1 -
    spread / 2 +
    ((Math.imul(i * 73 + j * 149 + SEED, 2654435761) >>> 16) % 1000) * (spread / 1000);

  // --- The deck, in plates, each its own lightmap patch with its own wear.
  const deckPlates = 6;
  const deckRows = 4;
  for (let i = 0; i < deckPlates; i += 1) {
    for (let j = 0; j < deckRows; j += 1) {
      const x0 = -HALF_X + (2 * HALF_X * i) / deckPlates;
      const x1 = -HALF_X + (2 * HALF_X * (i + 1)) / deckPlates;
      const z0 = -HALF_Z + (2 * HALF_Z * j) / deckRows;
      const z1 = -HALF_Z + (2 * HALF_Z * (j + 1)) / deckRows;
      inward.set((x0 + x1) / 2, FLOOR_Y + 2, (z0 + z1) / 2);
      pushPatchQuad(
        target,
        v(x0, FLOOR_Y, z0),
        v(x1, FLOOR_Y, z0),
        v(x1, FLOOR_Y, z1),
        v(x0, FLOOR_Y, z1),
        inward,
        DECK_WARM.clone().multiplyScalar(wear(i, j, 0.12)),
        TEXELS_DECK,
        1.05
      );
    }
  }

  // --- The crown, held to the proudest band face as before.
  const roofZ0 = -wallHalfZ(-1) + PROUDEST;
  const roofZ1 = wallHalfZ(1) - PROUDEST;
  const roofPlates = 5;
  const roofRows = 3;
  for (let i = 0; i < roofPlates; i += 1) {
    for (let j = 0; j < roofRows; j += 1) {
      const x0 = -HALF_X + (2 * HALF_X * i) / roofPlates;
      const x1 = -HALF_X + (2 * HALF_X * (i + 1)) / roofPlates;
      const z0 = roofZ0 + ((roofZ1 - roofZ0) * j) / roofRows;
      const z1 = roofZ0 + ((roofZ1 - roofZ0) * (j + 1)) / roofRows;
      inward.set((x0 + x1) / 2, FLOOR_Y, (z0 + z1) / 2);
      pushPatchQuad(
        target,
        v(x0, CEILING_Y, z0),
        v(x1, CEILING_Y, z0),
        v(x1, CEILING_Y, z1),
        v(x0, CEILING_Y, z1),
        inward,
        CROWN_WARM.clone().multiplyScalar(wear(i, j + 9, 0.1)),
        TEXELS_CROWN,
        1.05
      );
    }
  }

  /**
   * One run of long wall in the station's three bands - the old room's
   * closure logic verbatim (grooves capped, deck return skipped), but each
   * bay panel is a lightmap patch, the colours are the warm set, and a band
   * run can now part around a rectangular hole for the portholes.
   */
  const wallBands = (
    x0: number,
    x1: number,
    side: -1 | 1,
    yFrom: number,
    holes: readonly Hole[] = []
  ): void => {
    inward.set((x0 + x1) / 2, CEILING_Y / 2, 0);
    const bandColour = (y0: number): THREE.Color =>
      y0 < 0.9 ? KICK : y0 < 2.0 ? LINER : CROWN_WARM;
    const density = (y0: number): number => (y0 < 0.9 || y0 >= 2.0 ? TEXELS_CROWN : TEXELS_WALL);
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const y0 = Math.max(band.y0, yFrom);
      const y1 = band.y1;
      if (y1 - y0 < 1e-6) continue;
      const z = side * (wallHalfZ(side) - band.relief);
      const lip = side * wallHalfZ(side);
      for (const [p0, p1] of baySpans(x0, x1)) {
        const colour = bandColour(band.y0)
          .clone()
          .multiplyScalar(wear(Math.round(p0 * 37), side * 3 + Math.round(band.y0 * 5), 0.1));
        // Part this bay's panel around any hole that intersects it.
        const cut = holes.filter((h) => h.x0 < p1 && h.x1 > p0 && h.y0 < y1 && h.y1 > y0);
        const panel = (px0: number, px1: number, py0: number, py1: number): void => {
          if (px1 - px0 < 1e-4 || py1 - py0 < 1e-4) return;
          pushPatchQuad(
            target,
            v(px0, py0, z),
            v(px1, py0, z),
            v(px1, py1, z),
            v(px0, py1, z),
            inward,
            colour,
            density(band.y0),
            1.05
          );
        };
        const hole = cut[0];
        if (hole === undefined) {
          panel(p0, p1, y0, y1);
        } else {
          panel(p0, Math.max(p0, hole.x0), y0, y1);
          panel(Math.min(p1, hole.x1), p1, y0, y1);
          panel(Math.max(p0, hole.x0), Math.min(p1, hole.x1), y0, Math.max(y0, hole.y0));
          panel(Math.max(p0, hole.x0), Math.min(p1, hole.x1), Math.min(y1, hole.y1), y1);
        }
      }
      if (Math.abs(band.relief) < 1e-6) continue;
      for (const y of [y0, y1]) {
        if (Math.abs(y - FLOOR_Y) < 1e-6) continue;
        pushLitQuad(
          target,
          v(x0, y, lip),
          v(x1, y, lip),
          v(x1, y, z),
          v(x0, y, z),
          inward,
          REVEAL_DARK
        );
      }
    }
  };

  // --- The worktop's working surface, as its own high-density patch 2 mm
  // above the declared box top (clear of the coplanar tolerance). This is
  // where the lamp pool and the mint spill land, and a vertex-lit box face
  // cannot carry a pool - four corners cannot describe a hotspot.
  inward.set((DESK_X0 + DESK_X1) / 2, DESK_TOP_Y + 2, 1.4);
  pushPatchQuad(
    target,
    v(DESK_X0 - 0.08, DESK_TOP_Y + 0.002, 1.08),
    v(DESK_X1 + 0.08, DESK_TOP_Y + 0.002, 1.08),
    v(DESK_X1 + 0.08, DESK_TOP_Y + 0.002, DESK_BACK_Z),
    v(DESK_X0 - 0.08, DESK_TOP_Y + 0.002, DESK_BACK_Z),
    inward,
    CONSOLE_FOIL.clone().multiplyScalar(0.95),
    TEXELS_CONSOLE,
    1.05
  );

  const face = portWallFace();
  const portHoles: Hole[] = PORTHOLE_X.map((x) => ({
    x0: x - PORT_HSQ,
    x1: x + PORT_HSQ,
    y0: PORT_Y - PORT_HSQ,
    y1: PORT_Y + PORT_HSQ,
  }));

  // Starboard runs the whole length. Port is cut in two by the spur, and its
  // two runs part around one porthole each.
  wallBands(-HALF_X, HALF_X, 1, FLOOR_Y);
  wallBands(-HALF_X, SPUR_X - SPUR_HALF, -1, FLOOR_Y, portHoles);
  wallBands(SPUR_X + SPUR_HALF, HALF_X, -1, FLOOR_Y, portHoles);
  wallBands(SPUR_X - SPUR_HALF, SPUR_X + SPUR_HALF, -1, SEAM.height);

  // --- The rust datum. S3: one hairline at 1.10 m, pressure walls only,
  // 2 mm proud of the work-band face so it never shares that face's plane.
  const datum = (x0: number, x1: number, z: number, side: -1 | 1): void => {
    inward.set((x0 + x1) / 2, 1.1, 0);
    pushLitQuad(
      target,
      v(x0, 1.094, z - side * 0.002),
      v(x1, 1.094, z - side * 0.002),
      v(x1, 1.106, z - side * 0.002),
      v(x0, 1.106, z - side * 0.002),
      inward,
      RUST
    );
  };
  const workRelief = bands(FLOOR_Y, CEILING_Y).find((b) => b.y0 <= 1.5 && b.y1 >= 1.5)?.relief ?? 0;
  datum(-HALF_X, SPUR_X - SPUR_HALF, -1 * (wallHalfZ(-1) - workRelief), -1);
  datum(SPUR_X + SPUR_HALF, HALF_X, -1 * (wallHalfZ(-1) - workRelief), -1);

  /** The spur's doorway - jambs per band, each drawn twice, as before. */
  const sideDoorway = (atX: number, side: -1 | 1): void => {
    const outZ = side * (HALF_Z + DOOR_DEPTH);
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const y0 = band.y0;
      const y1 = Math.min(band.y1, SEAM.height);
      if (y1 - y0 < 1e-6) continue;
      const faceZ = side * (wallHalfZ(side) - band.relief);
      for (const jx of [atX - SPUR_HALF, atX + SPUR_HALF]) {
        for (const towards of [atX, 2 * jx - atX]) {
          inward.set(towards, (y0 + y1) / 2, (faceZ + outZ) / 2);
          pushLitQuad(
            target,
            v(jx, y0, faceZ),
            v(jx, y0, outZ),
            v(jx, y1, outZ),
            v(jx, y1, faceZ),
            inward,
            JAMB
          );
        }
      }
    }
    const lip = side * wallHalfZ(side);
    inward.set(atX, SEAM.height - 0.6, lip);
    pushLitQuad(
      target,
      v(atX - SPUR_HALF, SEAM.height, lip),
      v(atX + SPUR_HALF, SEAM.height, lip),
      v(atX + SPUR_HALF, SEAM.height, outZ),
      v(atX - SPUR_HALF, SEAM.height, outZ),
      inward,
      JAMB
    );
  };
  sideDoorway(SPUR_X, -1);

  /** An end wall, three patch panels around its doorway, closing the grooves. */
  const OUTER_Z = HALF_Z + deepestRelief(FLOOR_Y, CEILING_Y);
  const endWall = (x: number, sign: -1 | 1, openZ: number): void => {
    inward.set(x - sign, CEILING_Y / 2, 0);
    const halfW = SEAM.width / 2;
    const panel = (z0: number, z1: number, y0: number, y1: number): void => {
      if (z1 - z0 < 1e-6 || y1 - y0 < 1e-6) return;
      pushPatchQuad(
        target,
        v(x, y0, z0),
        v(x, y0, z1),
        v(x, y1, z1),
        v(x, y1, z0),
        inward,
        END_WALL.clone().multiplyScalar(wear(Math.round(x * 11), Math.round(z0 * 13), 0.08)),
        TEXELS_WALL,
        1.05
      );
    };
    panel(-OUTER_Z, openZ - halfW, FLOOR_Y, CEILING_Y);
    panel(openZ + halfW, OUTER_Z, FLOOR_Y, CEILING_Y);
    panel(openZ - halfW, openZ + halfW, SEAM.height, CEILING_Y);
  };
  endWall(HALF_X - SEAM_INSET_M, 1, 0);
  endWall(-(HALF_X - SEAM_INSET_M), -1, 0.55);

  // --- The portholes: annulus plate, collar tube, rim, and - in station
  // mount - a shutter. All of it inboard of the wall face.
  const apertures: Aperture[] = [];
  for (const px of PORTHOLE_X) {
    const centre = v(px, PORT_Y, face);
    // Square-to-circle annulus at the wall face, 16 wedges.
    for (let k = 0; k < PORT_SEGS; k += 1) {
      const a0 = (k / PORT_SEGS) * Math.PI * 2;
      const a1 = ((k + 1) / PORT_SEGS) * Math.PI * 2;
      const sq = (a: number): [number, number] => {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const m = PORT_HSQ / Math.max(Math.abs(c), Math.abs(s));
        return [px + c * m, PORT_Y + s * m];
      };
      const [ox0, oy0] = sq(a0);
      const [ox1, oy1] = sq(a1);
      inward.set(px, PORT_Y, 0);
      pushLitQuad(
        target,
        v(ox0, oy0, face),
        v(ox1, oy1, face),
        v(px + Math.cos(a1) * PORT_R, PORT_Y + Math.sin(a1) * PORT_R, face),
        v(px + Math.cos(a0) * PORT_R, PORT_Y + Math.sin(a0) * PORT_R, face),
        inward,
        KICK
      );
      // The collar tube: from the wall face inboard, dark throat inside...
      const inboard = face + COLLAR_DEPTH;
      const ring = (radius: number, a: number, z: number): THREE.Vector3 =>
        v(px + Math.cos(a) * radius, PORT_Y + Math.sin(a) * radius, z);
      inward.set(px, PORT_Y, (face + inboard) / 2);
      pushLitQuad(
        target,
        ring(PORT_R, a0, face),
        ring(PORT_R, a1, face),
        ring(PORT_R, a1, inboard),
        ring(PORT_R, a0, inboard),
        inward,
        THROAT_DARK
      );
      // ...FOIL skin outside...
      const away = v(
        px + Math.cos((a0 + a1) / 2) * 3,
        PORT_Y + Math.sin((a0 + a1) / 2) * 3,
        (face + inboard) / 2
      );
      pushLitQuad(
        target,
        ring(PORT_R + COLLAR_RIM, a0, face),
        ring(PORT_R + COLLAR_RIM, a1, face),
        ring(PORT_R + COLLAR_RIM, a1, inboard),
        ring(PORT_R + COLLAR_RIM, a0, inboard),
        away,
        CONSOLE_FOIL
      );
      // ...and the rim face closing the two, toward the room.
      inward.set(px, PORT_Y, inboard + 2);
      pushLitQuad(
        target,
        ring(PORT_R, a0, inboard),
        ring(PORT_R, a1, inboard),
        ring(PORT_R + COLLAR_RIM, a1, inboard),
        ring(PORT_R + COLLAR_RIM, a0, inboard),
        inward,
        CONSOLE_FOIL
      );
    }

    if (open) {
      const corners: THREE.Vector3[] = [];
      for (let k = 0; k < PORT_SEGS; k += 1) {
        const a = (k / PORT_SEGS) * Math.PI * 2;
        corners.push(v(px + Math.cos(a) * PORT_R, PORT_Y + Math.sin(a) * PORT_R, face));
      }
      apertures.push({
        corners,
        normal: new THREE.Vector3(0, 0, -1),
        centre: centre.clone(),
      });
    } else {
      // The shutter: one dark plate 4 mm inboard of the annulus, covering the
      // disc. In station mount this room may not paint space (only the anchor
      // owns a window), so the hole is closed and the airtight gate can hold
      // this wall to the same standard as any other.
      inward.set(px, PORT_Y, 0);
      pushLitQuad(
        target,
        v(px - PORT_HSQ + 0.01, PORT_Y - PORT_HSQ + 0.01, face + 0.004),
        v(px + PORT_HSQ - 0.01, PORT_Y - PORT_HSQ + 0.01, face + 0.004),
        v(px + PORT_HSQ - 0.01, PORT_Y + PORT_HSQ - 0.01, face + 0.004),
        v(px - PORT_HSQ + 0.01, PORT_Y + PORT_HSQ - 0.01, face + 0.004),
        inward,
        TRIM
      );
    }
  }

  return apertures;
}

/** The area sources the baker runs: three strips, three screens, two discs. */
function plotLamps(open: boolean): readonly AreaLamp[] {
  const cream: readonly [number, number, number] = [DIFFUSER.r, DIFFUSER.g, DIFFUSER.b];
  const mint = new THREE.Color(PALETTE.MINT);
  const fill = mix(PALETTE.HULL, PALETTE.HIGH_FIELD, 0.5);
  const lamps: AreaLamp[] = [
    // The strip diffusers' undersides, from the solids above.
    {
      name: 'lamp-station',
      origin: [-1.6, 2.71, 0.9],
      edgeU: [1.8, 0, 0],
      edgeV: [0, 0, 0.34],
      colour: cream,
      intensity: 7.2,
      samplesU: 6,
      samplesV: 2,
    },
    {
      name: 'lamp-walk',
      origin: [0.9, 2.73, -0.4],
      edgeU: [1.1, 0, 0],
      edgeV: [0, 0, 0.3],
      colour: cream,
      intensity: 5.2,
      samplesU: 5,
      samplesV: 2,
    },
    {
      name: 'lamp-spur',
      origin: [-0.85, 2.75, -1.2],
      edgeU: [0.9, 0, 0],
      edgeV: [0, 0, 0.2],
      colour: cream,
      intensity: 4.2,
      samplesU: 4,
      samplesV: 2,
    },
  ];

  // The three readout faces as mint emitters - the reference's cyan spill on
  // the desk, provably from the screens. Geometry per console.ts's layout.
  const bankW = DESK_X1 - DESK_X0;
  const margin = bankW * 0.05;
  const gap = bankW * 0.035;
  const headY0 = SLOT_Y1;
  const headH = BANK_TOP_Y - headY0;
  const faceH = headH * 0.58;
  const faceV = headY0 + headH * 0.14;
  const faceW = (bankW - margin * 2 - gap * 2) / 3;
  for (let i = 0; i < 3; i += 1) {
    const xRight = DESK_X1 - margin - (faceW + gap) * i;
    lamps.push({
      name: `screen-${i}`,
      origin: [xRight, faceV, SLOT_Z - 0.002],
      edgeU: [-faceW, 0, 0],
      edgeV: [0, faceH, 0],
      colour: [mint.r, mint.g, mint.b],
      intensity: 1.15,
      samplesU: 2,
      samplesV: 2,
    });
  }

  // Cool Earthshine through the portholes. Present in both mounts: shuttered
  // portholes read as lit shutters rather than dead discs, and the two
  // mounts' bakes stay comparable.
  const face = portWallFace();
  for (const [n, px] of PORTHOLE_X.entries()) {
    lamps.push({
      name: `porthole-${n}`,
      origin: [px - 0.2, PORT_Y - 0.2, face + (open ? 0 : 0.006)],
      edgeU: [0.4, 0, 0],
      edgeV: [0, 0.4, 0],
      colour: [fill.r, fill.g, fill.b],
      intensity: open ? 1.6 : 0.7,
      samplesU: 2,
      samplesV: 2,
    });
  }

  return lamps;
}

const BAKE_OPTS: BakeOptions = {
  seed: SEED,
  ambient: [0.045, 0.038, 0.03],
  aoSamples: 20,
  aoRange: 1.1,
  aoStrength: 0.88,
  directAoMix: 0.65,
  bounce: 0.55,
  exposure: 1.0,
  knee: 0.8,
  ceiling: 2.2,
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface PlotBuild {
  /** Real holes and a painter (solo anchor), or shutters (station resident). */
  readonly open: boolean;
}

function buildPlot(options: PlotBuild): CompartmentHandle {
  const reducedMotion = prefersReducedMotion();

  // A Scene with a null background, for the same structural reason as the
  // limb deck: the window is two passes into one canvas, and a root that
  // carries a background would clear the exterior pass away.
  const root = new THREE.Scene();
  root.name = 'plot';
  root.background = null;

  const parts = plotSolids();
  const lamps = plotLamps(options.open);

  // --- Geometry: shell into the atlas sink, fittings vertex-lit, lamps and
  // screens unlit-bright.
  const shellSink = bakedSink(1024);
  const apertures = buildShell(shellSink, options.open);

  const materialColour: Record<string, THREE.Color> = {
    frame: CONSOLE_FOIL.clone().multiplyScalar(0.92),
    trim: TRIM,
    grip: GRIP_MINT,
  };
  for (const part of parts) {
    if (part.material === 'lamp') continue;
    // The porthole solids are declarations, not geometry: the clash checks
    // and the baker's rays need the collar's bounding box, but what is DRAWN
    // there is the 16-segment collar buildShell already pushed. Draw the box
    // too and it seals the porthole with a crate.
    if (part.name.startsWith('porthole-')) continue;
    const colour = materialColour[part.material];
    if (colour === undefined) continue;
    pushLitBox(shellSink, part, colour, 1.05);
  }

  // The baker traces against the fittings but never against the lamp housings
  // (a lamp shadowing its own emission is an artifact, not a shadow) and
  // never against the porthole collars' own boxes when lighting their throat.
  const occluders = traceSet(
    parts,
    { x0: -HALF_X, x1: HALF_X, y0: FLOOR_Y, y1: CEILING_Y, z0: -HALF_Z, z1: HALF_Z },
    ['lamp-station', 'lamp-walk', 'lamp-spur']
  );

  const baked = bake(shellSink, occluders, lamps, BAKE_OPTS);
  const map = linerMap(SEED);
  const shellMaterial = bakedMaterial(baked.texture, baked.intensity, map);
  const shell = new THREE.Mesh(toBakedGeometry(shellSink), shellMaterial);
  shell.name = 'plot-shell';
  root.add(shell);

  // --- The lamp diffusers: unlit, bright, the actual objects the halos ride.
  const glowSink = sink();
  for (const part of parts) {
    if (part.material !== 'lamp') continue;
    pushBox(
      glowSink,
      new THREE.Vector3(part.x0, part.y0, part.z0),
      new THREE.Vector3(part.x1, part.y1, part.z1),
      DIFFUSER,
      SEED,
      0.01
    );
  }
  const lampMesh = new THREE.Mesh(
    toGeometry(glowSink),
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  lampMesh.name = 'plot-lamps';
  root.add(lampMesh);

  for (const lamp of parts.filter((p) => p.material === 'lamp')) {
    root.add(
      halo({
        at: [(lamp.x0 + lamp.x1) / 2, lamp.y0 - 0.02, (lamp.z0 + lamp.z1) / 2],
        normal: [0, -1, 0],
        width: lamp.x1 - lamp.x0 + 0.55,
        height: lamp.z1 - lamp.z0 + 0.45,
        colour: PALETTE.DAWN_CREAM,
        opacity: 0.42,
      })
    );
  }

  // --- The fit-out on the bank: the surviving vocabulary. The glow half is
  // already unlit; the metal half is lit by the same solver as the room.
  const fitOut = consoleFitOut({
    x0: DESK_X0,
    x1: DESK_X1,
    faceZ: SLOT_Z,
    slotY0: SLOT_Y0,
    slotY1: SLOT_Y1,
    topY: BANK_TOP_Y,
    deskY: DESK_TOP_Y,
  });
  bakeGeometry(fitOut.lit, occluders, lamps, BAKE_OPTS);
  const bankMetal = new THREE.Mesh(fitOut.lit, new THREE.MeshBasicMaterial({ vertexColors: true }));
  bankMetal.name = 'plot-bank-metal';
  root.add(bankMetal);

  const bankGlow = new THREE.Mesh(fitOut.glow, new THREE.MeshBasicMaterial({ vertexColors: true }));
  bankGlow.name = 'plot-bank-glow';
  root.add(bankGlow);

  // A quiet mint breath proud of each screen face - the over-silhouette half
  // of the glow; the desk spill half is baked.
  const bankW = DESK_X1 - DESK_X0;
  const sMargin = bankW * 0.05;
  const sGap = bankW * 0.035;
  const sHeadY0 = SLOT_Y1;
  const sHeadH = BANK_TOP_Y - sHeadY0;
  const sFaceH = sHeadH * 0.58;
  const sFaceV = sHeadY0 + sHeadH * 0.14;
  const sFaceW = (bankW - sMargin * 2 - sGap * 2) / 3;
  for (let i = 0; i < 3; i += 1) {
    const xRight = DESK_X1 - sMargin - (sFaceW + sGap) * i;
    root.add(
      halo({
        at: [xRight - sFaceW / 2, sFaceV + sFaceH / 2, SLOT_Z],
        normal: [0, 0, -1],
        width: sFaceW * 1.5,
        height: sFaceH * 1.6,
        colour: PALETTE.MINT,
        opacity: 0.16,
        // Staggered off each other's plane: the three overlap on purpose
        // (glow adds) and the coplanar check rightly refuses to know that.
        proud: 0.03 + i * 0.004,
      })
    );
  }

  // --- The exterior behind the portholes, solo mount only.
  const exterior = options.open ? buildExterior(apertures, LIMB_DECK_GEOMETRY) : null;

  // --- The arm's light: the only runtime lights in the room, and they can
  // only reach Lambert materials - which, in a rebuilt room, is the arm and
  // nothing else. Fed from the bake's probes in observe(), so the arm stands
  // in the same light as the wall behind it.
  const armHemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.85);
  const armKey = new THREE.DirectionalLight(0xffffff, 0.55);
  root.add(armHemi, armKey, armKey.target);
  const probeOut: Probe = { r: 0, g: 0, b: 0, dx: 0, dy: 0, dz: 0 };

  const floor: readonly FloorRect[] = [
    { minX: -HALF_X + 0.08, maxX: -1.83, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
    { minX: -1.83, maxX: 0.43, minZ: -1.62, maxZ: 1.0, floorY: FLOOR_Y },
    { minX: 0.43, maxX: 1.02, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
    { minX: 1.02, maxX: 1.8, minZ: -1.62, maxZ: 1.24, floorY: FLOOR_Y },
    { minX: 1.8, maxX: HALF_X - 0.08, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
  ];

  const points: readonly PointOfInterest[] = [
    { id: 'pad', label: 'the card slot', position: [-0.6, 1.22, SLOT_Z], operable: true },
    { id: 'perch', label: 'the perch', position: [1.41, 0.62, 1.49] },
    { id: 'bank', label: 'the flight computer', position: [-0.6, 1.7, SLOT_Z] },
  ];

  let printed = 0;

  const handle: CompartmentHandle = {
    root,
    spawn: {
      position: [1.9, FLOOR_Y + EYE_HEIGHT, 0],
      yaw: Math.PI / 2 + 0.3,
      pitch: -0.04,
    },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 58,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    interact(id: string): boolean {
      if (id !== 'pad') return false;
      printed += 1;
      return true;
    },

    observe(eye: THREE.Vector3): void {
      baked.probe(eye.x, eye.y, eye.z, probeOut);
      const scale = 0.9;
      armHemi.color.setRGB(
        Math.min(1, probeOut.r * scale),
        Math.min(1, probeOut.g * scale),
        Math.min(1, probeOut.b * scale)
      );
      armHemi.groundColor.copy(armHemi.color).multiplyScalar(0.35);
      const mag = Math.hypot(probeOut.dx, probeOut.dy, probeOut.dz);
      if (mag > 1e-6) {
        armKey.position.set(
          eye.x + (probeOut.dx / mag) * 2,
          eye.y + (probeOut.dy / mag) * 2,
          eye.z + (probeOut.dz / mag) * 2
        );
        armKey.target.position.copy(eye);
      }
    },

    update(tSeconds: number): void {
      if (exterior !== null) {
        const frame: Frame = {
          t: tSeconds,
          orbit: sampleOrbit(tSeconds, LIMB_DECK_GEOMETRY),
          reducedMotion,
        };
        exterior.update(frame);
      }
      void printed;
    },

    dispose(): void {
      exterior?.dispose();
      baked.texture.dispose();
      map.dispose();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (material instanceof THREE.Material) material.dispose();
        }
      });
      root.clear();
    },
  };

  if (exterior !== null) {
    // The Painter contract: paint space into the porthole rectangles behind
    // whatever scene the station hands over. Only the solo build gets this -
    // in a full station this room is not the anchor and must not paint.
    return Object.assign(handle, {
      paint(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera
      ): void {
        exterior.render(renderer, scene, camera);
      },
    });
  }
  return handle;
}

const DESCRIPTION = 'The flight deck, 4.6 by 3.4 m. The card prints here, under baked light.';

export const PLOT: CompartmentDefinition = {
  id: 'plot',
  name: 'THE PLOT',
  description: DESCRIPTION,
  ports: PORTS,
  extent: EXTENT,
  build: () => buildPlot({ open: false }),
};

/** The same room with its portholes real: the solo mount's anchor. */
const PLOT_OPEN: CompartmentDefinition = {
  id: 'plot',
  name: 'THE PLOT',
  description: DESCRIPTION,
  ports: PORTS,
  extent: EXTENT,
  build: () => buildPlot({ open: true }),
};

export const PLOT_SOLO = {
  id: 'plot',
  name: 'THE PLOT',
  description: DESCRIPTION,
  build: () => soloStation(PLOT_OPEN),
};

export default PLOT_SOLO;
