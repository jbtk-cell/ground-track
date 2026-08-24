/**
 * THE MAGAZINE - where the probe checks in, and the only room that is silent.
 *
 * DIRECTION.md gives the network one counterweight: "a single deep-space probe,
 * checking in from further out each week with a longer light delay, quiet at the
 * edge of a busy network". Everything else the player owns is close, fast and
 * answers immediately. That one thing does not, and a signal that is late is only
 * legible if there is somewhere late-feeling to receive it in. This is that room.
 * It is the only compartment on the station with no machinery tone at all, and it
 * is the only one with no artificial light, and both of those are the same
 * decision: the probe's check-in has to arrive into an absence or it arrives into
 * a station that was already talking.
 *
 * SO IT IS EMPTY, AND EMPTY IS THE EXPENSIVE PART. It was a propellant magazine.
 * It has been stripped. What is left is the restraint frame that used to hold the
 * tanks, the grating that vented it, and the receiver bracket somebody bolted to
 * the far wall afterwards because this was the one place on the station with a
 * clear line up through the hull and nothing running to drown it out. Anybody
 * looking at twenty-five square metres of bare deck will want to put stowage on
 * it. The room's entire function is to be the thing the dense rooms are measured
 * against, so the deck stays bare.
 *
 * FIVE BY FIVE, AND 5.15 M OF HEADROOM. The only square room on a station of long
 * ones, which means it is the only room that tells you nothing about which way to
 * go - turn round in it and all four walls are near enough the same. That reads as
 * unsettling rather than as boring only because THE CROSSING came first and taught
 * the player to read asymmetry as information. The ceiling is flat at 5.60 m over a
 * 5.00 m footprint, which is the wrong proportion for a room with nothing in it,
 * and being wrong is the point: you stand in the middle of it and nothing is
 * within 1.8 m of you in any direction, including up.
 *
 * IT SITS ON THE UPPER LEVEL. The deck is at 0.45 m, not 0, because you reach it
 * through THE CROWN and the station's upper level is a real level rather than a
 * lip. Every height in this file is therefore measured from 0.45 and the bands are
 * cut from `bands(0.45, 5.60)`. Passing 0 as the floor to that function is the
 * mistake that puts a station-wide horizon 0.45 m out in one room only, which
 * nothing on screen announces.
 *
 * LIT BY THE PLANET AND BY NOTHING ELSE. There is no lamp in here, no fitting to
 * hold one and no diffuser material in the build. Earthshine comes down through
 * the ceiling grating at about fifty degrees and lands high on the far wall as a
 * barred rectangle, and that patch is the brightest thing in the compartment by a
 * long way while still being dimmer than an ordinary lit wall next door. It is
 * drawn as ANALYTIC GEOMETRY, not as a shadow map (ENVIRONMENTS.md forbids those,
 * and for a good reason - a one-ULP depth difference flips a whole facet under
 * software rasterisation), and not as a bright quad laid over the wall either. It
 * IS the wall: the far wall's facets are cut at the exact heights the grating bars
 * project to, and the ones the light reaches take a warmer base value. A quad
 * floating a few millimetres in front of a wall it matches is the coplanar defect
 * that has cost this project three separate rounds, and there was no reason to
 * invite it back for a patch of light that can be authored into the surface.
 *
 * The projection is exact rather than eyeballed, and it pays for itself: the crown
 * band stands 0.14 m proud of the wall plane and the work band is recessed 0.08 m
 * into it, so the crown's own ledge cuts the beam and leaves a dark step across the
 * 2.05 datum. Nobody would have thought to author that step, and it is the single
 * detail that makes the light read as coming from somewhere rather than as paint.
 *
 * THE REVEAL RUNS RIGHT ROUND. In a square room the three bands can be mitred at
 * all four corners into an unbroken ring, which no other compartment can do, and
 * which gives the eye the one continuous line in a room that otherwise offers it
 * nothing to hold. The ring is broken in exactly one place - the door surround -
 * and it is closed off there, out to the deepest band face. A recessed band that
 * runs off the end of a wall is not a groove, it is a slot through the pressure
 * hull with outer space behind it; that has shipped twice, once as 886 measured
 * pixels of VOID_SLATE at eye height down an entire corridor.
 */
