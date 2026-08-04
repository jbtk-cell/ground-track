/**
 * The walk.
 *
 * Two layers, borrowed from two places rather than invented here.
 *
 * THE STEP is Return of the Obra Dinn's walk simulator, described by Lucas Pope
 * in his TIGSource devlogs: two discs, one per foot, each with a circumference
 * equal to the stride, rolled by DISTANCE WALKED and never by a clock. Halve
 * the speed and you get the same steps half as often rather than the same
 * rhythm over less ground, and walking into a wall stops the legs.
 *
 * The body is an inverted pendulum over the planted foot, so the head is
 * HIGHEST when that leg is vertical and lowest at the hand-off. `bobY` is
 * therefore measured DOWN from the apex and is never positive, and rest is
 * exactly zero. That sign convention is the fix for the bug Pope wrote up: he
 * took the maximum of the two feet, which put the head at its lowest point when
 * you stopped, so stopping felt like sinking into marshmallow - worse once
 * there were faces to stop and look at, because the view sank to their chest.
 * Standing still is legs-vertical, which is the TOP of the arc.
 *
 * THE DRIFT is Cinemachine's Basic Multi Channel Perlin, which is how film and
 * game cameras have got their handheld feel for a decade: a noise profile is a
 * set of (frequency, amplitude) layers per channel, summed, with a global gain
 * on each. Six channels here, each with two octaves at unrelated frequencies.
 * The noise itself is the `simplex-noise` package rather than a hand-rolled
 * gradient function.
 *
 * The drift is why this does not read as a machine. A pendulum alone is exactly
 * periodic: every step is the previous step, the eye traces the same arc
 * forever, and the ear and the eye both lock onto it within a couple of strides.
 * Real walking never repeats - the two legs are not the same length, the deck
 * is not level, and the body is always correcting. Layering noise at
 * frequencies that share no common multiple with the stride means the pattern
 * never closes, while the footfalls stay exactly where the legs put them.
 *
 * Everything is sampled by distance and by a breath clock, so it is fully
 * deterministic: the same distance and the same clock always produce the same
 * frame, which is what the screenshot harness needs.
 *
 * Pure: no three.js, no Date.now(), no Math.random().
 */
import { createNoise2D } from 'simplex-noise';

/**
 * Metres of ground per step.
 *
 * Tied to WALK_SPEED_MS in the viewer's controller: the two are one number in
 * two files, because their ratio IS the cadence. 1.85 m/s over 0.82 m is 2.26
 * footfalls a second, which is what 1.4 over 0.62 was. Change one and the walk
 * gets faster feet rather than longer steps, which reads as hurrying.
 */
export const STRIDE_M = 0.82;

/**
 * Hip height, metres - the pendulum's arm. Sets how deep the arc is, since the
 * geometric drop is `LEG_M - sqrt(LEG_M^2 - (STRIDE_M/2)^2)`.
 */
const LEG_M = 0.94;

/**
 * How much of the true geometric drop reaches the camera.
 *
 * The honest pendulum drops 5.2 cm per step, which is right for a body and
 * far too much for a camera bolted to its skull - real necks and eyes cancel
 * most of it, and a first-person camera that moves like a pelvis is the single
 * most common way head bob is overdone. Obra Dinn's is barely there. This
 * leaves about 11 mm of step, and the drift below adds roughly as much again
 * without any of it being periodic.
 *
 * Cut from 0.17 when the stride went from 0.62 to 0.82. The geometric drop goes
 * as the SQUARE of the stride, so a longer step deepens the arc faster than it
 * lengthens it - the same fraction would have put 16 mm of pitch under the eye
 * and undone the whole "felt rather than seen" tuning.
 */
const BOB_SCALE = 0.12;

/** Weight shift onto the planted foot, metres of lateral head travel. */
const HIP_SHIFT_M = 0.011;

/** Peak roll toward the planted foot, radians. About a quarter of a degree. */
const ROLL_MAX = 0.0045;

