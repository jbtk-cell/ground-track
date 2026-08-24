/**
 * INSTRUMENTS - the small lit geometry that makes a compartment read as built.
 *
 * Every room on this station is structurally correct and visually empty. The
 * kit already has solids, facets and bands, which is everything needed to make
 * a volume: walls at the right heights, reveals at the right depths, doorways
 * that close their own grooves. What it has never had is anything to put ON a
 * wall. So a room is a set of large planes, each one exactly one value, and the
 * eye finds nothing to land on between the floor and the ceiling.
 *
 * WHAT THIS IS COPYING, AND WHAT IT IS DELIBERATELY NOT. The reference frame
 * that prompted this file is a lit console bank: three readout faces, a row of
 * indicator chips along a bulkhead, ribbed panels beside them. Its richness
 * comes from about two hundred small elements at three or four sizes, and NOT
 * from its textures, its bloom or its black. Those three are how that engine
 * happened to draw it and all three are banned here - so this file gets the
 * density the honest way, as geometry. A bar graph is a row of boxes. A trace
 * is a chain of quads. A block of machine text is thirty small quads of varying
 * length, which is what a text block looks like from more than a metre away
 * anyway, and it stays sharp at any distance because it is not an image.
 *
 * EVERYTHING SITS PROUD, AND THAT IS A CORRECTNESS RULE RATHER THAN A STYLE.
 * Content drawn ON a backing plate at the same depth is two coplanar surfaces
 * facing one way, which is the z-fighting the seams test exists to catch. Every
 * function here lifts its content along the panel normal by a multiple of
 * COPLANAR_M, and the multiples are staggered by layer - plate, then content,
 * then anything on top of content - so a stack of three never lands flush.
 *
 * MOUNTING IS BY BASIS, NOT BY AXIS. A `Panel` carries an origin corner and two
 * unit vectors, so the same call fits a readout to a flat bulkhead, a canted
 * console, or one of the crown's nine facets. Nothing here knows which room it
 * is in or which way is north.
 *
 * DETERMINISTIC. Each function seeds its own counter, so a given panel draws
 * the same bars every run and shots-diff stays meaningful. There is no clock
 * and no Math.random in this file.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import { COPLANAR_M } from './solids';
import { type Sink, pushQuad } from './mesh';

/**
 * A rectangle on a surface, and the two directions that span it.
 *
 * `right` and `up` are unit vectors and must be perpendicular; the outward
 * normal is their cross product, so the winding of everything drawn on the
 * panel follows from the basis rather than from a flag each call site has to
 * get right.
 */
export interface Panel {
  /** The corner where u = 0 and v = 0. */
  readonly origin: THREE.Vector3;
  /** Unit vector along increasing u. */
  readonly right: THREE.Vector3;
  /** Unit vector along increasing v. */
  readonly up: THREE.Vector3;
  /** Extent along `right`, metres. */
  readonly width: number;
  /** Extent along `up`, metres. */
  readonly height: number;
}

/**
 * Lift layers. Content must clear its plate, and a highlight must clear the
 * content, or the depth buffer picks a winner per pixel and the surface
 * crawls. Four times COPLANAR_M per layer is well outside the tolerance the
 * seams test measures and still under a millimetre, so nothing here casts a
 * silhouette the player can see from an angle.
 */
const LIFT_PLATE = COPLANAR_M * 4;
const LIFT_CONTENT = COPLANAR_M * 8;
const LIFT_MARK = COPLANAR_M * 12;

/**
 * The backing value for a readout face.
 *
 * Not VOID_SLATE. A screen that sits at the darkest value in the game reads as
 * a hole cut through the hull rather than a dark surface on it, and the rooms
 * already use VOID_SLATE for reveals, which genuinely are holes. This is one
 * step up, so a powered-down face is still plainly a face.
 */
export const SCREEN_BACK = '#16222E';

const SCRATCH_A = new THREE.Vector3();
const SCRATCH_B = new THREE.Vector3();
const SCRATCH_C = new THREE.Vector3();
const SCRATCH_D = new THREE.Vector3();
const SCRATCH_N = new THREE.Vector3();
const SCRATCH_TOWARDS = new THREE.Vector3();
const COLOUR = new THREE.Color();

