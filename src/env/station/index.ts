/**
 * THE STATION - many compartments, a few of them real at any moment.
 *
 * This is one `EnvironmentHandle` that happens to be made of rooms. The viewer
 * mounts it exactly the way it mounts a single room, which is deliberate: the
 * alternative was teaching the viewer about rooms, residency, placement and
 * routing, and the viewer's job is to run a camera and a pair of legs.
 *
 * EVERY COMPARTMENT IS BUILT, ALL OF THEM, AT MOUNT. This used to stream a
 * sliding window of the current room plus its neighbours. Measured, the whole
 * station is 12 840 triangles and 145 ms - and 11 364 of those triangles are the
 * limb deck, which is the anchor and resident at all times regardless. The
 * streaming existed to manage the other 1 476, and it cost three defects shaped
 * like "the room next door does not exist yet".
 *
 * When there is enough station that this does matter, the thing to stream is a
 * WING - a run of compartments behind a door that is shut - rather than a sliding
 * window of neighbours. A shut door is a real seam with a real moment to hide the
 * work behind; "two rooms away" is not, which is why the sliding window kept
 * having to be told where the player was and kept being told too late.
 *
 * WHAT MAKES IT SAFE. Three things that are all tests rather than intentions:
 * the layout must close (`layOut` throws rather than placing a room inside
 * another), no two compartments may occupy the same cubic metre (`overlaps`), and
 * every room's own geometry must survive the checks in `tests/rooms.test.ts`. A
 * bug in placement is invisible in the room you are standing in, which is the
 * only room you can see.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import type { EnvironmentHandle, FloorRect, PointOfInterest, Spawn } from '../types';
import {
  type CompartmentDefinition,
  type CompartmentHandle,
  type Painter,
  isPainter,
} from './compartment';
import { type Connection, type Placement, layOut } from './layout';
import { SEAM, type Port, facingVector } from './ports';

export interface StationPlan {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rooms: readonly CompartmentDefinition[];
  readonly connections: readonly Connection[];
  /** Placed at the origin; everything else is positioned relative to it. */
  readonly anchor: string;
  /** Which room the player starts in. Defaults to the anchor. */
  readonly start?: string;
}

/**
 * How far inside a room's floor the eye has to be before that room becomes the
 * one you are in.
 *
 * Without this the current room flips every frame while you stand in a doorway,
 * because a doorway is where two floor rectangles overlap - which is exactly how
 * `FloorRect` was designed to join rooms, so the overlap is not going away. Each
 * flip used to tear down one room's neighbours and build another's several times
 * a second, in the one place where the player can see both. Nothing is torn down
 * now, but the room you are IN still picks the room tone and the machinery hum,
 * and those should not stutter in a doorway either.
 */
const COMMIT_M = 0.45;

/**
 * ...but never more than this fraction of the rectangle's own half-width.
 *
 * A fixed margin is a different rule in a different sized room. The corridor's
 * floor is 1.5 m wide, so a flat 0.45 m left a commit band of only +/-0.30 m
 * inside a room the player may stand +/-0.55 m across: step off the centreline -
 * more than half the walkable width - and the station never committed, so the
 * compartment beyond the far door was never built and you were looking through a
 * doorway at open space. It sealed the moment you walked up the middle once,
 * which is exactly what every pinned preset does.
 */
const COMMIT_FRACTION = 0.3;

/**
 * Headroom over a standing eye a doorway needs before the floor runs through it.
 *
 * This used to be a fraction of the door's travel, 0.35, on the reasoning that
 * "the leaves clear the head long before they are fully parked". A fraction
 * cannot answer this question at all - it says nothing about how tall the door
 * is - and the guess was three times too low. The aft door's leaves are geared
 * to arrive together, so its clear opening is 0.016 + 1.994 x travel metres: at
 * 0.35 the hole is 0.71 m tall, and the floor ran straight through it while the
 * eye at 1.74 m passed through two leaves. Reported as "I can walk through the
 * wall of the door sometimes", and the sometimes was how far up the leaves had
 * got when you arrived.
 *
 * Asking the door how tall its hole is instead makes the rule the obvious one,
 * and it stays right for a door built to any other proportion.
 */