import * as THREE from 'three';
import { EARTHSHINE_GROUND, PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { type Sink, facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import {
  type Band,
  CROWN_COLOUR,
  REVEAL_COLOUR,
  bands,
  deepestRelief,
  panelWear,
} from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

/** Half the footprint, both ways. The only room where those two are the same. */
const HALF = 2.5;
/** The upper level's deck. Not zero, and every height here is measured from it. */
const FLOOR_Y = 0.45;
const CEILING_Y = 5.6;
const EYE_HEIGHT = 1.74;

const SEED = 0x4d7;
const JITTER = 0.05;

/** The station's three bands, cut from the REAL deck height rather than from 0. */
const WALL_BANDS = bands(FLOOR_Y, CEILING_Y);
/** How far outboard of the nominal plane the deepest band face sits. */
const DEEPEST = deepestRelief(FLOOR_Y, CEILING_Y);

/**
 * How far inboard of the seam the one wall with a doorway in it is built.
 *
 * A flat wall only has to clear the seam by SEAM_INSET_M. This one is cut into
 * the station's three bands, and the work band is a groove cut OUTBOARD of the
 * nominal plane - so a door wall built to the seam stands its whole groove,
 * face and both returns, inside THE CROWN, on top of the groove that room cut
 * for itself. Standing the wall off by this room's own deepest relief as well
 * puts the deepest face where the nominal plane used to be, one seam inset
 * short of the seam. The band at eye level does not move; the other two come
 * in by 86 mm on that one wall.
 */
const PORT_WALL_SETBACK = DEEPEST + SEAM_INSET_M;
/** The door wall's nominal plane. Every other wall is at HALF. */
const DOOR_WALL_X = HALF - PORT_WALL_SETBACK;

/** Outboard offset of a band's face from the nominal wall plane, metres. */
function bandOut(band: Band): number {
  return -band.relief;
}

/** Distance from the room's axis to a band's face, on a given wall. */
function bandFaceCoord(band: Band, half: number = HALF): number {
  return half + bandOut(band);
}

/**
 * The ceiling grating: the only opening, and the room's only light source.
 *
 * Offset toward +x so the beam it lets in crosses the room and lands on the FAR
 * wall rather than on the deck at your feet. A patch on the floor is a puddle and
 * tells you nothing about the volume; a patch two and a half metres up a wall five
 * metres away is the only thing in here that measures the room.
 */
const AP_X0 = -1.2;
const AP_X1 = 0.64;
const AP_Z0 = -0.55;
const AP_Z1 = 0.55;
const BAR_PITCH = 0.2;
const BAR_T = 0.04;
/** Bar depth. It matters: an oblique ray is blocked by a bar's SIDE as well. */
const BAR_D = 0.06;
const BAR_COUNT = Math.round((AP_X1 - AP_X0 - BAR_T) / BAR_PITCH) + 1;

/**
 * Metres the earthshine falls for every metre it travels in -x.
 *
 * One number, and both the light rig and the painted patch are derived from it,
 * so the two cannot drift apart. Authoring the beam and the lamp separately is how
 * a room ends up with a bar of light nothing is casting.
 */
const EARTHSHINE_SLOPE = 1.2;

/** The one doorway, and the plain surround the band ring stops against. */
const DOOR_HALF = SEAM.width / 2;
const DOOR_TOP = FLOOR_Y + SEAM.height;
const SURROUND_HALF = 0.9;

/** The tie-down grid still in the deck: a hundred sockets on a half-metre pitch. */
const TIE_PITCH = 0.5;
const TIE_HALF = 0.045;

/** The restraint frame: 2.40 by 1.60 in plan, 4.00 m tall, members 0.09. */
const FRAME_HALF_X = 1.2;
const FRAME_HALF_Z = 0.8;
const MEMBER = 0.09;
const FRAME_TOP = FLOOR_Y + 4.0;
/** The mid rail straddles the 2.05 datum, which is the room's only horizon. */
const FRAME_MID = FLOOR_Y + 2.0;

/**
 * One port, and it is a dead end.
 *
 * `at` sits half a seam height above the DECK, not above zero, because the seam
 * check compares the opening's height over each side's own deck and refuses a
 * connection that would put a step in the middle of a doorway.
 */
const PORTS = [port('fore', [HALF, FLOOR_Y + SEAM.height / 2, 0], '+x', FLOOR_Y)] as const;

const EXTENT = {
  minX: -HALF - DEEPEST,
  maxX: HALF + DEEPEST,
  minY: FLOOR_Y - 0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF - DEEPEST,
  maxZ: HALF + DEEPEST,
} as const;

/** Which point of the aperture a ray landing at `y` on a plane at `planeX` came from. */
function apertureFor(planeX: number, y: number): number {
  return planeX + (CEILING_Y - y) / EARTHSHINE_SLOPE;
}

/**
 * True when a grating bar stands in the way of the ray that entered at `x0`.
 *
 * The blocked span is the bar's thickness PLUS its depth divided by the slope: at
 * fifty degrees a 0.06 m deep bar shades half again its own width, and a grating
 * modelled as infinitely thin throws stripes that are visibly too generous.
 */
function barBlocks(x0: number): boolean {
  const block = BAR_T + BAR_D / EARTHSHINE_SLOPE;
  for (let k = 0; k < BAR_COUNT; k += 1) {
    const b0 = AP_X0 + k * BAR_PITCH;
    if (x0 >= b0 - 1e-9 && x0 <= b0 + block) return true;
  }
  return false;
}

/**
 * Does earthshine reach this point on this band's face?
 *
 * The occlusion loop is what earns the crown's shadow: a band standing proud of the
 * wall plane is met by the ray BEFORE the recessed band behind it, so a point on
 * the work band can be inside the aperture's projection and still dark because the
 * crown ledge 0.22 m in front of it took the light first.
 */
function earthshineOn(band: Band, y: number, along: number): boolean {
  if (along < AP_Z0 || along > AP_Z1) return false;
  const planeX = -bandFaceCoord(band);
  const x0 = apertureFor(planeX, y);
  if (x0 < AP_X0 || x0 > AP_X1) return false;
  if (barBlocks(x0)) return false;
  for (const other of WALL_BANDS) {
    const qx = -bandFaceCoord(other);
    if (qx <= planeX + 1e-9) continue;
    const yq = CEILING_Y - EARTHSHINE_SLOPE * (x0 - qx);
    if (yq >= other.y0 && yq <= other.y1) return false;
  }
  return true;
}

/** `n` equal steps from `lo` to `hi`, both ends included. */
function evenCuts(lo: number, hi: number, step: number): number[] {
  const n = Math.max(1, Math.round(Math.abs(hi - lo) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) out.push(lo + ((hi - lo) * i) / n);
  return out;
}

/** Sorted, deduped, clamped, and guaranteed to start at `lo` and end at `hi`. */
function tidy(values: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [lo];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = out[out.length - 1] ?? lo;
    if (value > last + 1e-3 && value < hi - 1e-3) out.push(value);
  }
  out.push(hi);
  return out;
}

/**
 * Where to cut the far wall's facets so every stripe edge lands on one.
 *
 * Sampling the beam onto an even grid would have been three lines shorter and
 * would have put every bar shadow within half a facet of where it belongs, which
 * on a flat-shaded wall is the difference between a grating and a smear. The cuts
 * are the projections of the aperture's own edges, of each bar's leading and
 * trailing edge, and of every band boundary that can occlude this plane.
 */
function earthshineCuts(band: Band): number[] {
  const planeX = -bandFaceCoord(band);
  const ys: number[] = [...evenCuts(band.y0, band.y1, 0.62)];
  const push = (x0: number): void => {
    ys.push(CEILING_Y - EARTHSHINE_SLOPE * (x0 - planeX));
  };
  push(AP_X0);
  push(AP_X1);
  const block = BAR_T + BAR_D / EARTHSHINE_SLOPE;
  for (let k = 0; k < BAR_COUNT; k += 1) {
    push(AP_X0 + k * BAR_PITCH);
    push(AP_X0 + k * BAR_PITCH + block);
  }
  for (const other of WALL_BANDS) {
    const qx = -bandFaceCoord(other);
    if (qx <= planeX + 1e-9) continue;
    push(qx + (CEILING_Y - other.y0) / EARTHSHINE_SLOPE);
    push(qx + (CEILING_Y - other.y1) / EARTHSHINE_SLOPE);
  }
  return tidy(ys, band.y0, band.y1);
}

/**
 * One length of banded wall.
 *
 * `from` and `to` are positions along the wall, and null means "mitre to the
 * corner at this band's own depth" - which is what closes the ring. Three of the
 * four walls are a single run corner to corner; the door wall is two runs meeting
 * the surround.
 */
interface WallRun {
  readonly axis: 'x' | 'z';
  readonly sign: -1 | 1;
  readonly from: number | null;
  readonly to: number | null;
}

const WALL_RUNS: readonly WallRun[] = [
  { axis: 'x', sign: -1, from: null, to: null },
  { axis: 'z', sign: -1, from: null, to: null },
  { axis: 'z', sign: 1, from: null, to: null },
  { axis: 'x', sign: 1, from: null, to: -SURROUND_HALF },
  { axis: 'x', sign: 1, from: SURROUND_HALF, to: null },
];

/** The far wall is the only one the beam can reach, and the only one cut for it. */
function isLitWall(run: WallRun): boolean {
  return run.axis === 'x' && run.sign === -1;
}

/** The nominal plane of the wall this run is on. */
function runHalf(run: WallRun): number {
  return run.axis === 'x' && run.sign > 0 ? DOOR_WALL_X : HALF;
}

/**
 * Where a run mitres to at one end, when the surround has not cut it short.
 *
 * A z wall running to +x has to meet the door wall, which stands 86 mm inboard
 * of where the other three do - mitre it to the old corner and the ring carries
 * on into the next compartment.
 */
function mitreEnd(run: WallRun, end: -1 | 1, band: Band): number {
  const half = run.axis === 'z' && end > 0 ? DOOR_WALL_X : HALF;
  return end * bandFaceCoord(band, half);
}

function wallPoint(run: WallRun, face: number, along: number, y: number): THREE.Vector3 {
  return run.axis === 'x'
    ? new THREE.Vector3(run.sign * face, y, along)
    : new THREE.Vector3(along, y, run.sign * face);
}

/**
 * Every box this room is made of.
 *
 * Sixteen of them are the restraint frame, and the frame is built as members that
 * ABUT rather than overlap: the rails span BETWEEN the posts and stop on their
 * inner faces. Four boxes crossing at a corner share their end planes, and two
 * coplanar faces pointing the same way are a comb of alternating values that
 * crawls when the camera moves. The frame is the only object in the room, so there
 * is nothing to hide it behind.
 */
function magazineSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The restraint frame. Four posts at the corners, and three levels of rail
  // spanning between them. It held propellant tanks; it holds nothing now, which
  // is why it is the one vertical thing left standing.
  const innerX = FRAME_HALF_X - MEMBER;
  const innerZ = FRAME_HALF_Z - MEMBER;
  for (const [nx, sx] of [-1, 1].entries()) {
    for (const [nz, sz] of [-1, 1].entries()) {
      parts.push(
        solid(
          `frame-post-${nx}${nz}`,
          'frame',
          sx < 0 ? -FRAME_HALF_X : innerX,
          sx < 0 ? -innerX : FRAME_HALF_X,
          FLOOR_Y,
          FRAME_TOP,
          sz < 0 ? -FRAME_HALF_Z : innerZ,
          sz < 0 ? -innerZ : FRAME_HALF_Z
        )
      );
    }
  }
  const levels: readonly (readonly [string, number])[] = [
    ['sill', FLOOR_Y],
    ['mid', FRAME_MID],
    ['head', FRAME_TOP - MEMBER],
  ];
  for (const [name, y0] of levels) {
    for (const [n, sz] of [-1, 1].entries()) {
      parts.push(
        solid(
          `frame-${name}-long-${n}`,
          'frame',
          -innerX,
          innerX,
          y0,
          y0 + MEMBER,
          sz < 0 ? -FRAME_HALF_Z : innerZ,
          sz < 0 ? -innerZ : FRAME_HALF_Z
        )
      );
    }
    for (const [n, sx] of [-1, 1].entries()) {
      parts.push(
        solid(
          `frame-${name}-cross-${n}`,
          'frame',
          sx < 0 ? -FRAME_HALF_X : innerX,
          sx < 0 ? -innerX : FRAME_HALF_X,
          y0,
          y0 + MEMBER,
          -innerZ,
          innerZ
        )
      );
    }
  }

  // --- The grating bars. They hang under a blanked plenum panel in the ceiling
  // plane rather than over a hole: a hole with nothing behind it is not a dark
  // duct, it is outer space, because the exterior pass has already cleared depth.
  for (let k = 0; k < BAR_COUNT; k += 1) {
    const x0 = AP_X0 + k * BAR_PITCH;
    parts.push(
      solid(`grate-bar-${k}`, 'shade', x0, x0 + BAR_T, CEILING_Y - BAR_D, CEILING_Y, AP_Z0, AP_Z1)
    );
  }

  // --- The receiver bracket. The probe's check-in arrives here, and it is the
  // one thing in the room a hand is allowed to reach for.
  //
  // Bolted at the NOMINAL wall plane rather than to the work band's recessed face,
  // and that is correct rather than lazy: the reveal is a liner detail, the
  // structure is at 2.50, and a mast that has to hold its aim against thermal
  // cycling is fixed to structure. It also keeps every corner inside `contains`,
  // which a fitting sunk to the band face at 2.58 could not be.
  parts.push(
    solid('mast-pad', 'shade', -HALF, -HALF + 0.06, 1.58, 2.32, -1.72, -1.28),
    solid('mast-collar', 'frame', -HALF + 0.06, -HALF + 0.2, 1.86, 2.04, -1.6, -1.4),
    // Stood 0.02 m clear of the pad's face rather than flush with it. Flush is two
    // planes at one depth pointing the same way, and it is the cheapest way there
    // is to put a crawling seam on the one fitting the player is meant to touch.
    solid('mast-stub', 'frame', -HALF + 0.08, -HALF + 0.18, 2.04, 2.66, -1.55, -1.45)
  );

  // --- The perch (S9). Geometrically the same object in every compartment, and
  // always on the wall to the LEFT as you come in - here the +z wall, because the
  // only door faces +x and you walk in heading -x. A player who has been in three
  // rooms knows which way they came from without a single sign.
  parts.push(
    solid('perch', 'frame', 1.72, 2.34, FLOOR_Y + 0.56, FLOOR_Y + 0.62, 2.1, 2.44),
    solid('perch-bracket', 'trim', 1.96, 2.1, FLOOR_Y, FLOOR_Y + 0.56, 2.3, 2.44),
    solid('perch-loop', 'frame', 1.82, 2.24, FLOOR_Y + 1.34, FLOOR_Y + 1.4, 2.42, HALF)
  );

  // --- S11: exactly one thing out of its stowed position, and one only. A tank
  // restraint strap unhooked at the bottom and left hanging off the head rail,
  // its loose end fallen across the mid rail. It is 1.8 m of vertical in a room
  // whose only other vertical is four posts, and it is directly ahead of the door.
  parts.push(solid('strap', 'trim', 1.13, 1.18, FRAME_MID + MEMBER, FRAME_TOP - MEMBER, 0.2, 0.23));

  return parts;
}

/** The deck, cut into plates, with a tie-down socket at the centre of each. */
function buildDeck(target: Sink): void {
  const towards = new THREE.Vector3(0, CEILING_Y, 0);
  const plate = new THREE.Color(PALETTE.HULL_SHADOW);
  const socket = new THREE.Color(CROWN_COLOUR);
  const v = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, FLOOR_Y, z);
  const quad = (x0: number, x1: number, z0: number, z1: number, base: THREE.Color): void => {
    if (x1 - x0 < 1e-6 || z1 - z0 < 1e-6) return;
    pushQuad(
      target,
      v(x0, z0),
      v(x1, z0),
      v(x1, z1),
      v(x0, z1),
      towards,
      facetColour(base, v((x0 + x1) / 2, (z0 + z1) / 2), SEED, JITTER)
    );
  };

  const cells = Math.round((2 * HALF) / TIE_PITCH);
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const x0 = -HALF + i * TIE_PITCH;
      const x1 = x0 + TIE_PITCH;
      const z0 = -HALF + j * TIE_PITCH;
      const z1 = z0 + TIE_PITCH;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      // Four plates around the socket rather than one plate with a square laid on
      // top of it. A partition of the plane has no coplanar pair in it; an overlay
      // has one per socket, and there are a hundred sockets.
      quad(x0, x1, z0, cz - TIE_HALF, plate);
      quad(x0, x1, cz + TIE_HALF, z1, plate);
      quad(x0, cx - TIE_HALF, cz - TIE_HALF, cz + TIE_HALF, plate);
      quad(cx + TIE_HALF, x1, cz - TIE_HALF, cz + TIE_HALF, plate);
      quad(cx - TIE_HALF, cx + TIE_HALF, cz - TIE_HALF, cz + TIE_HALF, socket);
    }
  }
}

