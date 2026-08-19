/**
 * THE BERTH - where resupply arrives, and the only room kept empty.
 *
 * Ten compartments now stand between the airlock and this one, and every
 * single one of them is FULL. Racks of hardware, ranks of tanks, a plot table,
 * three galleries, a frame album, a grating over a pit. That is correct for
 * ten rooms and it is a problem for eleven, because a station where every room
 * is dense has no way to say that a particular room is dense - the tank farm
 * and the manifest wall read as the same kind of place, which is to say as
 * texture. The eleventh room is where the argument gets its full stop: nothing
 * in the middle, at all, on purpose, and the emptiness is the content.
 *
 * It is also the only room that is empty for a REASON a player can name
 * without being told. Things have to come through here. A bay you keep clear
 * is the most obviously functional space on any working vessel, and the
 * clearing is visible as wear rather than as absence: sixty-three tie-down
 * sockets flush in the deck on a 0.6 m grid, and haloes worn round the eleven
 * of them that actually get used.
 *
 * AN OCTAGON, AND THE ONLY ONE. Every other compartment is a box, a corridor,
 * a shaft or an arc. This is a regular eight-sided plan, 4.8 m across the
 * flats, and it is that shape because a pressure vessel that takes a docking
 * load takes it into an end cap rather than into a wall. It also does
 * something no box can: a ring of light and eight facets at eight angles gives
 * eight distinct values off one rig, so the most evenly lit room in the
 * station is also the one with the most steps in it. Flat light on flat walls
 * is a warehouse; flat light on a faceted drum is a bell.
 *
 * THE HATCH IS ROUND AND NOTHING ELSE IS. Every opening in this station is a
 * rectangle - two sizes of them, and the whole point of GALLERY_SEAM is that
 * having exactly two is what makes the second one mean anything. The hatch in
 * the far facet is a 1.15 m circle with eight dogs round its rim, and it is
 * not a port: it does not go to another compartment, it goes outside, and it
 * is shut. It is the only curve in a station of straight lines and the only
 * door that is not a way through. Both of those say the same thing, which is
 * that the station ends here.
 *
 * IT IS LIT LIKE A WORKPLACE. Four fittings in a cornice ring, no key, no
 * accent, no pool. THE GANTRY next door is lit from the floor and THE SILL
 * from a hole in it; this is the plainest, evenest light in the game, and the
 * plainness is the characterisation. Somebody works in here, in the ordinary
 * sense that somebody has to unload a crate at three in the morning, and the
 * light is the light you would fit for that and no other reason.
 *
 * WHAT IS OUT OF PLACE. One strap, hanging from a stanchion with nothing on
 * the end of it, still in the loop it was cinched to. In a room whose entire
 * subject is that everything has been cleared away, a single fitting left
 * rigged is louder than any amount of clutter would be.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, SEAM_INSET_M, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, pushFacet, sink, toGeometry } from '../kit/mesh';
import { CROWN_COLOUR, REVEAL_COLOUR, bands, deepestRelief } from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

/**
 * The apothem: centre to the middle of a facet, metres.
 *
 * 2.4 puts 4.8 m between opposite flats, which is the smallest drum that takes
 * the 1.18 m seam and the 1.15 m hatch on opposite faces and still leaves
 * 0.40 m of jamb either side of each. Below about 2.2 the openings start
 * eating their own facets and the octagon stops reading as an octagon.
 */
const A = 2.4;
const FACETS = 8;

/** Half the width of one facet: A tan(22.5 degrees). */
const HALF_FACET = A * Math.tan(Math.PI / FACETS);

const FLOOR_Y = 0;
const CEILING_Y = 3.4;
const EYE_HEIGHT = 1.74;

/** How far the walkable rectangles stand off the wall line. */
const WALL_STANDOFF = 0.12;

/** The round hatch in the aft facet: diameter, and how finely the circle is cut. */
const HATCH_R = 0.575;
/**
 * Half-width of the square mounting plate the hatch is set in.
 *
 * 24 segments at 15 degrees puts a rim point exactly on 45, 135, 225 and 315,
 * so the plate's four corners land on segment boundaries and the ring between
 * circle and square closes without a sliver.
 */
