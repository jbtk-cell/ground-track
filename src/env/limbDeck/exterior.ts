/**
 * THE LIMB DECK - the window, and the second pass that fills it.
 *
 * A pane is a hole, not a picture: the glass is never drawn, and what shows
 * through the cupola's seven of them is the existing orbital renderer
 * (src/render/scene.ts) run into the same canvas as the room, scissored to
 * their union. Two passes, in the order docs/ENVIRONMENTS.md fixes:
 *
 *   setClearColor(VOID_SLATE); clear();
 *   setScissorTest(true); setScissor(apertureRect);
 *   render(exterior, exteriorCamera);
 *   setScissorTest(false);
 *   clearDepth();                       // AFTER the scissor is off, or it
 *   render(interior, interiorCamera);   //   only clears inside the rect
 *
 * Three traps live in those six lines and each one is load-bearing:
 *
 *   1. `renderer.autoClear` defaults true, so the interior pass would wipe the
 *      exterior before drawing a triangle. It is forced false here and put back
 *      afterwards, along with every other renderer flag this touches - the four
 *      committed orbital baselines are rendered by the same class of renderer
 *      and any flag left flipped is drift they would have to absorb.
 *   2. The aperture rect is the screen-space AABB of the pane corners clipped
 *      against the near plane IN VIEW SPACE before projecting. Vector3.project()
 *      on a point behind the camera divides by a negative w and returns mirrored
 *      NDC, which blows the AABB out to the whole screen exactly when the player
 *      stands beside the cupola with one pane corner behind them - the most
 *      common pose in the room, and now true of seven panes rather than one.
 *   3. The interior scene must not carry a background colour. three.js clears
 *      the colour buffer for a scene whose background is set, autoClear or not,
 *      and that clear would land on top of the exterior pass. The room's root
 *      IS the interior scene and it holds background null; see index.ts.
 *
 * Everything here is a pure function of the Frame. The exterior camera's
 * station frame comes out of the same orbital sample the light rig runs on, so
 * the ground under the window is the ground the earthshine is coloured by.
 */
import * as THREE from 'three';
import { setAtmosphereSun } from '../../render/atmosphere';
import { PALETTE } from '../../render/palette';
import { createScene, type SceneHandle } from '../../render/scene';
import { R_EARTH } from '../../sim';
import { LIMB_DECK_ORBIT, sampleOrbit, type OrbitGeometry } from '../orbit';
import type { Aperture, Frame } from './contract';

/**
 * The station's orbit radius in scene units. Scene units are Earth radii
 * (scene.ts), so 400 km is 1.0627 - the camera sits barely off the planet
 * compared with the 2.25-4.1 the exterior presets frame from.
 */
const STATION_RADIUS_UNITS = (R_EARTH + LIMB_DECK_ORBIT.altitudeKm) / R_EARTH;

/**
 * The atmosphere shell, re-tuned for this altitude and for this instance only.
 *
 * What is visible of the shell is the annulus between the planet's silhouette
 * and its own, and the rim ramp across that annulus is fixed by the 1.035 scale
 * factor alone - it runs 0.74 at the horizon to 1.0 at the shell's tangent from
 * any distance. What the distance changes is how wide the annulus is on screen:
 * 4 degrees of arc from 2.25 Earth radii, where the defaults (uPower 2.9,
 * uIntensity 1.25) draw DIRECTION.md's crisp rim, and 6.7 degrees from 1.063
 * radii, where the same falloff smears a cream wash across a fifth of the
 * window. The exponent is what pulls it back: at 9 the band's visible half is
 * the outer three degrees above the horizon, which is the ~200 km of altitude
 * haze DIRECTION.md asks for, and it is thin enough to read as an edge on the
 * planet rather than as weather in the room.
 *
 * These are the uniforms of the atmosphere THIS module built - createScene()
 * mints a fresh ShaderMaterial per call - never the defaults in atmosphere.ts,
 * which the four committed orbital baselines depend on byte-for-byte.
 */
const LIMB_ATMOSPHERE_POWER = 16;
const LIMB_ATMOSPHERE_INTENSITY = 1.0;

