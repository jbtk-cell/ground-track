/**
 * THE PLOT, BUILT IN BLENDER - the same room, authored and lit in a DCC tool.
 *
 * This exists to answer one question with a picture rather than an argument:
 * is a room modelled in Blender and lit by Cycles visibly better than the same
 * room modelled in TypeScript and lit by src/env/kit/baked? Both are mounted
 * in the same viewer, at the same poses, with the same controls, so the two
 * can be flipped between. Nothing here is committed to as the way rooms will
 * be made; it is the experiment that decides whether they should be.
 *
 * WHAT IS THE SAME, deliberately, so the comparison is about looks and nothing
 * else: the 4.60 x 3.40 x 2.85 vessel, the console's every number, the
 * portholes' positions and bore, the floor rectangles, the spawn, the eye
 * height, the points of interest, and the exterior painter that puts Earth
 * behind the glass. All copied from src/env/plot, not re-derived.
 *
 * WHAT IS DIFFERENT: the geometry arrives as a .glb, and the light arrives as
 * a lightmap PNG baked by Cycles - a real path tracer with unlimited bounces -
 * instead of by this repo's own CPU solver. The runtime treats them
 * identically, because the runtime contract was already "unlit material,
 * lightmap on uv1", and that is exactly what a Blender bake produces. That
 * compatibility is the finding: no shader, no renderer and no material path
 * had to change to accept a Cycles bake.
 *
 * HOW THE ASSETS ARE MADE: headless Blender, driven by script, builds the room
 * from the same plan constants, unwraps a second UV set, bakes DIFFUSE with
 * direct and indirect light and colour switched OFF - so the map carries light
 * only and albedo stays in the material - divides by LIGHT_RANGE, and writes
 * public/blender/. The divisor matches kit/baked/bake.ts because Cycles'
 * irradiance in this room happens to land in the same range the CPU solver was
 * tuned to; the 99th percentile measured 1.95 against a range of 2.2.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
  EnvironmentDefinition,
  EnvironmentHandle,
  FloorRect,
  PointOfInterest,
} from '../types';
import { buildExterior } from '../limbDeck/exterior';
import type { Aperture, Frame } from '../limbDeck/contract';
import { LIMB_DECK_GEOMETRY, sampleOrbit } from '../orbit';

const HALF_X = 2.3;
const HALF_Z = 1.7;
const FLOOR_Y = 0;
const EYE_HEIGHT = 1.74;
const SLOT_Z = 1.48;

/**
 * The range the lightmap's 8 bits are spread over. Must match the divisor the
 * bake script applied; see the module comment. A MeshBasicMaterial computes
 * `lightMapTexel * lightMapIntensity / PI`, so the intensity that recovers
 * true irradiance is PI * LIGHT_RANGE - the same arithmetic, and the same
 * constant, as the hand-rolled path.
 */
const LIGHT_RANGE = 2.2;
const LIGHT_INTENSITY = Math.PI * LIGHT_RANGE;

/** Porthole plan, copied from src/env/plot so both rooms bore the same holes. */
const PORT_R = 0.25;
const PORT_Y = 1.55;
const PORT_SEGS = 16;
const PORTHOLE_X = [-1.62, 1.18] as const;
const SETBACK = 0.086;
/** The work-band face the collars mount on: the plane the bore is cut in. */
const GLASS_Z = -HALF_Z + SETBACK - 0.08;

/**
 * Materials that are their own light source.
 *
 * The bake is a DIFFUSE pass, which records light ARRIVING at a surface. A
 * lamp's own emission is not light arriving at the lamp, so the diffuser
 * panels and the readouts bake nearly black and would render as dark patches
 * under bright pools - the one place a light-only lightmap is visibly wrong.
 * They are therefore unlit flat surfaces at their emitted colour, which is
 * what the hand-built room does with the same surfaces for the same reason.
 */
const SELF_LIT = new Map<string, number>([
  ['DIFF', 0xe4d6bb],
  ['SCREEN', 0xc6dccc],
  ['SCREENBG', 0x1b2735],
]);

interface Asset {
  readonly scene: THREE.Group;
  readonly lightMap: THREE.Texture;
}

/** Handed to the exterior pass so it paints space and draws nothing else. */
const BLANK = new THREE.Scene();

