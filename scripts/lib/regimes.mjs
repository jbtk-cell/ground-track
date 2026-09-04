/**
 * Which regime a rendered frame belongs to, shared by every gate that judges
 * pixels.
 *
 * The art direction split in two on 2026-08-31 (docs/INTERIORS.md): orbital
 * exteriors keep the original rules exactly - no bloom, no black, VOID_SLATE
 * the darkest value - and interiors follow the interior direction, which the
 * owner renegotiated by name: textures and normal relief allowed, authored
 * glow allowed, near-black allowed. Gates that judge pixels therefore need to
 * know which set of numbers a frame answers to, and they must all agree on
 * the answer, which is why the classification lives here and not in any one
 * gate.
 *
 * An exterior frame is mostly space, and space is legitimately one value.
 * The list is inverted - everything is judged as an interior unless named
 * here - so a new room costs nothing and a new orbital shot costs one line
 * that somebody has to write down. (This regex used to live inside the
 * flatness gate; it moved here the day a second gate needed it.)
 */
export const EXTERIOR = /^(mission-|limb-dawn|terminator|high-pass|night-side)/;
export const isInterior = (name) => !EXTERIOR.test(name);

/**
 * Rooms rebuilt to the interior direction, one prefix per room, added the day
 * the room lands. Rebuilt rooms are held to STRICTER numbers than the rooms
 * still awaiting their rebuild: their frames are captured bare (no DOM rail
 * over the render), their value structure must reach genuine dark and genuine
 * bright, and their flatness ceiling is lower. A frame matching none of these
 * prefixes is a legacy interior - still checked, but against the old numbers,
 * because the debt is known and is paid one room at a time rather than
 * pretended away.
 */
export const REBUILT = [/^plot-/, /^plotb-/];
export const isRebuilt = (name) => REBUILT.some((re) => re.test(name));

/**
 * The legacy interiors, enumerated. By policy this list only SHRINKS: a room
 * graduates to REBUILT, and a new room is built to the interior direction
 * from day one. The enumeration exists so a frame matching NO regime can be
 * refused outright - an exterior preset missing from EXTERIOR used to fall
 * into the interior bucket silently and be judged by the wrong rules, which
 * is the allow-list rot this file was created to end.
 */
export const LEGACY =
  /^(deck-|spine-|station-|crossing-|crown-|bend-|racks-|crawl-|magazine-|sill-|gantry-|berth-)/;
export const isClassified = (name) =>
  EXTERIOR.test(name) || REBUILT.some((re) => re.test(name)) || LEGACY.test(name);
