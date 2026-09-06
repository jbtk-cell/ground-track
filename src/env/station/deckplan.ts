/**
 * DECK ONE OF STATION KEPLER - the whole expansion, as data.
 *
 * The owner's direction of 2026-09-05: the station becomes the first area of
 * something much larger - "a giant ass spaceship" - with about four times
 * the rooms, laid out as a maze with loops and a few secret rooms that only
 * open once something is unlocked, and every room built in Blender like the
 * rest. The gameplay it must leave room for is Prodigy-shaped: stations to
 * operate, arenas to meet things in, rooms that reward finding them.
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for the forty-one added rooms.
 * Everything else derives from it: the station plan (rooms + connections +
 * locks), the runtime compartments (src/env/blender/generated.ts), the
 * Blender build (tools/blender/build_generated.py reads the JSON that
 * scripts/export-deckplan.ts writes from this very module), the pinned
 * poses, and the deck map. A room is a record here, not a module - which is
 * the only way forty-one rooms stay consistent with each other and with the
 * twelve bespoke ones.
 *
 * COORDINATES ARE WORLD COORDINATES. The twelve bespoke rooms were designed
 * in their own local frames and placed by layOut; designing forty-one more
 * that way, with three loops that must close to the millimetre, is how a
 * doorway ends up in a wall. Instead every room here is an axis-aligned
 * world rectangle (all generated rooms land at yaw 0 because every join
 * pairs opposite world facings), local geometry is derived by subtracting
 * the room's centre, and loop closure is true by construction because both
 * sides of every seam come from the same numbers. scripts/check-deckplan.ts
 * verifies alignment, corner clearance and overlap before anything builds.
 *
 * THE RECT IS THE EXTENT: walls occupy its outer 0.1 m, the interior is the
 * rect inset by 0.1, and port planes sit exactly on rect edges so joined
 * rects abut and unjoined rects keep daylight between them.
 */

export type Family = 'corridor' | 'hab' | 'works' | 'stores' | 'science' | 'setpiece' | 'secret';

export type WallSide = 'n' | 's' | 'e' | 'w';

export interface DeckPortSpec {
  readonly id: string;
  readonly wall: WallSide;
  /** World x (for n/s walls) or world z (for e/w walls) of the seam centre. */
  readonly at: number;
  readonly gallery?: boolean;
  readonly low?: boolean;
  readonly floorY?: number;
}

/** A furniture box in LOCAL room coordinates, named for the clash tests. */
export interface FurnitureBox {
  readonly name: string;
  readonly mat: string;
  readonly box: readonly [number, number, number, number, number, number];
}

export interface FloorSpec {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly floorY: number;
}

export interface PoiSpec {
  readonly id: string;
  readonly label: string;
  readonly position: readonly [number, number, number];
  readonly operable?: boolean;
}

export interface DeckRoomSpec {
  readonly id: string;
  readonly name: string;
  readonly family: Family;
  readonly description: string;
  /** What the room is FOR, in the eventual game. Shown on the deck map. */
  readonly purpose: string;
  /** World extent [x0, x1, z0, z1]. */
  readonly rect: readonly [number, number, number, number];
  readonly h: number;
  readonly atlas: number;
  readonly machineryHz: number;
  readonly ports: readonly DeckPortSpec[];
  readonly furniture: readonly FurnitureBox[];
  readonly floors: readonly FloorSpec[];
  readonly pois: readonly PoiSpec[];
  /** Ceiling lamp plates, local [x0, x1, z0, z1]; drawn DIFF under TRIM. */
  readonly lamps: readonly (readonly [number, number, number, number])[];
  /** Material names drawn self-lit by the runtime, with their colours. */
  readonly selfLit: readonly (readonly [string, number])[];
}

export interface DeckLinkSpec {
  readonly a: readonly [string, string];
  readonly b: readonly [string, string];
  /** The key that opens it. A locked link is sealed until unlocked. */
  readonly locked?: string;
}

const WALL = 0.1;
const SEAM_W = 1.18;

/** Deterministic jitter so no two furniture faces share a plane by accident. */
function jitter(seed: number, i: number): number {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 0.008;
}

interface RoomInput {
  readonly id: string;
  readonly name: string;
  readonly family: Family;
  readonly description: string;
  readonly purpose: string;
  readonly rect: readonly [number, number, number, number];
  readonly h?: number;
  readonly atlas?: number;
  readonly machineryHz?: number;
  readonly ports: readonly DeckPortSpec[];
  readonly seed: number;
}

function centre(rect: readonly [number, number, number, number]): [number, number] {
  return [(rect[0] + rect[1]) / 2, (rect[2] + rect[3]) / 2];
}

function interiorHalf(rect: readonly [number, number, number, number]): [number, number] {
  return [(rect[1] - rect[0]) / 2 - WALL, (rect[3] - rect[2]) / 2 - WALL];
}

/** Standard ceiling lamp grid: one plate per ~2.6 m of the longer axis. */
function lampGrid(hw: number, hd: number): (readonly [number, number, number, number])[] {
  const out: (readonly [number, number, number, number])[] = [];
  const alongX = hw >= hd;
  const span = (alongX ? hw : hd) * 2;
  const count = Math.max(1, Math.round(span / 2.6));
  for (let i = 0; i < count; i += 1) {
    const c = -((count - 1) / 2) * 2.6 + i * 2.6;
    if (alongX) out.push([c - 0.55, c + 0.55, -0.32, 0.32]);
    else out.push([-0.32, 0.32, c - 0.55, c + 0.55]);
  }
  return out;
}

interface Dressing {
  readonly furniture: FurnitureBox[];
  readonly floors: FloorSpec[];
  readonly pois: PoiSpec[];
  readonly selfLit: (readonly [string, number])[];
  readonly lamps: (readonly [number, number, number, number])[];
}

const CREAM_LIT = 0xe4d6bb;
const SCREEN_LIT = 0x1b2735;
const GROW_LIT = 0xb8cf9a;
const FROST_LIT = 0xdbe4ea;
// Golden rather than orange: 0xd99a4e sat 24 RGB-units from the accent
// colour - inside the accent gate's 25-unit ball - so every ember fixture
// face counted as a stray accent pixel. (The hex itself may not be spelled
// here; the gate's source check reads comments too.)
const EMBER_LIT = 0xdfa961;

/**
 * The family dressers. Each returns furniture that lines the walls, floors
 * that stay honestly walkable, and the hooks the eventual game hangs on.
 * Furniture NEVER stands in a doorway: runs along a wall are split around
 * every port on that wall, and each door gets a floor apron so the walk
 * reaches the seam. Everything is deterministic from the seed.
 */
interface Run {
  readonly lo: number;
  readonly hi: number;
}

/** Intervals along a wall's axis, clear of that wall's doors. */
function runsAlong(input: RoomInput, wall: WallSide, half: number, inset: number): Run[] {
  const [cx, cz] = centre(input.rect);
  const opposite: Record<WallSide, WallSide> = { n: 's', s: 'n', e: 'w', w: 'e' };
  const doors = input.ports
    .filter((p) => p.wall === wall || p.wall === opposite[wall])
    .map((p) => {
      const c = p.wall === 'n' || p.wall === 's' ? p.at - cx : p.at - cz;
      const halfDoor = (p.gallery === true ? 2.1 : p.low === true ? 1.02 : SEAM_W) / 2 + 0.4;
      return { lo: c - halfDoor, hi: c + halfDoor };
    })
    .sort((a, b) => a.lo - b.lo);
  const runs: Run[] = [];
  let cursor = -half + inset;
  for (const d of doors) {
    if (d.lo - cursor >= 0.6) runs.push({ lo: cursor, hi: d.lo });
    cursor = Math.max(cursor, d.hi);
  }
  if (half - inset - cursor >= 0.6) runs.push({ lo: cursor, hi: half - inset });
  return runs;
}