function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}blender/${file}`;
}

async function loadAsset(): Promise<Asset> {
  const loader = new GLTFLoader();
  const [gltf, lightMap] = await Promise.all([
    loader.loadAsync(assetUrl('plot.glb')),
    new THREE.TextureLoader().loadAsync(assetUrl('plot-lightmap.png')),
  ]);
  // glTF UVs are top-left origin; a PNG loaded outside the glTF loader is not
  // flipped for us. Without this the whole bake lands upside down, which reads
  // as light coming from the floor.
  lightMap.flipY = false;
  lightMap.channel = 1;
  lightMap.needsUpdate = true;
  return { scene: gltf.scene, lightMap };
}

let asset: Asset | null = null;
let pending: Promise<Asset> | null = null;

/**
 * Fetch the .glb and its lightmap, once.
 *
 * The registry awaits this before handing the definition over, so `build()`
 * stays synchronous and a room is never half-there. That matters beyond
 * tidiness: the shot harness pins a pose and a time and expects the identical
 * frame every run, and geometry that arrives a frame or two late would make
 * this the one room whose picture depended on disk speed.
 */
export async function ready(): Promise<void> {
  if (asset !== null) return;
  pending ??= loadAsset();
  asset = await pending;
}

/** Swap every PBR material for the unlit + lightmap pair the runtime wants. */
function relight(source: THREE.Group, lightMap: THREE.Texture): THREE.Group {
  const root = source.clone(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const from = object.material as THREE.MeshStandardMaterial;
    const emitted = SELF_LIT.get(from.name);
    if (emitted !== undefined) {
      object.material = new THREE.MeshBasicMaterial({ color: emitted, toneMapped: false });
      return;
    }
    object.material = new THREE.MeshBasicMaterial({
      color: from.color.clone(),
      lightMap,
      lightMapIntensity: LIGHT_INTENSITY,
    });
  });
  return root;
}

/**
 * The two porthole panes, for the exterior pass.
 *
 * A pane is the BORE'S OWN POLYGON, not a rectangle around it - the same
 * sixteen-sided ring src/env/plot hands over, at the same plane. Four corners
 * of a bounding square looks like it ought to work and does not: the painter
 * treats the corners as the pane, so a square pane and a round hole disagree
 * about where space is, and Earth arrives clipped to a lens.
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

function build(): EnvironmentHandle {
  if (asset === null) {
    throw new Error('plot-blender: call ready() before build() - the registry does');
  }
  const root = new THREE.Group();
  root.name = 'plot-blender';
  root.add(relight(asset.scene, asset.lightMap));

  const exterior = buildExterior(apertures(), LIMB_DECK_GEOMETRY);

  // The arm is the one lit object in the room, exactly as in the hand-built
  // version. Held static here rather than probed: this room is a comparison of
  // surfaces, and a moving probe would be one more difference to argue about.
  const hemi = new THREE.HemisphereLight(0xd9c9a6, 0x2a2622, 0.85);
  const key = new THREE.DirectionalLight(0xe4d6bb, 0.55);
  key.position.set(-0.8, 2.6, 0.4);
  root.add(hemi, key, key.target);

  const handle: EnvironmentHandle = {
    root,
    spawn: { position: [1.9, FLOOR_Y + EYE_HEIGHT, 0], yaw: Math.PI / 2 + 0.3, pitch: -0.04 },
    floor: FLOOR,
    pointsOfInterest: POINTS,
    eyeHeight: EYE_HEIGHT,
    machineryHz: 58,

    interact(id: string): boolean {
      return id === 'pad';
    },

    update(tSeconds: number): void {
      const frame: Frame = {
        t: tSeconds,
        orbit: sampleOrbit(tSeconds, LIMB_DECK_GEOMETRY),
        reducedMotion: false,
      };
      exterior.update(frame);
    },

    dispose(): void {
      exterior.dispose();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (material instanceof THREE.Material) material.dispose();
        }
      });
      root.clear();
    },
  };

  /**
   * This room owns its frame, because it has windows.
   *
   * The viewer's own draw path clears once and renders the scene; a room with
   * a hole in it needs two passes into one canvas - space scissored into the
   * apertures, depth cleared, then the room over the top. The viewer offers
   * that by looking for a `render(renderer, camera)` on the handle, and takes
   * it if it finds one (src/env/viewer/main.ts selfRendering).
   *
   * A `paint()` is NOT enough, and that mistake is worth naming: paint is the
   * STATION's interface, called by the station on whichever resident room the
   * player is standing in. Mounted alone, there is no station to call it, so
   * the exterior pass never ran, and the portholes showed the canvas clear
   * colour - a flat navy disc that looks so much like deep space that the
   * frame reads as correct. What gave it away was a measurement rather than
   * an eye: the flatness gate reported the brightest pixel in the porthole
   * close-up as 96 of 255, which no frame containing a sunlit Earth can be.
   */
  return Object.assign(handle, {
    render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
      // The painter clears the canvas, scissors space into the apertures and
      // clears depth. It is handed an empty scene: what goes on top is
      // decided here, not by it.
      exterior.render(renderer, BLANK, camera);
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      renderer.render(root, camera);
    },
  });
}

export const PLOT_BLENDER: EnvironmentDefinition = {
  id: 'plot-blender',
  name: 'THE PLOT (BLENDER)',
  description: 'The same flight deck, modelled in Blender and lit by Cycles.',
  build,
};

export default PLOT_BLENDER;
