/**
 * THE LIMB DECK - the interior light rig and the analytic light shaft.
 *
 * The room is lit through a hole and nothing else, so the rig is built the way
 * the hole works rather than the way a three-point setup does:
 *
 *   shafts       the direct beam. Every pane of the cupola is projected along
 *                the sun vector, vignetted by the cupola's own throat, and
 *                clipped onto whatever it lands on. Several panes admit at
 *                once - the dome's own mullions are the dark bands between the
 *                patches - and the patches walk the aft bulkhead down, the
 *                length of the deck, and the forward bulkhead up.
 *   sun          the forward-scattered part of that beam, as a directional so
 *                it rakes: one sun vector re-values all 384 hull facets. Its
 *                level is tied to the aperture area the cupola actually admits,
 *                so it cannot be brighter than the geometry allows.
 *   bounce       a point source standing on the patches themselves. The deck is
 *                the brightest surface in the room whenever the beam is on it,
 *                and the ceiling is lit by what the deck throws back - which is
 *                the only thing that puts light on the arc overhead, because a
 *                window low in the port hull cannot. It moves with the beam, so
 *                the arc of stepped facets overhead moves too.
 *   earthshine   a DIRECTIONAL entering through the cupola's lower faces,
 *                coloured by the ground actually below. Deliberately not a
 *                hemisphere: a hemisphere hands every facet the same term and
 *                the 384 flat-shaded hull facets collapse to one dead value,
 *                which is the single most likely way this room reads as a grey
 *                tube instead of a place.
 *   lamps        eight sources sampling the four standoff troughs. They carry
 *                eclipse, so they are shaped rather than flat: four bright
 *                longitudinal lines with real falloff between them.
 *   night floor  a palette backstop; see the comment where it is built.
 *
 * There are no shadow maps anywhere in this environment (docs/ENVIRONMENTS.md,
 * non-negotiable 2). CI rasterises in software, where a one-ULP depth
 * difference flips a whole flat facet's shadow state and the pixel-diff gate
 * cannot absorb the delta. The shaft is analytic instead - every vertex is an
 * exact ray-plane intersection - which is also hard-edged, and a hard edge is
 * truer to flat-shaded art than a soft PCF one.
 *
 * Everything here is a pure function of the Frame. No clock is read, nothing
 * accumulates, and the one cache is keyed on quantised time so the same Frame
 * always produces the same room.
 */
import * as THREE from 'three';
import { albedoAt } from '../../render/earth';
import { EARTHSHINE_GROUND, PALETTE, SUN_COLOUR } from '../../render/palette';
import type { Aperture, Frame, LightingHandle } from './contract';

// --- The shell, read a second time -----------------------------------------
// shell.ts owns this geometry. The rig needs the room's shape to land the
// shaft on it, and both read the same numbers out of docs/ENVIRONMENTS.md.

const HULL_RADIUS = 2.1;
const HULL_AXIS_Y = 1.15;
/** 24 circumferential by 16 axial is the shell's 384 quads. */
const HULL_SEGMENTS = 24;
const BULKHEAD_X = 3.2;
/** Beyond this angle from zenith the shell paints HULL_SHADOW, not HULL. */
const STANDOFF_ARC = THREE.MathUtils.degToRad(45);

// --- Levels -----------------------------------------------------------------

/**
 * The interior sun.
 *
 * Physically the only direct sunlight inside a sealed module falls inside the
 * shafts, and the shafts carry that term themselves. What this light carries is
 * the part of it that scatters forward off the patches and the cupola's own
 * frames, which keeps following the sun and so keeps re-valuing all 384 hull
 * facets as the sun walks. It is scaled by ADMISSION below, so it is a function
 * of how much aperture is actually facing the sun rather than a constant that
 * happens to fade with the terminator.
 *
 * Level chosen by measurement between two walls. Push it down and the sunlit
 * pass and eclipse render as the same room. Push it up and the deck-corner lamp
 * diffusers clip to 255: they are CLOUD carrying emissive 0.55 and they stand
 * nearly face-on to the sun at local noon, and since there are no shadows
 * indoors this light reaches them as though the hull were not there.
 */
const SUN_PEAK = 2.8;
const SUN_DISTANCE = 24;
/**
 * Admitted aperture area, in square metres, that counts as the cupola wide
 * open. Measured over a revolution the seven panes pass 0.90 to 1.37 m2 of
 * sun-facing aperture through their own throat, so this normalises the sun and
 * the bounce to something the geometry produced rather than to a constant.
 */
const REFERENCE_ADMISSION = 1.4;
/** How far the sun term is allowed to fall when the cupola is nearly shut. */
const ADMISSION_FLOOR = 0.35;

