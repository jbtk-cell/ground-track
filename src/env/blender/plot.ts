/**
 * THE PLOT, BUILT IN BLENDER - the flight deck, as a real station compartment.
 *
 * What began as the side-by-side experiment recorded in docs/BLENDER.md is now
 * a room the station can place: it declares ports, solids, an extent and a
 * hull test exactly like src/env/plot, and the station joins it to THE
 * CROSSING, THE CRAWL and THE BEND without knowing or caring that its geometry
 * is a .glb and its light a Cycles bake.
 *
 * TWO MOUNTS, same as the hand-built room:
 *  - Solo (rooms.html#plot-blender): the portholes are real holes and the room
 *    owns the frame, painting space behind the glass via `render()`.
 *  - Station resident: only the anchor may paint (Painter in
 *    station/compartment.ts), so the portholes are shuttered with dark plates
 *    and the handle exposes no paint at all - the test "lets no room but the
 *    anchor paint" builds every room and checks.
 *
 * THE SCREENS carry the same procedural instrument content as the hand-built
 * console - one source of truth in src/env/kit/instruments, laid proud of the
 * bank face here, while the .glb contributes only the screens' light to the
 * bake (a hidden emissive plate per face; see tools/blender/build_plot.py).
 */
import * as THREE from 'three';
import type {
  EnvironmentDefinition,
  EnvironmentHandle,
  FloorRect,
  PointOfInterest,
} from '../types';
import type { CompartmentDefinition, CompartmentHandle } from '../station/compartment';
import { type Solid, solid } from '../kit/solids';
import { SEAM, port } from '../station/ports';
import { buildExterior } from '../limbDeck/exterior';
import type { Aperture, Frame } from '../limbDeck/contract';
import { LIMB_DECK_GEOMETRY, sampleOrbit } from '../orbit';
import { consoleFitOut } from '../plot/console';
import { halo } from '../kit/baked/glow';
import { PALETTE } from '../../render/palette';
import { bakedVisuals, capPlate, disposeVisuals, ready } from './loader';

const STEM = 'plot';

const HALF_X = 2.3;
const HALF_Z = 1.7;
const FLOOR_Y = 0;
const CEILING_Y = 2.85;
const EYE_HEIGHT = 1.74;
const SLOT_Z = 1.48;

/** Porthole plan, copied from src/env/plot so both rooms bore the same holes. */
const PORT_R = 0.25;
const PORT_Y = 1.55;
const PORT_SEGS = 16;
const PORTHOLE_X = [-1.62, 1.18] as const;
const SETBACK = 0.086;
/** The work-band face the collars mount on: the plane the bore is cut in. */
const GLASS_Z = -HALF_Z + SETBACK - 0.08;

const PORTS = [
  port('fore', [HALF_X, SEAM.height / 2, 0], '+x', FLOOR_Y),
  port('aft', [-HALF_X, SEAM.height / 2, 0.55], '-x', FLOOR_Y),
  port('port', [-0.4, SEAM.height / 2, -HALF_Z], '-z', FLOOR_Y),
] as const;

const EXTENT = {
  minX: -HALF_X,
  maxX: HALF_X,
  minY: -0.2,
  maxY: CEILING_Y + 0.2,
  minZ: -HALF_Z,
  maxZ: HALF_Z,
} as const;

/**
 * The room's box-shaped furniture, declared for the clash and containment
 * tests. The .glb is not boxes any more - it is bevelled, booleaned and
 * joined - so these are declarations in the same sense as the hand-built
 * room's porthole solids: the numbers the checks need, from the same plan
 * constants tools/blender/build_plot.py builds from.
 */
const SOLIDS: readonly Solid[] = [
  solid('desk', 'trim', -1.75, 0.35, 0.02, 1.03, 1.16, 1.68),
  solid('bank', 'trim', -1.75, 0.35, 1.03, 2.05, 1.54, 1.695),
  solid('perch', 'trim', -1.3, -0.4, 0.62, 0.7, 0.55, 0.85),
  solid('drawer', 'trim', -0.55, -0.05, 0.55, 0.85, 0.95, 1.2),
  solid('keys', 'trim', -1.3, -0.42, 1.03, 1.052, 1.24, 1.44),
  solid('lamp-station', 'trim', -1.655, 0.255, 2.702, CEILING_Y, 0.845, 1.295),
  solid('lamp-walk', 'trim', 0.845, 2.055, 2.722, CEILING_Y, -0.455, -0.045),
  solid('lamp-spur', 'trim', -0.905, 0.105, 2.742, CEILING_Y, -1.255, -0.945),
];

