/**
 * COMPANIONS - the Moon, and the four planets bright enough to pick out.
 *
 * The sky over this station has been Earth and three thousand stars. That is
 * most of what is really up there, and it misses the two things a person at a
 * window would actually point at.
 *
 * THE MOON IS AT TRUE SCALE AND TRUE DISTANCE, because at these units it costs
 * nothing to be honest and the honest number is the good-looking one. Scene
 * units are Earth radii, so the Moon is 0.272 across at 60.3 away, which
 * subtends about half a degree - the same half degree it subtends from a garden.
 * Faked larger it becomes a poster of the Moon; left correct it is a small hard
 * disc that the eye has to find, and finding it is the whole pleasure.
 *
 * IT IS NOT LIT SEPARATELY. It takes the scene's existing sun, which means it
 * carries a phase, and the phase is automatically the correct one for where the
 * sun actually is this orbit - full when the station is between the two, a thin
 * crescent near the terminator passes. That is the rig paying for itself the way
 * DIRECTION says the raking light on the continents does: nobody animates it and
 * nobody can get it out of sync, because there is nothing to keep in sync.
 *
 * WHY IT SITS INSIDE THE STAR SPHERE. Stars are at radius 180 and the Moon at
 * 60.3, so it occludes them with an ordinary depth test. A moon painted on the
 * same shell as the stars would have them shining through it, which is the sort
 * of thing that is invisible in a still and unmistakable the moment you turn
 * your head.
 *
 * THE PLANETS ARE POINTS, NOT SPHERES, and that is not a shortcut - it is what
 * they are. Jupiter is 40 arcseconds at its best, which is a fifth of one pixel
 * at this field of view. A modelled disc would be a lie the renderer would have
 * to be forced into telling. They are drawn one tier brighter and larger than
 * the brightest star so they read as steady and distinct, and like the stars
 * they never twinkle: there is no atmosphere out here to make them.
 *
 * NO RED, INCLUDING FOR MARS. Mars to the naked eye is an ochre point, not a
 * red one - the red is a photographic and cultural artifact - so the warm end of
 * the existing star ramp is both on-palette and more accurate than the thing it
 * is avoiding.
 */
import * as THREE from 'three';
import { PALETTE } from './palette';

/** Lunar radius and semi-major axis, in Earth radii. Real numbers. */
const MOON_RADIUS = 1737.4 / 6378.1;
const MOON_DISTANCE = 384400 / 6378.1;

/**
 * The Moon's own value range.
 *
 * CLOUD, not HULL, and the first version had it wrong. The regolith's albedo
 * really is about 12 per cent - closer to worn asphalt than to anything white -
 * but albedo is not value on screen. The Moon is lit by an unattenuated sun and
 * seen against a sky with nothing in it, and that is why a dark rock reads as
 * the brightest thing in a night sky. Rendered at HULL it came out a grey blob
 * dimmer than the stars beside it, which is a rock that has correctly simulated
 * its own reflectance and got the picture backwards.
 */
const MOON_BASE = PALETTE.CLOUD;

/**
 * What the unlit limb settles onto, as a fraction of base.
 *
 * Not zero. There is no black in this game and a sphere shaded to zero on its
 * dark side would put some there. This is also physically the right kind of
 * term - earthshine genuinely lights the lunar night, and from low Earth orbit
 * Earth is a very large, very bright thing to be lit by.
 */
const MOON_EARTHSHINE = 0.1;

/**
 * Maria, as a value knocked back off the base.
 *
 * The near side is roughly a third dark plains and two thirds bright highlands,
 * and that split at half a degree is what makes a small grey disc read as the
 * Moon rather than as a bright star that got too close. Sampled from a fixed
 * hash of the facet centroid rather than from a texture, per the no-textures
 * rule, and seeded so it is the same Moon on every run.
 */
const MARE_DARKEN = 0.62;

/**
 * A stable hash in [0,1) from three coordinates. Cheap, deterministic, and
 * chunky enough at this scale that the maria come out as patches rather than as
 * per-facet noise, which is the difference between a surface and a dither.
 */
function hash3(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 0.017) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * The Moon, at true scale, positioned by a unit direction.
 *
 * `detail` is far below Earth's 42 on purpose. Earth is carried at 36 980
 * facets because it is seen filling the frame from 400 km; the Moon is 0.5
 * degrees across and its silhouette is the only thing about it the eye can
 * resolve, so anything past the point where the limb stops looking polygonal is
 * facets nobody will ever see.
 */
