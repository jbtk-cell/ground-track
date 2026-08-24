/**
 * THE CRAWL - the room that exists so the next one is big.
 *
 * Nothing happens in here. There is no system in it, nothing to operate, no
 * reason to stop, and that is not an omission - it is the entire brief. Scale is
 * a comparison and nothing else: a 3.25 m deck reads as a hall only if you have
 * just come out of something that made you feel your own height. So this is the
 * smallest, lowest, darkest space on the station, it takes about eight seconds
 * to cross, and every metre of it is spent making the room after it larger.
 *
 * A duct that somebody fitted out for people afterwards, and not very well.
 *
 * THE FLOOR CLIMBS AND THE CEILING DOES NOT. That is the whole mechanism. A
 * tunnel that simply gets lower is a tunnel you can see getting lower from the
 * doorway, which means the compression is spent in the first frame; a deck that
 * comes up under you in three flat steps is something you find out about with
 * your legs, one step at a time, and each step spends 0.20 m of the headroom you
 * had. You enter under 2.55 m of crown and arrive at the blind end under 1.95 m
 * of it, having gained 0.60 m of deck and lost the same in air, with the eye at
 * 1.74 m. Nothing ever stops you. You will duck anyway.
 *
 * WHERE THE STATED 2.35 M WENT. The brief asks for a flat ceiling 2.35 m over
 * the entry deck, three 0.20 m steps, and 1.95 m of headroom at the blind end.
 * Those three cannot all be true - 2.35 less 0.60 is 1.75 - and of the three the
 * headroom is the one that has to hold, because 1.75 m of ceiling over a 1.74 m
 * eye is not a low room. It is a camera 10 mm under a surface: the near plane
 * clips the crown directly overhead and the player looks up through a hole in
 * the roof of a pressure vessel. So the ceiling is flat at 2.55 m and the far
 * end keeps its stated 1.95 m. The crown band still truncates on the way aft -
 * 0.50 m of it at the mouth, 0.30, 0.10, and none at all at the blind end, where
 * the work band runs all the way to the ceiling and `bands()` drops the crown
 * rather than inverting it. Reading how much crown is left is how a player
 * measures the ceiling in every other room, and here it runs out under them.
 *
 * THE TAPER IS FELT AND NEVER SEEN. 1.18 m at the mouth to 1.02 m at the blind
 * end is 0.64 degrees of convergence - far under what anyone notices looking
 * down a run, and deliberately so. It does its work at the moment you turn
 * round, which is also the moment the tunnel tells you how wide you are.
 *
 * THE TRUNK IS THE RULER. One cable run at a constant 1.88 m, dead level from
 * end to end while the deck climbs to meet it. At the mouth it is over your
 * shoulder; at the blind end it is at your waist. It is the only element in the
 * room that does not move with the floor, so it is the only thing that can
 * measure the floor, and it costs seven boxes.
 *
 * TWO LIT ENDS AND A DEAD MIDDLE. There is one lamp in this compartment and it
 * is 6 m from the door. The mouth is lit by what leaks in from the collar, the
 * blind end by a single small warm fitting, and the four metres between them by
 * nothing but the hemisphere - which is why the middle measures as the darkest
 * walkable place on the station and why 7.2 m reads as far. A run lit evenly
 * along its length has no distance in it. Both point sources carry a real range
 * so they genuinely die rather than fading politely, and the two ends sit at
 * different colour temperatures so a player who has turned round twice still
 * knows which way is out.
 *
 * AS-BUILT, ON A 1.20 M PITCH. Six ring frames standing proud of the liner, and
 * every fitting in the room sits in the 1.11 m bay between two of them and never
 * crosses one. The steps land on frames as well. One sentence - it is a pressure
 * duct on a module pitch and people came later - produces the rhythm, the
 * stowage positions, the handrail lengths and the step stations, which is a
 * great deal cheaper than deciding each of them.
 *
 * NO CAUTION DATUM. The station's one rust hairline is a wayfinding device: it
 * tells you which walls have vacuum behind them so that in a junction you know
 * which exit leads inward. A dead-end spur offers no such decision, so the
 * stripe would be decoration here, and the room has no red in it at all.
 *
 * WHAT THE GEOMETRY HAS TO OBEY, given a floor that steps and walls that lean:
 *
 *   - Every riser is the END of a wall run. The bands are struck from the LOCAL
 *     deck, so they jump 0.20 m at each step and the wall's own depth changes
 *     with them - the recessed work band on one side of a riser can sit 0.22 m
 *     outboard of the proud crown band on the other. Each riser therefore closes
 *     its walls across that step, band interval by band interval. A groove that
 *     runs off the end of a wall is a slot to space, and it has shipped twice.
 *   - Nothing box-shaped may cross a step. The riser and its tread are liner,
 *     not solids, because a solid spanning from the lower deck to the upper one
 *     has corners under the deck it stands on and `contains` is right to refuse
 *     it. The only solid at a step is the nosing, and it sits ON the tread with
 *     its underside on the tread's own plane, back to back, held short in both
 *     other axes - a lip flush INTO the tread would share that plane facing the
 *     same way and the two would fight for every pixel.
 *   - Every fitting is sized against the worst case it spans, not against the
 *     middle. Headroom here is a function of x, and the middle of a thing is the
 *     one place its clearance is never tested.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import { CROWN_COLOUR, REVEAL_COLOUR, WORK_TOP_M, bands, deepestRelief } from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

const HALF_LENGTH = 3.6;
const LENGTH = 2 * HALF_LENGTH;

/** Exactly the seam at the mouth, and 0.16 m less of it at the blind end. */
const HALF_Z_MOUTH = 0.59;
const HALF_Z_BLIND = 0.51;