/** A floor apron under each door on a lined wall, so the walk reaches it. */
function doorAprons(
  input: RoomInput,
  wall: WallSide,
  stripDepth: number,
  hw: number,
  hd: number
): FloorSpec[] {
  const [cx, cz] = centre(input.rect);
  return input.ports
    .filter((p) => p.wall === wall)
    .map((p) => {
      const c = p.wall === 'n' || p.wall === 's' ? p.at - cx : p.at - cz;
      const halfDoor = (p.gallery === true ? 2.1 : p.low === true ? 1.02 : SEAM_W) / 2 + 0.16;
      const floorY = p.floorY ?? 0;
      switch (wall) {
        case 'n':
          return {
            minX: c - halfDoor,
            maxX: c + halfDoor,
            minZ: hd - stripDepth,
            maxZ: hd,
            floorY,
          };
        case 's':
          return {
            minX: c - halfDoor,
            maxX: c + halfDoor,
            minZ: -hd,
            maxZ: -hd + stripDepth,
            floorY,
          };
        case 'e':
          return {
            minX: hw - stripDepth,
            maxX: hw,
            minZ: c - halfDoor,
            maxZ: c + halfDoor,
            floorY,
          };
        default:
          return {
            minX: -hw,
            maxX: -hw + stripDepth,
            minZ: c - halfDoor,
            maxZ: c + halfDoor,
            floorY,
          };
      }
    });
}

function dress(input: RoomInput, hw: number, hd: number): Dressing {
  const s = input.seed;
  const f: FurnitureBox[] = [];
  const pois: PoiSpec[] = [];
  const selfLit: (readonly [string, number])[] = [['DIFF', CREAM_LIT]];
  const h = input.h ?? (input.family === 'secret' ? 2.2 : input.family === 'corridor' ? 2.42 : 2.6);
  let floors: FloorSpec[] = [{ minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, floorY: 0 }];
  const lamps = lampGrid(hw, hd);
  const j = (i: number): number => jitter(s, i);

  const long = hw >= hd;
  const longHalf = long ? hw : hd;
  const nearWall: WallSide = long ? 's' : 'w';
  const farWall: WallSide = long ? 'n' : 'e';

  /** A box lining `wall` over [lo, hi] along it, spanning depth d0..d1 from
   *  the wall face inward, height y0..y1. */
  const lining = (
    name: string,
    mat: string,
    wall: WallSide,
    lo: number,
    hi: number,
    d0: number,
    d1: number,
    y0: number,
    y1: number
  ): FurnitureBox => {
    switch (wall) {
      case 'n':
        return { name, mat, box: [lo, hi, y0, y1, hd - d1, hd - d0] };
      case 's':
        return { name, mat, box: [lo, hi, y0, y1, -hd + d0, -hd + d1] };
      case 'e':
        return { name, mat, box: [hw - d1, hw - d0, y0, y1, lo, hi] };
      default:
        return { name, mat, box: [-hw + d0, -hw + d1, y0, y1, lo, hi] };
    }
  };

  const lineWalls = (
    depth: number,
    build: (wall: WallSide, run: Run, k: number, side: string) => void
  ): void => {
    for (const [side, wall] of [
      ['a', nearWall],
      ['b', farWall],
    ] as const) {
      const runs = runsAlong(input, wall, longHalf, 0.35);
      runs.forEach((run, k) => build(wall, run, k, side));
    }
    const clear = (long ? hd : hw) - depth - 0.05;
    floors = [
      long
        ? { minX: -hw, maxX: hw, minZ: -clear, maxZ: clear, floorY: 0 }
        : { minX: -clear, maxX: clear, minZ: -hd, maxZ: hd, floorY: 0 },
      ...floors.slice(1),
    ];
  };

  switch (input.family) {
    case 'corridor': {
      // A split handrail with stanchions, and a cable tray high on the
      // other side - above door height, so it runs unbroken.
      const runs = runsAlong(input, nearWall, longHalf, 0.3);
      runs.forEach((run, k) => {
        f.push(lining(`rail-${k}`, 'TRIM', nearWall, run.lo, run.hi, 0.1, 0.14 + j(k), 0.92, 0.97));
        const mid = (run.lo + run.hi) / 2;
        f.push(
          lining(`stanchion-${k}`, 'TRIM', nearWall, mid - 0.03, mid + 0.03, 0.1, 0.13, 0, 0.92)
        );
      });
      f.push(
        lining(
          'tray',
          'JAMB',
          farWall,
          -longHalf + 0.4,
          longHalf - 0.4,
          0.02,
          0.16,
          h - 0.5,
          h - 0.38
        )
      );
      f.push(lining('tray-clip', 'TRIM', farWall, -0.06, 0.06, 0.0, 0.18, h - 0.52, h - 0.36));
      break;
    }
    case 'hab': {
      const depth = 0.62;
      lineWalls(depth, (wall, run, k, side) => {
        f.push(
          lining(
            `bench-${side}${k}`,
            'LINER',
            wall,
            run.lo,
            run.hi,
            0.04,
            depth + j(k + 1),
            0,
            0.46
          )
        );
        f.push(
          lining(
            `back-${side}${k}`,
            'KICK',
            wall,
            run.lo,
            run.hi,
            0.04,
            0.18 + j(k + 3),
            0.46,
            1.18
          )
        );
      });
      break;
    }
    case 'works': {
      const depth = 0.8;
      lineWalls(depth, (wall, run, k, side) => {
        const y1 = 1.35 + 0.3 * ((s + k) % 3);
        f.push(
          lining(`plant-${side}${k}`, 'CROWN', wall, run.lo, run.hi, 0.05, depth + j(k + 2), 0, y1)
        );
        f.push(
          lining(
            `stack-${side}${k}`,
            'TRIM',
            wall,
            run.lo + 0.15,
            run.lo + 0.45,
            0.1,
            depth - 0.1,
            y1,
            y1 + 0.5
          )
        );
      });
      break;
    }
    case 'stores': {
      const depth = 0.55;
      lineWalls(depth, (wall, run, k, side) => {
        for (const [n, y0] of [
          [0, 0.14],
          [1, 0.8],
          [2, 1.46],
        ] as const) {
          f.push(
            lining(
              `shelf-${side}${k}${n}`,
              'KICK',
              wall,
              run.lo,
              run.hi,
              0.06,
              depth,
              y0,
              y0 + 0.04
            )
          );
        }
        // Standards proud of the shelf faces, so no two share a plane.
        for (const [pn, at] of [
          [0, run.lo + 0.04],
          [1, run.hi - 0.1],
        ] as const) {
          f.push(
            lining(
              `post-${side}${k}${pn}`,
              'TRIM',
              wall,
              at,
              at + 0.06,
              0.035,
              depth + 0.025,
              0,
              1.9
            )
          );
        }
        // A crate or two per run, clamped well inside it.
        const span = run.hi - run.lo;
        for (let c = 0; c < Math.min(2, Math.floor(span)); c += 1) {
          const w = 0.32 + 0.08 * ((s + c + k) % 2);
          const at = run.lo + 0.25 + c * (span - 0.6 - w) + j(c + k + 8);
          const y = c % 2 === 0 ? 0.18 : 0.84;
          f.push(
            lining(`crate-${side}${k}${c}`, 'FOIL', wall, at, at + w, 0.1, depth - 0.06, y, y + 0.3)
          );
        }
      });
      break;
    }
    case 'science': {
      const depth = 0.6;
      lineWalls(depth, (wall, run, k, side) => {
        f.push(
          lining(`bench-${side}${k}`, 'LINER', wall, run.lo, run.hi, 0.05, depth + j(k + 1), 0, 0.9)
        );
        f.push(
          lining(
            `kit-${side}${k}`,
            'TRIM',
            wall,
            run.lo + 0.2,
            run.lo + 0.8,
            0.12,
            depth - 0.08,
            0.9,
            1.22 + j(k)
          )
        );
      });
      break;
    }
    case 'secret': {
      // Bare frames: ribs on the long walls, a low pipe run, one dim lamp.
      const runs = runsAlong(input, nearWall, longHalf, 0.25);
      let ribs = 0;
      for (const run of runs) {
        for (let at = run.lo + 0.3; at < run.hi - 0.1 && ribs < 6; at += 1.9) {
          f.push(lining(`rib-${ribs}`, 'JAMB', nearWall, at, at + 0.12, 0.02, 0.2, 0, h - 0.1));
          ribs += 1;
        }
      }
      f.push(
        lining('pipe', 'TRIM', farWall, -longHalf + 0.3, longHalf - 0.3, 0.05, 0.15, 0.24, 0.34)
      );
      f.push(
        lining('pipe-b', 'TRIM', farWall, -longHalf + 0.3, longHalf - 0.3, 0.05, 0.15, 0.4, 0.5)
      );
      break;
    }
    case 'setpiece':
      // Hand-dressed per room.
      break;
  }

  return { furniture: f, floors, pois, selfLit, lamps };
}

