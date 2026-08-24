/**
 * THE BEND - the first room that is not made of right angles, and the first
 * time the station's map stops being a line.
 *
 * Everything before this is orthogonal and everything before this is straight:
 * a duct, a deck, an eleven-metre run, a hub, a shaft. You can hold all of it in
 * your head as a row. A 90-degree turn is the cheapest possible way to make the
 * station two-dimensional - after walking this once, "where the racks are"
 * stops being a distance and becomes a direction.
 *
 * IT IS FOURTEEN FLAT WALLS. There are no curves anywhere in this game and there
 * is not one here either. The arc is discretised into fourteen facets, and that
 * is not a compromise for the renderer - it is the whole visual argument of the
 * project applied to a curve. Under a grazing key each facet takes a different
 * value, so the turn reads as a sequence of planes rotating past you rather than
 * as a smooth tube, and you can count how far round you are by counting them.
 *
 * SIGHTLINES ARE CAPPED BY GEOMETRY, NOT BY DARKNESS. You can never see more
 * than about four metres of this room, because the inner wall gets in the way.
 * That is the only place in the station where the limit on how far you can see
 * is the shape of the building rather than how much light there is, and it is
 * why a bend is worth more than another straight run of the same length: a
 * corridor tells you everything it contains from the doorway.
 *
 * THE INNER WALL IS A TANK BELLY and the outer wall is the pressure boundary.
 * That is the reason the room is bent at all - it wraps something - and it is
 * why the two walls are not the same: the inner one has the tank's own ribs on
 * it and the outer one carries the hull's bands.
 *
 * WHAT HAPPENS HERE. The frame album. Every pass the imager makes returns a
 * photograph of whatever was actually under the track - the site, or terrain
 * forty-one kilometres east of it, or open ocean - and every one goes up,
 * including the misses, each stamped with its own honest offset. They hang along
 * the outer wall, so you walk past your own history of orbits rather than
 * opening a menu of it, and the curve means you only ever see the next few.
 *
 * THE RADIUS IS 3.60 m, NOT THE 5.60 THE BRIEF ASKS FOR. A 90-degree arc at
 * 5.60 m occupies a 7.5 m square of the station's plan, and the station has to
 * fit around it: the layout places compartments by walking the connection graph
 * and refuses any two that share a cubic metre. 3.60 m keeps the turn, keeps the
 * fourteen facets, and gives up 3.1 m of run.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import { CROWN_COLOUR, REVEAL_COLOUR, bands, deepestRelief } from '../kit/bands';
import type { FloorRect, PointOfInterest } from '../types';

/** Centreline radius, and half the clear width. */
const R = 3.6;
const HALF_W = 0.95;
const R_IN = R - HALF_W;
const R_OUT = R + HALF_W;
const CEILING_Y = 2.55;
const FLOOR_Y = 0;

/** Fourteen, so the turn is countable and no facet is a neat fraction of it. */
const FACETS = 14;
const SWEEP = Math.PI / 2;

/** Held inboard of both port planes, so neither wall lands in a neighbour's. */
const END_INSET = 0.006;

const SEED = 0x0b4;
const JITTER = 0.055;
const EYE_HEIGHT = 1.74;

/**
 * The arc, as a function of how far round you are.
 *
 * theta 0 is the fore end and theta = SWEEP is the aft end. At theta 0 the
 * tangent runs along +x, so the end face there stands in the x = 0 plane; at
 * SWEEP the tangent runs along -z and the face stands in z = 0. Those two
 * planes are 90 degrees apart, which is the room.
 */
function at(theta: number, r: number): THREE.Vector3 {
  return new THREE.Vector3(r * Math.sin(theta), 0, r * Math.cos(theta));
}

const PORTS = [
  port('fore', [0, SEAM.height / 2, R], '-x', FLOOR_Y),
  port('aft', [R, SEAM.height / 2, 0], '-z', FLOOR_Y),
] as const;

const EXTENT = {
  minX: 0,
  maxX: R_OUT,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: 0,
  maxZ: R_OUT,
} as const;

function bendSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- The album. Frames along the outer wall, one per facet from the third to
  // the eleventh, each an axis-aligned plate tucked just inside the wall it
  // hangs on. A Solid is a box and a box cannot follow an arc, so each sits
  // square to the world and the curve carries them round - which is what a
  // picture hung on a curved wall actually looks like.
  for (let i = 3; i <= 11; i += 1) {
    const theta = ((i + 0.5) / FACETS) * SWEEP;
    // Set off the wall by more than the box's own diagonal half-width. A box
    // centred at a radius reaches sqrt(2) times its half-width further at the
    // corners, which is the same arithmetic that once put four equipment stacks
    // 144 mm through a wall in the junction this station used to have.
    const p = at(theta, R_OUT - 0.32);
    const w = 0.13;
    parts.push(
      solid(`frame-${i}`, 'trim', p.x - w, p.x + w, 1.18, 1.5, p.z - w, p.z + w),
      solid(
        `still-${i}`,
        'lamp',
        p.x - w * 0.7,
        p.x + w * 0.7,
        1.24,
        1.44,
        p.z - w * 0.7,
        p.z + w * 0.7
      )
    );
  }

  // --- The tank's ribs on the inner wall: the reason the room is bent.
  for (let i = 1; i < FACETS; i += 3) {
    const theta = (i / FACETS) * SWEEP;
    const p = at(theta, R_IN + 0.26);
    parts.push(
      solid(`rib-${i}`, 'frame', p.x - 0.11, p.x + 0.11, 0.32, 2.12, p.z - 0.11, p.z + 0.11)
    );
  }

  // --- The perch, on the left as you come in through the fore end. Entering a
  // port that faces -x you walk in +x, so your left hand is toward -z, which at
  // the fore end of this arc is the INNER wall.
  {
    const p = at(SWEEP / FACETS, R_IN + 0.45);
    parts.push(
      solid('perch', 'trim', p.x - 0.3, p.x + 0.3, 0.5, 0.58, p.z - 0.24, p.z + 0.24),
      solid('perch-leg', 'frame', p.x - 0.05, p.x + 0.05, FLOOR_Y, 0.5, p.z - 0.05, p.z + 0.05)
    );
  }

  // --- Lamps: one at each end and one at the blind middle, so the turn is lit
  // in three places and the two you cannot see are always ahead and behind.
  for (const t of [0.12, 0.5, 0.88]) {
    const p = at(t * SWEEP, R);
    parts.push(
      solid(
        `lamp-${Math.round(t * 100)}`,
        'lamp',
        p.x - 0.3,
        p.x + 0.3,
        CEILING_Y - 0.14,
        CEILING_Y - 0.07,
        p.z - 0.3,
        p.z + 0.3
      )
    );
  }

  // --- S11: one thing out of its stowed position. A frame taken down and left
  // leaning on the perch instead of hung back up.
  {
    const p = at(SWEEP / FACETS, R_IN + 0.45);
    parts.push(solid('leaning', 'trim', p.x - 0.12, p.x + 0.12, 0.58, 0.9, p.z - 0.03, p.z + 0.03));
  }

  return parts;
}

