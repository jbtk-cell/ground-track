/**
 * The touch keypad: a tap-driven twin of the keyboard listener in app.ts,
 * mounted only when a coarse pointer is present. Taps route through
 * app.ts's handleKey - the identical reduceTyped / commitEntry path the
 * keyboard uses - so there is exactly one way a digit reaches the
 * simulation.
 */
import './touchPad.css';
import type { MissionPhase } from '../sim/types';

/** Minimal surface touchInputActive needs, so it is testable without a DOM. */
export interface TouchEnvironment {
  readonly location: { readonly search: string };
  matchMedia?(query: string): { matches: boolean };
}

/**
 * A coarse pointer (finger, not stylus or mouse) means no hardware keyboard
 * is reachable either, so this doubles as the touch-pad mount gate. ?touch=1
 * forces it on for harnesses and tests that cannot fake pointer:coarse.
 */
export function touchInputActive(env: TouchEnvironment): boolean {
  if (new URLSearchParams(env.location.search).get('touch') === '1') return true;
  return typeof env.matchMedia === 'function' && env.matchMedia('(pointer: coarse)').matches;
}

type TouchKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'DEL' | 'ENTER';

/** Phone-keypad order, delete and commit filling the last row's outer cells. */
const KEYS: readonly TouchKey[] = [
  '7',
  '8',
  '9',
  '4',
  '5',
  '6',
  '1',
  '2',
  '3',
  'DEL',
  '0',
  'ENTER',
];

/** The exact key string app.ts's keydown listener would have produced. */
export function inputKeyFor(key: TouchKey): string {
  if (key === 'DEL') return 'Backspace';
  if (key === 'ENTER') return 'Enter';
  return key;
}

function classFor(key: TouchKey): string {
  if (key === 'DEL') return 'touch-key touch-key--del';
  if (key === 'ENTER') return 'touch-key touch-key--enter';
  return 'touch-key';
}

export interface TouchPadHandle {
  readonly el: HTMLElement;
  /** Shown only while a card is open for entry - there is nothing to tap otherwise. */
  update(phase: MissionPhase): void;
}

/** Mounts the keypad into root and wires every button to onKey. */
export function createTouchPad(root: HTMLElement, onKey: (key: string) => void): TouchPadHandle {
  const el = document.createElement('div');
  el.className = 'touch-pad';

  for (const key of KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = classFor(key);
    button.textContent = key;
    button.addEventListener('click', () => onKey(inputKeyFor(key)));
    el.appendChild(button);
  }

  root.appendChild(el);

  return {
    el,
    update(phase: MissionPhase): void {
      el.classList.toggle('touch-pad--visible', phase === 'card');
    },
  };
}
