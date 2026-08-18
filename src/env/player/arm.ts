/**
 * The player's arm.
 *
 * WHO IS HOLDING IT. The player is not a person in a suit. They are a station
 * robot built to make things go smoothly - it fetches, seats, latches and
 * checks, and it is the reason the deck is tidy. Its limbs are not jointed:
 * they are stacks of short couplings held nose to tail by magnets, and to
 * reach something the couplings simply let go. The hand comes off and travels,
 * and the segments behind it string out along the path like a dotted line back
 * to the shoulder. When the job is done the stack closes up again.
 *
 * That identity started as a bug. The arm used to be a two-bone IK limb aimed
 * at Obra Dinn's hand, and at a 62 degree field of view an honest forearm is a
 * featureless pole across a quarter of the screen - Lucas Pope hit the same
 * thing and fought it with taper and detail. Rather than keep fighting it, the
 * limb is now made of the thing the fight produced. There is no pole because
 * there is no continuous arm, no elbow to flip through the torso because there
 * is no elbow, and no reach limit set by bone length because the chain simply
 * opens further. A constraint became the character.
 *
 * WHAT IT IS MADE OF. The couplings are HULL and HULL_SHADOW - the robot is
 * built out of the same plate as the module it lives in - and the mating face
 * at the base of every segment is MINT. That face is hidden while the stack is
 * closed and shows the moment a coupling opens, so the limb tells you it has
 * released without anything lighting up. DIRECTION bans glow at any intensity;
 * a surface that was always there and is now merely visible is not glow.
 *
 * WHEN IT APPEARS. Only ever for something `interact()` will actually honour
 * (`operable` in types.ts). There is no HUD, no highlight and no prompt, so the
 * reach is the only signal the player gets that a thing can be operated - which
 * makes it a promise. A hand that drifts out to touch the window on the way
 * past spends that promise on nothing and teaches that reaching means nothing.
 * Out of range, the limb is not drawn at all.
 *
 * It is fully automatic; the player never aims it. That is the difference
 * between an arm that reads as a body and Trespasser's noodle, and it is also
 * what makes it authorable - the code decides where the hand goes, so the hand
 * is always somewhere defensible.
 *
 * The limb lives in the room's own scene graph and is lit by the room's own
 * lights. It touches the same geometry the player sees rather than floating in
 * a view-model layer with its own field of view.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';

/**
 * Shoulder offset from the eye: right, down, and back.
 *
 * Lower and further back than a shoulder sits on a person, deliberately, so the
 * chain enters from the frame edge rather than starting in the middle of it.
 * Because the limb extends by opening rather than by rotating, pushing the
 * origin back costs nothing in reach - the trade the old IK arm could not make.
 *
 * But it cannot go far outboard, and that is a hard geometric limit rather than
 * a preference. The shut limb is 0.43 m long, so the raise beat happens about
 * 0.3 m from the eye, and at that range a shoulder set 0.21 m to the side puts
 * the whole stack 51 degrees off axis - outside a frame that only reaches 45.
 * The beat played correctly and off the edge of the screen. Lateral offset and
 * how much of the limb the player ever sees are the same number.
 */
const SHOULDER_OFFSET = new THREE.Vector3(0.13, -0.3, 0.1);

/**
 * The stack, shoulder-ward first. Lengths in metres.
 *
 * Deliberately SHORTER than anything it has to touch: closed, the whole limb
 * spans 0.385 m, and the nearest a body can stand to a hull fitting is about
 * 0.7 m. The limb therefore cannot reach anything without coming apart, which
 * is the entire point of it - the separation is not a flourish laid over a
 * working arm, it is how the arm works.
 */
const SEGMENT_LENGTHS = [0.05, 0.048, 0.046, 0.044, 0.042, 0.04, 0.038, 0.036] as const;
/** Radii at each coupling face, shoulder to wrist. One more than there are segments. */
const SEGMENT_RADII = [0.046, 0.044, 0.042, 0.04, 0.038, 0.036, 0.034, 0.031, 0.028] as const;
/** Thickness of the mating band at the base of each segment, metres. */
const COUPLING_M = 0.009;
/** Wrist coupling to the tips of the jaws. */
const HAND_M = 0.085;

