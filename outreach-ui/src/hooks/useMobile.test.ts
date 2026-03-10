import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMobile from './useMobile';

describe('useMobile', () => {
  let listeners: Map<string, (e: MediaQueryListEvent) => void>;
  let matchesValue: boolean;

  beforeEach(() => {
    listeners = new Map();
    matchesValue = false;

    // Use Object.defineProperty since jsdom may not have matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: matchesValue,
        media: query,
        onchange: null,
        addEventListener: (event: string, handler: EventListenerOrEventListenerObject) => {
          listeners.set(event, handler as (e: MediaQueryListEvent) => void);
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it('returns false for desktop width', () => {
    matchesValue = false;
    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(false);
  });

  it('returns true for mobile width', () => {
    matchesValue = true;
    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(true);
  });

  it('updates when media query changes', () => {
    matchesValue = false;
    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(false);

    const changeHandler = listeners.get('change');
    if (changeHandler) {
      act(() => {
        changeHandler({ matches: true } as MediaQueryListEvent);
      });
      expect(result.current).toBe(true);
    }
  });
});
