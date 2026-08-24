/**
 * Dust in the sunbeam.
 *
 * The room's one real event is the shaft walking the length of the deck, and
 * until now that shaft was a surface effect: a bright patch on the hull with
 * nothing between it and the window. A beam you can see THROUGH is what makes
 * the light read as something crossing a volume of air rather than as a decal
 * sliding along a wall, and motes are how that has been done since the first
 * cathedral - they are the only part of the beam the eye can actually focus on.
 *
 * It is also the cheapest honest way to show that this room has air in it. The
 * deck runs forced ventilation (there is an impeller behind the grille), so the
 * dust does not settle and does not fall. It drifts across the beam on the
 * cabin flow and turns over slowly, which is exactly what it does on a real
 * station and exactly what it would not do on the ground.
 *
 * WHERE THE MOTES LIVE. Sunlight can only be in the room if it came through the
 * cupola's throat - that is the physical claim the whole lighting rig is built
 * on - so the lit volume is the throat hexagon swept along the sun's travel
 * direction. Motes are placed in that prism and nowhere else, which means they
 * cannot appear in a corner the light never reached. They fade out with the
 * beam's own strength, so eclipse takes them with it rather than leaving dust
 * hanging in a dark room.
 *
 * Pure in the way this room requires: every position is a function of the
 * absolute time in the Frame and a fixed seed, so the same second always draws
 * the same dust and the screenshot harness gets identical pixels.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { Animated, Aperture, Frame } from './contract';

/**
 * How many motes. Enough that the beam has texture from across the deck, few
 * enough that they never read as a fog volume - the moment dust becomes a mass
 * rather than countable specks it stops being dust and starts being haze, which
 * DIRECTION has no room for.
 */
const COUNT = 240;

/** Metres of beam the motes occupy, measured from the throat inward. */
const DEPTH_M = 5.2;

/** Metres either side of the beam's axis. About the throat's own half-width. */
const SPREAD_M = 0.62;

/** Drift, metres per second. Cabin airflow, not gravity: slow and sideways. */
const DRIFT_ACROSS = 0.031;
const DRIFT_ALONG = 0.014;
/** How far a mote wanders off its drift line, and how fast. Metres, hertz. */
const WANDER_M = 0.07;
const WANDER_HZ = 0.045;

/**
 * Mote size, in PIXELS, and it used to be in metres.
 *
 * The note that was here said 9 mm with size attenuation gives two or three
 * pixels across the deck and reads as a speck, and that a first cut at 24 mm
 * was wrong because "a square you can see the corners of is not dust, it is a
 * pixel". Both halves were right. What neither caught is that with attenuation
 * on, the size is a function of range, and 9 mm has no corners across the deck
 * only because the deck is three metres away. The player can walk into the
 * beam. At 0.2 m the same mote subtends two and a half degrees and renders as a
 * 35-pixel hard-edged grey tile hanging in the window - the 24 mm failure back
 * again, at four times the scale, reachable from anywhere in the room.
 *
 * There is no way to cap a point's screen size in PointsMaterial, and culling
 * by range would need the eye position, which `Frame` deliberately does not
 * carry - it is pure, and every animator in the room is a function of it alone.
 * So the fix is to stop asking: attenuation off, size fixed at the two or three
 * pixels the original note was aiming for. A mote is now a speck at every
 * distance and cannot become a square at any of them.
 *
 * What that gives up is the depth cue - a near mote no longer reads as nearer.
 * The cloud is DEPTH_M deep and that cue was worth very little across so
 * shallow a volume, which is a cheap price for removing the one artifact in
 * this room a player was guaranteed to walk into.
 */
const MOTE_PX = 2.4;

/**
 * Peak opacity.
 *
 * Dust is only ever visible because it is brighter than what is behind it, and
 * the thing behind it here is a dim interior. Low enough that a mote drifting
 * over the lit hull disappears, which is correct - you see dust against shadow,
 * not against a sunlit wall.
 */
const OPACITY = 0.44;

/** Fixed seed: the same second must draw the same dust on every machine. */
const SEED = 0x9e3d;