/**
 * How the opened distance is shared out, shoulder-ward first, one per gap.
 *
 * Two things are being bought at once and they pull against each other. The
 * gaps have to GROW toward the wrist, or the limb reads as having fallen apart
 * rather than as having sent its hand somewhere. But if the wrist takes almost
 * all of it - the first cut of this did, at 47 per cent - the other five
 * couplings stay bunched at the shoulder, which is below the frame, and all the
 * player sees is a lone floating fist with nothing behind it. Then it is not a
 * limb coming apart, it is a prop.
 *
 * So: a lead-out at the shoulder that pushes the first segment clear of the eye,
 * a steady climb through the middle so the stack strings out across the lower
 * frame where it can be read, and the largest single gap still at the wrist.
 *
 * The count matters as much as the weights. A first-person eye cannot see its
 * own shoulder, so roughly the first half metre of the chain is behind the
 * camera whatever the arithmetic says; with five long segments that left ONE in
 * frame and the limb read as a fist and a brick. Eight short ones put three or
 * four in the visible stretch, which is where it starts reading as a chain.
 */
const GAP_WEIGHTS = [1.0, 0.55, 0.6, 0.68, 0.78, 0.92, 1.1, 1.35, 1.9] as const;

/** Beyond this the limb stays closed and undrawn. Inside it, the reach begins. */
const REACH_M = 1.6;
/**
 * Inside this the hand is ON the thing rather than approaching it.
 *
 * Sized against how close a body can actually get, not against how long the
 * limb is: hull fittings sit behind a wall margin, so the nearest legal
 * shoulder is roughly 0.7 m off one. A grip window tighter than that could
 * never be entered - and since the chain opens to suit, there is no cost to
 * setting it where the room allows.
 */
const GRIP_M = 0.95;

/** Half-angle of the cone the reach looks in, radians. 55 degrees. */
const REACH_CONE = 0.96;

/**
 * How far into the reach the couplings actually let go.
 *
 * The limb has two motions and they must not happen at once. First it comes up
 * off the hip as ONE SOLID STACK and aims at the thing - that is the beat that
 * says "this is a limb, and it is made of parts" while the parts are still
 * touching. Only then do the magnets release and the hand run out to the
 * target ahead of the rest.
 *
 * Without the delay both happen together: the limb is already strung out by the
 * time it clears the frame edge, so the player never sees it whole and never
 * sees it come apart. It just is apart, which is a completely different and
 * much worse read - a handful of floating blocks rather than a machine
 * deciding to take itself to pieces. The separation has to be witnessed.
 */
const RELEASE_FROM = 0.42;

/**
 * How high the shut stack is carried on its way up, metres above the bearing.
 *
 * The raise beat is invisible without it, and that is geometry rather than
 * taste. The shoulder sits 0.4 m below the eye and the shut limb is only 0.43 m
 * long, so a stack that simply points at the target from there lies 50 degrees
 * below the view axis - outside a 62 degree frame, every time. Carrying it up
 * before running it out is also what a body does with a tool.
 */
const READY_LIFT_M = 0.22;

/** How quickly the couplings commit to a reach, seconds. */
const REACH_TAU_S = 0.16;
/** Reduced motion gets a longer, flatter ramp - same rule as the camera law. */
const REACH_TAU_REDUCED_S = 0.34;

/** Below this the limb is not drawn at all: it is behind the eye anyway. */
const HIDE_BELOW = 0.02;

/**
 * How far the chain bows off the straight line, as a FRACTION of its span.
 *
 * A chain of magnets under its own control does not sag, but a limb that
 * travels in a dead straight line reads as a laser pointer. The bow is out and
 * down while the stack is shut and flattens as the hand commits, so the
 * segments visibly line themselves up on the target - the moment the couplings
 * agree.
 *
 * Proportional and not a fixed distance, which it was. 0.15 m of bow is a
 * gentle curve on a 1.2 m reach and a right-angle detour on the 0.43 m shut
 * stack - and since that stack sits about 0.3 m from the eye, 0.15 m sideways
 * is 27 degrees, which swung the whole raise beat off the right-hand edge of
 * the frame. The player saw nothing and the code was doing exactly what it said.
 */
