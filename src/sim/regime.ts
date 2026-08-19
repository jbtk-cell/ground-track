/**
 * THE REGIMES - the game's areas, defined by physics rather than by decoration.
 *
 * docs/STRUCTURE.md: "An area is an orbital regime: an altitude/inclination band
 * defined by three real things at once - its WEATHER (the perturbation that
 * regenerates its encounters), its TEMPO (rev period, which sets the pace of
 * play there), and its LIGHT (which expression of the fixed palette dominates
 * the frame). Nothing is themed; every distinction falls out of where you
 * physically are."
 *
 * That sentence is a specification, and this file is the place it either holds
 * or quietly stops holding. So every number below that CAN be derived IS
 * derived, and the thing each regime declares is the one physical fact that
 * makes it that regime:
 *
 *   THE LOW FIELD  declares an altitude.       300-600 km is where drag lives.
 *   THE DAWN LINE  declares an altitude, and its inclination falls out of
 *                  requiring the orbit plane to precess once per year.
 *   THE SHELL      declares a PERIOD - half a sidereal day - and its altitude
 *                  falls out of Kepler.
 *   THE RING       declares a PERIOD - one sidereal day - likewise.
 *
 * Two of the four therefore have no altitude typed into them anywhere, and the
 * one with the famous inclination does not have 98 degrees typed into it
 * either. This is not showing off. A regime whose period and altitude are both
 * literals is a regime that can be edited into disagreeing with Kepler's third
 * law, on a screen where the player is doing arithmetic and trusting the game
 * to have done its own.
 *
 * THE QUIET LESSON, and the reason THE DAWN LINE is worth the trouble.
 * STRUCTURE.md again: "the same J2 that is weather elsewhere is harnessed here
 * - sun-synchronism is the enemy working for you." J2 is Earth's equatorial
 * bulge, and everywhere else in the game it is the thing that drags a slot off
 * station and regenerates encounters forever. Here the same term, with the sign
 * it always had, is what pins an orbit to the terminator. The code says so: the
 * function that computes the drift is the function that computes the cure, and
 * DAWN_LINE's inclination is literally the root of "make the drift equal to a
 * year".
 *
 * WHAT IS NOT HERE. THE LONG SWING - Molniya - is deliberately absent. It is
 * the one regime that is not circular, and everything in this file assumes
 * e = 0: the periods, the altitudes, the precession rate and the ground-track
 * repeat all take that shortcut. Adding a 63.4-degree, e = 0.74 ellipse means
 * a propagator that carries eccentricity through all of it, and half-adding it
 * would mean a Molniya whose apogee dwell - the entire point of the area - is
 * computed as if it were a circle. FARSIDE is absent for the plainer reason
 * that it is lunar.
 *
 * Pure: no three.js, no DOM, no clock, no randomness. src/sim stays a library.
 */
import { MU_EARTH, R_EARTH, TWO_PI } from './constants';
import { period } from './orbit';

/** The design specifies inclinations in degrees; this is the only place they convert. */
const DEG = Math.PI / 180;

/**
 * Earth's second zonal harmonic: the oblateness term, dimensionless (EGM96).
 *
 * The single most important perturbation in Earth orbit after gravity itself,
 * and about a thousand times larger than the next one. Every regime in the
 * game is shaped by it - THE RING's slot drift is the triaxial cousin of it,
 * THE SHELL's plane phasing works against it, and THE DAWN LINE is built out
 * of it on purpose.
 */
export const J2 = 1.08262668e-3;

/**
 * One sidereal day, seconds: how long Earth takes to turn once against the
 * stars rather than against the sun.
 *
 * The sidereal day and not the 86,400 s solar day, and the four minutes
 * between them are not a rounding error - they are the whole difference
 * between a satellite that hangs over one meridian forever and one that walks
 * a degree west a day. THE RING is defined by this number.
 */
export const SIDEREAL_DAY_S = 86164.0905;

/** One tropical year in seconds: what the sun-synchronous condition matches. */
export const TROPICAL_YEAR_S = 365.24219 * 86400;

/** How fast the mean sun walks round the sky in Earth-fixed right ascension, rad/s. */
export const SUN_DRIFT_RATE = TWO_PI / TROPICAL_YEAR_S;

/** What regenerates a regime's encounters, forever, without anybody scheduling it. */
export type Weather = 'drag' | 'sun-synchronism' | 'belt' | 'triaxiality';

/** Which expression of the one fixed palette dominates a regime's frames. */
export type Light = 'haze' | 'terminator' | 'full-disc' | 'night';

