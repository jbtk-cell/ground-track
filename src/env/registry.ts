/**
 * The catalogue of environments.
 *
 * Lives in src/env rather than in the viewer because the game mounts the same
 * rooms the viewer approves, and both need one list to read from.
 *
 * Metadata is static and the module is loaded on demand. That split is the
 * point: the viewer can print the whole catalogue, and say which entry it
 * failed on, without any room's code having run. A room that throws while
 * building takes itself down and nothing else.
 */
import type { EnvironmentDefinition } from './types';

export interface EnvironmentEntry {
  /** Stable slug, and the URL fragment: rooms.html#limb-deck */
  readonly id: string;
  /** Display name. The viewer prints it in caps. */
  readonly name: string;
  /** One line on what this place is. */
  readonly description: string;
  /** Imports the module. Rejects if the room is missing or broken. */
  load(): Promise<EnvironmentDefinition>;
}

/**
 * The rooms are built in parallel against the shape in types.ts, not against
 * an agreed export name, so take whichever export is an EnvironmentDefinition:
 * a default export, or the first named one that answers to the contract.
 */
function definitionFrom(module: Record<string, unknown>, id: string): EnvironmentDefinition {
  for (const value of [module['default'], ...Object.values(module)]) {
    if (typeof value !== 'object' || value === null) continue;
    const candidate = value as Partial<EnvironmentDefinition>;
    if (typeof candidate.build === 'function' && typeof candidate.id === 'string') {
      return candidate as EnvironmentDefinition;
    }
  }
  throw new Error(`${id} exports no EnvironmentDefinition`);
}

