/**
 * THE LIMB DECK - everything bolted to the room, and everything in it that
 * moves.
 *
 * The shell (hull, deck, bay) and the light rig are separate modules; this one
 * owns the hardware that hangs off them: handrails, the bay perch, the IMV
 * run, the ceiling conduits, the aft hatch and its placards, the sun-bearing
 * dial, and the outboard structure the bay looks past. Six things move, each
 * with a physical cause named at its builder, and every one of them is a pure
 * function of the Frame it is handed - see docs/ENVIRONMENTS.md, invariant 1.
 * Nothing here reads a clock, and the only randomness is a seeded LCG run once
 * at build time.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import { LIMB_DECK_GEOMETRY } from '../orbit';
import type { Animated, Frame } from './contract';
import { DOOR_FASCIA } from './door';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// --------------------------------------------------------------------------
// The hull these fixtures bolt to. docs/ENVIRONMENTS.md, "Shell": a half
// cylinder of inner radius 2.10 m about an axis at y = 1.15, flat bulkheads at
// x = +/-3.20, deck at y = 0. Written down rather than imported, because where
// a bracket lands is a fact about the pressure vessel, not about whichever
// module happens to draw it.
// --------------------------------------------------------------------------
const HULL_RADIUS = 2.1;
const HULL_AXIS_Y = 1.15;
const AFT_X = -3.2;
const FORE_X = 3.2;

/**
 * The orbit's own numbers, taken from the module that derives them rather than
 * copied out of the design: one revolution in wall seconds (the thermal ticks
 * need it to turn a 0.35 s mechanical release into orbital phase) and the
 * shaded arc, which is 129 degrees at beta 38 and 400 km. Copying either by
 * hand would let a changed beta rewrite the light story while the dial went on
 * drawing the old one.
 */
const REVOLUTION_SECONDS = LIMB_DECK_GEOMETRY.revolutionWallSeconds;
const ECLIPSE_ARC = LIMB_DECK_GEOMETRY.eclipseHalfAngle * 2;
const UMBRAL_ENTRY = Math.PI - LIMB_DECK_GEOMETRY.eclipseHalfAngle;
const UMBRAL_EXIT = Math.PI + LIMB_DECK_GEOMETRY.eclipseHalfAngle;

/**
 * Angle from zenith, negative to port. Port is where the bay is and where the
 * sun permanently sits at constant beta, so every port-side mount is a
 * negative angle and every starboard one positive.
 */
function hullPoint(x: number, theta: number, inset: number): THREE.Vector3 {
  const r = HULL_RADIUS - inset;
  return new THREE.Vector3(x, HULL_AXIS_Y + r * Math.cos(theta), r * Math.sin(theta));
}

/** Unit vector from the inner hull surface toward the cylinder's axis. */
function hullInward(theta: number): THREE.Vector3 {
  return new THREE.Vector3(0, -Math.cos(theta), -Math.sin(theta));
}

function wrapTwoPi(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

// --------------------------------------------------------------------------
// Materials
// --------------------------------------------------------------------------

type Palette = (colour: string) => THREE.MeshLambertMaterial;

/**
 * Interior surfaces floor on NIGHT_SIDE at emissiveIntensity 1.0, not the 0.62
 * earth.ts and satellite.ts use.
 *
 * Outdoors the ambient, hemisphere and anti-sun terms land on every facet, so
 * 0.62 is only ever part of the floor. Indoors an unlit facet has nothing but
 * its emissive, and 0.62 of NIGHT_SIDE lands at luma 21.3 - under the palette
 * gate's floor of 25.45, which is VOID_SLATE. This helper is deliberately not
 * shared with the exterior modules: normalising the two numbers back together
 * would put the room's shadow side beneath the darkest value in the game.
 */
function makePalette(cache: Map<string, THREE.MeshLambertMaterial>): Palette {
  return (colour: string): THREE.MeshLambertMaterial => {
    const existing = cache.get(colour);
    if (existing) return existing;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(colour),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1.0,
    });
    cache.set(colour, material);
    return material;
  };
}

// --------------------------------------------------------------------------
// Geometry kit
// --------------------------------------------------------------------------

/**
 * Concatenates parts into one non-indexed BufferGeometry, taking ownership of
 * them - every caller builds its parts inline for exactly this call.
 * Non-indexed because every facet in this game owns its three vertices and its
 * own value, which is how earth.ts builds the planet.
 */
function merge(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  const flattened = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part;
    total += (flat.getAttribute('position') as THREE.BufferAttribute).count;
    return flat;
  });

  const positions = new Float32Array(total * 3);
  let offset = 0;
  for (const flat of flattened) {
    const attribute = flat.getAttribute('position') as THREE.BufferAttribute;
    positions.set(attribute.array as Float32Array, offset);
    offset += attribute.count * 3;
  }

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const flat = flattened[i];
    if (flat && flat !== part) flat.dispose();
    if (part) part.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

function boxAt(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A tube spanning two points: booms, struts, duct elbows. */
function tubeBetween(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  sides: number
): THREE.BufferGeometry {
  const axis = new THREE.Vector3().subVectors(to, from);
  const length = axis.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis.normalize()));
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  geometry.translate(mid.x, mid.y, mid.z);
  return geometry;
}

function meshOf(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function disposeTree(root: THREE.Object3D): void {
  const done = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (done.has(material)) continue;
      done.add(material);
      material.dispose();
    }
  });
}

// --------------------------------------------------------------------------
// 5x7 dot matrix
// --------------------------------------------------------------------------

/**
 * Only the characters the two signs in this room actually spell. A stencil
 * font is a table of facts, so it is written as the bitmap it is rather than
 * as hex - a wrong row is visible in the source.
 */
const GLYPH_ROWS = 7;
const GLYPH_COLUMNS = 5;
const CHAR_ADVANCE = 6;
const LINE_ADVANCE = 9;

const BLANK: readonly string[] = ['00000', '00000', '00000', '00000', '00000', '00000', '00000'];

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ' ': BLANK,
};

interface DotMatrixSpec {
  readonly lines: readonly string[];
  /** Centre of the whole block, on the surface it is stencilled onto. */
  readonly centre: THREE.Vector3;
  /** Unit vector the text advances along. */
  readonly across: THREE.Vector3;
  /** Unit vector successive lines advance along. */
  readonly down: THREE.Vector3;
  readonly pitch: number;
  readonly dot: number;
  /** How far the dots stand proud of the surface. */
  readonly relief: number;
  readonly material: THREE.Material;
  readonly name: string;
}

interface DotMatrixBuild {
  readonly mesh: THREE.InstancedMesh;
  readonly width: number;
  readonly height: number;
}

/**
 * Dot-matrix lettering as one InstancedMesh of little raised squares - the
 * stencil decals DIRECTION.md asks for, baked into geometry rather than into a
 * texture, because there is no asset pipeline and no textures anywhere.
 */
function dotMatrix(spec: DotMatrixSpec): DotMatrixBuild {
  const longest = spec.lines.reduce((most, line) => Math.max(most, line.length), 0);
  const width = (longest * CHAR_ADVANCE - 1) * spec.pitch;
  const height = (spec.lines.length * LINE_ADVANCE - 2) * spec.pitch;

  const textUp = spec.down.clone().multiplyScalar(-1);
  const normal = new THREE.Vector3().crossVectors(spec.across, textUp);
  const basis = new THREE.Matrix4().makeBasis(spec.across, textUp, normal);

  const matrices: THREE.Matrix4[] = [];
  const position = new THREE.Vector3();

  spec.lines.forEach((line, lineIndex) => {
    const lineWidth = (line.length * CHAR_ADVANCE - 1) * spec.pitch;
    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const rows = GLYPHS[line[charIndex] ?? ' '] ?? BLANK;
      for (let row = 0; row < GLYPH_ROWS; row += 1) {
        const bits = rows[row] ?? '';
        for (let column = 0; column < GLYPH_COLUMNS; column += 1) {
          if (bits[column] !== '1') continue;

          const u = -lineWidth / 2 + (charIndex * CHAR_ADVANCE + column + 0.5) * spec.pitch;
          const v = -height / 2 + (lineIndex * LINE_ADVANCE + row + 0.5) * spec.pitch;

          position
            .copy(spec.centre)
            .addScaledVector(spec.across, u)
            .addScaledVector(spec.down, v)
            .addScaledVector(normal, spec.relief / 2);

          matrices.push(new THREE.Matrix4().copy(basis).setPosition(position));
        }
      }
    }
  });

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(spec.dot, spec.dot, spec.relief),
    spec.material,
    matrices.length
  );
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = spec.name;

  return { mesh, width, height };
}

// --------------------------------------------------------------------------
// Handrails
// --------------------------------------------------------------------------

/** ISS handrail stock: 19 mm tube on a 0.06 m standoff, 0.36 m between feet. */
const RAIL_DIAMETER = 0.019;
const RAIL_LENGTH = 0.36;
const RAIL_STANDOFF = 0.06;
const RAIL_FOOT_X = 0.148;

