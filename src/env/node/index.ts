/**
 * THE NODE - the junction, and the first room that is not a corridor.
 *
 * An octagon 4.6 m across the flats and 3.6 m to the crown, with four doorways
 * on the cardinal faces and equipment stacked into the four corners between
 * them. You arrive in the middle of it and every direction is a way out.
 *
 * WHY IT IS SHAPED LIKE THIS. The two rooms before it are both LONG: the limb
 * deck is a 6.4 m tube you walk the length of, and the corridor is an 11.2 m tube
 * you walk the length of. Both have an axis, both tell you which way to go by
 * being longer that way, and after the second one the station has taught the
 * player that space here means a direction. This room has no axis. It is the same
 * distance to every wall, so nothing about its shape tells you where to go, and
 * the choice comes back to you.
 *
 * That is the circulation type doing the work rather than the decoration - the
 * real ISS node modules are the same idea, compartments with almost no fixed
 * contents whose entire identity is that they have six hatches. A hub cannot be
 * made out of a corridor by putting more things in it.
 *
 * RADIAL, WHERE EVERYTHING ELSE IS BILATERAL. Both earlier rooms are symmetric
 * about one long centreline and asymmetric across it. This one is symmetric
 * under a quarter turn, which is a different KIND of order and reads instantly
 * as deliberate rather than accreted: a room built to be a junction, not a room
 * that became one.
 *
 * THE CORNERS ARE WHERE THE STUFF IS. Four stacks on the chamfers, which leaves
 * a clean cross of floor between the four doors. Dense where you do not walk,
 * empty where you do - and it means the room reads as full from the doorway and
 * as open once you are in it, which is two impressions from one piece of
 * geometry.
 *
 * LIGHT COMES STRAIGHT DOWN, from a ring in the crown. Top light is the
 * institutional one: it flattens faces, puts everything in the same relation to
 * the source, and plays no favourites - which is what a junction should feel
 * like next to the limb deck, where the light is a moving beam from one side and
 * the whole room is about where it is pointing.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { SEAM, port } from '../station/ports';
import { soloStation } from '../station/index';
import { type Solid, boxOf, merged, solid } from '../kit/solids';
import { facetColour, interiorMaterial, pushFacet, pushQuad, sink, toGeometry } from '../kit/mesh';
import type { FloorRect, PointOfInterest } from '../types';

/** Distance from centre to each of the eight wall faces (the apothem). */
const APOTHEM = 2.3;
const CEILING_Y = 3.6;
const FLOOR_Y = 0;
/** Half-width of each of the eight faces, for a regular octagon. */
const FACE_HALF = APOTHEM * Math.tan(Math.PI / 8);

const SEED = 0x0d3;
const JITTER = 0.055;
const EYE_HEIGHT = 1.74;

/** How tall the corner stacks come. */
const STACK_TOP = 2.05;
/** The ring light in the crown. */
const RING_R = 1.05;
const RING_T = 0.09;
const RING_Y = CEILING_Y - 0.1;

/**
 * Four ports on the cardinal faces. The station connects whichever it likes and
 * caps the rest - a hub with a spare seam is a hub the station can grow from,
 * and a hub whose spare seams were holes would be a hub nobody could ship.
 */
const PORTS = [
  port('fore', [APOTHEM, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-APOTHEM, SEAM.height / 2, 0], '-x', FLOOR_Y),
  port('port', [0, SEAM.height / 2, -APOTHEM], '-z', FLOOR_Y),
  port('starboard', [0, SEAM.height / 2, APOTHEM], '+z', FLOOR_Y),
] as const;

/**
 * Exactly the octagon, with no padding on the wall faces.
 *
 * A room's extent is what the station uses to check that no two compartments
 * occupy the same cubic metre, and every wall face here is also a seam plane.
 * Padding it "for safety" pushed the node 0.2 m into the corridor it is joined
 * to and the overlap check caught it - which is the check working, but it is
 * worth saying plainly: at a seam, generous is wrong. Everything this room
 * builds stands INBOARD of these faces.
 */
const EXTENT = {
  minX: -APOTHEM,
  maxX: APOTHEM,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -APOTHEM,
  maxZ: APOTHEM,
} as const;