const FAMILY_DEPTH: Record<Family, number> = {
  corridor: 0.25,
  hab: 0.72,
  works: 0.9,
  stores: 0.65,
  science: 0.7,
  secret: 0.35,
  setpiece: 0.4,
};

function room(input: RoomInput, custom?: Partial<Dressing>): DeckRoomSpec {
  const [cx, cz] = centre(input.rect);
  const [hw, hd] = interiorHalf(input.rect);
  const base = dress(input, hw, hd);
  const d: {
    furniture: FurnitureBox[];
    floors: FloorSpec[];
    pois: PoiSpec[];
    selfLit: (readonly [string, number])[];
    lamps: (readonly [number, number, number, number])[];
  } = {
    furniture: [...(custom?.furniture ?? base.furniture)],
    floors: [...(custom?.floors ?? base.floors)],
    pois: [...(custom?.pois ?? base.pois)],
    selfLit: [...(custom?.selfLit ?? base.selfLit)],
    lamps: [...(custom?.lamps ?? base.lamps)],
  };
  // EVERY door gets a floor apron reaching from its wall past any furniture
  // line into the room, whatever the family and whatever the custom floors:
  // a doorway you cannot stand in front of is a doorway the walk tests
  // rightly refuse.
  const strip = FAMILY_DEPTH[input.family] + 0.55;
  for (const wall of ['n', 's', 'e', 'w'] as const) {
    d.floors = d.floors.concat(doorAprons(input, wall, strip, hw, hd));
  }
  // And the matching apron on the OPPOSITE wall, so the lane through the
  // room a door implies is walkable end to end - the furniture runs have
  // already broken across from every door.
  const mirror: Record<WallSide, WallSide> = { n: 's', s: 'n', e: 'w', w: 'e' };
  for (const port of input.ports) {
    const wall = mirror[port.wall];
    const ghost = { ...port, floorY: 0, wall };
    const mirrored: RoomInput = { ...input, ports: [ghost] };
    d.floors = d.floors.concat(doorAprons(mirrored, wall, strip, hw, hd));
  }
  // And every room declares enough of itself for the clash tests to bite:
  // two corner frames and a kick datum join whatever the family placed.
  while (d.furniture.length + d.lamps.length <= 5) {
    const k = d.furniture.length;
    d.furniture = d.furniture.concat([
      {
        name: `frame-${k}a`,
        mat: 'JAMB',
        box: [
          -hw + 0.06,
          -hw + 0.17,
          0.02,
          1.9 - 0.04 * k,
          -hd + 0.28 + 0.3 * k,
          -hd + 0.4 + 0.3 * k,
        ],
      },
      {
        name: `frame-${k}b`,
        mat: 'JAMB',
        box: [hw - 0.17, hw - 0.06, 0.02, 1.86 - 0.04 * k, hd - 0.4 - 0.3 * k, hd - 0.28 - 0.3 * k],
      },
    ]);
  }
  void cx;
  void cz;
  return {
    id: input.id,
    name: input.name,
    family: input.family,
    description: input.description,
    purpose: input.purpose,
    rect: input.rect,
    h: input.h ?? (input.family === 'secret' ? 2.2 : input.family === 'corridor' ? 2.42 : 2.6),
    atlas: input.atlas ?? (input.family === 'corridor' || input.family === 'secret' ? 1024 : 1536),
    machineryHz: input.machineryHz ?? 0,
    ports: input.ports,
    furniture: d.furniture,
    floors: d.floors,
    pois: d.pois,
    lamps: d.lamps,
    selfLit: d.selfLit,
  };
}

// ------------------------------------------------------------------ rooms