/**
 * Flat, and the only surface in the room that is. See the module note on why
 * this is not the 2.35 m the brief asks for.
 */
const CEILING_Y = 2.55;

/** The deck the entry seam stands on. Everything else is measured off it. */
const FLOOR_Y = 0;
const STEP = 0.2;
/** Where the deck steps up, mouth to blind end. Each one lands on a ring frame. */
const RISERS = [1.8, 0.6, -0.6] as const;
const BLIND_DECK = RISERS.length * STEP;

/** The module pitch, six frames of it, 0.09 m thick and 0.10 m proud. */
const FRAMES = [3.0, 1.8, 0.6, -0.6, -1.8, -3.0] as const;
const FRAME_HALF = 0.045;
const FRAME_PROUD = 0.1;

/** The level run, and the two heights it is fixed at for the whole length. */
const TRUNK_Y0 = 1.88;
const TRUNK_Y1 = 2.05;
const TRUNK_PROUD = 0.13;

const EYE_HEIGHT = 1.74;
/**
 * Half the walkable width, held to the NARROWEST section rather than to each
 * rectangle's own, so all four deck levels share one z span. Rectangles of
 * different widths meeting at a step refuse the walk wherever the narrower one
 * stops, and a player who cannot get up the second step never sees the room.
 */
const WALK_HALF_Z = 0.3;

const SEED = 0x3ac;
const JITTER = 0.05;

/** One port, at the mouth. The far end is a blank and the station caps this. */
const PORTS = [port('fore', [HALF_LENGTH, SEAM.height / 2, 0], '+x', FLOOR_Y)] as const;

const EXTENT = {
  minX: -HALF_LENGTH,
  maxX: HALF_LENGTH,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z_MOUTH - 0.2,
  maxZ: HALF_Z_MOUTH + 0.2,
} as const;

/** Half the duct's nominal width at a station along it. Linear, and gentle. */
function halfWidthAt(x: number): number {
  const t = (Math.min(Math.max(x, -HALF_LENGTH), HALF_LENGTH) + HALF_LENGTH) / LENGTH;
  return HALF_Z_BLIND + (HALF_Z_MOUTH - HALF_Z_BLIND) * t;
}

/**
 * The deck under a station along the run.
 *
 * A riser's own plane reports the LOWER deck, which is the permissive answer and
 * the correct one: the frame that straddles a step stands on the tread with its
 * fore half overhanging the deck below, and the alternative reading would put
 * that overhang outside the hull.
 */
function deckAt(x: number): number {
  for (const [i, riser] of RISERS.entries()) {
    if (x >= riser) return i * STEP;
  }
  return BLIND_DECK;
}