/**
 * Materials that are their own light source; see loader.bakedVisuals.
 * SCREENGLOW is the bake's screen-light plate - the runtime's own screen
 * plate stands 6 mm proud and hides it; dark here so any sliver that
 * survives reads as the screen's backing, never as a bare mint lamp.
 */
const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['SCREENGLOW', 0x1b2735],
]);

/** Warm plate tones for the caps and shutters, from the room's own family. */
const CAP_COLOUR = 0x6b5c42;
const SHUTTER_COLOUR = 0x40371f;

/** Handed to the exterior pass so it paints space and draws nothing else. */
const BLANK = new THREE.Scene();

/**
 * The console bank's frame, copied from src/env/plot so the drawn instruments
 * land on the same rectangles in both rooms. The one number that differs is
 * the face plane: the Blender bank's head face stands at z 1.54 (the model's
 * own carcass), where the hand-built room mounts on the slot plane at 1.48.
 */
const BANK = {
  x0: -1.75,
  x1: 0.35,
  faceZ: 1.54,
  slotY0: 1.15,
  slotY1: 1.29,
  topY: 2.05,
  deskY: 1.03,
} as const;

/** The instruments themselves, shared with the hand-built room's console. */
function bankInstruments(): readonly THREE.Object3D[] {
  const fitOut = consoleFitOut(BANK);
  fitOut.lit.dispose();
  const glow = new THREE.Mesh(fitOut.glow, new THREE.MeshBasicMaterial({ vertexColors: true }));
  glow.name = 'plotb-bank-glow';

  const parts: THREE.Object3D[] = [glow];
  const bankW = BANK.x1 - BANK.x0;
  const margin = bankW * 0.05;
  const gap = bankW * 0.035;
  const headH = BANK.topY - BANK.slotY1;
  const faceH = headH * 0.58;
  const faceV = BANK.slotY1 + headH * 0.14;
  const faceW = (bankW - margin * 2 - gap * 2) / 3;
  for (let i = 0; i < 3; i += 1) {
    const xRight = BANK.x1 - margin - (faceW + gap) * i;
    parts.push(
      halo({
        at: [xRight - faceW / 2, faceV + faceH / 2, BANK.faceZ],
        normal: [0, 0, -1],
        width: faceW * 1.5,
        height: faceH * 1.6,
        colour: PALETTE.MINT,
        opacity: 0.26,
        // Staggered so the three additive quads never share a plane.
        proud: 0.03 + i * 0.004,
      })
    );
  }
  return parts;
}

/**
 * The two porthole panes, for the exterior pass. A pane is the BORE'S OWN
 * POLYGON, not a rectangle around it - a square pane and a round hole
 * disagree about where space is, and Earth arrives clipped to a lens.
 */
function apertures(): readonly Aperture[] {
  return PORTHOLE_X.map((x) => {
    const corners: THREE.Vector3[] = [];
    for (let k = 0; k < PORT_SEGS; k += 1) {
      const a = (k / PORT_SEGS) * Math.PI * 2;
      corners.push(
        new THREE.Vector3(x + Math.cos(a) * PORT_R, PORT_Y + Math.sin(a) * PORT_R, GLASS_Z)
      );
    }
    return {
      corners,
      normal: new THREE.Vector3(0, 0, -1),
      centre: new THREE.Vector3(x, PORT_Y, GLASS_Z),
    };
  });
}

