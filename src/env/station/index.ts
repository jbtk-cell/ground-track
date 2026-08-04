/**
 * THE STATION - many compartments, a few of them real at any moment.
 *
 * This is one `EnvironmentHandle` that happens to be made of rooms. The viewer
 * mounts it exactly the way it mounts a single room, which is deliberate: the
 * alternative was teaching the viewer about rooms, residency, placement and
 * routing, and the viewer's job is to run a camera and a pair of legs.
 *
 * STREAMING, AND WHY IT IS NOT AN OPTIMISATION YET. Only the compartment the
 * player is standing in and the ones directly connected to it are built. Everything
 * else does not exist: no geometry, no materials, no update cost. Walk through a
 * door and the far side's neighbours come up while the rooms you can no longer
 * reach go down.
 *
 * At the current room count this is not needed for frame rate and that is fine -
 * it is needed for the SHAPE of the thing. A station that only ever holds three
 * rooms in memory can have thirty; a station that builds all of them at mount can
 * have as many as the slowest machine tolerates, and you find out which number
 * that is late, from someone else's laptop. The seam this streams across is the
 * capped sleeve behind the aft door, which was built for this before there was a
 * second room to put behind it.
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
 * flip would tear down one room's neighbours and build another's, several times
 * a second, in the one place where the player can see both.
 */
const COMMIT_M = 0.45;

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

function inside(rect: FloorRect, x: number, z: number, margin: number): boolean {
  return (
    x >= rect.minX + margin &&
    x <= rect.maxX - margin &&
    z >= rect.minZ + margin &&
    z <= rect.maxZ - margin
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

  /** Who is next to whom, for deciding what to keep built. */
  const neighbours = new Map<string, Set<string>>();
  for (const room of plan.rooms) neighbours.set(room.id, new Set());
  for (const link of plan.connections) {
    neighbours.get(link.from[0])?.add(link.to[0]);
    neighbours.get(link.to[0])?.add(link.from[0]);
  }

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
      if (!joined.has(`${id}/${p.id}`)) group.add(capFor(p));
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

  const refreshLists = (): void => {
    floor.length = 0;
    points.length = 0;
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

  /** Bring residency in line with whichever room the player is in. */
  const settle = (): void => {
    const wanted = new Set<string>([currentId, ...(neighbours.get(currentId) ?? [])]);
    let changed = false;
    for (const id of [...resident.keys()]) {
      if (!wanted.has(id)) {
        drop(id);
        changed = true;
      }
    }
    for (const id of wanted) {
      if (!resident.has(id)) {
        build(id);
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

  const eye = new THREE.Vector3();
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
      // Commit to a new room only well inside it - see COMMIT_M.
      for (const entry of resident.values()) {
        if (entry.id === currentId) continue;
        const rects = worldFloor(entry.handle, entry.placement);
        if (rects.some((rect) => inside(rect, eye.x, eye.z, COMMIT_M))) {
          currentId = entry.id;
          settle();
          break;
        }
      }
    },

    update(tSeconds: number): void {
      lastTime = tSeconds;
      for (const entry of resident.values()) entry.handle.update(tSeconds);
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
      const owner = rooms.find((entry) => isPainter(entry.handle));

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
