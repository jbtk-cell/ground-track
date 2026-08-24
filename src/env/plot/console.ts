/**
 * THE PLOT - the fit-out on the panel bank.
 *
 * The bank was built as structure and left blank: four slabs of hull around the
 * card slot, each one large, flat and exactly one value. index.ts said why, and
 * the reason was a good one - mint on the bank would be "an emissive interface
 * by another name", and an operations room that glows is an operations room
 * where the card is no longer the brightest claim on your attention.
 *
 * That reasoning holds for a bank rendered as one lit sheet. It does not hold
 * for what is here, and the distinction is worth writing down because it is the
 * difference between a machine and a HUD:
 *
 *   A HUD asserts. It is drawn in screen space, it tracks your head, it is
 *   about you, and DIRECTION bans it. What this file draws is fixed to a slab
 *   of metal 1.48 m down the room. You can walk away from it, look past it, and
 *   stand at an angle where it foreshortens to nothing.
 *
 *   A HUD is legible. Everything here resolves to bars and blocks, on purpose.
 *   Nothing on this bank can be read, because nothing on it is addressed to the
 *   player - it is the eleven fields the flight computer already filled, going
 *   past at machine speed. The one line meant for a person prints on a card and
 *   lands on the tray, and that is still the only legible surface in the room.
 *
 * VALUES ARE HELD DOWN DELIBERATELY. The content is unlit - a screen is not a
 * surface the room's lamps fall on - so its colour IS its pixel value, and that
 * makes brightness a decision rather than a side effect. Mint is carried at
 * about six tenths, which puts the bank clearly above the walls and nowhere near
 * the cream the card prints on. If a later pose ever shows this bank as the
 * brightest thing in frame, that is the number to pull, not the geometry.
 *
 * THE LAYOUT IS THREE FACES, NOT ONE. A single wide readout across a two-metre
 * slab reads as a billboard. Three separate faces with metal between them read
 * as three instruments bolted to a rack, which is the thing being depicted, and
 * it also gives the eye somewhere to stop.
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import { type Sink, sink, toGeometry } from '../kit/mesh';
import {
  type Panel,
  barGraph,
  chipRun,
  louvres,
  panelAt,
  rimBolts,
  screenPlate,
  stencil,
  textRows,
  traceLine,
} from '../kit/instruments';

/** What the fit-out needs to know about the carcass it is bolted to. */
export interface ConsoleFrame {
  /** Bank extent on x. x0 is the more negative. */
  readonly x0: number;
  readonly x1: number;
  /** The bank face's z. Everything here mounts on it, facing -z. */
  readonly faceZ: number;
  /** The card slot's opening, which the bank head sits above. */
  readonly slotY0: number;
  readonly slotY1: number;
  /** Top of the bank head. */
  readonly topY: number;
  /** The worktop, which the bank sill sits above. */
  readonly deskY: number;
}

/**
 * The two geometries the fit-out produces, and why they cannot be one.
 *
 * `lit` goes into the room's normal interior material and is shaded by the
 * room's lamps: bolts, stencils and louvres are metal and must go dark when the
 * lamps do. `glow` goes into an unlit material: a powered readout does not care
 * what the ceiling is doing, and shading it would make the instruments dim
 * whenever the player stood in shadow, which is backwards.
 */
export interface ConsoleFitOut {
  readonly lit: THREE.BufferGeometry;
  readonly glow: THREE.BufferGeometry;
}

/**
 * Mint as the readouts actually carry it.
 *
 * Full MINT unlit is luma 213, which would make a 2 m bank the brightest object
 * on the station by a wide margin - brighter than the cream a card prints on,
 * in the one room where the card is supposed to win. Six tenths lands near 130:
 * plainly powered, comfortably under the card, and still four times the wall.
 */
const READOUT = new THREE.Color(PALETTE.MINT).multiplyScalar(0.62);

/** The same, knocked back again for the channel row, which is many small marks
 *  and would otherwise out-shout the three faces it sits above. */
const CHIP = new THREE.Color(PALETTE.MINT).multiplyScalar(0.5);

/**
 * A rectangle on the bank face, in the player's own left-to-right order.
 *
 * A player at this console faces +z, so their screen-right is world -x. Taking
 * `right` as -x makes u run left-to-right as seen from the only place anybody
 * ever stands to look at this, which means the layout below reads in the order
 * it appears. It also gives the basis a -z normal, so every facet the kit
 * pushes faces the room rather than the inside of the cabinet.
 */