/**
 * The direct beam, carried by the shaft mesh rather than by a light.
 *
 * Sized so a facet inside a shaft renders at roughly its own albedo - a lit
 * deck panel looks like HULL_SHADOW, not like a white rectangle.
 */
const SHAFT_DIRECT = 4.2;
/**
 * Ceiling on what one shaft facet may add.
 *
 * The shaft blends additively and the framebuffer holds sRGB-encoded values,
 * so the blend is not a linear sum: a bright receiver plus a bright beam can
 * run away. This bounds the beam so it can never clip to white, which is the
 * only way a hard-edged analytic patch could read as bloom. A guard, not a
 * shaper - measured over a full revolution the beam peaks at 0.197 and the
 * clamp never once fires, so it never distorts the beam's hue.
 */
const SHAFT_CEILING = 0.34;
/**
 * How far a patch is lifted off the surface it lands on.
 *
 * The deck carries a +/-3 mm fbm warp, so 10 mm clears it. The hull needs more:
 * these planes are a uniform 24-gon, but the shell snaps four of its grid lines
 * onto the cupola cut, which widens some facets and drops their chords inside a
 * uniform one. 22 mm is inside every chord that snap can produce and is a
 * hundredth of the hull radius, which is nothing to look at.
 */
const DECK_LIFT = 0.01;
const HULL_LIFT = 0.022;

/** Where DAWN_SAND sits along the extinction grade between SUN_COLOUR and FOIL. */
const GRADE_MID = 0.55;

/**
 * The deck bounce.
 *
 * A point source, because the patch is a patch: what makes the ceiling step in
 * an arc is that one end of the arc is two metres from the beam and the other
 * is four. A directional from the deck would hand the whole ceiling the same
 * term and undo the thing this light exists to do.
 */
const BOUNCE_PEAK = 1.18;
/**
 * How far off its own patch the bounce stands, along that surface's normal.
 *
 * A patch is most of a metre across, so sampling it as a point at its own
 * surface divides by a distance that goes to zero and blows the deck under the
 * beam to white. Standing off by about the patch's own size is what turns the
 * singularity into the broad throw a lit floor actually has, and it is why the
 * decay is 1 here and 2 on the lamps: an area this large is nowhere near a
 * point at the range the ceiling sits.
 */
const BOUNCE_STANDOFF = 0.7;

/**
 * Reflected daylight off the ground below, entering through the cupola's lower
 * faces. Held under the sun's own interior level: Earth fills most of what
 * those panes can see, but it returns a third of what falls on it.
 */
const EARTHSHINE_PEAK = 3.8;
/**
 * How far the ground below pulls earthshine off the palette's bounce colour.
 *
 * The cupola sees most of a hemisphere, not the pixel under the station, and
 * two thirds of that hemisphere is cloud - which is why DIRECTION.md's
 * earthshine term is a neutral sand and not the green the ground happens to be.
 * Tinting all the way to the terrain colour puts a lime wash on the ceiling,
 * and the stronger the earthshine level the less tint it takes to get there: at
 * this level 0.28 still visibly changes the room over a coastline and every
 * value stays in palette.
 */
const TERRAIN_TINT = 0.28;
/**
 * Airglow and city light over the night hemisphere.
 *
 * Small, but not nothing, and it is load-bearing: through eclipse it is the
 * only DIRECTIONAL term in the room, and a directional is the only thing that
 * hands the 384 hull facets a cosine to step along. Everything else left over
 * the terminator is point sources and an ambient floor, which together make
 * exactly the flat grey tube docs/ENVIRONMENTS.md says an interior dies of.
 * The colour it enters in is a cold slate off the night hemisphere, which is
 * what separates eclipse from the warm CLOUD of the lamps.
 */
const EARTHSHINE_NIGHT = 1.25;
/** Linear luma of ordinary terrain. Ocean and desert scale off it. */
const TYPICAL_GROUND_LUMA = 0.16;
/** Earthshine arrives from below, so it washes up and inboard off the lower
 *  faces. This is how much of the room's up it takes. */
const EARTHSHINE_UPLIFT = 0.5;
/** docs/ENVIRONMENTS.md: the ground colour is resampled at this cadence, never per frame. */
const EARTHSHINE_CADENCE_SECONDS = 0.25;
/**
 * The terrain field is smooth well below this, and quantising the sample point
 * keeps the cached colour identical wherever inside a cadence bucket a frame
 * happens to land - which is what makes the cache safe under a pinned clock
 * rather than a source of drift.
 */
const GROUND_QUANTISE = THREE.MathUtils.degToRad(0.5);