/** The panel's outward normal, written into `out`. */
function normalOf(panel: Panel, out: THREE.Vector3): THREE.Vector3 {
  return out.crossVectors(panel.right, panel.up).normalize();
}

/**
 * A rectangle in panel coordinates, pushed as one facet.
 *
 * `u`/`v` are metres from the panel origin along `right`/`up`; `lift` is metres
 * along the outward normal. The point the facet is wound to face is taken a
 * metre out along that normal, which is what makes every call here immune to
 * the vertex-order mistake that would otherwise cull it.
 */
function pushRect(
  target: Sink,
  panel: Panel,
  u: number,
  v: number,
  du: number,
  dv: number,
  lift: number,
  colour: THREE.Color
): void {
  const n = normalOf(panel, SCRATCH_N);

  SCRATCH_A.copy(panel.origin)
    .addScaledVector(panel.right, u)
    .addScaledVector(panel.up, v)
    .addScaledVector(n, lift);
  SCRATCH_B.copy(SCRATCH_A).addScaledVector(panel.right, du);
  SCRATCH_C.copy(SCRATCH_B).addScaledVector(panel.up, dv);
  SCRATCH_D.copy(SCRATCH_A).addScaledVector(panel.up, dv);

  SCRATCH_TOWARDS.copy(SCRATCH_A).add(SCRATCH_C).multiplyScalar(0.5).addScaledVector(n, 1);

  pushQuad(target, SCRATCH_A, SCRATCH_B, SCRATCH_C, SCRATCH_D, SCRATCH_TOWARDS, colour);
}

/** Deterministic 0..1 sequence. The same generator starfield.ts uses. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * The dark plate a readout is drawn on, with a hairline bezel.
 *
 * The bezel is drawn as four thin rects rather than a larger rect behind the
 * plate, because a larger rect behind would be coplanar with the wall it is
 * mounted on and that is the exact clash this kit is supposed to avoid.
 */
export function screenPlate(
  target: Sink,
  panel: Panel,
  options: { readonly bezel?: number; readonly bezelColour?: string } = {}
): void {
  const bezel = options.bezel ?? 0.012;
  COLOUR.set(options.bezelColour ?? PALETTE.HULL_SHADOW);
  if (bezel > 0) {
    pushRect(target, panel, 0, 0, panel.width, bezel, LIFT_PLATE, COLOUR);
    pushRect(target, panel, 0, panel.height - bezel, panel.width, bezel, LIFT_PLATE, COLOUR);
    pushRect(target, panel, 0, bezel, bezel, panel.height - bezel * 2, LIFT_PLATE, COLOUR);
    pushRect(
      target,
      panel,
      panel.width - bezel,
      bezel,
      bezel,
      panel.height - bezel * 2,
      LIFT_PLATE,
      COLOUR
    );
  }

  COLOUR.set(SCREEN_BACK);
  pushRect(
    target,
    panel,
    bezel,
    bezel,
    panel.width - bezel * 2,
    panel.height - bezel * 2,
    LIFT_PLATE,
    COLOUR
  );
}

/**
 * Rows of machine text, as short bars of varying length.
 *
 * Two things make this read as text rather than as stripes. The rows are
 * broken into two or three words with gaps, because an unbroken bar per line is
 * a bar chart lying on its side. And every row starts at the same left margin
 * while ending in a different place, which is what ragged-right does and what
 * the eye actually uses to tell prose from a table.
 */
