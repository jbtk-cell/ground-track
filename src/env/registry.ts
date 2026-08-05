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
    id: 'node',
    name: 'The Node',
    description: 'A four-way junction, 4.6 m across the flats.',
    async load() {
      return definitionFrom(
        (await import('./node/index')) as unknown as Record<string, unknown>,
        'node'
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
      return definitionFrom(
        (await import('./station/plan')) as unknown as Record<string, unknown>,
        'station'
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
