// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceMode } from '@/lib/guest/preferences';
import { PreferenceMenu } from './PreferenceMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const preferences = vi.hoisted(() => ({
  mode: null as PreferenceMode | null,
  isReady: true,
  setMode: vi.fn(),
}));
vi.mock('./usePreferences', () => ({
  usePreferences: () => ({
    isReady: preferences.isReady,
    modeOf: () => preferences.mode,
    setMode: preferences.setMode,
  }),
}));

// Radix measures the trigger with ResizeObserver, which jsdom lacks.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let unmount = () => {};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  preferences.mode = null;
  preferences.isReady = true;
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  preferences.setMode.mockClear();
});

async function openMenu() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <PreferenceMenu
        kind="tag"
        value="react"
        label="React"
        variant="secondary"
        data={{ 'data-tag': 'react' }}
      >
        React
      </PreferenceMenu>,
    ),
  );
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  const trigger = container.querySelector('button');
  expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
  expect(trigger?.dataset.tag).toBe('react');
  // A native button turns Enter and Space into a click, so this is also the keyboard path.
  await act(async () => {
    trigger?.click();
    await import('./PreferenceMenuDropdown');
  });
  return [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
}

function pressKey(target: Element | null, key: string) {
  act(() => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

function itemStates(items: HTMLElement[]) {
  return items.map((item) => [item.textContent, item.getAttribute('aria-checked')]);
}

describe('PreferenceMenu', () => {
  it('AC-2.5.1 opens Follow and Mute from the badge, unchecked when neither is set', async () => {
    const items = await openMenu();
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('React');
    expect(itemStates(items)).toEqual([
      ['Follow', 'false'],
      ['Mute', 'false'],
    ]);
    act(() => items[1]?.click());
    expect(preferences.setMode).toHaveBeenCalledWith('tag', 'react', 'mute');
  });

  it('AC-2.5.1 checks the current mode, offers to undo it, and toggles it off', async () => {
    preferences.mode = 'follow';
    const items = await openMenu();
    expect(itemStates(items)).toEqual([
      ['Unfollow', 'true'],
      ['Mute', 'false'],
    ]);
    act(() => items[0]?.click());
    expect(preferences.setMode).toHaveBeenCalledWith('tag', 'react', null);
  });

  it('AC-2.5.1 disables the items, with no check shown, until the preferences are known', async () => {
    preferences.mode = 'follow';
    preferences.isReady = false;
    const items = await openMenu();
    expect(itemStates(items)).toEqual([
      ['Follow', 'false'],
      ['Mute', 'false'],
    ]);
    expect(items.every((item) => item.hasAttribute('data-disabled'))).toBe(true);
  });

  it('AC-2.5.1 opens again with Space after Esc closed it', async () => {
    await openMenu();
    pressKey(document.activeElement, 'Escape');
    expect(document.querySelector('[role="menu"]')).toBeNull();

    pressKey(document.querySelector('button[aria-haspopup="menu"]'), ' ');
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });
});
