/**
 * BLENDER ROOM LOADER - the runtime half of tools/blender/roomlib.py.
 *
 * A Blender-built room arrives as two files: a .glb of geometry and a PNG
 * lightmap baked by Cycles. This module fetches them, and swaps every PBR
 * material the exporter wrote for the pair the runtime actually wants - an
 * unlit MeshBasicMaterial carrying the albedo colour and the lightmap on uv1.
 * That contract ("unlit material, lightmap on uv1, 8 bits over a declared
 * range") is the same one src/env/kit/baked established, which is why a
 * path-traced bake drops into the engine with no renderer change at all.
 *
 * ASSETS ARE OPTIONAL AT BUILD TIME, on purpose. The room tests build every
 * compartment in Node, where there is no fetch and no WebGL; a station
 * compartment must therefore be able to construct its full testable contract -
 * ports, solids, floors, hull test - with no .glb on hand, and simply have no
 * visuals. The registry awaits ready() before any real mount, so a player
 * never sees the assetless skeleton.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The range the lightmap's 8 bits are spread over. Must match roomlib.py's
 * LIGHT_RANGE. A MeshBasicMaterial computes
 * `lightMapTexel * lightMapIntensity / PI`, so the intensity that recovers
 * true irradiance is PI * LIGHT_RANGE.
 */
export const LIGHT_RANGE = 2.2;
export const LIGHT_INTENSITY = Math.PI * LIGHT_RANGE;

interface BakedAsset {
  readonly scene: THREE.Group;
  readonly lightMap: THREE.Texture;
}

const assets = new Map<string, BakedAsset>();
const pending = new Map<string, Promise<BakedAsset>>();

function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}blender/${file}`;
}

async function fetchAsset(stem: string): Promise<BakedAsset> {
  const loader = new GLTFLoader();
  const [gltf, lightMap] = await Promise.all([
    loader.loadAsync(assetUrl(`${stem}.glb`)),
    new THREE.TextureLoader().loadAsync(assetUrl(`${stem}-lightmap.png`)),
  ]);
  // glTF UVs are top-left origin; a PNG loaded outside the glTF loader is not
  // flipped for us. Without this the whole bake lands upside down, which reads
  // as light coming from the floor. And three r171 samples uv0 unless told:
  // a lightMap must be told channel 1.
  lightMap.flipY = false;
  lightMap.channel = 1;
  lightMap.needsUpdate = true;
  return { scene: gltf.scene, lightMap };
}

/** Fetch one room's .glb and lightmap, once. The registry awaits this. */
export async function ready(stem: string): Promise<void> {
  if (assets.has(stem)) return;
  let p = pending.get(stem);
  if (p === undefined) {
    p = fetchAsset(stem);
    pending.set(stem, p);
  }
  assets.set(stem, await p);
}

export function hasAsset(stem: string): boolean {
  return assets.has(stem);
}

/**
 * The room's visuals: a fresh clone with every material swapped for the
 * unlit + lightmap pair - except the names in `selfLit`, which are their own
 * light sources. The bake is a DIFFUSE pass recording light ARRIVING at a
 * surface, and a lamp's own emission is not light arriving at the lamp, so
 * emitters bake nearly black and are drawn as unlit flats at their emitted
 * colour instead - exactly what the hand-built rooms do with the same
 * surfaces for the same reason.
 */
export function bakedVisuals(
  stem: string,
  selfLit: ReadonlyMap<string, number>
): THREE.Group | null {
  const asset = assets.get(stem);
  if (asset === undefined) return null;
  const root = asset.scene.clone(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const from = object.material as THREE.MeshStandardMaterial;
    const emitted = selfLit.get(from.name);
    if (emitted !== undefined) {
      object.material = new THREE.MeshBasicMaterial({ color: emitted, toneMapped: false });
      return;
    }
    object.material = new THREE.MeshBasicMaterial({
      color: from.color.clone(),
      lightMap: asset.lightMap,
      lightMapIntensity: LIGHT_INTENSITY,
    });
  });
  return root;
}

export type Facing = '+x' | '-x' | '+z' | '-z';

/**
 * A doorway cap: the plate that stands in a port that leads nowhere.
 *
 * Whether a seam is a doorway or the end of the station is a fact about the
 * STATION, decided after layout - so the .glb carries no caps (they seal the
 * bake only, see roomlib.join_room) and the runtime owns these, toggled by
 * sealPort(). Visible by default: a room mounted alone has nothing behind
 * any of its seams.
 */
export function capPlate(
  name: string,
  at: readonly [number, number, number],
  facing: Facing,
  width: number,
  height: number,
  colour: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: colour })
  );
  mesh.name = name;
  // The plate sits inboard of the port plane, facing into the room - and
  // DEEPER than the station's own generic blank, whose inner face laps 12 mm
  // in (capFor in station/index.ts). At the same depth the two are coplanar,
  // same-facing, and shimmer; at 30 mm this plate simply stands in front and
  // reads as the room's own closure.
  const inset = 0.03;
  const [x, y, z] = at;
  if (facing === '+x') {
    mesh.position.set(x - inset, y, z);
    mesh.rotation.y = -Math.PI / 2;
  } else if (facing === '-x') {
    mesh.position.set(x + inset, y, z);
    mesh.rotation.y = Math.PI / 2;
  } else if (facing === '+z') {
    mesh.position.set(x, y, z - inset);
    mesh.rotation.y = Math.PI;
  } else {
    mesh.position.set(x, y, z + inset);
  }
  return mesh;
}

/** Dispose a visuals tree built by bakedVisuals (materials are per-clone). */
export function disposeVisuals(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const material = object.material;
      if (material instanceof THREE.Material) material.dispose();
    }
  });
}