function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const roof = new THREE.Color(CROWN_COLOUR);
  const reveal = new THREE.Color(REVEAL_COLOUR);
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const inward = new THREE.Vector3();
  const seen = new THREE.Vector3();
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  for (let i = 0; i < FACETS; i += 1) {
    const t0 = (i / FACETS) * SWEEP;
    const t1 = ((i + 1) / FACETS) * SWEEP;
    const mid = at((t0 + t1) / 2, R);
    inward.set(mid.x, CEILING_Y / 2, mid.z);

    const a0 = at(t0, R_IN);
    const a1 = at(t1, R_IN);
    const b0 = at(t0, R_OUT);
    const b1 = at(t1, R_OUT);

    // Deck and crown for this facet.
    for (const [y, colour, up] of [
      [FLOOR_Y, deck, true],
      [CEILING_Y, roof, false],
    ] as const) {
      seen.set(mid.x, up ? y + 2 : y - 2, mid.z);
      pushQuad(
        target,
        v(a0.x, y, a0.z),
        v(a1.x, y, a1.z),
        v(b1.x, y, b1.z),
        v(b0.x, y, b0.z),
        seen,
        facetColour(colour, v(mid.x, y, mid.z), SEED + i * 5, JITTER)
      );
    }

    /**
     * One wall of this facet, in the station's three bands.
     *
     * `sign` is +1 for the outer wall and -1 for the inner one: relief is
     * measured along the radius, so a proud band on the inner wall comes toward
     * the room from a smaller radius and a proud band on the outer wall comes
     * toward it from a larger one, and both have to be the same band.
     */
    const wall = (sign: 1 | -1): void => {
      const base = sign > 0 ? R_OUT : R_IN;
      for (const band of bands(FLOOR_Y, CEILING_Y)) {
        const r = base - sign * band.relief;
        const p0 = at(t0, r);
        const p1 = at(t1, r);
        const l0 = at(t0, base);
        const l1 = at(t1, base);
        pushQuad(
          target,
          v(p0.x, band.y0, p0.z),
          v(p1.x, band.y0, p1.z),
          v(p1.x, band.y1, p1.z),
          v(p0.x, band.y1, p0.z),
          inward,
          facetColour(
            new THREE.Color(band.colour),
            v((p0.x + p1.x) / 2, (band.y0 + band.y1) / 2, (p0.z + p1.z) / 2),
            SEED + i * 3 + (sign > 0 ? 0 : 17),
            JITTER
          )
        );
        if (Math.abs(band.relief) < 1e-6) continue;
        for (const y of [band.y0, band.y1]) {
          // Never in the deck's plane or the crown's: a return there faces the
          // same way as the surface that already owns it, and the two fight for
          // every pixel they cover.
          if (Math.abs(y - FLOOR_Y) < 1e-6 || Math.abs(y - CEILING_Y) < 1e-6) continue;
          // Seen from one side, and which side depends on BOTH which end of the
          // band it is and which way it is relieved: a proud band's top is a
          // shelf you look down onto, a recessed band's is a soffit you look up
          // at. Backwards draws nothing at all, and nothing is outer space.
          const above = (y === band.y1) === band.relief > 0;
          seen.set(mid.x, above ? y + 1 : y - 1, mid.z);
          pushQuad(
            target,
            v(l0.x, y, l0.z),
            v(l1.x, y, l1.z),
            v(p1.x, y, p1.z),
            v(p0.x, y, p0.z),
            seen,
            facetColour(reveal, v((l0.x + p0.x) / 2, y, (l0.z + p0.z) / 2), SEED + 7, JITTER)
          );
        }
      }
    };
    wall(1);
    wall(-1);
  }

  // --- The two end walls, each cut around its own doorway and each held 6 mm
  // inboard of its port plane. Two rooms building to one seam plane is two
  // surfaces at one depth, and which one wins is decided per pixel by float
  // noise, so it shimmers as you move.
  const outerR = R_OUT + deepestRelief(FLOOR_Y, CEILING_Y);
  const endWall = (axis: 'x' | 'z'): void => {
    const plane = END_INSET;
    const halfW = SEAM.width / 2;
    const centre = R;
    inward.set(axis === 'x' ? 1 : centre, CEILING_Y / 2, axis === 'x' ? centre : 1);
    const P = (s: number, y: number): THREE.Vector3 =>
      axis === 'x' ? v(plane, y, s) : v(s, y, plane);
    const panel = (s0: number, s1: number, y0: number, y1: number): void => {
      if (s1 - s0 < 1e-6 || y1 - y0 < 1e-6) return;
      pushQuad(
        target,
        P(s0, y0),
        P(s1, y0),
        P(s1, y1),
        P(s0, y1),
        inward,
        facetColour(hull, P((s0 + s1) / 2, (y0 + y1) / 2), SEED + 11, JITTER)
      );
    };
    // Out to the deepest band face, so neither band groove runs off the end of
    // its wall - a groove with an open end is a slot straight through the hull.
    panel(R_IN - deepestRelief(FLOOR_Y, CEILING_Y), centre - halfW, FLOOR_Y, CEILING_Y);
    panel(centre + halfW, outerR, FLOOR_Y, CEILING_Y);
    panel(centre - halfW, centre + halfW, SEAM.height, CEILING_Y);
  };
  endWall('x');
  endWall('z');

  return toGeometry(target);
}