export const DECK_ROOMS: readonly DeckRoomSpec[] = [
  // ---- NORTH: the habitation block -----------------------------------
  room({
    id: 'tee',
    name: 'THE TEE',
    family: 'corridor',
    seed: 11,
    description: 'The junction north of the spine, four ways at once.',
    purpose: 'Waypoint. The first fork the player chooses at; signage teaches the deck.',
    rect: [-8.8, -5.2, 1.01, 5.01],
    machineryHz: 0,
    ports: [
      { id: 's', wall: 's', at: -7.0 },
      { id: 'n', wall: 'n', at: -7.0 },
      { id: 'e', wall: 'e', at: 3.3 },
      { id: 'w', wall: 'w', at: 3.0 },
    ],
  }),
  room(
    {
      id: 'mess',
      name: 'THE MESS',
      family: 'hab',
      seed: 12,
      description: 'The long hall where the crew ate, tables still bolted down.',
      purpose: 'Encounter arena and gathering hall - the big open floor fights happen on.',
      rect: [-5.2, 3.1, 2.31, 7.51],
      h: 2.7,
      atlas: 2048,
      machineryHz: 33,
      ports: [
        { id: 'w', wall: 'w', at: 3.3 },
        { id: 'n', wall: 'n', at: -3.0 },
      ],
    },
    {
      pois: [
        { id: 'servery', label: 'the servery hatch', position: [3.0, 1.1, 1.95], operable: true },
        { id: 'longtable', label: 'the long table', position: [0, 0.85, 0] },
      ],
    }
  ),
  room(
    {
      id: 'galley',
      name: 'THE GALLEY',
      family: 'hab',
      seed: 13,
      description: 'Counters, dead burners, one pot still clamped to the rail.',
      purpose: 'Consumables station - cooking or crafting rations later.',
      rect: [-5.2, -0.6, 7.51, 10.91],
      machineryHz: 47,
      ports: [{ id: 's', wall: 's', at: -3.0 }],
    },
    {
      pois: [{ id: 'burners', label: 'the burner rail', position: [0, 1.0, 0.99], operable: true }],
    }
  ),
  room({
    id: 'walk',
    name: 'THE WALK',
    family: 'corridor',
    seed: 14,
    description: 'The hab block corridor, posters still glued to the liner.',
    purpose: 'Circulation; wall posters carry lore fragments.',
    rect: [-8.2, -5.8, 5.01, 13.51],
    ports: [
      { id: 's', wall: 's', at: -7.0 },
      { id: 'n', wall: 'n', at: -7.0 },
      { id: 'w', wall: 'w', at: 8.7 },
      { id: 'e', wall: 'e', at: 12.4 },
    ],
  }),
  room(
    {
      id: 'cabins',
      name: 'THE CABINS',
      family: 'hab',
      seed: 15,
      description: 'Four crew cabins off one short hall, doors ajar.',
      purpose: 'Search-and-find: personal effects, collectibles, four small stories.',
      rect: [-14.0, -8.2, 6.51, 10.91],
      machineryHz: 29,
      ports: [{ id: 'e', wall: 'e', at: 8.7 }],
    },
    {
      pois: [
        {
          id: 'effects',
          label: 'the personal effects',
          position: [-0.9, 0.8, 1.35],
          operable: true,
        },
      ],
    }
  ),
  room(
    {
      id: 'bunks',
      name: 'THE BUNKS',
      family: 'hab',
      seed: 16,
      description: 'Stacked berths for the watchkeepers, blankets folded square.',
      purpose: 'Rest point - the save/heal anchor of the hab block.',
      rect: [-13.4, -8.8, 1.21, 5.01],
      machineryHz: 27,
      ports: [
        { id: 'e', wall: 'e', at: 3.0 },
        { id: 'w', wall: 'w', at: 3.4 },
      ],
    },
    {
      pois: [{ id: 'berth', label: 'the made berth', position: [-1.3, 0.6, -1.0], operable: true }],
    }
  ),
  room(
    {
      id: 'ward',
      name: 'THE WARD',
      family: 'hab',
      seed: 17,
      description: 'Two cots, a dressing stand, the cabinet inventoried and shut.',
      purpose: 'Heal station - patching up after the mess hall arena.',
      rect: [-8.6, -6.0, 13.51, 16.51],
      h: 2.75,
      machineryHz: 41,
      ports: [
        { id: 's', wall: 's', at: -7.0 },
        { id: 'w', wall: 'w', at: 15.0 },
      ],
    },
    {
      pois: [
        {
          id: 'cabinet',
          label: 'the medicine cabinet',
          position: [-0.6, 1.3, 0.95],
          operable: true,
        },
      ],
    }
  ),
  room({
    id: 'head',
    name: 'THE HEAD',
    family: 'hab',
    seed: 18,
    description: 'The washroom, steel basins, a mirror that has seen things.',
    purpose: 'Flavour room; the mirror is an easter egg surface.',
    rect: [-11.6, -8.6, 13.71, 16.31],
    h: 2.45,
    machineryHz: 52,
    ports: [{ id: 'e', wall: 'e', at: 15.0 }],
  }),
  room(
    {
      id: 'lockers',
      name: 'THE LOCKERS',
      family: 'hab',
      seed: 19,
      description: 'Suit lockers in ranks, most of them still full.',
      purpose: 'Gear room - where found abilities get equipped.',
      rect: [-5.8, -2.2, 11.31, 14.11],
      h: 2.5,
      machineryHz: 31,
      ports: [{ id: 'w', wall: 'w', at: 12.4 }],
    },
    {
      pois: [
        { id: 'locker', label: 'the open locker', position: [1.1, 1.2, 0.85], operable: true },
      ],
    }
  ),
  room(
    {
      id: 'return',
      name: 'THE RETURN',
      family: 'corridor',
      seed: 20,
      description: 'The ramp down from the crown gallery to the hab block.',
      purpose: 'Loop shortcut - the maze reads because this exists.',
      rect: [-17.15, -13.4, 2.2, 4.6],
      ports: [
        { id: 'w', wall: 'w', at: 3.4, floorY: 0.45 },
        { id: 'e', wall: 'e', at: 3.4 },
      ],
    },
    {
      floors: [
        { minX: -1.775, maxX: -0.7, minZ: -1.1, maxZ: 1.1, floorY: 0.45 },
        { minX: -0.7, maxX: -0.25, minZ: -1.1, maxZ: 1.1, floorY: 0.3 },
        { minX: -0.25, maxX: 0.2, minZ: -1.1, maxZ: 1.1, floorY: 0.15 },
        { minX: 0.2, maxX: 1.775, minZ: -1.1, maxZ: 1.1, floorY: 0 },
      ],
      furniture: [{ name: 'rail', mat: 'TRIM', box: [-1.5, 1.5, 1.32, 1.37, 1.02, 1.06] }],
    }
  ),

  // ---- SOUTH: the works block ----------------------------------------
  room({
    id: 'chase',
    name: 'THE CHASE',
    family: 'corridor',
    seed: 21,
    description: 'The service corridor south, cable trays three deep.',
    purpose: 'Circulation into the works; hazard flavour.',
    rect: [-13.8, -11.4, -7.01, -1.01],
    ports: [
      { id: 'n', wall: 'n', at: -12.6 },
      { id: 's', wall: 's', at: -12.6 },
      { id: 'e', wall: 'e', at: -3.5 },
    ],
  }),
  room(
    {
      id: 'shop',
      name: 'THE SHOP',
      family: 'works',
      seed: 22,
      description: 'The machine shop, vices still chalked with part numbers.',
      purpose: 'Crafting bench - upgrades get made here.',
      rect: [-11.4, -5.7, -5.61, -1.31],
      h: 3.0,
      machineryHz: 62,
      ports: [
        { id: 'w', wall: 'w', at: -3.5 },
        { id: 's', wall: 's', at: -8.4 },
      ],
    },
    {
      pois: [
        { id: 'bench', label: 'the fitting bench', position: [2.0, 1.0, -1.5], operable: true },
      ],
    }
  ),
  room({
    id: 'pumps',
    name: 'THE PUMPS',
    family: 'works',
    seed: 23,
    description: 'Four pump sets on springs, one of them still warm.',
    purpose: 'Arena with moving machinery; rhythm hazard later.',
    rect: [-11.0, -5.8, -9.61, -5.61],
    h: 3.0,
    machineryHz: 83,
    ports: [
      { id: 'n', wall: 'n', at: -8.4 },
      { id: 'e', wall: 'e', at: -7.6 },
    ],
  }),
  room(
    {
      id: 'filter',
      name: 'THE FILTER',
      family: 'works',
      seed: 24,
      description: 'Air filtration, damper wheels on every trunk.',
      purpose: 'Puzzle room - align the dampers to redirect flow.',
      rect: [-5.8, -2.2, -9.61, -6.01],
      h: 3.0,
      machineryHz: 71,
      ports: [
        { id: 'w', wall: 'w', at: -7.6 },
        { id: 'n', wall: 'n', at: -4.0 },
      ],
    },
    {
      pois: [{ id: 'damper', label: 'the damper wheel', position: [1.35, 1.2, 0], operable: true }],
    }
  ),
  room(
    {
      id: 'switch',
      name: 'THE SWITCHROOM',
      family: 'works',
      seed: 25,
      description: 'Breaker banks floor to crown, every handle down.',
      purpose: 'Puzzle room - the breaker order powers other rooms.',
      rect: [-5.6, -2.4, -6.01, -3.21],
      h: 2.8,
      machineryHz: 55,
      ports: [{ id: 's', wall: 's', at: -4.0 }],
    },
    {
      pois: [
        { id: 'breakers', label: 'the breaker bank', position: [0, 1.3, 0.95], operable: true },
      ],
    }
  ),
  room({
    id: 'link',
    name: 'THE LINK',
    family: 'corridor',
    seed: 26,
    description: 'The corridor between the works and the berth.',
    purpose: 'Circulation; closes the south loop.',
    rect: [-13.8, -11.4, -12.5, -7.01],
    ports: [
      { id: 'n', wall: 'n', at: -12.6 },
      { id: 'w', wall: 'w', at: -11.5 },
      { id: 'e', wall: 'e', at: -11.0 },
    ],
  }),
  room({
    id: 'elbow',
    name: 'THE ELBOW',
    family: 'corridor',
    seed: 27,
    description: 'A vestibule turning twice on the way to the berth.',
    purpose: 'Circulation; the south loop meets the docking octagon.',
    rect: [-14.95, -13.8, -13.89, -10.41],
    ports: [
      { id: 'e', wall: 'e', at: -11.5 },
      { id: 'w', wall: 'w', at: -12.9 },
    ],
  }),
  room(
    {
      id: 'servers',
      name: 'THE SERVERS',
      family: 'works',
      seed: 28,
      description: 'Data racks breathing heat, cursors blinking on hold.',
      purpose: 'Drill terminals - the question-and-answer stations of the game.',
      rect: [-11.4, -7.8, -13.31, -10.01],
      h: 2.9,
      machineryHz: 96,
      ports: [
        { id: 'w', wall: 'w', at: -11.0 },
        { id: 's', wall: 's', at: -9.8 },
        { id: 'e', wall: 'e', at: -11.9 },
      ],
    },
    {
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['SCREENGLOW', SCREEN_LIT],
      ],
      pois: [
        { id: 'terminal', label: 'the drill terminal', position: [0, 1.2, -1.2], operable: true },
      ],
    }
  ),
  room(
    {
      id: 'comms',
      name: 'THE COMMS',
      family: 'works',
      seed: 29,
      description: 'The radio room, one channel still carrying.',
      purpose: 'Quest console - messages from elsewhere start missions.',
      rect: [-11.4, -7.9, -16.31, -13.31],
      h: 3.0,
      machineryHz: 44,
      ports: [{ id: 'n', wall: 'n', at: -9.8 }],
    },
    {
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['SCREENGLOW', SCREEN_LIT],
      ],
      pois: [{ id: 'set', label: 'the radio set', position: [0, 1.1, -1.05], operable: true }],
    }
  ),
  room(
    {
      id: 'furnace',
      name: 'THE FURNACE',
      family: 'works',
      seed: 30,
      description: 'The thermal plant. The grille glow never quite goes out.',
      purpose: 'Arena; the prybar panel in its south wall opens the keel.',
      rect: [-7.8, -3.8, -13.31, -10.11],
      h: 2.8,
      machineryHz: 88,
      ports: [
        { id: 'w', wall: 'w', at: -11.9 },
        { id: 's', wall: 's', at: -5.8 },
      ],
    },
    {
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['EMBER', EMBER_LIT],
      ],
      pois: [
        { id: 'grille', label: 'the furnace grille', position: [0.8, 1.0, -1.15], operable: true },
      ],
    }
  ),

  // ---- FAR: the stores frontier beyond the gantry --------------------
  room({
    id: 'belt',
    name: 'THE BELT',
    family: 'corridor',
    seed: 31,
    description: 'The long straight past the tank farm, doors both sides.',
    purpose: 'Main street of the stores; every vendor is off this run.',
    rect: [-30.35, -27.95, 20.7, 33.2],
    atlas: 1536,
    ports: [
      { id: 's', wall: 's', at: -29.15 },
      { id: 'n', wall: 'n', at: -29.15 },
      { id: 'e1', wall: 'e', at: 23.5 },
      { id: 'e2', wall: 'e', at: 28.5 },
      { id: 'e3', wall: 'e', at: 31.8 },
      { id: 'w1', wall: 'w', at: 24.5, gallery: true },
    ],
  }),
  room(
    {
      id: 'hold',
      name: 'THE HOLD',
      family: 'setpiece',
      seed: 32,
      description:
        'The cargo bay. Container stacks four high; the crane rail runs out into the dark.',
      purpose: 'The big arena and the sense of scale - a star-freighter hold.',
      rect: [-44.35, -30.35, 21.2, 31.2],
      h: 6.5,
      atlas: 2048,
      machineryHz: 36,
      ports: [{ id: 'e', wall: 'e', at: 24.5, gallery: true }],
    },
    {
      furniture: [
        // Container stacks: two banks and two freestanding islands.
        { name: 'stack-a1', mat: 'FOIL', box: [-6.3, -3.9, 0, 2.35, 2.2, 4.6] },
        { name: 'stack-a2', mat: 'KICK', box: [-6.24, -3.96, 2.35, 4.62, 2.26, 4.54] },
        { name: 'stack-b1', mat: 'KICK', box: [-2.9, -0.5, 0, 2.3, 2.28, 4.66] },
        { name: 'stack-b2', mat: 'FOIL', box: [-2.84, -0.56, 2.3, 4.5, 2.2, 4.58] },
        { name: 'stack-c1', mat: 'FOIL', box: [1.1, 3.5, 0, 2.32, 2.24, 4.62] },
        { name: 'stack-d1', mat: 'KICK', box: [-5.9, -3.5, 0, 2.28, -4.62, -2.24] },
        { name: 'stack-d2', mat: 'FOIL', box: [-5.84, -3.56, 2.28, 4.4, -4.56, -2.3] },
        { name: 'stack-e1', mat: 'FOIL', box: [-0.9, 1.5, 0, 2.34, -4.58, -2.2] },
        { name: 'isle-a', mat: 'KICK', box: [-1.5, 0.9, 0, 2.3, -0.85, 0.85] },
        // The crane rail, high over the centreline.
        { name: 'crane-rail', mat: 'TRIM', box: [-6.6, 6.6, 5.6, 5.85, -0.35, 0.35] },
        { name: 'crane-car', mat: 'JAMB', box: [-1.9, -0.7, 5.0, 5.6, -0.5, 0.5] },
      ],
      floors: [
        { minX: -6.9, maxX: -1.6, minZ: -2.1, maxZ: 2.1, floorY: 0 },
        { minX: -1.6, maxX: 1.0, minZ: 0.95, maxZ: 2.1, floorY: 0 },
        { minX: -1.6, maxX: 1.0, minZ: -2.1, maxZ: -0.95, floorY: 0 },
        { minX: 1.0, maxX: 6.9, minZ: -0.2, maxZ: 2.1, floorY: 0 },
        { minX: 1.0, maxX: 6.9, minZ: -2.1, maxZ: -0.2, floorY: 0 },
        { minX: -3.4, maxX: -1.0, minZ: -4.55, maxZ: -2.1, floorY: 0 },
        { minX: 1.6, maxX: 6.9, minZ: -4.55, maxZ: -2.1, floorY: 0 },
        { minX: -6.9, maxX: -6.0, minZ: -4.55, maxZ: -2.1, floorY: 0 },
        { minX: -3.8, maxX: -3.0, minZ: 2.1, maxZ: 4.55, floorY: 0 },
        { minX: -0.4, maxX: 1.0, minZ: 2.1, maxZ: 4.55, floorY: 0 },
        { minX: 3.6, maxX: 6.9, minZ: 2.1, maxZ: 4.55, floorY: 0 },
      ],
      pois: [
        {
          id: 'manifest-slate',
          label: 'the tally slate',
          position: [6.5, 1.1, 4.2],
          operable: true,
        },
        { id: 'crane', label: 'the crane car', position: [-1.3, 5.0, 0] },
      ],
      lamps: [
        [-5.4, -4.2, -0.5, 0.5],
        [-1.0, 0.2, -0.5, 0.5],
        [3.4, 4.6, -0.5, 0.5],
      ],
    }
  ),
  room({
    id: 'drystores',
    name: 'THE DRYSTORES',
    family: 'stores',
    seed: 33,
    description: 'Ration pallets shrink-wrapped to the deck rings.',
    purpose: 'Supplies vendor; the sounding panel hides the void.',
    rect: [-27.95, -23.95, 22.0, 25.4],
    h: 2.45,
    machineryHz: 38,
    ports: [
      { id: 'w', wall: 'w', at: 23.5 },
      { id: 'e', wall: 'e', at: 23.7 },
    ],
  }),
  room(
    {
      id: 'void',
      name: 'THE VOID',
      family: 'secret',
      seed: 34,
      description: 'A hollow between frames that is on no drawing.',
      purpose: 'SECRET - smuggler stash; opens to the sounding ability.',
      rect: [-23.95, -21.55, 22.5, 25.0],
      ports: [{ id: 'w', wall: 'w', at: 23.7 }],
    },
    {
      furniture: [
        { name: 'stash-a', mat: 'FOIL', box: [0.35, 0.95, 0, 0.42, -0.7, -0.1] },
        { name: 'stash-b', mat: 'KICK', box: [0.3, 0.85, 0.42, 0.74, -0.64, -0.16] },
        { name: 'stash-c', mat: 'FOIL', box: [0.38, 0.82, 0.74, 1.08, -0.6, -0.2] },
        { name: 'rib-a', mat: 'JAMB', box: [-0.62, -0.5, 0, 2.0, -1.05, 1.05] },
        { name: 'rib-b', mat: 'JAMB', box: [0.5, 0.62, 0, 2.0, 0.3, 1.05] },
        { name: 'pipe', mat: 'TRIM', box: [-1.0, 1.0, 0.24, 0.34, 1.0, 1.1] },
      ],
      floors: [
        { minX: -1.1, maxX: 0.2, minZ: -1.15, maxZ: 0.95, floorY: 0 },
        { minX: -1.1, maxX: 1.0, minZ: -0.02, maxZ: 0.95, floorY: 0 },
      ],
      pois: [{ id: 'stash', label: 'the stash', position: [0.58, 1.08, -0.22], operable: true }],
    }
  ),
  room(
    {
      id: 'crib',
      name: 'THE CRIB',
      family: 'stores',
      seed: 35,
      description: 'The tool crib, counter and cage and checkout ledger.',
      purpose: 'Key-item checkout; the bond vault opens off its cage.',
      rect: [-27.95, -24.75, 27.0, 30.4],
      h: 3.0,
      machineryHz: 34,
      ports: [
        { id: 'w', wall: 'w', at: 28.5 },
        { id: 'e', wall: 'e', at: 28.5 },
      ],
    },
    {
      pois: [
        { id: 'ledger', label: 'the checkout ledger', position: [-0.9, 1.05, 0.8], operable: true },
      ],
    }
  ),
  room({
    id: 'bond',
    name: 'THE BOND',
    family: 'stores',
    seed: 36,
    description: 'The bonded store. What was too valuable to leave loose.',
    purpose: 'SECRET-ADJACENT - locked reward vault behind the crib.',
    rect: [-24.75, -22.15, 27.4, 30.2],
    h: 2.5,
    machineryHz: 0,
    ports: [{ id: 'w', wall: 'w', at: 28.5 }],
  }),
  room(
    {
      id: 'coldstore',
      name: 'THE COLDSTORE',
      family: 'stores',
      seed: 37,
      description: 'The freezer. Frost on the door seals, breath in the air.',
      purpose: 'A cold biome pocket; something preserved in the back.',
      rect: [-27.95, -24.95, 30.6, 33.2],
      h: 3.1,
      machineryHz: 58,
      ports: [{ id: 'w', wall: 'w', at: 31.8 }],
    },
    {
      // DIFF stays in the list: a custom selfLit REPLACES the base, and
      // losing the lamp entry left the coldstore's one fitting rendering
      // from the lightmap alone - a dark plate where the light should be.
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['FROST', FROST_LIT],
      ],
    }
  ),
  room(
    {
      id: 'engine',
      name: 'THE ENGINE GALLERY',
      family: 'setpiece',
      seed: 38,
      description: 'The overlook. Coil stacks fall away below the rail, still charged.',
      purpose: 'Spectacle and endgame tease - the ship admits how big it is.',
      rect: [-31.55, -26.75, 33.2, 37.2],
      h: 4.5,
      atlas: 2048,
      machineryHz: 112,
      ports: [
        { id: 's', wall: 's', at: -29.15 },
        { id: 'e', wall: 'e', at: 35.2 },
      ],
    },
    {
      furniture: [
        { name: 'rail', mat: 'TRIM', box: [-2.2, 2.2, 1.02, 1.08, 0.7, 0.76] },
        { name: 'rail-posts-a', mat: 'TRIM', box: [-2.16, -2.08, 0, 1.02, 0.7, 0.76] },
        { name: 'rail-posts-b', mat: 'TRIM', box: [2.08, 2.16, 0, 1.02, 0.7, 0.76] },
        { name: 'coil-a', mat: 'CROWN', box: [-2.05, -1.25, 0, 4.1, 1.15, 1.85] },
        { name: 'coil-b', mat: 'CROWN', box: [-0.65, 0.15, 0, 4.2, 1.2, 1.9] },
        { name: 'coil-c', mat: 'CROWN', box: [0.75, 1.55, 0, 4.05, 1.12, 1.82] },
        { name: 'coil-glow-a', mat: 'EMBER', box: [-1.99, -1.31, 0.4, 3.7, 1.09, 1.15] },
        { name: 'coil-glow-b', mat: 'EMBER', box: [-0.59, 0.09, 0.4, 3.8, 1.14, 1.2] },
        { name: 'coil-glow-c', mat: 'EMBER', box: [0.81, 1.49, 0.4, 3.65, 1.06, 1.12] },
      ],
      floors: [{ minX: -2.3, maxX: 2.3, minZ: -1.9, maxZ: 0.6, floorY: 0 }],
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['EMBER', EMBER_LIT],
      ],
      pois: [{ id: 'rail-view', label: 'the overlook rail', position: [0, 1.05, 0.7] }],
    }
  ),
  room({
    id: 'holds',
    name: 'THE HOLDS',
    family: 'stores',
    seed: 39,
    description: 'Small-lot cargo, netted and tagged and never claimed.',
    purpose: 'Crate puzzle room, once pushing exists.',
    rect: [-26.75, -23.55, 33.7, 37.3],
    machineryHz: 30,
    ports: [{ id: 'w', wall: 'w', at: 35.2 }],
  }),

  // ---- SCIENCE: the quarter beyond the crawl -------------------------
  room(
    {
      id: 'spur',
      name: 'THE SPUR',
      family: 'corridor',
      seed: 41,
      description: 'The corridor south out of the crawl, colder every metre.',
      purpose: 'Circulation into the science quarter.',
      rect: [-24.85, -22.45, -13.35, -9.35],
      ports: [
        { id: 'n', wall: 'n', at: -23.65, low: true, floorY: 0.6 },
        { id: 'w', wall: 'w', at: -11.5 },
        { id: 's', wall: 's', at: -23.65 },
      ],
    },
    {
      floors: [
        { minX: -1.1, maxX: 1.1, minZ: 1.25, maxZ: 1.9, floorY: 0.6 },
        { minX: -1.1, maxX: 1.1, minZ: 1.0, maxZ: 1.25, floorY: 0.45 },
        { minX: -1.1, maxX: 1.1, minZ: 0.75, maxZ: 1.0, floorY: 0.3 },
        { minX: -1.1, maxX: 1.1, minZ: 0.5, maxZ: 0.75, floorY: 0.15 },
        { minX: -1.1, maxX: 1.1, minZ: -1.9, maxZ: 0.5, floorY: 0 },
      ],
      furniture: [
        { name: 'rail', mat: 'TRIM', box: [1.02, 1.06, 1.28, 1.33, -0.4, 1.6] },
        { name: 'tray', mat: 'JAMB', box: [-1.06, -0.92, 1.92, 2.04, -1.5, 1.5] },
      ],
    }
  ),
  room(
    {
      id: 'lab',
      name: 'THE LAB',
      family: 'science',
      seed: 42,
      description: 'Benches, a fume hood, glass put away like it mattered.',
      purpose: 'Experiment minigames; the clearance door hides the annex.',
      rect: [-30.05, -24.85, -13.3, -9.5],
      machineryHz: 49,
      ports: [
        { id: 'e', wall: 'e', at: -11.5 },
        { id: 'w', wall: 'w', at: -11.4 },
      ],
    },
    {
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['SCREENGLOW', SCREEN_LIT],
      ],
      pois: [{ id: 'hood', label: 'the fume hood', position: [-1.8, 1.2, -1.15], operable: true }],
    }
  ),
  room(
    {
      id: 'annex',
      name: 'THE ANNEX',
      family: 'secret',
      seed: 43,
      description: 'The sealed half of the lab. The experiment stayed.',
      purpose: 'SECRET - story room behind the clearance lock.',
      rect: [-32.45, -30.05, -12.9, -10.1],
      ports: [{ id: 'e', wall: 'e', at: -11.4 }],
    },
    {
      furniture: [
        // FOIL, not CROWN: a near-black tank against bare JAMB walls put a
        // third of the room's one frame into a single value bucket, and a
        // pressure tank in foil is the more honest object anyway.
        { name: 'tank', mat: 'FOIL', box: [-0.7, 0.1, 0, 1.7, -0.85, -0.15] },
        { name: 'tank-sight', mat: 'SCREENGLOW', box: [-0.55, -0.05, 0.7, 1.3, -0.148, -0.142] },
        { name: 'desk', mat: 'LINER', box: [-0.85, 0.55, 0, 0.78, 0.55, 1.0] },
        { name: 'rib-x', mat: 'JAMB', box: [0.95, 1.07, 0, 2.1, -1.2, 1.2] },
      ],
      floors: [
        { minX: -1.1, maxX: 0.9, minZ: -0.1, maxZ: 0.5, floorY: 0 },
        { minX: 0.2, maxX: 1.05, minZ: -1.2, maxZ: 0.5, floorY: 0 },
      ],
      // DIFF stays in the list - same lesson as the coldstore's fitting.
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['SCREENGLOW', SCREEN_LIT],
      ],
      pois: [
        { id: 'sightglass', label: 'the sight glass', position: [-0.3, 1.0, -0.2], operable: true },
      ],
    }
  ),
  room(
    {
      id: 'archive',
      name: 'THE ARCHIVE',
      family: 'science',
      seed: 44,
      description: 'The records room: ledgers, logs, the ship remembering itself.',
      purpose: 'Lore library - readable records; quests reference it.',
      rect: [-25.85, -22.35, -16.75, -13.35],
      machineryHz: 26,
      ports: [
        { id: 'n', wall: 'n', at: -23.65 },
        { id: 'e', wall: 'e', at: -15.55 },
        { id: 'w', wall: 'w', at: -15.05 },
      ],
    },
    {
      pois: [
        { id: 'ledgers', label: 'the deck ledgers', position: [-1.0, 1.1, -1.05], operable: true },
      ],
    }
  ),
  room(
    {
      id: 'charts',
      name: 'THE CHARTS',
      family: 'science',
      seed: 45,
      description:
        'The chart room. The deck drawn fair on the table, your thumbprint already on it.',
      purpose: 'The in-game MAP room - the deck map lives here.',
      rect: [-22.35, -19.75, -17.85, -14.45],
      machineryHz: 24,
      ports: [
        { id: 'w', wall: 'w', at: -15.55 },
        { id: 'n', wall: 'n', at: -20.65 },
        { id: 's', wall: 's', at: -20.85 },
      ],
    },
    {
      furniture: [
        // Against the east wall - the only wall with no door - so the three
        // door lanes cross the room unobstructed.
        { name: 'table', mat: 'LINER', box: [0.5, 1.15, 0, 0.9, -1.0, 1.0] },
        { name: 'chart', mat: 'SCREENGLOW', box: [0.55, 1.1, 0.9, 0.912, -0.9, 0.9] },
      ],
      floors: [{ minX: -1.2, maxX: 0.45, minZ: -1.6, maxZ: 1.6, floorY: 0 }],
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['SCREENGLOW', SCREEN_LIT],
      ],
      pois: [{ id: 'table', label: 'the chart table', position: [0.8, 0.95, 0], operable: true }],
    }
  ),
  room({
    id: 'shortcut',
    name: 'THE SHORTCUT',
    family: 'corridor',
    seed: 46,
    description: 'The narrow way from the charts to the berth.',
    purpose: 'Circulation; closes the science loop.',
    rect: [-21.55, -19.75, -14.45, -11.7],
    ports: [
      { id: 's', wall: 's', at: -20.65 },
      { id: 'e', wall: 'e', at: -12.9 },
    ],
  }),
  room(
    {
      id: 'garden',
      name: 'THE GARDEN',
      family: 'science',
      seed: 47,
      description: 'Hydroponics. The grow lights held, and so did the green.',
      purpose: 'Sanctuary - healing, growing collectibles, the one soft room.',
      rect: [-30.45, -25.85, -18.6, -14.0],
      h: 3.4,
      atlas: 2048,
      machineryHz: 21,
      ports: [
        { id: 'e', wall: 'e', at: -15.05 },
        { id: 's', wall: 's', at: -27.05 },
        { id: 'w', wall: 'w', at: -16.2 },
      ],
    },
    {
      furniture: [
        { name: 'trough-a1', mat: 'KICK', box: [-1.85, -1.15, 0, 0.62, -1.9, -0.62] },
        { name: 'green-a1', mat: 'GROWMASS', box: [-1.79, -1.21, 0.62, 0.98, -1.84, -0.68] },
        { name: 'trough-a2', mat: 'KICK', box: [-1.85, -1.15, 0, 0.62, 0.82, 1.9] },
        { name: 'green-a2', mat: 'GROWMASS', box: [-1.79, -1.21, 0.62, 0.98, 0.88, 1.84] },
        { name: 'trough-b', mat: 'KICK', box: [-0.35, 0.35, 0, 0.6, -1.94, -0.62] },
        { name: 'green-b', mat: 'GROWMASS', box: [-0.29, 0.29, 0.6, 1.04, -1.88, -0.68] },
        { name: 'trough-c', mat: 'KICK', box: [1.15, 1.85, 0, 0.64, -1.88, 0.44] },
        { name: 'green-c', mat: 'GROWMASS', box: [1.21, 1.79, 0.64, 0.96, -1.82, 0.38] },
        { name: 'grow-a1', mat: 'GROW', box: [-1.75, -1.25, 2.6, 2.66, -1.8, -0.7] },
        { name: 'grow-a2', mat: 'GROW', box: [-1.75, -1.25, 2.6, 2.66, 0.9, 1.8] },
        { name: 'grow-b', mat: 'GROW', box: [-0.25, 0.25, 2.62, 2.68, -1.84, -0.74] },
        { name: 'grow-c', mat: 'GROW', box: [1.25, 1.75, 2.58, 2.64, -1.78, 0.34] },
      ],
      floors: [
        { minX: -2.2, maxX: -1.9, minZ: -2.1, maxZ: 2.1, floorY: 0 },
        { minX: -2.2, maxX: 1.1, minZ: -0.5, maxZ: 0.75, floorY: 0 },
        { minX: -0.4, maxX: 2.2, minZ: 0.55, maxZ: 1.95, floorY: 0 },
        { minX: -1.1, maxX: -0.4, minZ: -2.1, maxZ: 2.1, floorY: 0 },
        { minX: 0.4, maxX: 1.1, minZ: -2.1, maxZ: 2.1, floorY: 0 },
        { minX: 1.9, maxX: 2.2, minZ: -2.1, maxZ: 2.1, floorY: 0 },
        { minX: -2.2, maxX: 2.2, minZ: -2.2, maxZ: -2.05, floorY: 0 },
        { minX: -2.2, maxX: 2.2, minZ: 2.0, maxZ: 2.2, floorY: 0 },
      ],
      selfLit: [
        ['DIFF', CREAM_LIT],
        ['GROW', GROW_LIT],
      ],
      pois: [{ id: 'trough', label: 'the grow trough', position: [0, 0.9, 0.5], operable: true }],
    }
  ),
  room(
    {
      id: 'scope',
      name: 'THE SCOPE',
      family: 'science',
      seed: 48,
      description: 'The instrument drum, slit shutters closed against the light.',
      purpose: 'Observation minigame - find things out the slit.',
      rect: [-33.65, -30.45, -17.8, -14.6],
      machineryHz: 19,
      ports: [{ id: 'e', wall: 'e', at: -16.2 }],
    },
    {
      pois: [{ id: 'eyepiece', label: 'the eyepiece', position: [-0.6, 1.3, 0], operable: true }],
    }
  ),
  room(
    {
      id: 'cache',
      name: 'THE CACHE',
      family: 'secret',
      seed: 49,
      description: 'The captain kept things. This is where.',
      purpose: "SECRET - the sigil-locked cache; the deck's best find.",
      rect: [-22.05, -19.65, -20.95, -17.85],
      ports: [{ id: 'n', wall: 'n', at: -20.85 }],
    },
    {
      furniture: [
        // Hard against the west frames, clear of the door lane.
        { name: 'chest-base', mat: 'JAMB', box: [-0.97, -0.27, 0.02, 0.36, -0.42, 0.1] },
        { name: 'chest', mat: 'FOIL', box: [-1.02, -0.22, 0.36, 0.92, -0.46, 0.14] },
        { name: 'chest-lid', mat: 'TRIM', box: [-0.98, -0.26, 0.92, 1.0, -0.42, 0.1] },
        { name: 'rib-l', mat: 'JAMB', box: [-1.05, -0.93, 0, 2.1, -1.2, 1.2] },
        { name: 'rib-r', mat: 'JAMB', box: [0.93, 1.05, 0, 2.1, -1.2, 1.2] },
        { name: 'shelf-lo', mat: 'KICK', box: [-0.9, 0.9, 1.32, 1.36, -1.18, -0.9] },
      ],
      floors: [
        { minX: -0.12, maxX: 0.9, minZ: -1.35, maxZ: 1.35, floorY: 0 },
        { minX: -1.05, maxX: 0.9, minZ: 0.25, maxZ: 1.35, floorY: 0 },
      ],
      pois: [
        { id: 'chest', label: "the captain's chest", position: [0, 0.96, 0.08], operable: true },
      ],
    }
  ),
  room(
    {
      id: 'assembly',
      name: 'THE ASSEMBLY',
      family: 'setpiece',
      seed: 50,
      description: 'The muster hall. Rows of benches facing a dais nobody stands on.',
      purpose: 'Quest hub - briefings; the crew met here and the player will.',
      rect: [-30.25, -24.65, -23.4, -18.6],
      h: 3.6,
      atlas: 2048,
      machineryHz: 23,
      ports: [
        { id: 'n', wall: 'n', at: -27.05 },
        { id: 'e', wall: 'e', at: -22.4 },
      ],
    },
    {
      furniture: [
        { name: 'dais', mat: 'LINER', box: [-2.5, -1.5, 0, 0.32, -1.9, 1.9] },
        { name: 'lectern', mat: 'TRIM', box: [-2.15, -1.85, 0.32, 1.35, -0.25, 0.15] },
        { name: 'bench-a', mat: 'KICK', box: [-0.6, -0.15, 0, 0.45, -0.6, 1.85] },
        { name: 'bench-b', mat: 'KICK', box: [0.45, 0.9, 0, 0.46, -0.56, 1.89] },
        { name: 'bench-c', mat: 'KICK', box: [1.5, 1.95, 0, 0.44, -0.62, 1.83] },
        { name: 'crate-row', mat: 'FOIL', box: [-1.45, -0.75, 0, 0.5, -1.95, -1.35] },
      ],
      floors: [
        { minX: -1.5, maxX: -0.6, minZ: -2.2, maxZ: 2.2, floorY: 0 },
        { minX: -0.15, maxX: 0.45, minZ: -2.2, maxZ: 2.2, floorY: 0 },
        { minX: 0.9, maxX: 1.5, minZ: -2.2, maxZ: 2.2, floorY: 0 },
        { minX: 1.95, maxX: 2.7, minZ: -2.2, maxZ: 2.2, floorY: 0 },
        { minX: -0.6, maxX: 2.7, minZ: -2.0, maxZ: -0.66, floorY: 0 },
        { minX: -2.6, maxX: 2.6, minZ: -2.3, maxZ: -2.15, floorY: 0 },
        { minX: -2.6, maxX: 2.6, minZ: 2.15, maxZ: 2.3, floorY: 0 },
      ],
      pois: [{ id: 'lectern', label: 'the lectern', position: [-2.0, 1.2, 0], operable: true }],
    }
  ),

  // ---- THE KEEL: the secret traverse ---------------------------------
  room({
    id: 'keela',
    name: 'THE KEEL RISE',
    family: 'secret',
    seed: 51,
    description: 'A frame bay never meant for walking, and walked anyway.',
    purpose: 'SECRET - the prybar panel drops you into the keel run.',
    rect: [-6.6, -5.0, -23.4, -13.31],
    ports: [
      { id: 'n', wall: 'n', at: -5.8 },
      { id: 'w', wall: 'w', at: -22.4 },
    ],
  }),
  room({
    id: 'keelb',
    name: 'THE KEEL RUN',
    family: 'secret',
    seed: 52,
    description: 'Seventeen metres of rib and shadow under everything.',
    purpose: 'SECRET - the traverse that shortcuts the whole south.',
    rect: [-24.65, -6.6, -23.4, -21.4],
    ports: [
      { id: 'e', wall: 'e', at: -22.4 },
      { id: 'w', wall: 'w', at: -22.4 },
    ],
  }),
];