/**
 * Just below the bay's lower edge, which is at 90 degrees from zenith: hand
 * height for someone at the perch, and close enough to the diffuser that the
 * telltale tied to the last rail is genuinely in the discharge.
 */
const PORT_RAIL_THETA = -96 * DEG;
const STARBOARD_RAIL_THETA = 100 * DEG;
const RAIL_XS = [-2.8, -2.0, -1.2, -0.4, 0.4, 1.2, 2.0, 2.8] as const;
const CEILING_RAIL_XS = [-1.95, -0.65, 0.65, 1.95] as const;

function railUnitGeometry(): THREE.BufferGeometry {
  const radius = RAIL_DIAMETER / 2;
  const bar = new THREE.CylinderGeometry(radius, radius, RAIL_LENGTH, 8, 1);
  bar.rotateZ(Math.PI / 2);

  const parts: THREE.BufferGeometry[] = [bar];
  for (const side of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.008, 0.0095, RAIL_STANDOFF, 6, 1);
    post.translate(side * RAIL_FOOT_X, -RAIL_STANDOFF / 2, 0);
    parts.push(post);
    // The pad's underside lands exactly on the hull; anything past it would
    // punch through the pressure vessel and let the exterior pass show.
    parts.push(boxAt(0.05, 0.008, 0.042, side * RAIL_FOOT_X, -RAIL_STANDOFF + 0.004, 0));
  }
  return merge(parts);
}

/**
 * Every handrail in the room in one InstancedMesh: 8 down the port hull below
 * the bay, 8 starboard, 4 on the ceiling. Translation aids run along the
 * module axis, so every instance shares the bar direction and differs only in
 * where on the circumference it is bolted.
 */