const FLOOR: readonly FloorRect[] = [
  { minX: -HALF_X + 0.08, maxX: -1.83, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
  { minX: -1.83, maxX: 0.43, minZ: -1.62, maxZ: 1.0, floorY: FLOOR_Y },
  { minX: 0.43, maxX: 1.02, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
  { minX: 1.02, maxX: 1.8, minZ: -1.62, maxZ: 1.24, floorY: FLOOR_Y },
  { minX: 1.8, maxX: HALF_X - 0.08, minZ: -1.62, maxZ: 1.62, floorY: FLOOR_Y },
];

const POINTS: readonly PointOfInterest[] = [
  { id: 'pad', label: 'the card slot', position: [-0.6, 1.22, SLOT_Z], operable: true },
  { id: 'perch', label: 'the perch', position: [1.41, 0.62, 1.49] },
  { id: 'bank', label: 'the flight computer', position: [-0.6, 1.7, SLOT_Z] },
];

interface PlotBlenderBuild {
  /** Real holes and a painter (solo mount), or shutters (station resident). */
  readonly open: boolean;
}

function buildPlotBlender(options: PlotBlenderBuild): CompartmentHandle {
  const root = new THREE.Group();
  root.name = 'plot-blender';

  const visuals = bakedVisuals(STEM, SELF_LIT);
  if (visuals !== null) {
    root.add(visuals);
    for (const part of bankInstruments()) root.add(part);
  }

  // Doorway caps: visible until the station says a port leads somewhere.
  const capMeshes = new Map<string, THREE.Mesh>();
  for (const p of PORTS) {
    const cap = capPlate(
      `cap-${p.id}`,
      p.at,
      p.facing,
      p.seam.width + 0.1,
      p.seam.height + 0.06,
      CAP_COLOUR
    );
    capMeshes.set(p.id, cap);
    root.add(cap);
  }

  // The portholes: open with an exterior painter, or shuttered. Only the
  // station's anchor may paint space, and this room is never the anchor.
  let exterior: ReturnType<typeof buildExterior> | null = null;
  if (options.open) {
    exterior = buildExterior(apertures(), LIMB_DECK_GEOMETRY);
  } else {
    for (const x of PORTHOLE_X) {
      const shutter = new THREE.Mesh(
        new THREE.CircleGeometry(PORT_R - 0.004, PORT_SEGS),
        new THREE.MeshBasicMaterial({ color: SHUTTER_COLOUR })
      );
      shutter.name = `shutter-${x}`;
      shutter.position.set(x, PORT_Y, GLASS_Z + 0.004);
      root.add(shutter);
    }
  }

  // The arm is the one lit object in the room, exactly as in the hand-built
  // version.
  const hemi = new THREE.HemisphereLight(0xd9c9a6, 0x2a2622, 0.85);
  const key = new THREE.DirectionalLight(0xe4d6bb, 0.55);
  key.position.set(-0.8, 2.6, 0.4);
  root.add(hemi, key, key.target);

  const handle: CompartmentHandle = {
    root,
    spawn: { position: [1.9, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2 + 0.3, pitch: -0.04 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 58,
    solids: SOLIDS,
    ports: PORTS,
    extent: EXTENT,

    contains(point: THREE.Vector3): number {
      return Math.min(
        point.y - FLOOR_Y,
        CEILING_Y - point.y,
        HALF_X - Math.abs(point.x),
        HALF_Z - Math.abs(point.z)
      );
    },

    sealPort(portId: string, sealed: boolean): void {
      const plate = capMeshes.get(portId);
      if (plate !== undefined) plate.visible = sealed;
    },

    interact(id: string): boolean {
      return id === 'pad';
    },

    update(tSeconds: number): void {
      if (exterior === null) return;
      const frame: Frame = {
        t: tSeconds,
        orbit: sampleOrbit(tSeconds, LIMB_DECK_GEOMETRY),
        reducedMotion: false,
      };
      exterior.update(frame);
    },

    dispose(): void {
      exterior?.dispose();
      disposeVisuals(root);
      root.clear();
    },
  };

  if (!options.open) return handle;

  /**
   * Solo mount only: this room owns its frame, because it has windows. The
   * viewer takes a `render(renderer, camera)` if it finds one
   * (src/env/viewer/main.ts selfRendering). This is deliberately NOT `paint`:
   * paint is the station's interface, and the test "lets no room but the
   * anchor paint" would rightly refuse a station build that carried one.
   */
  const painter = exterior;
  return Object.assign(handle, {
    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
      if (painter === null) return;
      painter.render(renderer, BLANK, camera);
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      renderer.render(root, camera);
    },
  });
}

/** The station's version: shuttered portholes, no painter. */
export const PLOT_BLENDER_COMPARTMENT: CompartmentDefinition = {
  id: 'plot',
  name: 'THE PLOT',
  description: 'The flight deck. Cards print here; the burn is committed here.',
  ports: PORTS,
  extent: EXTENT,
  build: () => buildPlotBlender({ open: false }),
};

/** The solo catalogue entry: open portholes, Earth painted behind the glass. */
export const PLOT_BLENDER: EnvironmentDefinition = {
  id: 'plot-blender',
  name: 'THE PLOT (BLENDER)',
  description: 'The same flight deck, modelled in Blender and lit by Cycles.',
  build: (): EnvironmentHandle => buildPlotBlender({ open: true }),
};

/** The registry awaits this so build() stays synchronous. */
export async function readyPlot(): Promise<void> {
  await ready(STEM);
}

export default PLOT_BLENDER;
