/**
 * The PAD as DOM. Presentation only: padViewModel derives everything shown
 * from MissionState, createPad merely paints it, and neither decides
 * anything. The app owns the keyboard; the simulation owns every number.
 *
 * The typed number is executed, never graded, so nothing in this module has
 * a correct/incorrect branch - a committed digit renders exactly like a
 * machine digit and the status line only ever states what the mission did.
 */
import './pad.css';
import type { EntryRecord, MissionState, PadCard } from '../sim/types';

/**
 * Full scale for the propellant column when no better reference exists.
 * createPad prefers the first propellant value it ever sees, so the
 * mission's actual starting budget defines "full"; this constant only
 * covers a pad created against an already-empty tank.
 */
export const PROPELLANT_REFERENCE_MS = 400;

export interface PadRowVM {
  readonly label: string;
  readonly value: string;
  readonly blank: boolean;
  /**
   * Present only on the blank row while entry is open: one entry per answer
   * digit, '' if empty. Once the entry commits the row carries its digits in
   * value like every machine row - the underscore cells (and their border)
   * exist only while a digit is still expected, per DIRECTION.md: on commit
   * the line becomes indistinguishable from the rest.
   */
  readonly cells?: readonly string[];
}

export interface PadViewModel {
  /** False while coasting (or before any card exists): status strip only. */
  readonly cardVisible: boolean;
  readonly title: string;
  readonly rows: readonly PadRowVM[];
  /** Cell index the amber caret underlines; null once full or after commit. */
  readonly caretIndex: number | null;
  readonly entered: readonly string[];
  /** 0..1 of the reference budget. The column is the readout; no numeral. */
  readonly propellantFraction: number;
  readonly statusLine: string;
  readonly accentBurning: boolean;
}

export interface PadViewOptions {
  /** Card to keep showing in phases where MissionState.card is null. */
  readonly lastCard?: PadCard | null;
  /** Propellant that counts as a full column. */
  readonly referenceMS?: number;
}

/** Digit grouping uses a thin space - aerospace convention, per DIRECTION.md. */
const THIN_SPACE = '\u2009';