/** How far inboard of the nominal plane the wall stands, at a height on a deck. */
function reliefAt(deck: number, y: number): number {
  let last = 0;
  for (const band of bands(deck, CEILING_Y)) {
    last = band.relief;
    if (y <= band.y1) return band.relief;
  }
  return last;
}

/** The four decks, as x runs, with how finely each one's liner is cut. */
const LEVELS: readonly {
  readonly deck: number;
  readonly x0: number;
  readonly x1: number;
  readonly segments: number;
}[] = [
  { deck: 0, x0: 1.8, x1: HALF_LENGTH, segments: 6 },
  { deck: 0.2, x0: 0.6, x1: 1.8, segments: 4 },
  { deck: 0.4, x0: -0.6, x1: 0.6, segments: 4 },
  { deck: BLIND_DECK, x0: -HALF_LENGTH, x1: -0.6, segments: 10 },
];

/**
 * The bays between the ring frames, mouth to blind end.
 *
 * Everything fitted in this room is placed against one of these rather than
 * against the room, which is what makes six frames read as a system rather than
 * as six ribs somebody drew.
 */
const BAYS: readonly (readonly [number, number])[] = (() => {
  const edges: number[] = [-HALF_LENGTH];
  for (const x of [...FRAMES].sort((a, b) => a - b)) edges.push(x - FRAME_HALF, x + FRAME_HALF);
  edges.push(HALF_LENGTH);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    if (a === undefined || b === undefined) continue;
    out.push([a, b]);
  }
  return out;
})();

/** Stowage, in alternating bays, in irregular sizes. The only soft silhouette. */
const STOWED = [
  { x: -2.62, length: 0.5, height: 0.52, depth: 0.22 },
  { x: -2.1, length: 0.42, height: 0.46, depth: 0.2 },
  { x: -1.42, length: 0.46, height: 0.5, depth: 0.21 },
  { x: -0.28, length: 0.5, height: 0.44, depth: 0.2 },
  { x: 0.28, length: 0.42, height: 0.54, depth: 0.22 },
  { x: 1.18, length: 0.48, height: 0.48, depth: 0.2 },
] as const;

/** One handrail per long bay, at 1.02 m over the local deck - below the datum. */
const RAILS = [-2.4, -1.2, 0, 1.2, 2.4] as const;

function crawlSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The six ring frames. Uprights stop at the 2.05 m horizon rather than at
  // the ceiling: above it the crown band is itself 0.14 m proud, so a frame
  // carried any higher would simply be swallowed by the wall it is meant to
  // stand in front of. The header spans BETWEEN the uprights, never across
  // them - overlapping boxes share their end faces and shared faces fight.
  for (const [i, station] of FRAMES.entries()) {
    const x0 = station - FRAME_HALF;
    const x1 = station + FRAME_HALF;
    // Sized against the aft, narrower, higher-decked side: the worst case a
    // frame straddling a step spans.
    const deck = deckAt(x0);
    const hz = halfWidthAt(x0);
    const top = Math.min(deck + WORK_TOP_M, CEILING_Y);
    const inner = hz - FRAME_PROUD;
    parts.push(
      solid(`frame-${i}-port`, 'frame', x0, x1, deck, top, -hz, -inner),
      solid(`frame-${i}-stbd`, 'frame', x0, x1, deck, top, inner, hz),
      solid(`frame-${i}-head`, 'frame', x0, x1, CEILING_Y - 0.075, CEILING_Y, -inner, inner)
    );
    // The frame ring closes across the deck as well, except where a step has
    // taken that job. Held clear of its own uprights in plan: two boxes resting
    // on one deck and overlapping in plan share their undersides.
    if (!(RISERS as readonly number[]).includes(station)) {
      const rib = hz - FRAME_PROUD - 0.005;
      parts.push(
        solid(
          `frame-${i}-rib`,
          'frame',
          station - 0.04,
          station + 0.04,
          deck,
          deck + 0.05,
          -rib,
          rib
        )
      );
    }
  }

  // --- The three nosings, and the one detail in this room that is a rule rather
  // than a choice. Each sits ON its tread - underside on the tread's own plane,
  // so the two meet back to back - and is held 5 mm short of the step edge and
  // well clear of the frame uprights, because a lip let INTO the tread would
  // share that plane facing the same way over its whole area.
  for (const [i, station] of RISERS.entries()) {
    const upper = (i + 1) * STEP;
    const x0 = station - 0.095;
    const hz = halfWidthAt(x0) - 0.12;
    parts.push(solid(`nosing-${i}`, 'nosing', x0, station - 0.005, upper, upper + 0.025, -hz, hz));
  }

  // --- The cable trunk: level, continuous, one segment per bay so it passes
  // through each frame in a notch rather than through the middle of it. Each
  // segment is sized off its own bay's narrow end, so it hugs a wall that leans.
  for (const [i, bay] of BAYS.entries()) {
    const [b0, b1] = bay;
    const x0 = Math.max(b0 + 0.01, -3.53);
    const x1 = Math.min(b1 - 0.01, 3.4);
    if (x1 - x0 < 0.05) continue;
    const hz = halfWidthAt(x0);
    parts.push(solid(`trunk-${i}`, 'frame', x0, x1, TRUNK_Y0, TRUNK_Y1, -hz, -(hz - TRUNK_PROUD)));
  }

  // --- Handrails, one per long bay, on the wall the trunk runs down and 0.86 m
  // below it at every deck level. Their brackets stop at the nominal plane: the
  // work band is a RECESS, and a bracket built to the surface it is really
  // bolted to would stand outboard of the pressure vessel.
  for (const [i, centre] of RAILS.entries()) {
    const deck = deckAt(centre);
    const y = deck + 1.02;
    const x0 = centre - 0.31;
    const hz = halfWidthAt(x0);
    parts.push(
      solid(`rail-${i}`, 'trim', x0, centre + 0.31, y, y + 0.045, -(hz - 0.06), -(hz - 0.105))
    );
    for (const [k, at] of [centre - 0.26, centre + 0.26].entries()) {
      const bhz = halfWidthAt(at - 0.02);
      parts.push(
        solid(
          `rail-${i}-arm-${k}`,
          'trim',
          at - 0.02,
          at + 0.02,
          y - 0.02,
          y + 0.065,
          -bhz,
          -(bhz - 0.06)
        )
      );
    }
  }

  // --- Stowage, strapped to the starboard wall clear of the deck. Their outer
  // faces are set 20 mm outboard of the nominal plane so they are pressed into
  // the kick band rather than floating 40 mm off it.
  for (const [i, bag] of STOWED.entries()) {
    const x0 = bag.x - bag.length / 2;
    const x1 = bag.x + bag.length / 2;
    const deck = deckAt(x0);
    const y0 = deck + 0.12;
    const y1 = y0 + bag.height;
    const hz = halfWidthAt(x0);
    const z1 = hz - 0.02;
    const z0 = z1 - bag.depth;
    parts.push(
      solid(`stow-${i}`, 'soft', x0, x1, y0, y1, z0, z1),
      // The strap that holds it there, standing proud of the bag and buried in
      // it at the back, so neither of its faces lands on one of the bag's.
      solid(
        `stow-${i}-strap`,
        'trim',
        x0 - 0.02,
        x1 + 0.02,
        (y0 + y1) / 2 - 0.02,
        (y0 + y1) / 2 + 0.02,
        z0 - 0.015,
        z1 - 0.015
      )
    );
  }

  // --- The perch. S9: one identical rest object per compartment, within 2 m of
  // the port the player arrives by and on the left as they come through it.
  // Entering here means walking -x, so left is starboard, and it is the first
  // fitting in the room.
  {
    const hz = halfWidthAt(2.3);
    const bracketZ = halfWidthAt(2.55);
    const loopZ = halfWidthAt(2.4);
    parts.push(
      solid('perch', 'soft', 2.3, 2.92, 0.62, 0.655, hz - 0.36, hz - 0.02),
      solid('perch-bracket', 'trim', 2.55, 2.67, 0.28, 0.62, bracketZ - 0.24, bracketZ - 0.02),
      solid('perch-loop', 'trim', 2.4, 2.82, 1.36, 1.4, loopZ - 0.11, loopZ - 0.07)
    );
    // The two stubs back to the wall, held 5 mm inside the bar's own ends: a
    // stub flush with the end of the thing it carries shares that end's plane.
    for (const [k, at] of [2.405, 2.775].entries()) {
      const stub = halfWidthAt(at);
      parts.push(
        solid(`perch-loop-end-${k}`, 'trim', at, at + 0.04, 1.355, 1.405, stub - 0.1, stub)
      );
    }
  }

  // --- The blind end: a bolted blank with the station's build plate on it, and
  // the reason there is anything to look at when you turn round.
  parts.push(
    solid('blank', 'frame', -HALF_LENGTH, -3.53, BLIND_DECK, CEILING_Y, -0.49, 0.49),
    solid('build-plate', 'trim', -3.53, -3.522, 1.3, 1.4, -0.14, 0.14)
  );

  // --- A duct running overhead into the blank and stopping dead against it.
  parts.push(
    solid('duct', 'frame', -3.5, -2.62, 2.14, 2.42, 0.09, 0.37),
    solid('duct-collar', 'frame', -3.53, -3.4, 2.1, 2.46, 0.05, 0.41)
  );

  // --- The only lamp in the compartment, 6 m from the door and warm, so the
  // two ends of the run are different temperatures. Its diffuser carries the
  // whole value in emissive and takes no diffuse term at all - a lit pale
  // surface plus a pale emissive clips, in a game with no white in it.
  {
    const hz = halfWidthAt(-2.9);
    parts.push(
      solid('lamp-housing', 'trim', -2.9, -2.62, 2.2, 2.3, -(hz - 0.04), -(hz - 0.14)),
      solid('lamp', 'lamp', -2.88, -2.64, 2.22, 2.28, -(hz - 0.14), -(hz - 0.155))
    );
  }

  // --- S11: exactly one thing out of its stowed position, and one only. A
  // stowage bag unclipped, down on the tread and resting against the middle
  // nosing, two metres from the row of its clipped siblings.
  parts.push(solid('loose-bag', 'soft', 0.085, 0.505, 0.4, 0.72, -0.12, 0.22));

  return parts;
}