/** The eight wall faces, as centre angle and whether they carry a doorway. */
const FACES = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
  angle: (i * Math.PI) / 4,
  /** Even faces are the cardinals and carry the doors; odd are the chamfers. */
  door: i % 2 === 0,
}));

function faceBasis(angle: number): { out: THREE.Vector3; along: THREE.Vector3 } {
  return {
    out: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
    along: new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)),
  };
}

function nodeSolids(): readonly Solid[] {
  const parts: Solid[] = [];

  // --- Door frames, one per cardinal face, standing proud into the room.
  const half = SEAM.width / 2 + 0.16;
  const top = SEAM.height + 0.16;
  const depth = 0.11;
  for (const [n, face] of FACES.entries()) {
    if (!face.door) continue;
    const along = Math.abs(Math.cos(face.angle)) > 0.5;
    const at = APOTHEM;
    const sign = Math.cos(face.angle) + Math.sin(face.angle) > 0 ? 1 : -1;
    const id = `frame-${n}`;
    // Two jambs and a head, as three abutting boxes rather than a ring of
    // overlapping ones: overlapping boxes share end faces and shared faces fight.
    if (along) {
      const x0 = sign > 0 ? at - depth : -at;
      const x1 = sign > 0 ? at : -at + depth;
      parts.push(
        solid(`${id}-a`, 'frame', x0, x1, FLOOR_Y, top, -half - 0.16, -half),
        solid(`${id}-b`, 'frame', x0, x1, FLOOR_Y, top, half, half + 0.16),
        solid(`${id}-head`, 'frame', x0, x1, top, top + 0.16, -half, half)
      );
    } else {
      const z0 = sign > 0 ? at - depth : -at;
      const z1 = sign > 0 ? at : -at + depth;
      parts.push(
        solid(`${id}-a`, 'frame', -half - 0.16, -half, FLOOR_Y, top, z0, z1),
        solid(`${id}-b`, 'frame', half, half + 0.16, FLOOR_Y, top, z0, z1),
        solid(`${id}-head`, 'frame', -half, half, top, top + 0.16, z0, z1)
      );
    }
  }

  // --- The four corner stacks, on the chamfers. Axis-aligned boxes tucked into
  // the diagonals: the chamfer is at 45 degrees and a box is not, so each stack
  // sits just inboard of its face and reads as equipment racked against it.
  for (const [n, face] of FACES.entries()) {
    if (face.door) continue;
    const { out } = faceBasis(face.angle);
    const w = 0.66;
    // How far out along the diagonal a box of this width may sit.
    //
    // The chamfer is at 45 degrees and a box is not, so the box's outer CORNER
    // reaches the wall well before its centre does: for a box of half-width h
    // centred at (c, c), the furthest point along the chamfer's own normal is
    // sqrt(2)(c + h), not c. Sized by the centre instead, the four stacks stood
    // 144 mm through the wall - invisible from inside the room, and exactly the
    // class of thing that only turns up from a pose nobody would think to take.
    const reach = APOTHEM / Math.SQRT2 - w / 2 - 0.06;
    const cx = Math.sign(out.x) * reach;
    const cz = Math.sign(out.z) * reach;
    const id = `stack-${n}`;
    // Three drawers each, stepping in depth, so a stack has a front rather than
    // being one slab. Each is its own box with its own faces clear of the others.
    for (let k = 0; k < 3; k += 1) {
      const y0 = 0.05 + k * (STACK_TOP / 3);
      const y1 = y0 + STACK_TOP / 3 - 0.055;
      const inset = k * 0.035;
      parts.push(
        solid(
          `${id}-${k}`,
          k === 1 ? 'trim' : 'frame',
          cx - w / 2 + inset,
          cx + w / 2 - inset,
          y0,
          y1,
          cz - w / 2 + inset,
          cz + w / 2 - inset
        )
      );
    }
  }

  // --- The ring light in the crown: four bars, a square ring, so the fitting is
  // legible as a made object rather than a glowing circle.
  parts.push(
    solid('ring-a', 'lamp', -RING_R, RING_R, RING_Y, RING_Y + RING_T, -RING_R, -RING_R + RING_T),
    solid('ring-b', 'lamp', -RING_R, RING_R, RING_Y, RING_Y + RING_T, RING_R - RING_T, RING_R),
    solid(
      'ring-c',
      'lamp',
      -RING_R,
      -RING_R + RING_T,
      RING_Y,
      RING_Y + RING_T,
      -RING_R + RING_T,
      RING_R - RING_T
    ),
    solid(
      'ring-d',
      'lamp',
      RING_R - RING_T,
      RING_R,
      RING_Y,
      RING_Y + RING_T,
      -RING_R + RING_T,
      RING_R - RING_T
    )
  );

  // --- A deck ring under it, marking the centre. The one piece of the station
  // that says "you are at a junction" without saying anything.
  parts.push(
    solid(
      'deck-ring',
      'trim',
      -RING_R,
      RING_R,
      FLOOR_Y + 0.004,
      FLOOR_Y + 0.012,
      -RING_R,
      -RING_R + 0.06
    ),
    solid(
      'deck-ring-b',
      'trim',
      -RING_R,
      RING_R,
      FLOOR_Y + 0.004,
      FLOOR_Y + 0.012,
      RING_R - 0.06,
      RING_R
    )
  );

  return parts;
}