export function buildMoon(direction: THREE.Vector3, seed = 4711): THREE.Mesh {
  const geometry = new THREE.IcosahedronGeometry(MOON_RADIUS, 12);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = position.count;

  // Albedo per facet, kept as its own array. This is the Moon's colour BEFORE
  // any sun falls on it, and it never changes; `setMoonSun` multiplies it into
  // the colour attribute every time the sun moves. Keeping the two apart is
  // what stops the terminator baking itself in a little further on each update.
  const albedo = new Float32Array(count * 3);
  const facetNormals = new Float32Array(count);
  const base = new THREE.Color(MOON_BASE);
  const facet = new THREE.Color();

  // Per-triangle rather than per-vertex: colouring by vertex would gradient
  // across every facet and undo the flat read the whole game is built on.
  for (let i = 0; i < count; i += 3) {
    const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const cy = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;

    // Low frequency decides mare against highland; a much weaker high frequency
    // keeps the highlands from being one flat sheet.
    const broad = hash3(Math.round(cx * 7), Math.round(cy * 7), Math.round(cz * 7), seed);
    const grain = hash3(cx * 90, cy * 90, cz * 90, seed + 3);

    facet.copy(base).multiplyScalar((broad < 0.34 ? MARE_DARKEN : 1) * (0.93 + grain * 0.14));

    // The facet's outward normal is its centroid direction: this is a sphere
    // centred on the mesh origin, so no cross product is needed.
    const length = Math.hypot(cx, cy, cz) || 1;
    facetNormals[i] = cx / length;
    facetNormals[i + 1] = cy / length;
    facetNormals[i + 2] = cz / length;

    for (let v = 0; v < 3; v += 1) {
      albedo[(i + v) * 3] = facet.r;
      albedo[(i + v) * 3 + 1] = facet.g;
      albedo[(i + v) * 3 + 2] = facet.b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    // UNLIT, and that is the whole reason the phase works.
    //
    // Lambert would put the Moon under the scene's rig, and that rig is built
    // for a planet 400 km away: an earthshine hemisphere at 0.55 and a night
    // floor at 0.45, both of which land on the Moon's dark side just as hard as
    // on its lit one. Rendered that way it came out a flat grey disc with no
    // terminator at all - correctly lit, by lights that have no business
    // reaching a body 384 000 km off. Shading it here from the sun alone is
    // both cheaper and the only way it gets a phase.
    new THREE.MeshBasicMaterial({ vertexColors: true })
  );
  mesh.name = 'moon';
  mesh.position.copy(direction).normalize().multiplyScalar(MOON_DISTANCE);
  mesh.userData['albedo'] = albedo;
  mesh.userData['facetNormals'] = facetNormals;
  return mesh;
}

/**
 * Re-shade the Moon for a sun direction, the way `setAtmosphereSun` does.
 *
 * `direction` points FROM the origin TOWARD the sun, matching the convention
 * the rest of the renderer uses. The falloff is deliberately not a bare
 * Lambert: real terminators on airless bodies are much harder-edged than
 * `max(0, N·L)` predicts, because regolith backscatters. Taking a root of the
 * cosine widens the lit region and sharpens its edge, which is the difference
 * between a soft-shaded ball and something that looks like the Moon.
 */
export function setMoonSun(moon: THREE.Mesh, direction: THREE.Vector3): void {
  const albedo = moon.userData['albedo'] as Float32Array | undefined;
  const normals = moon.userData['facetNormals'] as Float32Array | undefined;
  const attribute = moon.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (albedo === undefined || normals === undefined || attribute === undefined) return;

  const array = attribute.array as Float32Array;
  const lx = direction.x;
  const ly = direction.y;
  const lz = direction.z;
  const length = Math.hypot(lx, ly, lz) || 1;

  for (let i = 0; i < normals.length; i += 3) {
    const dot =
      ((normals[i] ?? 0) * lx + (normals[i + 1] ?? 0) * ly + (normals[i + 2] ?? 0) * lz) / length;
    const lit = dot <= 0 ? 0 : Math.pow(dot, 0.42);
    const term = MOON_EARTHSHINE + (1 - MOON_EARTHSHINE) * lit;

    for (let v = 0; v < 3; v += 1) {
      const at = (i + v) * 3;
      array[at] = (albedo[at] ?? 0) * term;
      array[at + 1] = (albedo[at + 1] ?? 0) * term;
      array[at + 2] = (albedo[at + 2] ?? 0) * term;
    }
  }
  attribute.needsUpdate = true;
}

/**
 * The four planets that are brighter than every star, with the colour each one
 * actually shows and roughly its relative brightness.
 *
 * Directions are fixed rather than computed. A real ephemeris would put them
 * where they belong on a given date, and this game has no date - it has orbits
 * whose epoch is whenever you sat down. Fixed inertial bearings are the honest
 * version of "the sky, at some time": correct in kind, arbitrary in detail, and
 * they never drift into a configuration that could not happen.
 */
const PLANETS = [
  // Venus: the brightest, and genuinely white rather than warm - it is cloud.
  { name: 'venus', direction: [0.82, 0.21, -0.53], colour: '#F0EEE9' },
  // Jupiter: nearly as bright, faintly cream.
  { name: 'jupiter', direction: [-0.44, 0.38, 0.81], colour: '#F2E3C8' },
  // Mars: ochre, and see the note above about why it is not red.
  { name: 'mars', direction: [-0.71, -0.28, -0.65], colour: '#E8C9A0' },
  // Saturn: dimmer and warmer again.
  { name: 'saturn', direction: [0.31, 0.62, 0.72], colour: '#E8C9A0' },
] as const;

/**
 * The planets as one points object, at `radius`.
 *
 * Placed just inside the star shell so they sort in front of it rather than
 * fighting it, and drawn with the same untextured square points the stars use,
 * one or two pixels larger. `sizeAttenuation` is off for the same reason it is
 * off for stars: these are meant to be a fixed apparent size, and a point that
 * grows as you approach it is a point that is admitting it has a position in
 * the room.
 */
export function buildPlanets(radius: number): THREE.Points {
  const positions = new Float32Array(PLANETS.length * 3);
  const colours = new Float32Array(PLANETS.length * 3);
  const colour = new THREE.Color();

  PLANETS.forEach((planet, i) => {
    const [x, y, z] = planet.direction;
    const length = Math.hypot(x, y, z);
    positions[i * 3] = (x / length) * radius;
    positions[i * 3 + 1] = (y / length) * radius;
    positions[i * 3 + 2] = (z / length) * radius;

    colour.set(planet.colour);
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  // One size for all four. Points cannot carry a per-vertex size without a
  // custom shader, and the honest brightness difference between Venus and
  // Saturn is a magnitude and a half - which at two pixels is not something a
  // square can express anyway. The colours carry what separation there is.
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      vertexColors: true,
      size: 3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.98,
    })
  );
  points.name = 'planets';
  return points;
}
