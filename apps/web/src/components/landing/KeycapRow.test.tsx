// @vitest-environment jsdom
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURES } from '@/config/features';
import { KeycapRow, pressedKeycap, visibleKeycaps } from './KeycapRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ON = { ...FEATURES, copilot: true };
const OFF = { ...FEATURES, copilot: false };

const press = (key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

describe('KeycapRow', () => {
  it('AC-L7 shows the ⌘K keycap only while the copilot flag is on', () => {
    expect(visibleKeycaps(OFF)).toHaveLength(5);
    expect(renderToStaticMarkup(<KeycapRow features={OFF} />)).not.toContain('⌘K');
    expect(visibleKeycaps(ON)).toHaveLength(6);
    expect(renderToStaticMarkup(<KeycapRow features={ON} />)).toContain('⌘K');
  });

  it('AC-L7 lights ⌘K for Cmd+K on macOS and the letter keycap for a bare k', () => {
    const keycaps = visibleKeycaps(ON, true);
    expect(pressedKeycap(press('k', { metaKey: true }), keycaps)?.display).toBe('⌘K');
    expect(pressedKeycap(press('k', { ctrlKey: true }), keycaps)).toBeUndefined();
    expect(pressedKeycap(press('k'), keycaps)?.display).toBeUndefined();
    expect(pressedKeycap(press('j', { metaKey: true }), keycaps)).toBeUndefined();
  });

  it('AC-L7 shows Ctrl K elsewhere and lights it for Ctrl+K only', () => {
    const keycaps = visibleKeycaps(ON, false);
    expect(pressedKeycap(press('k', { ctrlKey: true }), keycaps)?.display).toBe('Ctrl K');
    expect(pressedKeycap(press('k', { metaKey: true }), keycaps)).toBeUndefined();
  });

  it('AC-L7 ignores Cmd+K while the flag is off', () => {
    expect(pressedKeycap(press('k', { metaKey: true }), visibleKeycaps(OFF))).toBeUndefined();
  });
});

describe('KeycapRow pressed state', () => {
  let root: Root | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh)');
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.callback([{ isIntersecting: true }]);
        }
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mount() {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<KeycapRow features={ON} />));
    return container;
  }

  const pressedKeys = (container: HTMLElement) =>
    [...container.querySelectorAll('kbd')]
      .filter((kbd) => kbd.dataset.pressed === 'true')
      .map((kbd) => kbd.textContent);

  function keydown(init: KeyboardEventInit) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', init));
    });
  }

  it('AC-L7 a pressed keycap lights, then releases after 220 ms despite re-renders', () => {
    const container = mount();
    keydown({ key: 'j' });
    expect(pressedKeys(container)).toEqual(['j']);
    act(() => vi.advanceTimersByTime(220));
    expect(pressedKeys(container)).toEqual([]);
  });

  it('AC-L7 the ⌘K chord lights and releases the same way', () => {
    const container = mount();
    keydown({ key: 'k', metaKey: true });
    expect(pressedKeys(container)).toEqual(['⌘K']);
    act(() => vi.advanceTimersByTime(220));
    expect(pressedKeys(container)).toEqual([]);
  });
});