const SURROUND = HATCH_R + 0.15;
const HATCH_SEGMENTS = 24;
const HATCH_Y = 1.28;
const DOGS = 8;

/** The tie-down grid. Flush sockets, and the eleven that are worn. */
const SOCKET_PITCH = 0.6;
const SOCKET_HALF = 0.055;
const WORN = new Set([
  '-1,0',
  '0,0',
  '1,0',
  '2,0',
  '-1,1',
  '0,1',
  '1,-1',
  '0,-1',
  '-2,0',
  '0,2',
  '0,-2',
]);

/**
 * How far a surface runs past the one it meets, metres.
 *
 * Two quads that merely share an edge leave that edge to floating point, and at
 * a grazing angle a ray finds neither of them - which is a hairline of the
 * exterior pass, because that pass has already cleared depth.
 */
const LAP = 0.06;

const SEED = 0xbe4;
const JITTER = 0.05;

/** Outward normal of facet k, in the xz plane. Facet 0 faces +x, facet 4 faces -x. */
function normalOf(k: number): THREE.Vector3 {
  const theta = (k / FACETS) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
}

/**
 * How far out facet k's plane stands when the deck and lid are cut to it.
 *
 * Every facet gets the lap and the deepest band relief, so the deck runs out
 * behind the wall and the joint between them is an overlap rather than a
 * shared line. Facet 0 gets neither, because facet 0 is the seam: material
 * past a port plane is material in the neighbour's collar, and the deck laid
 * over the doorway put 0.315 m2 of itself in the same plane as THE RACKS'
 * deck, facing the same way, which is the definition of a z-fight.
 */
function planeOf(k: number, deepest: number): number {
  const j = ((k % FACETS) + FACETS) % FACETS;
  return j === 0 ? A - SEAM_INSET_M : A + LAP + deepest;
}

/**
 * Where facet k's plane meets facet k+1's: the octagon's corner, solved rather
 * than assumed.
 *
 * It has to be solved because the facets no longer all stand at one radius -
 * the ported one is held back - so the corner is not at a fixed distance and a
 * fan drawn to a fixed distance would tear a wedge out of the deck exactly
 * where the doorway is.
 */
function corner(k: number, deepest: number): THREE.Vector3 {
  const a = normalOf(k);
  const b = normalOf(k + 1);
  const da = planeOf(k, deepest);
  const db = planeOf(k + 1, deepest);
  const det = a.x * b.z - a.z * b.x;
  return new THREE.Vector3((da * b.z - db * a.z) / det, 0, (a.x * db - b.x * da) / det);
}

/** A point on facet k, `s` metres along it from its middle, at height y. */
function onFacet(k: number, s: number, y: number, out = A): THREE.Vector3 {
  const n = normalOf(k);
  // The tangent, which is the normal turned a quarter turn in the deck plane.
  return new THREE.Vector3(n.x * out - n.z * s, y, n.z * out + n.x * s);
}

/**
 * One port, and it is the last room on the run.
 *
 * Fore is +x, on facet 0, joining THE RACKS. There is deliberately no second
 * one: the manifest room sits between the way in and everything else, which is
 * what a manifest is for, and the only other opening here goes outside.
 */
const PORTS = [port('fore', [A, SEAM.height / 2, 0], '+x', FLOOR_Y)] as const;

/**
 * The footprint, and it stops DEAD at the port plane on the ported axis.
 *
 * maxX is A rather than A plus an allowance, because +x is where facet 0 is
 * and facet 0 is a seam. A room whose declared extent reaches past its own
 * port plane is a room claiming the collar, and the collar belongs to both
 * sides - THE PLOT declared 0.10 m of THE CRAWL that way and the overlap check
 * caught it. Every other direction gets 0.2 m for the lapped deck and lid.
 *
 * The octagon's greatest reach along x is exactly A: its vertices sit at
 * 22.5 degrees off each axis, at radius A/cos(22.5), whose x component is A
 * again. So this is tight rather than generous.
 */
const EXTENT = {
  minX: -A - 0.2,
  maxX: A,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -A - 0.2,
  maxZ: A + 0.2,
} as const;

function berthSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The tie-down grid. Flush, so a socket is a value change in the deck
  // rather than a thing to trip over: 0.02 m proud is the whole of it, and the
  // worn ones get a halo one step lighter and a hair wider. Sixty-three of them
  // in a room with nothing else on the floor is what makes the emptiness read
  // as cleared rather than as unbuilt.
  const reach = Math.floor((A - 0.35) / SOCKET_PITCH);
  for (let i = -reach; i <= reach; i += 1) {
    for (let j = -reach; j <= reach; j += 1) {
      const x = i * SOCKET_PITCH;
      const z = j * SOCKET_PITCH;
      // Inside the drum, and clear of both openings' thresholds.
      if (!inside(x, z, 0.34)) continue;
      const worn = WORN.has(`${i},${j}`);
      if (worn) {
        const h = SOCKET_HALF * 2.4;
        parts.push(
          solid(
            `halo-${i}-${j}`,
            'wear',
            x - h,
            x + h,
            FLOOR_Y + 0.001,
            FLOOR_Y + 0.008,
            z - h,
            z + h
          )
        );
      }
      parts.push(
        solid(
          `socket-${i}-${j}`,
          'socket',
          x - SOCKET_HALF,
          x + SOCKET_HALF,
          FLOOR_Y + 0.006,
          FLOOR_Y + 0.026,
          z - SOCKET_HALF,
          z + SOCKET_HALF
        )
      );
    }
  }

  // --- The dogs round the hatch. Eight, because the hatch has eight and so
  // does the room, and a docking ring that shares its count with the drum it
  // sits in looks like it was designed by the same people.
  for (let d = 0; d < DOGS; d += 1) {
    const phi = (d / DOGS) * Math.PI * 2 + Math.PI / DOGS;
    const s = Math.sin(phi) * (HATCH_R + 0.16);
    const y = HATCH_Y + Math.cos(phi) * (HATCH_R + 0.16);
    const p = onFacet(4, s, y, A - 0.11);
    // Boxed square to the world: a Solid is an AABB and cannot be rotated, and
    // the facet it sits on faces -x, so a box is square to it anyway.
    parts.push(
      solid(`dog-${d}`, 'trim', p.x - 0.05, p.x + 0.05, y - 0.05, y + 0.05, p.z - 0.07, p.z + 0.07)
    );
  }

  // --- The two stanchions, and the one strap left rigged. They stand against
  // facets 3 and 5, off the walking line between the door and the hatch, so
  // the middle stays clear - which is the only rule this room has.
  for (const [n, k] of [3, 5].entries()) {
    const foot = onFacet(k, 0, 0, A - 0.34);
    parts.push(
      solid(
        `stanchion-${n}`,
        'frame',
        foot.x - 0.055,
        foot.x + 0.055,
        FLOOR_Y,
        1.06,
        foot.z - 0.055,
        foot.z + 0.055
      ),
      solid(
        `cleat-${n}`,
        'trim',
        foot.x - 0.11,
        foot.x + 0.11,
        0.86,
        0.94,
        foot.z - 0.11,
        foot.z + 0.11
      )
    );
    if (n === 0) {
      // The strap. Still in its loop, still cinched, with nothing on the end.
      parts.push(
        solid(
          'strap',
          'webbing',
          foot.x - 0.03,
          foot.x + 0.03,
          0.31,
          0.9,
          foot.z - 0.075,
          foot.z + 0.075
        )
      );
    }
  }

  // --- The cargo net, rolled and strapped flat to facet 6. Rolled rather than
  // spread, because a net in use would be holding something and there is
  // nothing in here to hold.
  const netAt = onFacet(6, 0, 0, A - 0.22);
  parts.push(
    solid(
      'net-roll',
      'webbing',
      netAt.x - 0.62,
      netAt.x + 0.62,
      0.42,
      0.72,
      netAt.z - 0.16,
      netAt.z + 0.16
    ),
    solid(
      'net-cradle',
      'frame',
      netAt.x - 0.68,
      netAt.x + 0.68,
      0.32,
      0.42,
      netAt.z - 0.2,
      netAt.z + 0.2
    )
  );

  // --- The manifest board, on the +z facet, and the only operable thing in the
  // room.
  //
  // On facet 2 rather than facet 3, which is where it wanted to go, and the
  // reason is arithmetic rather than taste. A Solid is an axis-aligned box, and
  // a box hung on a 45 degree wall reaches sqrt(2) times its half-width along
  // each axis at its corners: a 0.92 m board set 0.14 m off that wall put its
  // corner 0.51 m THROUGH it. Same sum that once drove four equipment stacks
  // through a junction wall, an album frame through THE BEND, and a pair of
  // tank ribs after it. On a diagonal facet the only honest fitting is a small
  // one; anything with width goes on a facet square to the world.
  parts.push(
    solid('board', 'frame', -0.46, 0.46, 1.12, 1.72, A - 0.2, A - 0.08),
    solid('board-face', 'panel', -0.4, 0.4, 1.18, 1.66, A - 0.21, A - 0.13)
  );

  // --- The cornice ring: four fittings, on the four facets square to the
  // world, tucked into the angle between wall and lid so each is a line of
  // value rather than an object hanging in the room. Two of them are over the
  // two openings and two are over blank wall, which is as even as four
  // fittings in an eight-sided room can be.
  const cornice = (name: string, x0: number, x1: number, z0: number, z1: number): void => {
    parts.push(solid(name, 'lamp', x0, x1, CEILING_Y - 0.22, CEILING_Y - 0.14, z0, z1));
  };
  cornice('cornice-fore', A - 0.22, A - 0.14, -0.9, 0.9);
  cornice('cornice-aft', -A + 0.14, -A + 0.22, -0.9, 0.9);
  cornice('cornice-port', -0.9, 0.9, A - 0.22, A - 0.14);
  cornice('cornice-starboard', -0.9, 0.9, -A + 0.14, -A + 0.22);

  return parts;
}