const DOOR_HEAD_M = 0.1;

/** How far in front of a shut door the floor stops, metres. */
const DOOR_STOP_M = 0.12;

interface Resident {
  readonly id: string;
  readonly handle: CompartmentHandle;
  readonly group: THREE.Group;
  readonly placement: Placement;
}

/** A room's floor rectangles, moved into world space. */
function worldFloor(handle: CompartmentHandle, placement: Placement): readonly FloorRect[] {
  const corner = new THREE.Vector3();
  return handle.floor.map((rect) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const x of [rect.minX, rect.maxX]) {
      for (const z of [rect.minZ, rect.maxZ]) {
        corner.set(x, 0, z).applyMatrix4(placement.matrix);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minZ = Math.min(minZ, corner.z);
        maxZ = Math.max(maxZ, corner.z);
      }
    }
    // Yaw is a multiple of a right angle for every placement the layout can
    // produce, so an axis-aligned rectangle stays axis-aligned and this is exact
    // rather than a bounding box that has quietly grown.
    return { minX, maxX, minZ, maxZ, floorY: rect.floorY + placement.position.y };
  });
}

function inside(rect: FloorRect, x: number, z: number): boolean {
  const marginX = Math.min(COMMIT_M, ((rect.maxX - rect.minX) / 2) * COMMIT_FRACTION);
  const marginZ = Math.min(COMMIT_M, ((rect.maxZ - rect.minZ) / 2) * COMMIT_FRACTION);
  return (
    x >= rect.minX + marginX &&
    x <= rect.maxX - marginX &&
    z >= rect.minZ + marginZ &&
    z <= rect.maxZ - marginZ
  );
}

export interface StationHandle extends EnvironmentHandle {
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void;
  /**
   * Counts up whenever `pointsOfInterest` changes.
   *
   * The viewer maps that list into the arm's targets once, at mount. With rooms
   * coming and going the list is not a fact, it is a snapshot, and without this
   * the hand would spend the whole game reaching for controls in the compartment
   * the player spawned in.
   */
  readonly poiRevision: number;
  /**
   * The room tone of whichever compartment the player is standing in, or
   * undefined in one with no machinery. `exactOptionalPropertyTypes` means this
   * has to say `| undefined` out loud rather than merely being optional: a
   * silent room is a value the viewer acts on, not an absent one.
   */
  readonly machineryHz: number | undefined;
  /** Which compartment the player is in. For the viewer's status line. */
  currentRoom(): string;
  /** Which compartments are built right now. For tests and the debug readout. */
  residentRooms(): readonly string[];
}