export interface Regime {
  /** Stable slug. */
  readonly id: string;
  /** As printed, in caps, on the map and in every register string. */
  readonly name: string;
  /** Mean orbital radius from Earth's centre, km. */
  readonly radiusKm: number;
  /** Altitude above the mean equatorial radius, km. */
  readonly altitudeKm: number;
  /** Inclination, radians. */
  readonly inclination: number;
  /** One revolution in seconds. Kepler, never a literal. */
  readonly periodSeconds: number;
  /** The perturbation that regenerates this area's encounters. */
  readonly weather: Weather;
  /** Which face of the palette this area wears. */
  readonly light: Light;
  /**
   * How fast the orbit plane's ascending node walks, rad/s. Negative is
   * westward, which is what a prograde orbit does.
   */
  readonly nodalPrecession: number;
}

/**
 * How fast J2 walks the ascending node of a circular orbit, rad/s.
 *
 * The classical secular rate. Negative for prograde orbits - the node
 * regresses - and positive past 90 degrees, which is the entire trick behind
 * THE DAWN LINE: a retrograde orbit precesses EAST, and east is the direction
 * the sun appears to move.
 */
export function nodalPrecession(radiusKm: number, inclination: number): number {
  const n = Math.sqrt(MU_EARTH / radiusKm ** 3);
  const ratio = R_EARTH / radiusKm;
  return -1.5 * J2 * ratio * ratio * n * Math.cos(inclination);
}

/**
 * The inclination whose nodal precession is exactly one turn per year.
 *
 * Solved rather than tabulated. Set the J2 rate equal to the sun's apparent
 * drift and the only unknown left is cos(i), so the famous "98 degrees" is not
 * a constant in this codebase - it is what falls out at 750 km, and it moves
 * correctly if the altitude does. That is the difference between modelling
 * sun-synchronism and quoting it.
 *
 * Throws above roughly 5,975 km altitude, where J2 is too weak to keep up with
 * the sun at any inclination at all and the required cosine passes -1. The
 * throw is the honest answer: there is no such orbit, and returning a clamped
 * angle would be inventing one.
 */
export function sunSynchronousInclination(radiusKm: number): number {
  const n = Math.sqrt(MU_EARTH / radiusKm ** 3);
  const ratio = R_EARTH / radiusKm;
  const cosine = -SUN_DRIFT_RATE / (1.5 * J2 * ratio * ratio * n);
  if (cosine < -1 || cosine > 1) {
    throw new RangeError(
      `no sun-synchronous orbit at r = ${radiusKm.toFixed(0)} km: J2 cannot precess that fast`
    );
  }
  return Math.acos(cosine);
}

/**
 * The circular radius whose period is exactly this long. Kepler's third law,
 * rearranged.
 *
 * This is what lets THE SHELL and THE RING declare a tempo and be handed an
 * altitude, rather than declaring both and being trusted to have multiplied
 * correctly.
 */
export function radiusForPeriod(seconds: number): number {
  return Math.cbrt(MU_EARTH * (seconds / TWO_PI) ** 2);
}

/** Build a regime from its altitude, which is what the low areas are defined by. */
function byAltitude(
  id: string,
  name: string,
  altitudeKm: number,
  inclination: number | 'sun-synchronous',
  weather: Weather,
  light: Light
): Regime {
  const radiusKm = R_EARTH + altitudeKm;
  const i = inclination === 'sun-synchronous' ? sunSynchronousInclination(radiusKm) : inclination;
  return {
    id,
    name,
    radiusKm,
    altitudeKm,
    inclination: i,
    periodSeconds: period(radiusKm),
    weather,
    light,
    nodalPrecession: nodalPrecession(radiusKm, i),
  };
}

/** Build a regime from its period, which is what the high areas are defined by. */
function byPeriod(
  id: string,
  name: string,
  seconds: number,
  inclination: number,
  weather: Weather,
  light: Light
): Regime {
  const radiusKm = radiusForPeriod(seconds);
  return {
    id,
    name,
    radiusKm,
    altitudeKm: radiusKm - R_EARTH,
    inclination,
    // Recomputed from the radius rather than echoed back, so a mistake in
    // radiusForPeriod cannot hide behind the number that produced it.
    periodSeconds: period(radiusKm),
    weather,
    light,
    nodalPrecession: nodalPrecession(radiusKm, inclination),
  };
}

/**
 * THE LOW FIELD. The starter area, and where the apogee-raise slice already
 * lives. Drag is the gentlest legible perturbation: perigee sinks, and cards
 * come more often the lower you get. 90-minute revs, day and night strobing
 * past, cream haze at full strength with the limb as a floor.
 */
export const LOW_FIELD = byAltitude('low-field', 'LOW FIELD', 400, 51.6 * DEG, 'drag', 'haze');