export function textRows(
  target: Sink,
  panel: Panel,
  options: {
    readonly rows?: number;
    readonly seed?: number;
    readonly colour?: string;
    readonly inset?: number;
    readonly fill?: number;
  } = {}
): void {
  const rows = options.rows ?? 6;
  const inset = options.inset ?? 0.024;
  const fill = options.fill ?? 0.72;
  const random = rng(options.seed ?? 11);

  const usableW = panel.width - inset * 2;
  const usableH = panel.height - inset * 2;
  if (usableW <= 0 || usableH <= 0) return;

  const pitch = usableH / rows;
  // A glyph row is a little over half its pitch; the rest is leading. Much
  // thicker and the block reads as a stack of bars rather than as writing.
  const glyph = pitch * 0.42;

  COLOUR.set(options.colour ?? PALETTE.MINT);

  for (let row = 0; row < rows; row += 1) {
    const v = inset + usableH - (row + 1) * pitch + (pitch - glyph) * 0.5;
    const lineW = usableW * (fill * (0.55 + random() * 0.45));
    const words = 2 + Math.floor(random() * 2);
    const gap = Math.min(0.014, usableW * 0.04);

    let u = inset;
    let left = lineW - gap * (words - 1);
    for (let word = 0; word < words; word += 1) {
      // Last word takes the remainder, so the row ends exactly on lineW.
      const share = word === words - 1 ? left : left * (0.3 + random() * 0.4);
      if (share <= 0) break;
      pushRect(target, panel, u, v, share, glyph, LIFT_CONTENT, COLOUR);
      u += share + gap;
      left -= share;
    }
  }
}

/**
 * A row of vertical bars, the reference frame's most recognisable element.
 *
 * The heights are a deterministic walk rather than independent samples: a bar
 * chart of independent noise looks like noise, and every real instrument that
 * shows a spectrum or a set of channel levels has neighbours that agree with
 * each other. The walk is what makes it read as a measurement.
 */
export function barGraph(
  target: Sink,
  panel: Panel,
  options: {
    readonly bars?: number;
    readonly seed?: number;
    readonly colour?: string;
    readonly inset?: number;
    readonly floor?: number;
  } = {}
): void {
  const bars = options.bars ?? 9;
  const inset = options.inset ?? 0.022;
  const floor = options.floor ?? 0.12;
  const random = rng(options.seed ?? 23);

  const usableW = panel.width - inset * 2;
  const usableH = panel.height - inset * 2;
  if (usableW <= 0 || usableH <= 0) return;

  const pitch = usableW / bars;
  const barW = pitch * 0.62;
  const base = new THREE.Color(options.colour ?? PALETTE.MINT);

  // Mean-reverting rather than a free walk. A free walk with a clamp spends
  // most of its length pinned against one end, which is how the first version
  // of this drew eleven bars of which nine were full height - a solid block,
  // not a chart. Pulling a third of the way back to mid each step keeps the
  // neighbours agreeing without letting the run drift to a rail.
  const mid = (1 + floor) * 0.5;
  let level = mid;
  for (let bar = 0; bar < bars; bar += 1) {
    level += (mid - level) * 0.34 + (random() - 0.5) * 0.5;
    level = Math.min(1, Math.max(floor, level));
    // Taller bars sit brighter. A flat-valued chart is legible but dead, and
    // the value ramp costs nothing because the colour is per-facet anyway.
    COLOUR.copy(base).multiplyScalar(0.62 + level * 0.38);
    pushRect(
      target,
      panel,
      inset + bar * pitch + (pitch - barW) * 0.5,
      inset,
      barW,
      usableH * level,
      LIFT_CONTENT,
      COLOUR
    );
  }
}

/**
 * A waveform, as a chain of short quads stepping between sampled heights.
 *
 * Drawn as one quad per sample column at that column's height rather than as a
 * true polyline, because a polyline in this renderer is either a THREE.Line -
 * which ignores the flat-shaded material every other surface here uses and
 * renders at one hairline pixel regardless of distance - or a ribbon of
 * mitred quads, which is a lot of geometry for a trace 40 mm tall. Stepping is
 * honest at this size: an oscilloscope trace sampled per column is what a
 * digital instrument would actually show.
 */
