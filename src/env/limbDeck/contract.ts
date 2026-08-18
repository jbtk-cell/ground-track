/**
 * Internal contract for THE LIMB DECK.
 *
 * Written by hand before the build; the shell, fixtures, lighting and viewer
 * are built against this file in parallel. Add types freely, but do not change
 * or remove what is here.
 *
 * See docs/ENVIRONMENTS.md for the room's specification and the reasons behind
 * the rules (no shadow maps, emissive floor at 1.0, analytic light shaft).
 */
import type * as THREE from 'three';
import type { OrbitSample } from '../orbit';

/** Everything an animator is allowed to know at a given moment. */
export interface Frame {
  /** Absolute seconds since the environment was built. */
  readonly t: number;
  /** The orbital clock, already solved. Nobody recomputes this. */
  readonly orbit: OrbitSample;
  /** True when the viewer honours prefers-reduced-motion. */
  readonly reducedMotion: boolean;
}

/** A part of the room that moves. Pure: same Frame in, same pose out. */
export interface Animated {
  readonly root: THREE.Object3D;
  update(frame: Frame): void;
  dispose(): void;
}

/**
 * The window opening, in room coordinates. The exterior pass needs the pane
 * corners to compute its scissor rect; the lighting needs them to project the
 * shaft. One source of truth, owned by the shell.
 */
export interface Aperture {
  /** Pane corners, world space, counter-clockwise seen from inside. */
  readonly corners: readonly THREE.Vector3[];
  /** Unit normal, pointing outboard. */
  readonly normal: THREE.Vector3;
  readonly centre: THREE.Vector3;
}

export interface ShellHandle extends Animated {
  /**
   * Every pane in the cupola. The first is the view pane, aimed at the limb;
   * the rest are the angled facets around it.
   *
   * There is more than one for a physical reason discovered during the build:
   * a single pane aimed at Earth admits no sunlight, because the sun is never
   * where Earth is. At beta 38 the sun sits 64-67 degrees off a limb-aimed
   * normal for most of a revolution, and 0.52 m of throat depth at that
   * incidence walks the beam 1.03 m across an aperture 0.74 m tall. The
   * angled facets are what let the sun into the room, which is the same
   * reason the Cupola is a dome and not a porthole.
   */
  readonly apertures: readonly Aperture[];
  /** The pane aimed at the limb. Convenience for the exterior pass. */
  readonly viewAperture: Aperture;
  /**
   * The cupola's mouth, where the dome sits down on the hull: the narrowest
   * opening a beam has to clear on its way from a pane into the room. The
   * lighting projects each pane through it, which is what makes the claim that
   * these facets admit sunlight a measurement rather than an assertion.
   */
  readonly throat: Aperture;
  /** Deck plane height, metres. The shaft lands here. */
  readonly deckY: number;
}

/**
 * The interior light rig. Owns the sun, the earthshine directional entering
 * through the bay's lower face, the cabin lamps, and the analytic shaft.
 *
 * There are no shadow maps anywhere in this environment - see
 * docs/ENVIRONMENTS.md. The shaft is the aperture rectangle projected along
 * the sun vector onto the deck, drawn as geometry.
 */
export interface LightingHandle extends Animated {
  readonly sun: THREE.DirectionalLight;
  /**
   * The beam, for anything that has to live inside it.
   *
   * `travel` is the unit vector sunlight moves along once it is through the
   * cupola, and `strength` is 0 to 1 of the widest the aperture ever opens -
   * already carrying the umbral step, so a reader gets eclipse for free.
   * Mutated in place each frame rather than reallocated; read it, do not keep it.
   */
  readonly beam: { readonly travel: THREE.Vector3; strength: number };
}