function bankPanel(
  frame: ConsoleFrame,
  u: number,
  v: number,
  width: number,
  height: number
): Panel {
  return panelAt(
    new THREE.Vector3(frame.x1 - u, v, frame.faceZ),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    width,
    height
  );
}

export function consoleFitOut(frame: ConsoleFrame): ConsoleFitOut {
  const lit: Sink = sink();
  const glow: Sink = sink();

  const bankW = frame.x1 - frame.x0;
  const headY0 = frame.slotY1;
  const headH = frame.topY - headY0;

  // --- The three faces.
  //
  // Sized off the bank rather than fixed, so this survives the room being
  // retuned: the gaps between them stay proportional and nothing runs off the
  // end of the slab it is bolted to.
  const margin = bankW * 0.05;
  const gap = bankW * 0.035;
  const faceH = headH * 0.58;
  const faceV = headY0 + headH * 0.14;
  const faceW = (bankW - margin * 2 - gap * 2) / 3;

  const faces: readonly Panel[] = [
    bankPanel(frame, margin, faceV, faceW, faceH),
    bankPanel(frame, margin + faceW + gap, faceV, faceW, faceH),
    bankPanel(frame, margin + (faceW + gap) * 2, faceV, faceW, faceH),
  ];

  for (const face of faces) screenPlate(glow, face, { bezel: faceH * 0.055 });

  // Left: the field list the computer is filling. Centre: the trace it is
  // filling them from. Right: the channel levels. Left to right is cause to
  // effect, which is the order the room is meant to be read in anyway.
  const first = faces[0];
  const second = faces[1];
  const third = faces[2];
  if (first !== undefined) {
    textRows(glow, first, { rows: 7, seed: 0x91a1, colour: `#${READOUT.getHexString()}` });
  }
  if (second !== undefined) {
    traceLine(glow, second, {
      samples: 30,
      cycles: 2.2,
      seed: 0x91a2,
      colour: `#${READOUT.getHexString()}`,
    });
  }
  if (third !== undefined) {
    barGraph(glow, third, { bars: 11, seed: 0x91a3, colour: `#${READOUT.getHexString()}` });
  }

  // --- The channel row above them.
  //
  // One mark per something, at a fixed pitch, which is the only element on the
  // bank that repeats regularly. That regularity is what says "machine" from
  // across the room, before any of the three faces has resolved.
  chipRun(glow, bankPanel(frame, margin, headY0 + headH * 0.8, bankW - margin * 2, headH * 0.09), {
    chips: 18,
    seed: 0x91a4,
    colour: `#${CHIP.getHexString()}`,
    lit: 0.5,
    dim: 0.34,
  });

  // --- The sill under the slot: a second, shorter channel row.
  //
  // Placed here because the eye travelling down from the slot to the tray has
  // nothing to cross otherwise, and a 0.12 m band of bare hull between the one
  // thing that prints and the one thing it lands on is the emptiest 0.12 m in
  // the room.
  const sillH = frame.slotY0 - frame.deskY;
  chipRun(
    glow,
    bankPanel(frame, bankW * 0.5, frame.deskY + sillH * 0.28, bankW * 0.42, sillH * 0.4),
    { chips: 9, seed: 0x91a5, colour: `#${CHIP.getHexString()}`, lit: 0.45, dim: 0.32 }
  );

  // --- Metal. Everything below here is shaded by the room, not by itself.

  // Fasteners round each readout, which is what makes them read as separate
  // instruments racked into the bank rather than as three windows cut in it.
  for (const face of faces) {
    rimBolts(lit, face, { perSide: 2, size: faceH * 0.045, margin: faceH * 0.03 });
  }

  // A stencilled code on the sill, left of the channel row. Four glyphs, which
  // at this size is a shape rather than a word - see `stencil`.
  stencil(lit, bankPanel(frame, margin, frame.deskY + sillH * 0.3, bankW * 0.11, sillH * 0.38), {
    glyphs: 4,
    seed: 0x91a6,
    colour: PALETTE.HULL_SHADOW,
  });

  // Louvred returns at both ends of the head, outboard of the readouts. The
  // bank is 2.1 m wide and the three faces cover 1.6 of it; without these the
  // remaining 0.5 is the same bare slab the room already has too much of.
  const ventW = margin * 0.72;
  for (const u of [margin * 0.14, bankW - margin * 0.86]) {
    louvres(lit, bankPanel(frame, u, faceV, ventW, faceH), {
      ribs: 6,
      contrast: 0.3,
      inset: ventW * 0.12,
    });
  }

  return { lit: toGeometry(lit), glow: toGeometry(glow) };
}
