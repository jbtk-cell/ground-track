/**
 * BAKED/MATERIAL - the two materials a rebuilt room draws with.
 *
 * Both are MeshBasicMaterial, and that is the architecture, not an economy:
 * the room is UNLIT at runtime. pixel = vertexColour x map x lightMapTexel x
 * lightMapIntensity / PI (three's own basic shader), and every one of those
 * factors was authored or baked. No runtime light touches a rebuilt room's
 * static geometry - the arm alone keeps a Lambert rig, fed from the bake's
 * probes, which is why lights added for it cannot leak onto the walls.
 */
import * as THREE from 'three';
import { MAP_UNITY_SCALE } from './dtex';

/**
 * The room's one surface material: albedo in the vertex colours, a seeded
 * modulation map on uv0, the baked irradiance atlas on uv1.
 */
export function bakedMaterial(
  lightMap: THREE.DataTexture,
  lightMapIntensity: number,
  map: THREE.DataTexture
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    map,
    lightMap,
    // The modulation map packs unity at byte 200 (see dtex.ts); fold the
    // rescale into the lightmap term so the map itself stays 8-bit friendly.
    lightMapIntensity: lightMapIntensity * MAP_UNITY_SCALE,
  });
  return material;
}

/**
 * A halo: painted light, not lit surface. Additive, never writing depth but
 * always testing it - a glow the console occludes is what makes it read as
 * emission rather than as an overlay. toneMapped is irrelevant under
 * NoToneMapping but pinned false anyway: the authored falloff IS the pixel.
 */
export function haloMaterial(sprite: THREE.DataTexture, colour: string): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: sprite,
    color: new THREE.Color(colour),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  return material;
}