/** The flat crown, with the grating's plenum panel let into it. */
function buildCeiling(target: Sink): void {
  const towards = new THREE.Vector3(0, FLOOR_Y, 0);
  const roof = new THREE.Color(CROWN_COLOUR);
  const plenum = new THREE.Color(REVEAL_COLOUR);
  const v = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, CEILING_Y, z);
  const quad = (x0: number, x1: number, z0: number, z1: number, base: THREE.Color): void => {
    if (x1 - x0 < 1e-6 || z1 - z0 < 1e-6) return;
    pushQuad(
      target,
      v(x0, z0),
      v(x1, z0),
      v(x1, z1),
      v(x0, z1),
      towards,
      facetColour(base, v((x0 + x1) / 2, (z0 + z1) / 2), SEED + 7, JITTER)
    );
  };

  const xCuts = tidy([...evenCuts(-HALF, HALF, 0.5), AP_X0, AP_X1], -HALF, HALF);
  const zCuts = tidy([...evenCuts(-HALF, HALF, 0.5), AP_Z0, AP_Z1], -HALF, HALF);
  for (let i = 0; i + 1 < xCuts.length; i += 1) {
    for (let j = 0; j + 1 < zCuts.length; j += 1) {
      const x0 = xCuts[i];
      const x1 = xCuts[i + 1];
      const z0 = zCuts[j];
      const z1 = zCuts[j + 1];
      if (x0 === undefined || x1 === undefined || z0 === undefined || z1 === undefined) continue;
      const inside =
        (x0 + x1) / 2 > AP_X0 &&
        (x0 + x1) / 2 < AP_X1 &&
        (z0 + z1) / 2 > AP_Z0 &&
        (z0 + z1) / 2 < AP_Z1;
      if (!inside) quad(x0, x1, z0, z1, roof);
    }
  }
  // The plenum exactly fills what the crown left out, so the two tile rather than
  // overlap and the bars have something to be flush against.
  quad(AP_X0, AP_X1, AP_Z0, AP_Z1, plenum);
}