// ------------------------------------------------------------- links

/**
 * Every join the expansion adds, existing rooms included. The locked ones
 * stay sealed - blank in place, collar dark - until the station is told the
 * named key has been found. That is the whole gameplay hook: the map shows
 * a door, the door shows a mechanism, the mechanism names what it wants.
 */
export const DECK_LINKS: readonly DeckLinkSpec[] = [
  // North block.
  { a: ['spine', 'north'], b: ['tee', 's'] },
  { a: ['tee', 'n'], b: ['walk', 's'] },
  { a: ['tee', 'e'], b: ['mess', 'w'] },
  { a: ['tee', 'w'], b: ['bunks', 'e'] },
  { a: ['mess', 'n'], b: ['galley', 's'] },
  { a: ['walk', 'w'], b: ['cabins', 'e'] },
  { a: ['walk', 'n'], b: ['ward', 's'] },
  { a: ['walk', 'e'], b: ['lockers', 'w'] },
  { a: ['ward', 'w'], b: ['head', 'e'] },
  { a: ['bunks', 'w'], b: ['return', 'e'] },
  { a: ['return', 'w'], b: ['crown', 'stbd'] },
  // South block.
  { a: ['spine', 'south'], b: ['chase', 'n'] },
  { a: ['chase', 'e'], b: ['shop', 'w'] },
  { a: ['chase', 's'], b: ['link', 'n'] },
  { a: ['shop', 's'], b: ['pumps', 'n'] },
  { a: ['pumps', 'e'], b: ['filter', 'w'] },
  { a: ['filter', 'n'], b: ['switch', 's'] },
  { a: ['link', 'w'], b: ['elbow', 'e'] },
  { a: ['link', 'e'], b: ['servers', 'w'] },
  { a: ['elbow', 'w'], b: ['berth', 'east'] },
  { a: ['servers', 's'], b: ['comms', 'n'] },
  { a: ['servers', 'e'], b: ['furnace', 'w'] },
  { a: ['furnace', 's'], b: ['keela', 'n'], locked: 'prybar' },
  // Far wing.
  { a: ['gantry', 'aft'], b: ['belt', 's'] },
  { a: ['belt', 'n'], b: ['engine', 's'] },
  { a: ['belt', 'e1'], b: ['drystores', 'w'] },
  { a: ['belt', 'e2'], b: ['crib', 'w'] },
  { a: ['belt', 'e3'], b: ['coldstore', 'w'] },
  { a: ['belt', 'w1'], b: ['hold', 'e'] },
  { a: ['drystores', 'e'], b: ['void', 'w'], locked: 'sounding' },
  { a: ['crib', 'e'], b: ['bond', 'w'], locked: 'manifest-key' },
  { a: ['engine', 'e'], b: ['holds', 'w'] },
  // Science quarter.
  { a: ['crawl', 'aft'], b: ['spur', 'n'] },
  { a: ['spur', 'w'], b: ['lab', 'e'] },
  { a: ['spur', 's'], b: ['archive', 'n'] },
  { a: ['lab', 'w'], b: ['annex', 'e'], locked: 'clearance' },
  { a: ['archive', 'e'], b: ['charts', 'w'] },
  { a: ['archive', 'w'], b: ['garden', 'e'] },
  { a: ['charts', 'n'], b: ['shortcut', 's'] },
  { a: ['charts', 's'], b: ['cache', 'n'], locked: 'sigil' },
  { a: ['shortcut', 'e'], b: ['berth', 'west'] },
  { a: ['garden', 's'], b: ['assembly', 'n'] },
  { a: ['garden', 'w'], b: ['scope', 'e'] },
  { a: ['assembly', 'e'], b: ['keelb', 'w'] },
  { a: ['keela', 'w'], b: ['keelb', 'e'] },
];

export { WALL as DECK_WALL, SEAM_W as DECK_SEAM_W };