/**
 * THE DAWN LINE. The title palette as a place: the orbit rides the terminator
 * permanently, so the whole area is golden hour, and its ground tracks reach
 * every latitude, which makes it the territory-painting area.
 *
 * 750 km sits in the middle of the 700-800 band the design gives, and it is
 * the ONLY number typed here. The inclination is solved.
 */
export const DAWN_LINE = byAltitude(
  'dawn-line',
  'DAWN LINE',
  750,
  'sun-synchronous',
  'sun-synchronism',
  'terminator'
);

/**
 * THE SHELL. The lattice: semi-synchronous, two revolutions per sidereal day,
 * which is the defining fact and the input. Earth reads as a full sphere here
 * for the first time, the tempo is stately, and the belt below is a place you
 * transit rather than an effect applied to you.
 *
 * 55 degrees because that is what a navigation lattice actually flies - it is
 * the inclination that buys four-satellite visibility over the mid-latitudes.
 */
export const SHELL = byPeriod(
  'shell',
  'THE SHELL',
  SIDEREAL_DAY_S / 2,
  55 * DEG,
  'belt',
  'full-disc'
);

/**
 * THE RING. The night area. One sidereal day, equatorial: you hang still and
 * the Earth turns beneath you, settlement pinpricks dominating the frame.
 * Weather is triaxiality - the slot box your bead slides out of, forever.
 */
export const RING = byPeriod('ring', 'THE RING', SIDEREAL_DAY_S, 0, 'triaxiality', 'night');

/**
 * Every regime that ships, innermost first.
 *
 * The order is the map's order and the arithmetic guarantees it: each is
 * strictly further out than the last, so anything drawing them as rings can
 * take this array as given rather than sorting it and hoping.
 */
export const REGIMES: readonly Regime[] = [LOW_FIELD, DAWN_LINE, SHELL, RING];

/**
 * How much of the map's spacing is ordinal rather than logarithmic.
 *
 * Not a taste knob, and the number was measured rather than picked. A linear
 * map is hopeless - THE RING is 90 times further out than THE LOW FIELD, so
 * the three inner rings land within 1% of each other and the map is one line.
 * The obvious fix is a log scale, and a log scale is still not enough: it puts
 * THE LOW FIELD and THE DAWN LINE 0.028 apart on a 0-1 axis, which on the plot
 * table is 24 mm between two rings drawn 35 mm wide. Two rings closer together
 * than the hairline that draws them are one ring with a thick edge.
 *
 * So the spacing is a blend, and each half of it is doing a job the other
 * cannot. The log term keeps the map HONEST: the gap out to THE RING stays
 * visibly larger than the gap in to THE DAWN LINE, so the picture still says
 * that geostationary is far. The ordinal term keeps it LEGIBLE: it guarantees
 * every ring is separated from its neighbours whatever their radii, including
 * regimes nobody has added yet.
 *
 * At 0.55 the closest pair sits 0.196 apart and the widest 0.507 - a factor of
 * two and a half between them, which is enough to read as scale and not so
 * much that anything collides. The exact quantities are pinned in the tests,
 * so changing this constant is a decision somebody has to make on purpose.
 *
 * The map's true scale lives in the eyebrow, and always did: STRUCTURE.md
 * prints `LOW FIELD 400 KM`, so the distance is stated in figures next to the
 * ring rather than left to be measured off it. A diagram that has to carry its
 * own scale bar is a diagram whose labels are not doing their job.
 */
const ORDINAL_MIX = 0.55;

/**
 * Where a regime's ring sits on the map, 0 at the innermost and 1 at the
 * outermost.
 *
 * Radius from Earth's centre rather than altitude, because altitude is a
 * difference and a difference has no logarithm worth taking near zero - a
 * 300 km orbit and a 400 km orbit are 33% apart in altitude and 1.5% apart in
 * where they actually are.
 */
export function mapFraction(regime: Regime, all: readonly Regime[] = REGIMES): number {
  const radii = all.map((r) => Math.log(r.radiusKm));
  const low = Math.min(...radii);
  const high = Math.max(...radii);
  const index = all.findIndex((r) => r.id === regime.id);
  if (all.length < 2 || high - low < 1e-9) return 0;
  const logged = (Math.log(regime.radiusKm) - low) / (high - low);
  const ordinal = index < 0 ? logged : index / (all.length - 1);
  return (1 - ORDINAL_MIX) * logged + ORDINAL_MIX * ordinal;
}

/**
 * The map eyebrow, exactly as STRUCTURE.md prints it: `LOW FIELD 400 KM`.
 *
 * Whole kilometres, no decimal, no thousands separator - the register voice.
 * Derived altitudes round here and nowhere else, so the string is the only
 * place a number is allowed to lose precision.
 */
export function eyebrow(regime: Regime): string {
  return `${regime.name} ${Math.round(regime.altitudeKm)} KM`;
}
