import { describe, expect, it } from 'vitest';
import { R_EARTH, length, stateAt, type Elements, type Vec3 } from '../src/sim';
import {
  kmToScene,
  scenePointFromSim,
  sceneToKm,
  simPointFromScene,
  type ScenePoint,
} from '../src/render/units';

describe('kmToScene', () => {
  it('maps one Earth radius to one scene unit', () => {
    expect(kmToScene(R_EARTH)).toBeCloseTo(1, 12);
  });

  it('inverts through sceneToKm', () => {
    for (const km of [0, 1, 500, R_EARTH, 42164]) {
      expect(sceneToKm(kmToScene(km))).toBeCloseTo(km, 9);
    }
  });
});

describe('sim-to-scene frame mapping', () => {
  it('sends sim z (the pole) to scene y (up)', () => {
    const p = scenePointFromSim({ x: 0, y: 0, z: R_EARTH });
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
    expect(p.z).toBeCloseTo(0, 12);
  });

  it('sends sim x to scene x', () => {
    const p = scenePointFromSim({ x: R_EARTH, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(1, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(0, 12);
  });

  it('sends sim y to scene minus z', () => {
    const p = scenePointFromSim({ x: 0, y: R_EARTH, z: 0 });
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(-1, 12);
  });

  it('preserves handedness: image of x cross image of y is image of z', () => {
    const ix = scenePointFromSim({ x: 1, y: 0, z: 0 });
    const iy = scenePointFromSim({ x: 0, y: 1, z: 0 });
    const iz = scenePointFromSim({ x: 0, y: 0, z: 1 });

    const crossed: ScenePoint = {
      x: ix.y * iy.z - ix.z * iy.y,
      y: ix.z * iy.x - ix.x * iy.z,
      z: ix.x * iy.y - ix.y * iy.x,
    };
    // Both inputs were scaled by kmToScene once; the cross product carries the
    // factor twice, so compare against iz scaled once more.
    const scale = kmToScene(1);
    expect(crossed.x).toBeCloseTo(iz.x * scale, 12);
    expect(crossed.y).toBeCloseTo(iz.y * scale, 12);
    expect(crossed.z).toBeCloseTo(iz.z * scale, 12);
  });

  it('preserves length, so distances survive the frame change', () => {
    const p: Vec3 = { x: 4123.7, y: -2210.4, z: 5580.9 };
    const s = scenePointFromSim(p);
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(kmToScene(length(p)), 12);
  });

  it('round-trips points sampled from a real orbit', () => {
    const el: Elements = { a: R_EARTH + 3000, e: 0.35, i: 0.5, raan: 2.0, argp: 0.3, m0: 1.7 };
    for (let k = 0; k < 12; k += 1) {
      const p = stateAt(el, k * 700).position;
      const back = simPointFromScene(scenePointFromSim(p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
      expect(back.z).toBeCloseTo(p.z, 6);
    }
  });
});