function buildHandrails(palette: Palette): THREE.InstancedMesh {
  const placements: { x: number; theta: number }[] = [];
  for (const x of RAIL_XS) placements.push({ x, theta: PORT_RAIL_THETA });
  for (const x of RAIL_XS) placements.push({ x, theta: STARBOARD_RAIL_THETA });
  for (const x of CEILING_RAIL_XS) placements.push({ x, theta: 0 });

  const mesh = new THREE.InstancedMesh(
    railUnitGeometry(),
    palette(PALETTE.MINT),
    placements.length
  );
  mesh.name = 'handrails';

  const along = new THREE.Vector3(1, 0, 0);
  const matrix = new THREE.Matrix4();

  placements.forEach((placement, index) => {
    // Local +Y is the standoff direction, so it maps to the inward normal and
    // the feet land flat on the hull.
    const inward = hullInward(placement.theta);
    const side = new THREE.Vector3().crossVectors(along, inward);
    matrix.makeBasis(along, inward, side);
    matrix.setPosition(
      hullPoint(placement.x, placement.theta, 0).addScaledVector(inward, RAIL_STANDOFF)
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}

/** Where the telltale is tied: the fore end of the port rail nearest the grille. */
function telltaleAnchor(): THREE.Vector3 {
  const x = (RAIL_XS[RAIL_XS.length - 1] ?? 0) + RAIL_LENGTH / 2 - 0.03;
  return hullPoint(x, PORT_RAIL_THETA, 0).addScaledVector(
    hullInward(PORT_RAIL_THETA),
    RAIL_STANDOFF
  );
}

// --------------------------------------------------------------------------
// The bay perch and foot restraint
// --------------------------------------------------------------------------

const PERCH_X = -0.6;
const PERCH_WIDTH = 1.1;
const PERCH_DEPTH = 0.42;
const PERCH_Y = 0.72;
/** Inboard edge of the plate: the hull is at z = -2.055 at perch height. */
const PERCH_FRONT_Z = -1.61;
const PERCH_HULL_Z = PERCH_FRONT_Z - PERCH_DEPTH;

/**
 * The fold-down perch: hinged off the hull under the bay, 0.42 m inboard.
 *
 * This is the piece that physically stops the player short of the glass. Feet
 * in the restraint, thighs against the plate, and the eye lands about 0.55 m
 * off the pane along its normal - which is exactly the standoff that frames
 * the limb correctly. The composition is guaranteed by hardware rather than by
 * an invisible rail, so the depth that produces it is the depth it is built
 * at.
 */
function buildPerch(palette: Palette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bay-perch';

  const parts: THREE.BufferGeometry[] = [
    boxAt(PERCH_WIDTH, 0.026, PERCH_DEPTH, PERCH_X, PERCH_Y, PERCH_FRONT_Z - PERCH_DEPTH / 2),
    // A lip at the inboard edge: what a knee actually braces against.
    boxAt(PERCH_WIDTH, 0.055, 0.022, PERCH_X, PERCH_Y + 0.026, PERCH_FRONT_Z - 0.011),
  ];

  for (const side of [-1, 1]) {
    const x = PERCH_X + side * 0.5;
    // Hinge knuckle at the hull edge: the plate folds up against the hull.
    parts.push(boxAt(0.07, 0.05, 0.05, x, PERCH_Y, PERCH_HULL_Z + 0.025));
    parts.push(
      tubeBetween(
        new THREE.Vector3(x, PERCH_Y - 0.012, PERCH_FRONT_Z + 0.02),
        hullPoint(x, -117 * DEG, 0.013),
        0.011,
        6
      )
    );
  }

  group.add(meshOf(merge(parts), palette(PALETTE.HULL_SHADOW), 'perch-plate'));
  return group;
}

/**
 * Foot restraint on the deck under the bay. Toe bars, not a floor: in
 * microgravity the feet are the only anchor, and the perch takes the shins.
 */
function buildFootRestraint(palette: Palette): THREE.Mesh {
  // The deck's chord at y = 0 is +/-1.757, so the restraint's outboard edge
  // stops short of it: the hull curves in under the bay.
  const baseZ = -1.53;
  const parts: THREE.BufferGeometry[] = [boxAt(0.7, 0.018, 0.42, PERCH_X, 0.009, baseZ)];

  for (const side of [-1, 1]) {
    const x = PERCH_X + side * 0.12;
    parts.push(boxAt(0.13, 0.014, 0.03, x, 0.062, baseZ - 0.13));
    for (const edge of [-1, 1]) {
      parts.push(boxAt(0.016, 0.055, 0.03, x + edge * 0.057, 0.035, baseZ - 0.13));
    }
  }

  return meshOf(merge(parts), palette(PALETTE.HULL_SHADOW), 'foot-restraint');
}

// --------------------------------------------------------------------------
// Intermodule ventilation
// --------------------------------------------------------------------------

const DUCT_THETA = -45 * DEG;
const DUCT_RADIUS = 0.105;
const GRILLE_CENTRE = new THREE.Vector3(FORE_X - 0.045, 1.05, -1.62);
const GRILLE_FACE = 0.34;
const GRILLE_VANES = 9;

/**
 * The IMV run: duct along the port standoff, an elbow down the fore bulkhead,
 * a 9-vane diffuser and the impeller behind it. Forced ventilation runs
 * continuously because without it exhaled CO2 pools around a sleeping crew
 * member's head - the one piece of machinery in the room that has to be on.
 */
function buildDuct(palette: Palette): THREE.Mesh {
  const run = hullPoint(0, DUCT_THETA, 0.16);
  const aft = new THREE.Vector3(-3.05, run.y, run.z);
  const bend = new THREE.Vector3(2.58, run.y, run.z);

  const parts: THREE.BufferGeometry[] = [
    tubeBetween(aft, bend, DUCT_RADIUS, 8),
    boxAt(0.22, 0.2, 0.2, bend.x + 0.02, bend.y - 0.03, bend.z),
    tubeBetween(
      new THREE.Vector3(bend.x + 0.04, bend.y - 0.06, bend.z),
      new THREE.Vector3(GRILLE_CENTRE.x - 0.06, GRILLE_CENTRE.y + 0.06, GRILLE_CENTRE.z),
      DUCT_RADIUS,
      8
    ),
    // Diffuser box, standing proud of the fore bulkhead.
    boxAt(0.06, GRILLE_FACE, GRILLE_FACE, GRILLE_CENTRE.x, GRILLE_CENTRE.y, GRILLE_CENTRE.z),
  ];

  // Standoff clamps along the run, one per hull ring.
  for (let x = -2.8; x <= 2.4; x += 0.8) {
    const surface = hullPoint(x, DUCT_THETA, 0.014);
    parts.push(tubeBetween(surface, new THREE.Vector3(x, run.y, run.z), 0.014, 6));
  }

  return meshOf(merge(parts), palette(PALETTE.HULL_SHADOW), 'imv-duct');
}

function buildGrilleVanes(palette: Palette): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const pitch = (GRILLE_FACE - 0.05) / (GRILLE_VANES - 1);
  for (let i = 0; i < GRILLE_VANES; i += 1) {
    const z = GRILLE_CENTRE.z + (i - (GRILLE_VANES - 1) / 2) * pitch;
    parts.push(boxAt(0.05, GRILLE_FACE - 0.04, 0.011, GRILLE_CENTRE.x - 0.03, GRILLE_CENTRE.y, z));
  }
  return meshOf(merge(parts), palette(PALETTE.HULL), 'imv-grille');
}

interface Moving {
  readonly object: THREE.Object3D;
  update(frame: Frame): void;
}

/**
 * The impeller behind the diffuser.
 *
 * Turned at a legible rate rather than a true one: a real IMV fan runs in the
 * thousands of rpm, which at 60 Hz strobes into a still disc and reads as
 * broken hardware. Motion is what the fixture is for, so the rate is the
 * slowest one that still says "running".
 */
/**
 * Impeller speed and blade count.
 *
 * Exported because the room's sound is built ON them rather than beside them:
 * a fan you can see turning and a hum at an unrelated pitch are two machines,
 * and the ear notices even when it cannot say why.
 */
export const IMPELLER_HZ = 1.05;
export const IMPELLER_BLADES = 7;

/**
 * What the eye is shown, divided by what the machine actually does.
 *
 * A cabin ventilation impeller runs somewhere around 4000 rpm. Drawn honestly
 * at that rate it is a grey disc - a seven-bladed fan at 67 revolutions a
 * second either strobes against the frame rate or blurs into nothing, and
 * either way the player cannot see that it is turning, which is the entire
 * reason it is visible through the grille. So the VISIBLE rate is geared down
 * to 1.05 Hz, where a blade can be followed by eye.
 *
 * The SOUND cannot take the same liberty. Blade pass at the drawn rate is
 * 7.35 Hz, which is infrasonic - the first cut of the room tone was pitched
 * there and was, correctly and completely, inaudible. This is the ratio between
 * the two, kept in one place so they stay one machine rather than drifting into
 * a fan that looks like one speed and sounds like another.
 */
export const IMPELLER_VISUAL_GEARING = 16;

function buildImpeller(palette: Palette): Moving {
  const parts: THREE.BufferGeometry[] = [];

  const hub = new THREE.CylinderGeometry(0.032, 0.032, 0.05, 8, 1);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);

  for (let i = 0; i < IMPELLER_BLADES; i += 1) {
    const blade = new THREE.BoxGeometry(0.03, 0.098, 0.012);
    // Pitched, so the blade throws air rather than stirring it.
    blade.rotateX(24 * DEG);
    blade.translate(0, 0.078, 0);
    blade.rotateX((i * TAU) / IMPELLER_BLADES);
    parts.push(blade);
  }

  const mesh = meshOf(merge(parts), palette(PALETTE.HULL), 'imv-impeller');
  mesh.position.set(GRILLE_CENTRE.x + 0.01, GRILLE_CENTRE.y, GRILLE_CENTRE.z);

  return {
    object: mesh,
    update(frame) {
      mesh.rotation.x = frame.t * TAU * IMPELLER_HZ;
    },
  };
}

// --------------------------------------------------------------------------
// Ceiling conduit bundle
// --------------------------------------------------------------------------

const CONDUIT_THETA = 14 * DEG;

/**
 * Power and fluid lines running the length of the ceiling on clamps. Offset
 * off the centreline so the ceiling handrails have their own lane.
 */
function buildConduits(palette: Palette): { group: THREE.Group; bundle: THREE.Group } {
  const group = new THREE.Group();
  group.name = 'ceiling-conduits';

  // The bundle moves as one when a clamp lets go; the clamps do not.
  const bundle = new THREE.Group();
  bundle.name = 'conduit-bundle';

  const centre = hullPoint(0, CONDUIT_THETA, 0.1);
  const inward = hullInward(CONDUIT_THETA);
  const tangent = new THREE.Vector3(0, -Math.sin(CONDUIT_THETA), Math.cos(CONDUIT_THETA));

  const lay = (
    offsetTangent: number,
    offsetInward: number,
    radius: number
  ): THREE.BufferGeometry => {
    const from = centre
      .clone()
      .addScaledVector(tangent, offsetTangent)
      .addScaledVector(inward, offsetInward);
    from.x = -3.05;
    const to = from.clone();
    to.x = 3.05;
    return tubeBetween(from, to, radius, 6);
  };

  bundle.add(
    meshOf(
      merge([lay(-0.035, 0, 0.021), lay(0.035, 0, 0.021), lay(0, 0.036, 0.018)]),
      palette(PALETTE.ARRAY),
      'conduit-power'
    )
  );
  // The one fluid line, in hull grey: a bundle that is all one colour reads as
  // a single extruded shape rather than as several separate services.
  bundle.add(
    meshOf(merge([lay(0.07, 0.03, 0.015)]), palette(PALETTE.HULL_SHADOW), 'conduit-fluid')
  );
  group.add(bundle);

  const clamps: THREE.BufferGeometry[] = [];
  for (let x = -2.7; x <= 2.8; x += 0.78) {
    const saddle = centre.clone().addScaledVector(inward, 0.012);
    clamps.push(boxAt(0.045, 0.13, 0.17, x, saddle.y, saddle.z));
    clamps.push(tubeBetween(hullPoint(x, CONDUIT_THETA, 0.016), saddle, 0.016, 6));
  }
  group.add(meshOf(merge(clamps), palette(PALETTE.HULL), 'conduit-clamps'));

  return { group, bundle };
}

// --------------------------------------------------------------------------
// The aft bulkhead: placards, dial
// --------------------------------------------------------------------------

/*
 * THE AFT HATCH IS GONE. It was a dogged, swinging pressure hatch with a
 * handwheel, and it is replaced by the lift door in door.ts.
 *
 * A swinging hatch has to be reached past, unlatched, and then left hanging in
 * whichever compartment it opens into - three things standing between the
 * player and the next room, every single time they cross. A slab that goes
 * straight up leaves a clean rectangle of floor to walk through and puts its
 * whole mechanism overhead where nothing else lives. It is also the shape that
 * survives being the seam the game streams compartments across.
 */

/** The module's own name plate, on the head panel over the door. */
function buildNamePlacard(palette: Palette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'name-placard';

  // Mounted off the door's published head rather than off a y typed in here,
  // which is how it ended up hanging in the opening when the doorway grew.
  const centre = new THREE.Vector3(
    DOOR_FASCIA.x + 0.008,
    (DOOR_FASCIA.minY + DOOR_FASCIA.maxY) / 2,
    0
  );
  const dots = dotMatrix({
    lines: ['STATION KEPLER', 'NODE 2', 'LIMB DECK'],
    centre,
    // Facing the aft bulkhead the player looks along -X, so their right hand
    // is -Z and text advances that way.
    across: new THREE.Vector3(0, 0, -1),
    down: new THREE.Vector3(0, -1, 0),
    pitch: 0.0045,
    dot: 0.0034,
    relief: 0.003,
    material: palette(PALETTE.MINT),
    name: 'name-placard-dots',
  });

  group.add(
    meshOf(
      merge([
        boxAt(
          0.006,
          dots.height + 0.03,
          dots.width + 0.04,
          DOOR_FASCIA.x + 0.003,
          centre.y,
          centre.z
        ),
      ]),
      palette(PALETTE.HULL_SHADOW),
      'name-placard-plate'
    )
  );
  group.add(dots.mesh);
  return group;
}

/** Deck stencil at the hatch sill, reading to someone walking forward. */
function buildDeckStencil(palette: Palette): THREE.InstancedMesh {
  return dotMatrix({
    lines: ['NO STEP'],
    // Clear of the deck's +/-3 mm warp, so the stencil never sinks into it.
    centre: new THREE.Vector3(-2.55, 0.007, 0),
    across: new THREE.Vector3(0, 0, 1),
    down: new THREE.Vector3(-1, 0, 0),
    pitch: 0.01,
    dot: 0.0075,
    relief: 0.005,
    material: palette(PALETTE.HULL),
    name: 'deck-stencil',
  }).mesh;
}

const DIAL_CENTRE = new THREE.Vector3(AFT_X + 0.012, 1.05, -0.85);
const DIAL_RADIUS = 0.08;

/**
 * Card angle to a direction on the dial face. Zenith is twelve o'clock, so the
 * needle stands straight up at local noon and hangs at local midnight. The
 * needle and the shaded wedge both go through this function, which is what
 * keeps them in the same convention.
 */
function cardDirection(angle: number): THREE.Vector3 {
  return new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
}

function wedgeGeometry(
  radius: number,
  centreAngle: number,
  arc: number,
  segments: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a0 = centreAngle - arc / 2 + (arc * i) / segments;
    const a1 = centreAngle - arc / 2 + (arc * (i + 1)) / segments;
    const p0 = cardDirection(a0).multiplyScalar(radius);
    const p1 = cardDirection(a1).multiplyScalar(radius);
    positions.push(0, 0, 0, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The sun-bearing dial: the room's clock. The needle turns once per
 * revolution, and the shaded wedge is the 129 degrees of that revolution spent
 * in Earth's shadow, so a glance says both where the sun is and how long until
 * it goes out.
 *
 * The card is a diagram of the orbit plane pinned to a bulkhead, the way a
 * wall clock is a diagram of the day - it is read, not sighted through.
 */
function buildDial(palette: Palette): Moving {
  const group = new THREE.Group();
  group.name = 'sun-bearing-dial';
  group.position.copy(DIAL_CENTRE);

  const face = new THREE.CylinderGeometry(DIAL_RADIUS, DIAL_RADIUS, 0.012, 24, 1);
  face.rotateZ(Math.PI / 2);
  group.add(meshOf(merge([face]), palette(PALETTE.HULL_SHADOW), 'dial-face'));

  const bezel = new THREE.TorusGeometry(DIAL_RADIUS + 0.004, 0.007, 4, 24);
  bezel.rotateY(Math.PI / 2);
  group.add(meshOf(merge([bezel]), palette(PALETTE.HULL), 'dial-bezel'));

  const wedge = wedgeGeometry(DIAL_RADIUS - 0.008, Math.PI, ECLIPSE_ARC, 16);
  wedge.translate(0.008, 0, 0);
  group.add(meshOf(wedge, palette(PALETTE.ARRAY), 'dial-eclipse-wedge'));

  const ticks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = (i * TAU) / 12;
    const long = i === 0;
    const length = long ? 0.019 : 0.011;
    const tick = new THREE.BoxGeometry(0.003, length, 0.0035);
    tick.rotateX(angle);
    const seat = cardDirection(angle).multiplyScalar(DIAL_RADIUS - 0.012 - length / 2);
    tick.translate(0.009, seat.y, seat.z);
    ticks.push(tick);
  }
  group.add(meshOf(merge(ticks), palette(PALETTE.MINT), 'dial-ticks'));

  const needlePivot = new THREE.Group();
  needlePivot.name = 'dial-needle';
  group.add(needlePivot);
  needlePivot.add(
    meshOf(
      merge([
        boxAt(0.0035, DIAL_RADIUS - 0.016, 0.004, 0.012, (DIAL_RADIUS - 0.016) / 2, 0),
        boxAt(0.0035, 0.02, 0.006, 0.012, -0.01, 0),
        boxAt(0.006, 0.014, 0.014, 0.012, 0, 0),
      ]),
      palette(PALETTE.MINT),
      'dial-needle-arm'
    )
  );

  return {
    object: group,
    update(frame) {
      // Rotation about the dial normal by the card angle: cardDirection(a) is
      // exactly where +Y lands under rotation.x = a, so the needle and the
      // wedge cannot drift apart.
      needlePivot.rotation.x = orbitalPhase(frame);
    },
  };
}

// --------------------------------------------------------------------------
// The orbital clock, read once per frame
// --------------------------------------------------------------------------

/**
 * Where the sun is in the orbit plane, in radians, zero at local noon.
 *
 * src/env/orbit.ts solves the orbit and the Frame carries the answer. This is
 * the only place the room's hardware touches that sample, so nothing here
 * re-derives orbital geometry at draw time (docs/ENVIRONMENTS.md, invariant 3
 * of AGENTS.md). The wrap makes the read total: the sample is documented as
 * [0, 2pi), and the dial and the feather windows both compare against fixed
 * angles, so one phase that ran past a revolution would show up as a needle
 * spinning off its card.
 */
function orbitalPhase(frame: Frame): number {
  return wrapTwoPi(frame.orbit.phase);
}

// --------------------------------------------------------------------------
// Cabin airflow: the telltale ribbon
// --------------------------------------------------------------------------

const TELLTALE_LENGTH = 0.22;
const TELLTALE_HALF_WIDTH = 0.016;
const TELLTALE_SEGMENTS = 12;
const TELLTALE_HZ = 1.4;
/** The slow swell the diffuser's own turbulence puts on top of the flutter. */
const TELLTALE_BEAT_HZ = 0.11;
/** Seconds for a crease to travel the ribbon: what makes it a wave, not a wag. */
const TELLTALE_LAG = 0.16;

/**
 * A length of tape tied to the handrail nearest the diffuser.
 *
 * This is the only fast motion in the room, and it is what tells you in second
 * three that time is running: everything else here moves on orbital time. The
 * beat keeps it from reading as a looped clip, and the whole thing is
 * evaluated from t alone, so the shot harness gets the same ribbon every time.
 */
function buildTelltale(palette: Palette): Moving {
  // Tied under the bar rather than on it, so the tape hangs in clear air.
  const anchor = telltaleAnchor().add(new THREE.Vector3(0, -0.018, 0.015));

  // The diffuser discharges aft along the module and the jet spills down and
  // inboard off the hull, which is both where the air actually goes and what
  // keeps the tape broadside to the room instead of end-on to it.
  const flow = new THREE.Vector3(-0.82, -0.3, 0.48).normalize();
  const sway = new THREE.Vector3().crossVectors(flow, UP).normalize();
  const lift = new THREE.Vector3().crossVectors(flow, sway).normalize();

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(TELLTALE_SEGMENTS * 6 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Tape has two faces and the flutter shows you both. Cloned off the shared
  // MINT rather than built fresh, so the emissive floor stays defined in one
  // place, and cloned rather than mutated so DoubleSide does not leak onto
  // every handrail in the room.
  const material = palette(PALETTE.MINT).clone();
  material.side = THREE.DoubleSide;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'telltale';
  mesh.frustumCulled = false;

  const centre = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  for (let i = 0; i <= TELLTALE_SEGMENTS; i += 1) {
    left.push(new THREE.Vector3());
    right.push(new THREE.Vector3());
  }

  return {
    object: mesh,
    update(frame) {
      // Reduced motion keeps the ribbon alive but takes the flicker out of it:
      // a 1.4 Hz flutter is exactly the motion the preference exists for.
      const hz = frame.reducedMotion ? TELLTALE_HZ * 0.3 : TELLTALE_HZ;
      const gain = frame.reducedMotion ? 0.45 : 1;
      const beat = 0.72 + 0.28 * Math.sin(TAU * TELLTALE_BEAT_HZ * frame.t);

      for (let i = 0; i <= TELLTALE_SEGMENTS; i += 1) {
        const u = i / TELLTALE_SEGMENTS;
        const wave = TAU * hz * (frame.t - u * TELLTALE_LAG);
        // Amplitude grows toward the free end: the tied end cannot move.
        const amplitude = 0.03 * gain * beat * Math.pow(u, 1.5);

        centre
          .copy(anchor)
          .addScaledVector(flow, TELLTALE_LENGTH * u)
          .addScaledVector(sway, amplitude * Math.sin(wave))
          .addScaledVector(lift, amplitude * 0.45 * Math.sin(wave + 1.9));

        // The tape twists as the crease passes, which is what stops it reading
        // as a flat strip seen edge-on.
        const twist = 0.9 * Math.sin(wave + 0.6);
        edge
          .copy(sway)
          .multiplyScalar(Math.cos(twist))
          .addScaledVector(lift, Math.sin(twist))
          .multiplyScalar(TELLTALE_HALF_WIDTH);

        const l = left[i];
        const r = right[i];
        if (!l || !r) continue;
        l.copy(centre).sub(edge);
        r.copy(centre).add(edge);
      }

      let offset = 0;
      const push = (v: THREE.Vector3): void => {
        positions[offset] = v.x;
        positions[offset + 1] = v.y;
        positions[offset + 2] = v.z;
        offset += 3;
      };
      for (let i = 0; i < TELLTALE_SEGMENTS; i += 1) {
        const a = left[i];
        const b = right[i];
        const c = left[i + 1];
        const d = right[i + 1];
        if (!a || !b || !c || !d) continue;
        push(a);
        push(b);
        push(d);
        push(a);
        push(d);
        push(c);
      }

      geometry.getAttribute('position').needsUpdate = true;
      geometry.computeVertexNormals();
    },
  };
}

// --------------------------------------------------------------------------
// The tethered grease pencil
// --------------------------------------------------------------------------

const LANYARD_LENGTH = 0.4;
/** Deliberately incommensurate, so the pattern never repeats. */
const LANYARD_PERIOD = 19;
const TUMBLE_PERIOD = 7;
const LANYARD_TRAIL = 0.9;

/**
 * Exactly one loose object in the room: it is the proof there is no gravity.
 *
 * The pencil drifts to the end of its lanyard and back on a 19 s arc while
 * tumbling on a 7 s period about a fixed axis - angular momentum is conserved,
 * so once it turns it never stops and never wobbles. The two periods share no
 * factor, so the pose never repeats inside a session.
 */
function buildStylus(palette: Palette): Moving {
  const group = new THREE.Group();
  group.name = 'grease-pencil';

  const anchor = hullPoint(-1.35, -100 * DEG, 0).addScaledVector(hullInward(-100 * DEG), 0.03);
  const tumbleAxis = new THREE.Vector3(0.31, 0.86, -0.41).normalize();

  const body = new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6, 1);
  body.rotateZ(Math.PI / 2);
  const tip = new THREE.ConeGeometry(0.008, 0.026, 6);
  tip.rotateZ(-Math.PI / 2);
  tip.translate(0.078, 0, 0);
  group.add(meshOf(merge([body, tip]), palette(PALETTE.CLOUD), 'pencil-body'));

  const band = new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 6, 1);
  band.rotateZ(Math.PI / 2);
  band.translate(-0.05, 0, 0);
  group.add(meshOf(merge([band]), palette(PALETTE.HULL_SHADOW), 'pencil-band'));

  // The tether: a hairline, the same weight the orbit traces are drawn at.
  const lanyardPoints = 7;
  const lanyardGeometry = new THREE.BufferGeometry();
  lanyardGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(lanyardPoints * 3), 3)
  );
  const lanyard = new THREE.Line(
    lanyardGeometry,
    new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.HULL) })
  );
  lanyard.name = 'pencil-lanyard';
  lanyard.frustumCulled = false;

  const carrier = new THREE.Group();
  carrier.name = 'grease-pencil-carrier';
  carrier.add(group);
  carrier.add(lanyard);

  const swing = new THREE.Vector3();
  /**
   * Direction from the tether point at a given time. Biased inboard and aft so
   * the pencil's whole envelope clears the hull, the perch and the deck - a
   * loose object that intersects the room is worse than no loose object.
   */
  const direction = (t: number): THREE.Vector3 => {
    const a = (TAU * t) / LANYARD_PERIOD;
    return swing
      .set(-0.42 + 0.3 * Math.cos(a), 0.16 * Math.sin(2 * a) + 0.1, 0.62 + 0.26 * Math.sin(a))
      .normalize();
  };

  const position = new THREE.Vector3();
  const tumble = new THREE.Quaternion();

  return {
    object: carrier,
    update(frame) {
      position.copy(anchor).addScaledVector(direction(frame.t), LANYARD_LENGTH);
      group.position.copy(position);
      group.quaternion.copy(tumble.setFromAxisAngle(tumbleAxis, (TAU * frame.t) / TUMBLE_PERIOD));

      // The tether bows along where the pencil has just been: each interior
      // point is the arc evaluated that much earlier, so the far end still
      // lands exactly on the pencil.
      const attribute = lanyardGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < lanyardPoints; i += 1) {
        const s = i / (lanyardPoints - 1);
        const past = direction(frame.t - (1 - s) * LANYARD_TRAIL);
        attribute.setXYZ(
          i,
          anchor.x + past.x * LANYARD_LENGTH * s,
          anchor.y + past.y * LANYARD_LENGTH * s,
          anchor.z + past.z * LANYARD_LENGTH * s
        );
      }
      attribute.needsUpdate = true;
    },
  };
}