function groupDigits(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

function formatEntry(record: EntryRecord): string {
  return `${groupDigits(record.seconds)} s -> ${groupDigits(record.apoapsisKmAfter)} km`;
}

/**
 * Digits shown in the blank once entry has closed. During the burn the
 * executor's duration is the ground truth being run; afterwards the history
 * holds what was typed.
 */
function committedDigits(m: MissionState): string {
  if (m.burn !== null) return String(m.burn.durationS);
  return m.history.at(-1)?.digits ?? '';
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Pure derivation of everything the pad draws. No DOM, no clock. */
export function padViewModel(
  m: MissionState,
  typed: string,
  opts: PadViewOptions = {}
): PadViewModel {
  const card = m.card ?? opts.lastCard ?? null;
  const referenceMS = opts.referenceMS ?? PROPELLANT_REFERENCE_MS;

  const entryOpen = m.phase === 'card' && m.card !== null;
  const digits = entryOpen ? typed : committedDigits(m);

  let rows: readonly PadRowVM[] = [];
  if (card !== null) {
    const cells = Array.from({ length: card.answerDigits }, (_, i) => digits[i] ?? '');
    rows = card.fields.map((field): PadRowVM => {
      if (!field.blank) return { label: field.label, value: field.value, blank: false };
      return entryOpen
        ? { label: field.label, value: field.value, blank: true, cells }
        : { label: field.label, value: digits, blank: true };
    });
  }

  return {
    cardVisible: m.phase !== 'coast' && card !== null,
    title: card?.title ?? '',
    rows,
    caretIndex:
      entryOpen && card !== null && typed.length < card.answerDigits ? typed.length : null,
    entered: m.history.map(formatEntry),
    propellantFraction: referenceMS > 0 ? clamp01(m.propellantMS / referenceMS) : 0,
    statusLine: m.statusLine,
    accentBurning: m.phase === 'burning',
  };
}

/**
 * Input routing helper for the app's keydown listener. Edits the typed
 * buffer and nothing else - commit (Enter) and what the digits mean are the
 * app's and the simulation's business.
 */
export function reduceTyped(typed: string, key: string, answerDigits: number): string {
  if (key === 'Backspace') return typed.slice(0, -1);
  if (/^[0-9]$/.test(key) && typed.length < answerDigits) return typed + key;
  return typed;
}

export interface PadHandle {
  update(m: MissionState, typed: string, caretOn: boolean): void;
  /**
   * Forgets the session the pad has been watching. The remembered card, the
   * propellant reference and the render key all belong to one flight; a
   * mission adopted from outside (the deterministic presets) must overwrite
   * them or its pad would depend on whatever the live session showed first.
   * referenceMS null re-derives the full scale from the next update.
   */
  reset(lastCard: PadCard | null, referenceMS: number | null): void;
  readonly el: HTMLElement;
}

function make(tag: 'div' | 'span', className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(el: HTMLElement, vm: PadViewModel, caretVisible: boolean): void {
  el.classList.toggle('pad--strip', !vm.cardVisible);
  el.replaceChildren();

  if (vm.cardVisible) {
    const card = make('div', 'pad-card');

    const title = make('div', 'pad-title');
    if (vm.accentBurning) title.appendChild(make('span', 'pad-burn-mark'));
    title.appendChild(make('span', 'pad-title-text', vm.title));
    card.appendChild(title);

    for (const row of vm.rows) {
      const rowEl = make('div', 'pad-row');
      rowEl.appendChild(make('span', 'pad-label', row.label));
      rowEl.appendChild(make('span', 'pad-leader'));
      if (row.cells === undefined) {
        rowEl.appendChild(make('span', 'pad-value', row.value));
      } else {
        const cells = make('span', 'pad-cells');
        row.cells.forEach((char, index) => {
          // NBSP keeps an empty cell's baseline identical to a filled one.
          const cell = make('span', 'pad-cell', char === '' ? '\u00a0' : char);
          if (caretVisible && index === vm.caretIndex) cell.classList.add('pad-cell--caret');
          cells.appendChild(cell);
        });
        rowEl.appendChild(cells);
      }
      card.appendChild(rowEl);
    }

    if (vm.entered.length > 0) {
      const entered = make('div', 'pad-entered');
      entered.appendChild(make('span', 'pad-entered-label', 'entered'));
      for (const line of vm.entered) entered.appendChild(make('div', 'pad-entry', line));
      card.appendChild(entered);
    }

    const track = make('div', 'pad-propellant');
    const fill = make('div', 'pad-propellant-fill');
    fill.style.height = `${(vm.propellantFraction * 100).toFixed(1)}%`;
    track.appendChild(fill);
    card.appendChild(track);

    el.appendChild(card);
  }

  el.appendChild(make('div', 'pad-status', vm.statusLine));
}

export function createPad(root: HTMLElement): PadHandle {
  const el = document.createElement('aside');
  el.className = 'pad pad--strip';
  root.appendChild(el);

  // MissionState carries the card only in the 'card' phase, but the burn and
  // assessment still read against it, so the pad remembers the last one.
  let lastCard: PadCard | null = null;
  let referenceMS: number | null = null;
  let lastRenderKey = '';

  return {
    el,
    reset(card: PadCard | null, reference: number | null): void {
      lastCard = card;
      referenceMS = reference;
      lastRenderKey = '';
    },
    update(m: MissionState, typed: string, caretOn: boolean): void {
      if (m.card !== null) lastCard = m.card;
      if (referenceMS === null) {
        referenceMS = m.propellantMS > 0 ? m.propellantMS : PROPELLANT_REFERENCE_MS;
      }

      const vm = padViewModel(m, typed, { lastCard, referenceMS });
      const caretVisible = caretOn && vm.caretIndex !== null;

      // update runs every frame; rebuild only when something visible changed.
      const renderKey = JSON.stringify(vm) + (caretVisible ? '|c' : '|');
      if (renderKey === lastRenderKey) return;
      lastRenderKey = renderKey;
      render(el, vm, caretVisible);
    },
  };
}