/** One wall run's three band faces, cut into facets. */
function buildBandFaces(target: Sink, run: WallRun): void {
  const lit = isLitWall(run);
  const inward = new THREE.Vector3(0, (FLOOR_Y + CEILING_Y) / 2, 0);
  for (const band of WALL_BANDS) {
    const face = bandFaceCoord(band, runHalf(run));
    const a0 = run.from ?? mitreEnd(run, -1, band);
    const a1 = run.to ?? mitreEnd(run, 1, band);
    const yCuts = lit
      ? earthshineCuts(band)
      : tidy(evenCuts(band.y0, band.y1, 0.62), band.y0, band.y1);
    const aCuts = lit
      ? tidy([...evenCuts(a0, a1, 0.9), AP_Z0, AP_Z1], a0, a1)
      : tidy(evenCuts(a0, a1, 0.9), a0, a1);
    const base = new THREE.Color(band.colour);
    // The lit value is the band's own colour carried most of the way to the
    // earthshine bounce, so the patch stays a lighter version of the wall it is on
    // rather than a different material stuck to it.
    const glow = new THREE.Color(band.colour).lerp(new THREE.Color(EARTHSHINE_GROUND), 0.74);
    for (let i = 0; i + 1 < yCuts.length; i += 1) {
      const y0 = yCuts[i];
      const y1 = yCuts[i + 1];
      if (y0 === undefined || y1 === undefined) continue;
      for (let j = 0; j + 1 < aCuts.length; j += 1) {
        const b0 = aCuts[j];
        const b1 = aCuts[j + 1];
        if (b0 === undefined || b1 === undefined) continue;
        const my = (y0 + y1) / 2;
        const ma = (b0 + b1) / 2;
        const on = lit && earthshineOn(band, my, ma);
        pushQuad(
          target,
          wallPoint(run, face, b0, y0),
          wallPoint(run, face, b1, y0),
          wallPoint(run, face, b1, y1),
          wallPoint(run, face, b0, y1),
          inward,
          // The wear hash rides on top of the fbm jitter because fbm clusters
          // around its middle: measured on the corridor, doubling its amount
          // moved neighbouring panels by three values. The hash delivers the
          // whole range, so adjacent facets genuinely step.
          facetColour(
            on ? glow : base,
            wallPoint(run, face, ma, my),
            SEED + (on ? 31 : 3),
            on ? JITTER * 0.5 : JITTER
          ).multiplyScalar(panelWear(ma * 1.7, my * 1.7, on ? 0.03 : 0.05))
        );
      }
    }
  }
}