/** Is (x, z) inside the drum with `margin` metres to spare against every facet? */
function inside(x: number, z: number, margin: number): boolean {
  for (let k = 0; k < FACETS; k += 1) {
    const n = normalOf(k);
    if (x * n.x + z * n.z > A - margin) return false;
  }
  return true;
}

/**
 * The pressure vessel: eight wall facets, a lid and a deck, both octagonal.
 *
 * The doorway is cut out of facet 0 and the hatch out of facet 4, and no other
 * facet is cut at all - which is worth stating because the last room that
 * cut a doorway into every wall it had, rather than only the ported ones, put
 * 233,298 pixels of open space into a single frame.
 */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const inward = new THREE.Vector3();
  const seen = new THREE.Vector3();

  const deepest = deepestRelief(FLOOR_Y, CEILING_Y);
  const halfDoor = SEAM.width / 2;

  for (let k = 0; k < FACETS; k += 1) {
    const n = normalOf(k);
    const ported = k === 0;
    const hatched = k === 4;
    // A ported facet is held 6 mm inboard of its own port plane; every other
    // facet is the hull itself and stands where it stands.
    const out = ported ? A - SEAM_INSET_M : A;
    const P = (s: number, y: number): THREE.Vector3 => onFacet(k, s, y, out);
    // Inward-facing: a point well inside the drum on this facet's own line.
    inward.set(-n.x, CEILING_Y / 2, -n.z);

    const panel = (s0: number, s1: number, y0: number, y1: number, colour: THREE.Color): void => {
      if (s1 - s0 < 1e-6 || y1 - y0 < 1e-6) return;
      const mid = P((s0 + s1) / 2, (y0 + y1) / 2);
      inward.set(mid.x - n.x, (y0 + y1) / 2, mid.z - n.z);
      pushQuad(
        target,
        P(s0, y0),
        P(s1, y0),
        P(s1, y1),
        P(s0, y1),
        inward,
        facetColour(colour, mid, SEED + k * 5, JITTER)
      );
    };

    // The facet runs out past its own edge by LAP so that neighbours meet
    // inside each other rather than on a shared line, and out past the band
    // reliefs so no groove runs off the end of a wall into space.
    const edge = HALF_FACET + LAP + deepest;

    for (const band of bands(FLOOR_Y, CEILING_Y)) {
      const colour = new THREE.Color(band.colour);
      const y0 = Math.abs(band.y0 - FLOOR_Y) < 1e-6 ? FLOOR_Y - LAP : band.y0;
      if (ported) {
        panel(-edge, -halfDoor, y0, band.y1, colour);
        panel(halfDoor, edge, y0, band.y1, colour);
        panel(-halfDoor, halfDoor, Math.max(y0, SEAM.height), band.y1, colour);
      } else if (hatched) {
        // Cut to the SQUARE surround plate, not to the hatch.
        //
        // A round hole cut out of a square opening leaves the four corners
        // between them open, and open means space: 0.28 m2 of it, four
        // crescents round a hatch, which is precisely the shape of defect this
        // station has shipped twice. The bands stop at a square here and the
        // square is filled by a real mounting plate with a real circular hole
        // in it, built below - which is also what a docking ring actually is.
        panel(-edge, -SURROUND, y0, band.y1, colour);
        panel(SURROUND, edge, y0, band.y1, colour);
        const lo = Math.min(band.y1, HATCH_Y - SURROUND);
        const hi = Math.max(y0, HATCH_Y + SURROUND);
        panel(-SURROUND, SURROUND, y0, lo, colour);
        panel(-SURROUND, SURROUND, hi, band.y1, colour);
      } else {
        panel(-edge, edge, y0, band.y1, colour);
      }

      if (Math.abs(band.relief) < 1e-6) continue;
      for (const y of [band.y0, band.y1]) {
        // Never in the deck's plane or the lid's: a return there faces the same
        // way as the surface that already owns it, and the two fight for every
        // pixel they cover.
        if (Math.abs(y - FLOOR_Y) < 1e-6 || Math.abs(y - CEILING_Y) < 1e-6) continue;
        // Seen from one side, and which side depends on BOTH which end of the
        // band it is and which way it is relieved: a proud band's top is a
        // shelf you look down onto, a recessed band's is a soffit you look up
        // at. Backwards draws nothing at all, and nothing is outer space.
        const above = (y === band.y1) === band.relief > 0;
        const inner = onFacet(k, 0, y, out - band.relief);
        seen.set(inner.x, above ? y + 1 : y - 1, inner.z);
        const R0 = (s: number): THREE.Vector3 => onFacet(k, s, y, out);
        const R1 = (s: number): THREE.Vector3 => onFacet(k, s, y, out - band.relief);
        // Clipped to this facet's OWN width, with no lap, and that is the one
        // place in this file where lapping is wrong. The vertical panels lap
        // because two of them meet at an angle and an angled overlap is
        // invisible. Two returns meet at a vertex in the SAME horizontal plane
        // facing the SAME way, so a lap there is not a seal, it is 0.70 m2 of
        // two surfaces fighting for identical pixels - which is exactly what
        // the z-fighting checker reported the first time this room was built.
        // A hairline at the end of a ledge shows the wall behind it; an overlap
        // shows whichever of two coplanar quads floating point picks this frame.
        //
        // And short of the corner by the relief itself, which is not the same
        // thing as stopping at the facet edge. A return is a ledge with DEPTH:
        // it reaches |relief| out of the wall for a recessed band and the same
        // distance into the room for a proud one, so two of them stopping
        // exactly at a shared vertex still overlap in the wedge beyond it.
        // The corner turns 45 degrees, tan 45 is 1, so backing off by exactly
        // the relief is exactly enough - 32 ledges, eight corners, 0.077 m2.
        const ret = HALF_FACET - Math.abs(band.relief);
        pushQuad(
          target,
          R1(-ret),
          R1(ret),
          R0(ret),
          R0(-ret),
          seen,
          facetColour(reveal, inner, SEED + 7 + k, JITTER)
        );
      }
    }
  }

  // --- The deck and the lid, each an eight-triangle fan. The deck's colour is
  // the crown value and the lid's is the hull shadow, which is the station's
  // standard: you look down onto something a shade lighter than you look up at.
  const deckColour = new THREE.Color(CROWN_COLOUR);
  const centreDown = v(0, FLOOR_Y, 0);
  const centreUp = v(0, CEILING_Y, 0);
  for (let k = 0; k < FACETS; k += 1) {
    const a0 = corner(k - 1, deepest);
    const a1 = corner(k, deepest);
    pushFacet(
      target,
      centreDown,
      v(a0.x, FLOOR_Y, a0.z),
      v(a1.x, FLOOR_Y, a1.z),
      v(0, FLOOR_Y + 1, 0),
      facetColour(deckColour, v(a0.x / 2, FLOOR_Y, a0.z / 2), SEED + 21 + k, JITTER)
    );
    pushFacet(
      target,
      centreUp,
      v(a1.x, CEILING_Y, a1.z),
      v(a0.x, CEILING_Y, a0.z),
      v(0, CEILING_Y - 1, 0),
      facetColour(hull, v(a0.x / 2, CEILING_Y, a0.z / 2), SEED + 41 + k, JITTER)
    );
  }

  // --- The hatch itself, shut: a shallow dish set into facet 4, built as a fan
  // so its rim is a real circle rather than a rectangle pretending. It is the
  // only curve in the station and it earns the triangles.
  // HULL_SHADOW rather than ARRAY, and the reason is that a shut door has to
  // look shut. At the darker value the leaf rendered as a flat disc barely
  // separated from the wall around it, which in a game where one exact colour
  // means outer space reads as a hole rather than as a hatch - and this is the
  // only round opening aboard, so it is the one shape a player will read as an
  // opening whatever value it carries. Three steps now: the plate lightest,
  // the leaf a shade under it, the dogs darkest.
  const dish = new THREE.Color(PALETTE.HULL_SHADOW);
  const n4 = normalOf(4);
  const rimAt = (i: number, radius: number, depth: number): THREE.Vector3 => {
    const phi = (i / HATCH_SEGMENTS) * Math.PI * 2;
    return onFacet(4, Math.sin(phi) * radius, HATCH_Y + Math.cos(phi) * radius, A - depth);
  };
  const hatchMid = onFacet(4, 0, HATCH_Y, A - 0.14);

  // The mounting plate: the ring of material between the circular hole and the
  // square the bands were cut to, as one quad per segment. Each rim point is
  // pushed straight out along its own direction until it meets the square,
  // which is what makes the corners land exactly rather than nearly.
  const plate = new THREE.Color(PALETTE.HULL);
  for (let i = 0; i < HATCH_SEGMENTS; i += 1) {
    const square = (j: number): THREE.Vector3 => {
      const phi = (j / HATCH_SEGMENTS) * Math.PI * 2;
      const sx = Math.sin(phi);
      const cy = Math.cos(phi);
      const t = SURROUND / Math.max(Math.abs(sx), Math.abs(cy));
      return onFacet(4, sx * t, HATCH_Y + cy * t, A);
    };
    const p0 = rimAt(i, HATCH_R, 0);
    const p1 = rimAt(i + 1, HATCH_R, 0);
    pushQuad(
      target,
      square(i),
      square(i + 1),
      p1,
      p0,
      v(hatchMid.x - n4.x, HATCH_Y, hatchMid.z - n4.z),
      facetColour(plate, p0, SEED + 121 + i, JITTER * 0.5)
    );
  }

  for (let i = 0; i < HATCH_SEGMENTS; i += 1) {
    const p0 = rimAt(i, HATCH_R, 0);
    const p1 = rimAt(i + 1, HATCH_R, 0);
    const q0 = rimAt(i, HATCH_R - 0.06, 0.1);
    const q1 = rimAt(i + 1, HATCH_R - 0.06, 0.1);
    // The reveal: the 0.10 m of jamb between the wall plane and the leaf.
    pushQuad(
      target,
      p0,
      p1,
      q1,
      q0,
      v(hatchMid.x - n4.x, HATCH_Y, hatchMid.z - n4.z),
      facetColour(hull, q0, SEED + 61 + i, JITTER * 0.6)
    );
    // The leaf, as a fan off its own centre.
    pushFacet(
      target,
      hatchMid,
      q1,
      q0,
      v(hatchMid.x - n4.x, HATCH_Y, hatchMid.z - n4.z),
      facetColour(dish, q0, SEED + 91 + i, JITTER * 0.6)
    );
  }

  return toGeometry(target);
}