/** Deck, ceiling, two leaning walls, three risers, and both ends. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deckColour = new THREE.Color(PALETTE.HULL_SHADOW);
  const roof = new THREE.Color(CROWN_COLOUR);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const inward = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  for (const level of LEVELS) {
    const list = bands(level.deck, CEILING_Y);
    const first = list[0];
    const last = list[list.length - 1];
    if (first === undefined || last === undefined) continue;
    const span = level.x1 - level.x0;

    for (let i = 0; i < level.segments; i += 1) {
      const x0 = level.x0 + (span * i) / level.segments;
      const x1 = level.x0 + (span * (i + 1)) / level.segments;
      const mid = (x0 + x1) / 2;
      const hz0 = halfWidthAt(x0);
      const hz1 = halfWidthAt(x1);
      inward.set(mid, level.deck + 1.2, 0);

      // The deck, clipped to the KICK band's own face rather than to the
      // nominal plane. Clipped short of it and the missing strip is not a gap
      // in the floor, it is open space; clipped past it and the deck and the
      // kick band's lower return share a plane, face the same way, and comb.
      const d0 = hz0 - first.relief;
      const d1 = hz1 - first.relief;
      pushQuad(
        target,
        v(x0, level.deck, -d0),
        v(x1, level.deck, -d1),
        v(x1, level.deck, d1),
        v(x0, level.deck, d0),
        inward,
        facetColour(deckColour, v(mid, level.deck, 0), SEED, JITTER)
      );

      // The crown, clipped the same way to whatever band reaches it here -
      // which is the crown band over three of the four levels and the truncated
      // work band over the blind one, 0.22 m further outboard.
      const c0 = hz0 - last.relief;
      const c1 = hz1 - last.relief;
      pushQuad(
        target,
        v(x0, CEILING_Y, -c0),
        v(x1, CEILING_Y, -c1),
        v(x1, CEILING_Y, c1),
        v(x0, CEILING_Y, c0),
        inward,
        facetColour(roof, v(mid, CEILING_Y, 0), SEED + i * 5, JITTER)
      );

      for (const [bi, band] of list.entries()) {
        for (const side of [-1, 1] as const) {
          const za = side * (hz0 - band.relief);
          const zb = side * (hz1 - band.relief);
          pushQuad(
            target,
            v(x0, band.y0, za),
            v(x1, band.y0, zb),
            v(x1, band.y1, zb),
            v(x0, band.y1, za),
            inward,
            facetColour(
              new THREE.Color(band.colour),
              v(mid, (band.y0 + band.y1) / 2, za),
              SEED + 3,
              JITTER
            )
          );
        }
        // The return that carries one band's depth onto the next one's. One per
        // boundary rather than one per band edge: a return at the deck or at
        // the ceiling would land in the same plane as the deck or the ceiling.
        const next = list[bi + 1];
        if (next === undefined || Math.abs(next.relief - band.relief) < 1e-9) continue;
        for (const side of [-1, 1] as const) {
          const za = side * (hz0 - band.relief);
          const zb = side * (hz1 - band.relief);
          const na = side * (hz0 - next.relief);
          const nb = side * (hz1 - next.relief);
          pushQuad(
            target,
            v(x0, band.y1, za),
            v(x1, band.y1, zb),
            v(x1, band.y1, nb),
            v(x0, band.y1, na),
            inward,
            facetColour(reveal, v(mid, band.y1, (za + na) / 2), SEED + 5, JITTER)
          );
        }
      }
    }
  }

  // --- The three steps, and the closures they owe.
  //
  // A riser is where two wall runs meet, and the two runs disagree: the bands
  // are struck from the local deck, so at the step every boundary jumps 0.20 m
  // and the wall's depth jumps with it - up to 0.22 m of it where a proud crown
  // on the low side meets a recessed work band on the high one. Left open, that
  // is a groove running off the end of a wall, which is a slot to space.
  for (const [i, station] of RISERS.entries()) {
    const lower = i * STEP;
    const upper = (i + 1) * STEP;
    const hz = halfWidthAt(station);
    const kick = bands(lower, CEILING_Y)[0];
    const edge = hz - (kick?.relief ?? 0);

    inward.set(station + 1, upper + 0.6, 0);
    pushQuad(
      target,
      v(station, lower, -edge),
      v(station, lower, edge),
      v(station, upper, edge),
      v(station, upper, -edge),
      inward,
      facetColour(hull, v(station, (lower + upper) / 2, 0), SEED + 7, JITTER)
    );

    const cuts = new Set<number>([upper, CEILING_Y]);
    for (const deck of [lower, upper]) {
      for (const band of bands(deck, CEILING_Y)) {
        if (band.y0 > upper && band.y0 < CEILING_Y) cuts.add(band.y0);
        if (band.y1 > upper && band.y1 < CEILING_Y) cuts.add(band.y1);
      }
    }
    const heights = [...cuts].sort((a, b) => a - b);
    for (let k = 0; k + 1 < heights.length; k += 1) {
      const y0 = heights[k];
      const y1 = heights[k + 1];
      if (y0 === undefined || y1 === undefined || y1 - y0 < 1e-6) continue;
      const between = (y0 + y1) / 2;
      const za = hz - reliefAt(lower, between);
      const zb = hz - reliefAt(upper, between);
      if (Math.abs(za - zb) < 1e-6) continue;
      // Visible only from the side whose wall stands further outboard; the
      // other side's own face is in front of it.
      const towards = zb > za ? station - 1 : station + 1;
      for (const side of [-1, 1] as const) {
        inward.set(towards, between, (side * (za + zb)) / 2);
        pushQuad(
          target,
          v(station, y0, side * za),
          v(station, y0, side * zb),
          v(station, y1, side * zb),
          v(station, y1, side * za),
          inward,
          facetColour(hull, v(station, between, side * za), SEED + 11, JITTER)
        );
      }
    }
  }

  // --- The mouth. The duct is exactly the seam's width here, so there is no
  // end wall to speak of: what remains is the header over the opening and the
  // two strips that close the work band's recess where the room stops. Those
  // strips are the whole of gotcha two - 0.08 m of open groove either side of a
  // doorway is 886 pixels of outer space at eye height, and it survived an
  // airtight gate once because every pinned pose stood on the centre line.
  {
    // Held one seam inset inboard of the port plane. The room on the other side
    // ends in that plane too, and two shells at one depth facing one way is
    // decided per pixel by float noise - see SEAM_INSET_M. The section is read
    // at the true plane so the mouth is still exactly the seam's width.
    const mouthX = HALF_LENGTH - SEAM_INSET_M;
    const hz = halfWidthAt(HALF_LENGTH);
    const halfW = SEAM.width / 2;
    const outerZ = hz + deepestRelief(FLOOR_Y, CEILING_Y);
    inward.set(mouthX - 1, 1.2, 0);
    const panel = (z0: number, z1: number, y0: number, y1: number): void => {
      if (z1 - z0 < 1e-6 || y1 - y0 < 1e-6) return;
      pushQuad(
        target,
        v(mouthX, y0, z0),
        v(mouthX, y0, z1),
        v(mouthX, y1, z1),
        v(mouthX, y1, z0),
        inward,
        facetColour(hull, v(mouthX, (y0 + y1) / 2, (z0 + z1) / 2), SEED + 13, JITTER)
      );
    };
    panel(halfW, outerZ, FLOOR_Y, SEAM.height);
    panel(-outerZ, -halfW, FLOOR_Y, SEAM.height);
    panel(-outerZ, outerZ, SEAM.height, CEILING_Y);

    // And the other half of the same argument, for the bands that stand PROUD:
    // the room is 0.12 m narrower than its own doorway at the kick, so the
    // jamb has to return that step out to the collar's section. Seen from the
    // collar, never from the room.
    const outward = new THREE.Vector3(mouthX + 1, 1.2, 0);
    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      if (band.relief <= 0) continue;
      const y1 = Math.min(band.y1, SEAM.height);
      if (y1 - band.y0 < 1e-6) continue;
      const face = hz - band.relief;
      for (const side of [-1, 1] as const) {
        pushQuad(
          target,
          v(mouthX, band.y0, side * face),
          v(mouthX, band.y0, side * halfW),
          v(mouthX, y1, side * halfW),
          v(mouthX, y1, side * face),
          outward,
          facetColour(hull, v(mouthX, (band.y0 + y1) / 2, side * face), SEED + 17, JITTER)
        );
      }
    }
  }

  // --- The blind end, out to the deepest band face for the same reason, and in
  // one piece because there is no hole in it.
  {
    const hz = halfWidthAt(-HALF_LENGTH);
    const outerZ = hz + deepestRelief(BLIND_DECK, CEILING_Y);
    inward.set(-HALF_LENGTH + 1, BLIND_DECK + 0.9, 0);
    pushQuad(
      target,
      v(-HALF_LENGTH, BLIND_DECK, -outerZ),
      v(-HALF_LENGTH, BLIND_DECK, outerZ),
      v(-HALF_LENGTH, CEILING_Y, outerZ),
      v(-HALF_LENGTH, CEILING_Y, -outerZ),
      inward,
      facetColour(hull, v(-HALF_LENGTH, BLIND_DECK + 0.9, 0), SEED + 19, JITTER)
    );
  }

  return toGeometry(target);
}

function buildCrawl(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'crawl';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'crawl-shell';
  root.add(shell);

  const parts = crawlSolids();
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
    soft: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL_SHADOW),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The three nosings, and nothing else in the room carries this. They are
    // the only pale thing at floor level, which is what makes a step visible
    // from far enough away to take it without looking down.
    nosing: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.CLOUD),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The lamp-diffuser rule: no diffuse term, the whole value in emissive, and
    // low - this is one small fitting in a room that is meant to be under-lit.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.SETTLEMENT),
      emissiveIntensity: 0.3,
    }),
  };
  for (const key of Object.keys(materials)) {
    const solids = parts.filter((part) => part.material === key).map((part) => boxOf(part));
    const material = materials[key];
    if (solids.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `crawl-${key}`;
    root.add(mesh);
  }

  // Deliberately the lowest ambient in the station. This room is under-lit and
  // should be: it is the value the next room is measured against, and the
  // hemisphere is the only thing reaching the middle four metres at all.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    new THREE.Color(PALETTE.NIGHT_SIDE).getHex(),
    0.32
  );
  root.add(ambient);

  // Two sources, both with a real range on them, and four metres of nothing
  // between. A directional could not do this job at any level: it hands every
  // facet in the run the same term, so the middle would be lit exactly as well
  // as the ends and the room would lose the only distance cue it has.
  const mouth = new THREE.PointLight(new THREE.Color(PALETTE.DAWN_CREAM).getHex(), 0.62, 4.2, 1);
  mouth.position.set(3.42, 1.3, 0);
  mouth.name = 'crawl-mouth';
  const far = new THREE.PointLight(new THREE.Color(PALETTE.SETTLEMENT).getHex(), 0.3, 2.8, 1);
  far.position.set(-2.76, 2.2, -0.12);
  far.name = 'crawl-lamp';
  root.add(mouth, far);

  /**
   * Four rectangles at four heights, each touching the next exactly.
   *
   * Touching rather than overlapping is what lets the walk cross between deck
   * levels: the union stays continuous, so a step is a step and the eye settles
   * onto the new height over its own time constant. Overlap them and two floor
   * heights are true at once in the strip where they meet.
   */
  const floor: readonly FloorRect[] = [
    { minX: 1.8, maxX: HALF_LENGTH, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: 0 },
    { minX: 0.6, maxX: 1.8, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: 0.2 },
    { minX: -0.6, maxX: 0.6, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: 0.4 },
    { minX: -3.5, maxX: -0.6, minZ: -WALK_HALF_Z, maxZ: WALK_HALF_Z, floorY: BLIND_DECK },
  ];

  // Nothing here is operable, and that is the point of the room: the arm is the
  // only signal in this game that a thing can be used, so a compartment with
  // nothing to use must not reach for anything. There is no interact().
  const points: readonly PointOfInterest[] = [
    { id: 'perch', label: 'the perch', position: [2.61, 0.72, 0.42] },
    { id: 'trunk', label: 'the cable run', position: [-1.2, 1.96, -0.4] },
    { id: 'blank', label: 'the blank flange', position: [-3.42, 1.35, 0] },
    { id: 'loose-bag', label: 'a stowage bag, unclipped', position: [0.3, 0.56, 0.05] },
  ];

  return {
    root,
    // Half a metre inside the mouth, facing up the climb, so the first frame is
    // the run getting smaller and the two nosings stepping away.
    spawn: { position: [3.1, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0.06 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    // The lowest tone on the station, and low enough to be felt rather than
    // heard. A duct carries the machinery of the rooms either side of it.
    machineryHz: 33,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * A leaning box with a stepped floor.
     *
     * Both of those terms are load-bearing and neither is optional. The taper
     * means a fitting that clears the wall at one end of itself may be through
     * it at the other, so a box is only inside if its narrow end is; the steps
     * mean the floor under a point is a function of x, so nothing may reach
     * below the deck it stands on. This is the same arithmetic the liner is
     * drawn from - if the two ever disagree, the hull test passes while the
     * wall has a hole in it.
     */
    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - deckAt(point.x),
        CEILING_Y - point.y,
        halfWidthAt(point.x) - Math.abs(point.z),
        HALF_LENGTH - Math.abs(point.x)
      );
    },

    update(): void {
      // Nothing in this room moves. Nothing in it can be operated, either: it
      // houses no system, and the eight seconds it takes to cross are the whole
      // of what it does.
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

export const CRAWL: CompartmentDefinition = {
  id: 'crawl',
  name: 'THE CRAWL',
  description: 'A 7.2 m duct, 1.18 narrowing to 1.02, its deck climbing 0.60 in three steps.',
  ports: PORTS,
  extent: EXTENT,
  build: buildCrawl,
};

export const CRAWL_SOLO = {
  id: 'crawl',
  name: 'THE CRAWL',
  description: 'A 7.2 m duct, 1.18 narrowing to 1.02, its deck climbing 0.60 in three steps.',
  build: () => soloStation(CRAWL),
};

export default CRAWL_SOLO;
