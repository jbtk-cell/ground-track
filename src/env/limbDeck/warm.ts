/**
 * THE WARM PASS - the limb deck joins the station's palette.
 *
 * Owner direction, 2026-09-05: "the first room is still in the same coloring
 * as before". Eleven rooms wear the interiors palette (docs/INTERIORS.md);
 * the limb deck alone wore DIRECTION.md's orbital slate, and standing in the
 * spine you could see the mismatch through the doorway.
 *
 * The conversion is a LUMINANCE MAP, not a repaint: every slate-family
 * colour lands on the warm ramp between the interiors' darkest kick brown
 * and its lightest liner tan at ITS OWN lightness. The room's whole visual
 * language - 384 hull facets separated by value, the terminator crawling
 * across them, the deck panels' half-tone - survives exactly, because value
 * is the thing the map preserves. Only the hue moves.
 *
 * Colours that are not slate (the cream lamps, the mint state ring, the
 * amber, anything already warm) pass through untouched: warmth is what we
 * are converging on, and the accent laws still hold.
 */
import * as THREE from 'three';

/** The warm ramp's ends, linear RGB: the interiors' kick and liner. */
const RAMP_DARK = new THREE.Color(0.10439, 0.07399, 0.03848);
const RAMP_LIGHT = new THREE.Color(0.72, 0.58, 0.372);

const hsl = { h: 0, s: 0, l: 0 };

/** Is this a slate-family colour - the blue-grey the old deck was drawn in? */
function isSlate(c: THREE.Color): boolean {
  c.getHSL(hsl);
  return hsl.s < 0.45 && ((hsl.h > 0.5 && hsl.h < 0.72) || hsl.s < 0.03);
}

/** Map one colour onto the warm ramp at its own luminance, in place. */
export function warmed(c: THREE.Color): THREE.Color {
  if (!isSlate(c)) return c;
  c.getHSL(hsl);
  const t = Math.min(1, Math.max(0, (hsl.l - 0.02) / 0.62));
  return c.copy(RAMP_DARK).lerp(RAMP_LIGHT, t);
}

/**
 * Warm every material under a root, once. Fixtures and the door were drawn
 * in the same slate as the shell; when the baked warm shell is live they
 * follow it, so the room converges instead of clashing with itself.
 */
export function warmRetint(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material === undefined || seen.has(material)) continue;
      seen.add(material);
      const withColour = material as THREE.MeshLambertMaterial;
      if (withColour.color instanceof THREE.Color) warmed(withColour.color);
      // Emissives keep their own light (cream lamps, mint ring, night floor):
      // the pass warms surfaces, never sources.
    }
    // Vertex-coloured geometry (the fixtures' facet shading).
    const colour = mesh.geometry?.getAttribute?.('color');
    if (colour !== undefined && colour !== null) {
      const c = new THREE.Color();
      for (let i = 0; i < colour.count; i += 1) {
        c.setRGB(colour.getX(i), colour.getY(i), colour.getZ(i));
        warmed(c);
        colour.setXYZ(i, c.r, c.g, c.b);
      }
      colour.needsUpdate = true;
    }
  });
}