/**
 * The horizontal returns that carry each band's depth into the next.
 *
 * One quad per boundary, spanning the whole step between the two faces, mitred at
 * the corners so the four walls' returns tile the ring exactly. Which way it faces
 * is derived rather than assumed: the exposed side of the step is the one the open
 * air is on, which is above it where the band above stands further out and below it
 * where the band above stands further in. Guessing that from the room's mid-height,
 * which is the obvious thing to do, gets it backwards in any room tall enough for
 * the crown boundary to sit below the middle of the wall.
 *
 * There is deliberately no return at the deck or at the ceiling. The deck runs out
 * to the nominal plane underneath the kick band and the ceiling runs out to it over
 * the crown, so both steps are already closed by a surface that is there anyway,
 * and adding a return would put two quads in one plane pointing one way.
 */
function buildReturns(target: Sink, run: WallRun): void {
  const reveal = new THREE.Color(REVEAL_COLOUR);
  for (let i = 0; i + 1 < WALL_BANDS.length; i += 1) {
    const below = WALL_BANDS[i];
    const above = WALL_BANDS[i + 1];
    if (below === undefined || above === undefined) continue;
    const fb = bandFaceCoord(below, runHalf(run));
    const fa = bandFaceCoord(above, runHalf(run));
    if (Math.abs(fa - fb) < 1e-6) continue;
    const y = below.y1;
    const towards = new THREE.Vector3(0, fa > fb ? CEILING_Y + 10 : FLOOR_Y - 10, 0);
    const b0 = run.from ?? mitreEnd(run, -1, below);
    const b1 = run.to ?? mitreEnd(run, 1, below);
    const a0 = run.from ?? mitreEnd(run, -1, above);
    const a1 = run.to ?? mitreEnd(run, 1, above);
    const midAlong = (b0 + b1) / 2;
    pushQuad(
      target,
      wallPoint(run, fb, b0, y),
      wallPoint(run, fb, b1, y),
      wallPoint(run, fa, a1, y),
      wallPoint(run, fa, a0, y),
      towards,
      facetColour(reveal, wallPoint(run, (fa + fb) / 2, midAlong, y), SEED + 5, JITTER)
    );
  }
}