/**
 * How much consecutive steps differ, as a fraction.
 *
 * Nobody's left step matches their right. Without this the two-stride cycle
 * repeats exactly and the eye finds it immediately, which is most of what
 * "predictable" means for a head bob.
 */
const STEP_VARIATION = 0.28;

/** Which foot is carrying the body. */
export type Foot = 'left' | 'right';

/**
 * One channel of the drift: layered (frequency, amplitude) octaves, summed.
 *
 * Frequencies are in cycles per metre walked and are deliberately not simple
 * multiples of each other or of the stride, so the sum has no short period.
 */
interface Channel {
  readonly octaves: readonly (readonly [frequency: number, amplitude: number])[];
}

/**
 * The profile. Translation channels are metres, rotation channels radians.
 *
 * Amplitudes are small on purpose - the drift is meant to be felt and not seen,
 * the same way a camera operator's breathing is.
 */
const DRIFT: Record<'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll', Channel> = {
  x: {
    octaves: [
      [0.41, 0.0062],
      [1.13, 0.0021],
    ],
  },
  y: {
    octaves: [
      [0.67, 0.0045],
      [1.79, 0.0016],
    ],
  },
  z: {
    octaves: [
      [0.53, 0.0038],
      [1.37, 0.0013],
    ],
  },
  yaw: {
    octaves: [
      [0.29, 0.0028],
      [0.83, 0.0011],
    ],
  },
  pitch: {
    octaves: [
      [0.37, 0.0024],
      [0.97, 0.001],
    ],
  },
  roll: {
    octaves: [
      [0.31, 0.0035],
      [0.71, 0.0014],
    ],
  },
};

/**
 * A standing body is not a tripod.
 *
 * Weight shifts, the chest rises, the head drifts a few millimetres. Sampled on
 * a slow clock rather than on distance, because it happens while the feet are
 * still. Small enough that it never competes with the walk.
 */
const BREATH_HZ = 0.21;
const BREATH_Y_M = 0.0028;
const BREATH_SWAY_M = 0.0035;

/** Fixed seeds: the walk must render identically on every machine and every run. */
const noiseA = createNoise2D(seeded(0x5eed1));
const noiseB = createNoise2D(seeded(0x5eed2));

/** Mulberry32. A deterministic source so simplex builds the same table anywhere. */
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

/** Sum a channel's octaves at a point along the walk. */
function drift(channel: Channel, distanceM: number, lane: number): number {
  let total = 0;
  for (const [frequency, amplitude] of channel.octaves) {
    total += noiseA(distanceM * frequency, lane) * amplitude;
  }
  return total;
}

/**
 * A stable per-step number in [-1, 1]. Same step index, same value, forever -
 * so the variation is real variation and not frame-to-frame jitter.
 */
function stepJitter(step: number, lane: number): number {
  return noiseB(step * 1.37 + 0.5, lane * 3.1 + 0.5);
}

export interface GaitOffsets {
  /** Head height relative to the standing apex, metres. */
  readonly bobY: number;
  /** Head offset across the direction of travel, metres. Positive is right. */
  readonly lateral: number;
  /** Head offset along the direction of travel, metres. Positive is forward. */
  readonly surge: number;
  /** Camera roll, radians. */
  readonly roll: number;
  /** Camera yaw offset, radians. */
  readonly yaw: number;
  /** Camera pitch offset, radians. */
  readonly pitch: number;
  /** The foot currently carrying the body. */
  readonly foot: Foot;
  /** Position within the current step, 0 at hand-off, 0.5 at the apex. */
  readonly stepPhase: number;
}

/**
 * The pose of the head.
 *
 * @param distanceM total ground covered since the walk began, metres
 * @param weight    0 standing, 1 walking at full stride. Scales the step and
 *                  the drift. Because rest is the apex, fading it out settles
 *                  the head UP to standing height rather than dropping it.
 * @param breathS   seconds on the idle clock, for the standing-still drift
 */