/**
 * Exterior camera clip planes, in Earth radii.
 *
 * Nothing outboard is nearer than the atmosphere shell at 0.028 units (180 km),
 * so the near plane can stand well off zero and hand the depth buffer back the
 * precision the planet's 16 820 facets need at this range. The far plane clears
 * the starfield at 180 units.
 */
const EXTERIOR_NEAR = 0.005;
const EXTERIOR_FAR = 400;

/**
 * How far ahead the ground track is sampled for the ram direction.
 *
 * The station holds LVLH nadir-hold, so +X is the direction of travel. Taking
 * it as the way the sub-satellite point is moving rather than deriving the
 * inertial velocity folds in Earth's rotation, which skews the axis by about
 * three degrees of azimuth at this inclination - below the width of one hull
 * facet through the window, and it comes straight out of the orbit module
 * instead of out of a second derivation that could disagree with it.
 */
const TRACK_LOOKAHEAD_S = 0.5;

/** A convex polygon clipped by one plane gains at most one vertex, and the
 *  widest pane in the cupola is the six-sided view pane. */
const MAX_CLIPPED_VERTS = 7;

/** Grown by this many pixels a side. See apertureRect. */
const RECT_PAD_PX = 2;

export interface ExteriorHandle {
  /** Advances the station frame. Pure in the Frame, like every other animator. */
  update(frame: Frame): void;
  /**
   * Draws the whole canvas: the exterior through the aperture, then the room
   * over the top of it. The viewer hands the interior scene and camera in
   * because the room is what it mounted; this module owns the other pass.
   */
  render(
    renderer: THREE.WebGLRenderer,
    interior: THREE.Scene,
    interiorCamera: THREE.PerspectiveCamera
  ): void;
  dispose(): void;
}

/**
 * A unit vector to a point on the globe, in the exterior scene's frame.
 *
 * The convention is earth.ts's, verbatim: longitude runs toward -Z, so the same
 * latitude and longitude name the same ground here, in albedoAt(), and on the
 * mesh. A room whose earthshine is sampled off one convention and whose window
 * shows the other is a room where the ceiling turns green over the ocean.
 */
function geodeticDirection(
  latitude: number,
  longitude: number,
  target: THREE.Vector3
): THREE.Vector3 {
  const cosLat = Math.cos(latitude);
  return target.set(
    cosLat * Math.cos(longitude),
    Math.sin(latitude),
    -cosLat * Math.sin(longitude)
  );
}

/**
 * Sutherland-Hodgman against the near plane, in view space, where the plane is
 * simply z <= -near. Returns the new vertex count.
 */
function clipToNear(
  source: readonly THREE.Vector3[],
  count: number,
  target: readonly THREE.Vector3[],
  near: number
): number {
  let out = 0;
  for (let i = 0; i < count; i += 1) {
    const a = source[i];
    const b = source[(i + 1) % count];
    if (a === undefined || b === undefined) continue;

    // Positive in front of the near plane, negative behind it.
    const da = -near - a.z;
    const db = -near - b.z;
    const aIn = da >= 0;
    const bIn = db >= 0;

    if (aIn) {
      const slot = target[out];
      if (slot === undefined) break;
      slot.copy(a);
      out += 1;
    }
    if (aIn !== bIn) {
      const slot = target[out];
      if (slot === undefined) break;
      slot.lerpVectors(a, b, da / (da - db));
      out += 1;
    }
  }
  return out;
}