const BOW_FRACTION = 0.13;
/** However long the reach, the bow never exceeds this. */
const BOW_MAX_M = 0.15;

/** How high the hand arcs above the straight line on its way out, metres. */
const REACH_ARC_M = 0.13;

/**
 * How far short of a point of interest the fingertips stop, metres.
 *
 * A point of interest is the centre of a thing, not its surface, so aiming at
 * it buries the jaws inside the cap. Without a surface query the honest
 * approximation is a fixed standoff about the radius of the fittings in this
 * room, which leaves the hand ON the object where it can be seen.
 */
const GRIP_STANDOFF_M = 0.055;

/** Curve samples used to walk the chain by arc length. */
const CURVE_SAMPLES = 24;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** Something in the room the hand could take hold of. */
export interface ArmTarget {
  readonly id: string;
  /** World position, metres. */
  readonly position: THREE.Vector3;
}

export interface ArmHandle {
  readonly root: THREE.Object3D;
  /**
   * Pose the limb for this frame.
   *
   * @param camera   the eye. The shoulder hangs off it, so the limb turns with
   *                 the head the way a body does.
   * @param targets  operable points of interest only, world space. Anything
   *                 inert passed in here becomes a promise the room cannot keep.
   * @param dt       seconds since the last pose, for the coupling ramp only.
   */
  update(camera: THREE.Camera, targets: readonly ArmTarget[], dt: number): void;
  /** What the hand is currently on, or null. The interaction layer reads this. */
  held(): string | null;
  /**
   * Where the hand is and how far open the couplings are.
   *
   * The reach is two beats that have to happen in order and be SEEN to happen,
   * and both facts are about where things ended up on screen rather than about
   * what the code intended. Reading the hand's world position back is the only
   * way to check that from outside the render - eyeballing a screenshot and
   * guessing which dark shape is the limb is how a bow got tuned to swing the
   * whole chain off the right-hand edge of the frame without anyone noticing.
   */
  state(): { readonly hand: THREE.Vector3; readonly open: number; readonly reach: number };
  dispose(): void;
}

/**
 * Share the opened distance out across the couplings.
 *
 * `spanM` is the length of the path the limb has to cover and `solidM` is how
 * much of that is hardware; the difference is what the magnets have released.
 * Pure, and exported, because it is the whole behaviour of the limb in one
 * line of arithmetic and it is worth being able to assert on directly.
 */
export function couplingGaps(
  spanM: number,
  solidM: number,
  release = 1,
  weights: readonly number[] = GAP_WEIGHTS
): number[] {
  const open = THREE.MathUtils.clamp(release, 0, 1);
  const slack = Math.max(0, spanM - solidM) * open;
  let total = 0;
  for (const weight of weights) total += weight;
  if (total <= 0) return weights.map(() => 0);
  return weights.map((weight) => (slack * weight) / total);
}

/**
 * How far open the magnets are, from how committed the reach is.
 *
 * Zero for the first part of the approach - the stack travels shut - then a
 * smoothstep the rest of the way, so the couplings ease apart instead of
 * snapping. Pure, and exported, so the beat can be asserted rather than eyeballed.
 */