// --------------------------------------------------------------------------
// Thermal ticks
// --------------------------------------------------------------------------

/** A release lasts 0.35 s and rings down inside it, so nothing snaps back. */
const TICK_DURATION = 0.35;
const TICK_DECAY = 0.06;
const TICK_RING_HZ = 11;
/** Seconds after a terminator crossing. Fixed, because the strain is. */
const TICK_OFFSETS: readonly [number, number, number] = [1.9, 5.3, 12.4];

interface TickTarget {
  readonly object: THREE.Object3D;
  readonly axis: THREE.Vector3;
  /** Sub-centimetre, always: this is stick-slip, not a mechanism. */
  readonly amplitude: number;
  readonly offset: number;
}

/**
 * One release: full displacement at the instant of the slip, then a ring down
 * inside the window, so it ends where it started and nothing snaps back.
 */
function snapAt(elapsed: number): number {
  if (elapsed < 0 || elapsed > TICK_DURATION) return 0;
  return Math.exp(-elapsed / TICK_DECAY) * Math.cos(TAU * TICK_RING_HZ * elapsed);
}

/**
 * Three one-shot snaps per terminator crossing.
 *
 * The shell swings about 150 K across the terminator and secondary structure
 * lags it; the mismatch releases as discrete stick-slip events. You will not
 * see this in ten seconds. After two minutes you will see it and never be sure
 * you did.
 *
 * There is no latch and no stored state in here: the time since the last
 * crossing is read straight out of the orbital phase, so scrubbing the clock
 * backwards replays the same snaps and the pixel-diff gate cannot flap. That
 * is invariant 1 of docs/ENVIRONMENTS.md, and a latch is exactly how it gets
 * broken.
 */
