/**
 * THE SPINE - the corridor, and the argument for building a boring room.
 *
 * 11.2 m long, 1.62 m wide, 2.24 m to the ceiling. A square-section tube with a
 * frame every 1.4 m and almost nothing in it. You can see the far end from the
 * near end and there is nothing at the far end.
 *
 * WHY IT IS EMPTY ON PURPOSE. A sequence of elaborate rooms is not a sequence,
 * it is a pile. Density only reads as density against something sparser, and the
 * limb deck next door is the widest, most furnished, most eventful room on the
 * station - so the room you meet immediately afterwards is the one that decides
 * whether the limb deck felt like anything. Hollow Knight puts long undecorated
 * runs of Forgotten Crossroads between its set pieces for exactly this reason:
 * the emptiness is doing pacing work, and a player who never gets a plain
 * corridor stops being able to see an interesting one.
 *
 * WHAT IT IS INSTEAD OF DECORATION. Perspective. Eight identical frames marching
 * away from you is the only place on the station where the geometry itself is the
 * subject: they converge, they shrink, and they tell you exactly how far away the
 * far end is - which is the one thing the limb deck, with its curved hull and no
 * repeating element, cannot tell you about itself. It also means this room needs
 * almost no fittings to read as built, because eight of anything reads as a
 * system.
 *
 * THE PROPORTION IS THE POINT. Against the limb deck's 3.51 m width and 3.25 m
 * crown, 1.62 x 2.24 is not a smaller room, it is a different KIND of room: wide
 * enough for one person and no more, low enough to see the ceiling without
 * looking up. You feel this in the shoulders before you notice it in the eye,
 * which is the whole reason ceiling height and floor width are the first two
 * levers of spatial design and decoration is somewhere below tenth.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import { sampleOrbit, LIMB_DECK_GEOMETRY } from '../orbit';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, planeClashes, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushQuad, sink, toGeometry } from '../kit/mesh';
import type { FloorRect, PointOfInterest } from '../types';

const LENGTH = 11.2;
const HALF_LENGTH = LENGTH / 2;
/** Half width and ceiling height, inside the liner. */
const HALF_Z = 0.81;
const CEILING_Y = 2.24;

/** Structural frames. Eight of them, and eight is the number that reads. */
const FRAMES = 8;
const FRAME_T = 0.09;
const FRAME_STAND = 0.055;
/** Wall panels between the frames, in a facet grid fine enough to shade. */
const PANEL_SEGMENTS = 3;

const SEED = 0x51e;
const JITTER = 0.05;

/** Where the deck is, and how much of it a person may walk on. */
const FLOOR_Y = 0;
const WALK_HALF_Z = HALF_Z - 0.06;

/** Lamp strip height, and how far it stands off the ceiling. */
const LAMP_Y = CEILING_Y - 0.035;
const LAMP_HALF_Z = 0.062;

const EYE_HEIGHT = 1.74;

/**
 * The ports, and why they are not at the same height as each other's floors by
 * accident: the seam contract fixes the opening's size and its height above the
 * deck, so a corridor that met the limb deck at a different sill would not lay
 * out at all - `disagreement()` refuses it rather than building a step.
 */
const PORTS = [
  port('fore', [HALF_LENGTH, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_LENGTH, SEAM.height / 2, 0], '-x', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_LENGTH,
  maxX: HALF_LENGTH,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z - 0.2,
  maxZ: HALF_Z + 0.2,
} as const;

/**
 * Every box the corridor is made of.
 *
 * Declared rather than built directly so `tests/rooms.test.ts` can check the lot
 * - see kit/solids.ts for what that buys and what it cost to learn. The frames
 * are four abutting boxes each rather than four overlapping ones: overlapping
 * boxes share their end faces, and shared faces fight for pixels.
 */
function spineSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  for (let i = 0; i < FRAMES; i += 1) {
    // Spread so the end frames stand clear of the seams rather than in them.
    const t = (i + 0.5) / FRAMES;
    const x0 = -HALF_LENGTH + 0.35 + t * (LENGTH - 0.7) - FRAME_T / 2;
    const x1 = x0 + FRAME_T;
    const id = `frame-${i}`;
    const inner = HALF_Z - FRAME_STAND;
    parts.push(
      solid(`${id}-port`, 'frame', x0, x1, FLOOR_Y, CEILING_Y, -HALF_Z, -inner),
      solid(`${id}-starboard`, 'frame', x0, x1, FLOOR_Y, CEILING_Y, inner, HALF_Z),
      // The header spans between the two uprights, not across them.
      solid(`${id}-head`, 'frame', x0, x1, CEILING_Y - FRAME_STAND, CEILING_Y, -inner, inner),
      // A kick rail at the bottom, which is where a corridor actually gets worn.
      solid(`${id}-kick`, 'trim', x0, x1, FLOOR_Y + 0.02, FLOOR_Y + 0.11, -inner, inner)
    );
  }

  // The lamp strip: one continuous run down the middle of the ceiling. Its
  // material takes no diffuse light and carries its value in emissive - the
  // lamp-diffuser rule, without which a lit surface in sunlight clips to white.
  //
  // Its top stops a few millimetres short of the ceiling rather than reaching it,
  // because the frame headers are also at the ceiling and eight of them cross it.
  // It is buried in the liner instead, which is where a light fitting sits.
  parts.push(
    solid(
      'lamp',
      'lamp',
      -HALF_LENGTH + 0.5,
      HALF_LENGTH - 0.5,
      LAMP_Y,
      CEILING_Y - 0.004,
      -LAMP_HALF_Z,
      LAMP_HALF_Z
    )
  );

  // One cable run at shoulder height down the port wall. The only asymmetry in
  // the room, and what stops the corridor reading as a rendering of a corridor.
  //
  // It stands PROUD of the frames rather than flush with them: at 55 mm it would
  // have shared its outboard face with every frame upright it crosses, and eight
  // coplanar face pairs down one wall is eight seams that crawl as you walk. The
  // clash test found this on the room's first run, which is the entire argument
  // for having written the test before the second room rather than after the
  // eighth.
  const runY = 1.52;
  parts.push(
    solid(
      'cable-run',
      'trim',
      -HALF_LENGTH + 0.4,
      HALF_LENGTH - 0.4,
      runY,
      runY + 0.045,
      -HALF_Z + 0.005,
      -HALF_Z + FRAME_STAND + 0.012
    )
  );

  return parts;
}