/**
 * The lamp troughs.
 *
 * Each trough is a diffuser strip running the full 6.4 m, which is a line
 * source, not a point. Two sources per trough, standing 0.80 m off the trough
 * face: a couple of samples cannot represent a 6.4 m strip from a centimetre
 * away whatever the exponent, and standing them off is what turns the
 * singularity at the panel into the broad wash a diffuser actually throws.
 *
 * Decay 2 rather than the inverse-first-power a line source would strictly
 * take. The lamps are what the room has left in eclipse, and eclipse has to
 * have relief in it: at decay 1 eight sources in a 2.1 m tube hand every facet
 * nearly the same term and the hull goes flat, which is the exact failure
 * docs/ENVIRONMENTS.md says an interior dies of. At decay 2 they read as four
 * bright longitudinal lines with the hull stepping away from each one.
 *
 * All four standoffs carry them. ENVIRONMENTS.md puts two of the channels on
 * the +/-135 degree radials, which on a shell truncated at 123.2 degrees is
 * not a point on the hull but the corner between the hull and the deck, and
 * that is where the shell chamfered them - so the lower pair is placed off
 * that corner rather than off a radial that leaves the pressurised volume.
 */
const LAMP_INTENSITY = 0.5;
const LAMP_ARC = THREE.MathUtils.degToRad(45);
/** How far each source stands off the face of its trough. */
const LAMP_STANDOFF = 0.8;
const LAMP_STATIONS = [-1.6, 1.6];

// --- Geometry budget --------------------------------------------------------

/** A convex polygon gains at most one vertex per clip. A hexagonal pane meets
 *  one downstream clip, six throat edges and 27 room faces. */
const MAX_POLYGON_VERTS = 64;
/** Headroom. Measured over a revolution the seven panes together never exceed
 *  37 triangles; they only need more than two each where a beam turns a corner
 *  of the room. */
const MAX_SHAFT_TRIANGLES = 512;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * One flat interior surface.
 *
 * The room is a convex polyhedron: a cylinder's interior, intersected with
 * y >= deck and a slab in x, with 24 chord planes standing in for the hull arc
 * the way the shell facets it. Convexity is what makes the shaft exact - a ray
 * leaves a convex body through precisely one face, so "this face, and inside
 * every other one" is a set of half-planes rather than a search.
 */
interface Face {
  /** Outward unit normal. The interior is where n . p <= d. */
  readonly n: THREE.Vector3;
  readonly d: number;
  /** What the shell painted here, in the working colour space. */
  readonly albedo: THREE.Color;
  /** Clearance between the shaft patch and this surface, metres. */
  readonly lift: number;
}

function buildRoomFaces(deckY: number): Face[] {
  const hullShadow = new THREE.Color(PALETTE.HULL_SHADOW);
  const hull = new THREE.Color(PALETTE.HULL);
  const faces: Face[] = [
    { n: new THREE.Vector3(0, -1, 0), d: -deckY, albedo: hullShadow, lift: DECK_LIFT },
    { n: new THREE.Vector3(-1, 0, 0), d: BULKHEAD_X, albedo: hullShadow, lift: DECK_LIFT },
    { n: new THREE.Vector3(1, 0, 0), d: BULKHEAD_X, albedo: hullShadow, lift: DECK_LIFT },
  ];

  // Only the portion of the cylinder above the deck exists, so the arc runs
  // from -halfSpan to +halfSpan about zenith, not a clean 180 degrees.
  const halfSpan = Math.acos(THREE.MathUtils.clamp((deckY - HULL_AXIS_Y) / HULL_RADIUS, -1, 1));
  const step = (2 * halfSpan) / HULL_SEGMENTS;
  // Each facet is a chord, so its plane stands this far off the axis, not R.
  const inset = HULL_RADIUS * Math.cos(step / 2);

  for (let i = 0; i < HULL_SEGMENTS; i += 1) {
    const theta = -halfSpan + (i + 0.5) * step;
    faces.push({
      n: new THREE.Vector3(0, Math.cos(theta), Math.sin(theta)),
      d: HULL_AXIS_Y * Math.cos(theta) + inset,
      albedo: Math.abs(theta) <= STANDOFF_ARC ? hull : hullShadow,
      lift: HULL_LIFT,
    });
  }

  return faces;
}

/**
 * Sutherland-Hodgman against one half-plane, c0 + c1 a + c2 b <= 0. Convex in,
 * convex out, so the clip chains over every face of the room.
 */