function buildThermalTicks(targets: readonly TickTarget[]): (frame: Frame) => void {
  const rest = targets.map((target) => target.object.position.clone());

  return (frame: Frame): void => {
    const phase = orbitalPhase(frame);
    const sinceEntry = (wrapTwoPi(phase - UMBRAL_ENTRY) / TAU) * REVOLUTION_SECONDS;
    const sinceExit = (wrapTwoPi(phase - UMBRAL_EXIT) / TAU) * REVOLUTION_SECONDS;
    const sinceCrossing = Math.min(sinceEntry, sinceExit);

    targets.forEach((target, index) => {
      const home = rest[index];
      if (!home) return;
      const displacement = target.amplitude * snapAt(sinceCrossing - target.offset);
      target.object.position.copy(home).addScaledVector(target.axis, displacement);
    });
  };
}

// --------------------------------------------------------------------------
// Outboard structure, seen through the bay
// --------------------------------------------------------------------------

/**
 * Where the array wing is bolted to the pressure vessel.
 *
 * Expressed as a hull bearing rather than as a typed triple, and with the
 * truss's own half-width as a NEGATIVE inset so the structure stands outboard
 * of the skin instead of inside it. The old root was a literal
 * `(0.35, 3.0, -0.99)`, which is 2.098 m from the module axis - 2 mm inside a
 * 2.1 m hull - and carried an 85 mm tube, so half the boom's cross-section was
 * buried in the wall. That is the whole reason the hardware read as pushed
 * through the module rather than mounted on it. The handrails in this same file
 * already knew better (RAIL_STANDOFF); the outboard structure simply never got
 * the same treatment.
 */
const BOOM_THETA = -28 * DEG;
const BOOM_STATION_X = 0.35;
/** Circumradius of the truss's triangular section, metres. */
const TRUSS_R = 0.15;
/** Longeron and bracing tube radii. */
const CHORD_R = 0.026;
const BRACE_R = 0.015;
/** Roughly square bays; the eye reads a truss by its repeat. */
const BAY_M = 0.44;

const BOOM_ROOT = hullPoint(BOOM_STATION_X, BOOM_THETA, -(TRUSS_R + 0.08));
const BOOM_KNEE = new THREE.Vector3(BOOM_STATION_X, 3.35, -2.3);
const BOOM_TIP = new THREE.Vector3(BOOM_STATION_X, 3.35, -4.05);
const PANEL_SPAN = 5.6;
const PANEL_WIDTH = 2.4;

/** Solar cells across the panel's width and along its span. */
const CELLS_ACROSS = 5;
const CELLS_ALONG = 12;
/** Gap between cells, metres. The substrate shows through as a dark grid. */
const CELL_GAP = 0.035;

/**
 * A three-chord truss between two points.
 *
 * The boom used to be one 85 mm tube with a pair of diagonal struts, which from
 * inside the bay is a grey stick - no repeat, no depth, nothing that says the
 * thing carries a load. A truss costs about twelve hundred triangles and is the
 * single largest legibility win available out there, because its repeat is what
 * gives the eye a scale reference against Earth behind it. Real orbital
 * structure looks like this for the same reason it is built like this.
 */
function trussRun(from: THREE.Vector3, to: THREE.Vector3): THREE.BufferGeometry[] {
  const axis = new THREE.Vector3().subVectors(to, from);
  const length = axis.length();
  if (length < 1e-4) return [];
  axis.divideScalar(length);

  // A stable section basis. The reference is the module's long axis, which is
  // never parallel to a boom run here, so both runs of the knee get very nearly
  // the same roll and the truss does not visibly twist at the joint.
  const reference = new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(axis, reference);
  if (u.lengthSq() < 1e-6) u.crossVectors(axis, new THREE.Vector3(0, 1, 0));
  u.normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();

  const bays = Math.max(2, Math.round(length / BAY_M));
  const corner = (station: number, k: number): THREE.Vector3 => {
    const angle = (k * 2 * Math.PI) / 3;
    return from
      .clone()
      .addScaledVector(axis, (length * station) / bays)
      .addScaledVector(u, TRUSS_R * Math.cos(angle))
      .addScaledVector(v, TRUSS_R * Math.sin(angle));
  };

  const parts: THREE.BufferGeometry[] = [];
  for (let bay = 0; bay < bays; bay += 1) {
    for (let k = 0; k < 3; k += 1) {
      const next = (k + 1) % 3;
      // Longerons run the whole length; battens close each bay; diagonals
      // alternate hand bay to bay, which is what makes a truss read as braced
      // rather than as a ladder.
      parts.push(tubeBetween(corner(bay, k), corner(bay + 1, k), CHORD_R, 5));
      parts.push(tubeBetween(corner(bay + 1, k), corner(bay + 1, next), BRACE_R, 4));
      const twist = bay % 2 === 0;
      parts.push(
        tubeBetween(corner(bay, k), corner(bay + 1, twist ? next : (k + 2) % 3), BRACE_R, 4)
      );
    }
  }
  // Close the root end so the truss has a face where it meets its mount.
  for (let k = 0; k < 3; k += 1) {
    parts.push(tubeBetween(corner(0, k), corner(0, (k + 1) % 3), BRACE_R, 4));
  }
  return parts;
}