export function buildExterior(
  apertures: readonly Aperture[],
  geometry: OrbitGeometry
): ExteriorHandle {
  const handle: SceneHandle = createScene();
  const camera = handle.camera;
  camera.near = EXTERIOR_NEAR;
  camera.far = EXTERIOR_FAR;

  const atmosphere = handle.atmosphere.material as THREE.ShaderMaterial;
  const power = atmosphere.uniforms['uPower'];
  const intensity = atmosphere.uniforms['uIntensity'];
  if (power !== undefined) power.value = LIMB_ATMOSPHERE_POWER;
  if (intensity !== undefined) intensity.value = LIMB_ATMOSPHERE_INTENSITY;

  // --- Scratch. Allocated once; nothing per frame allocates. -----------------

  let widest = 0;
  for (const pane of apertures) widest = Math.max(widest, pane.corners.length);
  const viewCorners: THREE.Vector3[] = [];
  for (let i = 0; i < widest; i += 1) viewCorners.push(new THREE.Vector3());
  const clipped: THREE.Vector3[] = [];
  for (let i = 0; i < widest + MAX_CLIPPED_VERTS; i += 1) clipped.push(new THREE.Vector3());
  const projected = new THREE.Vector3();

  const zenith = new THREE.Vector3(0, 1, 0);
  const ahead = new THREE.Vector3();
  const ram = new THREE.Vector3(1, 0, 0);
  const starboard = new THREE.Vector3(0, 0, 1);
  const basis = new THREE.Matrix4();
  /** Maps a station-frame direction into the exterior scene's frame. */
  const attitude = new THREE.Quaternion();
  const sun = new THREE.Vector3();
  const aim = new THREE.Quaternion();

  const size = new THREE.Vector2();
  const savedScissor = new THREE.Vector4();
  const savedClear = new THREE.Color();
  const voidSlate = new THREE.Color(PALETTE.VOID_SLATE);

  const rect = { x: 0, y: 0, width: 0, height: 0 };

  /**
   * The screen-space AABB of every pane in the cupola, in CSS pixels with the
   * origin at the bottom left - which is what setScissor wants, and what NDC's
   * +Y already is.
   *
   * One rect over all seven panes rather than seven rects: the exterior is
   * drawn first and the room is drawn over the top of it, so anything the
   * exterior paints between the panes is covered by a mullion in the second
   * pass. The room is airtight from every reachable eye position, which is what
   * makes that safe. The rect is grown a couple of pixels a side for the same
   * reason it is a union - a rect a pixel short of the glass is a hairline of
   * interior grey down the edge of a window.
   */
  const apertureRect = (interiorCamera: THREE.PerspectiveCamera): boolean => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let seen = false;

    for (const pane of apertures) {
      const corners = pane.corners;
      let usable = true;
      for (let i = 0; i < corners.length; i += 1) {
        const corner = corners[i];
        const view = viewCorners[i];
        if (corner === undefined || view === undefined) {
          usable = false;
          break;
        }
        view.copy(corner).applyMatrix4(interiorCamera.matrixWorldInverse);
      }
      if (!usable) continue;

      const count = clipToNear(viewCorners, corners.length, clipped, interiorCamera.near);
      if (count < 3) continue;
      seen = true;

      for (let i = 0; i < count; i += 1) {
        const vertex = clipped[i];
        if (vertex === undefined) continue;
        // Every vertex is now in front of the near plane, so w is positive and
        // the perspective divide cannot mirror it.
        projected.copy(vertex).applyMatrix4(interiorCamera.projectionMatrix);
        minX = Math.min(minX, projected.x);
        maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y);
        maxY = Math.max(maxY, projected.y);
      }
    }
    if (!seen) return false;

    const toPixels = (ndc: number, extent: number): number => (ndc * 0.5 + 0.5) * extent;
    const left = Math.floor(toPixels(Math.max(minX, -1), size.x)) - RECT_PAD_PX;
    const right = Math.ceil(toPixels(Math.min(maxX, 1), size.x)) + RECT_PAD_PX;
    const bottom = Math.floor(toPixels(Math.max(minY, -1), size.y)) - RECT_PAD_PX;
    const top = Math.ceil(toPixels(Math.min(maxY, 1), size.y)) + RECT_PAD_PX;

    rect.x = Math.max(0, left);
    rect.y = Math.max(0, bottom);
    rect.width = Math.min(size.x, right) - rect.x;
    rect.height = Math.min(size.y, top) - rect.y;
    return rect.width > 0 && rect.height > 0;
  };

  return {
    update(frame: Frame): void {
      const sample = frame.orbit;

      // The station frame, expressed in the exterior scene: zenith through the
      // sub-satellite point, ram along the ground track, starboard closing the
      // right-handed set. The room's own axes are these axes, so an interior
      // rotation composes straight onto it.
      geodeticDirection(sample.latitude, sample.longitude, zenith);
      const next = sampleOrbit(frame.t + TRACK_LOOKAHEAD_S, geometry);
      geodeticDirection(next.latitude, next.longitude, ahead);
      ram.copy(ahead).addScaledVector(zenith, -ahead.dot(zenith));
      // Degenerate only if the track stood still, which a circular orbit does
      // not do; the fallback keeps the basis a rotation rather than a collapse.
      if (ram.lengthSq() < 1e-12) ram.set(1, 0, 0).addScaledVector(zenith, -zenith.x);
      ram.normalize();
      starboard.crossVectors(ram, zenith).normalize();

      basis.makeBasis(ram, zenith, starboard);
      attitude.setFromRotationMatrix(basis);

      camera.position.copy(zenith).multiplyScalar(STATION_RADIUS_UNITS);

      // The sun the room is lit by, pointed at the planet the room looks at.
      // One vector, two scenes: the terminator through the glass and the shaft
      // on the deck cannot disagree about where the sun is.
      sun.set(sample.sun.x, sample.sun.y, sample.sun.z).applyQuaternion(attitude);
      handle.setSunDirection(sun);

      // And the atmosphere gets the anti-sun, on this instance only.
      //
      // The shell is an inverted sphere drawn BackSide, and its shader flips
      // the interpolated normal because the face it shades is the far one. From
      // 2.25 radii that flip is fair: the back face behind the middle of the
      // disc stands in for the atmosphere above the ground you are looking at,
      // and the day term lands on the right side of the terminator. From 1.063
      // radii there is no middle of the disc left - every fragment is limb, and
      // the face a grazing ray exits through sits about fifteen degrees past
      // the tangent point, on the far side of the planet. Its flipped normal
      // points back at the observer, so dot(normal, sun) comes out with the
      // wrong sign and the sunlit limb renders in the night colour at a fifth
      // of the alpha - the haze goes out exactly where it should be brightest.
      // Handing this instance the anti-sun puts the day term back on the
      // correct side, to within fifteen degrees of a smoothstep that is already
      // forty degrees wide.
      setAtmosphereSun(handle.atmosphere, sun.negate());
    },

    render(renderer, interior, interiorCamera): void {
      const wasAutoClear = renderer.autoClear;
      const wasScissorTest = renderer.getScissorTest();
      const wasClearAlpha = renderer.getClearAlpha();
      renderer.getScissor(savedScissor);
      renderer.getClearColor(savedClear);

      renderer.autoClear = false;
      renderer.setScissorTest(false);
      renderer.setClearColor(voidSlate, 1);
      renderer.clear(true, true, true);

      renderer.getSize(size);
      interiorCamera.updateMatrixWorld();

      if (apertureRect(interiorCamera)) {
        // Same rotation, same field of view, same aspect: a pixel in the rect
        // then looks along the ray it would have looked along from inside the
        // room. The eye's own few metres of travel are 4e-7 Earth radii, below
        // a float32's last bit at this radius, so the camera stays on the
        // station's centre and the parallax comes from where the aperture
        // lands on screen - which is exactly where it comes from in life.
        camera.fov = interiorCamera.fov;
        camera.aspect = interiorCamera.aspect;
        camera.updateProjectionMatrix();
        interiorCamera.getWorldQuaternion(aim);
        camera.quaternion.copy(attitude).multiply(aim);

        renderer.setScissorTest(true);
        renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
        renderer.render(handle.scene, camera);
        renderer.setScissorTest(false);
      }

      renderer.clearDepth();
      renderer.render(interior, interiorCamera);

      renderer.autoClear = wasAutoClear;
      renderer.setScissorTest(wasScissorTest);
      renderer.setScissor(savedScissor);
      renderer.setClearColor(savedClear, wasClearAlpha);
    },

    dispose(): void {
      handle.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      handle.scene.clear();
    },
  };
}