export function traceLine(
  target: Sink,
  panel: Panel,
  options: {
    readonly samples?: number;
    readonly cycles?: number;
    readonly seed?: number;
    readonly colour?: string;
    readonly inset?: number;
    readonly thickness?: number;
  } = {}
): void {
  const samples = options.samples ?? 34;
  const cycles = options.cycles ?? 2.5;
  const inset = options.inset ?? 0.02;
  const random = rng(options.seed ?? 37);

  const usableW = panel.width - inset * 2;
  const usableH = panel.height - inset * 2;
  if (usableW <= 0 || usableH <= 0) return;

  const thickness = options.thickness ?? Math.max(0.004, usableH * 0.1);
  const step = usableW / samples;
  // Leave room for the trace to swing without clipping the plate edge.
  const swing = (usableH - thickness) * 0.5;
  const mid = inset + usableH * 0.5;
  const phase = random() * Math.PI * 2;

  COLOUR.set(options.colour ?? PALETTE.MINT);

  // A carrier plus a weaker second harmonic, so the trace is periodic without
  // being a textbook sine.
  const height = (t: number): number =>
    mid +
    (Math.sin(phase + t * cycles * Math.PI * 2) * 0.78 +
      Math.sin(phase * 1.7 + t * cycles * Math.PI * 4.0) * 0.22) *
      swing;

  // Each column spans from its own sample to the NEXT one, so consecutive
  // columns share an edge and the trace is continuous. Drawing each sample as
  // an isolated dash at its own height - which is what this did first - gives a
  // field of specks wherever the wave is steep, because that is exactly where
  // consecutive samples are furthest apart. A trace has to be a line.
  for (let i = 0; i < samples; i += 1) {
    const y0 = height(i / (samples - 1));
    const y1 = height(Math.min(1, (i + 1) / (samples - 1)));
    const low = Math.min(y0, y1) - thickness * 0.5;
    const span = Math.abs(y1 - y0) + thickness;
    // Columns butt edge to edge rather than leaving a gap; a dashed trace at
    // this size reads as a dotted line rather than as a signal.
    pushRect(target, panel, inset + i * step, low, step, span, LIFT_CONTENT, COLOUR);
  }
}

/**
 * A runway of small indicator chips along the panel's u axis.
 *
 * The reference's bulkhead carries a line of these and they do more for the
 * "this is a machine" reading than anything else in its frame, because they are
 * the only elements repeated at a fixed pitch. Irregular spacing would say
 * "decoration"; a fixed pitch says "a bank of channels, one per something".
 *
 * `lit` is the fraction that are on. The rest are drawn at a fraction of the
 * value rather than omitted, because an empty socket in a row is a different
 * statement from a channel that is simply not reporting.
 */
export function chipRun(
  target: Sink,
  panel: Panel,
  options: {
    readonly chips?: number;
    readonly seed?: number;
    readonly colour?: string;
    readonly lit?: number;
    readonly dim?: number;
  } = {}
): void {
  const chips = options.chips ?? 12;
  const random = rng(options.seed ?? 53);
  const lit = options.lit ?? 0.55;
  const dim = options.dim ?? 0.3;

  const pitch = panel.width / chips;
  const chipW = pitch * 0.44;
  const chipH = Math.min(panel.height * 0.7, chipW * 0.8);
  const v = (panel.height - chipH) * 0.5;
  const base = new THREE.Color(options.colour ?? PALETTE.MINT);

  for (let chip = 0; chip < chips; chip += 1) {
    COLOUR.copy(base).multiplyScalar(random() < lit ? 1 : dim);
    pushRect(
      target,
      panel,
      chip * pitch + (pitch - chipW) * 0.5,
      v,
      chipW,
      chipH,
      LIFT_MARK,
      COLOUR
    );
  }
}

/**
 * Horizontal ribs across a panel - a louvre, a grille, a heat exchanger face.
 *
 * The cheapest density in the kit and the one that reads from furthest away,
 * because a set of parallel lines survives being only two pixels apart in a way
 * that a small readout does not. Alternating value rather than actual relief:
 * at this pitch a real extrusion would alias into a shimmering band whenever
 * the player moves, and a flat pair of values does not.
 */