function buildBerth(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'berth';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'berth-shell';
  root.add(shell);

  const parts = berthSolids();
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
    socket: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL_SHADOW),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // The wear haloes. One step off the deck and nothing else - the whole
    // effect is that eleven sockets are a shade lighter than fifty-two.
    wear: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.HULL),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    webbing: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.FOIL),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    panel: new THREE.MeshLambertMaterial({
      color: new THREE.Color(PALETTE.OCEAN_DEEP),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    }),
    // Its own light, so it takes no diffuse term: a surface that is a lamp
    // clips the moment anything bright lands on it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.CLOUD),
      emissiveIntensity: 0.4,
    }),
  };
  for (const key of Object.keys(materials)) {
    const group = parts.filter((p) => p.material === key).map((p) => boxOf(p));
    const material = materials[key];
    if (group.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(group), material);
    mesh.name = `berth-${key}`;
    root.add(mesh);
  }

  // --- The rig. Four fittings in a cornice ring and nothing else, which is the
  // whole characterisation: THE GANTRY is lit from the deck and THE SILL
  // through a hole in it, and this is the one room in the station lit the way
  // you would actually light a space somebody has to unload a crate in.
  //
  // Even light on eight facets is not flat light. Each wall meets the ring at
  // its own angle, so one rig with no key still yields eight distinct values -
  // which is why the drum can afford a rig this plain.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    0.92
  );
  root.add(ambient);
  for (const k of [0, 2, 4, 6]) {
    const p = onFacet(k, 0, 0, A - 0.35);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.42, 6.0, 1);
    lamp.position.set(p.x, CEILING_Y - 0.3, p.z);
    root.add(lamp);
  }

  /**
   * The walk, as three overlapping rectangles inscribed in the octagon.
   *
   * A FloorRect is axis-aligned and an octagon is not, so the walkable region
   * is a union: a band the full width in x, a band the full width in z, and a
   * square across the diagonals. Every corner of all three satisfies all eight
   * facet constraints with the standoff to spare - checked rather than
   * eyeballed, because a rectangle inscribed in a polygon by eye is a
   * rectangle whose corners are through a wall.
   */
  const inner = A - WALL_STANDOFF;
  const arm = inner * (Math.SQRT2 - 1);
  const diag = inner / Math.SQRT2;
  const floor: readonly FloorRect[] = [
    { minX: -inner, maxX: inner, minZ: -arm, maxZ: arm, floorY: FLOOR_Y },
    { minX: -arm, maxX: arm, minZ: -inner, maxZ: inner, floorY: FLOOR_Y },
    { minX: -diag, maxX: diag, minZ: -diag, maxZ: diag, floorY: FLOOR_Y },
  ];

  const hatchAt = onFacet(4, 0, HATCH_Y, A - 0.2);
  const netAt = onFacet(6, 0, 0.6, A - 0.3);
  const points: readonly PointOfInterest[] = [
    {
      id: 'manifest',
      label: 'the manifest board',
      position: [0, 1.4, A - 0.28],
      operable: true,
    },
    { id: 'hatch', label: 'the resupply hatch', position: [hatchAt.x, hatchAt.y, hatchAt.z] },
    { id: 'net', label: 'the stowed cargo net', position: [netAt.x, netAt.y, netAt.z] },
    { id: 'deck', label: 'the tie-down grid', position: [0, 0.1, 0] },
  ];

  let read = 0;

  return {
    root,
    // One pace in from the door, facing the hatch down the long diagonal, with
    // the empty middle between the two. The room has one thing to say and it
    // says it from here.
    spawn: { position: [A - 0.7, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: -0.04 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 41,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /** Eight half-planes, a deck and a lid: the smallest clearance wins. */
    contains(point: THREE.Vector3): number {
      let worst = Math.min(point.y - FLOOR_Y, CEILING_Y - point.y);
      for (let k = 0; k < FACETS; k += 1) {
        const n = normalOf(k);
        worst = Math.min(worst, A - (point.x * n.x + point.z * n.z));
      }
      return worst;
    },

    interact(id: string): boolean {
      if (id !== 'manifest') return false;
      read += 1;
      return true;
    },

    update(): void {
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

export const BERTH: CompartmentDefinition = {
  id: 'berth',
  name: 'THE BERTH',
  description: 'A 4.8 m octagon kept empty, with the only round hatch aboard.',
  ports: PORTS,
  extent: EXTENT,
  build: buildBerth,
};

export const BERTH_SOLO = {
  id: 'berth',
  name: 'THE BERTH',
  description: 'A 4.8 m octagon kept empty, with the only round hatch aboard.',
  build: () => soloStation(BERTH),
};

export default BERTH_SOLO;