/** The liner: floor, ceiling and two walls, as facets rather than boxes. */
function buildLiner(): THREE.BufferGeometry {
  const target = sink();
  const hull = new THREE.Color(PALETTE.HULL_SHADOW);
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const roof = new THREE.Color(PALETTE.HULL);
  const inward = new THREE.Vector3(0, CEILING_Y / 2, 0);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const bays = FRAMES * 2;
  for (let i = 0; i < bays; i += 1) {
    const x0 = -HALF_LENGTH + (LENGTH * i) / bays;
    const x1 = -HALF_LENGTH + (LENGTH * (i + 1)) / bays;
    const mid = (x0 + x1) / 2;

    // Floor and ceiling, one facet per bay.
    inward.set(mid, CEILING_Y / 2, 0);
    pushQuad(
      target,
      v(x0, FLOOR_Y, -HALF_Z),
      v(x1, FLOOR_Y, -HALF_Z),
      v(x1, FLOOR_Y, HALF_Z),
      v(x0, FLOOR_Y, HALF_Z),
      inward,
      facetColour(deck, v(mid, FLOOR_Y, 0), SEED, JITTER)
    );
    pushQuad(
      target,
      v(x0, CEILING_Y, -HALF_Z),
      v(x1, CEILING_Y, -HALF_Z),
      v(x1, CEILING_Y, HALF_Z),
      v(x0, CEILING_Y, HALF_Z),
      inward,
      facetColour(roof, v(mid, CEILING_Y, 0), SEED, JITTER)
    );

    // Walls, in vertical strips so a grazing beam down the corridor steps.
    for (let k = 0; k < PANEL_SEGMENTS; k += 1) {
      const y0 = FLOOR_Y + ((CEILING_Y - FLOOR_Y) * k) / PANEL_SEGMENTS;
      const y1 = FLOOR_Y + ((CEILING_Y - FLOOR_Y) * (k + 1)) / PANEL_SEGMENTS;
      for (const side of [-1, 1] as const) {
        const z = side * HALF_Z;
        pushQuad(
          target,
          v(x0, y0, z),
          v(x1, y0, z),
          v(x1, y1, z),
          v(x0, y1, z),
          inward,
          facetColour(hull, v(mid, (y0 + y1) / 2, z), SEED, JITTER)
        );
      }
    }
  }

  // The two end walls, each with the seam opening cut out of it as four panels
  // around a rectangle. A doorway in a flat wall needs no clever cutter - that
  // was only ever needed because the first room's bulkhead was a polar fan.
  const halfW = SEAM.width / 2;
  const top = SEAM.height;
  for (const side of [-1, 1] as const) {
    const x = side * HALF_LENGTH;
    inward.set(x - side * 1, CEILING_Y / 2, 0);
    const wall = (y0: number, y1: number, z0: number, z1: number): void => {
      pushQuad(
        target,
        v(x, y0, z0),
        v(x, y0, z1),
        v(x, y1, z1),
        v(x, y1, z0),
        inward,
        facetColour(hull, v(x, (y0 + y1) / 2, (z0 + z1) / 2), SEED, JITTER)
      );
    };
    wall(FLOOR_Y, CEILING_Y, -HALF_Z, -halfW);
    wall(FLOOR_Y, CEILING_Y, halfW, HALF_Z);
    wall(top, CEILING_Y, -halfW, halfW);
  }

  return toGeometry(target);
}