/**
 * A bolted foot on the pressure shell: a plate on the skin and a raised boss.
 *
 * Structure does not emerge from a wall. It lands on a fitting that spreads its
 * load, and putting one there is most of the difference between "mounted" and
 * "clipped through". The plate's inner face sits exactly on the skin, so it
 * seals the joint rather than opening a new one.
 */
function hullFoot(x: number, theta: number, plate: number, boss: number): THREE.BufferGeometry[] {
  const skin = hullPoint(x, theta, 0);
  const outward = hullInward(theta).multiplyScalar(-1);
  const base = skin.clone().addScaledVector(outward, -0.01);
  return [
    tubeBetween(base, skin.clone().addScaledVector(outward, 0.035), plate, 8),
    tubeBetween(
      skin.clone().addScaledVector(outward, 0.03),
      skin.clone().addScaledVector(outward, 0.1),
      boss,
      8
    ),
  ];
}
/**
 * How much of the revolution the feather takes: 34 degrees of phase into
 * sunset, 40 back out of sunrise, which is 26 and 31 seconds of wall time at
 * 20x. Wide enough that the wing never slews faster than about five times its
 * tracking rate - a gimbal that whips round to park reads as a mechanism
 * failing, and DIRECTION.md's camera law is the same instinct about anything
 * the eye follows.
 */
const FEATHER_LEAD = 34 * DEG;
const FEATHER_TRAIL = 40 * DEG;

/**
 * The array wing on its boom, at metre scale in the interior scene so it
 * occludes Earth through the bay the way real structure does.
 *
 * The outboard run of the boom is deliberately parallel to +Z, because the sun
 * revolves about +Z once per revolution in this frame - so a single gimbal on
 * that axis tracks it exactly, and `rotation.z = phase` is not an
 * approximation of the tracking, it is the tracking. That is the corrected
 * frame from docs/ENVIRONMENTS.md made visible: if the sun ever appeared to
 * turn about the module's long axis instead, this wing would be pointing the
 * wrong way all day.
 *
 * At sunset it eases off the sun and feathers to park - panel plane edge-on to
 * the ram vector, which is night glider attitude and the reason the wing is
 * still rather than tracking through eclipse.
 */
function buildArrayWing(palette: Palette): Moving {
  const group = new THREE.Group();
  group.name = 'array-wing';

  group.add(
    meshOf(
      merge([
        ...hullFoot(BOOM_STATION_X, BOOM_THETA, TRUSS_R + 0.09, TRUSS_R + 0.03),
        ...trussRun(BOOM_ROOT, BOOM_KNEE),
        ...trussRun(BOOM_KNEE, BOOM_TIP),
      ]),
      palette(PALETTE.HULL),
      'array-boom'
    )
  );

  const gimbal = new THREE.Group();
  gimbal.name = 'array-gimbal';
  gimbal.position.copy(BOOM_TIP);
  group.add(gimbal);

  const drum = new THREE.CylinderGeometry(0.16, 0.16, 0.24, 8, 1);
  drum.rotateX(Math.PI / 2);
  const spar = tubeBetween(
    new THREE.Vector3(0, 0, -0.12),
    new THREE.Vector3(0, 0, -PANEL_SPAN - 0.35),
    0.05,
    6
  );
  gimbal.add(meshOf(merge([drum, spar]), palette(PALETTE.HULL), 'array-gimbal-drum'));

  // The panels. Two 2.4 x 5.6 m wings, each a substrate carrying a grid of
  // cells rather than the single flat box they used to be.
  //
  // That box was 12 triangles of one flat colour spanning five and a half
  // metres of frame, and at that size a dead surface reads as unfinished
  // whatever colour it is - there is nothing in it to tell the eye how big it
  // is or how far away. The grid is the fix: a repeat at a known pitch is a
  // scale reference, and the substrate showing through the gaps gives every
  // cell an edge. The cells are split across three values so the wing breaks
  // up under a raking sun the way the hull's own facets do.
  const substrate: THREE.BufferGeometry[] = [];
  const cells: THREE.BufferGeometry[][] = [[], [], []];
  const cellW = (PANEL_WIDTH - CELL_GAP) / CELLS_ACROSS - CELL_GAP;
  const cellD = (PANEL_SPAN - CELL_GAP) / CELLS_ALONG - CELL_GAP;

  for (const side of [-1, 1]) {
    const cx = side * (PANEL_WIDTH / 2 + 0.06);
    const cz = -PANEL_SPAN / 2 - 0.3;
    substrate.push(boxAt(PANEL_WIDTH, 0.022, PANEL_SPAN, cx, 0, cz));
    // A spine down the back and a batten at each end: the panel is carried by
    // something, and from the shaded side that structure is all there is to see.
    substrate.push(boxAt(0.07, 0.05, PANEL_SPAN, cx, -0.03, cz));
    for (const end of [-1, 1]) {
      substrate.push(boxAt(PANEL_WIDTH, 0.045, 0.07, cx, -0.028, cz + (end * PANEL_SPAN) / 2));
    }

    for (let i = 0; i < CELLS_ACROSS; i += 1) {
      for (let j = 0; j < CELLS_ALONG; j += 1) {
        const x = cx - PANEL_WIDTH / 2 + CELL_GAP + cellW / 2 + i * (cellW + CELL_GAP);
        const z = cz - PANEL_SPAN / 2 + CELL_GAP + cellD / 2 + j * (cellD + CELL_GAP);
        // Which of the three values a cell takes, from its own coordinates, so
        // the pattern is fixed and the shot harness renders it identically.
        const shade = (i * 7 + j * 3) % 3;
        cells[shade]?.push(boxAt(cellW, 0.008, cellD, x, 0.014, z));
      }
    }
  }

  gimbal.add(meshOf(merge(substrate), palette(PALETTE.HULL_SHADOW), 'array-substrate'));
  const ARRAY_VALUES = [PALETTE.ARRAY, '#36455F', '#283551'];
  cells.forEach((group_, index) => {
    if (group_.length === 0) return;
    gimbal.add(
      meshOf(merge(group_), palette(ARRAY_VALUES[index] ?? PALETTE.ARRAY), `array-cells-${index}`)
    );
  });

  return {
    object: group,
    update(frame) {
      const phase = orbitalPhase(frame);
      // Park is the feather nearest the eclipse, so the wing barely moves to
      // reach it and barely moves to leave.
      let feather = 0;
      if (phase >= UMBRAL_ENTRY && phase <= UMBRAL_EXIT) {
        feather = 1;
      } else if (phase > UMBRAL_ENTRY - FEATHER_LEAD && phase < UMBRAL_ENTRY) {
        feather = THREE.MathUtils.smoothstep(phase, UMBRAL_ENTRY - FEATHER_LEAD, UMBRAL_ENTRY);
      } else if (phase > UMBRAL_EXIT && phase < UMBRAL_EXIT + FEATHER_TRAIL) {
        feather = 1 - THREE.MathUtils.smoothstep(phase, UMBRAL_EXIT, UMBRAL_EXIT + FEATHER_TRAIL);
      }
      gimbal.rotation.z = THREE.MathUtils.lerp(phase, Math.PI, feather);
    },
  };
}

/**
 * A radiator further aft, its white face turned to nadir. Radiators point away
 * from the sun because that is the whole job, which also keeps the brightest
 * surface out there off the sun's full value.
 */