export const ENVIRONMENTS: readonly EnvironmentEntry[] = [
  {
    id: 'limb-deck',
    name: 'The Limb Deck',
    description: 'A 6.4 m module with a faceted cupola in the port hull.',
    async load() {
      return definitionFrom(
        (await import('./limbDeck/index')) as unknown as Record<string, unknown>,
        'limb-deck'
      );
    },
  },
  {
    id: 'spine',
    name: 'The Spine',
    description: 'An 11 m connecting run, one person wide.',
    async load() {
      return definitionFrom(
        (await import('./spine/index')) as unknown as Record<string, unknown>,
        'spine'
      );
    },
  },
  {
    id: 'crossing',
    name: 'The Crossing',
    description: 'The hub, 5.4 by 4.2 m, its ceiling climbing 2.6 to 4.4.',
    async load() {
      return definitionFrom(
        (await import('./crossing/index')) as unknown as Record<string, unknown>,
        'crossing'
      );
    },
  },
  {
    // The whole station. Every compartment above can also be mounted on its own
    // - that is how a room gets reviewed and approved - but this is the one you
    // WALK, and the only place the seams between rooms exist. The rail lists it
    // apart from them for exactly that reason.
    id: 'station',
    name: 'Station Kepler',
    description: 'The pressurised run. Walk it end to end.',
    async load() {
      // Three of the station's compartments are Blender-built now, and their
      // geometry and light are files. Fetch them here so buildStation() can
      // stay synchronous and build every room at mount, as it always has.
      const [plot, crawl, bend] = await Promise.all([
        import('./blender/plot'),
        import('./blender/crawl'),
        import('./blender/bend'),
      ]);
      await Promise.all([plot.readyPlot(), crawl.readyCrawl(), bend.readyBend()]);
      return definitionFrom(
        (await import('./station/plan')) as unknown as Record<string, unknown>,
        'station'
      );
    },
  },
  {
    id: 'crown',
    name: 'The Crown',
    description: 'A 9.6 m shaft with three galleries, on the upper deck.',
    async load() {
      return definitionFrom(
        (await import('./crown/index')) as unknown as Record<string, unknown>,
        'crown'
      );
    },
  },
  {
    id: 'plot',
    name: 'The Plot',
    description: 'The flight deck, 4.6 by 3.4 m. The card prints here.',
    async load() {
      return definitionFrom(
        (await import('./plot/index')) as unknown as Record<string, unknown>,
        'plot'
      );
    },
  },
  {
    // The same room built in Blender and lit by Cycles, mounted beside the
    // hand-built one so the two can be flipped between at identical poses.
    // See src/env/plotBlender for what is deliberately held identical.
    id: 'plot-blender',
    name: 'The Plot (Blender)',
    description: 'The same flight deck, modelled in Blender and lit by Cycles.',
    async load() {
      // This room's geometry and light are files, not code, so the fetch
      // happens here - where the catalogue is already asynchronous - and
      // build() stays synchronous like every other room's.
      const module = await import('./blender/plot');
      await module.readyPlot();
      return definitionFrom(module as unknown as Record<string, unknown>, 'plot-blender');
    },
  },
  {
    id: 'crawl-blender',
    name: 'The Crawl (Blender)',
    description: 'The same duct, modelled in Blender and lit by Cycles.',
    async load() {
      const module = await import('./blender/crawl');
      await module.readyCrawl();
      return definitionFrom(module as unknown as Record<string, unknown>, 'crawl-blender');
    },
  },
  {
    id: 'bend-blender',
    name: 'The Bend (Blender)',
    description: 'The same turn, modelled in Blender and lit by Cycles.',
    async load() {
      const module = await import('./blender/bend');
      await module.readyBend();
      return definitionFrom(module as unknown as Record<string, unknown>, 'bend-blender');
    },
  },
  {
    id: 'racks',
    name: 'The Racks',
    description: '8.4 m of rack bays, one aisle wide.',
    async load() {
      return definitionFrom(
        (await import('./racks/index')) as unknown as Record<string, unknown>,
        'racks'
      );
    },
  },
  {
    id: 'crawl',
    name: 'The Crawl',
    description: 'A 7.2 m duct that closes in as it goes.',
    async load() {
      return definitionFrom(
        (await import('./crawl/index')) as unknown as Record<string, unknown>,
        'crawl'
      );
    },
  },
  {
    id: 'magazine',
    name: 'The Magazine',
    description: 'A 5 m square, silent, on the upper deck.',
    async load() {
      return definitionFrom(
        (await import('./magazine/index')) as unknown as Record<string, unknown>,
        'magazine'
      );
    },
  },
  {
    id: 'bend',
    name: 'The Bend',
    description: 'A 90 degree turn in fourteen flat facets, 1.9 m wide.',
    async load() {
      return definitionFrom(
        (await import('./bend/index')) as unknown as Record<string, unknown>,
        'bend'
      );
    },
  },
  {
    id: 'sill',
    name: 'The Sill',
    description: 'A grating over a 4.5 m sump, and the salvage register.',
    async load() {
      return definitionFrom(
        (await import('./sill/index')) as unknown as Record<string, unknown>,
        'sill'
      );
    },
  },
  {
    id: 'berth',
    name: 'The Berth',
    description: 'A 4.8 m octagon kept empty, with the only round hatch aboard.',
    async load() {
      return definitionFrom(
        (await import('./berth/index')) as unknown as Record<string, unknown>,
        'berth'
      );
    },
  },
  {
    id: 'gantry',
    name: 'The Gantry',
    description: '11 by 7.6 m of tanks under a 2.15 m ceiling, lit from below.',
    async load() {
      return definitionFrom(
        (await import('./gantry/index')) as unknown as Record<string, unknown>,
        'gantry'
      );
    },
  },
];

/**
 * The whole station: the one you walk, and the only entry that is not a single
 * compartment. The rail lists it apart from the rooms for that reason.
 */
export const STATION_ID = 'station';

/** What rooms.html mounts when the fragment is empty. */
export const DEFAULT_ENVIRONMENT_ID = STATION_ID;

export function environmentById(id: string): EnvironmentEntry | undefined {
  return ENVIRONMENTS.find((entry) => entry.id === id);
}
