/**
 * STATION KEPLER, as a graph.
 *
 * The whole layout of the place: which compartments exist and which seams join
 * them. Nothing here contains a coordinate. Every position in the station is
 * derived by `layOut` from these joins plus each room's own declaration of where
 * its ports are, which is what lets a room be built, reviewed and approved on its
 * own and then placed without touching a line of it.
 *
 * THE ORDER IS THE DESIGN. A sequence of rooms is not a set of rooms; it is what
 * you meet, in what order, after what. The limb deck is the widest and most
 * eventful space on the station and it is deliberately followed by the narrowest
 * and emptiest, because density only reads against sparseness and a player who
 * never gets a plain corridor stops being able to see an interesting room. That
 * is the one principle this file encodes and it is worth protecting: if a room is
 * added between these two, check what it does to the contrast, not just whether
 * it fits.
 *
 * The anchor is the limb deck and that is a constraint rather than a preference -
 * it owns the window, and a windowed room has to sit at the origin. See `Painter`
 * in ./compartment.ts.
 */
import { LIMB_DECK_COMPARTMENT } from '../limbDeck';
import { SPINE } from '../spine';
import { NODE } from '../node';
import type { CompartmentDefinition } from './compartment';
import { type Connection, connect } from './ports';
import { type StationHandle, type StationPlan, buildStation } from './index';

const ROOMS: readonly CompartmentDefinition[] = [LIMB_DECK_COMPARTMENT, SPINE, NODE];

const CONNECTIONS: readonly Connection[] = [
  connect('limb-deck', 'aft', 'spine', 'fore'),
  connect('spine', 'aft', 'node', 'fore'),
];

export const STATION: StationPlan = {
  id: 'station',
  name: 'STATION KEPLER',
  description: 'The pressurised run, streamed a few compartments at a time.',
  rooms: ROOMS,
  connections: CONNECTIONS,
  anchor: 'limb-deck',
  start: 'limb-deck',
};

export function buildStationKepler(): StationHandle {
  return buildStation(STATION);
}

export default {
  id: STATION.id,
  name: STATION.name,
  description: STATION.description,
  build: buildStationKepler,
};
