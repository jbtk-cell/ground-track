/**
 * THE LIMB DECK's baked shell - the fetch half of the hybrid.
 *
 * The limb deck is not a Blender ROOM: its subject is light changing in t,
 * and its rig, fixtures, door and window all stay exactly what they were.
 * What Blender contributes is the shell's own geometry back again (exported
 * by scripts/export-limbdeck-shell.ts, re-imported by
 * tools/blender/build_limbdeck.py) with lightmap UVs, plus an INDIRECT-ONLY
 * Cycles map of the lamp troughs' bounce - the inter-reflection the live rig
 * approximated with an ambient backstop. buildShell() asks for these parts
 * and keeps its own materials.
 *
 * TOLERANT ON PURPOSE, unlike every readyX(): if the assets are missing or
 * the fetch fails, the room mounts with its legacy shell and looks exactly
 * as it did before the hybrid existed. A missing texture must never keep the
 * game's first room from mounting.
 */
import { ready } from './loader';

export async function readyLimbShell(): Promise<void> {
  try {
    await ready('limbdeck');
  } catch {
    // The legacy shell is the fallback, and it is a complete room.
  }
}