function buildRadiator(palette: Palette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'radiator';

  // Low and well aft, so it sits in the corner of the bay's view rather than
  // across the middle of it: DIRECTION.md wants Earth holding 30-40% of the
  // frame, and that law does not stop applying because the frame is a window.
  const centre = new THREE.Vector3(-2.05, 0.95, -4.6);
  const STRUT_R = 0.07;
  const RADIATOR_THETA = -95 * DEG;

  // The strut stands OFF the skin by its own radius. It used to be seated at
  // inset 0 - its centreline exactly on the 2.1 m hull - so 70 mm of tube lay
  // inside the pressure vessel and 70 mm outside, which is the clearest case in
  // the room of a part pushed through a wall rather than bolted to it.
  group.add(
    meshOf(
      merge([
        ...hullFoot(-1.7, RADIATOR_THETA, STRUT_R + 0.07, STRUT_R + 0.02),
        tubeBetween(
          hullPoint(-1.7, RADIATOR_THETA, -STRUT_R),
          new THREE.Vector3(-2.0, 1.0, -3.8),
          STRUT_R,
          6
        ),
        // A yoke where the strut meets the panel, so the two are joined by a
        // fitting rather than by coincidence.
        tubeBetween(
          new THREE.Vector3(centre.x - 0.5, centre.y + 0.06, centre.z + 0.5),
          new THREE.Vector3(centre.x + 0.5, centre.y + 0.06, centre.z + 0.5),
          0.045,
          6
        ),
        boxAt(1.8, 0.07, 1.2, centre.x, centre.y, centre.z),
      ]),
      palette(PALETTE.HULL_SHADOW),
      'radiator-structure'
    )
  );
  group.add(
    meshOf(
      merge([boxAt(1.7, 0.014, 1.1, centre.x, centre.y - 0.042, centre.z)]),
      palette(PALETTE.CLOUD),
      'radiator-face'
    )
  );

  // Flow tubes across the face. A radiator rejects heat through a manifold of
  // them, and they are also the only thing giving the brightest surface out
  // there any internal edge - a 1.7 m unbroken CLOUD rectangle against Earth is
  // a hole in the frame, not a panel.
  const ribs: THREE.BufferGeometry[] = [];
  const RIBS = 9;
  for (let i = 0; i < RIBS; i += 1) {
    const z = centre.z - 0.5 + (i * 1.0) / (RIBS - 1);
    ribs.push(boxAt(1.66, 0.01, 0.028, centre.x, centre.y - 0.052, z));
  }
  // And a header at each end, which is what the tubes actually run between.
  // Dropped 3 mm below where it reads naturally: at y - 0.05 the header's top
  // face landed in exactly the plane of the panel's own top face, both pointing
  // up, and 0.10 m2 of the brightest surface out there shimmered.
  for (const end of [-1, 1]) {
    ribs.push(boxAt(1.7, 0.03, 0.06, centre.x, centre.y - 0.053, centre.z + end * 0.55));
  }
  group.add(meshOf(merge(ribs), palette(PALETTE.HULL_SHADOW), 'radiator-tubes'));

  return group;
}

/*
 * THE BAY SHUTTER IS GONE, AND SHOULD STAY GONE.
 *
 * There used to be a sun shutter here, hinged on the cupola and parked clear of
 * the aperture. It failed for a reason no amount of modelling could fix: the
 * panes are HOLES, not glass. The room's second pass draws the exterior through
 * the aperture rectangle, so there is no surface at the window - and hardware
 * hinged onto nothing read as an object stuck to the middle of the view, with
 * the sky visible straight through the place it was supposed to be attached.
 *
 * Anything mounted ON the cupola has the same problem. Put outboard hardware
 * where the hull actually is, and leave the window as a window.
 *
 * It was also the only FOIL in the room, which mattered to the accent gate: lit
 * MLI closes to about 39 in RGB distance from the single accent, against a
 * ceiling of 25, and the margin was the NIGHT_SIDE emissive floor plus its small
 * area rather than the pigment. Removing it removes that whole risk.
 */

/**
 * A box seated flat on the pressure shell.
 *
 * `width` runs along the module axis, `height` around the hull's arc, and
 * `depth` inward off the skin - which is what anyone placing a panel or a bag
 * actually means, and is not what you get from aiming +Z at the inward normal
 * and hoping. `setFromUnitVectors` picks the shortest rotation between two
 * vectors, which fixes one axis and leaves the ROLL about it arbitrary; boxes
 * placed that way came out spun to a different angle at every station, so a row
 * of identical bags read as a row of different objects.
 */
function boxOnHull(
  x: number,
  theta: number,
  inset: number,
  width: number,
  height: number,
  depth: number,
  slideAlongArc = 0
): THREE.BufferGeometry {
  const inward = hullInward(theta);
  const axis = new THREE.Vector3(1, 0, 0);
  // inward x axis is tangent to the hull and perpendicular to the module's
  // length, and (axis, tangent, inward) is right-handed in that order.
  const tangent = new THREE.Vector3().crossVectors(inward, axis).normalize();
  const seat = hullPoint(x, theta, inset).addScaledVector(tangent, slideAlongArc);

  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(axis, tangent, inward).setPosition(seat));
  return geometry;
}

/**
 * Stowage, cable runs and closeout panels: the clutter, and its reason.
 *
 * NASA's own explanation for why the real ISS looks the way it does is worth
 * copying exactly, because it is a rule rather than a texture. Crews run new
 * cable along the OUTSIDE of a wall instead of opening the rack behind it,
 * because opening a rack means safety and thermal recertification. They cannot
 * cut a cable short, because it might be needed somewhere else later, so the
 * slack is coiled and left. And they are task-focused rather than tidy.
 *
 * So none of this is scattered to look busy. Every run here is a later addition
 * to a finished wall, taped down at intervals, with its spare length coiled at
 * the end - and the closeout panels it crosses are exactly the ones nobody
 * wanted to reopen. Clutter that obeys a rule reads as history; clutter that
 * does not reads as set dressing, and the eye can tell the difference long
 * before it can say why.
 */
function buildStowage(palette: Palette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stowage';

  // --- Closeout panels along the starboard flank, below the standoff. Flat,
  // fastened at the corners, and deliberately dull: they are what the cable
  // runs are avoiding.
  const panels: THREE.BufferGeometry[] = [];
  const studs: THREE.BufferGeometry[] = [];
  // 112 degrees off zenith: the starboard flank below every other fitting and
  // above the deck-corner standoff, which is the band a real module closes out.
  const PANEL_THETA = 112 * DEG;
  for (const station of [-2.35, -1.15, 0.05, 1.25, 2.45]) {
    panels.push(boxOnHull(station, PANEL_THETA, 0.035, 1.1, 0.62, 0.03));
    for (const dx of [-0.48, 0.48]) {
      for (const dy of [-0.25, 0.25]) {
        studs.push(boxOnHull(station + dx, PANEL_THETA, 0.052, 0.03, 0.03, 0.022, dy));
      }
    }
  }
  group.add(meshOf(merge(panels), palette(PALETTE.HULL), 'closeout-panels'));
  group.add(meshOf(merge(studs), palette(PALETTE.HULL_SHADOW), 'closeout-fasteners'));

  // --- A cable run that was clearly added after the wall was finished: it
  // crosses the panels at an angle no installer would have chosen, is taped
  // down at intervals, and ends in a coil of the length nobody was allowed to
  // cut off.
  const runs: THREE.BufferGeometry[] = [];
  const tapes: THREE.BufferGeometry[] = [];
  // Gentle bends, not a lightning bolt. The first cut alternated the bearing by
  // nine degrees a station, which over a 1.2 m span is a zigzag no installer
  // would produce - a cable pulled by hand sags and wanders, it does not
  // switchback.
  const via = [-2.9, -1.7, -0.4, 0.9, 2.2, 2.95].map((x, i) =>
    hullPoint(x, (109 + (i % 2) * 3.5) * DEG, 0.055)
  );
  for (let i = 0; i + 1 < via.length; i += 1) {
    const a = via[i];
    const b = via[i + 1];
    if (a === undefined || b === undefined) continue;
    runs.push(tubeBetween(a, b, 0.016, 5));
    runs.push(tubeBetween(a, b, 0.011, 5));
    // A tape wrap at each tie-down.
    tapes.push(tubeBetween(a.clone().lerp(b, 0.42), a.clone().lerp(b, 0.5), 0.026, 6));
  }
  // The service coil, at the forward end. Four turns, drawn as a flat spiral
  // standing off the wall, which is what a taped-up loop of spare cable is.
  const coilCentre = hullPoint(2.98, 114 * DEG, 0.17);
  const coilNormal = hullInward(114 * DEG);
  const coilRight = new THREE.Vector3(1, 0, 0);
  const coilUp = new THREE.Vector3().crossVectors(coilNormal, coilRight).normalize();
  const TURNS = 3.4;
  const STEPS = 40;
  let previous: THREE.Vector3 | null = null;
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const angle = t * TURNS * Math.PI * 2;
    const radius = 0.075 + t * 0.052;
    const point = coilCentre
      .clone()
      .addScaledVector(coilRight, Math.cos(angle) * radius)
      .addScaledVector(coilUp, Math.sin(angle) * radius)
      .addScaledVector(coilNormal, -t * 0.02);
    if (previous !== null) runs.push(tubeBetween(previous, point, 0.011, 4));
    previous = point;
  }
  group.add(meshOf(merge(runs), palette(PALETTE.ARRAY), 'added-cable-run'));
  group.add(meshOf(merge(tapes), palette(PALETTE.CLOUD), 'cable-tie-downs'));

  // --- Stowage bags, bungeed to the port standoff. Soft goods are the single
  // most characteristic object on a real station and the room had none: every
  // loose item aboard lives in one, restrained, because a loose item in
  // microgravity is a loose item in the fan.
  const bags: THREE.BufferGeometry[] = [];
  const straps: THREE.BufferGeometry[] = [];
  const BAGS = [
    { x: -2.2, w: 0.5, h: 0.34, d: 0.28 },
    { x: -1.62, w: 0.42, h: 0.3, d: 0.26 },
    { x: 1.05, w: 0.54, h: 0.36, d: 0.3 },
    { x: 1.68, w: 0.38, h: 0.28, d: 0.24 },
  ] as const;
  // -108 degrees: the port flank, clear of the cupola above it. The first cut
  // put these at -128, which is PAST where the hull meets the deck (123.2), so
  // every bag was buried halfway through the floor.
  const BAG_THETA = -108 * DEG;
  for (const bag of BAGS) {
    bags.push(boxOnHull(bag.x, BAG_THETA, 0.14, bag.w, bag.h, bag.d));
    // Two bungees over each bag, standing proud of the fabric and wrapping
    // slightly further round it than the bag is deep.
    for (const offset of [-bag.w * 0.26, bag.w * 0.26]) {
      straps.push(boxOnHull(bag.x + offset, BAG_THETA, 0.14, 0.035, bag.h + 0.05, bag.d + 0.045));
    }
  }
  group.add(meshOf(merge(bags), palette(PALETTE.ARID), 'stowage-bags'));
  group.add(meshOf(merge(straps), palette(PALETTE.HULL_SHADOW), 'stowage-bungees'));

  return group;
}