function clipHalfPlane(
  src: Float64Array,
  count: number,
  dst: Float64Array,
  c0: number,
  c1: number,
  c2: number
): number {
  let out = 0;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const ax = src[i * 2] ?? 0;
    const ay = src[i * 2 + 1] ?? 0;
    const bx = src[j * 2] ?? 0;
    const by = src[j * 2 + 1] ?? 0;
    const da = c0 + c1 * ax + c2 * ay;
    const db = c0 + c1 * bx + c2 * by;
    const aIn = da <= 0;
    const bIn = db <= 0;

    if (aIn) {
      dst[out * 2] = ax;
      dst[out * 2 + 1] = ay;
      out += 1;
    }
    if (aIn !== bIn) {
      const t = da / (da - db);
      dst[out * 2] = ax + (bx - ax) * t;
      dst[out * 2 + 1] = ay + (by - ay) * t;
      out += 1;
    }
    if (out > MAX_POLYGON_VERTS - 2) break;
  }
  return out;
}

/** Twice the signed area of a polygon held as interleaved (a, b) pairs. */
function polygonArea2(polygon: Float64Array, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    total +=
      (polygon[i * 2] ?? 0) * (polygon[j * 2 + 1] ?? 0) -
      (polygon[j * 2] ?? 0) * (polygon[i * 2 + 1] ?? 0);
  }
  return total;
}

/** A pane reduced to the two-dimensional problem the projection actually is. */
interface Pane {
  readonly origin: THREE.Vector3;
  readonly u: THREE.Vector3;
  readonly v: THREE.Vector3;
  readonly normal: THREE.Vector3;
  /** Outline in (u, v) metres about the origin, counter-clockwise. */
  readonly outline: Float64Array;
  readonly count: number;
}

function toPane(aperture: Aperture): Pane {
  const corners = aperture.corners;
  const first = corners[0];
  const second = corners[1];
  if (first === undefined || second === undefined) {
    throw new Error('limb deck: aperture needs at least three corners');
  }
  const normal = aperture.normal.clone().normalize();
  const origin = new THREE.Vector3();
  for (const corner of corners) origin.add(corner);
  origin.multiplyScalar(1 / corners.length);

  const u = new THREE.Vector3().subVectors(second, first).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  const outline = new Float64Array(corners.length * 2);
  const offset = new THREE.Vector3();
  for (let i = 0; i < corners.length; i += 1) {
    offset.subVectors(corners[i] ?? origin, origin);
    outline[i * 2] = offset.dot(u);
    outline[i * 2 + 1] = offset.dot(v);
  }
  // The clip runs on a counter-clockwise outline; the Aperture contract's
  // winding is about the room, not about this basis, so it is fixed here.
  if (polygonArea2(outline, corners.length) < 0) {
    const flipped = new Float64Array(outline.length);
    for (let i = 0; i < corners.length; i += 1) {
      const j = corners.length - 1 - i;
      flipped[i * 2] = outline[j * 2] ?? 0;
      flipped[i * 2 + 1] = outline[j * 2 + 1] ?? 0;
    }
    return { origin, u, v, normal, outline: flipped, count: corners.length };
  }
  return { origin, u, v, normal, outline, count: corners.length };
}

/** One edge of the throat, as the half-space a beam must stay inside. */
interface ThroatEdge {
  readonly n: THREE.Vector3;
  readonly d: number;
}

function throatEdges(throat: Aperture): ThroatEdge[] {
  const corners = throat.corners;
  const centre = throat.centre;
  const edges: ThroatEdge[] = [];
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (a === undefined || b === undefined) continue;
    const along = new THREE.Vector3().subVectors(b, a);
    const n = new THREE.Vector3().crossVectors(along, throat.normal).normalize();
    if (n.dot(new THREE.Vector3().subVectors(centre, a)) > 0) n.multiplyScalar(-1);
    edges.push({ n, d: n.dot(a) });
  }
  return edges;
}