function buildBend(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'bend';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'bend-shell';
  root.add(shell);

  const parts = bendSolids();
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
    // The stills themselves, and the lamps. Both carry their value in emissive
    // and take no diffuse term, which is the lamp-diffuser rule: a surface that
    // is its own light clips the moment anything bright lands on it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.DAWN_CREAM),
      emissiveIntensity: 0.34,
    }),
  };
  for (const key of Object.keys(materials)) {
    const solids = parts.filter((p) => p.material === key).map((p) => boxOf(p));
    const material = materials[key];
    if (solids.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `bend-${key}`;
    root.add(mesh);
  }

  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.CLOUD).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    1.0
  );
  root.add(ambient);
  // Three keys, one per lamp, each aimed across the arc rather than along it -
  // a light pointing down a curve lights one facet and leaves thirteen flat.
  for (const t of [0.12, 0.5, 0.88]) {
    const p = at(t * SWEEP, R);
    const outward = at(t * SWEEP, R_OUT);
    const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.DAWN_CREAM).getHex(), 0.5);
    key.position.set(p.x, CEILING_Y - 0.2, p.z);
    key.target.position.set(outward.x, 0.9, outward.z);
    root.add(key, key.target);
  }

  /**
   * The walk, as overlapping squares along the centreline.
   *
   * `FloorRect` is axis-aligned and an arc is not, so the walkable region is a
   * union rather than a tiling: sixteen 0.9 m squares strung along the centre of
   * the annulus, each overlapping its neighbours. Overlap is fine here - the
   * step resolver takes the union - and it is what keeps the path continuous
   * round a curve without any rectangle poking through a wall. A square of that
   * size centred at this radius reaches 4.08 m at its corners against an outer
   * wall at 4.55, so none of them does.
   */
  const floor: FloorRect[] = [];
  const STEPS = 16;
  for (let i = 0; i <= STEPS; i += 1) {
    const p = at((i / STEPS) * SWEEP, R);
    const h = 0.45;
    floor.push({ minX: p.x - h, maxX: p.x + h, minZ: p.z - h, maxZ: p.z + h, floorY: FLOOR_Y });
  }

  const albumAt = at((6.5 / FACETS) * SWEEP, R_OUT - 0.3);
  const perchAt = at(SWEEP / FACETS, R_IN + 0.45);
  const points: readonly PointOfInterest[] = [
    {
      id: 'album',
      label: 'the frame album',
      position: [albumAt.x, 1.34, albumAt.z],
      operable: true,
    },
    { id: 'perch', label: 'the perch', position: [perchAt.x, 0.58, perchAt.z] },
    {
      id: 'ribs',
      label: 'the tank ribs',
      position: [at(SWEEP / 2, R_IN + 0.1).x, 1.2, at(SWEEP / 2, R_IN + 0.1).z],
    },
  ];

  const spawnAt = at(SWEEP / FACETS, R);
  let looked = 0;

  return {
    root,
    // Just inside the fore end, already facing round the turn, so the first
    // thing in frame is the fact that you cannot see the other end.
    spawn: { position: [spawnAt.x, FLOOR_Y + EYE_HEIGHT, spawnAt.z], yaw: -Math.PI / 2, pitch: 0 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 52,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /** An annular sector: distance from the arc centre, and the two end planes. */
    contains(point: THREE.Vector3): number {
      const r = Math.hypot(point.x, point.z);
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        r - R_IN,
        R_OUT - r,
        point.x,
        point.z
      );
    },

    interact(id: string): boolean {
      if (id !== 'album') return false;
      looked += 1;
      return true;
    },

    update(): void {
      void looked;
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

export const BEND: CompartmentDefinition = {
  id: 'bend',
  name: 'THE BEND',
  description: 'A 90 degree turn in fourteen flat facets, 1.9 m wide.',
  ports: PORTS,
  extent: EXTENT,
  build: buildBend,
};

export const BEND_SOLO = {
  id: 'bend',
  name: 'THE BEND',
  description: 'A 90 degree turn in fourteen flat facets, 1.9 m wide.',
  build: () => soloStation(BEND),
};

export default BEND_SOLO;
