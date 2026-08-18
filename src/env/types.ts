/**
 * The environment contract.
 *
 * An environment is a place the player stands in and walks around: one room,
 * one module, one exterior vantage. Environments are deliberately SEPARATE
 * from the game - they are built, viewed and approved one at a time through
 * the standalone viewer (rooms.html), and nothing here may import game state.
 * When an environment is approved, the game mounts the same module unchanged.
 *
 * Rules for anything implementing this:
 *   - Build all geometry in code. There is no asset pipeline.
 *   - Every animation is a pure function of the time passed to update().
 *     No Date.now(), no Math.random() at frame time - the screenshot harness
 *     pins the clock and expects identical frames for identical times.
 *   - Obey docs/DIRECTION.md. The palette gate reads the rendered pixels.
 */
import type * as THREE from 'three';

/** Where the player starts, and which way they face. */
export interface Spawn {
  /** Eye position in metres, world space. */
  readonly position: readonly [number, number, number];
  /** Look direction as yaw/pitch in radians. Pitch 0 is the horizon. */
  readonly yaw: number;
  readonly pitch: number;
}

/**
 * The walkable floor plan, as axis-aligned rectangles in metres on the XZ
 * plane. Movement is clamped to the union of these, which is cheap, exact,
 * and never produces the jitter of a collider stack. A doorway between two
 * rooms is just an overlap between two rectangles.
 */
export interface FloorRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Floor height in metres at this rectangle. */
  readonly floorY: number;
}

/** A thing the player can walk up to and look at. Inspection comes later. */
export interface PointOfInterest {
  readonly id: string;
  /** Lower case, the machine's voice: 'flight computer', 'the window'. */
  readonly label: string;
  readonly position: readonly [number, number, number];
  /**
   * True when `interact()` will actually do something here.
   *
   * The hand is the whole interface - there is no cursor, no highlight and no
   * prompt - so the reach is a PROMISE. Reaching for something inert makes the
   * one signal the player has mean nothing, and a hand that touches the window
   * on the way past teaches that touching is ambient rather than deliberate.
   * The arm therefore only ever reaches for points carrying this flag, and a
   * test holds it to whatever `interact()` really accepts.
   */
  readonly operable?: boolean;
}

export interface EnvironmentHandle {
  /** Everything this environment draws. The viewer adds it to the scene. */
  readonly root: THREE.Object3D;
  readonly spawn: Spawn;
  readonly floor: readonly FloorRect[];
  readonly pointsOfInterest: readonly PointOfInterest[];
  /** Eye height above floorY, in metres. */
  readonly eyeHeight: number;
  /**
   * Fundamental of this room's own machinery, hertz, if it has any.
   *
   * The viewer owns the audio context but must not own what a room sounds
   * like: the pitch of the ventilation is a fact about the fan in THIS room,
   * and a room without machinery simply omits it and stays silent.
   */
  readonly machineryHz?: number | undefined;
  /**
   * What this room's one moving mechanism is doing, for the audio layer.
   *
   * Mutated in place each `update()`; read it, do not keep it. `travel` is 0
   * shut to 1 open and `speed` is 0 to 1 of full rate. The viewer owns the
   * audio context but must not own what a door sounds like, and polling one
   * struct is a great deal less machinery than an event channel for a room that
   * has exactly one thing in it that moves.
   */
  readonly mechanism?: { travel: number; speed: number };
  /**
   * Where the player's eye is, world space, handed over once per frame BEFORE
   * `update`.
   *
   * Optional, and almost nothing implements it: a room is a fixed set of
   * geometry and has no business knowing where it is being looked at from. The
   * station does, because streaming is the one decision that depends on the
   * player's position rather than on the clock, and `update` only carries a
   * clock. Anything implementing this must stay a pure function of the arguments
   * it is given, like everything else here - the shot harness sets a pose and
   * then a time and expects the same frame every run.
   */
  observe?(eye: THREE.Vector3): void;
  /**
   * Advance every animation to an absolute time. Absolute rather than delta so
   * the same time always produces the same frame: the shot harness pins it,
   * and a dropped frame can never accumulate drift.
   *
   * @param tSeconds seconds since the environment was created
   */
  update(tSeconds: number): void;
  /**
   * Act on a point of interest the hand is already holding.
   *
   * Optional: a room with nothing to operate simply omits it. The id is
   * whichever `PointOfInterest` the arm has taken hold of - there is no cursor
   * and nothing to aim, so the reach IS the selection, and this only ever
   * receives something the player was already touching.
   *
   * Returns true if something actually happened, so the caller knows whether to
   * make a sound. A press on a thing that is already pressed returns false.
   */
  interact?(id: string): boolean;
  /** Release GPU resources. The viewer calls this when switching rooms. */
  dispose(): void;
}

export interface EnvironmentDefinition {
  /** Stable slug, used in the viewer URL: rooms.html#observation-deck */
  readonly id: string;
  /** Display name, ALL CAPS in the viewer chrome. */
  readonly name: string;
  /** One line on what this place is. */
  readonly description: string;
  build(): EnvironmentHandle;
}