export function gaitOffsets(distanceM: number, weight: number, breathS = 0): GaitOffsets {
  const phase = distanceM / STRIDE_M;
  const step = Math.floor(phase);
  const stepPhase = phase - step;

  const onLeft = (step & 1) === 0;
  const side = onLeft ? -1 : 1;

  // No two steps the same: this step's depth and lean are nudged by a value
  // that depends only on which step it is.
  const depthScale = 1 + STEP_VARIATION * stepJitter(step, 0);
  const leanScale = 1 + STEP_VARIATION * stepJitter(step, 1);

  // Horizontal distance from the planted foot to the hips: zero at mid-step,
  // half a stride either side of it at the hand-offs.
  const reach = STRIDE_M * (stepPhase - 0.5);
  const hipHeight = Math.sqrt(Math.max(0, LEG_M * LEG_M - reach * reach));
  const stepBob = (hipHeight - LEG_M) * BOB_SCALE * depthScale;

  // One lateral cycle per two steps against two vertical cycles per two steps,
  // which is what draws Pope's narrow figure-eight. It is not applied as a
  // shape; it falls out of the two rates.
  const shift = Math.sin(Math.PI * stepPhase);
  const stepLateral = side * HIP_SHIFT_M * shift * leanScale;
  const stepRoll = side * ROLL_MAX * shift * leanScale;

  // The drift rides along with the walk, so it fades in and out with it.
  const breathPhase = breathS * BREATH_HZ * Math.PI * 2;
  const idle = 1 - 0.55 * weight;

  return {
    bobY:
      stepBob * weight +
      drift(DRIFT.y, distanceM, 0) * weight +
      Math.sin(breathPhase) * BREATH_Y_M * idle,
    lateral:
      stepLateral * weight +
      drift(DRIFT.x, distanceM, 1) * weight +
      // No phase offset, on either breath channel. An offset here would leave
      // the eye a few millimetres off centre at rest, which quietly breaks the
      // one guarantee this module makes: rest is exactly the apex.
      Math.sin(breathPhase * 0.53) * BREATH_SWAY_M * idle,
    surge: drift(DRIFT.z, distanceM, 2) * weight,
    roll: stepRoll * weight + drift(DRIFT.roll, distanceM, 3) * weight,
    yaw: drift(DRIFT.yaw, distanceM, 4) * weight,
    pitch: drift(DRIFT.pitch, distanceM, 5) * weight,
    foot: onLeft ? 'left' : 'right',
    stepPhase,
  };
}

/**
 * Whether a foot landed between two distances, and which one.
 *
 * Keyed to ground covered rather than to elapsed time, so the footstep sound
 * cannot drift out of step with the legs: the same number drives both.
 */
export function footfallBetween(fromM: number, toM: number): Foot | null {
  if (toM <= fromM) return null;
  const from = Math.floor(fromM / STRIDE_M);
  const to = Math.floor(toM / STRIDE_M);
  if (to === from) return null;
  return (to & 1) === 0 ? 'left' : 'right';
}

/**
 * Which footstep sample to play for a step, and how to pitch it.
 *
 * Chosen from the step index rather than at random, so a given step always
 * sounds the same - a walk that is deterministic to the eye and not to the ear
 * is still not reproducible.
 */
export function footfallVoice(
  distanceM: number,
  sampleCount: number
): { readonly index: number; readonly rate: number; readonly gain: number } {
  const step = Math.floor(distanceM / STRIDE_M);
  const pick = Math.abs(Math.floor(stepJitter(step, 7) * 1e6)) % Math.max(1, sampleCount);
  return {
    index: pick,
    // A few per cent either way. Enough to stop identical samples reading as a
    // loop, small enough that the boot never changes size.
    rate: 1 + 0.07 * stepJitter(step, 8),
    gain: 0.82 + 0.18 * Math.abs(stepJitter(step, 9)),
  };
}