/** Floor, crown and the eight walls, with the four doorways cut out. */
function buildShell(): THREE.BufferGeometry {
  const target = sink();
  const wall = new THREE.Color(PALETTE.HULL_SHADOW);
  const crown = new THREE.Color(PALETTE.HULL);
  const deck = new THREE.Color(PALETTE.HULL_SHADOW);
  const centre = new THREE.Vector3(0, CEILING_Y / 2, 0);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const corner = (i: number, r: number): THREE.Vector3 => {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const rr = r / Math.cos(Math.PI / 8);
    return v(rr * Math.cos(a), 0, rr * Math.sin(a));
  };

  // Floor and crown as a fan from the centre, one TRIANGLE per octant. A
  // triangle, not a quad with a repeated corner - that is degenerate, and it
  // renders as nothing at all, which is what an empty octagon looked like.
  for (let i = 0; i < 8; i += 1) {
    const a = corner(i - 1, APOTHEM);
    const b = corner(i, APOTHEM);
    for (const [y, colour, up] of [
      [FLOOR_Y, deck, true],
      [CEILING_Y, crown, false],
    ] as const) {
      const mid = v((a.x + b.x) / 3, y, (a.z + b.z) / 3);
      centre.set(0, up ? CEILING_Y : FLOOR_Y - 1, 0);
      pushFacet(
        target,
        v(0, y, 0),
        v(a.x, y, a.z),
        v(b.x, y, b.z),
        centre,
        facetColour(colour, mid, SEED, JITTER)
      );
    }
  }

  // The eight walls. Cardinal faces get the doorway cut out of them as three
  // panels; chamfers are one panel each. A flat wall needs no clever cutter.
  const halfW = SEAM.width / 2;
  const openTop = SEAM.height;
  for (const [i, face] of FACES.entries()) {
    const { out, along } = faceBasis(face.angle);
    const base = out.clone().multiplyScalar(APOTHEM);
    centre.set(0, CEILING_Y / 2, 0);
    const panel = (s0: number, s1: number, y0: number, y1: number): void => {
      const p0 = base.clone().addScaledVector(along, s0);
      const p1 = base.clone().addScaledVector(along, s1);
      pushQuad(
        target,
        v(p0.x, y0, p0.z),
        v(p1.x, y0, p1.z),
        v(p1.x, y1, p1.z),
        v(p0.x, y1, p0.z),
        centre,
        facetColour(wall, v((p0.x + p1.x) / 2, (y0 + y1) / 2, (p0.z + p1.z) / 2), SEED + i, JITTER)
      );
    };
    if (face.door) {
      panel(-FACE_HALF, -halfW, FLOOR_Y, CEILING_Y);
      panel(halfW, FACE_HALF, FLOOR_Y, CEILING_Y);
      panel(-halfW, halfW, openTop, CEILING_Y);
    } else {
      // Two courses, so a chamfer steps in value rather than reading as one slab.
      panel(-FACE_HALF, FACE_HALF, FLOOR_Y, CEILING_Y * 0.55);
      panel(-FACE_HALF, FACE_HALF, CEILING_Y * 0.55, CEILING_Y);
    }
  }

  return toGeometry(target);
}