export function couplingRelease(reach: number): number {
  const t = THREE.MathUtils.clamp((reach - RELEASE_FROM) / (1 - RELEASE_FROM), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Total hardware in the closed limb, metres. Jaw tips to shoulder coupling. */
export function limbSolidLength(): number {
  let total = HAND_M;
  for (const length of SEGMENT_LENGTHS) total += length;
  return total;
}

interface Segment {
  readonly group: THREE.Object3D;
  readonly length: number;
}

/**
 * The mating end of a coupling: a mint pole ring around a dark core.
 *
 * An annulus rather than a solid face, and the reason is how often the player
 * looks at one. The chain always points away from the eye - it is going where
 * the eye is going - so what is on screen is a row of coupling BASES, head on.
 * A solid mint disc at that angle made the limb a line of bright blobs and the
 * one loud thing in a deliberately quiet room. A ring gives the same "this
 * surface was mated a moment ago" read on a fraction of the area, and it is
 * also what a pole face on a real magnetic coupling looks like.
 */
function buildCoupling(radius: number, ring: THREE.Material, core: THREE.Material): THREE.Object3D {
  const group = new THREE.Object3D();

  const bandGeometry = new THREE.CylinderGeometry(radius * 1.06, radius * 1.09, COUPLING_M, 8);
  bandGeometry.translate(0, COUPLING_M / 2, 0);
  const band = new THREE.Mesh(bandGeometry, ring);
  band.name = 'pole-ring';

  // Standing PROUD of the collar, toward whatever this used to be mated to.
  // Seated flush its base face was coplanar with the collar's and the two
  // z-fought, which rendered as a torn notch across the pole rather than as a
  // plug in a ring.
  const coreGeometry = new THREE.CylinderGeometry(radius * 0.78, radius * 0.8, COUPLING_M * 1.5, 8);
  coreGeometry.translate(0, (COUPLING_M * 1.5) / 2 - COUPLING_M * 0.35, 0);
  const plug = new THREE.Mesh(coreGeometry, core);
  plug.name = 'pole-core';

  group.add(band, plug);
  return group;
}

/**
 * One segment: a tapered barrel standing on its coupling.
 *
 * Built along +Y from its own origin, so placing it is a position and an aim.
 */
function buildSegment(
  length: number,
  radiusBase: number,
  radiusTip: number,
  body: THREE.Material,
  ring: THREE.Material,
  core: THREE.Material
): Segment {
  const group = new THREE.Object3D();
  group.add(buildCoupling(radiusBase, ring, core));

  const barrelLength = length - COUPLING_M;
  const barrelGeometry = new THREE.CylinderGeometry(radiusTip, radiusBase * 1.06, barrelLength, 8);
  barrelGeometry.translate(0, COUPLING_M + barrelLength / 2, 0);
  const barrel = new THREE.Mesh(barrelGeometry, body);
  barrel.name = 'barrel';

  group.add(barrel);
  return { group, length };
}

/** Points an object from `from` toward `to`, origin at `from`. */
function aim(object: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  object.position.copy(from);
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 1e-6) return;
  direction.divideScalar(length);
  object.quaternion.setFromUnitVectors(UP, direction);
}

export function createArm(reducedMotion: boolean): ArmHandle {
  const root = new THREE.Object3D();
  root.name = 'player-arm';
  // The reach is computed from the eye every frame and the room may be culled
  // from a rest pose that never saw the limb.
  root.frustumCulled = false;
  // Every part below is solved in world space, so this node carries the inverse
  // of whatever transform it is parented under and the children's local
  // coordinates are world coordinates. Assuming the room's root is the identity
  // would work today and break silently the first time a room is offset.
  root.matrixAutoUpdate = false;

  /**
   * The limb is lit by the room, and it carries the room's own emissive floor
   * (interiorMaterial, limbDeck/shell.ts): indoors an unlit facet has nothing
   * but its emissive term, and a limb without one drops through VOID_SLATE - the
   * palette's darkest value - the moment the station enters eclipse. The player
   * is looking straight at it when that happens.
   */
  const lit = (colour: string): THREE.MeshLambertMaterial =>
    new THREE.MeshLambertMaterial({
      color: new THREE.Color(colour),
      flatShading: true,
      emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
      emissiveIntensity: 1,
    });

  const plateMaterial = lit(PALETTE.HULL);
  const shadowMaterial = lit(PALETTE.HULL_SHADOW);
  const couplingMaterial = lit(PALETTE.MINT);

  const segments: Segment[] = SEGMENT_LENGTHS.map((length, i) =>
    buildSegment(
      length,
      SEGMENT_RADII[i] ?? 0.04,
      SEGMENT_RADII[i + 1] ?? 0.03,
      plateMaterial,
      couplingMaterial,
      shadowMaterial
    )
  );
  for (const segment of segments) root.add(segment.group);

  // --- The hand. A wrist coupling, a palm block, and two jaws that close.
  //
  // A gripper rather than fingers and a thumb: this is a machine that seats and
  // latches things, the close is one motion instead of five, and two jaws
  // shutting is legible at arm's length where a curling finger block is not.
  const hand = new THREE.Object3D();
  hand.name = 'hand';
  const wristRadius = SEGMENT_RADII[SEGMENT_RADII.length - 1] ?? 0.03;

  const wrist = buildCoupling(wristRadius, couplingMaterial, shadowMaterial);
  wrist.name = 'wrist-coupling';

  // Sized to the things it operates - a 38 mm cap - not to a human hand. The
  // first cut was hand-sized and simply covered the control it was pressing,
  // so the one piece of feedback the button has was hidden behind the thing
  // triggering it at the exact moment it fired.
  const palmGeometry = new THREE.BoxGeometry(0.056, 0.036, 0.038);
  palmGeometry.translate(0, COUPLING_M + 0.018, 0);
  const palm = new THREE.Mesh(palmGeometry, shadowMaterial);
  palm.name = 'palm';

  /** Both jaws hinge at the top of the palm and swing in the same plane. */
  const jawPivotY = COUPLING_M + 0.036;
  const jaws: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(side * 0.018, jawPivotY, 0);
    const jawGeometry = new THREE.BoxGeometry(0.016, 0.04, 0.03);
    jawGeometry.translate(0, 0.02, 0);
    const jaw = new THREE.Mesh(jawGeometry, plateMaterial);
    jaw.name = side < 0 ? 'jaw-port' : 'jaw-starboard';
    pivot.add(jaw);
    hand.add(pivot);
    jaws.push(pivot);
  }
  hand.add(wrist, palm);
  root.add(hand);

  /** How far the jaws splay when open, radians. Closing brings them to parallel. */
  const JAW_OPEN = 0.36;

  // --- Scratch. Allocated once; this runs every frame. ---
  const shoulder = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const restGoal = new THREE.Vector3();
  const readyGoal = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const control = new THREE.Vector3();
  const viewForward = new THREE.Vector3();
  const flatForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cameraDown = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const spare = new THREE.Vector3();
  /** Handed out by state(); the bones are solved in world space, so this is one. */
  const handPoint = new THREE.Vector3();

  /** The path the chain lies on, resampled every frame and walked by arc length. */
  const curve: THREE.Vector3[] = Array.from(
    { length: CURVE_SAMPLES + 1 },
    () => new THREE.Vector3()
  );
  const arc = new Float64Array(CURVE_SAMPLES + 1);

  const solid = limbSolidLength();

  const quadratic = (out: THREE.Vector3, t: number): THREE.Vector3 => {
    const u = 1 - t;
    return out
      .set(0, 0, 0)
      .addScaledVector(shoulder, u * u)
      .addScaledVector(control, 2 * u * t)
      .addScaledVector(goal, t * t);
  };

  /** The point `distance` along the sampled path from the shoulder. */
  const along = (out: THREE.Vector3, distance: number): THREE.Vector3 => {
    const total = arc[CURVE_SAMPLES] ?? 0;
    const want = THREE.MathUtils.clamp(distance, 0, total);
    for (let i = 1; i <= CURVE_SAMPLES; i += 1) {
      const before = arc[i - 1] ?? 0;
      const after = arc[i] ?? 0;
      if (want > after && i < CURVE_SAMPLES) continue;
      const span = after - before;
      const t = span > 1e-9 ? (want - before) / span : 0;
      const a = curve[i - 1];
      const b = curve[i];
      if (a === undefined || b === undefined) break;
      return out.lerpVectors(a, b, t);
    }
    return out.copy(goal);
  };

  let weight = 0;
  let grip = 0;
  let heldId: string | null = null;

  const tau = reducedMotion ? REACH_TAU_REDUCED_S : REACH_TAU_S;

  return {
    root,

    update(camera, targets, dt) {
      camera.updateMatrixWorld();
      const basis = camera.matrixWorld;
      viewForward.setFromMatrixColumn(basis, 2).normalize().negate();

      // The shoulder hangs off the BODY, not off the head: it turns when you
      // turn and stays put when you nod. Hanging it off the full camera basis
      // swung the whole limb forward and under every time the player looked
      // down at something - which is exactly when they are reaching for it.
      cameraDown.copy(WORLD_UP).negate();
      flatForward.copy(viewForward);
      flatForward.y = 0;
      if (flatForward.lengthSq() < 1e-8) {
        // Nose to the ceiling or the deck. Any heading will do; keep the last.
        flatForward.set(0, 0, -1);
      }
      flatForward.normalize();
      cameraRight.crossVectors(flatForward, WORLD_UP).normalize();

      shoulder
        .setFromMatrixPosition(basis)
        .addScaledVector(cameraRight, SHOULDER_OFFSET.x)
        .addScaledVector(cameraDown, -SHOULDER_OFFSET.y)
        .addScaledVector(flatForward, -SHOULDER_OFFSET.z);

      // --- Choose what to reach for. Nearest thing inside the cone, and only
      // things ahead: a limb that reaches for what is behind you is a puppet.
      // Everything in `targets` is operable by contract, so anything chosen
      // here can be honoured.
      let best: ArmTarget | null = null;
      let bestDistance = Infinity;
      for (const target of targets) {
        toTarget.copy(target.position).sub(shoulder);
        const distance = toTarget.length();
        if (distance > REACH_M || distance < 1e-4) continue;
        toTarget.divideScalar(distance);
        if (Math.acos(THREE.MathUtils.clamp(toTarget.dot(viewForward), -1, 1)) > REACH_CONE) {
          continue;
        }
        if (distance < bestDistance) {
          bestDistance = distance;
          best = target;
        }
      }

      // Commitment ramps in over the approach rather than switching on: the
      // couplings should look like they decided to let go.
      const wanted =
        best === null
          ? 0
          : THREE.MathUtils.clamp((REACH_M - bestDistance) / (REACH_M - GRIP_M), 0, 1);
      const wantedGrip = best !== null && bestDistance <= GRIP_M ? 1 : 0;
      // dt of 0 means a pinned frame, not a stalled one: resolve the reach
      // outright so a shot never inherits the previous pose's limb.
      const blend = dt > 0 ? 1 - Math.exp(-dt / tau) : 1;
      weight += (wanted - weight) * blend;
      grip += (wantedGrip - grip) * blend;
      heldId = wantedGrip > 0 && weight > 0.5 && best !== null ? best.id : null;

      if (weight < HIDE_BELOW) {
        root.visible = false;
        return;
      }
      root.visible = true;

      // --- Where the hand is going. Rest is down and slightly forward of the
      // hip, which is out of frame; the reach lerps out of it.
      restGoal
        .copy(shoulder)
        .addScaledVector(cameraDown, 0.46)
        .addScaledVector(flatForward, 0.12)
        .addScaledVector(cameraRight, 0.04);
      goal.copy(restGoal);

      // TWO BEATS, and they must not overlap.
      //
      // `raise` carries the limb up off the hip as one shut stack and puts it
      // on the bearing. `extend` is the magnets letting go and the hand running
      // out to the target - it is the same curve that opens the couplings, so
      // the hand can only travel by coming apart, which is the whole idea.
      //
      // Smoothstep on both, so the middle of each beat reads as committed
      // rather than as something still hanging at the hip. A linear ramp spends
      // most of the walk-up barely off the rest pose, which looks like nothing
      // is happening right up until the hand arrives.
      const raised = THREE.MathUtils.clamp(weight / RELEASE_FROM, 0, 1);
      const raise = raised * raised * (3 - 2 * raised);
      const extend = couplingRelease(weight);
      if (best !== null) {
        // Where the jaws have to end up: the FACE of the thing. A point of
        // interest is the centre of a thing, and aiming at it buries the
        // gripper inside the cap.
        aimPoint.copy(best.position);
        toTarget.copy(aimPoint).sub(shoulder);
        const bearing = toTarget.length();
        if (bearing > 1e-4) {
          toTarget.divideScalar(bearing);
          aimPoint.addScaledVector(toTarget, -GRIP_STANDOFF_M);
        }

        // Beat one: shut, on the bearing, and carried high enough to be seen.
        readyGoal
          .copy(shoulder)
          .addScaledVector(toTarget, solid * 0.92)
          .addScaledVector(WORLD_UP, READY_LIFT_M);
        goal.lerp(readyGoal, raise);

        // Beat two: out to the thing, arcing rather than sliding there along
        // the floor - which also brings the travel through the lower third of
        // the frame, where it can actually be watched.
        goal.lerp(aimPoint, extend);
        goal.addScaledVector(WORLD_UP, Math.sin(Math.PI * extend) * REACH_ARC_M);
      }

      // --- The path. Bowed out and down while the stack is shut, flattening
      // onto the target as the couplings let go.
      const reachSpan = goal.distanceTo(shoulder);
      const bow = Math.min(BOW_MAX_M, reachSpan * BOW_FRACTION) * (1 - 0.7 * extend);
      control
        .copy(shoulder)
        .lerp(goal, 0.5)
        .addScaledVector(cameraDown, bow * 0.55)
        .addScaledVector(cameraRight, bow);

      // `spare` is the fallback for an index the compiler cannot prove exists;
      // the array is fixed length so it is never used, and it must not be
      // `goal` or `shoulder` - writing a curve sample into either would quietly
      // corrupt the pose rather than fail.
      quadratic(curve[0] ?? spare, 0);
      arc[0] = 0;
      for (let i = 1; i <= CURVE_SAMPLES; i += 1) {
        const point = quadratic(curve[i] ?? spare, i / CURVE_SAMPLES);
        arc[i] = (arc[i - 1] ?? 0) + point.distanceTo(curve[i - 1] ?? point);
      }

      // --- Lay the stack out along it. Hardware is rigid; only the gaps grow,
      // and they only start growing once the limb is up and aimed. While the
      // stack is still shut it covers only its own length of the path, so the
      // hand sits short of the target with the whole limb pointing at it - and
      // then the magnets let go and it runs the rest of the way out.
      const span = arc[CURVE_SAMPLES] ?? 0;
      const gaps = couplingGaps(span, solid, couplingRelease(weight));

      // If the path is shorter than the shut limb - which the hip pose and a
      // half-eased goal can between them contrive - the chain cannot fit on it.
      // `along` clamps at the end of the curve, so without this the tail of the
      // stack piles up on top of itself at the target. Compressing the spacing
      // instead costs a couple of millimetres of overlap nobody can see.
      let chain = solid;
      for (const gap of gaps) chain += gap;
      const fit = chain > span && chain > 1e-6 ? span / chain : 1;

      let cursor = 0;
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment === undefined) continue;
        cursor += (gaps[i] ?? 0) * fit;
        along(from, cursor);
        cursor += segment.length * fit;
        along(to, cursor);
        aim(segment.group, from, to);
      }

      cursor += (gaps[segments.length] ?? 0) * fit;
      along(from, cursor);
      along(to, cursor + HAND_M * fit);
      aim(hand, from, to);

      // Closing is the only feedback that the grip happened, so it has to be
      // legible: the jaws come from splayed to parallel over the last of the
      // approach.
      for (let i = 0; i < jaws.length; i += 1) {
        const jaw = jaws[i];
        if (jaw === undefined) continue;
        jaw.rotation.z = (i === 0 ? -1 : 1) * -JAW_OPEN * (1 - grip);
      }

      // Cancel the parent's transform so the world-space positions above land
      // where they were solved.
      if (root.parent !== null) {
        root.parent.updateMatrixWorld();
        root.matrix.copy(root.parent.matrixWorld).invert();
      } else {
        root.matrix.identity();
      }
      root.updateMatrixWorld(true);
    },

    held() {
      return heldId;
    },

    state() {
      return { hand: handPoint.copy(hand.position), open: couplingRelease(weight), reach: weight };
    },

    dispose() {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      plateMaterial.dispose();
      shadowMaterial.dispose();
      couplingMaterial.dispose();
    },
  };
}