export function buildStation(plan: StationPlan): StationHandle {
  const placed = layOut(plan.rooms, plan.connections, plan.anchor);
  const byId = new Map(plan.rooms.map((room) => [room.id, room]));

  const root = new THREE.Scene();
  root.name = plan.id;
  // A Scene with a null background, for the same reason the first room used one:
  // three.js clears the colour buffer for any scene carrying a background, so an
  // interior drawn into a scene with one would repaint over the exterior pass
  // before laying down a triangle.
  root.background = null;

  const resident = new Map<string, Resident>();

  /**
   * Live arrays, mutated in place and never replaced.
   *
   * The controller destructures `floor` once at construction and the viewer maps
   * `pointsOfInterest` into the arm's target list, so handing out a fresh array
   * when residency changes would leave both holding the station as it was when
   * the player spawned. Mutating in place is what makes the walls of a room that
   * was built thirty seconds ago something you can bump into.
   */
  const floor: FloorRect[] = [];
  const points: PointOfInterest[] = [];
  /** Bumped whenever `points` changes, so the viewer knows to re-read it. */
  let revision = 0;

  const startId = plan.start ?? plan.anchor;
  let currentId = startId;
  let lastTime = 0;

  /** Which ports lead somewhere. Everything else has to be walled off. */
  const joined = new Set<string>();
  for (const link of plan.connections) {
    joined.add(`${link.from[0]}/${link.from[1]}`);
    joined.add(`${link.to[0]}/${link.to[1]}`);
  }

  /**
   * A blank over a port that leads nowhere.
   *
   * Rooms are built with holes in their end walls because that is what a port
   * IS, and a hole with nothing behind it is not a dark doorway - it is outer
   * space, seen through the pressure hull, because the exterior pass clears
   * depth before the interior draws. The corridor's unconnected aft end measured
   * 18,360 pixels of exact VOID_SLATE the first time it was walked.
   *
   * The station builds these rather than the rooms, and that is the whole point:
   * a room cannot know whether its port leads anywhere, because that is a fact
   * about the station and it changes when a compartment is added. Left to the
   * rooms, every one of them would carry a cap that has to be remembered,
   * removed at exactly the right moment, and never accidentally left in place
   * behind a door that now opens onto somewhere.
   */
  const capFor = (port: Port): THREE.Mesh => {
    const half = SEAM.width / 2 + 0.25;
    const top = SEAM.height + 0.25;
    const depth = 0.12;
    const geometry = new THREE.BoxGeometry(
      port.facing === '+x' || port.facing === '-x' ? depth : 2 * half,
      top,
      port.facing === '+x' || port.facing === '-x' ? 2 * half : depth
    );
    const [ax, , az] = facingVector(port.facing);
    geometry.translate(
      port.at[0] + (ax * depth) / 2,
      port.floorY + top / 2,
      port.at[2] + (az * depth) / 2
    );
    const mesh = new THREE.Mesh(geometry, blankMaterial);
    mesh.name = `blank-${port.id}`;
    return mesh;
  };

  const blankMaterial = new THREE.MeshLambertMaterial({
    color: new THREE.Color(PALETTE.HULL_SHADOW),
    flatShading: true,
    emissive: new THREE.Color(PALETTE.NIGHT_SIDE),
    emissiveIntensity: 1,
  });

  const build = (id: string): void => {
    if (resident.has(id)) return;
    const definition = byId.get(id);
    const placement = placed.get(id);
    if (definition === undefined || placement === undefined) return;
    const handle = definition.build();
    const group = new THREE.Group();
    group.name = `compartment-${id}`;
    group.matrixAutoUpdate = false;
    group.matrix.copy(placement.matrix);
    group.add(handle.root);
    for (const p of handle.ports) {
      const sealed = !joined.has(`${id}/${p.id}`);
      // The station's own blank, for a room that brought no closure of its own.
      if (sealed) group.add(capFor(p));
      // And the room's, for one that did. Both are told either way: a room that
      // was capped in a previous layout has to be uncapped in this one.
      handle.sealPort?.(p.id, sealed);
    }
    root.add(group);
    resident.set(id, { id, handle, group, placement });
  };

  const drop = (id: string): void => {
    const entry = resident.get(id);
    if (entry === undefined) return;
    root.remove(entry.group);
    entry.handle.dispose();
    resident.delete(id);
  };

  /**
   * The floor THROUGH a seam, which no room owns and which nobody had built.
   *
   * Two compartments joined at a port are not joined for walking. The limb deck's
   * deck stops at its own bulkhead and the corridor's starts at its own end wall,
   * and between them is the collar - the door, its pocket, the sleeve - which is
   * 1.25 m of structure belonging to the rooms on either side and 1.65 m of floor
   * belonging to neither. Walking aft with the door standing open, the player
   * stopped dead 1.65 m short of the corridor and stayed there. Every gate was
   * green, because a screenshot harness teleports and never walks.
   *
   * `FloorRect` was designed for this - "a doorway between two rooms is just an
   * overlap between two rectangles" - but an overlap needs a rectangle to be an
   * overlap OF. This is that rectangle: seam width, spanning from one room's
   * floor edge to the other's, lapping into both so the union is continuous and
   * the controller's wall margin never fires in the middle of a doorway.
   */
  /**
   * Where the player is. Declared up here rather than beside the handle because
   * `seamFloors` reads it and `settle()` runs before the handle is built - left
   * below, the first floor build threw on a temporal dead zone.
   */
  const eye = new THREE.Vector3();

  /** How high the eye rides when standing. The anchor's, since it owns the deck. */
  const standingEye = (): number => resident.get(startId)?.handle.eyeHeight ?? 1.74;

  /** Is this doorway a hole a standing player fits through, right now? */
  const tallEnough = (gate: { readonly clear: number }): boolean =>
    gate.clear >= standingEye() + DOOR_HEAD_M;

  const seamFloors = (): readonly FloorRect[] => {
    const out: FloorRect[] = [];
    for (const link of plan.connections) {
      const a = resident.get(link.from[0]);
      const b = resident.get(link.to[0]);
      if (a === undefined || b === undefined) continue;
      const near = a.handle.ports.find((p) => p.id === link.from[1]);
      if (near === undefined) continue;

      const seam = new THREE.Vector3(near.at[0], 0, near.at[2]).applyMatrix4(a.placement.matrix);
      const axis = new THREE.Vector3(...facingVector(near.facing))
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), a.placement.yaw)
        .round();
      const alongX = Math.abs(axis.x) > 0.5;

      // How far each room's floor stops short of the seam, measured as a
      // projection along the seam axis rather than by comparing named edges. The
      // first attempt compared rect.minX to the seam and clamped the result at
      // zero, which yielded a tunnel of length zero and left the 1.65 m gap
      // exactly where it was.
      const project = (room: Resident): { lo: number; hi: number } => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const rect of worldFloor(room.handle, room.placement)) {
          for (const x of [rect.minX, rect.maxX]) {
            for (const z of [rect.minZ, rect.maxZ]) {
              const t = (x - seam.x) * axis.x + (z - seam.z) * axis.z;
              lo = Math.min(lo, t);
              hi = Math.max(hi, t);
            }
          }
        }
        return { lo, hi };
      };
      // `axis` points out of room A and into room B, so A lies at negative
      // projection and B at positive. The tunnel runs between the two nearest
      // edges, lapping 0.06 m into each so the rectangles genuinely overlap
      // rather than merely touching - a touch leaves the controller's wall
      // margin free to fire in the middle of a doorway.
      let near0 = project(a).hi - 0.06;
      let far0 = project(b).lo + 0.06;

      // A shut door is a wall. Cut the tunnel at the door plane so the floor
      // stops short of it, leaving a gap the walk cannot cross, and the player
      // is held in front of a door they can see and press instead of walking
      // their eye into the slab.
      //
      // The exception is the player already standing in the tunnel: a door that
      // closes on somebody must not delete the floor under them. While the eye
      // is inside, the tunnel stays whole and the door simply shuts around them.
      for (const [room, side] of [
        [a, link.from[1]],
        [b, link.to[1]],
      ] as const) {
        const gate = room.handle.portDoor?.(side);
        if (gate === undefined || tallEnough(gate)) continue;
        // The door plane in tunnel coordinates. `axis` runs out of A into B, so
        // A's own fittings are at negative projection and B's at positive.
        const plane = room === a ? -gate.inset : gate.inset;
        const t = (eye.x - seam.x) * axis.x + (eye.z - seam.z) * axis.z;
        if (t > near0 - DOOR_STOP_M && t < far0 + DOOR_STOP_M) continue;
        if (room === a) near0 = Math.max(near0, plane + DOOR_STOP_M);
        else far0 = Math.min(far0, plane - DOOR_STOP_M);
      }
      if (near0 >= far0) continue;
      const half = SEAM.width / 2;
      const floorY = a.placement.position.y + near.floorY;
      const p0 = new THREE.Vector3(seam.x + axis.x * near0, 0, seam.z + axis.z * near0);
      const p1 = new THREE.Vector3(seam.x + axis.x * far0, 0, seam.z + axis.z * far0);
      const alongZ = !alongX;
      out.push({
        minX: alongZ ? seam.x - half : Math.min(p0.x, p1.x),
        maxX: alongZ ? seam.x + half : Math.max(p0.x, p1.x),
        minZ: alongZ ? Math.min(p0.z, p1.z) : seam.z - half,
        maxZ: alongZ ? Math.max(p0.z, p1.z) : seam.z + half,
        floorY,
      });
    }
    return out;
  };

  /**
   * Whether any door has crossed the open-enough line since we last looked, or
   * whether the player has stepped into or out of a doorway.
   *
   * Both change what the floor is, and both are edges rather than states: the
   * answer is only interesting on the frame it changes.
   */
  /**
   * A compact description of everything about doors that changes what the floor
   * is: whether each is open, and whether the player is inside its stand-off.
   * Both are edges - only interesting on the frame they flip.
   */
  const doorSignature = (): string => {
    const parts: string[] = [];
    for (const room of resident.values()) {
      for (const p of room.handle.ports) {
        const gate = room.handle.portDoor?.(p.id);
        if (gate === undefined) continue;
        parts.push(`${room.id}/${p.id}:${tallEnough(gate) ? 1 : 0}`);
      }
    }
    return parts.join(',');
  };
  let lastSignature = '';
  const gatesChanged = (): boolean => {
    const now = doorSignature();
    if (now === lastSignature) return false;
    lastSignature = now;
    return true;
  };

  /**
   * How close the eye has to get before a door opens for it, metres.
   *
   * Set from the door's own timing, and reset once that timing was measured
   * honestly. The aft door releases its latch for 0.28 s and then runs for
   * 1.55 s on a smoothstep, and it is not tall enough to walk through until 92%
   * of that travel - which is 1.51 s from the trigger, or 2.80 m at a walk. The
   * old 2.6 m was set against a threshold that let the player through a 0.71 m
   * hole, so it was measuring the wrong moment.
   *
   * 3.4 m leaves half a second of slack, so the door is standing open by the
   * time anybody reaches it and nobody is ever held up by it - while still being
   * shut, from the far end of the deck, when they set off towards it. A door
   * that is always open is a hole.
   */
  const SUMMON_M = 3.4;

  /** Tell every door whether somebody is standing near enough to use it. */
  const summonDoors = (): void => {
    for (const room of resident.values()) {
      if (room.handle.summonPort === undefined) continue;
      for (const p of room.handle.ports) {
        const gate = room.handle.portDoor?.(p.id);
        if (gate === undefined) continue;
        const facing = new THREE.Vector3(...facingVector(p.facing));
        const at = new THREE.Vector3(p.at[0], 0, p.at[2])
          .add(facing.clone().multiplyScalar(-gate.inset))
          .applyMatrix4(room.placement.matrix);
        // Distance to the door PLANE along the way through, so standing beside
        // it in a wide room does not hold it open from across the deck.
        const out = facing.applyAxisAngle(new THREE.Vector3(0, 1, 0), room.placement.yaw).round();
        const along = Math.abs((eye.x - at.x) * out.x + (eye.z - at.z) * out.z);
        const across = Math.abs((eye.x - at.x) * -out.z + (eye.z - at.z) * out.x);
        room.handle.summonPort(p.id, along < SUMMON_M && across < SEAM.width);
      }
    }
  };

  const refreshLists = (): void => {
    floor.length = 0;
    points.length = 0;
    floor.push(...seamFloors());
    for (const entry of resident.values()) {
      floor.push(...worldFloor(entry.handle, entry.placement));
      for (const poi of entry.handle.pointsOfInterest) {
        const at = new THREE.Vector3(...poi.position).applyMatrix4(entry.placement.matrix);
        points.push({
          ...poi,
          // Namespaced, because two rooms may both have a door button and the
          // viewer routes an interaction back by this id alone.
          id: `${entry.id}/${poi.id}`,
          position: [at.x, at.y, at.z],
        });
      }
    }
    revision += 1;
  };

  /**
   * Build the station. All of it, once.
   *
   * This used to stream: the room you were in plus its neighbours, mounting and
   * dropping compartments as you walked. That was solving a problem the station
   * does not have. Measured, the whole place is 12 840 triangles and 145 ms to
   * build - and 11 364 of those triangles are the limb deck, which is the anchor
   * and therefore resident at all times anyway. The streaming machinery existed
   * to manage the other 1 476.
   *
   * What it cost was not performance, it was correctness. Residency depended on
   * position, so `observe` had to be called from setPose and setTime as well as
   * the frame loop or a pinned screenshot rendered a compartment that had never
   * been built. The commit band needed a margin tuned per room width, and got it
   * wrong in the corridor. A port was sealed or open depending on what happened
   * to be resident. Three separate defects, all of them shaped like "the room
   * next door does not exist yet", none of them possible now.
   *
   * When there is enough station that this matters, the thing to stream is a
   * WING - a run of compartments behind a closed door - and not a sliding window
   * of neighbours. Until then, everything is here.
   */
  const settle = (): void => {
    let changed = false;
    for (const room of plan.rooms) {
      if (!resident.has(room.id)) {
        build(room.id);
        changed = true;
      }
    }
    if (changed) refreshLists();
  };

  settle();

  const anchorRoom = resident.get(startId);
  const anchorPlacement = placed.get(startId);
  const localSpawn = anchorRoom?.handle.spawn;
  const spawnAt = new THREE.Vector3(...(localSpawn?.position ?? [0, 1.7, 0]));
  if (anchorPlacement !== undefined) spawnAt.applyMatrix4(anchorPlacement.matrix);
  const spawn: Spawn = {
    position: [spawnAt.x, spawnAt.y, spawnAt.z],
    yaw: (localSpawn?.yaw ?? 0) + (anchorPlacement?.yaw ?? 0),
    pitch: localSpawn?.pitch ?? 0,
  };

  const mechanism = { travel: 0, speed: 0 };
  /**
   * Handed to the windowed room's exterior pass so that it clears the canvas,
   * paints space, clears depth and then draws nothing. What draws on top is the
   * per-room loop in `render`, which is the only place that knows which lights
   * are allowed to reach which geometry.
   */
  const blank = new THREE.Scene();
  blank.background = null;
  const voidSlate = new THREE.Color(PALETTE.VOID_SLATE);

  return {
    root,
    spawn,
    floor,
    pointsOfInterest: points,
    eyeHeight: anchorRoom?.handle.eyeHeight ?? 1.74,
    get poiRevision(): number {
      return revision;
    },
    get machineryHz(): number | undefined {
      return resident.get(currentId)?.handle.machineryHz;
    },
    mechanism,

    currentRoom: () => currentId,
    residentRooms: () => [...resident.keys()].sort(),

    /**
     * Where the player is, handed in by the viewer each frame.
     *
     * Streaming needs a position and `update()` only gets a clock. Rather than
     * give every room a camera it has no business knowing about, this is optional
     * on the contract and only the station implements it.
     */
    observe(position: THREE.Vector3): void {
      eye.copy(position);
      summonDoors();
      // Commit to a new room when you are well inside it - OR when you are
      // simply no longer standing in the one you were in. The second clause is
      // what makes this work in a room narrower than twice the margin: the
      // corridor is 1.5 m across, so a margin alone left a commit band of
      // +/-0.52 m in a room the player may stand +/-0.75 m across, and stepping
      // off the centreline meant the station never committed at all.
      const here = resident.get(currentId);
      const stillHere =
        here !== undefined &&
        worldFloor(here.handle, here.placement).some(
          (rect) =>
            eye.x >= rect.minX && eye.x <= rect.maxX && eye.z >= rect.minZ && eye.z <= rect.maxZ
        );
      for (const entry of resident.values()) {
        if (entry.id === currentId) continue;
        const rects = worldFloor(entry.handle, entry.placement);
        const wellInside = rects.some((rect) => inside(rect, eye.x, eye.z));
        const anywhereInside = rects.some(
          (rect) =>
            eye.x >= rect.minX && eye.x <= rect.maxX && eye.z >= rect.minZ && eye.z <= rect.maxZ
        );
        if (wellInside || (!stillHere && anywhereInside)) {
          // Which room the player is in still matters - it picks the room tone,
          // the machinery hum and which door's travel the audio layer hears -
          // but it no longer decides what exists.
          currentId = entry.id;
          break;
        }
      }
    },

    update(tSeconds: number): void {
      lastTime = tSeconds;
      for (const entry of resident.values()) entry.handle.update(tSeconds);
      // A door that opened has to put the floor back under the doorway, and a
      // door that shut has to take it away again. Rebuilt only on the crossing
      // rather than every frame: the floor array is the one the controller is
      // holding, and rewriting it sixty times a second to say the same thing
      // would be sixty allocations to no purpose.
      if (gatesChanged()) refreshLists();
      // The mechanism the viewer listens to is the one in the room the player is
      // standing in. A door closing two compartments away is not a sound.
      const here = resident.get(currentId)?.handle.mechanism;
      mechanism.travel = here?.travel ?? 0;
      mechanism.speed = here?.speed ?? 0;
    },

    interact(id: string): boolean {
      const slash = id.indexOf('/');
      if (slash < 0) return false;
      const room = resident.get(id.slice(0, slash));
      return room?.handle.interact?.(id.slice(slash + 1)) === true;
    },

    /**
     * One canvas, several rooms, and only one of them may clear it.
     *
     * A room with a window draws itself in two passes - the exterior, scissored
     * to the window's screen rectangle, then the interior over it - and that pass
     * begins by clearing the whole canvas. Two such rooms resident at once and
     * the second erases the first. So the station owns the clear, asks each
     * resident room with a window to paint its own exterior into its own scissor
     * rectangle, and then draws every interior in one pass on top.
     */
    /**
     * One room at a time, sharing a depth buffer.
     *
     * A three.js light lights everything in the scene it belongs to. Layers do
     * not change that - they gate whether the CAMERA sees a light, not which
     * objects it falls on - so a station built as one scene is a station where
     * every room's rig lights every other room through the walls. The corridor's
     * first render came out with one wall ten values brighter than the other and
     * the cause was the limb deck's sun, two compartments away, through a sealed
     * bulkhead.
     *
     * So each resident compartment is drawn in its own pass with only its own
     * lights switched on. Depth is shared and never cleared between passes, so
     * occlusion between rooms is still correct and a doorway still shows the room
     * beyond it - lit by its own fittings, which is the point.
     *
     * The cost is one draw call set per resident room, of which there are at most
     * a handful by construction. That is what streaming is for.
     */
    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
      const rooms = [...resident.values()];
      // Only the room you are STANDING IN may paint space, not merely any
      // resident room that has a window. The exterior pass scissors to where
      // the window's corners land on screen, and those corners are computed for
      // a camera assumed to be in that room; from two compartments away the
      // rectangle is meaningless, and it rendered as a hard-edged black slab
      // over a third of the frame whenever the player stepped off the corridor's
      // centreline. A window behind a shut door is not a window.
      const owner = rooms.find((entry) => entry.id === currentId && isPainter(entry.handle));

      if (owner !== undefined) {
        // Space first, into the window's rectangle, behind everything. The
        // painter is handed an EMPTY scene: it clears the canvas, paints the
        // exterior, clears depth, and then draws nothing, because what gets
        // drawn on top is decided here.
        (owner.handle as unknown as Painter).paint(renderer, blank, camera);
      } else {
        renderer.autoClear = true;
        renderer.setClearColor(voidSlate, 1);
        renderer.clear(true, true, true);
      }

      renderer.autoClear = false;
      for (const lit of rooms) {
        for (const other of rooms) other.group.visible = other.id === lit.id;
        renderer.render(root, camera);
      }
      for (const entry of rooms) entry.group.visible = true;
      renderer.autoClear = true;
    },

    dispose(): void {
      for (const id of [...resident.keys()]) drop(id);
      root.clear();
      void lastTime;
    },
  };
}

/**
 * One room, on its own, as a station.
 *
 * `rooms.html#spine` mounts a single compartment so it can be reviewed without
 * its neighbours - that is how environments get approved, and it predates the
 * station entirely. But a compartment is built with holes in its end walls,
 * because that is what a port is, and a hole with nothing behind it is not a
 * dark doorway: it is outer space through the pressure hull. The corridor
 * measured 12,900 void pixels the first time it was shot on its own, having
 * measured zero inside the station ten minutes earlier.
 *
 * Rather than teach rooms to cap themselves - which would mean every room
 * carrying a lid that has to be remembered, and removed at exactly the moment a
 * neighbour appears - a solo room is simply a station with one compartment and
 * no connections. Every port is unjoined, so every port gets a blank, by the
 * same code that does it in the real station.
 */
export function soloStation(room: CompartmentDefinition): StationHandle {
  return buildStation({
    id: room.id,
    name: room.name,
    description: room.description,
    rooms: [room],
    connections: [],
    anchor: room.id,
  });
}
