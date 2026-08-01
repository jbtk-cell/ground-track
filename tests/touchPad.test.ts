import { describe, expect, it } from 'vitest';
import { inputKeyFor, touchInputActive } from '../src/ui/touchPad';

describe('touchInputActive', () => {
  it('activates on the ?touch=1 harness override regardless of pointer type', () => {
    expect(touchInputActive({ location: { search: '?touch=1' } })).toBe(true);
  });

  it('ignores other touch values - only exactly 1 forces it on', () => {
    expect(touchInputActive({ location: { search: '?touch=0' } })).toBe(false);
    expect(touchInputActive({ location: { search: '?touch=true' } })).toBe(false);
  });

  it('activates when the pointer is coarse', () => {
    const env = {
      location: { search: '' },
      matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }),
    };
    expect(touchInputActive(env)).toBe(true);
  });

  it('stays off for a fine pointer with no override', () => {
    const env = {
      location: { search: '' },
      matchMedia: () => ({ matches: false }),
    };
    expect(touchInputActive(env)).toBe(false);
  });

  it('stays off when matchMedia is unavailable and there is no override', () => {
    expect(touchInputActive({ location: { search: '' } })).toBe(false);
  });
});

describe('inputKeyFor', () => {
  it('maps DEL and ENTER to the keyboard listener key strings', () => {
    expect(inputKeyFor('DEL')).toBe('Backspace');
    expect(inputKeyFor('ENTER')).toBe('Enter');
  });

  it('passes digits through unchanged', () => {
    for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      expect(inputKeyFor(digit)).toBe(digit);
    }
  });
});