export function louvres(
  target: Sink,
  panel: Panel,
  options: {
    readonly ribs?: number;
    readonly colour?: string;
    readonly contrast?: number;
    readonly inset?: number;
  } = {}
): void {
  const ribs = options.ribs ?? 7;
  const inset = options.inset ?? 0.02;
  const contrast = options.contrast ?? 0.26;

  const usableW = panel.width - inset * 2;
  const usableH = panel.height - inset * 2;
  if (usableW <= 0 || usableH <= 0) return;

  const pitch = usableH / ribs;
  const base = new THREE.Color(options.colour ?? PALETTE.HULL_SHADOW);

  for (let rib = 0; rib < ribs; rib += 1) {
    // The shadowed half of each rib, only. The lit half is the panel behind it,
    // which means half as many facets for the same read.
    COLOUR.copy(base).multiplyScalar(1 - contrast);
    pushRect(target, panel, inset, inset + rib * pitch, usableW, pitch * 0.5, LIFT_CONTENT, COLOUR);
  }
}

/**
 * Raised fastener heads around the rim of a panel.
 *
 * Small square pads rather than modelled bolts. At the distance a player stands
 * from a bulkhead a bolt head is two or three pixels, and two or three pixels
 * of a cylinder's shading is indistinguishable from a flat pad while costing
 * sixteen times the facets.
 */
export function rimBolts(
  target: Sink,
  panel: Panel,
  options: {
    readonly perSide?: number;
    readonly size?: number;
    readonly margin?: number;
    readonly colour?: string;
  } = {}
): void {
  const perSide = options.perSide ?? 4;
  const size = options.size ?? 0.022;
  const margin = options.margin ?? 0.03;
  COLOUR.set(options.colour ?? PALETTE.HULL);

  const spanU = panel.width - margin * 2 - size;
  const spanV = panel.height - margin * 2 - size;
  if (spanU <= 0 || spanV <= 0) return;

  for (let i = 0; i < perSide; i += 1) {
    const t = perSide === 1 ? 0.5 : i / (perSide - 1);
    const u = margin + t * spanU;
    const v = margin + t * spanV;
    pushRect(target, panel, u, margin, size, size, LIFT_MARK, COLOUR);
    pushRect(target, panel, u, panel.height - margin - size, size, size, LIFT_MARK, COLOUR);
    pushRect(target, panel, margin, v, size, size, LIFT_MARK, COLOUR);
    pushRect(target, panel, panel.width - margin - size, v, size, size, LIFT_MARK, COLOUR);
  }
}

/**
 * A stencil block - the `AE-4` / `+Z` / `NO STEP` marks DIRECTION.md asks for,
 * at the size they are actually legible from, which is to say as a shape rather
 * than as letters.
 *
 * `glyphs` is how many characters the mark stands for. Each is a narrow rect of
 * a randomised height, which at three metres is exactly what a stencilled code
 * looks like: a broken band with a consistent cap height and a ragged baseline.
 */
export function stencil(
  target: Sink,
  panel: Panel,
  options: { readonly glyphs?: number; readonly seed?: number; readonly colour?: string } = {}
): void {
  const glyphs = options.glyphs ?? 4;
  const random = rng(options.seed ?? 71);
  COLOUR.set(options.colour ?? PALETTE.HULL);

  const pitch = panel.width / glyphs;
  const glyphW = pitch * 0.68;

  for (let glyph = 0; glyph < glyphs; glyph += 1) {
    // Descenders and short characters, but every glyph shares the cap line.
    const h = panel.height * (0.72 + random() * 0.28);
    pushRect(
      target,
      panel,
      glyph * pitch + (pitch - glyphW) * 0.5,
      panel.height - h,
      glyphW,
      h,
      LIFT_MARK,
      COLOUR
    );
  }
}

/**
 * Build a panel from a corner and two directions, normalising as it goes.
 *
 * Call sites pass whatever axes the wall runs along and get a valid basis back,
 * which is the difference between mounting a readout on the crown's fourth
 * facet being one line and being a quaternion problem.
 */
export function panelAt(
  origin: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  width: number,
  height: number
): Panel {
  return {
    origin: origin.clone(),
    right: right.clone().normalize(),
    up: up.clone().normalize(),
    width,
    height,
  };
}