/**
 * The robot's own corner: a charging cradle and a rack of spare couplings.
 *
 * The player is a station robot whose limbs are stacks of magnetic couplings
 * (env/player/arm.ts), and until now nothing in the room knew that. These two
 * fittings say it without a word of text: a dock with a mating face the exact
 * size of the limb's, and a rack of the segments it is made of, waiting. It is
 * the cheapest characterisation available - the player recognises their own
 * hand on the shelf.
 */
function buildRobotBay(palette: Palette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'robot-bay';

  // 100 degrees is hip height on the starboard flank - clear of the deck-corner
  // standoff, which 118 sat right on top of.
  const DOCK_THETA = 100 * DEG;
  const seat = hullPoint(-2.85, DOCK_THETA, 0.02);
  const inward = hullInward(DOCK_THETA);
  const up = new THREE.Vector3().crossVectors(inward, new THREE.Vector3(1, 0, 0)).normalize();

  // The cradle: a backplate, a pair of shoulders, and the mating face.
  const arms: THREE.BufferGeometry[] = [boxOnHull(-2.85, DOCK_THETA, 0.02, 0.46, 0.5, 0.04)];
  for (const side of [-1, 1]) {
    const a = seat
      .clone()
      .addScaledVector(inward, 0.03)
      .addScaledVector(up, side * 0.17);
    const b = a.clone().addScaledVector(inward, 0.16);
    arms.push(tubeBetween(a, b, 0.022, 6));
  }
  group.add(meshOf(merge(arms), palette(PALETTE.HULL_SHADOW), 'dock-cradle'));

  // The mating face, in the same MINT the limb's own couplings carry. Same
  // colour, same job: this is where the robot's back plugs in.
  const faceCentre = seat.clone().addScaledVector(inward, 0.15);
  const face = tubeBetween(
    faceCentre.clone().addScaledVector(inward, -0.012),
    faceCentre.clone().addScaledVector(inward, 0.012),
    0.062,
    8
  );
  group.add(meshOf(merge([face]), palette(PALETTE.MINT), 'dock-coupling'));

  // The spares rack: five limb segments in clips, tapering the way the limb
  // does, so the row reads as a set rather than as five pipes.
  const spares: THREE.BufferGeometry[] = [];
  const clips: THREE.BufferGeometry[] = [];
  const RACK_THETA = 86 * DEG;
  /**
   * Seat depths, and the arithmetic that stops this floating.
   *
   * `hullPoint(x, theta, inset)` returns a point at radius 2.1 - inset, so an
   * inset is measured to a part's CENTRE, not to its back face. The first cut
   * seated the backing plate at 0.055 with a thickness of 0.022, which put its
   * back face 44 mm clear of the skin and hung the whole rack in mid-air off
   * the wall - visible from across the deck the moment anything lit it.
   *
   * Half the plate's own thickness is the inset that lands its back exactly on
   * the skin. Each segment then sits ON that plate, so its inset is the plate's
   * full thickness plus its own radius - and because the segments taper, that
   * is per segment rather than one number for the row.
   */
  const PLATE_T = 0.022;
  const rackInward = hullInward(RACK_THETA);
  const rackUp = new THREE.Vector3()
    .crossVectors(rackInward, new THREE.Vector3(1, 0, 0))
    .normalize();
  for (let i = 0; i < 5; i += 1) {
    const radius = 0.046 - i * 0.004;
    const offset = (i - 2) * 0.105;
    const base = hullPoint(-2.85, RACK_THETA, PLATE_T + radius).addScaledVector(rackUp, offset);
    const a = base.clone().addScaledVector(new THREE.Vector3(1, 0, 0), -0.16);
    const b = base.clone().addScaledVector(new THREE.Vector3(1, 0, 0), 0.16);
    spares.push(tubeBetween(a, b, radius, 8));
    // Saddle clips, reaching from just proud of the segment back to the plate,
    // so the segment is visibly held rather than resting on nothing.
    for (const end of [-0.11, 0.11]) {
      const c = base.clone().addScaledVector(new THREE.Vector3(1, 0, 0), end);
      clips.push(
        tubeBetween(
          c.clone().addScaledVector(rackInward, radius * 0.6),
          c.clone().addScaledVector(rackInward, -(radius + PLATE_T * 0.5)),
          0.014,
          5
        )
      );
    }
  }
  // The backing plate, seated flush: inset = half its thickness.
  clips.push(boxOnHull(-2.85, RACK_THETA, PLATE_T / 2, 0.38, 0.62, PLATE_T));
  group.add(meshOf(merge(spares), palette(PALETTE.HULL), 'limb-spares'));
  group.add(meshOf(merge(clips), palette(PALETTE.HULL_SHADOW), 'spares-clips'));

  return group;
}

// --------------------------------------------------------------------------
// Assembly
// --------------------------------------------------------------------------

/**
 * Every fixture in THE LIMB DECK, static and moving, under one root the shell
 * can adopt. The returned handle is pure: update() is a function of the Frame
 * and nothing else, and calling it twice with the same Frame leaves the room
 * in exactly the same pose.
 */
export function buildFixtures(): Animated {
  const root = new THREE.Group();
  root.name = 'limb-deck-fixtures';

  const cache = new Map<string, THREE.MeshLambertMaterial>();
  const palette = makePalette(cache);
  const updaters: ((frame: Frame) => void)[] = [];

  const adopt = (moving: Moving): THREE.Object3D => {
    updaters.push((frame) => moving.update(frame));
    return moving.object;
  };

  root.add(buildHandrails(palette));

  const perch = buildPerch(palette);
  root.add(perch);
  root.add(buildFootRestraint(palette));

  root.add(buildDuct(palette));
  root.add(buildGrilleVanes(palette));
  root.add(adopt(buildImpeller(palette)));

  const conduits = buildConduits(palette);
  root.add(conduits.group);

  root.add(buildStowage(palette));
  root.add(buildRobotBay(palette));

  root.add(buildNamePlacard(palette));
  root.add(buildDeckStencil(palette));
  root.add(adopt(buildDial(palette)));

  root.add(adopt(buildTelltale(palette)));
  root.add(adopt(buildStylus(palette)));

  const outboard = new THREE.Group();
  outboard.name = 'outboard-structure';
  outboard.add(adopt(buildArrayWing(palette)));
  const radiator = buildRadiator(palette);
  outboard.add(radiator);
  root.add(outboard);

  // Secondary structure lags the shell across the terminator, so the pieces
  // that tick are the ones hung off it on clamps, hinges and booms - never the
  // pressure vessel itself.
  updaters.push(
    buildThermalTicks([
      {
        object: conduits.bundle,
        axis: new THREE.Vector3(0, 0, 1),
        amplitude: 0.006,
        offset: TICK_OFFSETS[0],
      },
      {
        object: perch,
        axis: new THREE.Vector3(0, 1, 0),
        amplitude: 0.004,
        offset: TICK_OFFSETS[1],
      },
      {
        object: radiator,
        axis: new THREE.Vector3(1, 0, 0),
        amplitude: 0.008,
        offset: TICK_OFFSETS[2],
      },
    ])
  );

  return {
    root,
    update(frame: Frame) {
      for (const updater of updaters) updater(frame);
    },
    dispose() {
      disposeTree(root);
      cache.clear();
    },
  };
}
