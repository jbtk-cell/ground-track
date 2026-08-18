import { describe, expect, it } from 'vitest';
import { footfallBetween, footfallVoice, gaitOffsets, STRIDE_M } from '../src/env/player/gait';

const CYCLE = 2 * STRIDE_M;

describe('gait', () => {
  it('puts standing still at the top of the arc, not the bottom', () => {
    // The bug Lucas Pope wrote up: taking the maximum of two feet leaves the
    // head at its LOWEST point when you stop, so stopping sinks into
    // marshmallow. Standing is legs-vertical, which is the apex. At rest, with
    // the breath clock at zero, every channel must be exactly zero - there is
    // no separate idle height that could disagree with the walk's.
    const standing = gaitOffsets(3.7, 0, 0);
    expect(Math.abs(standing.bobY)).toBe(0);
    expect(Math.abs(standing.lateral)).toBe(0);
    expect(Math.abs(standing.surge)).toBe(0);
    expect(Math.abs(standing.roll)).toBe(0);
    expect(Math.abs(standing.yaw)).toBe(0);
    expect(Math.abs(standing.pitch)).toBe(0);
  });

  it('keeps the walk below standing height on average', () => {
    // The drift can lift the eye a millimetre or two, which is the point of it,
    // but the pendulum has to dominate: a walk whose average is above standing
    // would mean stopping drops you, which is the marshmallow bug wearing a
    // different hat.
    let total = 0;
    const samples = 4000;
    for (let i = 0; i < samples; i += 1) {
      total += gaitOffsets((i / samples) * 40, 1, 0).bobY;
    }
    expect(total / samples).toBeLessThan(-0.001);
  });

  it('holds the head still enough to be felt rather than seen', () => {
    // A head bob is overdone the moment you notice it as motion instead of as
    // walking. Bounds, not a fixed number, so the feel can be tuned without
    // rewriting the test - but it can never quietly become a pogo stick.
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < 6000; i += 1) {
      const y = gaitOffsets((i / 6000) * 60, 1, 0).bobY;
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    const peakToPeak = high - low;
    expect(peakToPeak).toBeGreaterThan(0.004);
    expect(peakToPeak).toBeLessThan(0.03);
  });

  it('never repeats: no two gait cycles are the same', () => {
    // This is the "too predictable" fix, stated as a test. A pure pendulum
    // repeats exactly every two strides and the eye locks onto it within a
    // couple of paces. Layered noise at frequencies that share no multiple with
    // the stride means the pattern never closes.
    let identical = 0;
    for (let i = 0; i < 40; i += 1) {
      const d = 4 + i * 0.37;
      const here = gaitOffsets(d, 1, 0);
      const nextCycle = gaitOffsets(d + CYCLE, 1, 0);
      if (Math.abs(nextCycle.bobY - here.bobY) < 1e-5) identical += 1;
    }
    expect(identical).toBe(0);
  });

  it('still walks on the pendulum underneath the noise', () => {
    // The drift must not swamp the step. Averaged over many strides the
    // hand-off has to sit clearly below the mid-step apex, which is the
    // pendulum's whole signature and what keeps footfalls where the legs are.
    let apex = 0;
    let handoff = 0;
    const steps = 300;
    for (let i = 0; i < steps; i += 1) {
      apex += gaitOffsets((i + 0.5) * STRIDE_M, 1, 0).bobY;
      handoff += gaitOffsets(i * STRIDE_M, 1, 0).bobY;
    }
    expect(handoff / steps).toBeLessThan(apex / steps - 0.004);
  });

  it('is deterministic', () => {
    // The screenshot harness pins distance and clock and expects the same
    // pixels. Noise that reseeded per run would make every frame a new frame.
    for (const d of [0, 0.31, 2.75, 13.9]) {
      const a = gaitOffsets(d, 0.7, 1.3);
      const b = gaitOffsets(d, 0.7, 1.3);
      expect(a).toEqual(b);
    }
  });

  it('scales the walk with weight', () => {
    const full = gaitOffsets(0.2 * STRIDE_M, 1, 0);
    const half = gaitOffsets(0.2 * STRIDE_M, 0.5, 0);
    expect(half.bobY).toBeCloseTo(full.bobY / 2, 12);
    expect(half.lateral).toBeCloseTo(full.lateral / 2, 12);
    expect(half.roll).toBeCloseTo(full.roll / 2, 12);
  });

  it('breathes while standing still', () => {
    // A standing body is not a tripod. Small, but not nothing.
    const a = gaitOffsets(2, 0, 0.9);
    const b = gaitOffsets(2, 0, 3.4);
    expect(a.bobY).not.toBeCloseTo(b.bobY, 6);
    expect(Math.abs(a.bobY)).toBeLessThan(0.004);
    expect(Math.abs(a.lateral)).toBeLessThan(0.005);
  });

  it('lands one footfall per stride, alternating', () => {
    expect(footfallBetween(0.1, 0.2)).toBeNull();
    expect(footfallBetween(0.5, 0.5)).toBeNull();

    const feet: string[] = [];
    const step = STRIDE_M / 8;
    let previous = 0;
    for (let i = 1; i <= 8 * 6; i += 1) {
      const now = i * step;
      const foot = footfallBetween(previous, now);
      if (foot !== null) feet.push(foot);
      previous = now;
    }
    expect(feet).toEqual(['right', 'left', 'right', 'left', 'right', 'left']);
  });

  it('picks a different footstep sample from step to step', () => {
    // One sample on a loop is the audible version of a perfect sine: the ear
    // finds the repeat in a few paces.
    const picks = new Set<number>();
    for (let step = 0; step < 24; step += 1) {
      const voice = footfallVoice(step * STRIDE_M + 0.01, 10);
      expect(voice.index).toBeGreaterThanOrEqual(0);
      expect(voice.index).toBeLessThan(10);
      expect(voice.rate).toBeGreaterThan(0.9);
      expect(voice.rate).toBeLessThan(1.1);
      expect(voice.gain).toBeGreaterThan(0.8);
      expect(voice.gain).toBeLessThanOrEqual(1);
      picks.add(voice.index);
    }
    expect(picks.size).toBeGreaterThan(4);

    // And the same step always sounds the same.
    expect(footfallVoice(5 * STRIDE_M + 0.01, 10)).toEqual(footfallVoice(5 * STRIDE_M + 0.02, 10));
  });
});