function buildSpine(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'spine';

  const parts = spineSolids();
  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const linerMesh = new THREE.Mesh(buildLiner(), liner);
  linerMesh.name = 'spine-liner';
  root.add(linerMesh);

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
    // Black plus emissive MINT: the lamp-diffuser rule. A lit MINT surface plus
    // a MINT emissive term clipped to 255,255,247 over eight thousand pixels the
    // first time it was tried, in a game with no white in it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      // 0.34, not the 0.55 the limb deck's diffusers carry. That room's lamps
      // are two troughs washing a 3.25 m arc from ten metres of standoff; this
      // is an unbroken eleven-metre strip two metres over the eye in a tube
      // 1.62 m wide, and at 0.55 it was the brightest thing on the station by a
      // wide margin - a corridor lit like an operating theatre. Level is a
      // property of the fitting AND the room, never of the fitting alone.
      emissive: new THREE.Color(PALETTE.CLOUD),
      emissiveIntensity: 0.34,
    }),
  };

  for (const key of Object.keys(materials)) {
    const solids = parts.filter((part) => part.material === key).map((part) => boxOf(part));
    if (solids.length === 0) continue;
    const material = materials[key];
    if (material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `spine-${key}`;
    root.add(mesh);
  }

  // Two lamps and a very dim fill. A corridor is lit from its own ceiling and
  // from nothing else - no window, no sun, no earthshine reaches this far in -
  // which is exactly the contrast with the limb deck, whose every value moves
  // with the orbit. Standing here, nothing changes. That is the point.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    0.9
  );
  root.add(ambient);

  /**
   * Two washes off the strip, angled at the walls, equal on both sides.
   *
   * A vertical wall takes nothing from a straight-down light - its normal is
   * horizontal and the dot product is zero - so a corridor keyed from directly
   * overhead has a bright floor, a bright ceiling and two walls that fall to the
   * emissive floor and disappear. That is what the first build did, and it was
   * only visible once the room stopped being lit by the SUN of a compartment two
   * doors away, through a sealed bulkhead, which is what a single shared scene
   * had been quietly doing.
   *
   * They are a matched pair on purpose. A corridor lit unevenly across its width
   * reads as a corridor with one side missing, and there is nothing in a tube
   * this narrow to justify the asymmetry.
   */
  for (const side of [-1, 1] as const) {
    const wash = new THREE.DirectionalLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.5);
    wash.position.set(0, CEILING_Y, 0);
    wash.target.position.set(0, CEILING_Y * 0.35, side * HALF_Z * 3);
    root.add(wash, wash.target);
  }

  // Down the run, weakly, so the eight frames step in value toward the far end
  // instead of stamping out eight identical silhouettes.
  const along = new THREE.DirectionalLight(new THREE.Color(PALETTE.HULL).getHex(), 0.22);
  along.position.set(HALF_LENGTH, CEILING_Y * 0.8, 0);
  along.target.position.set(-HALF_LENGTH, FLOOR_Y, 0);
  root.add(along, along.target);

  const floor: readonly FloorRect[] = [
    {
      minX: -HALF_LENGTH,
      maxX: HALF_LENGTH,
      minZ: -WALK_HALF_Z,
      maxZ: WALK_HALF_Z,
      floorY: FLOOR_Y,
    },
  ];

  const points: readonly PointOfInterest[] = [
    { id: 'run', label: 'the cable run', position: [0, 1.55, -HALF_Z + 0.05] },
  ];

  return {
    root,
    // Stood at the fore end looking down the run, not in the middle facing a
    // wall 0.81 m away. The room's whole claim is the long converging view, and
    // mounted on its own its first frame was a flat grey panel with no floor, no
    // ceiling and no vanishing point in it.
    spawn: { position: [HALF_LENGTH - 0.9, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2, pitch: 0 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * A rectangular tube, so clearance is the smallest distance to any of the
     * four surfaces. Nothing curved to get wrong here, which is the reason this
     * room could be written in one sitting and the first one could not.
     */
    contains(point: THREE.Vector3): number {
      return Math.min(
        HALF_Z - Math.abs(point.z),
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_LENGTH - Math.abs(point.x)
      );
    },

    update(): void {
      // Nothing in this room moves, and that is a design decision rather than an
      // omission: it is the only place on the station where time does not show.
    },

    dispose(): void {
      linerMesh.geometry.dispose();
      liner.dispose();
      for (const material of Object.values(materials)) material.dispose();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      root.clear();
    },
  };
}

/** Sanity for the author, run once at module load in development builds. */
export function spineClashes(): readonly string[] {
  return planeClashes(spineSolids());
}

/** The orbital sample this room would use if anything in it moved. */
export function spineFrame(t: number) {
  return { t, orbit: sampleOrbit(t, LIMB_DECK_GEOMETRY), reducedMotion: false };
}

/**
 * Mounted on its own, the corridor is a station of one compartment - which is
 * what puts blanks over both of its ports. See `soloStation`.
 */
export const SPINE_SOLO = {
  id: 'spine',
  name: 'THE SPINE',
  description: 'An 11 m connecting run, one person wide.',
  build: () => soloStation(SPINE),
};

export const SPINE: CompartmentDefinition = {
  id: 'spine',
  name: 'THE SPINE',
  description: 'An 11 m connecting run, one person wide.',
  ports: PORTS,
  extent: EXTENT,
  build: buildSpine,
};

export default SPINE_SOLO;