function buildNode(): CompartmentHandle {
  const root = new THREE.Object3D();
  root.name = 'node';

  const liner = interiorMaterial(PALETTE.NIGHT_SIDE);
  const shell = new THREE.Mesh(buildShell(), liner);
  shell.name = 'node-shell';
  root.add(shell);

  const parts = nodeSolids();
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
    // The lamp-diffuser rule: no diffuse term at all, the whole value in
    // emissive, or it clips the moment anything bright lands on it.
    lamp: new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x000000),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.CLOUD),
      emissiveIntensity: 0.42,
    }),
  };
  for (const key of Object.keys(materials)) {
    const solids = parts.filter((p) => p.material === key).map((p) => boxOf(p));
    const material = materials[key];
    if (solids.length === 0 || material === undefined) continue;
    const mesh = new THREE.Mesh(merged(solids), material);
    mesh.name = `node-${key}`;
    root.add(mesh);
  }

  // Top light, and only top light. The ring is overhead and central, so every
  // face in the room stands in the same relation to it - which is what makes a
  // junction feel institutional next to a room lit by a moving beam.
  const ambient = new THREE.HemisphereLight(
    new THREE.Color(PALETTE.HULL).getHex(),
    new THREE.Color(PALETTE.HULL_SHADOW).getHex(),
    1.15
  );
  root.add(ambient);
  const down = new THREE.DirectionalLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.62);
  down.position.set(0, CEILING_Y, 0);
  down.target.position.set(0, FLOOR_Y, 0);
  root.add(down, down.target);
  // Four weak washes out to the walls, so the octagon's faces separate. Without
  // these a purely vertical key leaves every vertical surface on the emissive
  // floor and the room reads as a lit floor under a dark drum.
  for (const face of FACES) {
    if (!face.door) continue;
    const { out } = faceBasis(face.angle);
    const wash = new THREE.DirectionalLight(new THREE.Color(PALETTE.CLOUD).getHex(), 0.46);
    wash.position.set(0, CEILING_Y * 0.9, 0);
    wash.target.position.set(out.x * APOTHEM * 2, CEILING_Y * 0.3, out.z * APOTHEM * 2);
    root.add(wash, wash.target);
  }

  /**
   * A cross of floor between the four doors, with the corners left out because
   * that is where the stacks are. Two overlapping rectangles rather than one
   * square: the union IS the walkable shape, which is what `FloorRect` is for.
   */
  const arm = SEAM.width / 2 + 0.42;
  const floor: readonly FloorRect[] = [
    { minX: -APOTHEM + 0.08, maxX: APOTHEM - 0.08, minZ: -arm, maxZ: arm, floorY: FLOOR_Y },
    { minX: -arm, maxX: arm, minZ: -APOTHEM + 0.08, maxZ: APOTHEM - 0.08, floorY: FLOOR_Y },
  ];

  const points: readonly PointOfInterest[] = [
    { id: 'stacks', label: 'the corner stacks', position: [1.4, 1.0, 1.4] },
  ];

  return {
    root,
    spawn: { position: [0, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI, pitch: 0 },
    floor,
    pointsOfInterest: points,
    eyeHeight: EYE_HEIGHT,
    solids: parts,
    ports: PORTS,
    extent: EXTENT,

    /**
     * An octagonal prism: clearance is the smallest distance to any of the eight
     * wall planes, or to the floor or crown.
     */
    contains(point: THREE.Vector3): number {
      let worst = Math.min(point.y - FLOOR_Y, CEILING_Y - point.y);
      for (const face of FACES) {
        const { out } = faceBasis(face.angle);
        worst = Math.min(worst, APOTHEM - (point.x * out.x + point.z * out.z));
      }
      return worst;
    },

    update(): void {
      // Nothing here moves either. Two still rooms in a row is a decision: the
      // limb deck is where time shows, and it only reads that way because the
      // rooms on either side of it do not.
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

export const NODE: CompartmentDefinition = {
  id: 'node',
  name: 'THE NODE',
  description: 'A four-way junction, 4.6 m across the flats.',
  ports: PORTS,
  extent: EXTENT,
  build: buildNode,
};

/** On its own it is a station of one compartment, which is what caps its ports. */
export const NODE_SOLO = {
  id: 'node',
  name: 'THE NODE',
  description: 'A four-way junction, 4.6 m across the flats.',
  build: () => soloStation(NODE),
};

export default NODE_SOLO;