/** Mulberry32, the idiom the rest of this project seeds with. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Positive modulo, so a mote leaving one end of the prism enters the other. */
function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

export interface MotesHandle extends Animated {
  /**
   * The beam to hang in. Read every frame, never held.
   *
   * Handed in rather than recomputed because the lighting rig already solves
   * where the sun is and how much of it got through the aperture, and a second
   * copy of that arithmetic is a second thing to be wrong.
   */
  setBeam(travel: THREE.Vector3, strength: number): void;
}

export function createMotes(throat: Aperture): MotesHandle {
  const random = seeded(SEED);

  // Per-mote constants, drawn once. Everything the animation does is a pure
  // function of these plus the clock.
  const across = new Float32Array(COUNT);
  const up = new Float32Array(COUNT);
  const along = new Float32Array(COUNT);
  const rate = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) {
    across[i] = (random() - 0.5) * 2 * SPREAD_M;
    up[i] = (random() - 0.5) * 2 * SPREAD_M;
    along[i] = random() * DEPTH_M;
    // Spread of speeds, or the whole cloud slides as one sheet and reads as a
    // texture being scrolled rather than as air moving.
    rate[i] = 0.55 + random() * 0.9;
    phase[i] = random() * Math.PI * 2;
  }

  const positions = new Float32Array(COUNT * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // The prism moves with the sun, so a bounding sphere computed once is wrong
  // for most of the orbit; the cloud is small and always on screen when it is
  // visible at all, so culling it is not worth being wrong about.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.CLOUD),
    size: MOTE_PX,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    // Motes are specks of sunlight, not a light source: normal blending, never
    // additive. Additive is how a particle system turns into a glow, and there
    // is no glow anywhere in this game at any intensity.
    blending: THREE.NormalBlending,
    // They must be hidden by the deck and the bulkheads they drift behind, but
    // must not punch holes in each other.
    depthTest: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'beam-dust';
  points.frustumCulled = false;

  const root = new THREE.Group();
  root.name = 'limb-deck-motes';
  root.add(points);

  const travel = new THREE.Vector3(0, -1, 0);
  let strength = 0;

  // Scratch.
  const right = new THREE.Vector3();
  const over = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  return {
    root,

    setBeam(direction, level) {
      if (direction.lengthSq() > 1e-9) travel.copy(direction).normalize();
      strength = THREE.MathUtils.clamp(level, 0, 1);
    },

    update(frame: Frame) {
      material.opacity = OPACITY * strength;
      // Below this nothing is visible anyway and the whole cloud can be skipped,
      // which is most of the orbit's dark half.
      points.visible = material.opacity > 0.004;
      if (!points.visible) return;

      // A frame across the beam. Any pair perpendicular to travel will do - the
      // dust has no orientation of its own - so this only has to be stable, and
      // the degenerate case is the sun pointing straight down the world axis.
      right.crossVectors(travel, WORLD_UP);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      over.crossVectors(right, travel).normalize();

      // Start just inside the throat rather than at it, so no mote is ever
      // sitting in the plane of the glass.
      origin.copy(throat.centre).addScaledVector(travel, 0.12);

      const t = frame.t;
      for (let i = 0; i < COUNT; i += 1) {
        const speed = rate[i] ?? 1;
        const wob = Math.sin(t * WANDER_HZ * Math.PI * 2 * speed + (phase[i] ?? 0)) * WANDER_M;
        const a =
          wrap((across[i] ?? 0) + t * DRIFT_ACROSS * speed + SPREAD_M, SPREAD_M * 2) - SPREAD_M;
        const u = (up[i] ?? 0) + wob;
        const d = wrap((along[i] ?? 0) + t * DRIFT_ALONG * speed, DEPTH_M);

        const o = i * 3;
        positions[o] = origin.x + right.x * a + over.x * u + travel.x * d;
        positions[o + 1] = origin.y + right.y * a + over.y * u + travel.y * d;
        positions[o + 2] = origin.z + right.z * a + over.z * u + travel.z * d;
      }
      geometry.getAttribute('position').needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