/**
 * The door surround, and the caps that close every band against it.
 *
 * The surround is a plain plate at the nominal plane with the opening cut out of
 * it, and the band ring stops 0.90 m either side of the centreline. Each band's cut
 * end then gets a quad running from the surround plane out to that band's own face
 * - which for the work band means out to 2.58, the deepest face in the room. Stop
 * at the nominal plane instead and the work band's groove ends in mid-air with
 * space behind it.
 */
function buildDoorWall(target: Sink): void {
  const inward = new THREE.Vector3(0, (FLOOR_Y + CEILING_Y) / 2, 0);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);

  const panel = (z0: number, z1: number, y0: number, y1: number): void => {
    if (z1 - z0 < 1e-6 || y1 - y0 < 1e-6) return;
    pushQuad(
      target,
      new THREE.Vector3(DOOR_WALL_X, y0, z0),
      new THREE.Vector3(DOOR_WALL_X, y0, z1),
      new THREE.Vector3(DOOR_WALL_X, y1, z1),
      new THREE.Vector3(DOOR_WALL_X, y1, z0),
      inward,
      facetColour(
        hull,
        new THREE.Vector3(DOOR_WALL_X, (y0 + y1) / 2, (z0 + z1) / 2),
        SEED + 11,
        JITTER
      )
    );
  };
  panel(-SURROUND_HALF, -DOOR_HALF, FLOOR_Y, CEILING_Y);
  panel(DOOR_HALF, SURROUND_HALF, FLOOR_Y, CEILING_Y);
  panel(-DOOR_HALF, DOOR_HALF, DOOR_TOP, CEILING_Y);

  for (const side of [-1, 1] as const) {
    const z = side * SURROUND_HALF;
    for (const band of WALL_BANDS) {
      const face = bandFaceCoord(band, DOOR_WALL_X);
      // Which way a cap faces is not the same for all three bands, and getting it
      // wrong is invisible from the middle of the room. A PROUD band's end is seen
      // from the surround, where the wall steps back past it; a RECESSED band's end
      // is seen from inside its own groove, looking along the wall the other way.
      // Aiming all six at the room's centre culled the two work-band caps, and a
      // culled facet in a pressure hull is a hole - a ray leaving the eye 2 mm to
      // the outboard side of the surround left the station through it.
      const towards = new THREE.Vector3(
        DOOR_WALL_X,
        (band.y0 + band.y1) / 2,
        bandOut(band) > 0 ? side * 10 : 0
      );
      pushQuad(
        target,
        new THREE.Vector3(DOOR_WALL_X, band.y0, z),
        new THREE.Vector3(face, band.y0, z),
        new THREE.Vector3(face, band.y1, z),
        new THREE.Vector3(DOOR_WALL_X, band.y1, z),
        towards,
        facetColour(
          hull,
          new THREE.Vector3((DOOR_WALL_X + face) / 2, (band.y0 + band.y1) / 2, z),
          SEED + 13,
          JITTER
        )
      );
    }
  }
}

