/**
 * The GROUND TRACK palette, verbatim from docs/DIRECTION.md.
 *
 * Two rules this file exists to enforce:
 *   - There is no black anywhere. VOID_SLATE is the darkest value in the game.
 *   - ACCENT appears on exactly two things: the primary action, and a live burn.
 */
export const PALETTE = {
  // Sky and limb gradient, top of frame down to the surface.
  VOID_SLATE: '#101B26',
  DEEP_FIELD: '#38495A',
  HIGH_FIELD: '#6E8496',
  DAWN_SAND: '#D9C9A6',
  DAWN_CREAM: '#E4D6BB',
  IGNITION_CORE: '#F1E7D4',

  // Earth.
  FOREST: '#4E6B3C',
  SAGE: '#6E8A4E',
  ARID: '#B9A87E',
  OCEAN: '#46707E',
  OCEAN_DEEP: '#35525E',
  CLOUD: '#DCD8CE',
  NIGHT_SIDE: '#101C28',
  SETTLEMENT: '#C9A063',

  // Spacecraft.
  HULL: '#7E93A2',
  HULL_SHADOW: '#46586A',
  FOIL: '#B99A63',
  ARRAY: '#2E3C55',

  // Instruments.
  MINT: '#C6DCCC',
  CAUTION_RUST: '#A8624B',

  // The single accent.
  ACCENT: '#D98A3C',
} as const;

/** Sunlight colour. Warm, low, raking. */
export const SUN_COLOUR = '#FFF0D6';

/** Earthshine bounce, used as the hemisphere ground term. */
export const EARTHSHINE_GROUND = '#C4B189';

/** Star colours, a five-stop spectral ramp. Cool to warm. */
export const STAR_RAMP = ['#BFD4E8', '#D6E2EE', '#F0EEE9', '#F2E3C8', '#E8C9A0'] as const;