export function buildLighting(
  apertures: readonly Aperture[],
  throat: Aperture,
  deckY: number
): LightingHandle {
  const root = new THREE.Group();
  root.name = 'limb-deck-lighting';

  if (apertures.length === 0) throw new Error('limb deck: cupola has no panes');
  const panes = apertures.map(toPane);
  const throatNormal = throat.normal.clone().normalize();
  const throatOffset = throatNormal.dot(throat.centre);
  const mouth = throatEdges(throat);

  // The lower faces of the cupola: the ones with a downward component, which
  // are the ones that can see Earth. Earthshine enters through these and
  // nowhere else, which is why it is a directional and not a hemisphere.
  const lowerFace = new THREE.Vector3();
  for (const pane of panes) {
    if (pane.normal.y < -0.2) lowerFace.addScaledVector(pane.normal, -pane.normal.y);
  }
  if (lowerFace.lengthSq() < 1e-9) lowerFace.copy(panes[0]?.normal ?? UP);
  lowerFace.normalize();

  const faces = buildRoomFaces(deckY);

  // --- Lights ---------------------------------------------------------------

  const sun = new THREE.DirectionalLight(new THREE.Color(SUN_COLOUR), SUN_PEAK);
  sun.name = 'deck-sun';
  sun.target.position.set(0, deckY, 0);
  root.add(sun, sun.target);

  const earthshine = new THREE.DirectionalLight(new THREE.Color(PALETTE.NIGHT_SIDE), 0);
  earthshine.name = 'deck-earthshine';
  // Up and inboard off the cupola's lower faces, so the wash lands on the
  // starboard hull and the ceiling while the port hull beside the dome stays
  // dark - which is what keeps the windows reading as holes, not panels.
  const earthshineTravel = new THREE.Vector3()
    .copy(lowerFace)
    .multiplyScalar(-1)
    .addScaledVector(UP, EARTHSHINE_UPLIFT)
    .normalize();
  earthshine.target.position.copy(throat.centre);
  earthshine.position.copy(throat.centre).addScaledVector(earthshineTravel, -8);
  root.add(earthshine, earthshine.target);

  const bounce = new THREE.PointLight(new THREE.Color(SUN_COLOUR), 0, 0, 1);
  bounce.name = 'deck-bounce';
  bounce.position.copy(throat.centre);
  root.add(bounce);

  const lampColour = new THREE.Color(PALETTE.CLOUD);
  const chordHalfZ = Math.sqrt(
    Math.max(0, HULL_RADIUS * HULL_RADIUS - (deckY - HULL_AXIS_Y) * (deckY - HULL_AXIS_Y))
  );
  const cos45 = Math.cos(LAMP_ARC);
  const sin45 = Math.sin(LAMP_ARC);
  for (const side of [-1, 1]) {
    // Overhead trough: on the hull at 45 degrees, standing off down the radial.
    const overheadY = HULL_AXIS_Y + HULL_RADIUS * cos45 - LAMP_STANDOFF * cos45;
    const overheadZ = side * (HULL_RADIUS * sin45 - LAMP_STANDOFF * sin45);
    // Corner trough: on the hull-to-deck corner, standing off up the 135 radial.
    const cornerY = deckY + LAMP_STANDOFF * cos45;
    const cornerZ = side * (chordHalfZ - LAMP_STANDOFF * sin45);

    for (const x of LAMP_STATIONS) {
      for (const [tag, y, z] of [
        ['high', overheadY, overheadZ] as const,
        ['low', cornerY, cornerZ] as const,
      ]) {
        const lamp = new THREE.PointLight(lampColour, LAMP_INTENSITY, 0, 2);
        lamp.position.set(x, y, z);
        lamp.name = `deck-lamp-${tag}-${side < 0 ? 'port' : 'stbd'}-${x < 0 ? 'aft' : 'fore'}`;
        root.add(lamp);
      }
    }
  }

  // Interior materials floor at NIGHT_SIDE with emissiveIntensity 1.0, not the
  // 0.62 earth.ts and satellite.ts use. Outdoors the ambient, hemisphere and
  // fill terms land on every facet; indoors an unlit facet has only its
  // emissive, and 0.62 renders at luma 18.7, under the palette gate's floor of
  // 25.45. At 1.0 it renders at 25.96 and clears. Those materials belong to
  // the shell and the fixtures; this light is only the backstop for whatever
  // they paint with a lighter albedo. Ambient multiplies albedo and so cannot
  // floor a palette by itself, which is exactly why the emissive term is where
  // the floor lives.
  const nightFloor = new THREE.AmbientLight(new THREE.Color(PALETTE.NIGHT_SIDE), 1);
  nightFloor.name = 'deck-night-floor';
  root.add(nightFloor);

  // --- The shaft ------------------------------------------------------------

  const shaftPositions = new Float32Array(MAX_SHAFT_TRIANGLES * 9);
  const shaftColours = new Float32Array(MAX_SHAFT_TRIANGLES * 9);
  const shaftGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(shaftPositions, 3);
  const colourAttribute = new THREE.BufferAttribute(shaftColours, 3);
  shaftGeometry.setAttribute('position', positionAttribute);
  shaftGeometry.setAttribute('color', colourAttribute);
  shaftGeometry.setDrawRange(0, 0);

  const shaftMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // The beam adds to what the surface already returns, so the deck's panel
    // seams and its fbm warp stay legible through it. An opaque patch would
    // paint over the very fracturing the raking light exists to reveal.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    // Lit once, and only once.
    //
    // SHAFT_CEILING bounds what one patch may add, but the framebuffer sums, so
    // where two panes' patches met along a shared edge the pair added twice and
    // laid a cyan-white hairline down the seam - a bright rim on a hard edge,
    // which is the one thing that would read as bloom in a project that bans
    // it. Rather than chase the seam geometrically, the stencil makes the
    // bound true per pixel: the first patch to cover a pixel takes it, every
    // later one fails the test. The exterior pass clears stencil with colour
    // and depth, so the buffer is zero when the interior draws.
    //
    // Exact integer state, so unlike a depth-based trick this cannot flip on
    // the software rasteriser CI renders with. If a renderer is built without a
    // stencil buffer these are ignored and the seam simply comes back; that is
    // why the viewer asks for one.
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.IncrementStencilOp,
  });

  const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
  shaft.name = 'light-shaft';
  // The patches reach the far bulkhead, well outside any bound taken from a
  // rest pose, and they are rebuilt after the cull would have run.
  shaft.frustumCulled = false;
  root.add(shaft);

  // --- Scratch. Allocated once; update() allocates nothing. -----------------

  const sunDir = new THREE.Vector3();
  const travel = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const patchCentre = new THREE.Vector3();
  const litCentre = new THREE.Vector3();
  const litNormal = new THREE.Vector3();
  const sunTint = new THREE.Color();
  const beam = new THREE.Color();
  const ground = new THREE.Color();
  const earthshineTint = new THREE.Color();
  const dayTint = new THREE.Color();

  const sunColourLinear = new THREE.Color(SUN_COLOUR);
  /** DIRECTION.md's earthshine bounce: the neutral the terrain only tints. */
  const bounceColour = new THREE.Color(EARTHSHINE_GROUND);
  const bounceLuma = 0.2126 * bounceColour.r + 0.7152 * bounceColour.g + 0.0722 * bounceColour.b;
  const dawnSand = new THREE.Color(PALETTE.DAWN_SAND);
  const foil = new THREE.Color(PALETTE.FOIL);
  // Night earthshine: airglow, city light and the last of the twilight limb.
  // Nearly HIGH_FIELD, because this is the one directional the room has over
  // the terminator and a colour this close to NIGHT_SIDE multiplies out to
  // nothing however hard the intensity is driven - the level belongs in the
  // intensity, where the day term can grade it, and the hue belongs here.
  // Held off SETTLEMENT's warmth deliberately: this room has no primary action
  // and no live burn, so nothing in it may drift toward ACCENT.
  const nightGlow = new THREE.Color(PALETTE.NIGHT_SIDE).lerp(
    new THREE.Color(PALETTE.HIGH_FIELD),
    0.85
  );

  let polygon = new Float64Array(MAX_POLYGON_VERTS * 2);
  let scratch = new Float64Array(MAX_POLYGON_VERTS * 2);

  let groundBucket = Number.NaN;
  let groundLuma = TYPICAL_GROUND_LUMA;

  /** Admitted aperture area this frame, weighted by incidence. Metres squared. */
  let admitted = 0;
  /** Power-weighted centre of everything the beams landed on. */
  let litWeight = 0;

  /**
   * SUN_COLOUR -> DAWN_SAND -> FOIL as extinction climbs. The orbit module
   * hands over the grade because it is geometry; the colours live here because
   * they are art direction.
   */
  const gradeColour = (grade: number): void => {
    if (grade <= GRADE_MID) {
      sunTint.copy(sunColourLinear).lerp(dawnSand, grade / GRADE_MID);
    } else {
      sunTint.copy(dawnSand).lerp(foil, (grade - GRADE_MID) / (1 - GRADE_MID));
    }
  };

  /**
   * Projects one pane and appends its patches. Returns the running triangle
   * count.
   *
   * For a planar receiver the hit point H(a, b) is affine in the pane's own
   * coordinates: the ray parameter is an affine numerator over a constant
   * denominator, so "H lies inside face G" is a half-plane in (a, b) for every
   * other face G, and so is "H lies inside the throat". Clipping the pane
   * outline against all of them leaves exactly the part of the beam that gets
   * through the cupola's mouth and out through face F, with exact edges and an
   * exact crease where a beam turns the deck-to-hull corner. No sampling, no
   * depth buffer, no soft edge, and identical on every rasteriser.
   */
  const projectPane = (pane: Pane, level: number, triangles: number): number => {
    const incidence = pane.normal.dot(sunDir);
    // Sun behind the pane. Projecting through a backward-facing aperture would
    // put a bright patch on the ceiling from a sun on the other side of it.
    if (incidence <= 1e-4) return triangles;

    // The beam has to cross the throat plane to be in the room at all.
    const throatGamma = throatNormal.dot(travel);
    if (Math.abs(throatGamma) < 1e-4) return triangles;
    const throatK = throatOffset - throatNormal.dot(pane.origin);
    const throatAlpha = throatNormal.dot(pane.u);
    const throatBeta = throatNormal.dot(pane.v);

    let count = triangles;
    for (const face of faces) {
      const gamma = face.n.dot(travel);
      // The beam runs away from this face or along it, so it cannot leave
      // through it: on a convex room the exit face is the one the light agrees
      // with. gamma is also the cosine of incidence, which the colour needs.
      if (gamma <= 1e-4) continue;

      const k = face.d - face.n.dot(pane.origin);
      const alpha = face.n.dot(pane.u);
      const beta = face.n.dot(pane.v);

      polygon.set(pane.outline.subarray(0, pane.count * 2));
      let verts = pane.count;

      // The hit has to lie downstream of the glass: u > 0.
      verts = clipHalfPlane(polygon, verts, scratch, -k, alpha, beta);
      [polygon, scratch] = [scratch, polygon];

      // Through the cupola's mouth. The dome is convex and the mouth is its
      // base, so "inside every mouth edge where the ray crosses the mouth
      // plane" is exactly "leaves the dome into the room" - the pane that
      // cannot pass its own throat contributes nothing, which is the honest
      // answer a single limb-aimed pane would have got.
      for (const edge of mouth) {
        if (verts < 3) break;
        const nl = edge.n.dot(travel);
        verts = clipHalfPlane(
          polygon,
          verts,
          scratch,
          edge.n.dot(pane.origin) + (nl * throatK) / throatGamma - edge.d,
          edge.n.dot(pane.u) - (nl * throatAlpha) / throatGamma,
          edge.n.dot(pane.v) - (nl * throatBeta) / throatGamma
        );
        [polygon, scratch] = [scratch, polygon];
      }

      for (const other of faces) {
        if (verts < 3) break;
        if (other === face) continue;
        const nl = other.n.dot(travel);
        verts = clipHalfPlane(
          polygon,
          verts,
          scratch,
          other.n.dot(pane.origin) + (nl * k) / gamma - other.d,
          other.n.dot(pane.u) - (nl * alpha) / gamma,
          other.n.dot(pane.v) - (nl * beta) / gamma
        );
        [polygon, scratch] = [scratch, polygon];
      }
      if (verts < 3) continue;

      // Area in the pane's own plane is the aperture this patch was cut from,
      // so summing it over every patch is the aperture the cupola is actually
      // admitting - which is what the sun and the bounce are levelled by.
      const area = Math.abs(polygonArea2(polygon, verts)) / 2;
      if (area < 1e-5) continue;
      const power = area * incidence;
      admitted += power;

      // One colour for the whole patch on this face: albedo times irradiance,
      // the same flat per-facet term earth.ts gives the planet, computed here
      // because the renderer has no way to know the hull is in the way.
      beam
        .copy(face.albedo)
        .multiply(sunTint)
        .multiplyScalar((SHAFT_DIRECT * level * gamma) / Math.PI);
      beam.r = Math.min(beam.r, SHAFT_CEILING);
      beam.g = Math.min(beam.g, SHAFT_CEILING);
      beam.b = Math.min(beam.b, SHAFT_CEILING);

      patchCentre.set(0, 0, 0);
      const start = count;
      for (let i = 1; i + 1 < verts && count < MAX_SHAFT_TRIANGLES; i += 1) {
        const base = count * 9;
        for (let corner = 0; corner < 3; corner += 1) {
          const index = corner === 0 ? 0 : corner === 1 ? i : i + 1;
          const a = polygon[index * 2] ?? 0;
          const b = polygon[index * 2 + 1] ?? 0;
          hit
            .copy(pane.origin)
            .addScaledVector(pane.u, a)
            .addScaledVector(pane.v, b)
            .addScaledVector(travel, (k - a * alpha - b * beta) / gamma)
            .addScaledVector(face.n, -face.lift);

          const at = base + corner * 3;
          shaftPositions[at] = hit.x;
          shaftPositions[at + 1] = hit.y;
          shaftPositions[at + 2] = hit.z;
          shaftColours[at] = beam.r;
          shaftColours[at + 1] = beam.g;
          shaftColours[at + 2] = beam.b;
          patchCentre.add(hit);
        }
        count += 1;
      }
      if (count > start) {
        patchCentre.multiplyScalar(1 / ((count - start) * 3));
        litCentre.addScaledVector(patchCentre, power);
        // Inward normal of whatever the patch landed on, so the bounce stands
        // off the surface rather than off the sun.
        litNormal.addScaledVector(face.n, -power);
        litWeight += power;
      }
    }

    return count;
  };

  /** Published to anything that has to live inside the light. */
  const beamState = { travel: new THREE.Vector3(0, -1, 0), strength: 0 };

  return {
    root,
    sun,
    beam: beamState,

    update(frame: Frame): void {
      const sample = frame.orbit;
      sunDir.set(sample.sun.x, sample.sun.y, sample.sun.z);
      if (sunDir.lengthSq() < 1e-9) sunDir.copy(UP);
      sunDir.normalize();
      travel.copy(sunDir).multiplyScalar(-1);

      gradeColour(sample.grade);
      // The umbral step is already in sample.intensity, at whatever width the
      // OrbitGeometry was built with - 0.2 s normally, 1.5 s under
      // prefers-reduced-motion, which the environment picks when it builds the
      // clock. Applying it again here would square the step and halve its
      // duration, so the rig only scales by what it is handed.
      const level = sample.intensity;

      admitted = 0;
      litWeight = 0;
      litCentre.set(0, 0, 0);
      litNormal.set(0, 0, 0);
      let triangles = 0;
      if (level > 1e-3) {
        for (const pane of panes) triangles = projectPane(pane, level, triangles);
      }
      shaft.visible = triangles > 0;
      shaftGeometry.setDrawRange(0, triangles * 3);
      if (triangles > 0) {
        positionAttribute.needsUpdate = true;
        colourAttribute.needsUpdate = true;
      }

      // How open the cupola is to this sun, as a fraction of the widest it ever
      // gets. Everything that stands in for scattered sunlight is scaled by it,
      // so no interior light can outrun the aperture that fed it.
      const admission = THREE.MathUtils.clamp(admitted / REFERENCE_ADMISSION, 0, 1);

      // Published for the dust, which has to hang in this beam and nowhere else.
      beamState.travel.copy(travel);
      beamState.strength = THREE.MathUtils.clamp(admission * level, 0, 1);

      sun.color.copy(sunTint);
      // Never toggled invisible: dropping a light changes the shader
      // permutation, and recompiling at the terminator is a hitch on the one
      // frame in the room that must not have one.
      sun.intensity = SUN_PEAK * level * (ADMISSION_FLOOR + (1 - ADMISSION_FLOOR) * admission);
      sun.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);

      if (litWeight > 1e-4) {
        litCentre.multiplyScalar(1 / litWeight);
        if (litNormal.lengthSq() < 1e-9) litNormal.copy(UP);
        litNormal.normalize();
        bounce.position.copy(litCentre).addScaledVector(litNormal, BOUNCE_STANDOFF);
        bounce.color.copy(sunTint);
        bounce.intensity = BOUNCE_PEAK * level * admission;
      } else {
        bounce.position.copy(throat.centre);
        bounce.intensity = 0;
      }

      // Earthshine. Resampled on a cadence rather than per frame, and off a
      // quantised point so the cached colour is a pure function of time.
      const bucket = Math.floor(frame.t / EARTHSHINE_CADENCE_SECONDS);
      if (bucket !== groundBucket) {
        groundBucket = bucket;
        albedoAt(
          Math.round(sample.latitude / GROUND_QUANTISE) * GROUND_QUANTISE,
          Math.round(sample.longitude / GROUND_QUANTISE) * GROUND_QUANTISE,
          ground
        );
        groundLuma = 0.2126 * ground.r + 0.7152 * ground.g + 0.0722 * ground.b;
      }

      // The ground below is lit when the sun stands above its horizon, and the
      // local zenith at the sub-satellite point is the station's own +Y - so
      // the day term is just the sun vector's zenith component. Earthshine
      // therefore dies well before the station itself enters umbra, which is
      // correct, and is what gives the room a dusk instead of a switch.
      const day = THREE.MathUtils.smoothstep(sunDir.y, 0, 0.35);
      // Sunlight off the ground, renormalised to the bounce colour's own level
      // so the hue is the only thing the terrain contributes here - the level
      // goes into intensity below, where an ocean pass can be dimmer than a
      // desert one without also being a different colour of dim.
      earthshineTint.copy(ground).multiply(sunColourLinear);
      const tintLuma =
        0.2126 * earthshineTint.r + 0.7152 * earthshineTint.g + 0.0722 * earthshineTint.b;
      earthshineTint.multiplyScalar(bounceLuma / Math.max(tintLuma, 1e-4));
      dayTint.copy(bounceColour).lerp(earthshineTint, TERRAIN_TINT);
      earthshine.color.copy(nightGlow).lerp(dayTint, day);
      const brightness = THREE.MathUtils.clamp(groundLuma / TYPICAL_GROUND_LUMA, 0.6, 1.3);
      earthshine.intensity =
        EARTHSHINE_NIGHT + (EARTHSHINE_PEAK * brightness - EARTHSHINE_NIGHT) * day;
    },

    dispose(): void {
      shaftGeometry.dispose();
      shaftMaterial.dispose();
      root.clear();
    },
  };
}