function buildShell(): THREE.BufferGeometry {
  const target = sink();
  buildDeck(target);
  buildCeiling(target);
  for (const run of WALL_RUNS) {
    buildBandFaces(target, run);
    buildReturns(target, run);
  }
  buildDoorWall(target);
  return toGeometry(target);
}

function buildMagazine(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'magazine';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'magazine-shell';
  root.add(shell);

  const parts = magazineSolids();
  // Three buckets and NO lamp bucket, because there is no lamp in this room and a
  // material that carries its value in emissive would be one whether anything
  // called it a fitting or not.
  const materials: Record<string, THREE.MeshLambertMaterial> = {
    frame: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL),
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
    shade: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL_SHADOW),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
  };
  for (const key of Object.keys(materials)) {
    const boxes = parts.filter((part) => part.material === key).map((part) => boxOf(part));
    const material = materials[key];
    if (boxes.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(boxes), material);
    mesh.name = `magazine-${key}`;
    root.add(mesh);
  }

  /**
   * Two lights, both of them the planet, and that is the whole rig.
   *
   * The hemisphere is roughly a quarter of what the hub carries, so a surface the
   * beam never touches falls almost to the interior emissive floor - which is
   * NIGHT_SIDE at full intensity and is therefore still above VOID_SLATE, the
   * darkest value the game allows. The dark in here is dark because there is
   * nothing lighting it, not because anything was allowed to go black.
   */
  // Left exactly as authored, and the record of two attempts to change it.
  //
  // magazine-bay measures 65% of its pixels in one 8-value bucket, the worst
  // frame in the station. The ambient was halved and the number did not move;
  // it was then raised by three quarters and the number moved by a tenth of a
  // percent. A constant you can move in both directions without the
  // measurement noticing is not the constant that is wrong, and changing it
  // anyway - then writing a comment claiming it as a fix - is how a codebase
  // fills up with numbers nobody dares touch.
  //
  // The cause is the pinned pose, which stands a metre from the restraint
  // frame with the room behind it. Fixed in scripts/shots.mjs. See THE SILL,
  // where the identical mistake was made and diagnosed the same way.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    new THREE.Color(PALETTE.NIGHT_SIDE).getHex(),
    0.3
  );
  root.add(ambient);

  /**
   * Three keys, all of them the same planet, aimed down the same slope the
   * painted beam was projected along - so the surfaces the beam lands on are also
   * the surfaces the light term favours.
   *
   * It was one key, and one key is the wrong model for this light. A single
   * DirectionalLight is a collimated beam from infinity, and this one travelled
   * in x and y with a z-component of exactly zero. Every surface in the room
   * whose normal points along z therefore took N dot L = 0 from it - not
   * "little", zero - and fell to the 0.3 hemisphere alone. In a square room that
   * is two of the four walls dead, and the pinned pose looks diagonally into one
   * of them, which is why nearly half of magazine-bay was an unreadable slab a
   * few values off VOID_SLATE.
   *
   * The earlier note in this file was half right and is worth keeping honest
   * about: it proved the AMBIENT was not the cause, correctly, by pushing it both
   * ways and watching the number refuse to move. Then it concluded the cause was
   * the pinned pose. The pose was genuinely bad and moving it did help - 65% to
   * 58% - but it was never the whole cause, and the remaining 58% was this.
   *
   * The fix is not a lamp. There is still no lamp in here. It is that the planet
   * from this altitude subtends something like 140 degrees of sky, and an
   * extended source that wide cannot be one direction: the near limb, the point
   * below, and the far limb all light the room from measurably different angles.
   * Three samples across that arc is the cheapest honest approximation of an area
   * light, and it costs nothing at render time because they are still directional.
   */
  const apertureMid = (AP_X0 + AP_X1) / 2;
  /** Where across the planet's disc each sample sits, and what it carries. */
  const LIMBS = [
    { across: 0, strength: 0.46 },
    { across: 6.0, strength: 0.27 },
    { across: -6.0, strength: 0.27 },
  ] as const;
  for (const limb of LIMBS) {
    const key = new THREE.DirectionalLight(
      new THREE.Color(EARTHSHINE_GROUND).getHex(),
      limb.strength
    );
    key.position.set(apertureMid + 4, CEILING_Y + 4 * EARTHSHINE_SLOPE, limb.across);
    key.target.position.set(apertureMid - 2, CEILING_Y - 2 * EARTHSHINE_SLOPE, 0);
    root.add(key, key.target);
  }

  /**
   * Two rectangles, touching exactly along x = 2.40 and nowhere overlapping.
   *
   * The second is the threshold, and it exists so the walk carries through to the
   * seam plane rather than stopping at the room's own fittings margin. Overlapping
   * rectangles are not a bug the union notices, but a gap between them is a wall
   * the player hits in a doorway that looks open.
   */
  const floor: readonly FloorRect[] = [
    { minX: -2.4, maxX: 2.4, minZ: -2.4, maxZ: 2.4, floorY: FLOOR_Y },
    { minX: 2.4, maxX: HALF, minZ: -0.55, maxZ: 0.55, floorY: FLOOR_Y },
  ];

  const points: readonly PointOfInterest[] = [
    // The check-in. The only operable thing in the compartment, and the reason
    // the compartment exists.
    { id: 'probe', label: 'the receiver bracket', position: [-2.36, 1.95, -1.5], operable: true },
    { id: 'perch', label: 'the perch', position: [2.03, FLOOR_Y + 0.62, 2.3] },
    { id: 'restraint', label: 'the restraint frame', position: [0, FRAME_MID, 0] },
    { id: 'grating', label: 'the ceiling grating', position: [apertureMid, CEILING_Y - 0.1, 0] },
  ];

  let checkIns = 0;

  return {
    root,
    // Just inside the door, looking the length of the room and pitched up, because
    // the room's whole claim is the height above you and the barred light on the
    // far wall. Stood level, the first frame is 25 m2 of empty deck.
    spawn: { position: [2.1, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.14 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    // Zero, and the only zero on the station. Silence is this room's signature and
    // it is what the probe's check-in arrives into.
    machineryHz: 0,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * A box, measured from the deck at 0.45 rather than from the origin.
     *
     * The clear volume is the NOMINAL wall plane, not the deepest band face: the
     * bands are liner relief, and a fitting allowed to reach the work band's 2.58
     * would be a fitting outside the pressure vessel everywhere the work band is
     * not.
     */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF - Math.abs(point.x),
        HALF - Math.abs(point.z)
      );
    },

    interact(id: string): boolean {
      if (id !== 'probe') return false;
      checkIns += 1;
      return true;
    },

    update(): void {
      // Nothing in here moves and nothing in here sounds. The brief has the light
      // bar drifting down the wall over the orbit, and it is deliberately not doing
      // that yet: the beam is authored into the wall's own facets, cut at the exact
      // heights the bars project to, so moving it means recutting the wall every
      // frame or letting the stripes snap between facets. A jumping bar of light in
      // the one room whose subject is stillness is worse than a still one.
      void checkIns;
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

export const MAGAZINE: CompartmentDefinition = {
  id: 'magazine',
  name: 'THE MAGAZINE',
  description: 'A stripped propellant magazine, 5 m square and 5.6 m to the crown. Silent.',
  ports: PORTS,
  extent: EXTENT,
  build: buildMagazine,
};

export const MAGAZINE_SOLO = {
  id: 'magazine',
  name: 'THE MAGAZINE',
  description: 'A stripped propellant magazine, 5 m square and 5.6 m to the crown. Silent.',
  build: () => soloStation(MAGAZINE),
};

export default MAGAZINE_SOLO;
